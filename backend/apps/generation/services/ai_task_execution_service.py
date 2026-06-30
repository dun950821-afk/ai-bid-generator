# backend/apps/generation/services/ai_task_execution_service.py
"""统一 AI 任务执行服务。

封装 PromptVersion 获取、RAG 检索、LLM 调用，为业务场景提供统一入口。
"""

import json
import time
from typing import Any

import jsonschema
from django.core.exceptions import ObjectDoesNotExist

from apps.generation.constants import PromptVersionStatus, PromptScope, ModelType, PromptRunStatus
from apps.generation.models import PromptTemplate, PromptVersion, ModelConfig, PromptRun
from apps.generation.services.prompt_execution_service import PromptExecutionService
from apps.generation.services.prompt_render_service import PromptRenderService
from apps.generation.services.llm_service import LLMService
from apps.knowledge.services.retrieval_service import RetrievalService
from apps.knowledge.services.rag_context_builder import RagContextBuilder


class AiTaskExecutionError(Exception):
    """AI 任务执行错误基类。"""
    pass


class PromptVersionNotFoundError(AiTaskExecutionError):
    """未找到 PromptVersion。"""
    pass


class ModelConfigNotFoundError(AiTaskExecutionError):
    """未找到 ModelConfig。"""
    pass


class RagConfigError(AiTaskExecutionError):
    """RAG 配置错误。"""
    pass


