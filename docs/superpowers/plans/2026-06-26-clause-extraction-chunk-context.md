# 条款抽取分块上下文重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复条款抽取三个问题：(1) overwrite=True 时全删旧条款重抽；(2) 删除前后端 RAG 死代码；(3) 给 LLM 喂「全文 + 解析分块（带元数据）」双上下文，解决评分项等抽取失败。

**Architecture:** 三处核心改动：(1) `ModelConfig` 加 `context_length` 字段（管理员配置模型上下文上限）；(2) `requirement_extract_service.py` 加 overwrite 删除逻辑 + `_build_chunk_context` 方法（拼接 TenderChunk 为带元数据字符串）+ `_get_model_config` 辅助方法；(3) 7 个条款抽取模板的 user_prompt 和 variable_schema 加 `chunk_context` 变量；同时清理前后端 RAG 死代码。

**Tech Stack:** Django 4.x + DRF + PostgreSQL + Vue 3 + TypeScript + Element Plus

## Global Constraints

- 7 个条款抽取模板的「解析分块参考」段措辞必须**完全一致**（见 Task 4）
- `chunk_context` 不加入 variable_schema 的 required（某些文件可能无分块）
- `ModelConfig.context_length` 字段 `null=True, blank=True`，**不设 default**
- `context_length` 为 null 时代码 fallback 到 64000 字符
- overwrite=True 时**全删**该 tender_file 所有旧条款（不分 extraction_type）
- 不改 `DocumentTextService`（保留全文提取，仍是主要依据）
- 不动 `playground_views.py` 的 RAG（独立模块）
- 所有测试必须用 `cd backend && source .venv/bin/activate && python -m pytest --tb=short -q` 运行通过

---

## File Structure

| 文件 | 责任 | 类型 |
|------|------|------|
| `backend/apps/generation/models/model_config.py` | 加 `context_length` 字段 | 修改 |
| `backend/apps/generation/migrations/0008_add_context_length.py` | 新建迁移 | 新建 |
| `backend/apps/generation/serializers/model_serializer.py` | 3 个 serializer 加 `context_length` | 修改 |
| `backend/apps/requirements/services/requirement_extract_service.py` | overwrite 删除 + `_build_chunk_context` + `_get_model_config` + variables 加 `chunk_context` | 修改 |
| `backend/apps/generation/management/commands/seed_prompts.py` | 7 个模板 user_prompt 加分块段、variable_schema 加 `chunk_context` | 修改 |
| `backend/apps/generation/management/commands/update_requirement_extraction_prompts.py` | 同步更新 user_prompt 和 variable_schema | 修改 |
| `backend/apps/requirements/serializers.py` | 删除 `rag_options` 字段 | 修改 |
| `backend/apps/requirements/views.py` | 删除 `rag_options` 透传 | 修改 |
| `backend/apps/requirements/tasks.py` | 删除 `rag_options` 透传和 docstring | 修改 |
| `frontend/src/components/requirements/RequirementExtractToolbar.vue` | 删除 RAG UI 和相关 ref/函数 | 修改 |
| `frontend/src/components/requirements/RequirementTab.vue` | 删除 `ragOptions` 传参 | 修改 |
| `frontend/src/api/requirements.ts` | 删除 `rag_options` 字段 | 修改 |
| `backend/apps/requirements/tests/test_requirement_extraction.py` | 加 overwrite 和 chunk_context 测试 | 修改 |
| `backend/apps/generation/tests/test_update_requirement_extraction_prompts.py` | 加 chunk_context 测试 | 修改 |
| `backend/apps/generation/tests/test_seed_prompts.py` | 加 chunk_context 测试 | 修改 |

---

### Task 1: ModelConfig 加 context_length 字段 + 迁移 + serializer

**Files:**
- Modify: `backend/apps/generation/models/model_config.py`
- Create: `backend/apps/generation/migrations/0008_add_context_length.py`
- Modify: `backend/apps/generation/serializers/model_serializer.py:67-132`
- Test: `backend/apps/generation/tests/test_model_config_context_length.py`（新建）

**Interfaces:**
- Consumes: 无
- Produces: `ModelConfig.context_length` 字段（IntegerField, null=True, blank=True）；3 个 serializer 含 `context_length` 字段

- [ ] **Step 1: 写失败测试 — context_length 字段可为 null**

创建 `backend/apps/generation/tests/test_model_config_context_length.py`：

```python
# backend/apps/generation/tests/test_model_config_context_length.py
"""ModelConfig context_length 字段测试。"""

import pytest
from apps.generation.models import ModelConfig, ModelProvider


@pytest.mark.django_db
class TestModelConfigContextLength:
    """context_length 字段测试。"""

    def test_context_length_nullable(self):
        """context_length 可为 null。"""
        provider = ModelProvider.objects.create(
            key="test-provider",
            name="Test Provider",
            base_url="http://test",
        )
        config = ModelConfig.objects.create(
            provider=provider,
            model_name="test-model",
            model_type="chat",
            context_length=None,
        )
        config.refresh_from_db()
        assert config.context_length is None

    def test_context_length_can_be_set(self):
        """context_length 可设置为具体值。"""
        provider = ModelProvider.objects.create(
            key="test-provider-2",
            name="Test Provider 2",
            base_url="http://test",
        )
        config = ModelConfig.objects.create(
            provider=provider,
            model_name="test-model",
            model_type="chat",
            context_length=128000,
        )
        config.refresh_from_db()
        assert config.context_length == 128000
```

