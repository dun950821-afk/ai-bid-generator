# Phase 6.3: Prompt Playground / Prompt IDE 增强 - 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现提示词调试台，支持变量输入、RAG 注入、模型选择、Prompt 预览、试运行、输出校验和运行记录追踪。

**Architecture:** 三阶段渐进实现：后端 API + 数据模型 → 前端骨架页面 → 前端组件完善。后端复用现有 RetrievalService/RagContextBuilder，前端采用可拖拽三栏布局。

**Tech Stack:** Django + DRF, Vue 3 + TypeScript + Element Plus, PostgreSQL

---

## 文件结构

### 后端文件

| 文件 | 职责 | 操作 |
|------|------|------|
| `backend/apps/generation/models/prompt_run.py` | 新增 metadata、created_by 字段 | 修改 |
| `backend/apps/generation/constants.py` | 新增 SCHEMA_FAILED 状态 | 修改 |
| `backend/apps/generation/services/output_schema_validator.py` | 输出 Schema 校验服务 | 新建 |
| `backend/apps/generation/services/token_usage_service.py` | Token 估算服务 | 新建 |
| `backend/apps/generation/views/playground_views.py` | Playground render/run 视图 | 新建 |
| `backend/apps/generation/views/prompt_run_views.py` | PromptRun 列表/详情视图 | 新建 |
| `backend/apps/generation/views/__init__.py` | 导出新视图 | 修改 |
| `backend/apps/generation/urls.py` | 新增路由 | 修改 |
| `backend/apps/generation/serializers/playground_serializer.py` | 已有，需确认完整 | 确认 |

### 前端文件

| 文件 | 职责 | 阶段 |
|------|------|------|
| `frontend/src/api/prompt-playground.ts` | Playground API + 类型定义 | 阶段 2 |
| `frontend/src/api/prompt-run.ts` | PromptRun API + 类型定义 | 阶段 2 |
| `frontend/src/views/admin/PromptPlaygroundView.vue` | 调试台主页面 | 阶段 2 |
| `frontend/src/views/admin/PromptRunListView.vue` | 运行记录列表 | 阶段 2 |
| `frontend/src/views/admin/PromptRunDetailView.vue` | 运行记录详情 | 阶段 2 |
| `frontend/src/components/common/ResizablePane.vue` | 可拖拽面板组件 | 阶段 2 |
| `frontend/src/components/prompt/*.vue` | 11 个 prompt 组件 | 阶段 2-3 |
| `frontend/src/utils/normalize.ts` | 数组归一化工具 | 阶段 2 |
| `frontend/src/utils/clipboard.ts` | 复制工具 | 阶段 3 |
| `frontend/src/constants/status.ts` | 状态常量 | 阶段 2 |
| `frontend/src/router/index.ts` | 新增路由 | 阶段 2 |

---

## 阶段 1：后端 API + 数据模型

### Task 1.1: PromptRun 模型新增字段

**Files:**
- Modify: `backend/apps/generation/models/prompt_run.py`
- Modify: `backend/apps/generation/constants.py`

- [ ] **Step 1: 新增 metadata 和 created_by 字段**

```python
# backend/apps/generation/models/prompt_run.py
# 在 import 区域添加
from django.conf import settings

# 在类属性区域添加（output_json 字段后面）
metadata = models.JSONField(
    "元数据",
    default=dict,
    blank=True,
    help_text="存储 schema_valid、schema_errors、rag 相关信息",
)

created_by = models.ForeignKey(
    settings.AUTH_USER_MODEL,
    on_delete=models.SET_NULL,
    null=True,
    blank=True,
    verbose_name="创建人",
)
```

- [ ] **Step 2: 新增 SCHEMA_FAILED 状态**

```python
# backend/apps/generation/constants.py
# 修改 PromptRunStatus 类

class PromptRunStatus:
    """运行状态。"""

    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    SCHEMA_FAILED = "schema_failed"  # 新增

    CHOICES = [
        (PENDING, "等待中"),
        (RUNNING, "运行中"),
        (SUCCESS, "成功"),
        (FAILED, "失败"),
        (SCHEMA_FAILED, "结构校验失败"),
    ]
```

- [ ] **Step 3: 生成迁移文件**

```bash
cd backend && python manage.py makemigrations generation --name add_prompt_run_metadata_and_status
```

Expected: 创建迁移文件 `0002_add_prompt_run_metadata_and_status.py`

- [ ] **Step 4: 执行迁移**

```bash
cd backend && python manage.py migrate generation
```

Expected: `Applying generation.0002_add_prompt_run_metadata_and_status... OK`

- [ ] **Step 5: 提交**

```bash
git add backend/apps/generation/models/prompt_run.py backend/apps/generation/constants.py backend/apps/generation/migrations/
git commit -m "feat(generation): add metadata, created_by fields and SCHEMA_FAILED status to PromptRun

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 1.2: OutputSchemaValidator 服务

**Files:**
- Create: `backend/apps/generation/services/output_schema_validator.py`

- [ ] **Step 1: 编写 OutputSchemaValidator 服务**

```python
# backend/apps/generation/services/output_schema_validator.py
"""输出 Schema 校验服务。"""

import json

import jsonschema
from jsonschema import ValidationError as JsonSchemaValidationError


class OutputSchemaValidator:
    """输出 Schema 校验服务。"""

    def validate(self, output: str | dict, schema: dict) -> dict:
        """校验输出是否符合 schema。

        Args:
            output: 输出内容（字符串或字典）
            schema: JSON Schema 定义

        Returns:
            {
                "valid": bool,
                "errors": list[str],
                "parsed": dict | None,
            }
        """
        # 解析输出
        parsed = None
        if isinstance(output, str):
            try:
                parsed = json.loads(output)
            except json.JSONDecodeError:
                return {
                    "valid": False,
                    "errors": ["输出不是有效的 JSON"],
                    "parsed": None,
                }
        else:
            parsed = output

        # 无 schema 则跳过校验
        if not schema:
            return {
                "valid": True,
                "errors": [],
                "parsed": parsed,
            }

        # Schema 校验
        errors = []
        try:
            jsonschema.validate(parsed, schema)
        except JsonSchemaValidationError as e:
            errors.append(str(e.message))

        return {
            "valid": len(errors) == 0,
            "errors": errors,
            "parsed": parsed,
        }
```

- [ ] **Step 2: 提交**

```bash
git add backend/apps/generation/services/output_schema_validator.py
git commit -m "feat(generation): add OutputSchemaValidator service

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 1.3: TokenUsageService 服务

**Files:**
- Create: `backend/apps/generation/services/token_usage_service.py`

- [ ] **Step 1: 编写 TokenUsageService 服务**

```python
# backend/apps/generation/services/token_usage_service.py
"""Token 使用服务。"""


class TokenUsageService:
    """Token 使用服务。"""

    # 中文约 1.5 字符/token，英文约 4 字符/token
    # 取中间值估算
    CHARS_PER_TOKEN = 2.5

    def estimate_tokens(self, text: str) -> int:
        """估算文本的 token 数量。

        简单估算，用于预览阶段。
        实际 token 数以模型 API 返回为准。

        Args:
            text: 文本内容

        Returns:
            估算的 token 数
        """
        if not text:
            return 0

        # 统计中文字符数
        chinese_chars = sum(1 for c in text if '一' <= c <= '鿿')
        # 非中文字符数
        other_chars = len(text) - chinese_chars

        # 中文按 1.5 字符/token，其他按 4 字符/token
        chinese_tokens = chinese_chars / 1.5
        other_tokens = other_chars / 4

        return int(chinese_tokens + other_tokens)

    def normalize_usage(self, response) -> dict:
        """从 API 响应归一化 token 使用信息。

        Args:
            response: LLM 响应对象

        Returns:
            {
                "prompt_tokens": int,
                "completion_tokens": int,
                "total_tokens": int,
            }
        """
        return {
            "prompt_tokens": getattr(response, "prompt_tokens", 0) or 0,
            "completion_tokens": getattr(response, "completion_tokens", 0) or 0,
            "total_tokens": getattr(response, "total_tokens", 0) or 0,
        }
```

- [ ] **Step 2: 更新 services __init__.py**

```python
# backend/apps/generation/services/__init__.py
# 添加导入

from .output_schema_validator import OutputSchemaValidator
from .token_usage_service import TokenUsageService

__all__ = [
    "LLMService",
    "PromptRenderService",
    "PromptExecutionService",
    "OutputSchemaValidator",
    "TokenUsageService",
]
```

- [ ] **Step 3: 提交**

```bash
git add backend/apps/generation/services/
git commit -m "feat(generation): add TokenUsageService and update services __init__

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 1.4: Playground 视图 - render 接口

**Files:**
- Create: `backend/apps/generation/views/playground_views.py`

- [ ] **Step 1: 编写 PlaygroundRenderView**

```python
# backend/apps/generation/views/playground_views.py
"""Prompt Playground 视图。"""

import re

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import RequirePermission
from apps.generation.constants import ModelType
from apps.generation.models import PromptVersion, ModelConfig
from apps.generation.serializers.playground_serializer import (
    PlaygroundRenderRequestSerializer,
    PlaygroundRenderResponseSerializer,
)
from apps.generation.services.prompt_render_service import PromptRenderService
from apps.generation.services.token_usage_service import TokenUsageService
from apps.knowledge.services.retrieval_service import RetrievalService
from apps.knowledge.services.rag_context_builder import RagContextBuilder


