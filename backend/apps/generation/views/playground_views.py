# backend/apps/generation/views/playground_views.py
"""Prompt Playground API 视图。"""

import time

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status

from apps.accounts.permissions import RequirePermission
from apps.generation.models import PromptVersion, PromptRun, ModelConfig
from apps.generation.constants import PromptRunStatus, ModelType
from apps.generation.serializers.playground_serializer import (
    PlaygroundRenderRequestSerializer,
    PlaygroundRenderResponseSerializer,
    PlaygroundRunRequestSerializer,
    PlaygroundRunResponseSerializer,
    PromptRunListSerializer,
    PromptRunDetailSerializer,
)
from apps.generation.services import (
    PromptRenderService,
    OutputSchemaValidator,
    TokenUsageService,
)
from apps.generation.services.llm_service import LLMService
from apps.knowledge.services.retrieval_service import RetrievalService
from apps.knowledge.services.rag_context_builder import RagContextBuilder


class PlaygroundRenderView(APIView):
    """Playground 渲染预览视图。

    渲染提示词但不执行 LLM 调用，返回渲染结果和 token 估算。
    """

    permission_classes = [IsAuthenticated, RequirePermission]
    required_permission = "prompt_template.manage"

    def post(self, request):
        serializer = PlaygroundRenderRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        prompt_version_id = serializer.validated_data["prompt_version_id"]
        variables = serializer.validated_data.get("variables", {})
        rag_options = serializer.validated_data.get("rag_options")

        try:
            prompt_version = PromptVersion.objects.get(pk=prompt_version_id)
        except PromptVersion.DoesNotExist:
            return Response(
                {"detail": "提示词版本不存在"},
                status=status.HTTP_404_NOT_FOUND,
            )

        render_service = PromptRenderService()
        token_service = TokenUsageService()

        # 处理 RAG 上下文
        rag_context = ""
        rag_info = {"enabled": False, "sources": [], "token_count": 0}
        missing_variables = []

        if rag_options and rag_options.get("enabled"):
            rag_info["enabled"] = True
            kb_ids = rag_options.get("knowledge_base_ids", [])
            query = rag_options.get("query", "")
            top_k = rag_options.get("top_k", 5)
            max_context_tokens = rag_options.get("max_context_tokens", 4000)

            if kb_ids and query:
                # 执行检索
                retrieval_service = RetrievalService()
                context_builder = RagContextBuilder()

                retrieval_result = retrieval_service.search(
                    query=query,
                    knowledge_base_ids=kb_ids,
                    top_k=top_k,
                    filters=rag_options.get("filters"),
                    created_by=request.user,
                )

                # 构建上下文
                context_result = context_builder.build(
                    retrieval_results=retrieval_result["results"],
                    max_tokens=max_context_tokens,
                )
                rag_context = context_result["text"]
                rag_info["sources"] = context_result["sources"]
                rag_info["token_count"] = context_result["token_count"]
                rag_info["retrieval_log_id"] = retrieval_result["log_id"]
            else:
                missing_variables.append("rag.knowledge_base_ids")
                missing_variables.append("rag.query")

        # 合并 RAG 上下文到变量
        render_vars = dict(variables)
        if rag_context:
            render_vars["rag_context"] = rag_context

        # 渲染提示词，捕获缺失变量
        try:
            rendered = render_service.render(prompt_version, render_vars)
        except Exception as e:
            # 解析缺失变量名
            error_msg = str(e)
            if "is undefined" in error_msg:
                # 提取变量名
                import re
                match = re.search(r"'(\w+)' is undefined", error_msg)
                if match:
                    missing_variables.append(match.group(1))
                return Response(
                    {
                        "system_prompt": "",
                        "user_prompt": "",
                        "missing_variables": missing_variables,
                        "token_estimate": 0,
                        "rag": rag_info,
                    }
                )
            return Response(
                {"detail": error_msg},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Token 估算
        total_tokens = token_service.estimate_total_tokens(
            rendered.system_prompt,
            rendered.user_prompt,
            rag_context,
        )

        response_data = {
            "system_prompt": rendered.system_prompt,
            "user_prompt": rendered.user_prompt,
            "missing_variables": missing_variables,
            "token_estimate": total_tokens,
            "rag": rag_info,
        }

        return Response(response_data)


class PlaygroundRunView(APIView):
    """Playground 运行视图。

    执行 LLM 调用并记录运行结果。
    """

    permission_classes = [IsAuthenticated, RequirePermission]
    required_permission = "prompt_template.manage"

    def post(self, request):
        serializer = PlaygroundRunRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        prompt_version_id = serializer.validated_data["prompt_version_id"]
        model_config_id = serializer.validated_data.get("model_config_id")
        variables = serializer.validated_data.get("variables", {})
        rag_options = serializer.validated_data.get("rag_options")

        try:
            prompt_version = PromptVersion.objects.get(pk=prompt_version_id)
        except PromptVersion.DoesNotExist:
            return Response(
                {"detail": "提示词版本不存在"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # 确定模型配置
        if model_config_id:
            try:
                model_config = ModelConfig.objects.get(pk=model_config_id)
            except ModelConfig.DoesNotExist:
                return Response(
                    {"detail": "模型配置不存在"},
                    status=status.HTTP_404_NOT_FOUND,
                )
        else:
            # 使用默认 chat 模型
            model_config = ModelConfig.objects.filter(
                model_type=ModelType.CHAT,
                is_default=True,
                is_active=True,
            ).first()
            if not model_config:
                return Response(
                    {"detail": "无可用模型配置"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        render_service = PromptRenderService()

        # 检查缺失变量（先执行渲染预检查）
        missing_variables = []

        # 处理 RAG
        rag_context = ""
        rag_metadata = {
            "rag_enabled": False,
            "retrieval_log_id": None,
            "retrieval_sources": [],
            "rag_context_preview": "",
        }

        if rag_options and rag_options.get("enabled"):
            rag_metadata["rag_enabled"] = True
            kb_ids = rag_options.get("knowledge_base_ids", [])
            query = rag_options.get("query", "")

            if kb_ids and query:
                retrieval_service = RetrievalService()
                context_builder = RagContextBuilder()

                retrieval_result = retrieval_service.search(
                    query=query,
                    knowledge_base_ids=kb_ids,
                    top_k=rag_options.get("top_k", 5),
                    filters=rag_options.get("filters"),
                    created_by=request.user,
                )

                context_result = context_builder.build(
                    retrieval_results=retrieval_result["results"],
                    max_tokens=rag_options.get("max_context_tokens", 4000),
                )
                rag_context = context_result["text"]
                rag_metadata["retrieval_log_id"] = retrieval_result["log_id"]
                rag_metadata["retrieval_sources"] = context_result["sources"]
                # 截取前 500 字作为预览
                rag_metadata["rag_context_preview"] = rag_context[:500] if len(rag_context) > 500 else rag_context
            else:
                # RAG 启用但缺少必要参数
                if not kb_ids:
                    missing_variables.append("rag.knowledge_base_ids")
                if not query:
                    missing_variables.append("rag.query")

        # 合并变量
        render_vars = dict(variables)
        if rag_context:
            render_vars["rag_context"] = rag_context

        # 渲染提示词，捕获缺失变量
        try:
            rendered = render_service.render(prompt_version, render_vars)
        except Exception as e:
            error_msg = str(e)
            if "is undefined" in error_msg:
                import re
                match = re.search(r"'(\w+)' is undefined", error_msg)
                if match:
                    missing_variables.append(match.group(1))

            if missing_variables:
                return Response(
                    {
                        "message": "存在未填写变量",
                        "missing_variables": missing_variables,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            return Response(
                {"detail": error_msg},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 如果有缺失变量，禁止执行
        if missing_variables:
            return Response(
                {
                    "message": "存在未填写变量",
                    "missing_variables": missing_variables,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 执行 LLM 调用
        llm_service = LLMService()
        schema_validator = OutputSchemaValidator()

        # 创建运行记录
        run = PromptRun.objects.create(
            prompt_template=prompt_version.template,
            prompt_version=prompt_version,
            model_config=model_config,
            scenario=prompt_version.template.scenario,
            input_variables=variables,
            rendered_system_prompt=rendered.system_prompt,
            rendered_user_prompt=rendered.user_prompt,
            status=PromptRunStatus.RUNNING,
            created_by=request.user,
            metadata=rag_metadata,
        )

        # 执行 LLM 调用
        start_time = time.time()
        try:
            response = llm_service.chat(
                model_config=model_config,
                system_prompt=rendered.system_prompt,
                user_prompt=rendered.user_prompt,
                response_format=prompt_version.output_schema or None,
            )

            # Schema 校验
            schema_result = schema_validator.validate(
                response.text,
                prompt_version.output_schema,
            )

            # 更新 metadata
            run.metadata["schema_valid"] = schema_result["schema_valid"]
            run.metadata["schema_errors"] = schema_result["schema_errors"]

            # 更新运行记录
            run.output_text = response.text
            run.output_json = schema_result["parsed_json"] or {}
            run.prompt_tokens = response.prompt_tokens
            run.completion_tokens = response.completion_tokens
            run.total_tokens = response.total_tokens
            run.latency_ms = int((time.time() - start_time) * 1000)

            if schema_result["schema_valid"]:
                run.status = PromptRunStatus.SUCCEEDED
            else:
                run.status = PromptRunStatus.SCHEMA_FAILED
                run.error_message = "输出不符合 JSON Schema"

            run.save(update_fields=[
                "output_text", "output_json", "prompt_tokens",
                "completion_tokens", "total_tokens", "latency_ms",
                "status", "error_message", "metadata",
            ])

            # 反向绑定 RetrievalLog
            if rag_metadata.get("retrieval_log_id"):
                from apps.knowledge.models import RetrievalLog
                RetrievalLog.objects.filter(
                    id=rag_metadata["retrieval_log_id"]
                ).update(prompt_run=run)

        except Exception as e:
            run.status = PromptRunStatus.FAILED
            run.error_message = str(e)[:2000]
            run.latency_ms = int((time.time() - start_time) * 1000)
            run.save(update_fields=["status", "error_message", "latency_ms"])

        # 返回结果
        response_data = {
            "run_id": run.id,
            "status": run.status,
            "rendered_prompt": {
                "system_prompt": rendered.system_prompt,
                "user_prompt": rendered.user_prompt,
            },
            "output": {
                "raw_text": run.output_text,
                "parsed_json": run.output_json,
                "schema_valid": run.metadata.get("schema_valid", True),
                "schema_errors": run.metadata.get("schema_errors", []),
            },
            "usage": {
                "prompt_tokens": run.prompt_tokens,
                "completion_tokens": run.completion_tokens,
                "total_tokens": run.total_tokens,
                "latency_ms": run.latency_ms,
            },
            "rag": {
                "enabled": rag_metadata["rag_enabled"],
                "retrieval_log_id": rag_metadata["retrieval_log_id"],
                "sources": rag_metadata["retrieval_sources"],
            },
            "error_message": run.error_message,
        }

        return Response(response_data)


class PromptRunListView(APIView):
    """运行记录列表视图。"""

    permission_classes = [IsAuthenticated, RequirePermission]
    required_permission = "prompt_template.manage"

    def get(self, request):
        queryset = PromptRun.objects.select_related(
            "prompt_template",
            "prompt_version",
            "model_config",
            "created_by",
        ).order_by("-created_at")

        # 过滤条件
        template_id = request.query_params.get("template_id")
        if template_id:
            queryset = queryset.filter(prompt_template_id=template_id)

        status_filter = request.query_params.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        scenario = request.query_params.get("scenario")
        if scenario:
            queryset = queryset.filter(scenario=scenario)

        # 分页（默认 20，最大 100）
        limit = min(int(request.query_params.get("limit", 20)), 100)
        offset = int(request.query_params.get("offset", 0))
        queryset = queryset[offset:offset + limit]

        serializer = PromptRunListSerializer(queryset, many=True)
        return Response(serializer.data)


class PromptRunDetailView(APIView):
    """运行记录详情视图。"""

    permission_classes = [IsAuthenticated, RequirePermission]
    required_permission = "prompt_template.manage"

    def get(self, request, pk):
        try:
            run = PromptRun.objects.select_related(
                "prompt_template",
                "prompt_version",
                "model_config__provider",
                "created_by",
            ).get(pk=pk)
        except PromptRun.DoesNotExist:
            return Response(
                {"detail": "运行记录不存在"},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = PromptRunDetailSerializer(run)
        return Response(serializer.data)