- [ ] **Step 2: 运行测试验证失败**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/generation/tests/test_model_config_context_length.py -v`
Expected: FAIL with "context_length" field error（字段未定义）

- [ ] **Step 3: 在 ModelConfig 加 context_length 字段**

打开 `backend/apps/generation/models/model_config.py`，在 `reasoning_effort` 字段之后（约第 74 行 `)` 之后）添加：

```python
    context_length = models.IntegerField(
        "上下文长度（token）",
        null=True,
        blank=True,
        help_text="模型最大上下文 token 数（如 DeepSeek 128000 或 1000000）。留空使用默认 128000。",
    )
```

- [ ] **Step 4: 生成迁移文件**

Run: `cd backend && source .venv/bin/activate && python manage.py makemigrations generation --name add_context_length`
Expected: 输出 `Migrations for 'generation': 0008_add_context_length.py - Add field context_length to modelconfig`

- [ ] **Step 5: 运行迁移**

Run: `cd backend && source .venv/bin/activate && python manage.py migrate generation`
Expected: `Applying generation.0008_add_context_length... OK`

- [ ] **Step 6: 在 3 个 serializer 加 context_length 字段**

打开 `backend/apps/generation/serializers/model_serializer.py`。

`ModelConfigSerializer.Meta.fields`（约第 74-92 行）的 `"reasoning_effort",` 之后加 `"context_length",`：

```python
        fields = [
            "id",
            "provider",
            "provider_name",
            "model_name",
            "model_type",
            "display_name",
            "temperature",
            "max_tokens",
            "top_p",
            "timeout_seconds",
            "retry_count",
            "is_default",
            "is_active",
            "enable_thinking",
            "reasoning_effort",
            "context_length",
            "created_at",
            "updated_at",
        ]
```

`ModelConfigCreateSerializer`（约第 96-111 行）的 `reasoning_effort = ...` 之后加：

```python
    context_length = serializers.IntegerField(required=False, allow_null=True)
```

`ModelConfigUpdateSerializer`（约第 114-132 行）的 `reasoning_effort = ...` 之后加：

```python
    context_length = serializers.IntegerField(required=False, allow_null=True)
```

- [ ] **Step 7: 运行测试验证通过**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/generation/tests/test_model_config_context_length.py -v`
Expected: 2 tests PASS

- [ ] **Step 8: 提交**

```bash
git add backend/apps/generation/models/model_config.py \
        backend/apps/generation/migrations/0008_add_context_length.py \
        backend/apps/generation/serializers/model_serializer.py \
        backend/apps/generation/tests/test_model_config_context_length.py
git commit -m "feat: ModelConfig 新增 context_length 字段用于配置模型上下文上限"
```

---

### Task 2: service 加 _build_chunk_context 和 _get_model_config 方法

**Files:**
- Modify: `backend/apps/requirements/services/requirement_extract_service.py`
- Test: `backend/apps/requirements/tests/test_requirement_extraction.py`

**Interfaces:**
- Consumes: Task 1 的 `ModelConfig.context_length` 字段
- Produces: `_build_chunk_context(tender_file, max_context_length) -> str` 和 `_get_model_config(model_config_id) -> ModelConfig | None`

- [ ] **Step 1: 写失败测试 — _build_chunk_context 有分块时返回带元数据字符串**

打开 `backend/apps/requirements/tests/test_requirement_extraction.py`，在 `TestRequirementExtractServiceV2` 类末尾添加：

```python
    def test_build_chunk_context_with_chunks(self):
        """有分块时返回带元数据的字符串。"""
        from apps.tender.models import TenderFile, ParsedDocument, TenderChunk
        from apps.projects.models import Project
        from unittest.mock import MagicMock

        # 用真实 TenderFile（避免外键问题）
        project = Project.objects.create(name="测试项目")
        tender_file = TenderFile.objects.create(
            project=project,
            original_name="test.docx",
            object_key="test/key.docx",
            status=TenderFile.STATUS_PARSED,
        )
        parsed_doc = ParsedDocument.objects.create(
            tender_file=tender_file,
            parser_version="v1",
            is_active=True,
        )
        TenderChunk.objects.create(
            parsed_document=parsed_doc,
            chunk_type="scoring",
            content="评分标准：技术分 50 分",
            section_path="第三章 评标办法",
            page_start=24,
            page_end=25,
        )
        TenderChunk.objects.create(
            parsed_document=parsed_doc,
            chunk_type="general",
            content="投标人须知内容",
            section_path="第二章 投标人须知",
            page_start=7,
            page_end=8,
        )

        service = RequirementExtractService()
        result = service._build_chunk_context(tender_file, max_context_length=10000)

        assert "=== 分块 #1 ===" in result
        assert "类型: scoring" in result
        assert "章节路径: 第三章 评标办法" in result
        assert "页码: 24-25" in result
        assert "评分标准：技术分 50 分" in result
        assert "=== 分块 #2 ===" in result
        assert "类型: general" in result

    def test_build_chunk_context_no_chunks(self):
        """无分块时返回空字符串。"""
        from apps.tender.models import TenderFile
        from apps.projects.models import Project
        from unittest.mock import MagicMock

        project = Project.objects.create(name="测试项目2")
        tender_file = TenderFile.objects.create(
            project=project,
            original_name="test2.docx",
            object_key="test/key2.docx",
            status=TenderFile.STATUS_PARSED,
        )

        service = RequirementExtractService()
        result = service._build_chunk_context(tender_file, max_context_length=10000)
        assert result == ""

    def test_build_chunk_context_truncates_at_limit(self):
        """超限时截断并标注剩余数。"""
        from apps.tender.models import TenderFile, ParsedDocument, TenderChunk
        from apps.projects.models import Project

        project = Project.objects.create(name="测试项目3")
        tender_file = TenderFile.objects.create(
            project=project,
            original_name="test3.docx",
            object_key="test/key3.docx",
            status=TenderFile.STATUS_PARSED,
        )
        parsed_doc = ParsedDocument.objects.create(
            tender_file=tender_file,
            parser_version="v1",
            is_active=True,
        )
        # 创建 5 个长分块
        for i in range(5):
            TenderChunk.objects.create(
                parsed_document=parsed_doc,
                chunk_type="general",
                content="A" * 200,  # 每块 200 字符
                section_path=f"章节{i}",
                page_start=i + 1,
                page_end=i + 1,
            )

        service = RequirementExtractService()
        # max_context_length=300 只能放 1 个 200 字符分块 + 元数据
        result = service._build_chunk_context(tender_file, max_context_length=300)
        assert "已截断" in result
        assert "剩余" in result

    def test_get_model_config_with_id(self):
        """_get_model_config 优先用指定 ID。"""
        from apps.generation.models import ModelConfig, ModelProvider
        from unittest.mock import MagicMock

        provider = ModelProvider.objects.create(
            key="test-getter", name="Test", base_url="http://test"
        )
        config = ModelConfig.objects.create(
            provider=provider,
            model_name="test",
            model_type="chat",
            context_length=128000,
        )

        service = RequirementExtractService()
        result = service._get_model_config(config.id)
        assert result is not None
        assert result.id == config.id
        assert result.context_length == 128000

    def test_get_model_config_fallback_to_default(self):
        """_get_model_config 无 ID 时 fallback 到默认 chat 模型。"""
        from apps.generation.models import ModelConfig, ModelProvider

        provider = ModelProvider.objects.create(
            key="test-fallback", name="Test2", base_url="http://test"
        )
        default_config = ModelConfig.objects.create(
            provider=provider,
            model_name="default-model",
            model_type="chat",
            is_default=True,
            is_active=True,
            context_length=64000,
        )

        service = RequirementExtractService()
        result = service._get_model_config(None)
        assert result is not None
        assert result.id == default_config.id
```