class PlaygroundRenderView(APIView):
    """渲染 Prompt 预览。"""

    permission_classes = [IsAuthenticated, RequirePermission]
    required_permission = "prompt_template.manage"

    def post(self, request):
        """渲染 Prompt，不调用模型。"""
        serializer = PlaygroundRenderRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        prompt_version_id = data["prompt_version_id"]
        variables = data.get("variables", {})
        rag_options = data.get("rag_options", {})

        # 获取 PromptVersion
        try:
            prompt_version = PromptVersion.objects.select_related("template").get(
                pk=prompt_version_id
            )
        except PromptVersion.DoesNotExist:
            return Response(
                {"detail": "提示词版本不存在"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # RAG 处理
        rag_info = {"enabled": False}
        if rag_options.get("enabled"):
            rag_info = self._process_rag(rag_options, variables, request.user)

        # 检测缺失变量
        missing_variables = self._detect_missing_variables(prompt_version, variables)

        # 渲染 Prompt
        render_service = PromptRenderService()
        try:
            rendered = render_service.render(prompt_version, variables)
        except Exception as e:
            return Response(
                {"detail": f"渲染失败: {str(e)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Token 估算
        token_service = TokenUsageService()
        combined_text = (rendered.system_prompt or "") + rendered.user_prompt
        token_estimate = token_service.estimate_tokens(combined_text)

        # 构造响应
        response_data = {
            "system_prompt": rendered.system_prompt,
            "user_prompt": rendered.user_prompt,
            "missing_variables": missing_variables,
            "token_estimate": token_estimate,
            "rag": rag_info,
        }

        return Response(response_data)

    def _process_rag(self, rag_options: dict, variables: dict, user) -> dict:
        """处理 RAG 检索。"""
        try:
            retrieval = RetrievalService().search(
                query=rag_options.get("query", ""),
                knowledge_base_ids=rag_options.get("knowledge_base_ids", []),
                top_k=rag_options.get("top_k", 5),
                filters=rag_options.get("filters"),
                created_by=user,
            )

            rag_context = RagContextBuilder().build(
                retrieval["results"],
                max_tokens=rag_options.get("max_context_tokens", 4000),
            )

            # 注入变量
            variables["retrieved_knowledge"] = rag_context["text"]
            variables["retrieval_sources"] = rag_context["sources"]

            return {
                "enabled": True,
                "retrieval_log_id": retrieval["log_id"],
                "sources": rag_context["sources"],
                "context_token_count": rag_context["token_count"],
            }
        except Exception:
            return {"enabled": False}

    def _detect_missing_variables(self, prompt_version: PromptVersion, variables: dict) -> list:
        """检测缺失的变量。"""
        # 从 variable_schema 提取必需变量
        if prompt_version.variable_schema:
            required = prompt_version.variable_schema.get("required", [])
            return [v for v in required if v not in variables]

        # 从模板中提取 {{ variable }} 模式
        combined = (prompt_version.system_prompt or "") + prompt_version.user_prompt
        pattern = r'\{\{\s*(\w+)\s*\}\}'
        found_vars = set(re.findall(pattern, combined))
        return list(found_vars - set(variables.keys()))
```

- [ ] **Step 2: 提交**

```bash
git add backend/apps/generation/views/playground_views.py
git commit -m "feat(generation): add PlaygroundRenderView for prompt preview

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 1.5: Playground 视图 - run 接口

**Files:**
- Modify: `backend/apps/generation/views/playground_views.py`

- [ ] **Step 1: 编写 PlaygroundRunView**

```python
# 添加到 backend/apps/generation/views/playground_views.py

import json
import time

from rest_framework.exceptions import ValidationError

from apps.generation.constants import PromptRunStatus, ModelType
from apps.generation.models import PromptRun, ModelConfig
from apps.generation.serializers.playground_serializer import (
    PlaygroundRunRequestSerializer,
    PlaygroundRunResponseSerializer,
)
from apps.generation.services.llm_service import LLMService
from apps.generation.services.output_schema_validator import OutputSchemaValidator
from apps.knowledge.models import RetrievalLog


class PlaygroundRunView(APIView):
    """执行 Prompt 运行。"""

    permission_classes = [IsAuthenticated, RequirePermission]
    required_permission = "prompt_template.manage"

    def post(self, request):
        """运行 Prompt，调用模型并记录结果。"""
        serializer = PlaygroundRunRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        prompt_version_id = data["prompt_version_id"]
        model_config_id = data.get("model_config_id")
        variables = data.get("variables", {})
        rag_options = data.get("rag_options", {})

        # 获取 PromptVersion
        try:
            prompt_version = PromptVersion.objects.select_related("template").get(
                pk=prompt_version_id
            )
        except PromptVersion.DoesNotExist:
            return Response(
                {"detail": "提示词版本不存在"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # RAG 处理
        rag_info = {"enabled": False}
        retrieval_log_id = None
        rag_context = None
        if rag_options.get("enabled"):
            rag_info, retrieval_log_id, rag_context = self._process_rag(
                rag_options, variables, request.user
            )

        # 检测缺失变量（run 时必须补全）
        missing_variables = self._detect_missing_variables(prompt_version, variables)
        if missing_variables:
            raise ValidationError({
                "missing_variables": missing_variables,
                "detail": f"缺失变量: {', '.join(missing_variables)}，请补全后再运行",
            })

        # 解析模型配置
        model_config = self._resolve_model_config(model_config_id)

        # 渲染 Prompt
        from apps.generation.services.prompt_render_service import PromptRenderService
        render_service = PromptRenderService()
        try:
            rendered = render_service.render(prompt_version, variables)
        except Exception as e:
            return Response(
                {"detail": f"渲染失败: {str(e)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 创建 PromptRun
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
            metadata={"source": "playground"},
        )

        # 执行 LLM 调用
        start_time = time.time()
        try:
            response = self._call_llm(
                model_config,
                rendered.system_prompt,
                rendered.user_prompt,
                prompt_version.output_schema,
            )

            # 解析输出
            output_text = response.text
            output_json = {}
            try:
                if output_text:
                    output_json = json.loads(output_text)
            except json.JSONDecodeError:
                pass

            # Schema 校验
            schema_valid = True
            schema_errors = []
            if prompt_version.output_schema:
                validator = OutputSchemaValidator()
                result = validator.validate(output_json, prompt_version.output_schema)
                schema_valid = result["valid"]
                schema_errors = result["errors"]

            # 更新 PromptRun
            run.output_text = output_text
            run.output_json = output_json
            run.prompt_tokens = response.prompt_tokens
            run.completion_tokens = response.completion_tokens
            run.total_tokens = response.total_tokens
            run.latency_ms = int((time.time() - start_time) * 1000)
            run.status = PromptRunStatus.SUCCESS

            # 写入 metadata
            run.metadata["schema_valid"] = schema_valid
            run.metadata["schema_errors"] = schema_errors

            if rag_options.get("enabled"):
                run.metadata["rag_enabled"] = True
                run.metadata["retrieval_log_id"] = retrieval_log_id
                if rag_context:
                    run.metadata["retrieval_sources"] = rag_context.get("sources", [])
                    run.metadata["rag_context_preview"] = rag_context.get("text", "")[:2000]

            run.save()

            # 反向绑定 RetrievalLog
            if retrieval_log_id:
                RetrievalLog.objects.filter(id=retrieval_log_id).update(prompt_run=run)

        except Exception as e:
            run.status = PromptRunStatus.FAILED
            run.error_message = str(e)[:2000]
            run.latency_ms = int((time.time() - start_time) * 1000)
            run.save()

        # 构造响应
        return self._build_response(run, rag_info, rendered)

    def _resolve_model_config(self, model_config_id: int | None) -> ModelConfig:
        """解析模型配置。"""
        if model_config_id:
            config = ModelConfig.objects.filter(
                pk=model_config_id,
                is_active=True,
                model_type=ModelType.CHAT,
            ).first()
            if not config:
                raise ValidationError("指定的模型不存在或不可用")
            return config

        # 使用默认 Chat 模型
        default = ModelConfig.objects.filter(
            model_type=ModelType.CHAT,
            is_default=True,
            is_active=True,
        ).first()
        if not default:
            raise ValidationError("未配置默认 Chat 模型，请先在系统设置中配置")
        return default

    def _process_rag(self, rag_options: dict, variables: dict, user) -> tuple:
        """处理 RAG 检索，返回 (rag_info, retrieval_log_id, rag_context)。"""
        from apps.knowledge.services.retrieval_service import RetrievalService
        from apps.knowledge.services.rag_context_builder import RagContextBuilder

        try:
            retrieval = RetrievalService().search(
                query=rag_options.get("query", ""),
                knowledge_base_ids=rag_options.get("knowledge_base_ids", []),
                top_k=rag_options.get("top_k", 5),
                filters=rag_options.get("filters"),
                created_by=user,
            )

            rag_context = RagContextBuilder().build(
                retrieval["results"],
                max_tokens=rag_options.get("max_context_tokens", 4000),
            )

            # 注入变量
            variables["retrieved_knowledge"] = rag_context["text"]
            variables["retrieval_sources"] = rag_context["sources"]

            rag_info = {
                "enabled": True,
                "retrieval_log_id": retrieval["log_id"],
                "sources": rag_context["sources"],
            }

            return rag_info, retrieval["log_id"], rag_context
        except Exception:
            return {"enabled": False}, None, None

    def _detect_missing_variables(self, prompt_version: PromptVersion, variables: dict) -> list:
        """检测缺失的变量。"""
        import re
        if prompt_version.variable_schema:
            required = prompt_version.variable_schema.get("required", [])
            return [v for v in required if v not in variables]

        combined = (prompt_version.system_prompt or "") + prompt_version.user_prompt
        pattern = r'\{\{\s*(\w+)\s*\}\}'
        found_vars = set(re.findall(pattern, combined))
        return list(found_vars - set(variables.keys()))

    def _call_llm(self, model_config, system_prompt: str, user_prompt: str, output_schema: dict):
        """调用 LLM。"""
        llm_service = LLMService()
        return llm_service.chat(
            model_config=model_config,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            response_format=output_schema or None,
        )

    def _build_response(self, run: PromptRun, rag_info: dict, rendered) -> dict:
        """构造响应数据。"""
        return {
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
            "rag": rag_info,
            "error_message": run.error_message,
        }
```

- [ ] **Step 2: 提交**

```bash
git add backend/apps/generation/views/playground_views.py
git commit -m "feat(generation): add PlaygroundRunView for prompt execution

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 1.6: PromptRun 视图

**Files:**
- Create: `backend/apps/generation/views/prompt_run_views.py`

- [ ] **Step 1: 编写 PromptRunListView 和 PromptRunDetailView**

```python
# backend/apps/generation/views/prompt_run_views.py
"""PromptRun 视图。"""

from rest_framework import generics
from rest_framework.permissions import IsAuthenticated

from apps.accounts.permissions import RequirePermission
from apps.generation.models import PromptRun
from apps.generation.serializers.playground_serializer import (
    PromptRunListSerializer,
    PromptRunDetailSerializer,
)


class PromptRunListView(generics.ListAPIView):
    """运行记录列表。"""

    serializer_class = PromptRunListSerializer
    permission_classes = [IsAuthenticated, RequirePermission]
    required_permission = "prompt_template.manage"

    def get_queryset(self):
        queryset = PromptRun.objects.select_related(
            "prompt_template",
            "prompt_version",
            "model_config",
            "created_by",
        )

        # 过滤参数
        template_id = self.request.query_params.get("template_id")
        if template_id:
            queryset = queryset.filter(prompt_template_id=template_id)

        version_id = self.request.query_params.get("version_id")
        if version_id:
            queryset = queryset.filter(prompt_version_id=version_id)

        status = self.request.query_params.get("status")
        if status:
            queryset = queryset.filter(status=status)

        return queryset.order_by("-created_at")


class PromptRunDetailView(generics.RetrieveAPIView):
    """运行记录详情。"""

    serializer_class = PromptRunDetailSerializer
    permission_classes = [IsAuthenticated, RequirePermission]
    required_permission = "prompt_template.manage"

    def get_queryset(self):
        return PromptRun.objects.select_related(
            "prompt_template",
            "prompt_version",
            "model_config",
            "created_by",
        )
```

- [ ] **Step 2: 提交**

```bash
git add backend/apps/generation/views/prompt_run_views.py
git commit -m "feat(generation): add PromptRunListView and PromptRunDetailView

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 1.7: 更新 views __init__.py 和 urls.py

**Files:**
- Modify: `backend/apps/generation/views/__init__.py`
- Modify: `backend/apps/generation/urls.py`

- [ ] **Step 1: 更新 views __init__.py**

```python
# backend/apps/generation/views/__init__.py
from .playground_views import PlaygroundRenderView, PlaygroundRunView
from .prompt_run_views import PromptRunListView, PromptRunDetailView

__all__ = [
    "PlaygroundRenderView",
    "PlaygroundRunView",
    "PromptRunListView",
    "PromptRunDetailView",
]
```

- [ ] **Step 2: 更新 urls.py**

```python
# backend/apps/generation/urls.py
# 在现有 urlpatterns 列表中添加

from django.urls import path
from apps.generation.views import (
    PlaygroundRenderView,
    PlaygroundRunView,
    PromptRunListView,
    PromptRunDetailView,
)

urlpatterns = [
    # ... 现有路由 ...

    # Playground API
    path("playground/render/", PlaygroundRenderView.as_view(), name="playground-render"),
    path("playground/run/", PlaygroundRunView.as_view(), name="playground-run"),

    # PromptRun API
    path("prompt-runs/", PromptRunListView.as_view(), name="prompt-run-list"),
    path("prompt-runs/<int:pk>/", PromptRunDetailView.as_view(), name="prompt-run-detail"),
]
```

- [ ] **Step 3: 提交**

```bash
git add backend/apps/generation/views/__init__.py backend/apps/generation/urls.py
git commit -m "feat(generation): add playground and prompt-run routes

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 1.8: 后端测试

**Files:**
- Create: `backend/apps/generation/tests/test_playground_api.py`

- [ ] **Step 1: 编写 Playground API 测试**

```python
# backend/apps/generation/tests/test_playground_api.py
"""Playground API 测试。"""

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.generation.models import PromptTemplate, PromptVersion, ModelConfig, ModelProvider
from apps.generation.constants import PromptScenario, PromptScope, ModelType

User = get_user_model()


@pytest.fixture
def api_client():
    client = APIClient()
    return client


@pytest.fixture
def user():
    return User.objects.create_user(username="testuser", password="testpass")


@pytest.fixture
def prompt_template():
    return PromptTemplate.objects.create(
        key="test_template",
        name="测试模板",
        scenario=PromptScenario.SECTION_WRITING,
        scope=PromptScope.SYSTEM,
    )


@pytest.fixture
def prompt_version(prompt_template):
    return PromptVersion.objects.create(
        template=prompt_template,
        version="1.0.0",
        system_prompt="你是一个助手。",
        user_prompt="请帮我写关于 {{ topic }} 的内容。",
        variable_schema={
            "type": "object",
            "required": ["topic"],
        },
    )


@pytest.fixture
def model_provider():
    return ModelProvider.objects.create(
        name="Mock Provider",
        provider_type="mock",
        is_active=True,
    )


@pytest.fixture
def model_config(model_provider):
    return ModelConfig.objects.create(
        provider=model_provider,
        model_name="mock-model",
        display_name="Mock Model",
        model_type=ModelType.CHAT,
        is_default=True,
        is_active=True,
    )


class TestPlaygroundRender:
    """测试 render 接口。"""

    def test_render_success(self, api_client, user, prompt_version):
        api_client.force_authenticate(user=user)
        response = api_client.post("/api/generation/playground/render/", {
            "prompt_version_id": prompt_version.id,
            "variables": {"topic": "测试主题"},
        })
        assert response.status_code == 200
        assert "system_prompt" in response.data
        assert "user_prompt" in response.data
        assert response.data["missing_variables"] == []

    def test_render_missing_variables(self, api_client, user, prompt_version):
        api_client.force_authenticate(user=user)
        response = api_client.post("/api/generation/playground/render/", {
            "prompt_version_id": prompt_version.id,
            "variables": {},
        })
        assert response.status_code == 200
        assert "topic" in response.data["missing_variables"]

    def test_render_unauthorized(self, api_client, prompt_version):
        response = api_client.post("/api/generation/playground/render/", {
            "prompt_version_id": prompt_version.id,
            "variables": {},
        })
        assert response.status_code == 401


class TestPlaygroundRun:
    """测试 run 接口。"""

    def test_run_missing_variables_returns_400(self, api_client, user, prompt_version, model_config):
        api_client.force_authenticate(user=user)
        response = api_client.post("/api/generation/playground/run/", {
            "prompt_version_id": prompt_version.id,
            "variables": {},
        })
        assert response.status_code == 400
        assert "missing_variables" in response.data

    def test_run_creates_prompt_run(self, api_client, user, prompt_version, model_config):
        from apps.generation.models import PromptRun

        api_client.force_authenticate(user=user)
        initial_count = PromptRun.objects.count()

        response = api_client.post("/api/generation/playground/run/", {
            "prompt_version_id": prompt_version.id,
            "variables": {"topic": "测试主题"},
        })

        assert PromptRun.objects.count() == initial_count + 1


class TestPromptRunList:
    """测试 PromptRun 列表接口。"""

    def test_list_requires_auth(self, api_client):
        response = api_client.get("/api/generation/prompt-runs/")
        assert response.status_code == 401

    def test_list_filter_by_template(self, api_client, user, prompt_template):
        api_client.force_authenticate(user=user)
        response = api_client.get(f"/api/generation/prompt-runs/?template_id={prompt_template.id}")
        assert response.status_code == 200
```

- [ ] **Step 2: 运行测试**

```bash
cd backend && python -m pytest apps/generation/tests/test_playground_api.py -v
```

Expected: 测试通过

- [ ] **Step 3: 提交**

```bash
git add backend/apps/generation/tests/test_playground_api.py
git commit -m "test(generation): add playground API tests

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 1.9: 阶段 1 完成提交

- [ ] **Step 1: 运行完整测试套件**

```bash
cd backend && python -m pytest --tb=short -q
```

Expected: 所有测试通过

- [ ] **Step 2: 阶段 1 完成标记**

```bash
git tag phase-6.3-stage1-complete
```

---

## 阶段 2：前端骨架页面

### Task 2.1: 前端工具函数

**Files:**
- Create: `frontend/src/utils/normalize.ts`
- Create: `frontend/src/constants/status.ts`

- [ ] **Step 1: 创建 normalize.ts**

```typescript
// frontend/src/utils/normalize.ts

/**
 * 将 API 响应归一化为数组
 * 处理分页响应 { results: [] } 和直接数组响应
 */
export function normalizeList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object' && 'results' in data) {
    const results = (data as { results: unknown }).results
    return Array.isArray(results) ? (results as T[]) : []
  }
  return []
}
```

- [ ] **Step 2: 创建 status.ts**

```typescript
// frontend/src/constants/status.ts

export const PROMPT_RUN_STATUS = {
  RUNNING: 'running',
  SUCCESS: 'success',
  FAILED: 'failed',
  SCHEMA_FAILED: 'schema_failed',
} as const

export type PromptRunStatusType = typeof PROMPT_RUN_STATUS[keyof typeof PROMPT_RUN_STATUS]

export const STATUS_MAP: Record<string, { label: string; type: 'success' | 'warning' | 'danger' | 'info' }> = {
  running: { label: '运行中', type: 'warning' },
  success: { label: '成功', type: 'success' },
  failed: { label: '失败', type: 'danger' },
  schema_failed: { label: '结构校验失败', type: 'warning' },
}
```

- [ ] **Step 3: 提交**

```bash
git add frontend/src/utils/normalize.ts frontend/src/constants/status.ts
git commit -m "feat(frontend): add normalize and status utilities

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2.2: API 类型定义和封装

**Files:**
- Create: `frontend/src/api/prompt-playground.ts`
- Create: `frontend/src/api/prompt-run.ts`

- [ ] **Step 1: 创建 prompt-playground.ts**

```typescript
// frontend/src/api/prompt-playground.ts
import { http } from './http'

// 类型定义
export interface RagOptions {
  enabled: boolean
  knowledge_base_ids?: number[]
  query?: string
  top_k?: number
  filters?: Record<string, unknown>
  max_context_tokens?: number
}

export interface RenderRequest {
  prompt_version_id: number
  variables: Record<string, unknown>
  rag_options?: RagOptions
}

export interface RunRequest extends RenderRequest {
  model_config_id?: number
}

export interface RenderResponse {
  system_prompt: string
  user_prompt: string
  missing_variables: string[]
  token_estimate: number
  rag?: {
    enabled: boolean
    retrieval_log_id?: number | null
    sources?: unknown[]
    context_token_count?: number
  }
}

export interface RunResponse {
  run_id: number
  status: string
  rendered_prompt: {
    system_prompt: string
    user_prompt: string
  }
  output: {
    raw_text: string
    parsed_json?: unknown
    schema_valid?: boolean
    schema_errors?: string[]
  }
  usage: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
    latency_ms?: number
  }
  rag?: {
    enabled: boolean
    retrieval_log_id?: number | null
    sources?: unknown[]
  }
  error_message?: string
}

// API
export const playgroundApi = {
  render(data: RenderRequest) {
    return http.post<RenderResponse>('/api/generation/playground/render/', data)
  },

  run(data: RunRequest) {
    return http.post<RunResponse>('/api/generation/playground/run/', data)
  },
}
```

- [ ] **Step 2: 创建 prompt-run.ts**

```typescript
// frontend/src/api/prompt-run.ts
import { http } from './http'

// 类型定义
export interface PromptRun {
  id: number
  template_name: string
  version_number: string
  model_name: string
  scenario: string
  status: string
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  latency_ms: number
  created_at: string
  created_by_name: string | null
}

export interface PromptRunDetail extends PromptRun {
  template_key: string
  model_provider: string
  input_variables: Record<string, unknown>
  rendered_system_prompt: string
  rendered_user_prompt: string
  output_text: string
  output_json: unknown
  error_message: string
  schema_valid: boolean
  schema_errors: string[]
  rag_info: {
    enabled: boolean
    retrieval_log_id?: number | null
    sources?: unknown[]
    context_preview?: string
  }
}

export interface PromptRunListParams {
  template_id?: number
  version_id?: number
  status?: string
}

// API
export const promptRunApi = {
  list(params?: PromptRunListParams) {
    return http.get<{ count: number; results: PromptRun[] }>('/api/generation/prompt-runs/', { params })
  },

  get(id: number) {
    return http.get<PromptRunDetail>(`/api/generation/prompt-runs/${id}/`)
  },
}
```

- [ ] **Step 3: 提交**

```bash
git add frontend/src/api/prompt-playground.ts frontend/src/api/prompt-run.ts
git commit -m "feat(frontend): add playground and prompt-run API modules

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2.3: ResizablePane 组件

**Files:**
- Create: `frontend/src/components/common/ResizablePane.vue`

- [ ] **Step 1: 创建 ResizablePane.vue**

```vue
<!-- frontend/src/components/common/ResizablePane.vue -->
<template>
  <div
    class="resizable-pane"
    :style="{ width: width + 'px' }"
  >
    <slot />
    <div class="resize-handle" @mousedown="startResize" />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount } from 'vue'

const props = defineProps<{
  width: number
  minWidth: number
  maxWidth: number
}>()

const emit = defineEmits<{
  resize: [width: number]
}>()

let onMouseMove: ((e: MouseEvent) => void) | null = null
let onMouseUp: (() => void) | null = null

function startResize(e: MouseEvent) {
  e.preventDefault()
  const startX = e.clientX
  const startWidth = props.width

  document.body.style.userSelect = 'none'
  document.body.style.cursor = 'col-resize'

  onMouseMove = (e: MouseEvent) => {
    const delta = e.clientX - startX
    const newWidth = Math.max(props.minWidth, Math.min(props.maxWidth, startWidth + delta))
    emit('resize', newWidth)
  }

  onMouseUp = () => {
    if (onMouseMove) document.removeEventListener('mousemove', onMouseMove)
    if (onMouseUp) document.removeEventListener('mouseup', onMouseUp)
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp, { once: true })
}

onBeforeUnmount(() => {
  if (onMouseMove) document.removeEventListener('mousemove', onMouseMove)
  if (onMouseUp) document.removeEventListener('mouseup', onMouseUp)
  document.body.style.userSelect = ''
  document.body.style.cursor = ''
})
</script>

<style scoped>
.resizable-pane {
  position: relative;
  height: 100%;
  min-width: 0;
  overflow: auto;
}

.resize-handle {
  position: absolute;
  top: 0;
  right: -6px;
  width: 12px;
  height: 100%;
  cursor: col-resize;
  z-index: 10;
}

.resize-handle:hover {
  background: linear-gradient(90deg, transparent 45%, var(--el-color-primary) 50%, transparent 55%);
}

.resize-handle:active {
  background: linear-gradient(90deg, transparent 40%, var(--el-color-primary) 50%, transparent 60%);
}
</style>
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/components/common/ResizablePane.vue
git commit -m "feat(frontend): add ResizablePane component with memory leak protection

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2.4: 轻量版 prompt 组件

**Files:**
- Create: `frontend/src/components/prompt/VersionSelector.vue`
- Create: `frontend/src/components/prompt/InputConfigPanel.vue`
- Create: `frontend/src/components/prompt/PromptPreviewPanel.vue`
- Create: `frontend/src/components/prompt/PromptRunResultPanel.vue`

- [ ] **Step 1: 创建 VersionSelector.vue**

```vue
<!-- frontend/src/components/prompt/VersionSelector.vue -->
<template>
  <el-select
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    placeholder="选择版本"
    style="width: 200px"
  >
    <el-option
      v-for="v in versions"
      :key="v.id"
      :label="`${v.version} (${v.status_display})`"
      :value="v.id"
    />
  </el-select>
</template>

<script setup lang="ts">
import type { PromptVersion } from '@/api/prompt'

defineProps<{
  modelValue: number | null
  versions: PromptVersion[]
}>()

defineEmits<{
  'update:modelValue': [value: number]
}>()
</script>
```

- [ ] **Step 2: 创建 InputConfigPanel.vue（轻量版）**

```vue
<!-- frontend/src/components/prompt/InputConfigPanel.vue -->
<template>
  <div class="input-config-panel">
    <el-form label-width="80px" size="small">
      <el-form-item label="版本">
        <VersionSelector
          v-model="localVersionId"
          :versions="versions"
        />
      </el-form-item>

      <el-form-item label="模型">
        <el-select
          v-model="localModelConfigId"
          placeholder="默认 Chat 模型"
          clearable
          style="width: 100%"
        >
          <el-option
            v-for="m in chatModels"
            :key="m.id"
            :label="m.display_name"
            :value="m.id"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="变量 JSON">
        <el-input
          v-model="variablesText"
          type="textarea"
          :rows="6"
          placeholder='{"key": "value"}'
          @change="validateVariables"
        />
        <div v-if="variableError" class="error-text">{{ variableError }}</div>
      </el-form-item>

      <el-divider>RAG 配置</el-divider>

      <el-form-item label="启用 RAG">
        <el-switch v-model="ragEnabled" />
      </el-form-item>

      <template v-if="ragEnabled">
        <el-form-item label="知识库">
          <el-select
            v-model="localKnowledgeBaseIds"
            multiple
            placeholder="选择知识库"
            style="width: 100%"
          >
            <el-option
              v-for="kb in knowledgeBases"
              :key="kb.id"
              :label="kb.name"
              :value="kb.id"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="查询文本">
          <el-input v-model="localQuery" placeholder="检索查询" />
        </el-form-item>
      </template>

      <el-form-item>
        <el-button type="primary" :disabled="!canRun" @click="$emit('render')">
          渲染预览
        </el-button>
        <el-button type="success" :disabled="!canRun" @click="$emit('run')">
          运行测试
        </el-button>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import VersionSelector from './VersionSelector.vue'
import { normalizeList } from '@/utils/normalize'
import type { PromptVersion } from '@/api/prompt'

interface Props {
  versionId: number | null
  modelConfigId?: number | null
  variables: Record<string, unknown>
  ragEnabled: boolean
  knowledgeBaseIds: number[]
  query: string
  versions: PromptVersion[]
  chatModels: { id: number; display_name: string }[]
  knowledgeBases: { id: number; name: string }[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:versionId': [value: number | null]
  'update:modelConfigId': [value: number | null]
  'update:variables': [value: Record<string, unknown>]
  'update:ragEnabled': [value: boolean]
  'update:knowledgeBaseIds': [value: number[]]
  'update:query': [value: string]
  'render': []
  'run': []
}>()

// 本地状态
const localVersionId = computed({
  get: () => props.versionId,
  set: (v) => emit('update:versionId', v),
})

const localModelConfigId = computed({
  get: () => props.modelConfigId ?? null,
  set: (v) => emit('update:modelConfigId', v),
})

const localKnowledgeBaseIds = computed({
  get: () => props.knowledgeBaseIds,
  set: (v) => emit('update:knowledgeBaseIds', v),
})

const localQuery = computed({
  get: () => props.query,
  set: (v) => emit('update:query', v),
})

const ragEnabled = computed({
  get: () => props.ragEnabled,
  set: (v) => emit('update:ragEnabled', v),
})

// 变量 JSON 编辑
const variablesText = ref(JSON.stringify(props.variables, null, 2))
const variableError = ref('')

watch(() => props.variables, (v) => {
  variablesText.value = JSON.stringify(v, null, 2)
}, { deep: true })

function validateVariables() {
  if (!variablesText.value.trim()) {
    variableError.value = ''
    emit('update:variables', {})
    return
  }

  try {
    const parsed = JSON.parse(variablesText.value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      variableError.value = '变量必须是 JSON 对象'
      return
    }
    variableError.value = ''
    emit('update:variables', parsed)
  } catch {
    variableError.value = 'JSON 格式错误'
  }
}

// RAG 校验
const ragValid = computed(() => {
  if (!ragEnabled.value) return true
  if (!localKnowledgeBaseIds.value.length) return false
  if (!localQuery.value.trim()) return false
  return true
})

const canRun = computed(() => !variableError.value && ragValid.value)
</script>

<style scoped>
.input-config-panel {
  padding: 16px;
}

.error-text {
  color: var(--el-color-danger);
  font-size: 12px;
  margin-top: 4px;
}
</style>
```

- [ ] **Step 3: 创建 PromptPreviewPanel.vue（轻量版）**

```vue
<!-- frontend/src/components/prompt/PromptPreviewPanel.vue -->
<template>
  <div class="preview-panel">
    <div class="header">
      <span>Prompt 预览</span>
      <div class="actions">
        <el-tag v-if="tokenEstimate" size="small">~{{ tokenEstimate }} tokens</el-tag>
        <el-button size="small" @click="copyPrompt">复制</el-button>
      </div>
    </div>

    <div v-if="loading" class="loading">
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>渲染中...</span>
    </div>

    <template v-else>
      <div v-if="systemPrompt" class="section">
        <div class="label">System Prompt</div>
        <pre class="prompt-text">{{ systemPrompt }}</pre>
      </div>

      <div class="section">
        <div class="label">User Prompt</div>
        <pre class="prompt-text">{{ userPrompt }}</pre>
      </div>

      <div v-if="missingVariables.length" class="missing-vars">
        <el-alert type="warning" :closable="false">
          缺失变量: {{ missingVariables.join(', ') }}
        </el-alert>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { Loading } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

defineProps<{
  systemPrompt: string
  userPrompt: string
  missingVariables: string[]
  tokenEstimate: number
  loading: boolean
}>()

function copyPrompt() {
  // 简化版复制，阶段 3 使用统一工具
  navigator.clipboard?.writeText('').then(() => {
    ElMessage.success('已复制')
  })
}
</script>

<style scoped>
.preview-panel {
  padding: 16px;
  height: 100%;
  overflow: auto;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.section {
  margin-bottom: 16px;
}

.label {
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--el-text-color-secondary);
}

.prompt-text {
  background: var(--el-fill-color-light);
  padding: 12px;
  border-radius: 4px;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13px;
  max-height: 300px;
  overflow: auto;
}

.missing-vars {
  margin-top: 16px;
}

.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px;
  color: var(--el-text-color-secondary);
}
</style>
```

- [ ] **Step 4: 创建 PromptRunResultPanel.vue（轻量版）**

```vue
<!-- frontend/src/components/prompt/PromptRunResultPanel.vue -->
<template>
  <div class="result-panel">
    <div v-if="loading" class="loading">
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>运行中...</span>
    </div>

    <template v-else-if="result">
      <el-tabs v-model="activeTab">
        <el-tab-pane label="输出" name="output">
          <div class="section">
            <div class="label">Raw Output</div>
            <pre class="output-text">{{ result.output?.raw_text || '(空)' }}</pre>
          </div>
          <div v-if="result.output?.parsed_json" class="section">
            <div class="label">Parsed JSON</div>
            <pre class="output-json">{{ JSON.stringify(result.output.parsed_json, null, 2) }}</pre>
          </div>
        </el-tab-pane>

        <el-tab-pane label="Schema" name="schema">
          <el-alert
            v-if="result.output?.schema_valid"
            type="success"
            title="校验通过"
            :closable="false"
          />
          <el-alert
            v-else
            type="error"
            title="校验失败"
            :closable="false"
          >
            <ul v-if="result.output?.schema_errors?.length">
              <li v-for="(err, i) in result.output.schema_errors" :key="i">{{ err }}</li>
            </ul>
          </el-alert>
        </el-tab-pane>

        <el-tab-pane label="RAG" name="rag">
          <div v-if="!result.rag?.enabled">本次运行未启用 RAG</div>
          <div v-else>
            <div v-for="source in result.rag?.sources" :key="source.chunk_id" class="source-item">
              {{ source.document_title }}
            </div>
          </div>
        </el-tab-pane>

        <el-tab-pane label="Usage" name="usage">
          <el-descriptions :column="2" border size="small">
            <el-descriptions-item label="Prompt Tokens">
              {{ result.usage?.prompt_tokens || 0 }}
            </el-descriptions-item>
            <el-descriptions-item label="Completion Tokens">
              {{ result.usage?.completion_tokens || 0 }}
            </el-descriptions-item>
            <el-descriptions-item label="Total Tokens">
              {{ result.usage?.total_tokens || 0 }}
            </el-descriptions-item>
            <el-descriptions-item label="耗时">
              {{ result.usage?.latency_ms || 0 }} ms
            </el-descriptions-item>
          </el-descriptions>
        </el-tab-pane>
      </el-tabs>
    </template>

    <el-empty v-else description="运行后查看结果" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Loading } from '@element-plus/icons-vue'
import type { RunResponse } from '@/api/prompt-playground'

defineProps<{
  result: RunResponse | null
  loading: boolean
}>()

const activeTab = ref('output')
</script>

<style scoped>
.result-panel {
  padding: 16px;
  height: 100%;
  overflow: auto;
}

.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px;
  color: var(--el-text-color-secondary);
}

.section {
  margin-bottom: 16px;
}

.label {
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--el-text-color-secondary);
}