class AiTaskExecutionService:
    """统一 AI 任务执行服务。

    为业务场景（条款抽取、大纲生成、章节撰写等）提供统一的 AI 调用入口，
    封装 PromptVersion 获取、RAG 检索、LLM 调用、PromptRun 记录。
    """

    def __init__(self):
        self.render_service = PromptRenderService()
        self.llm_service = LLMService()
        self.retrieval_service = RetrievalService()
        self.rag_context_builder = RagContextBuilder()

    def execute(
        self,
        scenario: str,
        variables: dict,
        created_by,
        prompt_version_id: int | None = None,
        model_config_id: int | None = None,
        rag_options: dict | None = None,
        source: str = "business_task",
        business_context: dict | None = None,
    ) -> PromptRun:
        """执行 AI 任务。

        Args:
            scenario: 场景标识（如 requirement_analysis, outline_generation）
            variables: 输入变量字典
            created_by: 创建人用户实例
            prompt_version_id: 指定 PromptVersion ID（可选，不传则使用 published 版本）
            model_config_id: 指定 ModelConfig ID（可选，不传则使用默认 chat 模型）
            rag_options: RAG 配置（可选）
                {
                    "enabled": True,
                    "knowledge_base_ids": [1, 2],
                    "top_k": 10,
                    "query": "检索关键词",  # 可选，默认用 variables 中的 query 或 question
                    "filters": {},  # 可选
                }
            source: 来源标识（playground, business_task, api 等）
            business_context: 业务上下文（project_id, tender_file_id 等）

        Returns:
            PromptRun 运行记录

        Raises:
            PromptVersionNotFoundError: 未找到 PromptVersion
            ModelConfigNotFoundError: 未找到 ModelConfig
            RagConfigError: RAG 配置错误
        """
        start_time = time.time()

        # 1. 获取 PromptVersion
        prompt_version = self._get_prompt_version(scenario, prompt_version_id)

        # 2. 获取 ModelConfig
        model_config = self._get_model_config(model_config_id)

        # 3. 初始化 metadata
        metadata = {
            "source": source,
            "scenario": scenario,
            "business_context": business_context or {},
            "rag_enabled": False,
            "retrieval_log_id": None,
            "retrieval_sources": [],
            "model_config_id": model_config.id,
            "prompt_version_id": prompt_version.id,
        }

        # 4. 准备变量（复制一份避免修改原变量）
        enriched_variables = dict(variables)

        # 5. RAG 检索（如果启用）
        retrieval_log_id = None
        retrieval_sources = []
        if rag_options and rag_options.get("enabled"):
            rag_result = self._execute_rag(rag_options, enriched_variables, created_by)
            enriched_variables["retrieved_knowledge"] = rag_result["retrieved_knowledge"]
            enriched_variables["retrieval_sources"] = rag_result["retrieval_sources"]
            metadata["rag_enabled"] = True
            metadata["retrieval_log_id"] = rag_result["log_id"]
            metadata["retrieval_sources"] = rag_result["retrieval_sources"]
            retrieval_log_id = rag_result["log_id"]
            retrieval_sources = rag_result["retrieval_sources"]

        # 6. 渲染提示词
        try:
            rendered = self.render_service.render(prompt_version, enriched_variables)
        except Exception as exc:
            raise AiTaskExecutionError(f"提示词渲染失败: {exc}")

        # 7. 创建 PromptRun 记录
        run = PromptRun.objects.create(
            prompt_template=prompt_version.template,
            prompt_version=prompt_version,
            model_config=model_config,
            scenario=scenario,
            input_variables=variables,
            rendered_system_prompt=rendered.system_prompt,
            rendered_user_prompt=rendered.user_prompt,
            status=PromptRunStatus.RUNNING,
            metadata=metadata,
            created_by=created_by,
            **(business_context or {}),
        )

        # 8. 执行 LLM 调用
        try:
            response = self.llm_service.chat(
                model_config=model_config,
                system_prompt=rendered.system_prompt,
                user_prompt=rendered.user_prompt,
                response_format=prompt_version.output_schema or None,
            )

            # 9. 解析输出
            output_json = response.json
            if not output_json and response.text:
                try:
                    output_json = json.loads(response.text)
                except json.JSONDecodeError:
                    output_json = {}

            # 10. Schema 校验（如果 output_schema 不为空）
            schema_valid = True
            schema_errors = []
            if prompt_version.output_schema:
                schema_valid, schema_errors = self._validate_output(
                    output_json, prompt_version.output_schema
                )
                metadata["schema_valid"] = schema_valid
                metadata["schema_errors"] = schema_errors
                if not schema_valid:
                    metadata["schema_failed"] = True

            # 11. 更新成功结果
            run.output_text = response.text
            run.output_json = output_json
            run.prompt_tokens = response.prompt_tokens
            run.completion_tokens = response.completion_tokens
            run.total_tokens = response.total_tokens
            run.latency_ms = int((time.time() - start_time) * 1000)
            run.status = PromptRunStatus.SUCCEEDED
            run.metadata = metadata
            run.save()

            # 12. 记录 Token 用量
            self._record_token_usage(run, business_context)

        except Exception as exc:
            run.status = PromptRunStatus.FAILED
            run.error_message = str(exc)[:2000]
            run.latency_ms = int((time.time() - start_time) * 1000)
            run.save()

            # 记录失败的 Token 用量
            self._record_token_usage(run, business_context, status="failed")

        return run

    def _record_token_usage(self, run, business_context, status="success"):
        """记录 Token 用量日志。

        Args:
            run: PromptRun 实例
            business_context: 业务上下文
            status: 状态
        """
        from apps.generation.models import TokenUsageLog

        try:
            TokenUsageLog.objects.create(
                prompt_run=run,
                user=run.created_by,
                project=business_context.get("project") if business_context else None,
                prompt_template=run.prompt_template,
                model_config=run.model_config,
                scenario=run.scenario,
                prompt_tokens=run.prompt_tokens,
                completion_tokens=run.completion_tokens,
                total_tokens=run.total_tokens,
                latency_ms=run.latency_ms,
                status=status,
            )
        except Exception:
            # Token 记录失败不影响主流程
            pass

    def _get_prompt_version(self, scenario: str, prompt_version_id: int | None) -> PromptVersion:
        """获取 PromptVersion。

        Args:
            scenario: 场景标识
            prompt_version_id: 指定版本 ID（可选）

        Returns:
            PromptVersion 实例

        Raises:
            PromptVersionNotFoundError: 未找到版本
        """
        if prompt_version_id:
            try:
                return PromptVersion.objects.select_related("template").get(
                    pk=prompt_version_id,
                    template__is_active=True,
                )
            except ObjectDoesNotExist:
                raise PromptVersionNotFoundError(
                    f"PromptVersion#{prompt_version_id} 不存在或模板未启用"
                )

        # 未指定版本，查找 published 版本
        # 同 scenario 可能有多个 published（如 .default + .antiai），按 key 优先级排序：
        # .antiai > .v2 > .default，取第一个
        versions = list(
            PromptVersion.objects.select_related("template").filter(
                template__scenario=scenario,
                template__scope=PromptScope.SYSTEM,
                template__is_active=True,
                status=PromptVersionStatus.PUBLISHED,
            )
        )
        if not versions:
            raise PromptVersionNotFoundError(
                f"场景 '{scenario}' 未找到已发布的 PromptVersion"
            )
        if len(versions) == 1:
            return versions[0]

        def _priority(v):
            key = v.template.key
            # 优先级：.antiai > .v2 > .default
            if key.endswith(".antiai"):
                return 0
            if key.endswith(".v2"):
                return 1
            if key.endswith(".default"):
                return 3
            return 2
        versions.sort(key=_priority)
        return versions[0]

    def _get_model_config(self, model_config_id: int | None) -> ModelConfig:
        """获取 ModelConfig。

        Args:
            model_config_id: 指定模型配置 ID（可选）

        Returns:
            ModelConfig 实例

        Raises:
            ModelConfigNotFoundError: 未找到模型配置
        """
        if model_config_id:
            try:
                return ModelConfig.objects.get(
                    pk=model_config_id,
                    model_type=ModelType.CHAT,
                    is_active=True,
                )
            except ObjectDoesNotExist:
                raise ModelConfigNotFoundError(
                    f"ModelConfig#{model_config_id} 不存在或不是活跃的 Chat 模型"
                )

        # 未指定模型，使用默认 chat 模型
        try:
            return ModelConfig.objects.get(
                model_type=ModelType.CHAT,
                is_default=True,
                is_active=True,
            )
        except ObjectDoesNotExist:
            raise ModelConfigNotFoundError(
                "未找到默认的 Chat 模型，请先在系统设置中配置"
            )

    def _execute_rag(
        self,
        rag_options: dict,
        variables: dict,
        created_by,
    ) -> dict:
        """执行 RAG 检索。

        Args:
            rag_options: RAG 配置
            variables: 输入变量
            created_by: 创建人

        Returns:
            {
                "retrieved_knowledge": str,
                "retrieval_sources": list[dict],
                "log_id": int,
            }

        Raises:
            RagConfigError: RAG 配置错误
        """
        # 校验必要参数
        knowledge_base_ids = rag_options.get("knowledge_base_ids")
        if not knowledge_base_ids:
            raise RagConfigError("RAG 启用时必须提供 knowledge_base_ids")

        # 确定检索查询
        query = rag_options.get("query") or variables.get("query") or variables.get("question")
        if not query:
            raise RagConfigError("RAG 启用时必须提供 query 或在 variables 中包含 query/question")

        # 执行检索
        top_k = rag_options.get("top_k", 10)
        filters = rag_options.get("filters")
        retrieval_mode = rag_options.get("retrieval_mode", "postgres_fulltext")

        retrieval_result = self.retrieval_service.search(
            query=query,
            knowledge_base_ids=knowledge_base_ids,
            top_k=top_k,
            filters=filters,
            retrieval_mode=retrieval_mode,
            created_by=created_by,
        )

        # 组装上下文
        context_result = self.rag_context_builder.build(
            retrieval_results=retrieval_result["results"],
            max_tokens=rag_options.get("max_tokens", 4000),
            format_type=rag_options.get("format_type", "markdown"),
        )

        return {
            "retrieved_knowledge": context_result["text"],
            "retrieval_sources": context_result["sources"],
            "log_id": retrieval_result["log_id"],
        }

    def _validate_output(self, output_json: dict, schema: dict) -> tuple[bool, list[str]]:
        """校验输出是否符合 Schema。

        Args:
            output_json: 输出 JSON
            schema: JSON Schema

        Returns:
            (is_valid, errors)
        """
        try:
            jsonschema.validate(output_json, schema)
            return True, []
        except jsonschema.ValidationError as exc:
            errors = [str(exc)]
            return False, errors
        except jsonschema.SchemaError as exc:
            errors = [f"Schema 错误: {exc}"]
            return False, errors