- [ ] **Step 2: 运行测试验证失败**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/requirements/tests/test_requirement_extraction.py::TestRequirementExtractServiceV2::test_build_chunk_context_with_chunks -v`
Expected: FAIL with "AttributeError: 'RequirementExtractService' object has no attribute '_build_chunk_context'"

- [ ] **Step 3: 在 service 加 _build_chunk_context 和 _get_model_config 方法**

打开 `backend/apps/requirements/services/requirement_extract_service.py`。

在文件顶部 imports 区，确保有：

```python
from apps.tender.models import TenderFile, TenderChunk
```

（如果 `TenderChunk` 未导入，加上。`TenderFile` 已导入。）

在 `RequirementExtractService` 类中（`_create_requirement` 方法之后、`_validate_requirement_type` 之前，约第 388 行）添加两个方法：

```python
    def _get_model_config(self, model_config_id: int | None):
        """获取模型配置。优先用指定 ID，否则用默认 chat 模型。"""
        from apps.generation.models import ModelConfig
        if model_config_id:
            mc = ModelConfig.objects.filter(pk=model_config_id, is_active=True).first()
            if mc:
                return mc
        return ModelConfig.objects.filter(is_active=True, is_default=True, model_type="chat").first()

    def _build_chunk_context(self, tender_file: TenderFile, max_context_length: int) -> str:
        """构建解析分块上下文字符串。

        Args:
            tender_file: 招标文件实例
            max_context_length: 最大字符数上限

        Returns:
            拼接好的分块上下文字符串；无分块时返回空字符串
        """
        chunks = (
            TenderChunk.objects
            .filter(
                parsed_document__tender_file=tender_file,
                parsed_document__is_active=True,
            )
            .exclude(content="")
            .order_by("page_start", "section_path", "id")
        )

        if not chunks.exists():
            return ""

        parts = []
        current_length = 0
        total_count = chunks.count()
        for idx, chunk in enumerate(chunks, 1):
            page_info = ""
            if chunk.page_start is not None and chunk.page_end is not None:
                page_info = f"{chunk.page_start}-{chunk.page_end}"
            elif chunk.page_start is not None:
                page_info = str(chunk.page_start)

            block = (
                f"=== 分块 #{idx} ===\n"
                f"类型: {chunk.chunk_type}\n"
                f"章节路径: {chunk.section_path or '(无)'}\n"
                f"页码: {page_info or '(无)'}\n"
                f"内容:\n{chunk.content}\n"
            )
            if current_length + len(block) > max_context_length:
                parts.append(f"\n[注: 已截断，剩余 {total_count - idx + 1} 个分块未显示]")
                break
            parts.append(block)
            current_length += len(block)

        return "\n".join(parts)
```

- [ ] **Step 4: 运行所有新测试验证通过**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/requirements/tests/test_requirement_extraction.py::TestRequirementExtractServiceV2 -v`
Expected: 8 tests PASS（原 5 个 + 新 5 个 - test_validate_tender_file_not_found 等 = 总 10 个，全部 PASS）

- [ ] **Step 5: 提交**

```bash
git add backend/apps/requirements/services/requirement_extract_service.py \
        backend/apps/requirements/tests/test_requirement_extraction.py
git commit -m "feat: service 加 _build_chunk_context 和 _get_model_config 方法"
```

---

### Task 3: service 加 overwrite 删除逻辑 + variables 加 chunk_context

**Files:**
- Modify: `backend/apps/requirements/services/requirement_extract_service.py`
- Test: `backend/apps/requirements/tests/test_requirement_extraction.py`