.output-text,
.output-json {
  background: var(--el-fill-color-light);
  padding: 12px;
  border-radius: 4px;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13px;
  max-height: 200px;
  overflow: auto;
}

.source-item {
  padding: 8px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
  margin-bottom: 8px;
}
</style>
```

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/prompt/
git commit -m "feat(frontend): add lightweight prompt components for stage 2

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2.5: PromptPlaygroundView 主页面

**Files:**
- Create: `frontend/src/views/admin/PromptPlaygroundView.vue`

- [ ] **Step 1: 创建 PromptPlaygroundView.vue**

```vue
<!-- frontend/src/views/admin/PromptPlaygroundView.vue -->
<template>
  <div class="playground">
    <!-- 头部 -->
    <div class="header">
      <el-button text @click="goBack">
        <el-icon><ArrowLeft /></el-icon>
        返回
      </el-button>
      <h2>提示词调试台：{{ template?.name || '加载中...' }}</h2>
      <VersionSelector
        v-model="versionId"
        :versions="versions"
      />
    </div>

    <!-- 三栏布局 -->
    <div class="main-content">
      <!-- 左栏：输入配置 -->
      <ResizablePane
        :width="leftWidth"
        :min-width="280"
        :max-width="460"
        @resize="leftWidth = $event"
      >
        <InputConfigPanel
          v-model:version-id="versionId"
          v-model:model-config-id="modelConfigId"
          v-model:variables="variables"
          v-model:rag-enabled="ragEnabled"
          v-model:knowledge-base-ids="knowledgeBaseIds"
          v-model:query="ragQuery"
          :versions="versions"
          :chat-models="chatModels"
          :knowledge-bases="knowledgeBases"
          @render="handleRender"
          @run="handleRun"
        />
      </ResizablePane>

      <!-- 中栏：Prompt 预览 -->
      <div class="center-pane">
        <PromptPreviewPanel
          :system-prompt="renderResult?.system_prompt || ''"
          :user-prompt="renderResult?.user_prompt || ''"
          :missing-variables="renderResult?.missing_variables || []"
          :token-estimate="renderResult?.token_estimate || 0"
          :loading="renderLoading"
        />
      </div>

      <!-- 右栏：运行结果 -->
      <ResizablePane
        :width="rightWidth"
        :min-width="360"
        :max-width="560"
        @resize="rightWidth = $event"
      >
        <PromptRunResultPanel
          :result="runResult"
          :loading="runLoading"
        />
      </ResizablePane>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft } from '@element-plus/icons-vue'