**Interfaces:**
- Consumes: Task 2 的 `_build_chunk_context` 和 `_get_model_config`
- Produces: `extract_requirements(overwrite=True)` 会删除旧条款；`_extract_single_type` 的 variables 含 `chunk_context`

- [ ] **Step 1: 写失败测试 — overwrite=True 时删除旧条款**

打开 `backend/apps/requirements/tests/test_requirement_extraction.py`，在 `TestRequirementExtractServiceV2` 类末尾添加：

```python
    def test_extract_requirements_overwrite_deletes_old(self, monkeypatch):
        """overwrite=True 时删除该文件所有旧条款。"""
        from apps.tender.models import TenderFile
        from apps.requirements.models import TenderRequirement
        from apps.projects.models import Project
        from unittest.mock import MagicMock, patch

        project = Project.objects.create(name="测试项目-overwrite")
        tender_file = TenderFile.objects.create(
            project=project,
            original_name="test-ow.docx",
            object_key="test/key-ow.docx",
            status=TenderFile.STATUS_PARSED,
        )
        # 预置 3 条旧条款
        for i in range(3):
            TenderRequirement.objects.create(
                tender_file=tender_file,
                requirement_key=f"old-key-{i}",
                content=f"旧条款 {i}",
                extraction_type="scoring",
            )
        assert TenderRequirement.objects.filter(tender_file=tender_file).count() == 3

        service = RequirementExtractService()

        # Mock 掉后续抽取流程，只验证删除逻辑
        with patch.object(service, "_validate_tender_file", return_value=tender_file):
            with patch.object(service, "_validate_extraction_types", return_value=["scoring"]):
                with patch.object(service.document_text_service, "get_document_text", return_value="文档全文"):
                    with patch.object(service, "_extract_single_type", side_effect=Exception("stop after delete")):
                        try:
                            service.extract_requirements(
                                tender_file_id=tender_file.id,
                                extraction_types=["scoring"],
                                created_by=None,
                                overwrite=True,
                            )
                        except Exception:
                            pass

        # 验证旧条款已被删除
        assert TenderRequirement.objects.filter(tender_file=tender_file).count() == 0

    def test_extract_requirements_no_overwrite_keeps_old(self):
        """overwrite=False 时保留旧条款。"""
        from apps.tender.models import TenderFile
        from apps.requirements.models import TenderRequirement
        from apps.projects.models import Project
        from unittest.mock import patch

        project = Project.objects.create(name="测试项目-no-overwrite")
        tender_file = TenderFile.objects.create(
            project=project,
            original_name="test-no-ow.docx",
            object_key="test/key-no-ow.docx",
            status=TenderFile.STATUS_PARSED,
        )
        TenderRequirement.objects.create(
            tender_file=tender_file,
            requirement_key="keep-key",
            content="保留的旧条款",
            extraction_type="scoring",
        )

        service = RequirementExtractService()
        with patch.object(service, "_validate_tender_file", return_value=tender_file):
            with patch.object(service, "_validate_extraction_types", return_value=["scoring"]):
                with patch.object(service.document_text_service, "get_document_text", return_value="文档全文"):
                    with patch.object(service, "_extract_single_type", side_effect=Exception("stop")):
                        try:
                            service.extract_requirements(
                                tender_file_id=tender_file.id,
                                extraction_types=["scoring"],
                                created_by=None,
                                overwrite=False,
                            )
                        except Exception:
                            pass

        # 验证旧条款保留
        assert TenderRequirement.objects.filter(tender_file=tender_file).count() == 1
```

- [ ] **Step 2: 运行测试验证失败**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/requirements/tests/test_requirement_extraction.py::TestRequirementExtractServiceV2::test_extract_requirements_overwrite_deletes_old -v`
Expected: FAIL（旧条款没被删除，count 仍是 3）

- [ ] **Step 3: 在 extract_requirements 加 overwrite 删除逻辑**

打开 `backend/apps/requirements/services/requirement_extract_service.py`，找到 `extract_requirements` 方法（约第 84-100 行）。

在 `_validate_extraction_types` 之后、`RequirementExtractionRun.objects.create` 之前（约第 100 行）添加：

```python
        # 2.5 overwrite=True 时全删旧条款
        if overwrite:
            deleted_count, _ = TenderRequirement.objects.filter(
                tender_file=tender_file
            ).delete()
            logger.info(
                "Overwrite mode: deleted %s existing requirements for tender_file=%s",
                deleted_count, tender_file_id,
            )
            if progress_callback:
                progress_callback(8, f"已清理 {deleted_count} 条旧条款")
```

确保文件顶部有 `from apps.requirements.models import TenderRequirement` import（如果还没有）。

- [ ] **Step 4: 运行 overwrite 测试验证通过**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/requirements/tests/test_requirement_extraction.py::TestRequirementExtractServiceV2::test_extract_requirements_overwrite_deletes_old apps/requirements/tests/test_requirement_extraction.py::TestRequirementExtractServiceV2::test_extract_requirements_no_overwrite_keeps_old -v`
Expected: 2 tests PASS

- [ ] **Step 5: 在 _extract_single_type 的 variables 加 chunk_context**

打开 `backend/apps/requirements/services/requirement_extract_service.py`，找到 `_extract_single_type` 方法（约第 217-235 行）。

把 `# 准备输入变量` 部分从：

```python
        # 准备输入变量
        variables = {
            "document_text": document_text,
            "extraction_type": extraction_type,
            "extraction_type_name": EXTRACTION_TYPE_NAMES.get(extraction_type, extraction_type),
        }
```

改为：

```python
        # 获取模型配置（用于 context_length）
        model_config = self._get_model_config(model_config_id)

        # 构建解析分块上下文（辅助参考）
        max_context_chars = int(model_config.context_length * 0.5) if model_config and model_config.context_length else 64000
        chunk_context = self._build_chunk_context(tender_file, max_context_chars)

        # 准备输入变量
        variables = {
            "document_text": document_text,
            "chunk_context": chunk_context,
            "extraction_type": extraction_type,
            "extraction_type_name": EXTRACTION_TYPE_NAMES.get(extraction_type, extraction_type),
        }
```

- [ ] **Step 6: 运行所有 TestRequirementExtractServiceV2 测试验证通过**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/requirements/tests/test_requirement_extraction.py::TestRequirementExtractServiceV2 -v`
Expected: 所有测试 PASS

- [ ] **Step 7: 提交**

```bash
git add backend/apps/requirements/services/requirement_extract_service.py \
        backend/apps/requirements/tests/test_requirement_extraction.py
git commit -m "feat: service 加 overwrite 删除逻辑和 chunk_context 传参"
```

---

### Task 4: seed_prompts.py 更新 7 个模板的 user_prompt 和 variable_schema

**Files:**
- Modify: `backend/apps/generation/management/commands/seed_prompts.py`
- Test: `backend/apps/generation/tests/test_seed_prompts.py`

**Interfaces:**
- Consumes: 无
- Produces: 7 个模板的 user_prompt 含 `{{ chunk_context }}`，variable_schema 含 `chunk_context` 属性

- [ ] **Step 1: 在文件顶部定义解析分块参考段常量**

打开 `backend/apps/generation/management/commands/seed_prompts.py`，在 `CLAUSE_TITLE_RULES` 常量之后（约第 25 行）添加：

```python
# 解析分块参考段说明 —— 7 个条款抽取模板共用
CHUNK_CONTEXT_PROMPT_SECTION = """**解析分块参考**（带章节路径和页码的结构化分块，辅助定位）：
{{ chunk_context }}"""
```

- [ ] **Step 2: 修改 7 个模板的 user_prompt**

对 7 个条款抽取模板（`requirement_extraction.default` / `_scoring` / `_mandatory` / `_qualification` / `_commercial` / `_technical` / `_submission`），把每个 user_prompt 中的：

```
**文档内容**：
{{ document_text }}
```

改为：

```
**文档内容**（主要依据，完整全文）：
{{ document_text }}

{{ CHUNK_CONTEXT_PROMPT_SECTION }}
```

注意：
- `requirement_extraction.default` 模板的 user_prompt 用 `**分块内容**：{{ chunk_content }}`（不是 `**文档内容**`），它的输入是分块不是全文——**这个模板不改 user_prompt**，只在 variable_schema 加 `chunk_context`（虽然不传，但保持 schema 一致）
- 实际改的是 6 个 V2 模板（scoring/mandatory/qualification/commercial/technical/submission）

对每个 V2 模板，把：

```python
"user_prompt": """请从以下招标文件中抽取所有XX：

**文档内容**：
{{ document_text }}

**抽取类型**：{{ extraction_type_name }}

请抽取所有XX，以 JSON 格式输出。""",
```

改为：

```python
"user_prompt": """请从以下招标文件中抽取所有XX：

**文档内容**（主要依据，完整全文）：
{{ document_text }}

""" + CHUNK_CONTEXT_PROMPT_SECTION + """

**抽取类型**：{{ extraction_type_name }}

请抽取所有XX，以 JSON 格式输出。""",
```

- [ ] **Step 3: 修改 7 个模板的 variable_schema**

对 7 个模板的 `variable_schema.properties`，在 `"document_text": {"type": "string"},` 之后添加：

```python
"chunk_context": {"type": "string", "description": "解析分块参考（带章节路径和页码的结构化分块）"},
```

注意 `requirement_extraction.default` 的 variable_schema 用的是 `chunk_content` 不是 `document_text`，在那里也加 `chunk_context`。

- [ ] **Step 4: 写失败测试 — 7 个模板 user_prompt 含 chunk_context**

打开 `backend/apps/generation/tests/test_seed_prompts.py`，在 `TestSeedPrompts` 类末尾添加：

```python
    def test_seed_prompts_clause_user_prompt_has_chunk_context(self):
        """6 个 V2 条款抽取模板的 user_prompt 含 {{ chunk_context }}。"""
        call_command("seed_prompts")

        v2_keys = [
            "requirement_extraction_scoring.default",
            "requirement_extraction_mandatory.default",
            "requirement_extraction_qualification.default",
            "requirement_extraction_commercial.default",
            "requirement_extraction_technical.default",
            "requirement_extraction_submission.default",
        ]
        for key in v2_keys:
            template = PromptTemplate.objects.get(key=key)
            published = PromptVersion.objects.filter(
                template=template, status=PromptVersionStatus.PUBLISHED
            ).first()
            assert "{{ chunk_context }}" in published.user_prompt, \
                f"模板 {key} 的 user_prompt 缺少 chunk_context 变量"
            assert "解析分块参考" in published.user_prompt, \
                f"模板 {key} 的 user_prompt 缺少解析分块参考段"

    def test_seed_prompts_clause_variable_schema_has_chunk_context(self):
        """7 个条款抽取模板的 variable_schema 含 chunk_context 属性。"""
        call_command("seed_prompts")

        clause_keys = [
            "requirement_extraction.default",
            "requirement_extraction_scoring.default",
            "requirement_extraction_mandatory.default",
            "requirement_extraction_qualification.default",
            "requirement_extraction_commercial.default",
            "requirement_extraction_technical.default",
            "requirement_extraction_submission.default",
        ]
        for key in clause_keys:
            template = PromptTemplate.objects.get(key=key)
            published = PromptVersion.objects.filter(
                template=template, status=PromptVersionStatus.PUBLISHED
            ).first()
            schema = published.variable_schema or {}
            properties = schema.get("properties", {})
            assert "chunk_context" in properties, \
                f"模板 {key} 的 variable_schema 缺少 chunk_context 属性"