import { promptApi, type PromptTemplate, type PromptVersion } from '@/api/prompt'
import { playgroundApi, type RenderResponse, type RunResponse } from '@/api/prompt-playground'
import { normalizeList } from '@/utils/normalize'
import ResizablePane from '@/components/common/ResizablePane.vue'
import VersionSelector from '@/components/prompt/VersionSelector.vue'
import InputConfigPanel from '@/components/prompt/InputConfigPanel.vue'
import PromptPreviewPanel from '@/components/prompt/PromptPreviewPanel.vue'
import PromptRunResultPanel from '@/components/prompt/PromptRunResultPanel.vue'

const route = useRoute()
const router = useRouter()

// 模板和版本
const template = ref<PromptTemplate | null>(null)
const versions = ref<PromptVersion[]>([])
const versionId = ref<number | null>(null)

// 输入配置
const modelConfigId = ref<number | null>(null)
const variables = ref<Record<string, unknown>>({})
const ragEnabled = ref(false)
const knowledgeBaseIds = ref<number[]>([])
const ragQuery = ref('')

// 数据源
const chatModels = ref<{ id: number; display_name: string }[]>([])
const knowledgeBases = ref<{ id: number; name: string }[]>([])

// 结果
const renderResult = ref<RenderResponse | null>(null)
const runResult = ref<RunResponse | null>(null)
const renderLoading = ref(false)
const runLoading = ref(false)