```

- [ ] **Step 5: 运行测试验证通过**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/generation/tests/test_seed_prompts.py -v`
Expected: 所有测试 PASS

- [ ] **Step 6: 提交**

```bash
git add backend/apps/generation/management/commands/seed_prompts.py \
        backend/apps/generation/tests/test_seed_prompts.py
git commit -m "feat: seed_prompts 7 个模板 user_prompt 加解析分块参考段"
```

---

### Task 5: update 命令同步更新 user_prompt 和 variable_schema

**Files:**
- Modify: `backend/apps/generation/management/commands/update_requirement_extraction_prompts.py`
- Test: `backend/apps/generation/tests/test_update_requirement_extraction_prompts.py`

**Interfaces:**
- Consumes: Task 4 的 user_prompt 和 variable_schema 格式
- Produces: update 命令执行后，v2.0 的 user_prompt 含 `{{ chunk_context }}`，variable_schema 含 `chunk_context`

- [ ] **Step 1: 写失败测试 — v2.0 user_prompt 和 variable_schema 含 chunk_context**

打开 `backend/apps/generation/tests/test_update_requirement_extraction_prompts.py`，在 `TestUpdateRequirementExtractionPrompts` 类末尾添加：

```python
    def test_v2_user_prompt_contains_chunk_context(self):
        """v2.0 的 user_prompt 含 {{ chunk_context }}（6 个 V2 模板）。"""
        call_command("update_requirement_extraction_prompts")

        v2_keys = [
            "requirement_extraction_scoring.default",
            "requirement_extraction_mandatory.default",
            "requirement_extraction_qualification.default",
            "requirement_extraction_commercial.default",
            "requirement_extraction_technical.default",
            "requirement_extraction_submission.default",
        ]
        for key in v2_keys:
            template = PromptTemplate.objects.get(key=key)
            v2 = PromptVersion.objects.get(template=template, version="2.0")
            assert "{{ chunk_context }}" in v2.user_prompt, \
                f"模板 {key} 的 v2.0 user_prompt 缺少 chunk_context 变量"
            assert "解析分块参考" in v2.user_prompt, \
                f"模板 {key} 的 v2.0 user_prompt 缺少解析分块参考段"

    def test_v2_variable_schema_has_chunk_context(self):
        """v2.0 的 variable_schema 含 chunk_context 属性。"""
        call_command("update_requirement_extraction_prompts")

        clause_keys = [
            "requirement_extraction.default",
            "requirement_extraction_scoring.default",
            "requirement_extraction_mandatory.default",
            "requirement_extraction_qualification.default",
            "requirement_extraction_commercial.default",
            "requirement_extraction_technical.default",
            "requirement_extraction_submission.default",
        ]
        for key in clause_keys:
            template = PromptTemplate.objects.get(key=key)
            v2 = PromptVersion.objects.get(template=template, version="2.0")
            schema = v2.variable_schema or {}
            properties = schema.get("properties", {})
            assert "chunk_context" in properties, \
                f"模板 {key} 的 v2.0 variable_schema 缺少 chunk_context"
```

- [ ] **Step 2: 运行测试验证失败**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/generation/tests/test_update_requirement_extraction_prompts.py::TestUpdateRequirementExtractionPrompts::test_v2_user_prompt_contains_chunk_context -v`
Expected: FAIL（v2.0 user_prompt 不含 chunk_context）

- [ ] **Step 3: 修改 update 命令加 chunk_context 处理逻辑**

打开 `backend/apps/generation/management/commands/update_requirement_extraction_prompts.py`。

在 `CLAUSE_TITLE_RULES` 常量之后（约第 25 行）添加：

```python
# 解析分块参考段说明 —— 与 seed_prompts.py 保持一致
CHUNK_CONTEXT_PROMPT_SECTION = """**解析分块参考**（带章节路径和页码的结构化分块，辅助定位）：
{{ chunk_context }}"""
```

在 `handle` 方法中，找到 `# 在 system_prompt 末尾追加标题规则段` 之后（约第 110 行），添加 user_prompt 更新逻辑：

```python
            # 更新 user_prompt：插入解析分块参考段（如果尚未包含）
            if "{{ chunk_context }}" not in base_user_prompt:
                # 在 {{ document_text }} 之后插入分块段
                if "{{ document_text }}" in base_user_prompt:
                    new_user_prompt = base_user_prompt.replace(
                        "{{ document_text }}",
                        "{{ document_text }}\n\n" + CHUNK_CONTEXT_PROMPT_SECTION,
                    )
                else:
                    # 旧版 requirement_extraction.default 用 chunk_content，不插入分块段
                    new_user_prompt = base_user_prompt
            else:
                new_user_prompt = base_user_prompt
```

然后在创建/更新 PromptVersion 时，把 `existing_v2.user_prompt = base_user_prompt` 改为 `existing_v2.user_prompt = new_user_prompt`，`PromptVersion.objects.create(..., user_prompt=base_user_prompt, ...)` 改为 `user_prompt=new_user_prompt`。

同样在 `# 更新 output_schema` 之后，添加 variable_schema 更新逻辑：