// 布局
const leftWidth = ref(320)
const rightWidth = ref(420)

// 加载模板和版本
async function loadTemplate() {
  const templateId = Number(route.params.id)
  if (!templateId) return

  try {
    const res = await promptApi.getTemplate(templateId)
    template.value = res.data

    const versionsRes = await promptApi.listVersions(templateId)
    versions.value = versionsRes.data

    // 默认选择已发布版本或第一个版本
    const published = versions.value.find(v => v.status === 'published')
    versionId.value = published?.id || versions.value[0]?.id || null
  } catch (e) {
    console.error('加载模板失败', e)
  }
}

// 加载模型列表
async function loadChatModels() {
  try {
    const res = await fetch('/api/generation/model-configs/?model_type=chat&is_active=true').then(r => r.json())
    chatModels.value = normalizeList(res)
  } catch (e) {
    console.error('加载模型失败', e)
  }
}

// 加载知识库列表
async function loadKnowledgeBases() {
  try {
    const res = await fetch('/api/knowledge/bases/?is_active=true').then(r => r.json())
    knowledgeBases.value = normalizeList(res)
  } catch (e) {
    console.error('加载知识库失败', e)
  }
}

// 渲染预览
async function handleRender() {
  if (!versionId.value) return

  renderLoading.value = true
  try {
    const res = await playgroundApi.render({
      prompt_version_id: versionId.value,
      variables: variables.value,
      rag_options: ragEnabled.value ? {
        enabled: true,
        knowledge_base_ids: knowledgeBaseIds.value,
        query: ragQuery.value,
      } : undefined,
    })
    renderResult.value = res.data
  } catch (e) {
    console.error('渲染失败', e)
  } finally {
    renderLoading.value = false
  }
}

// 运行测试
async function handleRun() {
  if (!versionId.value) return

  runLoading.value = true
  try {
    const res = await playgroundApi.run({
      prompt_version_id: versionId.value,
      model_config_id: modelConfigId.value || undefined,
      variables: variables.value,
      rag_options: ragEnabled.value ? {
        enabled: true,
        knowledge_base_ids: knowledgeBaseIds.value,
        query: ragQuery.value,
      } : undefined,
    })
    runResult.value = res.data
  } catch (e) {
    console.error('运行失败', e)
  } finally {
    runLoading.value = false
  }
}

function goBack() {
  router.push({ name: 'admin-prompts' })
}