```python
            # 更新 variable_schema：加 chunk_context 属性（如果尚未包含）
            new_variable_schema = self._update_variable_schema(base_variable_schema)
```

并在 `# 获取当前 published 版本作为基础` 部分加上 `base_variable_schema` 提取：

```python
            if current_published:
                base_system_prompt = current_published.system_prompt
                base_user_prompt = current_published.user_prompt
                base_output_schema = current_published.output_schema or {}
                base_variable_schema = current_published.variable_schema or {}
            else:
                self.stdout.write(self.style.WARNING(
                    f"模板 {tmpl_data['key']} 无 published 版本，跳过"
                ))
                skipped_count += 1
                continue
```

在 PromptVersion 创建/更新时加上 `variable_schema=new_variable_schema`。

在类末尾添加 `_update_variable_schema` 方法：

```python
    def _update_variable_schema(self, schema: dict) -> dict:
        """更新 variable_schema：加 chunk_context 属性。"""
        new_schema = copy.deepcopy(schema)
        properties = new_schema.get("properties", {})
        if "chunk_context" not in properties:
            properties["chunk_context"] = {
                "type": "string",
                "description": "解析分块参考（带章节路径和页码的结构化分块）",
            }
        return new_schema
```

- [ ] **Step 4: 运行测试验证通过**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/generation/tests/test_update_requirement_extraction_prompts.py -v`
Expected: 所有测试 PASS（原 5 个 + 新 2 个）

- [ ] **Step 5: 试运行 update 命令验证幂等**

Run: `cd backend && source .venv/bin/activate && python manage.py update_requirement_extraction_prompts`
Expected: 输出 7 个「已发布 ... v2.0」成功消息

再运行一次：
Run: `cd backend && source .venv/bin/activate && python manage.py update_requirement_extraction_prompts`
Expected: 同样输出 7 个成功消息，幂等

- [ ] **Step 6: 提交**

```bash
git add backend/apps/generation/management/commands/update_requirement_extraction_prompts.py \
        backend/apps/generation/tests/test_update_requirement_extraction_prompts.py
git commit -m "feat: update 命令同步更新 user_prompt 加 chunk_context 和 variable_schema"
```

---

### Task 6: 后端清理 RAG 死代码

**Files:**
- Modify: `backend/apps/requirements/serializers.py`
- Modify: `backend/apps/requirements/views.py`
- Modify: `backend/apps/requirements/tasks.py`

**Interfaces:**
- Consumes: 无
- Produces: 后端无 `rag_options` 参数

- [ ] **Step 1: 删除 serializer 的 rag_options 字段**

打开 `backend/apps/requirements/serializers.py`，找到 `RequirementExtractSerializer`（约第 19-45 行）。

删除：

```python
    rag_options = serializers.DictField(
        required=False,
        allow_null=True,
        help_text="RAG 配置",
    )
```

- [ ] **Step 2: 删除 views 的 rag_options 透传**

打开 `backend/apps/requirements/views.py`，找到 `RequirementExtractView.post`（约第 37-111 行）。

在 `input_payload`（约第 85-92 行）中删除 `"rag_options": serializer.validated_data.get("rag_options"),`：

```python
            input_payload={
                "mode": serializer.validated_data.get("mode", "hybrid"),
                "force": serializer.validated_data.get("force", False),
                "model_config_id": serializer.validated_data.get("model_config_id"),
                "prompt_version_id": serializer.validated_data.get("prompt_version_id"),
            },
```

在 `extract_requirements_task.apply_async` 的 args 中（约第 96-105 行）删除 `"rag_options": serializer.validated_data.get("rag_options"),`：

```python
        extract_requirements_task.apply_async(
            args=[task.id, file_id, {
                "mode": serializer.validated_data.get("mode", "hybrid"),
                "force": serializer.validated_data.get("force", False),
                "model_config_id": serializer.validated_data.get("model_config_id"),
                "prompt_version_id": serializer.validated_data.get("prompt_version_id"),
            }],
            queue="parse_queue",
        )
```

- [ ] **Step 3: 删除 tasks 的 rag_options docstring**

打开 `backend/apps/requirements/tasks.py`，找到 `extract_requirements_task` 的 docstring（约第 156-168 行）。

删除：
```
            - rag_options: RAG 配置
```

同样检查 `extract_requirements_v2` 的 docstring（约第 64-78 行），如果有 `rag_options` 说明也删除。

- [ ] **Step 4: 运行后端测试验证未破坏**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/requirements/tests/ --tb=short -q`
Expected: 所有测试 PASS（除了已知的预存失败 `TestGenerateRequirementKey`）

- [ ] **Step 5: 提交**

```bash
git add backend/apps/requirements/serializers.py \
        backend/apps/requirements/views.py \
        backend/apps/requirements/tasks.py
git commit -m "refactor: 删除条款抽取的 RAG 死代码"
```

---

### Task 7: 前端清理 RAG UI 和 API 字段

**Files:**
- Modify: `frontend/src/components/requirements/RequirementExtractToolbar.vue`
- Modify: `frontend/src/components/requirements/RequirementTab.vue`
- Modify: `frontend/src/api/requirements.ts`

**Interfaces:**
- Consumes: 无
- Produces: 前端无 RAG 相关 UI 和字段

- [ ] **Step 1: 删除 RequirementExtractToolbar.vue 的 RAG UI 和 ref**

打开 `frontend/src/components/requirements/RequirementExtractToolbar.vue`。

删除 RAG 开关 checkbox（约第 60-62 行）：

```html
        <!-- RAG 开关 -->
        <el-checkbox v-model="ragEnabled" :disabled="loading">启用 RAG</el-checkbox>
```

删除整个 RAG 配置面板（约第 83-108 行）：

```html
    <!-- RAG 配置面板 -->
    <div v-if="ragEnabled" class="rag-config">
      ...
    </div>
```

删除 script 部分的 RAG 相关 ref 和函数：
- `ragEnabled` ref（约第 162 行）
- `ragConfig` ref（约第 163-168 行）
- `knowledgeBases` ref（约第 169 行）
- `loadKnowledgeBases` 函数（约第 217-225 行）
- `loadKnowledgeBases()` 调用（约第 249 行）
- `KnowledgeBase` interface（如果有，约第 124-127 行）
- `RagOptions` interface（如果有）

在 `handleExtract` 函数中（约第 229-244 行）删除 `ragOptions` 字段：

```typescript
function handleExtract(force: boolean) {
  if (!canExtract.value) return

  emit('extract', {
    force,
    modelConfigId: selectedModelId.value,
    promptVersionId: selectedPromptVersionId.value,
  })
}
```

更新 `ExtractPayload` interface 删除 `ragOptions` 字段。

- [ ] **Step 2: 删除 RequirementTab.vue 的 ragOptions 传参**

打开 `frontend/src/components/requirements/RequirementTab.vue`。

在 `handleExtract` 中（约第 207-213 行）删除 `rag_options`：

```typescript
const res = await extractRequirements(props.tenderFileId, {
  mode: 'hybrid',
  force: payload.force,
  model_config_id: payload.modelConfigId,
  prompt_version_id: payload.promptVersionId,
})
```

删除 `ExtractPayload` interface 中的 `ragOptions: RagOptions`（约第 96 行）和 `RagOptions` import（如果有）。

- [ ] **Step 3: 删除 requirements.ts 的 rag_options 字段**

打开 `frontend/src/api/requirements.ts`。

删除 `RagOptions` interface 和 `RequirementExtractPayload.rag_options: RagOptions`（约第 21 行）。

- [ ] **Step 4: 构建前端验证**

Run: `cd frontend && npm run build`
Expected: 构建成功，无 TypeScript 错误

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/requirements/RequirementExtractToolbar.vue \
        frontend/src/components/requirements/RequirementTab.vue \
        frontend/src/api/requirements.ts
git commit -m "refactor: 前端删除条款抽取 RAG UI 和 API 字段"
```

---

### Task 8: 全量测试 + Docker 部署验证

**Files:**
- 无新建/修改，仅运行测试和部署

- [ ] **Step 1: 运行受影响的测试**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/requirements/tests/test_requirement_extraction.py apps/generation/tests/test_seed_prompts.py apps/generation/tests/test_update_requirement_extraction_prompts.py apps/generation/tests/test_model_config_context_length.py --tb=short -q`
Expected: 所有测试 PASS

- [ ] **Step 2: 运行 backend 全量测试套件**

Run: `cd backend && source .venv/bin/activate && python -m pytest --tb=line -q`
Expected: 预存失败仍存在（TestGenerateRequirementKey 等），但本任务相关测试全部 PASS

- [ ] **Step 3: 构建前端**

Run: `cd frontend && npm run build`
Expected: 构建成功

- [ ] **Step 4: 重建 Docker 镜像**

Run: `cd /home/newaibook/ai-bid-generator && docker compose build web worker beat`
Expected: 镜像构建成功

- [ ] **Step 5: 重启服务 + 运行迁移**

Run:
```bash
cd /home/newaibook/ai-bid-generator
docker compose up -d web worker beat
sleep 5
docker exec ai-bid-generator-web-1 python manage.py migrate
```
Expected: 迁移成功应用 `0008_add_context_length`

- [ ] **Step 6: 运行 update 命令更新已有部署的 prompt 模板**

Run: `docker exec ai-bid-generator-web-1 python manage.py update_requirement_extraction_prompts`
Expected: 输出 7 个「已发布 ... v2.0」成功消息

- [ ] **Step 7: 重启 nginx 并验证服务**

Run:
```bash
docker compose restart nginx
sleep 3
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost/api/auth/login -X POST -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}'
```
Expected: HTTP 200

- [ ] **Step 8: 通过 API 配置 DeepSeek 模型的 context_length**

Run:
```bash
TOKEN=$(curl -s http://localhost/api/auth/login -X POST -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['access'])")
# 查询当前模型配置
curl -s http://localhost/api/generation/model-configs/ -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | head -30
```
Expected: 看到 DeepSeek 模型配置的 id

然后调用 update API 设置 context_length（替换 `<model_id>` 为实际 ID）：

```bash
curl -s -X PATCH http://localhost/api/generation/model-configs/<model_id>/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"context_length": 128000}'
```
Expected: 返回 200，含 `"context_length": 128000`

- [ ] **Step 9: 验证重新抽取**

通过前端 UI 或 API 触发文件 28 的"强制重新抽取"，等待任务完成后查询 scoring 条款数：

```bash
docker exec ai-bid-generator-web-1 python manage.py shell -c "
from apps.requirements.models import TenderRequirement
from django.db.models import Count
qs = TenderRequirement.objects.filter(tender_file_id=28).values('extraction_type').annotate(c=Count('id'))
for r in qs: print(r)
print('total:', TenderRequirement.objects.filter(tender_file_id=28).count())
"
```
Expected: scoring 类型有条款（不再是 0），总数合理

- [ ] **Step 10: 最终提交（如有未提交的修复）**

```bash
git status
# 如有未提交的修复
git add -A
git commit -m "fix: 测试验证后的最终修复"
```