// 恢复布局状态
onMounted(() => {
  loadTemplate()
  loadChatModels()
  loadKnowledgeBases()

  const savedLeft = localStorage.getItem('playground-left-width')
  const savedRight = localStorage.getItem('playground-right-width')
  if (savedLeft) leftWidth.value = Number(savedLeft)
  if (savedRight) rightWidth.value = Number(savedRight)
})

// 保存布局状态
watch(leftWidth, (v) => localStorage.setItem('playground-left-width', String(v)))
watch(rightWidth, (v) => localStorage.setItem('playground-right-width', String(v)))
</script>

<style scoped>
.playground {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color-page);
}

.header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 20px;
  background: #fff;
  border-bottom: 1px solid var(--el-border-color-light);
}

.header h2 {
  margin: 0;
  font-size: 16px;
  flex: 1;
}

.main-content {
  display: grid;
  grid-template-columns: v-bind('leftWidth + "px"') minmax(0, 1fr) v-bind('rightWidth + "px"');
  gap: 12px;
  flex: 1;
  min-height: 0;
  padding: 12px;
  overflow: hidden;
}

.center-pane {
  min-width: 0;
  overflow: auto;
  background: #fff;
  border-radius: 8px;
}
</style>
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/views/admin/PromptPlaygroundView.vue
git commit -m "feat(frontend): add PromptPlaygroundView with resizable 3-column layout

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2.6: PromptRunListView 和 PromptRunDetailView

**Files:**
- Create: `frontend/src/views/admin/PromptRunListView.vue`
- Create: `frontend/src/views/admin/PromptRunDetailView.vue`

- [ ] **Step 1: 创建 PromptRunListView.vue**

```vue
<!-- frontend/src/views/admin/PromptRunListView.vue -->
<template>
  <div class="prompt-run-list">
    <div class="header">
      <h2>运行记录</h2>
    </div>

    <div class="filters">
      <el-select v-model="filters.status" placeholder="状态筛选" clearable style="width: 120px">
        <el-option label="成功" value="success" />
        <el-option label="失败" value="failed" />
        <el-option label="运行中" value="running" />
      </el-select>
    </div>

    <el-table :data="runs" v-loading="loading" stripe>
      <el-table-column prop="id" label="ID" width="80" />
      <el-table-column prop="template_name" label="模板" min-width="120" />
      <el-table-column prop="version_number" label="版本" width="100" />
      <el-table-column prop="model_name" label="模型" width="120" />
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="getStatusType(row.status)" size="small">
            {{ getStatusLabel(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="total_tokens" label="Tokens" width="80" />
      <el-table-column prop="latency_ms" label="耗时(ms)" width="80" />
      <el-table-column prop="created_at" label="时间" width="160">
        <template #default="{ row }">
          {{ formatTime(row.created_at) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="80" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="viewDetail(row.id)">详情</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      v-model:current-page="page"
      :page-size="20"
      :total="total"
      layout="total, prev, pager, next"
      @current-change="loadRuns"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { promptRunApi, type PromptRun } from '@/api/prompt-run'
import { STATUS_MAP } from '@/constants/status'

const router = useRouter()
const loading = ref(false)
const runs = ref<PromptRun[]>([])
const total = ref(0)
const page = ref(1)
const filters = ref({
  status: '',
})

function getStatusType(status: string) {
  return STATUS_MAP[status]?.type || 'info'
}

function getStatusLabel(status: string) {
  return STATUS_MAP[status]?.label || status
}

function formatTime(time: string) {
  return new Date(time).toLocaleString('zh-CN')
}

async function loadRuns() {
  loading.value = true
  try {
    const res = await promptRunApi.list({
      status: filters.value.status || undefined,
    })
    runs.value = res.data.results || []
    total.value = res.data.count || 0
  } finally {
    loading.value = false
  }
}

function viewDetail(id: number) {
  router.push({ name: 'admin-prompt-run-detail', params: { id } })
}

onMounted(() => {
  loadRuns()
})
</script>

<style scoped>
.prompt-run-list {
  padding: 20px;
}

.header {
  margin-bottom: 16px;
}

.header h2 {
  margin: 0;
}

.filters {
  margin-bottom: 16px;
}
</style>
```

- [ ] **Step 2: 创建 PromptRunDetailView.vue**

```vue
<!-- frontend/src/views/admin/PromptRunDetailView.vue -->
<template>
  <div class="prompt-run-detail" v-loading="loading">
    <div class="header">
      <el-button text @click="goBack">
        <el-icon><ArrowLeft /></el-icon>
        返回
      </el-button>
      <h2>运行记录 #{{ run?.id }}</h2>
      <el-tag :type="getStatusType(run?.status)">
        {{ getStatusLabel(run?.status) }}
      </el-tag>
    </div>

    <template v-if="run">
      <el-descriptions title="基本信息" :column="2" border>
        <el-descriptions-item label="模板">{{ run.template_name }}</el-descriptions-item>
        <el-descriptions-item label="版本">{{ run.version_number }}</el-descriptions-item>
        <el-descriptions-item label="模型">{{ run.model_name }}</el-descriptions-item>
        <el-descriptions-item label="供应商">{{ run.model_provider }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="getStatusType(run.status)">{{ getStatusLabel(run.status) }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="创建人">{{ run.created_by_name || '-' }}</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ formatTime(run.created_at) }}</el-descriptions-item>
        <el-descriptions-item label="耗时">{{ run.latency_ms }} ms</el-descriptions-item>
      </el-descriptions>

      <el-descriptions title="Token 使用" :column="3" border class="section">
        <el-descriptions-item label="Prompt Tokens">{{ run.prompt_tokens }}</el-descriptions-item>
        <el-descriptions-item label="Completion Tokens">{{ run.completion_tokens }}</el-descriptions-item>
        <el-descriptions-item label="Total Tokens">{{ run.total_tokens }}</el-descriptions-item>
      </el-descriptions>

      <div class="section">
        <h3>输入变量</h3>
        <pre class="code-block">{{ JSON.stringify(run.input_variables, null, 2) }}</pre>
      </div>

      <div class="section">
        <h3>渲染后 System Prompt</h3>
        <pre class="code-block">{{ run.rendered_system_prompt || '(空)' }}</pre>
      </div>

      <div class="section">
        <h3>渲染后 User Prompt</h3>
        <pre class="code-block">{{ run.rendered_user_prompt }}</pre>
      </div>

      <div class="section">
        <h3>输出</h3>
        <el-alert v-if="!run.schema_valid" type="warning" :closable="false">
          Schema 校验失败: {{ run.schema_errors?.join(', ') }}
        </el-alert>
        <pre class="code-block">{{ run.output_text || run.error_message || '(空)' }}</pre>
      </div>

      <div v-if="run.rag_info?.enabled" class="section">
        <h3>RAG 信息</h3>
        <el-descriptions :column="1" border>
          <el-descriptions-item label="检索日志 ID">{{ run.rag_info.retrieval_log_id }}</el-descriptions-item>
        </el-descriptions>
        <div v-if="run.rag_info.sources?.length">
          <h4>来源</h4>
          <div v-for="s in run.rag_info.sources" :key="s.chunk_id" class="source-item">
            {{ s.document_title }} - {{ s.section_path }}
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft } from '@element-plus/icons-vue'
import { promptRunApi, type PromptRunDetail } from '@/api/prompt-run'
import { STATUS_MAP } from '@/constants/status'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const run = ref<PromptRunDetail | null>(null)

function getStatusType(status?: string) {
  return STATUS_MAP[status || '']?.type || 'info'
}

function getStatusLabel(status?: string) {
  return STATUS_MAP[status || '']?.label || status
}

function formatTime(time?: string) {
  return time ? new Date(time).toLocaleString('zh-CN') : '-'
}

async function loadRun() {
  const id = Number(route.params.id)
  if (!id) return

  loading.value = true
  try {
    const res = await promptRunApi.get(id)
    run.value = res.data
  } finally {
    loading.value = false
  }
}

function goBack() {
  router.push({ name: 'admin-prompt-runs' })
}

onMounted(() => {
  loadRun()
})
</script>

<style scoped>
.prompt-run-detail {
  padding: 20px;
}

.header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
}

.header h2 {
  margin: 0;
  flex: 1;
}

.section {
  margin-top: 24px;
}

.section h3 {
  margin-bottom: 12px;
}

.code-block {
  background: var(--el-fill-color-light);
  padding: 12px;
  border-radius: 4px;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13px;
  max-height: 300px;
  overflow: auto;
}

.source-item {
  padding: 8px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
  margin-bottom: 8px;
}
</style>
```

- [ ] **Step 3: 提交**

```bash
git add frontend/src/views/admin/PromptRunListView.vue frontend/src/views/admin/PromptRunDetailView.vue
git commit -m "feat(frontend): add PromptRunListView and PromptRunDetailView

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2.7: 添加路由配置

**Files:**
- Modify: `frontend/src/router/index.ts`

- [ ] **Step 1: 添加 Playground 和 PromptRun 路由**

```typescript
// 在 frontend/src/router/index.ts 的 admin 路由组中添加

{
  path: 'prompts/:id/playground',
  name: 'admin-prompt-playground',
  component: () => import('@/views/admin/PromptPlaygroundView.vue'),
  meta: { title: '提示词调试台', permission: 'prompt_template.manage' },
},
{
  path: 'prompt-runs',
  name: 'admin-prompt-runs',
  component: () => import('@/views/admin/PromptRunListView.vue'),
  meta: { title: '运行记录', permission: 'prompt_template.manage' },
},
{
  path: 'prompt-runs/:id',
  name: 'admin-prompt-run-detail',
  component: () => import('@/views/admin/PromptRunDetailView.vue'),
  meta: { title: '运行记录详情', permission: 'prompt_template.manage' },
},
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/router/index.ts
git commit -m "feat(frontend): add playground and prompt-runs routes

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2.8: 阶段 2 完成提交

- [ ] **Step 1: TypeScript 编译检查**

```bash
cd frontend && npm run build
```

Expected: 编译通过，无错误

- [ ] **Step 2: 阶段 2 完成标记**

```bash
git tag phase-6.3-stage2-complete
```

---

## 阶段 3：前端组件完善与交互体验

### Task 3.1: PromptVariableEditor 组件

**Files:**
- Create: `frontend/src/components/prompt/PromptVariableEditor.vue`

- [ ] **Step 1: 创建完整的 PromptVariableEditor.vue**

```vue
<!-- frontend/src/components/prompt/PromptVariableEditor.vue -->
<template>
  <div class="variable-editor">
    <div class="header">
      <span>输入变量</span>
      <div class="actions">
        <el-button size="small" text @click="formatJson">
          <el-icon><Document /></el-icon>
          格式化
        </el-button>
        <el-button size="small" text @click="resetFromSchema">
          <el-icon><RefreshRight /></el-icon>
          从 Schema 生成
        </el-button>
      </div>
    </div>

    <el-input
      v-model="jsonText"
      type="textarea"
      :rows="8"
      placeholder='{"key": "value"}'
      @change="validateAndEmit"
    />

    <div v-if="parseError" class="error-text">
      <el-icon><WarningFilled /></el-icon>
      {{ parseError }}
    </div>

    <div v-if="missingVariables.length" class="missing-text">
      <el-icon><InfoFilled /></el-icon>
      缺失变量: {{ missingVariables.join(', ') }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { Document, RefreshRight, WarningFilled, InfoFilled } from '@element-plus/icons-vue'

interface Props {
  modelValue: Record<string, unknown>
  variableSchema?: Record<string, unknown>
  missingVariables?: string[]
}

const props = withDefaults(defineProps<Props>(), {
  missingVariables: () => [],
})

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, unknown>]
  'error': [message: string]
}>()

const jsonText = ref(JSON.stringify(props.modelValue, null, 2))
const parseError = ref('')

watch(() => props.modelValue, (v) => {
  jsonText.value = JSON.stringify(v, null, 2)
}, { deep: true })

function validateAndEmit() {
  const text = jsonText.value.trim()

  if (!text) {
    parseError.value = ''
    emit('update:modelValue', {})
    emit('error', '')
    return
  }

  try {
    const parsed = JSON.parse(text)

    // 必须是对象，不能是数组
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      parseError.value = '变量必须是 JSON 对象'
      emit('error', parseError.value)
      return
    }

    parseError.value = ''
    emit('update:modelValue', parsed)
    emit('error', '')
  } catch {
    parseError.value = 'JSON 格式错误'
    emit('error', parseError.value)
  }
}

function formatJson() {
  try {
    const parsed = JSON.parse(jsonText.value)
    jsonText.value = JSON.stringify(parsed, null, 2)
  } catch {
    // 格式化失败，忽略
  }
}

function resetFromSchema() {
  if (!props.variableSchema) return

  const properties = props.variableSchema.properties || {}
  const defaults: Record<string, unknown> = {}

  for (const [key, schema] of Object.entries(properties)) {
    const s = schema as { type?: string; default?: unknown }
    if (s.default !== undefined) {
      defaults[key] = s.default
    } else if (s.type === 'string') {
      defaults[key] = ''
    } else if (s.type === 'number' || s.type === 'integer') {
      defaults[key] = 0
    } else if (s.type === 'boolean') {
      defaults[key] = false
    } else if (s.type === 'array') {
      defaults[key] = []
    } else if (s.type === 'object') {
      defaults[key] = {}
    }
  }

  jsonText.value = JSON.stringify(defaults, null, 2)
  validateAndEmit()
}
</script>

<style scoped>
.variable-editor {
  margin-bottom: 16px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-weight: 600;
}

.actions {
  display: flex;
  gap: 4px;
}

.error-text {
  color: var(--el-color-danger);
  font-size: 12px;
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.missing-text {
  color: var(--el-color-warning);
  font-size: 12px;
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 4px;
}
</style>
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/components/prompt/PromptVariableEditor.vue
git commit -m "feat(frontend): add PromptVariableEditor with JSON object validation

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3.2: PromptModelSelector 组件

**Files:**
- Create: `frontend/src/components/prompt/PromptModelSelector.vue`

- [ ] **Step 1: 创建 PromptModelSelector.vue**

```vue
<!-- frontend/src/components/prompt/PromptModelSelector.vue -->
<template>
  <div class="model-selector">
    <el-select
      :model-value="modelValue"
      @update:model-value="$emit('update:modelValue', $event)"
      placeholder="默认 Chat 模型"
      clearable
      style="width: 100%"
    >
      <el-option
        v-for="model in models"
        :key="model.id"
        :label="model.display_name"
        :value="model.id"
      >
        <div class="model-option">
          <span>{{ model.display_name }}</span>
          <el-tag v-if="model.is_default" size="small" type="success">默认</el-tag>
        </div>
      </el-option>
    </el-select>
    <div v-if="models.length === 0" class="hint">
      未配置 Chat 模型，请先在系统设置中配置
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ModelConfig } from '@/api/admin'

defineProps<{
  modelValue: number | null
  models: ModelConfig[]
}>()

defineEmits<{
  'update:modelValue': [value: number | null]
}>()
</script>

<style scoped>
.model-selector {
  margin-bottom: 16px;
}

.model-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.hint {
  font-size: 12px;
  color: var(--el-color-warning);
  margin-top: 4px;
}
</style>
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/components/prompt/PromptModelSelector.vue
git commit -m "feat(frontend): add PromptModelSelector component

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3.3: PromptRagConfigPanel 组件

**Files:**
- Create: `frontend/src/components/prompt/PromptRagConfigPanel.vue`

- [ ] **Step 1: 创建 PromptRagConfigPanel.vue**

```vue
<!-- frontend/src/components/prompt/PromptRagConfigPanel.vue -->
<template>
  <div class="rag-config">
    <el-divider content-position="left">RAG 配置</el-divider>

    <el-form label-width="80px" size="small">
      <el-form-item label="启用 RAG">
        <el-switch v-model="localEnabled" />
      </el-form-item>

      <template v-if="localEnabled">
        <el-form-item label="知识库" required>
          <el-select
            v-model="localKnowledgeBaseIds"
            multiple
            placeholder="选择知识库"
            style="width: 100%"
          >
            <el-option
              v-for="kb in knowledgeBases"
              :key="kb.id"
              :label="kb.name"
              :value="kb.id"
            />
          </el-select>
          <div v-if="localEnabled && !localKnowledgeBaseIds.length" class="error-hint">
            请选择至少一个知识库
          </div>
        </el-form-item>

        <el-form-item label="查询文本" required>
          <el-input
            v-model="localQuery"
            placeholder="输入检索查询文本"
          />
          <div v-if="localEnabled && !localQuery.trim()" class="error-hint">
            请输入查询文本
          </div>
        </el-form-item>

        <el-form-item label="Top K">
          <el-slider v-model="localTopK" :min="1" :max="20" show-input />
        </el-form-item>

        <el-form-item label="最大 Token">
          <el-input-number
            v-model="localMaxContextTokens"
            :min="500"
            :max="16000"
            :step="500"
          />
        </el-form-item>
      </template>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface KnowledgeBase {
  id: number
  name: string
}

interface Props {
  enabled: boolean
  knowledgeBaseIds: number[]
  query: string
  topK: number
  maxContextTokens: number
  knowledgeBases: KnowledgeBase[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:enabled': [value: boolean]
  'update:knowledgeBaseIds': [value: number[]]
  'update:query': [value: string]
  'update:topK': [value: number]
  'update:maxContextTokens': [value: number]
}>()

const localEnabled = computed({
  get: () => props.enabled,
  set: (v) => emit('update:enabled', v),
})

const localKnowledgeBaseIds = computed({
  get: () => props.knowledgeBaseIds,
  set: (v) => emit('update:knowledgeBaseIds', v),
})

const localQuery = computed({
  get: () => props.query,
  set: (v) => emit('update:query', v),
})

const localTopK = computed({
  get: () => props.topK,
  set: (v) => emit('update:topK', v),
})

const localMaxContextTokens = computed({
  get: () => props.maxContextTokens,
  set: (v) => emit('update:maxContextTokens', v),
})

// 暴露校验方法
const isValid = computed(() => {
  if (!localEnabled.value) return true
  if (!localKnowledgeBaseIds.value.length) return false
  if (!localQuery.value.trim()) return false
  return true
})

defineExpose({ isValid })
</script>

<style scoped>
.rag-config {
  margin-bottom: 16px;
}

.error-hint {
  font-size: 12px;
  color: var(--el-color-danger);
  margin-top: 4px;
}
</style>
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/components/prompt/PromptRagConfigPanel.vue
git commit -m "feat(frontend): add PromptRagConfigPanel with validation

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3.4: 升级 PromptPreviewPanel（安全高亮 + Token 进度条）

**Files:**
- Modify: `frontend/src/components/prompt/PromptPreviewPanel.vue`

- [ ] **Step 1: 升级 PromptPreviewPanel.vue**

```vue
<!-- frontend/src/components/prompt/PromptPreviewPanel.vue -->
<template>
  <div class="preview-panel">
    <div class="header">
      <span>Prompt 预览</span>
      <div class="actions">
        <el-button size="small" @click="copyAll">复制全部</el-button>
      </div>
    </div>

    <!-- Token 估算 -->
    <div v-if="tokenEstimate > 0" class="token-section">
      <el-progress
        :percentage="tokenPercentage"
        :color="tokenColor"
        :stroke-width="6"
        :show-text="false"
      />
      <span class="token-text">~{{ tokenEstimate }} / {{ contextLimit }} tokens</span>
    </div>

    <div v-if="loading" class="loading">
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>渲染中...</span>
    </div>

    <template v-else>
      <!-- System Prompt -->
      <div v-if="systemPrompt" class="section">
        <div class="label">
          <span>System Prompt</span>
          <el-button size="small" text @click="copyText(systemPrompt, 'System Prompt 已复制')">
            <el-icon><CopyDocument /></el-icon>
          </el-button>
        </div>
        <pre class="prompt-text">
          <span
            v-for="(part, index) in systemPromptParts"
            :key="index"
            :class="{ 'missing-var': part.missing }"
          >{{ part.text }}</span>
        </pre>
      </div>

      <!-- User Prompt -->
      <div class="section">
        <div class="label">
          <span>User Prompt</span>
          <el-button size="small" text @click="copyText(userPrompt, 'User Prompt 已复制')">
            <el-icon><CopyDocument /></el-icon>
          </el-button>
        </div>
        <pre class="prompt-text">
          <span
            v-for="(part, index) in userPromptParts"
            :key="index"
            :class="{ 'missing-var': part.missing }"
          >{{ part.text }}</span>
        </pre>
      </div>

      <!-- RAG Context Preview -->
      <el-collapse v-if="rag?.enabled && rag.context_token_count" class="rag-collapse">
        <el-collapse-item title="RAG Context">
          <div class="rag-info">
            <span>Token 数: {{ rag.context_token_count }}</span>
            <span>来源数: {{ rag.sources?.length || 0 }}</span>
          </div>
        </el-collapse-item>
      </el-collapse>

      <!-- Missing Variables Alert -->
      <div v-if="missingVariables.length" class="missing-alert">
        <el-alert type="warning" :closable="false">
          <template #title>
            缺失变量: {{ missingVariables.join(', ') }}
          </template>
        </el-alert>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Loading, CopyDocument } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { copyText as copyTextUtil } from '@/utils/clipboard'

interface PromptPart {
  text: string
  missing: boolean
}

const CONTEXT_LIMIT = 8192

const props = defineProps<{
  systemPrompt: string
  userPrompt: string
  missingVariables: string[]
  tokenEstimate: number
  rag?: {
    enabled: boolean
    retrieval_log_id?: number | null
    sources?: unknown[]
    context_token_count?: number
  }
  loading: boolean
}>()

// 安全分段渲染（无 v-html）
function parsePromptParts(text: string, missingVars: string[]): PromptPart[] {
  if (!text) return []
  const parts: PromptPart[] = []
  const regex = /\{\{\s*(\w+)\s*\}\}/g
  let lastIndex = 0
  let match

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, match.index), missing: false })
    }
    const varName = match[1]
    parts.push({
      text: match[0],
      missing: missingVars.includes(varName),
    })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), missing: false })
  }
  return parts
}

const systemPromptParts = computed(() =>
  parsePromptParts(props.systemPrompt, props.missingVariables)
)

const userPromptParts = computed(() =>
  parsePromptParts(props.userPrompt, props.missingVariables)
)

// Token 进度
const tokenPercentage = computed(() =>
  Math.min(100, (props.tokenEstimate / CONTEXT_LIMIT) * 100)
)

const tokenColor = computed(() => {
  if (tokenPercentage.value > 100) return '#f56c6c'
  if (tokenPercentage.value > 80) return '#e6a23c'
  return '#67c23a'
})

// 复制功能
async function copyText(text: string, message: string) {
  await copyTextUtil(text, message)
}

async function copyAll() {
  const all = `# System Prompt\n${props.systemPrompt}\n\n# User Prompt\n${props.userPrompt}`
  await copyTextUtil(all, '已复制全部 Prompt')
}
</script>

<style scoped>
.preview-panel {
  padding: 16px;
  height: 100%;
  overflow: auto;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  font-weight: 600;
}

.actions {
  display: flex;
  gap: 8px;
}

.token-section {
  margin-bottom: 16px;
}

.token-text {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
  display: block;
}

.section {
  margin-bottom: 16px;
}

.label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
}

.prompt-text {
  background: var(--el-fill-color-light);
  padding: 12px;
  border-radius: 4px;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13px;
  max-height: 300px;
  overflow: auto;
  margin: 0;
}

.missing-var {
  background-color: #fef0f0;
  color: #f56c6c;
  border-radius: 2px;
  padding: 0 2px;
}

.rag-collapse {
  margin-bottom: 16px;
}

.rag-info {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.missing-alert {
  margin-top: 16px;
}

.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px;
  color: var(--el-text-color-secondary);
}
</style>
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/components/prompt/PromptPreviewPanel.vue
git commit -m "feat(frontend): upgrade PromptPreviewPanel with safe highlight and token progress

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3.5: 复制工具

**Files:**
- Create: `frontend/src/utils/clipboard.ts`

- [ ] **Step 1: 创建 clipboard.ts**

```typescript
// frontend/src/utils/clipboard.ts
import { ElMessage } from 'element-plus'

/**
 * 复制文本到剪贴板
 * 支持 navigator.clipboard 和降级方案
 */
export async function copyText(text: string, successMessage = '已复制'): Promise<boolean> {
  try {
    if (!text) {
      ElMessage.warning('内容为空')
      return false
    }

    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
    } else {
      // 降级方案：使用 textarea
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.left = '-9999px'
      textarea.style.top = '-9999px'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.focus()
      textarea.select()

      const success = document.execCommand('copy')
      document.body.removeChild(textarea)

      if (!success) {
        throw new Error('execCommand failed')
      }
    }

    ElMessage.success(successMessage)
    return true
  } catch {
    ElMessage.error('复制失败，请手动复制')
    return false
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/utils/clipboard.ts
git commit -m "feat(frontend): add clipboard utility with fallback

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3.6: 提示词管理页面入口按钮

**Files:**
- Modify: `frontend/src/views/admin/PromptListView.vue`
- Modify: `frontend/src/views/admin/PromptVersionView.vue`

- [ ] **Step 1: 在 PromptListView 添加调试台按钮**

```vue
<!-- 在 frontend/src/views/admin/PromptListView.vue 的 actions 区域添加 -->

<el-button type="primary" size="small" @click="openPlayground(selectedTemplate.id)">
  调试台
</el-button>

<!-- 在 script 中添加方法 -->
<script setup>
function openPlayground(templateId: number) {
  router.push({ name: 'admin-prompt-playground', params: { id: templateId } })
}
</script>
```

- [ ] **Step 2: 在 PromptVersionView 添加调试按钮**

```vue
<!-- 在 frontend/src/views/admin/PromptVersionView.vue 的版本操作区添加 -->

<el-button type="primary" size="small" @click="openPlayground(version.id)">
  调试
</el-button>

<!-- 在 script 中添加方法 -->
<script setup>
function openPlayground(versionId: number) {
  router.push({
    name: 'admin-prompt-playground',
    params: { id: props.templateId },
    query: { version_id: versionId }
  })
}
</script>
```

- [ ] **Step 3: 提交**

```bash
git add frontend/src/views/admin/PromptListView.vue frontend/src/views/admin/PromptVersionView.vue
git commit -m "feat(frontend): add playground entry buttons to prompt management

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3.7: 阶段 3 完成提交

- [ ] **Step 1: TypeScript 编译检查**

```bash
cd frontend && npm run build
```

Expected: 编译通过

- [ ] **Step 2: 阶段 3 完成标记**

```bash
git tag phase-6.3-stage3-complete
git tag phase-6.3-complete
```

---

## 验收清单

### 阶段 1 验收（14 条）

- [ ] 1. PromptRun 有 `metadata` 和 `created_by` 字段
- [ ] 2. `POST /api/generation/playground/render/` 返回渲染结果
- [ ] 3. `POST /api/generation/playground/run/` 创建 PromptRun 并返回结果
- [ ] 4. `GET /api/generation/prompt-runs/` 返回运行记录列表
- [ ] 5. `GET /api/generation/prompt-runs/{id}/` 返回运行记录详情
- [ ] 6. RAG 选项开启时正确调用 RetrievalService
- [ ] 7. 所有 API 使用 `prompt_template.manage` 权限
- [ ] 8. 后端测试覆盖核心逻辑
- [ ] 9. run 接口缺失变量时不调用模型
- [ ] 10. 未传 model_config_id 时自动使用默认 Chat 模型
- [ ] 11. 没有默认 Chat 模型时返回 400
- [ ] 12. RAG 开启时 PromptRun.metadata 记录 retrieval_log_id 和 retrieval_sources
- [ ] 13. RetrievalLog 能反向关联 PromptRun
- [ ] 14. PromptRun 列表支持 template_id / version_id / status 过滤

### 阶段 2 验收（14 条）

- [ ] 1. `/admin/prompts/:id/playground` 路由可访问
- [ ] 2. `/admin/prompt-runs` 路由可访问
- [ ] 3. `/admin/prompt-runs/:id` 路由可访问
- [ ] 4. 三栏布局可拖拽调整宽度
- [ ] 5. 版本选择器加载 PromptVersion 列表
- [ ] 6. 模型选择器只显示 Chat 类型模型
- [ ] 7. 点击"渲染预览"调用 render API 并显示结果
- [ ] 8. 点击"运行测试"调用 run API 并显示结果
- [ ] 9. 左右栏宽度状态保存到 localStorage
- [ ] 10. 无权限用户显示 403 页面
- [ ] 11. 所有新页面 TypeScript 编译通过
- [ ] 12. PromptPlaygroundView 不会出现横向滚动条
- [ ] 13. 三栏布局在 1366px 宽度下可用
- [ ] 14. 所有表格/选择器数据源都保证是数组

### 阶段 3 验收（26 条）

- [ ] 1. 可以从提示词管理进入调试台
- [ ] 2. 可以选择 PromptVersion
- [ ] 3. 可以选择可用 chat 模型
- [ ] 4. 可以输入变量 JSON
- [ ] 5. 非法 JSON 不会提交
- [ ] 6. 可以渲染 Prompt 预览
- [ ] 7. 缺失变量会显示
- [ ] 8. 可以运行测试
- [ ] 9. 运行后生成 PromptRun
- [ ] 10. 可以查看 raw output
- [ ] 11. 可以查看 parsed JSON
- [ ] 12. 可以查看 schema 校验结果
- [ ] 13. 可以查看 token 和耗时
- [ ] 14. 可以查看 RAG 来源
- [ ] 15. 可以复制 Prompt
- [ ] 16. 可以复制输出结果
- [ ] 17. 可以查看 PromptRun 历史
- [ ] 18. 可以打开 PromptRun 详情页
- [ ] 19. RAG 开启时可以选择知识库并注入 retrieved_knowledge
- [ ] 20. 无权限用户不能访问 Playground
- [ ] 21. Prompt 预览缺失变量高亮不使用 v-html
- [ ] 22. 变量 JSON 必须是对象
- [ ] 23. RAG 开启时必须选择知识库并填写 Query
- [ ] 24. PromptRun 历史表格数据源必须始终为数组
- [ ] 25. 状态值 success/failed/running/schema_failed 前后端一致
- [ ] 26. 三栏页面在 1366px 屏幕下不出现横向滚动条
