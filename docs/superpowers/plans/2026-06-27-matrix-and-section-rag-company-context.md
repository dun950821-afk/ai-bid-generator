# 矩阵与正文生成关联公司材料包与RAG知识库 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让矩阵生成阶段注入公司材料元数据、正文生成阶段按大纲绑定知识库做 HYBRID 检索并记录可追溯来源，引入 RetrievalOrchestrator 收敛 RAG 检索编排。

**Architecture:** 三层职责——`RetrievalService` 底层检索原语（向量/全文/单通道 RRF），`RetrievalOrchestrator` 业务编排（通道规划/查询词/跨通道 weighted RRF 融合/去重/溯源），`RagService` 降级为兼容薄封装。矩阵阶段调 `collect_metadata_snapshot`（零向量），正文阶段调 `retrieve_for_section`（HYBRID 检索）。

**Tech Stack:** Django 4 + DRF + Celery + PostgreSQL(pgvector) + Vue 3 + TypeScript + Element Plus

## Global Constraints

- 后端测试运行: `cd backend && source .venv/bin/activate && python -m pytest --tb=short -q`
- 后端测试用 `@pytest.mark.django_db`，`ProjectMember.project_role` 必须用 `ProjectRole` 实例
- 公开菜单项含 `dashboard / projects / templates`
- 部署流程: `cd frontend && npm run build` → `docker compose build web worker beat` → `docker compose up -d web worker beat` → `docker exec ai-bid-generator-web-1 python manage.py migrate` → `docker compose restart nginx`
- 通道常量对齐 `KnowledgeBaseType`: `company_profile→company_info / case_library→project_case / qualification→certificate / product→company_info / bid_history→historical_bid / technical_solution→historical_bid`
- `RetrievalService` 不感知 `rag_channel`（channel 是 Orchestrator 推导的业务属性）
- 矩阵阶段零向量调用；正文阶段才调向量检索
- `rag_sources` 记录最终进 prompt 的来源（Strategy 裁剪后反推），不是 Orchestrator 原始 retrieved
- `_context_to_legacy_dict` 基于 `context.fused` 分组，不是 `by_channel`
- 警告不写 `GenerationTask.error_message`，改写 `GenerationTask.result` + `generation_meta`

---

## File Structure

**新建文件:**
- `backend/apps/knowledge/services/retrieval_orchestrator.py` — RetrievalOrchestrator + 数据类
- `backend/apps/knowledge/services/retrieval_constants.py` — 通道映射常量
- `backend/apps/outline/services/content_matrix_context_builder.py` — build_company_context_block
- `backend/apps/outline/models/outline_knowledge_base.py` — OutlineKnowledgeBase 中间表
- `backend/apps/outline/models/section_manual_source.py` — SectionManualSource 表
- `backend/apps/outline/serializers/outline_kb_serializer.py` — KB 绑定序列化器
- `backend/apps/outline/views/outline_kb_views.py` — KB 绑定视图集 + 手动检索视图
- `frontend/src/components/outline/OutlineKbBindingDialog.vue` — KB 多选绑定弹窗
- `frontend/src/components/outline/SectionReferenceSources.vue` — 生成参考来源 Tab
- `frontend/src/components/outline/SectionManualRetrieval.vue` — 手动检索 Tab
- `frontend/src/api/outlineKb.ts` — KB 绑定 + 手动检索 API
- 各 Task 对应的 test 文件

**修改文件:**
- `backend/apps/knowledge/models/knowledge_base.py` — 加 rag_channel 字段
- `backend/apps/knowledge/models/retrieval_log.py` — 加 retrieval_run_id / trace_meta / fallback_reason
- `backend/apps/knowledge/services/retrieval_service.py` — 默认 HYBRID + 降级 + retrieval_run_id/trace_meta
- `backend/apps/outline/models/__init__.py` — 导出新模型
- `backend/apps/outline/models/section_generation_record.py` — 加 rag_sources / generation_meta
- `backend/apps/outline/models/section_version.py` — 加 generated_from_record_id
- `backend/apps/outline/services/rag_service.py` — 降级为兼容层
- `backend/apps/outline/services/section_generation_service.py` — 改用 Orchestrator
- `backend/apps/outline/tasks.py` — generate_content_matrix_task 接入 metadata_snapshot
- `backend/apps/outline/urls.py` — 注册新视图
- `backend/config/settings.py` — 新增配置项
- `frontend/src/views/outline/OutlineDetailView.vue` — KB 关联区域 + 生成引导

---

### Task 1: 数据模型 - KnowledgeBase.rag_channel + RetrievalLog 字段

**Files:**
- Modify: `backend/apps/knowledge/models/knowledge_base.py`
- Modify: `backend/apps/knowledge/models/retrieval_log.py`
- Modify: `backend/apps/knowledge/constants.py` — 加 RagChannel 常量
- Test: `backend/apps/knowledge/tests/test_models.py`

**Interfaces:**
- Produces: `KnowledgeBase.rag_channel` (CharField, choices, blank, default=""), `RetrievalLog.retrieval_run_id` (CharField, db_index), `RetrievalLog.trace_meta` (JSONField), `RetrievalLog.fallback_reason` (CharField), `RagChannel` 常量类

- [ ] **Step 1: Write the failing test**

追加到 `backend/apps/knowledge/tests/test_models.py`:

```python
import pytest
from apps.knowledge.models import KnowledgeBase, RetrievalLog


@pytest.mark.django_db
class TestKnowledgeBaseRagChannel:
    def test_rag_channel_default_empty(self, django_user_model):
        user = django_user_model.objects.create_user(username="u", password="p")
        kb = KnowledgeBase.objects.create(
            name="test", kb_type="company_profile", created_by=user
        )
        assert kb.rag_channel == ""

    def test_rag_channel_with_choices(self, django_user_model):
        user = django_user_model.objects.create_user(username="u", password="p")
        kb = KnowledgeBase.objects.create(
            name="test", kb_type="company_profile",
            rag_channel="company_info", created_by=user
        )
        assert kb.rag_channel == "company_info"


@pytest.mark.django_db
class TestRetrievalLogTraceFields:
    def test_retrieval_run_id_default_empty(self, django_user_model):
        user = django_user_model.objects.create_user(username="u", password="p")
        log = RetrievalLog.objects.create(
            query="test", knowledge_bases=[], filters={},
            top_k=5, retrieval_mode="hybrid", retrieved_chunks=[],
            latency_ms=10, created_by=user,
        )
        assert log.retrieval_run_id == ""
        assert log.trace_meta == {}
        assert log.fallback_reason == ""
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest apps/knowledge/tests/test_models.py::TestKnowledgeBaseRagChannel -v`
Expected: FAIL with "KnowledgeBase has no attribute 'rag_channel'"

- [ ] **Step 3: Add RagChannel to constants**

在 `backend/apps/knowledge/constants.py` 末尾追加:

```python
class RagChannel:
    """RAG 通道（覆盖 kb_type 默认映射）。"""

    COMPANY_INFO = "company_info"
    HISTORICAL_BID = "historical_bid"
    PROJECT_CASE = "project_case"
    CERTIFICATE = "certificate"
    PERSONNEL = "personnel"

    CHOICES = [
        (COMPANY_INFO, "公司信息"),
        (HISTORICAL_BID, "历史标书"),
        (PROJECT_CASE, "项目案例"),
        (CERTIFICATE, "资质证书"),
        (PERSONNEL, "人员资料"),
        ("", "按 kb_type 推断"),
    ]
```

- [ ] **Step 4: Add rag_channel to KnowledgeBase**

在 `backend/apps/knowledge/models/knowledge_base.py` 的 `KnowledgeBase` 类 `metadata` 字段后追加:

```python
    rag_channel = models.CharField(
        "RAG通道",
        max_length=32,
        blank=True,
        default="",
        choices=RagChannel.CHOICES,
        help_text="覆盖 kb_type 默认通道映射，留空则按 kb_type 推断",
    )
```

并在文件顶部 import 区加 `RagChannel`:

```python
from apps.knowledge.constants import KnowledgeBaseType, KnowledgeBaseVisibility, RagChannel
```

- [ ] **Step 5: Add trace fields to RetrievalLog**

读 `backend/apps/knowledge/models/retrieval_log.py` 确认现有字段后，在 `RetrievalLog` 类末尾（`class Meta` 之前）追加:

```python
    retrieval_run_id = models.CharField(
        "检索运行ID",
        max_length=64,
        blank=True,
        default="",
        db_index=True,
    )
    trace_meta = models.JSONField("trace元数据", default=dict, blank=True)
    fallback_reason = models.CharField(
        "降级原因",
        max_length=64,
        blank=True,
        default="",
    )
```

- [ ] **Step 6: Generate and run migration**

Run:
```bash
cd backend && source .venv/bin/activate
python manage.py makemigrations knowledge --name add_rag_channel_and_trace_fields
python manage.py migrate
```
Expected: migration created and applied

- [ ] **Step 7: Run test to verify it passes**

Run: `cd backend && python -m pytest apps/knowledge/tests/test_models.py::TestKnowledgeBaseRagChannel apps/knowledge/tests/test_models.py::TestRetrievalLogTraceFields -v`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add backend/apps/knowledge/models/knowledge_base.py backend/apps/knowledge/models/retrieval_log.py backend/apps/knowledge/constants.py backend/apps/knowledge/migrations/ backend/apps/knowledge/tests/test_models.py
git commit -m "feat(knowledge): KnowledgeBase 加 rag_channel + RetrievalLog 加 trace 字段"
```

---

### Task 2: 数据模型 - OutlineKnowledgeBase 中间表

**Files:**
- Create: `backend/apps/outline/models/outline_knowledge_base.py`
- Modify: `backend/apps/outline/models/__init__.py`
- Test: `backend/apps/outline/tests/test_outline_knowledge_base.py`

**Interfaces:**
- Produces: `OutlineKnowledgeBase` 模型，related_name `outline.kb_bindings` / `knowledge_base.outline_bindings`

- [ ] **Step 1: Write the failing test**

Create `backend/apps/outline/tests/test_outline_knowledge_base.py`:

```python
import pytest
from django.contrib.auth import get_user_model

from apps.knowledge.models import KnowledgeBase
from apps.outline.models import Outline, OutlineKnowledgeBase
from apps.projects.models import Lot, Project

User = get_user_model()


@pytest.mark.django_db
class TestOutlineKnowledgeBase:
    def setup_method(self):
        self.user = User.objects.create_user(username="u", password="p")
        project = Project.objects.create(name="P", created_by=self.user)
        lot = Lot.objects.create(name="L", project=project)
        self.outline = Outline.objects.create(
            project=project, lot=lot, name="O", source="preset", created_by=self.user
        )
        self.kb = KnowledgeBase.objects.create(
            name="KB", kb_type="company_profile", created_by=self.user
        )

    def test_bind_kb(self):
        binding = OutlineKnowledgeBase.objects.create(
            outline=self.outline, knowledge_base=self.kb, sort_order=0
        )
        assert binding.is_active is True
        assert self.outline.kb_bindings.count() == 1
        assert self.kb.outline_bindings.count() == 1

    def test_unique_constraint(self):
        from django.db import IntegrityError
        OutlineKnowledgeBase.objects.create(
            outline=self.outline, knowledge_base=self.kb
        )
        with pytest.raises(IntegrityError):
            OutlineKnowledgeBase.objects.create(
                outline=self.outline, knowledge_base=self.kb
            )

    def test_ordering(self):
        kb2 = KnowledgeBase.objects.create(
            name="KB2", kb_type="bid_history", created_by=self.user
        )
        OutlineKnowledgeBase.objects.create(
            outline=self.outline, knowledge_base=self.kb, sort_order=2
        )
        OutlineKnowledgeBase.objects.create(
            outline=self.outline, knowledge_base=kb2, sort_order=1
        )
        bindings = list(self.outline.kb_bindings.all())
        assert bindings[0].knowledge_base_id == kb2.id
        assert bindings[1].knowledge_base_id == self.kb.id
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest apps/outline/tests/test_outline_knowledge_base.py -v`
Expected: FAIL with "cannot import name 'OutlineKnowledgeBase'"

- [ ] **Step 3: Create the model**

Create `backend/apps/outline/models/outline_knowledge_base.py`:

```python
"""大纲-知识库关联模型。"""

from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel


class OutlineKnowledgeBase(TimeStampedModel):
    """大纲与知识库的绑定关系。"""

    outline = models.ForeignKey(
        "outline.Outline",
        on_delete=models.CASCADE,
        related_name="kb_bindings",
        verbose_name="所属大纲",
    )
    knowledge_base = models.ForeignKey(
        "knowledge.KnowledgeBase",
        on_delete=models.CASCADE,
        related_name="outline_bindings",
        verbose_name="知识库",
    )
    sort_order = models.PositiveIntegerField("排序", default=0)
    is_active = models.BooleanField("是否启用", default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="outline_kb_bindings",
        verbose_name="创建人",
    )

    class Meta:
        db_table = "outline_knowledge_base"
        verbose_name = "大纲知识库关联"
        verbose_name_plural = "大纲知识库关联"
        constraints = [
            models.UniqueConstraint(
                fields=["outline", "knowledge_base"],
                name="uniq_outline_kb",
            ),
        ]
        indexes = [
            models.Index(fields=["outline", "is_active"]),
            models.Index(fields=["outline", "sort_order"]),
            models.Index(fields=["knowledge_base"]),
        ]
        ordering = ["sort_order", "id"]

    def __str__(self):
        return f"{self.outline.name} - {self.knowledge_base.name}"
```

- [ ] **Step 4: Register in __init__**

在 `backend/apps/outline/models/__init__.py` 的 import 区追加:

```python
from .outline_knowledge_base import OutlineKnowledgeBase
```

并在 `__all__` 列表追加 `"OutlineKnowledgeBase"`。

- [ ] **Step 5: Generate and run migration**

Run:
```bash
cd backend && source .venv/bin/activate
python manage.py makemigrations outline --name create_outline_knowledge_base
python manage.py migrate
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && python -m pytest apps/outline/tests/test_outline_knowledge_base.py -v`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/apps/outline/models/outline_knowledge_base.py backend/apps/outline/models/__init__.py backend/apps/outline/migrations/ backend/apps/outline/tests/test_outline_knowledge_base.py
git commit -m "feat(outline): 新增 OutlineKnowledgeBase 大纲-知识库绑定中间表"
```

---

### Task 3: 数据模型 - SectionManualSource + 生成记录字段

**Files:**
- Create: `backend/apps/outline/models/section_manual_source.py`
- Modify: `backend/apps/outline/models/section_generation_record.py`
- Modify: `backend/apps/outline/models/section_version.py`
- Modify: `backend/apps/outline/models/__init__.py`
- Test: `backend/apps/outline/tests/test_section_manual_source.py`

**Interfaces:**
- Produces: `SectionManualSource` 模型 (related_name `section.manual_sources`)，`SectionGenerationRecord.rag_sources` (JSONField)，`SectionGenerationRecord.generation_meta` (JSONField)，`SectionVersion.generated_from_record_id` (IntegerField nullable)

- [ ] **Step 1: Write the failing test**

Create `backend/apps/outline/tests/test_section_manual_source.py`:

```python
import pytest
from django.contrib.auth import get_user_model

from apps.outline.models import Outline, Section, SectionManualSource
from apps.projects.models import Lot, Project

User = get_user_model()


@pytest.mark.django_db
class TestSectionManualSource:
    def setup_method(self):
        self.user = User.objects.create_user(username="u", password="p")
        project = Project.objects.create(name="P", created_by=self.user)
        lot = Lot.objects.create(name="L", project=project)
        self.outline = Outline.objects.create(
            project=project, lot=lot, name="O", source="preset", created_by=self.user
        )
        self.section = Section.objects.create(
            outline=self.outline, title="S", level=1, sort_order=1
        )

    def test_create_manual_source(self):
        ms = SectionManualSource.objects.create(
            section=self.section, chunk_id=1, document_id=10,
            document_title="doc.pdf", kb_id=1, kb_name="KB",
            channel="company_info", content_preview="...",
            selected_by=self.user,
        )
        assert ms.channel == "company_info"
        assert self.section.manual_sources.count() == 1

    def test_unique_section_chunk(self):
        from django.db import IntegrityError
        SectionManualSource.objects.create(
            section=self.section, chunk_id=1, document_id=10,
            document_title="d", kb_id=1, kb_name="K", channel="company_info"
        )
        with pytest.raises(IntegrityError):
            SectionManualSource.objects.create(
                section=self.section, chunk_id=1, document_id=10,
                document_title="d", kb_id=1, kb_name="K", channel="company_info"
            )
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest apps/outline/tests/test_section_manual_source.py -v`
Expected: FAIL with "cannot import name 'SectionManualSource'"

- [ ] **Step 3: Create SectionManualSource model**

Create `backend/apps/outline/models/section_manual_source.py`:

```python
"""章节手动选源模型。"""

from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel


class SectionManualSource(TimeStampedModel):
    """用户手动检索并勾选的章节参考来源。

    不覆盖 SectionGenerationRecord.rag_sources，仅作为下一次重新生成的输入。
    """

    section = models.ForeignKey(
        "outline.Section",
        on_delete=models.CASCADE,
        related_name="manual_sources",
        verbose_name="所属章节",
    )
    chunk_id = models.IntegerField("chunk ID")
    document_id = models.IntegerField("文档 ID")
    document_title = models.CharField("文档标题", max_length=255)
    kb_id = models.IntegerField("知识库 ID")
    kb_name = models.CharField("知识库名称", max_length=255)
    channel = models.CharField("RAG通道", max_length=32)
    content_preview = models.TextField("内容预览", blank=True, default="")
    section_path = models.CharField("文档内路径", max_length=255, blank=True, default="")
    page_start = models.IntegerField("起始页", null=True, blank=True)
    page_end = models.IntegerField("结束页", null=True, blank=True)
    selected_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="selected_manual_sources",
        verbose_name="选择人",
    )

    class Meta:
        db_table = "section_manual_source"
        verbose_name = "章节手动选源"
        verbose_name_plural = "章节手动选源"
        constraints = [
            models.UniqueConstraint(
                fields=["section", "chunk_id"],
                name="uniq_section_chunk",
            ),
        ]
        indexes = [
            models.Index(fields=["section"]),
            models.Index(fields=["section", "channel"]),
        ]
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.section.title} - chunk#{self.chunk_id}"
```

- [ ] **Step 4: Add fields to SectionGenerationRecord**

在 `backend/apps/outline/models/section_generation_record.py` 的 `SectionGenerationRecord` 类 `error_message` 字段后追加:

```python
    rag_sources = models.JSONField(
        "RAG引用来源",
        default=list,
        blank=True,
        help_text="前端展示用，仅含 chunk_id/document_title/kb_name/channel/score/rank/page",
    )
    generation_meta = models.JSONField(
        "生成元数据",
        default=dict,
        blank=True,
        help_text="完整检索 trace: retrieval_plan/query/filters/warnings/latency_ms/used_mode",
    )
```

- [ ] **Step 5: Add generated_from_record_id to SectionVersion**

在 `backend/apps/outline/models/section_version.py` 的 `SectionVersion` 类 `word_count` 字段后追加:

```python
    generated_from_record_id = models.IntegerField(
        "生成记录ID",
        null=True,
        blank=True,
        help_text="本次版本对应的 SectionGenerationRecord ID，用于关联 rag_sources",
    )
```

- [ ] **Step 6: Register SectionManualSource in __init__**

在 `backend/apps/outline/models/__init__.py` 追加:

```python
from .section_manual_source import SectionManualSource
```

并在 `__all__` 追加 `"SectionManualSource"`。

- [ ] **Step 7: Generate and run migration**

Run:
```bash
cd backend && source .venv/bin/activate
python manage.py makemigrations outline --name add_manual_source_and_generation_fields
python manage.py migrate
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd backend && python -m pytest apps/outline/tests/test_section_manual_source.py -v`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add backend/apps/outline/models/section_manual_source.py backend/apps/outline/models/section_generation_record.py backend/apps/outline/models/section_version.py backend/apps/outline/models/__init__.py backend/apps/outline/migrations/ backend/apps/outline/tests/test_section_manual_source.py
git commit -m "feat(outline): 新增 SectionManualSource + 生成记录 rag_sources/generation_meta + Version 关联"
```

---

### Task 4: 检索常量 - 通道映射对齐 KnowledgeBaseType

**Files:**
- Create: `backend/apps/knowledge/services/retrieval_constants.py`
- Test: `backend/apps/knowledge/tests/test_retrieval_constants.py`

**Interfaces:**
- Produces: `KB_TYPE_TO_CHANNEL` (dict[str,str])，`SECTION_ROLE_TO_CHANNELS` (dict[str,list[str]])，`KEYWORD_TO_CHANNEL` (dict[str,str])，`STRICT_MODE_CHANNELS` (dict[str,list[str]])，`CHANNEL_WEIGHTS` (dict[str,float])

- [ ] **Step 1: Write the failing test**

Create `backend/apps/knowledge/tests/test_retrieval_constants.py`:

```python
from apps.knowledge.services.retrieval_constants import (
    KB_TYPE_TO_CHANNEL,
    SECTION_ROLE_TO_CHANNELS,
    KEYWORD_TO_CHANNEL,
    STRICT_MODE_CHANNELS,
    CHANNEL_WEIGHTS,
)


class TestRetrievalConstants:
    def test_kb_type_to_channel_aligned_with_constants(self):
        assert KB_TYPE_TO_CHANNEL["company_profile"] == "company_info"
        assert KB_TYPE_TO_CHANNEL["case_library"] == "project_case"
        assert KB_TYPE_TO_CHANNEL["qualification"] == "certificate"
        assert KB_TYPE_TO_CHANNEL["product"] == "company_info"
        assert KB_TYPE_TO_CHANNEL["bid_history"] == "historical_bid"
        assert KB_TYPE_TO_CHANNEL["technical_solution"] == "historical_bid"

    def test_section_role_channels(self):
        assert "certificate" in SECTION_ROLE_TO_CHANNELS["qualification"]
        assert "historical_bid" in SECTION_ROLE_TO_CHANNELS["technical_solution"]

    def test_strict_mode_channels(self):
        assert STRICT_MODE_CHANNELS["strict_qualification"] == ["company_info", "certificate"]
        assert STRICT_MODE_CHANNELS["strict_commitment"] == ["company_info"]

    def test_channel_weights(self):
        assert CHANNEL_WEIGHTS["company_info"] == 1.0
        assert "personnel" in CHANNEL_WEIGHTS
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest apps/knowledge/tests/test_retrieval_constants.py -v`
Expected: FAIL with "No module named 'apps.knowledge.services.retrieval_constants'"

- [ ] **Step 3: Create the constants module**

Create `backend/apps/knowledge/services/retrieval_constants.py`:

```python
"""检索编排常量。

通道映射对齐 KnowledgeBaseType 常量，修复 RagService 历史错配。
"""


# kb_type → RAG 通道（对齐 KnowledgeBaseType.CHOICES）
KB_TYPE_TO_CHANNEL = {
    "company_profile": "company_info",
    "case_library": "project_case",
    "qualification": "certificate",
    "product": "company_info",
    "bid_history": "historical_bid",
    "technical_solution": "historical_bid",
}

# 章节角色 → 检索通道
SECTION_ROLE_TO_CHANNELS = {
    "qualification": ["certificate", "company_info"],
    "technical_solution": ["company_info", "historical_bid", "project_case"],
    "business_response": ["company_info", "historical_bid"],
    "service_plan": ["company_info", "historical_bid", "project_case"],
    "team_intro": ["personnel", "certificate"],
    "attachment": [],
    "other": ["company_info", "historical_bid"],
}

# 关键词 → 检索通道
KEYWORD_TO_CHANNEL = {
    "资质": "certificate",
    "证书": "certificate",
    "认证": "certificate",
    "业绩": "project_case",
    "案例": "project_case",
    "项目经验": "project_case",
    "人员": "personnel",
    "团队": "personnel",
    "简历": "personnel",
    "技术方案": "historical_bid",
    "方案": "historical_bid",
    "公司": "company_info",
    "企业": "company_info",
}

# 严格模式 → 通道白名单（在 plan 阶段限定，覆盖默认推断）
STRICT_MODE_CHANNELS = {
    "strict_qualification": ["company_info", "certificate"],
    "strict_commitment": ["company_info"],
    "strict_attachment_index": [],
    "strict_resume": ["personnel"],
}

# 通道权重（跨通道 weighted RRF 用）
CHANNEL_WEIGHTS = {
    "company_info": 1.0,
    "historical_bid": 1.0,
    "project_case": 1.0,
    "certificate": 1.0,
    "personnel": 1.0,
}
```

注：`strict_table` 通道按标题动态推断，留在 Orchestrator 内处理，不放常量表。

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest apps/knowledge/tests/test_retrieval_constants.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/apps/knowledge/services/retrieval_constants.py backend/apps/knowledge/tests/test_retrieval_constants.py
git commit -m "feat(knowledge): 检索常量对齐 KnowledgeBaseType，修复通道映射错配"
```

---

### Task 5: RetrievalService 改造 - 默认 HYBRID + trace 字段

**Files:**
- Modify: `backend/apps/knowledge/services/retrieval_service.py`
- Modify: `backend/apps/knowledge/tests/test_retrieval_service.py`

**Interfaces:**
- Consumes: `RetrievalLog.retrieval_run_id` / `trace_meta` / `fallback_reason` (Task 1)
- Produces: `RetrievalService.search()` 新签名: 加 `retrieval_run_id: str | None = None`, `trace_meta: dict | None = None`；默认 `retrieval_mode=RetrievalMode.HYBRID`；`knowledge_base_ids` 改为可选

- [ ] **Step 1: Write the failing test**

追加到 `backend/apps/knowledge/tests/test_retrieval_service.py`:

```python
import pytest
from unittest.mock import patch, MagicMock
from apps.knowledge.services.retrieval_service import RetrievalService
from apps.knowledge.constants import RetrievalMode


@pytest.mark.django_db
class TestRetrievalServiceHybridFallback:
    def test_search_accepts_retrieval_run_id(self, django_user_model):
        user = django_user_model.objects.create_user(username="u", password="p")
        service = RetrievalService()
        with patch.object(service, "_hybrid_search", return_value=[]):
            result = service.search(
                query="test", knowledge_base_ids=[1], top_k=5,
                retrieval_mode=RetrievalMode.HYBRID,
                created_by=user,
                retrieval_run_id="run-uuid-xxx",
                trace_meta={"channel": "company_info"},
            )
        assert result["latency_ms"] >= 0

    def test_hybrid_falls_back_to_fulltext(self, django_user_model):
        user = django_user_model.objects.create_user(username="u", password="p")
        service = RetrievalService()
        with patch.object(service, "_vector_search", return_value=[]), \
             patch.object(service, "_fulltext_search", return_value=[]) as ft_mock:
            service._hybrid_search(MagicMock(), "query", 5)
        assert ft_mock.called
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest apps/knowledge/tests/test_retrieval_service.py::TestRetrievalServiceHybridFallback -v`
Expected: FAIL with "unexpected keyword argument 'retrieval_run_id'"

- [ ] **Step 3: Update search signature and defaults**

修改 `backend/apps/knowledge/services/retrieval_service.py` 的 `search` 方法签名:

```python
    def search(
        self,
        query: str,
        knowledge_base_ids: list[int] | None = None,
        top_k: int = 10,
        filters: dict | None = None,
        retrieval_mode: str = RetrievalMode.HYBRID,
        created_by=None,
        retrieval_run_id: str | None = None,
        trace_meta: dict | None = None,
    ) -> dict:
```

- [ ] **Step 4: Handle knowledge_base_ids optional**

在 `search` 方法 `base_qs` 构建处，将空/None 都当全局处理:

```python
        if knowledge_base_ids:
            base_qs = KnowledgeChunk.objects.filter(
                document__knowledge_base_id__in=knowledge_base_ids,
                document__knowledge_base__is_active=True,
                document__knowledge_base__is_deleted=False,
                document__is_deleted=False,
            ).select_related("document", "document__knowledge_base")
        else:
            base_qs = KnowledgeChunk.objects.filter(
                document__knowledge_base__is_active=True,
                document__knowledge_base__is_deleted=False,
                document__is_deleted=False,
            ).select_related("document", "document__knowledge_base")
```

- [ ] **Step 5: Write trace fields to RetrievalLog**

在 `search` 方法创建 `RetrievalLog` 处，扩展字段:

```python
        log = RetrievalLog.objects.create(
            query=query,
            knowledge_bases=knowledge_base_ids or [],
            filters=filters or {},
            top_k=top_k,
            retrieval_mode=retrieval_mode,
            retrieved_chunks=[
                self._chunk_to_log_dict(chunk, i)
                for i, chunk in enumerate(results)
            ],
            latency_ms=latency_ms,
            created_by=created_by,
            retrieval_run_id=retrieval_run_id or "",
            trace_meta=trace_meta or {},
        )
```

- [ ] **Step 6: Add FULLTEXT fallback in _hybrid_search**

修改 `_hybrid_search` 方法开头，向量生成失败时降级:

```python
    def _hybrid_search(self, qs, query: str, top_k: int) -> list:
        """混合检索（向量 + 全文），向量失败降级 FULLTEXT。"""
        query_embedding = self._get_query_embedding(query)
        if query_embedding is None:
            return self._fulltext_search(qs, query, top_k)

        candidates_count = min(top_k * 3, 50)
        vector_results = self._vector_search(qs, query, candidates_count)
        fulltext_results = self._fulltext_search(qs, query, candidates_count)
        # 后续 RRF 融合逻辑保持不变
```

注：原 `_vector_search` 内部已调 `_get_query_embedding`，本步把 embedding 提前到 `_hybrid_search` 做降级判断。需确认 `_vector_search` 仍能接收已算好的 embedding 或重复算一次（重复算可接受，降级路径）。

- [ ] **Step 7: Run test to verify it passes**

Run: `cd backend && python -m pytest apps/knowledge/tests/test_retrieval_service.py::TestRetrievalServiceHybridFallback -v`
Expected: PASS

- [ ] **Step 8: Run full retrieval test suite for regression**

Run: `cd backend && python -m pytest apps/knowledge/tests/test_retrieval_service.py -v`
Expected: PASS (无回归)

- [ ] **Step 9: Commit**

```bash
git add backend/apps/knowledge/services/retrieval_service.py backend/apps/knowledge/tests/test_retrieval_service.py
git commit -m "feat(knowledge): RetrievalService 默认 HYBRID + trace 字段 + 向量降级"
```

---

### Task 6: RetrievalOrchestrator - 数据类与 resolve_channel + collect_metadata_snapshot

**Files:**
- Create: `backend/apps/knowledge/services/retrieval_orchestrator.py`
- Test: `backend/apps/outline/tests/test_retrieval_orchestrator.py`

**Interfaces:**
- Consumes: `KB_TYPE_TO_CHANNEL` (Task 4)，`KnowledgeBase.rag_channel` (Task 1)，`OutlineKnowledgeBase` (Task 2)，`RetrievalMode` 常量
- Produces: `RetrievalOrchestrator.resolve_channel(kb) -> str`，`collect_metadata_snapshot(outline, user)`，数据类 `ChannelQuery / RetrievalPlan / RetrievedChunk / RetrievedContext`，常量 `ManualSourceMode`

- [ ] **Step 1: Write the failing test**

Create `backend/apps/outline/tests/test_retrieval_orchestrator.py`:

```python
import pytest
from django.contrib.auth import get_user_model

from apps.knowledge.models import KnowledgeBase
from apps.knowledge.services.retrieval_orchestrator import (
    RetrievalOrchestrator,
    RetrievalMode,
    ManualSourceMode,
    ChannelQuery,
    RetrievedChunk,
)
from apps.outline.models import Outline, OutlineKnowledgeBase
from apps.projects.models import Lot, Project

User = get_user_model()


@pytest.mark.django_db
class TestResolveChannel:
    def setup_method(self):
        self.user = User.objects.create_user(username="u", password="p")
        self.orchestrator = RetrievalOrchestrator()

    def test_rag_channel_overrides_kb_type(self):
        kb = KnowledgeBase.objects.create(
            name="KB", kb_type="company_profile",
            rag_channel="historical_bid", created_by=self.user
        )
        assert self.orchestrator.resolve_channel(kb) == "historical_bid"

    def test_default_mapping_when_rag_channel_empty(self):
        kb = KnowledgeBase.objects.create(
            name="KB", kb_type="company_profile", created_by=self.user
        )
        assert self.orchestrator.resolve_channel(kb) == "company_info"

    def test_unknown_kb_type_returns_none(self):
        kb = KnowledgeBase.objects.create(
            name="KB", kb_type="unknown_type", created_by=self.user
        )
        assert self.orchestrator.resolve_channel(kb) is None


@pytest.mark.django_db
class TestCollectMetadataSnapshot:
    def setup_method(self):
        self.user = User.objects.create_user(username="u", password="p")
        project = Project.objects.create(name="P", created_by=self.user)
        lot = Lot.objects.create(name="L", project=project)
        self.outline = Outline.objects.create(
            project=project, lot=lot, name="O", source="preset", created_by=self.user
        )
        self.orchestrator = RetrievalOrchestrator()

    def test_empty_metadata_when_no_bindings(self):
        ctx = self.orchestrator.collect_metadata_snapshot(self.outline, self.user)
        assert ctx.metadata_snapshot["has_kb_bindings"] is False
        assert ctx.metadata_snapshot["available_knowledge_bases"] == []
        assert ctx.fused == []
        assert ctx.by_channel == {}

    def test_metadata_includes_bound_kbs(self):
        kb = KnowledgeBase.objects.create(
            name="公司介绍库", kb_type="company_profile", created_by=self.user
        )
        OutlineKnowledgeBase.objects.create(outline=self.outline, knowledge_base=kb)
        ctx = self.orchestrator.collect_metadata_snapshot(self.outline, self.user)
        assert ctx.metadata_snapshot["has_kb_bindings"] is True
        assert len(ctx.metadata_snapshot["available_knowledge_bases"]) == 1
        assert ctx.metadata_snapshot["available_knowledge_bases"][0]["rag_channel"] == "company_info"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest apps/outline/tests/test_retrieval_orchestrator.py -v`
Expected: FAIL with "No module named 'apps.knowledge.services.retrieval_orchestrator'"

- [ ] **Step 3: Create orchestrator**

Create `backend/apps/knowledge/services/retrieval_orchestrator.py`:

```python
"""检索编排服务。

统一收敛 RAG 检索编排：通道规划、查询词生成、跨通道 weighted RRF 融合、
去重、溯源。矩阵阶段用 metadata 模式（零向量），正文阶段用 retrieval 模式。
"""

import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

from django.conf import settings

from apps.knowledge.constants import RetrievalMode
from apps.knowledge.services.retrieval_constants import KB_TYPE_TO_CHANNEL

logger = logging.getLogger(__name__)


class ManualSourceMode:
    """手动选源模式。"""
    AUTO = "auto"
    PREFER = "prefer"
    ONLY = "only"


@dataclass
class ChannelQuery:
    channel: str
    query: str
    top_k: int
    kb_ids: list[int]
    weight: float = 1.0


@dataclass
class RetrievalPlan:
    mode: str
    channel_queries: list[ChannelQuery]
    outline_kb_ids: list[int]
    fallback_to_global: bool
    reason: str


@dataclass
class RetrievedChunk:
    chunk_id: int
    document_id: int
    document_title: str
    kb_id: int
    kb_name: str
    channel: str
    score: float
    rank: int
    content: str
    content_preview: str
    section_path: str
    page_start: int | None
    page_end: int | None


@dataclass
class RetrievedContext:
    retrieval_run_id: str
    plan: RetrievalPlan
    by_channel: dict[str, list[RetrievedChunk]]
    fused: list[RetrievedChunk]
    sources: list[dict]
    metadata_snapshot: dict
    latency_ms: int
    warnings: list[str] = field(default_factory=list)


class RetrievalOrchestrator:
    """检索编排服务。"""

    def resolve_channel(self, knowledge_base) -> str | None:
        """通道解析：kb.rag_channel 优先，否则 KB_TYPE_TO_CHANNEL[kb.kb_type]。"""
        if knowledge_base.rag_channel:
            return knowledge_base.rag_channel
        return KB_TYPE_TO_CHANNEL.get(knowledge_base.kb_type)

    def collect_metadata_snapshot(self, outline, user=None) -> RetrievedContext:
        """矩阵模式：读材料包快照 + RAG 库/文档标题清单，零向量调用。"""
        run_id = str(uuid.uuid4())
        start = time.time()
        warnings: list[str] = []

        kb_ids, fallback = self._get_outline_kb_ids(outline)
        if fallback:
            warnings.append("outline 未绑定知识库，已回退使用全局活跃知识库")

        kbs = self._fetch_bound_kbs(kb_ids)
        available_kbs = self._build_available_kbs(kbs)
        available_doc_titles = self._build_doc_titles(kbs)
        company_snapshot, has_package = self._read_material_package(outline)

        metadata_snapshot = {
            "company_snapshot": company_snapshot,
            "available_knowledge_bases": available_kbs,
            "available_document_titles": available_doc_titles["list"],
            "document_title_truncated": available_doc_titles["truncated"],
            "document_title_total_count": available_doc_titles["total"],
            "document_title_included_count": available_doc_titles["included"],
            "missing_materials": [],
            "has_material_package": has_package,
            "has_kb_bindings": not fallback,
        }

        return RetrievedContext(
            retrieval_run_id=run_id,
            plan=RetrievalPlan(
                mode=RetrievalMode.METADATA,
                channel_queries=[],
                outline_kb_ids=kb_ids,
                fallback_to_global=fallback,
                reason="metadata snapshot",
            ),
            by_channel={},
            fused=[],
            sources=[],
            metadata_snapshot=metadata_snapshot,
            latency_ms=int((time.time() - start) * 1000),
            warnings=warnings,
        )

    def retrieve_for_section(
        self, outline, section, user=None,
        generation_mode=None, analysis_result=None,
        override_kb_ids=None,
        manual_sources=None, manual_source_mode=ManualSourceMode.AUTO,
    ) -> RetrievedContext:
        """正文模式：plan + execute（Task 7 实现）。"""
        raise NotImplementedError

    def _get_outline_kb_ids(self, outline) -> tuple[list[int], bool]:
        """读取大纲绑定 KB，空则 fallback 全局活跃库。"""
        from apps.outline.models import OutlineKnowledgeBase
        bindings = OutlineKnowledgeBase.objects.filter(
            outline=outline, is_active=True
        ).select_related("knowledge_base")
        kb_ids = [b.knowledge_base_id for b in bindings]
        if kb_ids:
            return kb_ids, False
        fallback_enabled = getattr(settings, "RETRIEVAL_FALLBACK_TO_GLOBAL", True)
        if not fallback_enabled:
            return [], False
        from apps.knowledge.models import KnowledgeBase
        global_ids = list(
            KnowledgeBase.objects.filter(
                is_active=True, is_deleted=False
            ).values_list("id", flat=True)[:10]
        )
        return global_ids, True

    def _fetch_bound_kbs(self, kb_ids: list[int]) -> list:
        from apps.knowledge.models import KnowledgeBase
        return list(KnowledgeBase.objects.filter(id__in=kb_ids, is_deleted=False))

    def _build_available_kbs(self, kbs) -> list[dict]:
        result = []
        for kb in kbs:
            result.append({
                "kb_id": kb.id,
                "kb_name": kb.name,
                "kb_type": kb.kb_type,
                "rag_channel": self.resolve_channel(kb) or "",
                "document_count": kb.document_count,
                "chunk_count": kb.chunk_count,
            })
        return result

    def _build_doc_titles(self, kbs) -> dict:
        from apps.knowledge.models import KnowledgeDocument
        max_per_kb = getattr(settings, "MAX_DOC_TITLES_PER_KB", 10)
        max_total = getattr(settings, "MAX_DOC_TITLES_TOTAL", 80)
        titles = []
        for kb in kbs:
            docs = KnowledgeDocument.objects.filter(
                knowledge_base=kb, is_deleted=False
            ).order_by("-updated_at")[:max_per_kb]
            for doc in docs:
                titles.append({
                    "kb_id": kb.id,
                    "document_id": doc.id,
                    "file_name": doc.file_name,
                    "kb_type": kb.kb_type,
                })
                if len(titles) >= max_total:
                    return {"list": titles, "truncated": True,
                            "total": len(titles), "included": len(titles)}
        return {"list": titles, "truncated": False, "total": len(titles),
                "included": len(titles)}

    def _read_material_package(self, outline) -> tuple:
        """读材料包快照，返回 (company_snapshot, has_package)。"""
        try:
            package = outline.material_package
        except Exception:
            return {}, False
        if not package:
            return {}, False
        return package.company_snapshot or {}, True
```

注：`missing_materials` 矩阵阶段为空（材料包模型不存 missing，missing 是 content_matrix.required_materials 与材料包 items 对比的产物，矩阵生成时矩阵未生成，对比无意义）。正文阶段由 `GenerationContextService._get_company_context` 单独计算（保持现状）。

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest apps/outline/tests/test_retrieval_orchestrator.py::TestResolveChannel apps/outline/tests/test_retrieval_orchestrator.py::TestCollectMetadataSnapshot -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/apps/knowledge/services/retrieval_orchestrator.py backend/apps/outline/tests/test_retrieval_orchestrator.py
git commit -m "feat(knowledge): RetrievalOrchestrator 数据类 + resolve_channel + collect_metadata_snapshot"
```

---

### Task 7: RetrievalOrchestrator - plan_retrieval + execute

**Files:**
- Modify: `backend/apps/knowledge/services/retrieval_orchestrator.py`
- Test: `backend/apps/outline/tests/test_retrieval_orchestrator.py`

**Interfaces:**
- Consumes: `RetrievalService.search()` (Task 5)，`SECTION_ROLE_TO_CHANNELS / KEYWORD_TO_CHANNEL / STRICT_MODE_CHANNELS / CHANNEL_WEIGHTS` (Task 4)
- Produces: `RetrievalOrchestrator.retrieve_for_section()` 完整实现（plan + execute + fuse + dedup + manual_source_mode）

- [ ] **Step 1: Write the failing test**

追加到 `backend/apps/outline/tests/test_retrieval_orchestrator.py`:

```python
from unittest.mock import patch, MagicMock
from apps.outline.models import Section


@pytest.mark.django_db
class TestRetrieveForSection:
    def setup_method(self):
        self.user = User.objects.create_user(username="u", password="p")
        project = Project.objects.create(name="P", created_by=self.user)
        lot = Lot.objects.create(name="L", project=project)
        self.outline = Outline.objects.create(
            project=project, lot=lot, name="O", source="preset", created_by=self.user
        )
        self.section = Section.objects.create(
            outline=self.outline, title="公司能力说明", level=1, sort_order=1
        )
        self.orchestrator = RetrievalOrchestrator()

    def test_retrieve_returns_fused_results(self):
        kb = KnowledgeBase.objects.create(
            name="KB", kb_type="company_profile", created_by=self.user
        )
        OutlineKnowledgeBase.objects.create(outline=self.outline, knowledge_base=kb)
        fake_results = {
            "results": [{
                "chunk_id": 1, "document_id": 10, "document_title": "doc.pdf",
                "knowledge_base_id": kb.id, "knowledge_base_name": "KB",
                "score": 0.9, "rank": 1, "title": "t", "content": "c",
                "content_preview": "c...", "section_path": "s",
                "page_start": 1, "page_end": 2,
            }]
        }
        with patch("apps.knowledge.services.retrieval_service.RetrievalService.search",
                   return_value=fake_results):
            ctx = self.orchestrator.retrieve_for_section(
                outline=self.outline, section=self.section, user=self.user
            )
        assert len(ctx.fused) == 1
        assert ctx.fused[0].channel == "company_info"
        assert ctx.sources[0]["chunk_id"] == 1

    def test_manual_only_mode_skips_vector_search(self):
        manual = [{
            "chunk_id": 99, "document_id": 9, "document_title": "manual.pdf",
            "kb_id": 1, "kb_name": "KB", "channel": "company_info",
            "score": 1.0, "rank": 1, "title": "t", "content": "c",
            "content_preview": "c", "section_path": "s", "page_start": None, "page_end": None,
        }]
        with patch("apps.knowledge.services.retrieval_service.RetrievalService.search") as mock_search:
            ctx = self.orchestrator.retrieve_for_section(
                outline=self.outline, section=self.section, user=self.user,
                manual_sources=manual, manual_source_mode=ManualSourceMode.ONLY,
            )
        assert mock_search.call_count == 0
        assert len(ctx.fused) == 1
        assert ctx.fused[0].chunk_id == 99
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest apps/outline/tests/test_retrieval_orchestrator.py::TestRetrieveForSection -v`
Expected: FAIL with "NotImplementedError"

- [ ] **Step 3: Implement retrieve_for_section + _plan_retrieval**

在 `retrieval_orchestrator.py` 的 `RetrievalOrchestrator` 类中，替换 `retrieve_for_section` 的 `raise NotImplementedError`:

```python
    def retrieve_for_section(
        self, outline, section, user=None,
        generation_mode=None, analysis_result=None,
        override_kb_ids=None,
        manual_sources=None, manual_source_mode=ManualSourceMode.AUTO,
    ) -> RetrievedContext:
        run_id = str(uuid.uuid4())
        start = time.time()
        warnings: list[str] = []

        plan = self._plan_retrieval(
            outline, section, user, generation_mode, analysis_result, override_kb_ids
        )
        if plan.fallback_to_global:
            warnings.append(f"fallback: {plan.reason}")

        ctx = self._execute(plan, user, run_id, manual_sources, manual_source_mode)
        ctx.warnings.extend(warnings)
        ctx.latency_ms = int((time.time() - start) * 1000)
        return ctx

    def _plan_retrieval(self, outline, section, user, generation_mode,
                       analysis_result, override_kb_ids) -> RetrievalPlan:
        from apps.knowledge.services.retrieval_constants import (
            SECTION_ROLE_TO_CHANNELS, KEYWORD_TO_CHANNEL, STRICT_MODE_CHANNELS,
            CHANNEL_WEIGHTS,
        )

        if override_kb_ids:
            kb_ids = override_kb_ids
            fallback = False
        else:
            kb_ids, fallback = self._get_outline_kb_ids(outline)

        kbs = self._fetch_bound_kbs(kb_ids)
        kb_by_channel: dict[str, list[int]] = {}
        for kb in kbs:
            ch = self.resolve_channel(kb)
            if ch:
                kb_by_channel.setdefault(ch, []).append(kb.id)

        channels = self._determine_channels(section, generation_mode, kb_by_channel)
        query = self._build_search_query(section, analysis_result)

        channel_queries = []
        for ch in channels:
            kb_ids_for_channel = kb_by_channel.get(ch, [kb.id for kb in kbs])
            channel_queries.append(ChannelQuery(
                channel=ch,
                query=query,
                top_k=5,
                kb_ids=kb_ids_for_channel,
                weight=CHANNEL_WEIGHTS.get(ch, 1.0),
            ))

        return RetrievalPlan(
            mode=RetrievalMode.RETRIEVAL,
            channel_queries=channel_queries,
            outline_kb_ids=kb_ids,
            fallback_to_global=fallback,
            reason=f"channels={channels}, mode={generation_mode or 'default'}",
        )

    def _determine_channels(self, section, generation_mode, kb_by_channel) -> list[str]:
        from apps.knowledge.services.retrieval_constants import (
            SECTION_ROLE_TO_CHANNELS, KEYWORD_TO_CHANNEL, STRICT_MODE_CHANNELS,
        )
        if generation_mode and generation_mode in STRICT_MODE_CHANNELS:
            return STRICT_MODE_CHANNELS[generation_mode]
        if generation_mode == "strict_table":
            title = section.title or ""
            if any(k in title for k in ["营业执照", "法人证书", "资格", "证书", "基本信息"]):
                return ["company_info", "certificate"]
            if any(k in title for k in ["人员", "简历"]):
                return ["personnel"]
            return ["company_info"]
        channels = set()
        matrix = section.content_matrix or {}
        role = matrix.get("section_role", "other")
        if role in SECTION_ROLE_TO_CHANNELS:
            channels.update(SECTION_ROLE_TO_CHANNELS[role])
        title = section.title or ""
        write_scope = matrix.get("write_scope", "")
        for kw, ch in KEYWORD_TO_CHANNEL.items():
            if kw in title or kw in write_scope:
                channels.add(ch)
        if not channels:
            channels = {"company_info", "historical_bid"}
        if kb_by_channel:
            channels = {ch for ch in channels if ch in kb_by_channel} or channels
        return list(channels)

    def _build_search_query(self, section, analysis_result) -> str:
        parts = [section.title or ""]
        matrix = section.content_matrix or {}
        write_scope = matrix.get("write_scope", "")
        if write_scope:
            parts.append(write_scope[:200])
        if analysis_result:
            keywords = analysis_result.get("keywords", [])
            parts.extend(keywords[:10])
        return " ".join(p for p in parts if p)
```

- [ ] **Step 4: Implement _execute + _fuse + _dedup + helpers**

在 `RetrievalOrchestrator` 类追加:

```python
    def _execute(self, plan: RetrievalPlan, user, run_id, manual_sources,
                 manual_source_mode) -> RetrievedContext:
        from apps.knowledge.services.retrieval_service import RetrievalService

        if manual_source_mode == ManualSourceMode.ONLY and manual_sources:
            return self._build_manual_only_context(plan, run_id, manual_sources)

        retrieval_service = RetrievalService()
        by_channel: dict[str, list[RetrievedChunk]] = {}

        for cq in plan.channel_queries:
            if not cq.kb_ids:
                continue
            try:
                result = retrieval_service.search(
                    query=cq.query,
                    knowledge_base_ids=cq.kb_ids,
                    top_k=cq.top_k,
                    retrieval_mode=RetrievalMode.HYBRID,
                    created_by=user,
                    retrieval_run_id=run_id,
                    trace_meta={"channel": cq.channel, "kb_ids": cq.kb_ids},
                )
                by_channel[cq.channel] = self._to_retrieved_chunks(
                    result.get("results", []), cq.channel
                )
            except Exception as e:
                logger.warning(f"Channel {cq.channel} retrieval failed: {e}")
                by_channel[cq.channel] = []

        fused = self._fuse_channels(by_channel, plan.channel_queries)
        fused = self._dedup(fused)[:8]

        if manual_source_mode == ManualSourceMode.PREFER and manual_sources:
            manual_chunks = self._manual_to_chunks(manual_sources)
            existing_ids = {c.chunk_id for c in fused}
            for mc in manual_chunks:
                if mc.chunk_id not in existing_ids:
                    fused.insert(0, mc)

        return RetrievedContext(
            retrieval_run_id=run_id,
            plan=plan,
            by_channel=by_channel,
            fused=fused,
            sources=self._build_sources(fused),
            metadata_snapshot={},
            latency_ms=0,
            warnings=[],
        )

    def _to_retrieved_chunks(self, results: list[dict], channel: str) -> list[RetrievedChunk]:
        chunks = []
        for r in results:
            chunks.append(RetrievedChunk(
                chunk_id=r.get("chunk_id", 0),
                document_id=r.get("document_id", 0),
                document_title=r.get("document_title", ""),
                kb_id=r.get("knowledge_base_id", 0),
                kb_name=r.get("knowledge_base_name", ""),
                channel=channel,
                score=float(r.get("score", 0.5)),
                rank=r.get("rank", 0),
                content=r.get("content", ""),
                content_preview=r.get("content_preview", ""),
                section_path=r.get("section_path", ""),
                page_start=r.get("page_start"),
                page_end=r.get("page_end"),
            ))
        return chunks

    def _fuse_channels(self, by_channel, channel_queries) -> list[RetrievedChunk]:
        """跨通道 weighted RRF。"""
        weights = {cq.channel: cq.weight for cq in channel_queries}
        k = 60
        rrf: dict[int, float] = {}
        chunk_map: dict[int, RetrievedChunk] = {}
        for channel, chunks in by_channel.items():
            weight = weights.get(channel, 1.0)
            for rank, chunk in enumerate(chunks):
                rrf[chunk.chunk_id] = rrf.get(chunk.chunk_id, 0) + weight / (k + rank + 1)
                chunk_map[chunk.chunk_id] = chunk
        sorted_ids = sorted(rrf.items(), key=lambda x: x[1], reverse=True)
        result = []
        for i, (chunk_id, score) in enumerate(sorted_ids):
            chunk = chunk_map[chunk_id]
            chunk.score = score
            chunk.rank = i + 1
            result.append(chunk)
        return result

    def _dedup(self, chunks: list[RetrievedChunk]) -> list[RetrievedChunk]:
        seen = set()
        result = []
        for chunk in chunks:
            if chunk.chunk_id in seen:
                continue
            seen.add(chunk.chunk_id)
            result.append(chunk)
        return result

    def _build_sources(self, fused: list[RetrievedChunk]) -> list[dict]:
        return [{
            "chunk_id": c.chunk_id,
            "document_id": c.document_id,
            "document_title": c.document_title,
            "kb_id": c.kb_id,
            "kb_name": c.kb_name,
            "channel": c.channel,
            "score": round(c.score, 4),
            "rank": c.rank,
            "section_path": c.section_path,
            "page_start": c.page_start,
            "page_end": c.page_end,
        } for c in fused]

    def _manual_to_chunks(self, manual_sources: list[dict]) -> list[RetrievedChunk]:
        chunks = []
        for i, m in enumerate(manual_sources):
            chunks.append(RetrievedChunk(
                chunk_id=m.get("chunk_id", 0),
                document_id=m.get("document_id", 0),
                document_title=m.get("document_title", ""),
                kb_id=m.get("kb_id", 0),
                kb_name=m.get("kb_name", ""),
                channel=m.get("channel", "company_info"),
                score=float(m.get("score", 1.0)),
                rank=i + 1,
                content=m.get("content", ""),
                content_preview=m.get("content_preview", ""),
                section_path=m.get("section_path", ""),
                page_start=m.get("page_start"),
                page_end=m.get("page_end"),
            ))
        return chunks

    def _build_manual_only_context(self, plan, run_id, manual_sources) -> RetrievedContext:
        chunks = self._manual_to_chunks(manual_sources)
        by_channel: dict[str, list[RetrievedChunk]] = {}
        for c in chunks:
            by_channel.setdefault(c.channel, []).append(c)
        return RetrievedContext(
            retrieval_run_id=run_id,
            plan=plan,
            by_channel=by_channel,
            fused=chunks,
            sources=self._build_sources(chunks),
            metadata_snapshot={},
            latency_ms=0,
            warnings=["manual_only mode, vector search skipped"],
        )
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && python -m pytest apps/outline/tests/test_retrieval_orchestrator.py::TestRetrieveForSection -v`
Expected: PASS

- [ ] **Step 6: Run full orchestrator suite**

Run: `cd backend && python -m pytest apps/outline/tests/test_retrieval_orchestrator.py -v`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/apps/knowledge/services/retrieval_orchestrator.py backend/apps/outline/tests/test_retrieval_orchestrator.py
git commit -m "feat(knowledge): Orchestrator plan_retrieval + execute + 跨通道 weighted RRF"
```

---

### Task 8: RagService 降级为兼容层

**Files:**
- Modify: `backend/apps/outline/services/rag_service.py`
- Test: `backend/apps/outline/tests/test_rag_service_compat.py`

**Interfaces:**
- Consumes: `RetrievalOrchestrator.retrieve_for_section()` (Task 7)
- Produces: `RagService.retrieve_for_section()` 薄封装，返回旧 `dict[str, list[dict]]` 结构

- [ ] **Step 1: Write the failing test**

Create `backend/apps/outline/tests/test_rag_service_compat.py`:

```python
import pytest
from unittest.mock import patch
from django.contrib.auth import get_user_model

from apps.knowledge.models import KnowledgeBase
from apps.knowledge.services.retrieval_orchestrator import (
    RetrievedChunk, RetrievedContext, RetrievalPlan,
)
from apps.outline.models import Outline, OutlineKnowledgeBase, Section
from apps.outline.services.rag_service import RagService
from apps.projects.models import Lot, Project

User = get_user_model()


@pytest.mark.django_db
class TestRagServiceCompat:
    def setup_method(self):
        self.user = User.objects.create_user(username="u", password="p")
        project = Project.objects.create(name="P", created_by=self.user)
        lot = Lot.objects.create(name="L", project=project)
        self.outline = Outline.objects.create(
            project=project, lot=lot, name="O", source="preset", created_by=self.user
        )
        self.section = Section.objects.create(
            outline=self.outline, title="公司能力", level=1, sort_order=1
        )
        kb = KnowledgeBase.objects.create(
            name="KB", kb_type="company_profile", created_by=self.user
        )
        OutlineKnowledgeBase.objects.create(outline=self.outline, knowledge_base=kb)

    def test_retrieve_for_section_returns_legacy_dict(self):
        fake_ctx = RetrievedContext(
            retrieval_run_id="r1",
            plan=RetrievalPlan(mode="retrieval", channel_queries=[],
                               outline_kb_ids=[1], fallback_to_global=False, reason=""),
            by_channel={},
            fused=[RetrievedChunk(
                chunk_id=1, document_id=10, document_title="d.pdf",
                kb_id=1, kb_name="KB", channel="company_info",
                score=0.9, rank=1, content="c", content_preview="c",
                section_path="s", page_start=1, page_end=2,
            )],
            sources=[],
            metadata_snapshot={},
            latency_ms=10,
            warnings=[],
        )
        with patch("apps.knowledge.services.retrieval_orchestrator.RetrievalOrchestrator.retrieve_for_section",
                   return_value=fake_ctx):
            result = RagService().retrieve_for_section(section=self.section, user=self.user)
        assert "company_info" in result
        assert result["company_info"][0]["chunk_id"] == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest apps/outline/tests/test_rag_service_compat.py -v`
Expected: FAIL (旧 RagService 返回空或结构不符)

- [ ] **Step 3: Rewrite RagService as compat layer**

Replace 整个 `backend/apps/outline/services/rag_service.py` 内容:

```python
# backend/apps/outline/services/rag_service.py
"""RAG 检索兼容层。

⚠️ 禁止新增检索编排逻辑。通道规划、查询词生成、跨通道融合、元数据快照
   统一进入 RetrievalOrchestrator。本文件仅做旧接口兼容与格式转换。
"""

import logging

from apps.knowledge.services.retrieval_orchestrator import RetrievalOrchestrator
from apps.outline.models import Section

logger = logging.getLogger(__name__)


class RagService:
    """兼容旧接口的薄封装。

    保留 retrieve_for_section 旧签名，内部转调 RetrievalOrchestrator，
    返回 dict[str, list[dict]] 供 GenerationContextService 各 Strategy 使用。
    """

    def retrieve_for_section(
        self,
        section: Section,
        knowledge_base_ids: list[int] | None = None,
        user=None,
        top_k_per_channel: int = 5,
        generation_mode: str | None = None,
    ) -> dict[str, list[dict]]:
        orchestrator = RetrievalOrchestrator()
        try:
            context = orchestrator.retrieve_for_section(
                outline=section.outline,
                section=section,
                user=user,
                generation_mode=generation_mode,
                override_kb_ids=knowledge_base_ids,
            )
        except Exception as e:
            logger.warning(f"Orchestrator retrieval failed: {e}")
            return {}
        return self._context_to_legacy_dict(context)

    def retrieve_by_keywords(
        self,
        keywords: list[str],
        knowledge_base_ids: list[int],
        channels: list[str] | None = None,
        user=None,
        top_k: int = 10,
    ) -> dict[str, list[dict]]:
        """旧接口：按关键词检索（直接走 RetrievalService）。"""
        from apps.knowledge.services.retrieval_service import RetrievalService
        from apps.knowledge.constants import RetrievalMode

        query = " ".join(keywords)
        service = RetrievalService()
        result = service.search(
            query=query,
            knowledge_base_ids=knowledge_base_ids,
            top_k=top_k,
            retrieval_mode=RetrievalMode.HYBRID,
            created_by=user,
        )
        return {"_default": result.get("results", [])}

    def _context_to_legacy_dict(self, context) -> dict[str, list[dict]]:
        """基于 context.fused 分组（保证跨通道融合结果真正进 prompt）。"""
        grouped: dict[str, list[dict]] = {}
        for chunk in context.fused:
            grouped.setdefault(chunk.channel, []).append({
                "chunk_id": chunk.chunk_id,
                "document_id": chunk.document_id,
                "document_title": chunk.document_title,
                "title": chunk.document_title,
                "kb_id": chunk.kb_id,
                "knowledge_base_id": chunk.kb_id,
                "kb_name": chunk.kb_name,
                "channel": chunk.channel,
                "score": chunk.score,
                "rank": chunk.rank,
                "content": chunk.content,
                "content_preview": chunk.content_preview,
                "section_path": chunk.section_path,
                "page_start": chunk.page_start,
                "page_end": chunk.page_end,
            })
        return grouped
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest apps/outline/tests/test_rag_service_compat.py -v`
Expected: PASS

- [ ] **Step 5: Run regression on existing tests that use RagService**

Run: `cd backend && python -m pytest apps/outline/tests/ -v -k "rag or generation"`
Expected: PASS (无回归)

- [ ] **Step 6: Commit**

```bash
git add backend/apps/outline/services/rag_service.py backend/apps/outline/tests/test_rag_service_compat.py
git commit -m "refactor(outline): RagService 降级为 RetrievalOrchestrator 兼容薄封装"
```

---

### Task 9: content_matrix_context_builder + settings 配置

**Files:**
- Create: `backend/apps/outline/services/content_matrix_context_builder.py`
- Modify: `backend/config/settings.py`
- Test: `backend/apps/outline/tests/test_content_matrix_context_builder.py`

**Interfaces:**
- Consumes: `RetrievedContext.metadata_snapshot` (Task 6)
- Produces: `build_company_context_block(metadata_snapshot: dict) -> str`，settings 配置项 `RETRIEVAL_DEFAULT_MODE / RETRIEVAL_FALLBACK_TO_GLOBAL / MAX_DOC_TITLES_PER_KB / MAX_DOC_TITLES_TOTAL / CONTENT_MATRIX_SCENARIO_V2`

- [ ] **Step 1: Write the failing test**

Create `backend/apps/outline/tests/test_content_matrix_context_builder.py`:

```python
from apps.outline.services.content_matrix_context_builder import build_company_context_block


class TestBuildCompanyContextBlock:
    def test_empty_snapshot_returns_empty(self):
        assert build_company_context_block({}) == ""

    def test_no_kb_bindings_returns_empty(self):
        result = build_company_context_block({"has_kb_bindings": False, "has_material_package": False})
        assert result == ""

    def test_renders_company_info(self):
        snapshot = {
            "has_kb_bindings": True,
            "has_material_package": True,
            "company_snapshot": {
                "name": "XX科技有限公司",
                "unified_social_credit_code": "91XXX",
                "legal_representative": "张三",
            },
            "available_knowledge_bases": [
                {"kb_name": "公司介绍库", "rag_channel": "company_info", "document_count": 12},
            ],
            "available_document_titles": [
                {"file_name": "公司简介2025.pdf"},
            ],
            "missing_materials": [],
        }
        result = build_company_context_block(snapshot)
        assert "XX科技有限公司" in result
        assert "公司介绍库" in result
        assert "公司简介2025.pdf" in result
        assert "【公司能力边界】" in result
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest apps/outline/tests/test_content_matrix_context_builder.py -v`
Expected: FAIL with "No module named 'apps.outline.services.content_matrix_context_builder'"

- [ ] **Step 3: Add settings config**

在 `backend/config/settings.py` 末尾追加:

```python
# ========== RAG 检索编排配置 ==========
RETRIEVAL_DEFAULT_MODE = "hybrid"
RETRIEVAL_FALLBACK_TO_GLOBAL = True
MAX_DOC_TITLES_PER_KB = 10
MAX_DOC_TITLES_TOTAL = 80
CONTENT_MATRIX_SCENARIO_V2 = "content_matrix_generation_v2"
```

- [ ] **Step 4: Create content_matrix_context_builder**

Create `backend/apps/outline/services/content_matrix_context_builder.py`:

```python
"""矩阵生成公司上下文块构建器。

渲染公司能力边界文本块，注入矩阵生成 prompt。
空数据返回空字符串（不破坏旧模板兼容）。
"""


def build_company_context_block(metadata_snapshot: dict) -> str:
    """渲染公司能力边界文本块。"""
    if not metadata_snapshot:
        return ""
    if not metadata_snapshot.get("has_kb_bindings") and not metadata_snapshot.get("has_material_package"):
        return ""

    parts = ["【公司能力边界】"]

    company = metadata_snapshot.get("company_snapshot", {})
    if company:
        company_lines = []
        if company.get("name"):
            company_lines.append(f"公司名称：{company['name']}")
        if company.get("unified_social_credit_code"):
            company_lines.append(f"统一社会信用代码：{company['unified_social_credit_code']}")
        if company.get("legal_representative"):
            company_lines.append(f"法定代表人：{company['legal_representative']}")
        if company.get("registered_capital"):
            company_lines.append(f"注册资本：{company['registered_capital']}")
        if company_lines:
            parts.append("\n".join(company_lines))

    kbs = metadata_snapshot.get("available_knowledge_bases", [])
    if kbs:
        kb_lines = [f"- {kb['kb_name']}（{kb.get('document_count', 0)} 文档，通道：{kb.get('rag_channel', '未知')}）"
                    for kb in kbs]
        parts.append("可用知识库：\n" + "\n".join(kb_lines))

    docs = metadata_snapshot.get("available_document_titles", [])
    if docs:
        doc_lines = [f"- {d['file_name']}" for d in docs]
        truncated = metadata_snapshot.get("document_title_truncated", False)
        header = "可参考文档标题"
        if truncated:
            total = metadata_snapshot.get("document_title_total_count", len(docs))
            included = metadata_snapshot.get("document_title_included_count", len(docs))
            header += f"（共 {total} 个，已截取前 {included} 个）"
        parts.append(f"{header}：\n" + "\n".join(doc_lines))

    missing = metadata_snapshot.get("missing_materials", [])
    if missing:
        missing_lines = [f"- {m.get('description', m.get('usage_key', ''))}（{'必需' if m.get('required') else '可选'}）"
                         for m in missing]
        parts.append("材料包缺失项（风险提示，不得编造）：\n" + "\n".join(missing_lines))

    return "\n\n".join(parts)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && python -m pytest apps/outline/tests/test_content_matrix_context_builder.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/apps/outline/services/content_matrix_context_builder.py backend/config/settings.py backend/apps/outline/tests/test_content_matrix_context_builder.py
git commit -m "feat(outline): content_matrix_context_builder + RAG 检索编排配置项"
```

---

### Task 10: 矩阵生成任务接入 metadata_snapshot

**Files:**
- Modify: `backend/apps/outline/tasks.py` — `generate_content_matrix_task`（约 line 1084-1290）
- Test: `backend/apps/outline/tests/test_matrix_rag_integration.py`

**Interfaces:**
- Consumes: `RetrievalOrchestrator.collect_metadata_snapshot()` (Task 6)，`build_company_context_block()` (Task 9)，`CONTENT_MATRIX_SCENARIO_V2` (Task 9)
- Produces: 矩阵生成 variables 注入 `company_context_block / company_snapshot / available_knowledge_bases / available_document_titles / missing_materials`；`GenerationTask.result.metadata_snapshot_summary` 持久化

- [ ] **Step 1: Write the failing test**

Create `backend/apps/outline/tests/test_matrix_rag_integration.py`:

```python
import pytest
from unittest.mock import patch, MagicMock
from django.contrib.auth import get_user_model

from apps.outline.models import GenerationTask, Outline, OutlineKnowledgeBase
from apps.knowledge.models import KnowledgeBase
from apps.projects.models import Lot, Project

User = get_user_model()


@pytest.mark.django_db
class TestMatrixRagIntegration:
    def setup_method(self):
        self.user = User.objects.create_user(username="u", password="p")
        project = Project.objects.create(name="P", created_by=self.user)
        lot = Lot.objects.create(name="L", project=project)
        self.outline = Outline.objects.create(
            project=project, lot=lot, name="O", source="preset", created_by=self.user
        )
        kb = KnowledgeBase.objects.create(
            name="公司介绍库", kb_type="company_profile", created_by=self.user
        )
        OutlineKnowledgeBase.objects.create(outline=self.outline, knowledge_base=kb)

    def test_matrix_task_passes_company_context_to_ai(self):
        from apps.outline.tasks import generate_content_matrix_task
        from apps.outline.constants import GenerationTaskType, GenerationTaskStatus

        task = GenerationTask.objects.create(
            task_type=GenerationTaskType.MATRIX_GENERATION,
            outline=self.outline, status=GenerationTaskStatus.PENDING,
            total_count=1, created_by=self.user, params={},
        )

        captured_vars = {}
        def fake_execute(self, scenario, variables, created_by):
            captured_vars.update(variables)
            mock_run = MagicMock()
            mock_run.status = "succeeded"
            mock_run.output_text = '{"sections": []}'
            mock_run.output_json = {"sections": []}
            mock_run.error_message = ""
            return mock_run

        with patch("apps.generation.services.ai_task_execution_service.AiTaskExecutionService.execute",
                   fake_execute), \
             patch("apps.outline.services.matrix_service.MatrixService.acquire_matrix_generation_lock",
                   return_value=True), \
             patch("apps.outline.services.matrix_service.MatrixService.release_matrix_generation_lock"):
            generate_content_matrix_task(self.outline.id, task.id)

        assert "company_context_block" in captured_vars
        assert "公司介绍库" in captured_vars["company_context_block"]
        assert "available_knowledge_bases" in captured_vars
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest apps/outline/tests/test_matrix_rag_integration.py -v`
Expected: FAIL (variables 不含 company_context_block)

- [ ] **Step 3: Modify generate_content_matrix_task**

读 `backend/apps/outline/tasks.py` line 1173-1185 的 `variables = {...}` 块，替换为:

```python
        # 调用 Orchestrator 收集公司材料元数据（零向量调用）
        from apps.knowledge.services.retrieval_orchestrator import RetrievalOrchestrator
        from apps.outline.services.content_matrix_context_builder import build_company_context_block

        metadata_snapshot = {}
        metadata_warnings = []
        snapshot_status = "success"
        try:
            orch = RetrievalOrchestrator()
            md_ctx = orch.collect_metadata_snapshot(outline, task.created_by)
            metadata_snapshot = md_ctx.metadata_snapshot
            metadata_warnings = md_ctx.warnings
        except Exception as e:
            logger.warning(f"collect_metadata_snapshot failed: {e}")
            snapshot_status = "failed"

        # 调用 AI 生成矩阵
        variables = {
            "project_name": outline.project.name,
            "lot_name": outline.lot.name,
            "outline_structure": outline_structure,
            "requirements_summary": requirements_summary,
            "company_context_block": build_company_context_block(metadata_snapshot),
            "company_snapshot": metadata_snapshot.get("company_snapshot", {}),
            "available_knowledge_bases": metadata_snapshot.get("available_knowledge_bases", []),
            "available_document_titles": metadata_snapshot.get("available_document_titles", []),
            "missing_materials": metadata_snapshot.get("missing_materials", []),
        }

        from django.conf import settings
        scenario = getattr(settings, "CONTENT_MATRIX_SCENARIO_V2", "content_matrix_generation_v2")

        prompt_run = AiTaskExecutionService().execute(
            scenario=scenario,
            variables=variables,
            created_by=task.created_by,
        )
```

注：保留下方原有的 `if prompt_run.status != "succeeded"` 校验逻辑不变。

- [ ] **Step 4: Persist metadata_snapshot_summary to GenerationTask.result**

在 task 标记成功后（找到 `task.status = GenerationTaskStatus.SUCCESS` 或 `_finalize_batch_task` 调用前），追加:

```python
        # 持久化 metadata_snapshot_summary
        available_kbs = metadata_snapshot.get("available_knowledge_bases", [])
        task.result = {
            **(task.result or {}),
            "metadata_snapshot_summary": {
                "has_material_package": metadata_snapshot.get("has_material_package", False),
                "has_kb_bindings": metadata_snapshot.get("has_kb_bindings", False),
                "kb_ids": [kb["kb_id"] for kb in available_kbs],
                "document_title_total_count": metadata_snapshot.get("document_title_total_count", 0),
                "document_title_included_count": metadata_snapshot.get("document_title_included_count", 0),
                "missing_material_count": len(metadata_snapshot.get("missing_materials", [])),
                "snapshot_at": timezone.now().isoformat(),
                "snapshot_status": snapshot_status,
            },
            "metadata_warnings": metadata_warnings,
        }
        task.save(update_fields=["result"])
```

注：`timezone` 已在 tasks.py 顶部 import。在合适位置（task 标记成功后）写入。

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && python -m pytest apps/outline/tests/test_matrix_rag_integration.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/apps/outline/tasks.py backend/apps/outline/tests/test_matrix_rag_integration.py
git commit -m "feat(outline): 矩阵生成任务接入公司材料元数据与 company_context_block"
```

---

### Task 11: 正文生成 prepare_generation_context 接入 Orchestrator

**Files:**
- Modify: `backend/apps/outline/services/section_generation_service.py` — `prepare_generation_context`（line 87-145）
- Test: `backend/apps/outline/tests/test_section_rag_integration.py`

**Interfaces:**
- Consumes: `RetrievalOrchestrator.retrieve_for_section()` (Task 7)
- Produces: `prepare_generation_context` 返回新增 `rag_sources` / `retrieval_meta`；落库到 `SectionGenerationRecord`

- [ ] **Step 1: Write the failing test**

Create `backend/apps/outline/tests/test_section_rag_integration.py`:

```python
import pytest
from unittest.mock import patch
from django.contrib.auth import get_user_model

from apps.knowledge.models import KnowledgeBase
from apps.knowledge.services.retrieval_orchestrator import (
    RetrievedChunk, RetrievedContext, RetrievalPlan, RetrievalMode,
)
from apps.outline.models import Outline, OutlineKnowledgeBase, Section
from apps.outline.services.section_generation_service import SectionGenerationService
from apps.projects.models import Lot, Project

User = get_user_model()


@pytest.mark.django_db
class TestSectionRagIntegration:
    def setup_method(self):
        self.user = User.objects.create_user(username="u", password="p")
        project = Project.objects.create(name="P", created_by=self.user)
        lot = Lot.objects.create(name="L", project=project)
        self.outline = Outline.objects.create(
            project=project, lot=lot, name="O", source="preset", created_by=self.user
        )
        self.section = Section.objects.create(
            outline=self.outline, title="公司能力说明", level=1, sort_order=1
        )
        kb = KnowledgeBase.objects.create(
            name="KB", kb_type="company_profile", created_by=self.user
        )
        OutlineKnowledgeBase.objects.create(outline=self.outline, knowledge_base=kb)

    def test_prepare_context_includes_rag_sources(self):
        fake_ctx = RetrievedContext(
            retrieval_run_id="run-1",
            plan=RetrievalPlan(mode=RetrievalMode.RETRIEVAL, channel_queries=[],
                               outline_kb_ids=[1], fallback_to_global=False, reason=""),
            by_channel={},
            fused=[RetrievedChunk(
                chunk_id=1, document_id=10, document_title="d.pdf",
                kb_id=1, kb_name="KB", channel="company_info",
                score=0.9, rank=1, content="c", content_preview="c",
                section_path="s", page_start=1, page_end=2,
            )],
            sources=[{
                "chunk_id": 1, "document_id": 10, "document_title": "d.pdf",
                "kb_id": 1, "kb_name": "KB", "channel": "company_info",
                "score": 0.9, "rank": 1, "section_path": "s",
                "page_start": 1, "page_end": 2,
            }],
            metadata_snapshot={},
            latency_ms=10,
            warnings=[],
        )
        with patch("apps.knowledge.services.retrieval_orchestrator.RetrievalOrchestrator.retrieve_for_section",
                   return_value=fake_ctx):
            ctx = SectionGenerationService().prepare_generation_context(
                section_id=self.section.id,
                analysis_result={"keywords": ["公司"]},
                user_prompt="",
                user_id=self.user.id,
            )
        assert "rag_sources" in ctx
        assert len(ctx["rag_sources"]) == 1
        assert ctx["rag_sources"][0]["chunk_id"] == 1
        assert "retrieval_meta" in ctx
        assert ctx["retrieval_meta"]["retrieval_run_id"] == "run-1"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest apps/outline/tests/test_section_rag_integration.py -v`
Expected: FAIL (rag_sources 不在返回值)

- [ ] **Step 3: Modify prepare_generation_context**

替换 `backend/apps/outline/services/section_generation_service.py` 的 `prepare_generation_context` 方法（line 87-145），并删除 `_get_project_knowledge_bases` 方法（已由 Orchestrator 接管），追加辅助方法:

```python
    def prepare_generation_context(
        self,
        section_id: int,
        analysis_result: dict,
        user_prompt: str,
        user_id: int,
    ) -> dict:
        """准备生成上下文（检索知识库 + 条款）。"""
        from apps.knowledge.services.retrieval_orchestrator import RetrievalOrchestrator
        from apps.outline.services.generation_context_service import GenerationContextService
        from apps.outline.services.generation_mode_service import GenerationModeService

        section = Section.objects.select_related("outline__lot").get(pk=section_id)
        user = User.objects.get(pk=user_id)

        generation_mode = GenerationModeService().get_generation_mode(section)

        orchestrator = RetrievalOrchestrator()
        rag_context = None
        try:
            rag_context = orchestrator.retrieve_for_section(
                outline=section.outline,
                section=section,
                user=user,
                generation_mode=generation_mode,
                analysis_result=analysis_result,
            )
            rag_materials = self._context_to_legacy_dict(rag_context)
        except Exception as e:
            logger.warning(f"RAG retrieval failed: {e}")
            rag_materials = {}

        context_service = GenerationContextService()
        context = context_service.build_generation_context(
            section=section, rag_materials=rag_materials,
        )

        prompt_sources = self._extract_prompt_sources(context.get("rag_materials", {}))
        prompt_context = context_service.build_prompt_context(context)
        retrieval_meta = self._build_retrieval_meta(
            rag_context, generation_mode,
            retrieved_count=len(rag_context.sources) if rag_context else 0,
            prompt_count=len(prompt_sources),
        )

        return {
            "section_info": context["current_section"],
            "content_matrix": context["content_matrix"],
            "analysis_points": context["analysis_points"],
            "rag_materials": context["rag_materials"],
            "context_sections": context["context_sections"],
            "outline_structure": context["outline_structure"],
            "project_info": context["project_info"],
            "prompt_context": prompt_context,
            "user_prompt": user_prompt,
            "analysis_result": analysis_result,
            "generation_mode": generation_mode,
            "content_structure_policy": context.get("content_structure_policy"),
            "rag_sources": prompt_sources,
            "retrieval_meta": retrieval_meta,
        }

    def _context_to_legacy_dict(self, context) -> dict[str, list[dict]]:
        """基于 context.fused 分组（保证跨通道融合结果真正进 prompt）。"""
        grouped: dict[str, list[dict]] = {}
        for chunk in context.fused:
            grouped.setdefault(chunk.channel, []).append({
                "chunk_id": chunk.chunk_id,
                "document_id": chunk.document_id,
                "document_title": chunk.document_title,
                "title": chunk.document_title,
                "kb_id": chunk.kb_id,
                "knowledge_base_id": chunk.kb_id,
                "kb_name": chunk.kb_name,
                "channel": chunk.channel,
                "score": chunk.score,
                "rank": chunk.rank,
                "content": chunk.content,
                "content_preview": chunk.content_preview,
                "section_path": chunk.section_path,
                "page_start": chunk.page_start,
                "page_end": chunk.page_end,
            })
        return grouped

    def _extract_prompt_sources(self, rag_materials: dict[str, list[dict]]) -> list[dict]:
        """从最终进 prompt 的 rag_materials 反推来源（Strategy 裁剪后）。"""
        sources = []
        rank = 1
        for channel, materials in rag_materials.items():
            for m in materials:
                sources.append({
                    "chunk_id": m.get("chunk_id"),
                    "document_id": m.get("document_id"),
                    "document_title": m.get("document_title", ""),
                    "kb_id": m.get("kb_id") or m.get("knowledge_base_id"),
                    "kb_name": m.get("kb_name", ""),
                    "channel": channel,
                    "score": round(float(m.get("score", 0.5)), 4),
                    "rank": rank,
                    "section_path": m.get("section_path", ""),
                    "page_start": m.get("page_start"),
                    "page_end": m.get("page_end"),
                })
                rank += 1
        return sources

    def _build_retrieval_meta(self, rag_context, generation_mode,
                              retrieved_count: int, prompt_count: int) -> dict:
        if not rag_context:
            return {
                "retrieval_run_id": "",
                "mode": "retrieval",
                "generation_mode": generation_mode,
                "channels": [],
                "fused_count": 0,
                "retrieved_source_count": 0,
                "prompt_source_count": prompt_count,
                "used_fused_context": True,
                "fallback_to_global": False,
                "fallback_reason": None,
                "warnings": ["rag_context is None"],
                "latency_ms": 0,
            }
        return {
            "retrieval_run_id": rag_context.retrieval_run_id,
            "mode": rag_context.plan.mode,
            "generation_mode": generation_mode,
            "channels": [
                {
                    "channel": cq.channel,
                    "query": cq.query,
                    "kb_ids": cq.kb_ids,
                    "weight": cq.weight,
                    "result_count": len(rag_context.by_channel.get(cq.channel, [])),
                    "fallback": None,
                }
                for cq in rag_context.plan.channel_queries
            ],
            "fused_count": len(rag_context.fused),
            "retrieved_source_count": retrieved_count,
            "prompt_source_count": prompt_count,
            "used_fused_context": True,
            "fallback_to_global": rag_context.plan.fallback_to_global,
            "fallback_reason": None,
            "warnings": rag_context.warnings,
            "latency_ms": rag_context.latency_ms,
        }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest apps/outline/tests/test_section_rag_integration.py -v`
Expected: PASS

- [ ] **Step 5: Run regression on existing section generation tests**

Run: `cd backend && python -m pytest apps/outline/tests/ -v -k "section or generation"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/apps/outline/services/section_generation_service.py backend/apps/outline/tests/test_section_rag_integration.py
git commit -m "feat(outline): 正文生成接入 Orchestrator + rag_sources 溯源"
```

---

### Task 12: 正文生成 task 落库 rag_sources 到 SectionGenerationRecord

**Files:**
- Modify: `backend/apps/outline/tasks.py` — `generate_section_task` 完成处
- Test: 扩展 `backend/apps/outline/tests/test_section_rag_integration.py`

**Interfaces:**
- Consumes: `prepare_generation_context` 返回的 `rag_sources` / `retrieval_meta` (Task 11)
- Produces: `SectionGenerationRecord.rag_sources` + `generation_meta.retrieval` 落库

- [ ] **Step 1: Write the failing test**

追加到 `backend/apps/outline/tests/test_section_rag_integration.py`:

```python
from apps.outline.models import SectionGenerationRecord
from apps.outline.constants import GenerationRecordStatus


@pytest.mark.django_db
class TestSectionRagRecordPersist:
    def setup_method(self):
        self.user = User.objects.create_user(username="u", password="p")
        project = Project.objects.create(name="P", created_by=self.user)
        lot = Lot.objects.create(name="L", project=project)
        self.outline = Outline.objects.create(
            project=project, lot=lot, name="O", source="preset", created_by=self.user
        )
        self.section = Section.objects.create(
            outline=self.outline, title="公司能力", level=1, sort_order=1
        )

    def test_record_persists_rag_sources(self):
        from apps.common.models import AsyncTask
        record = SectionGenerationRecord.objects.create(
            section=self.section,
            async_task=AsyncTask.objects.create(
                task_type="section_generate", created_by=self.user
            ),
            status=GenerationRecordStatus.SUCCESS,
            created_by=self.user,
        )
        record.rag_sources = [{"chunk_id": 1, "document_title": "d.pdf", "channel": "company_info"}]
        record.generation_meta = {"retrieval": {"retrieval_run_id": "r1"}}
        record.save()
        record.refresh_from_db()
        assert len(record.rag_sources) == 1
        assert record.generation_meta["retrieval"]["retrieval_run_id"] == "r1"
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cd backend && python -m pytest apps/outline/tests/test_section_rag_integration.py::TestSectionRagRecordPersist -v`
Expected: PASS (字段已在 Task 3 加好，这里验证落库)

- [ ] **Step 3: Wire rag_sources into generate_section_task**

在 `backend/apps/outline/tasks.py` 的 `generate_section_task` 中，找到调用 `prepare_generation_context` 后写入正文成功的地方，在 `record.status = GenerationRecordStatus.SUCCESS` 附近追加:

```python
            # 落库 RAG 来源与检索 trace
            record.rag_sources = context.get("rag_sources", [])
            record.generation_meta = {
                **(record.generation_meta or {}),
                "retrieval": context.get("retrieval_meta", {}),
                "generation_mode": context.get("generation_mode"),
                "content_structure_policy": context.get("content_structure_policy"),
            }
            record.save(update_fields=["rag_sources", "generation_meta"])
```

注：需读 `generate_section_task` 确认 record 变量名与保存位置，把 `update_fields` 合并到现有 save 调用或追加。实现时按实际代码调整 update_fields 列表，确保包含 `rag_sources` 和 `generation_meta`。

- [ ] **Step 4: Run full test suite**

Run: `cd backend && python -m pytest apps/outline/tests/ -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/apps/outline/tasks.py backend/apps/outline/tests/test_section_rag_integration.py
git commit -m "feat(outline): 正文生成 record 落库 rag_sources 与 retrieval_meta"
```

---

### Task 13: 后端 API - 大纲 KB 绑定 + 手动检索 + 人工选源 CRUD

**Files:**
- Create: `backend/apps/outline/serializers/outline_kb_serializer.py`
- Create: `backend/apps/outline/views/outline_kb_views.py`
- Modify: `backend/apps/outline/urls.py`
- Test: `backend/apps/outline/tests/test_outline_kb_views.py`

**Interfaces:**
- Produces API:
  - `GET/POST/DELETE/PATCH /api/outlines/{outline_id}/knowledge-bases/`
  - `POST /api/sections/{section_id}/retrieval/search/`
  - `GET/POST/DELETE /api/sections/{section_id}/manual-sources/`
  - `GET /api/sections/{section_id}/generation-records/latest/`

- [ ] **Step 1: Write the failing test**

Create `backend/apps/outline/tests/test_outline_kb_views.py`:

```python
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.knowledge.models import KnowledgeBase
from apps.outline.models import Outline, OutlineKnowledgeBase
from apps.projects.models import Lot, Project

User = get_user_model()


@pytest.mark.django_db
class TestOutlineKbBindingApi:
    def setup_method(self):
        self.user = User.objects.create_user(username="u", password="p")
        project = Project.objects.create(name="P", created_by=self.user)
        lot = Lot.objects.create(name="L", project=project)
        self.outline = Outline.objects.create(
            project=project, lot=lot, name="O", source="preset", created_by=self.user
        )
        self.kb = KnowledgeBase.objects.create(
            name="KB", kb_type="company_profile", created_by=self.user
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_list_empty_bindings(self):
        resp = self.client.get(f"/api/outlines/{self.outline.id}/knowledge-bases/")
        assert resp.status_code == 200
        assert resp.data == []

    def test_bind_kb(self):
        resp = self.client.post(
            f"/api/outlines/{self.outline.id}/knowledge-bases/",
            {"kb_ids": [self.kb.id]}, format="json"
        )
        assert resp.status_code == 201
        assert OutlineKnowledgeBase.objects.filter(outline=self.outline).count() == 1

    def test_unbind_kb(self):
        binding = OutlineKnowledgeBase.objects.create(
            outline=self.outline, knowledge_base=self.kb
        )
        resp = self.client.delete(
            f"/api/outlines/{self.outline.id}/knowledge-bases/{binding.id}/"
        )
        assert resp.status_code == 204
        assert not OutlineKnowledgeBase.objects.filter(id=binding.id).exists()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest apps/outline/tests/test_outline_kb_views.py -v`
Expected: FAIL (404 路由不存在)

- [ ] **Step 3: Create serializers**

Create `backend/apps/outline/serializers/outline_kb_serializer.py`:

```python
"""大纲-知识库绑定序列化器。"""

from rest_framework import serializers

from apps.outline.models import OutlineKnowledgeBase


class OutlineKnowledgeBaseSerializer(serializers.ModelSerializer):
    kb_name = serializers.CharField(source="knowledge_base.name", read_only=True)
    kb_type = serializers.CharField(source="knowledge_base.kb_type", read_only=True)
    rag_channel = serializers.CharField(source="knowledge_base.rag_channel", read_only=True)
    document_count = serializers.IntegerField(
        source="knowledge_base.document_count", read_only=True
    )

    class Meta:
        model = OutlineKnowledgeBase
        fields = [
            "id", "outline", "knowledge_base", "kb_name", "kb_type",
            "rag_channel", "document_count", "sort_order", "is_active",
            "created_at",
        ]
        read_only_fields = ["outline", "created_at"]


class OutlineKbBindingSerializer(serializers.Serializer):
    """批量绑定请求。"""
    kb_ids = serializers.ListField(
        child=serializers.IntegerField(), min_length=1, max_length=50
    )
```

- [ ] **Step 4: Create views**

Create `backend/apps/outline/views/outline_kb_views.py`:

```python
"""大纲-知识库绑定 + 章节 RAG 视图。"""

import uuid

from django.contrib.auth import get_user_model
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.knowledge.services.retrieval_orchestrator import RetrievalOrchestrator
from apps.outline.models import (
    Outline, OutlineKnowledgeBase, Section, SectionGenerationRecord, SectionManualSource,
)
from apps.outline.serializers.outline_kb_serializer import (
    OutlineKnowledgeBaseSerializer, OutlineKbBindingSerializer,
)

User = get_user_model()


class OutlineKnowledgeBaseViewSet(viewsets.ModelViewSet):
    """大纲知识库绑定。"""
    serializer_class = OutlineKnowledgeBaseSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        outline_id = self.kwargs.get("outline_id")
        return OutlineKnowledgeBase.objects.filter(outline_id=outline_id)

    def create(self, request, *args, **kwargs):
        """批量绑定。"""
        outline_id = self.kwargs["outline_id"]
        serializer = OutlineKbBindingSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        kb_ids = serializer.validated_data["kb_ids"]

        outline = Outline.objects.get(pk=outline_id)
        created = []
        for sort_order, kb_id in enumerate(kb_ids):
            obj, _ = OutlineKnowledgeBase.objects.get_or_create(
                outline=outline, knowledge_base_id=kb_id,
                defaults={"sort_order": sort_order, "created_by": request.user},
            )
            created.append(obj)
        return Response(
            OutlineKnowledgeBaseSerializer(created, many=True).data,
            status=status.HTTP_201_CREATED,
        )

    def destroy(self, request, *args, **kwargs):
        outline_id = self.kwargs["outline_id"]
        binding_id = self.kwargs["pk"]
        OutlineKnowledgeBase.objects.filter(
            id=binding_id, outline_id=outline_id
        ).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def partial_update(self, request, *args, **kwargs):
        outline_id = self.kwargs["outline_id"]
        binding_id = self.kwargs["pk"]
        binding = OutlineKnowledgeBase.objects.get(id=binding_id, outline_id=outline_id)
        for field in ("sort_order", "is_active"):
            if field in request.data:
                setattr(binding, field, request.data[field])
        binding.save()
        return Response(OutlineKnowledgeBaseSerializer(binding).data)


class SectionRetrievalSearchView(APIView):
    """章节手动检索。"""
    permission_classes = [IsAuthenticated]

    def post(self, request, section_id):
        section = Section.objects.get(pk=section_id)
        query = request.data.get("query", section.title or "")
        channels = request.data.get("channels")
        knowledge_base_ids = request.data.get("knowledge_base_ids")
        top_k = request.data.get("top_k", 10)

        orchestrator = RetrievalOrchestrator()
        plan = orchestrator._plan_retrieval(
            outline=section.outline, section=section, user=request.user,
            generation_mode=None, analysis_result=None,
            override_kb_ids=knowledge_base_ids,
        )
        if channels:
            plan.channel_queries = [
                cq for cq in plan.channel_queries if cq.channel in channels
            ]
        ctx = orchestrator._execute(
            plan, request.user, str(uuid.uuid4()),
            manual_sources=None, manual_source_mode="auto",
        )
        return Response({
            "retrieval_run_id": ctx.retrieval_run_id,
            "results": ctx.sources,
            "warnings": ctx.warnings,
        })


class SectionManualSourceViewSet(viewsets.ModelViewSet):
    """章节人工选源 CRUD。"""
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        section_id = self.kwargs.get("section_id")
        return SectionManualSource.objects.filter(section_id=section_id)

    def list(self, request, *args, **kwargs):
        qs = self.get_queryset()
        data = [
            {
                "id": m.id, "chunk_id": m.chunk_id, "document_id": m.document_id,
                "document_title": m.document_title, "kb_id": m.kb_id, "kb_name": m.kb_name,
                "channel": m.channel, "content_preview": m.content_preview,
                "section_path": m.section_path, "page_start": m.page_start,
                "page_end": m.page_end, "created_at": m.created_at,
            }
            for m in qs
        ]
        return Response(data)

    def create(self, request, *args, **kwargs):
        section_id = self.kwargs["section_id"]
        sources = request.data.get("sources", [])
        created = []
        for s in sources:
            obj, _ = SectionManualSource.objects.update_or_create(
                section_id=section_id, chunk_id=s["chunk_id"],
                defaults={
                    "document_id": s.get("document_id"),
                    "document_title": s.get("document_title", ""),
                    "kb_id": s.get("kb_id"),
                    "kb_name": s.get("kb_name", ""),
                    "channel": s.get("channel", "company_info"),
                    "content_preview": s.get("content_preview", ""),
                    "section_path": s.get("section_path", ""),
                    "page_start": s.get("page_start"),
                    "page_end": s.get("page_end"),
                    "selected_by": request.user,
                },
            )
            created.append(obj)
        return Response({"created_count": len(created)}, status=status.HTTP_201_CREATED)

    def destroy(self, request, *args, **kwargs):
        section_id = self.kwargs["section_id"]
        source_id = self.kwargs["pk"]
        SectionManualSource.objects.filter(
            id=source_id, section_id=section_id
        ).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class SectionLatestGenerationRecordView(APIView):
    """章节最近生成记录（含 rag_sources）。"""
    permission_classes = [IsAuthenticated]

    def get(self, request, section_id):
        record = (
            SectionGenerationRecord.objects.filter(section_id=section_id)
            .order_by("-created_at")
            .first()
        )
        if not record:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response({
            "id": record.id,
            "status": record.status,
            "rag_sources": record.rag_sources or [],
            "generation_meta": record.generation_meta or {},
            "finished_at": record.finished_at,
            "created_at": record.created_at,
        })
```

- [ ] **Step 5: Register URLs**

在 `backend/apps/outline/urls.py` 的 `urlpatterns` 列表末尾追加（在原有 `]` 之前）:

```python
from apps.outline.views.outline_kb_views import (
    OutlineKnowledgeBaseViewSet,
    SectionRetrievalSearchView,
    SectionManualSourceViewSet,
    SectionLatestGenerationRecordView,
)
```

并在 `urlpatterns = router.urls + [...]` 列表内追加:

```python
    # 大纲知识库绑定
    path("outlines/<int:outline_id>/knowledge-bases/",
         OutlineKnowledgeBaseViewSet.as_view({"get": "list", "post": "create"}),
         name="outline-kb-list"),
    path("outlines/<int:outline_id>/knowledge-bases/<int:pk>/",
         OutlineKnowledgeBaseViewSet.as_view({"delete": "destroy", "patch": "partial_update"}),
         name="outline-kb-detail"),
    # 章节手动检索
    path("sections/<int:section_id>/retrieval/search/",
         SectionRetrievalSearchView.as_view(), name="section-retrieval-search"),
    # 章节人工选源
    path("sections/<int:section_id>/manual-sources/",
         SectionManualSourceViewSet.as_view({"get": "list", "post": "create"}),
         name="section-manual-source-list"),
    path("sections/<int:section_id>/manual-sources/<int:pk>/",
         SectionManualSourceViewSet.as_view({"delete": "destroy"}),
         name="section-manual-source-detail"),
    # 章节最近生成记录
    path("sections/<int:section_id>/generation-records/latest/",
         SectionLatestGenerationRecordView.as_view(), name="section-latest-record"),
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && python -m pytest apps/outline/tests/test_outline_kb_views.py -v`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/apps/outline/serializers/outline_kb_serializer.py backend/apps/outline/views/outline_kb_views.py backend/apps/outline/urls.py backend/apps/outline/tests/test_outline_kb_views.py
git commit -m "feat(outline): KB 绑定 + 手动检索 + 人工选源 + 最近生成记录 API"
```

---

### Task 14: 前端 - KB 绑定弹窗 + API

**Files:**
- Create: `frontend/src/api/outlineKb.ts`
- Create: `frontend/src/components/outline/OutlineKbBindingDialog.vue`
- Modify: `frontend/src/views/outline/OutlineDetailView.vue`

**Interfaces:**
- Produces: `OutlineKbBindingDialog` 组件（多选 KB + 按 kb_type 分组），API 模块

- [ ] **Step 1: Create API module**

Create `frontend/src/api/outlineKb.ts`:

```typescript
import http from './http'

export interface OutlineKbBinding {
  id: number
  outline: number
  knowledge_base: number
  kb_name: string
  kb_type: string
  rag_channel: string
  document_count: number
  sort_order: number
  is_active: boolean
  created_at: string
}

export interface KnowledgeBaseOption {
  id: number
  name: string
  description: string
  kb_type: string
  rag_channel: string
  document_count: number
}

export function listOutlineKbBindings(outlineId: number) {
  return http.get<OutlineKbBinding[]>(`/api/outlines/${outlineId}/knowledge-bases/`)
}

export function bindOutlineKbs(outlineId: number, kbIds: number[]) {
  return http.post(`/api/outlines/${outlineId}/knowledge-bases/`, { kb_ids: kbIds })
}

export function unbindOutlineKb(outlineId: number, bindingId: number) {
  return http.delete(`/api/outlines/${outlineId}/knowledge-bases/${bindingId}/`)
}

export function patchOutlineKb(outlineId: number, bindingId: number, data: { sort_order?: number; is_active?: boolean }) {
  return http.patch(`/api/outlines/${outlineId}/knowledge-bases/${bindingId}/`, data)
}

export function listAvailableKbs() {
  return http.get<KnowledgeBaseOption[]>('/api/knowledge/bases/?page_size=100')
}

export function searchSectionRetrieval(sectionId: number, data: {
  query?: string
  channels?: string[]
  knowledge_base_ids?: number[]
  top_k?: number
}) {
  return http.post<{
    retrieval_run_id: string
    results: Array<Record<string, unknown>>
    warnings: string[]
  }>(`/api/sections/${sectionId}/retrieval/search/`, data)
}

export function listSectionManualSources(sectionId: number) {
  return http.get(`/api/sections/${sectionId}/manual-sources/`)
}

export function saveSectionManualSources(sectionId: number, sources: Array<Record<string, unknown>>) {
  return http.post(`/api/sections/${sectionId}/manual-sources/`, { sources })
}

export function deleteSectionManualSource(sectionId: number, sourceId: number) {
  return http.delete(`/api/sections/${sectionId}/manual-sources/${sourceId}/`)
}

export function getSectionLatestRecord(sectionId: number) {
  return http.get<{
    id: number
    status: string
    rag_sources: Array<Record<string, unknown>>
    generation_meta: Record<string, unknown>
    finished_at: string | null
    created_at: string
  }>(`/api/sections/${sectionId}/generation-records/latest/`)
}
```

- [ ] **Step 2: Create OutlineKbBindingDialog component**

Create `frontend/src/components/outline/OutlineKbBindingDialog.vue`:

```vue
<template>
  <el-dialog v-model="visible" title="关联知识库" width="700px" @open="loadAvailableKbs">
    <div class="kb-binding-content">
      <el-input v-model="searchQuery" placeholder="搜索知识库名称" clearable class="search-input" />

      <div v-for="group in groupedKbs" :key="group.kbType" class="kb-group">
        <div class="group-title">{{ group.label }}（{{ group.kbs.length }}）</div>
        <el-checkbox-group v-model="selectedKbIds">
          <div v-for="kb in group.kbs" :key="kb.id" class="kb-item">
            <el-checkbox :label="kb.id" :disabled="isAlreadyBound(kb.id)">
              <span class="kb-name">{{ kb.name }}</span>
              <span class="kb-meta">（{{ kb.document_count }} 文档）</span>
              <el-tag v-if="kb.rag_channel" size="small" type="info" class="channel-tag">
                {{ kb.rag_channel }}
              </el-tag>
              <el-tag v-if="isAlreadyBound(kb.id)" size="small" type="success">已添加</el-tag>
            </el-checkbox>
          </div>
        </el-checkbox-group>
      </div>
    </div>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="handleBind">
        关联选中（{{ selectedKbIds.length }}）
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, defineModel } from 'vue'
import { ElMessage } from 'element-plus'
import {
  listAvailableKbs, bindOutlineKbs,
  type KnowledgeBaseOption,
} from '@/api/outlineKb'

const props = defineProps<{ outlineId: number; boundKbIds: number[] }>()
const emit = defineEmits<{ bound: [] }>()
const visible = defineModel<boolean>('visible')

const searchQuery = ref('')
const availableKbs = ref<KnowledgeBaseOption[]>([])
const selectedKbIds = ref<number[]>([])
const submitting = ref(false)

const KB_TYPE_LABELS: Record<string, string> = {
  company_profile: '公司介绍库',
  case_library: '项目案例库',
  qualification: '资质证书库',
  product: '产品资料库',
  bid_history: '历史标书库',
  technical_solution: '技术方案库',
}

const filteredKbs = computed(() => {
  if (!searchQuery.value) return availableKbs.value
  return availableKbs.value.filter(kb =>
    kb.name.includes(searchQuery.value)
  )
})

const groupedKbs = computed(() => {
  const groups: Record<string, KnowledgeBaseOption[]> = {}
  for (const kb of filteredKbs.value) {
    if (!groups[kb.kb_type]) groups[kb.kb_type] = []
    groups[kb.kb_type].push(kb)
  }
  return Object.entries(groups).map(([kbType, kbs]) => ({
    kbType, kbs, label: KB_TYPE_LABELS[kbType] || kbType,
  }))
})

function isAlreadyBound(kbId: number) {
  return props.boundKbIds.includes(kbId)
}

async function loadAvailableKbs() {
  try {
    const res = await listAvailableKbs()
    availableKbs.value = (res.data as unknown as KnowledgeBaseOption[]) || []
  } catch (e) {
    ElMessage.error('加载知识库列表失败')
  }
}

async function handleBind() {
  if (selectedKbIds.value.length === 0) {
    ElMessage.warning('请至少选择一个知识库')
    return
  }
  submitting.value = true
  try {
    await bindOutlineKbs(props.outlineId, selectedKbIds.value)
    ElMessage.success(`已关联 ${selectedKbIds.value.length} 个知识库`)
    selectedKbIds.value = []
    visible.value = false
    emit('bound')
  } catch (e) {
    ElMessage.error('关联失败')
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.kb-binding-content { max-height: 60vh; overflow-y: auto; }
.search-input { margin-bottom: 16px; }
.kb-group { margin-bottom: 16px; }
.group-title { font-weight: 600; margin-bottom: 8px; color: #303133; }
.kb-item { margin-bottom: 8px; }
.kb-name { font-weight: 500; }
.kb-meta { color: #909399; font-size: 13px; margin-left: 4px; }
.channel-tag { margin-left: 8px; }
</style>
```

- [ ] **Step 3: Wire dialog into OutlineDetailView**

读 `frontend/src/views/outline/OutlineDetailView.vue`，在模板材料包区域附近追加「知识库关联」卡片，并在 `<script setup>` 区追加 import 与 ref/load/unbind/toggle 函数，在 `onMounted` 或大纲加载后调用 `loadKbBindings()`。具体插入位置按实际代码结构。

模板片段:

```vue
<el-card class="kb-binding-card" shadow="never">
  <template #header>
    <div class="card-header">
      <span>知识库关联</span>
      <el-button type="primary" size="small" @click="openKbBindingDialog">添加知识库</el-button>
    </div>
  </template>
  <div v-if="kbBindings.length === 0" class="empty-tip">
    未关联知识库，矩阵生成将仅使用招标条款
  </div>
  <div v-else>
    <div v-for="b in kbBindings" :key="b.id" class="kb-binding-item">
      <el-tag size="small">{{ b.kb_type }}</el-tag>
      <span class="kb-name">{{ b.kb_name }}</span>
      <span class="kb-doc-count">（{{ b.document_count }} 文档）</span>
      <el-switch v-model="b.is_active" size="small" @change="toggleKbActive(b)" />
      <el-button type="danger" size="small" link @click="unbindKb(b)">移除</el-button>
    </div>
  </div>
</el-card>

<OutlineKbBindingDialog
  v-model:visible="kbDialogVisible"
  :outline-id="outlineId"
  :bound-kb-ids="kbBindings.map(b => b.knowledge_base)"
  @bound="loadKbBindings"
/>
```

script setup 片段:

```typescript
import OutlineKbBindingDialog from '@/components/outline/OutlineKbBindingDialog.vue'
import {
  listOutlineKbBindings, unbindOutlineKb, patchOutlineKb,
  type OutlineKbBinding,
} from '@/api/outlineKb'

const kbBindings = ref<OutlineKbBinding[]>([])
const kbDialogVisible = ref(false)

async function loadKbBindings() {
  try {
    const res = await listOutlineKbBindings(outlineId.value)
    kbBindings.value = (res.data as unknown as OutlineKbBinding[]) || []
  } catch (e) {
    console.error('加载知识库绑定失败', e)
  }
}

function openKbBindingDialog() {
  kbDialogVisible.value = true
}

async function unbindKb(binding: OutlineKbBinding) {
  try {
    await unbindOutlineKb(outlineId.value, binding.id)
    ElMessage.success('已移除')
    await loadKbBindings()
  } catch (e) {
    ElMessage.error('移除失败')
  }
}

async function toggleKbActive(binding: OutlineKbBinding) {
  try {
    await patchOutlineKb(outlineId.value, binding.id, { is_active: binding.is_active })
  } catch (e) {
    ElMessage.error('切换失败')
    await loadKbBindings()
  }
}
```

- [ ] **Step 4: Type check frontend**

Run: `cd frontend && npx vue-tsc --noEmit`
Expected: 无错误

- [ ] **Step 5: Build frontend**

Run: `cd frontend && npm run build`
Expected: built successfully

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/outlineKb.ts frontend/src/components/outline/OutlineKbBindingDialog.vue frontend/src/views/outline/OutlineDetailView.vue
git commit -m "feat(frontend): 大纲知识库关联区域 + 多选绑定弹窗"
```

---

### Task 15: 前端 - 生成矩阵引导 + 章节参考来源双 Tab

**Files:**
- Modify: `frontend/src/views/outline/OutlineDetailView.vue` — 生成矩阵引导
- Create: `frontend/src/components/outline/SectionReferenceSources.vue` — Tab 1 生成参考来源
- Create: `frontend/src/components/outline/SectionManualRetrieval.vue` — Tab 2 手动检索

**Interfaces:**
- Consumes: `getSectionLatestRecord / searchSectionRetrieval / listSectionManualSources / saveSectionManualSources / deleteSectionManualSource` (Task 14)

- [ ] **Step 1: Create SectionReferenceSources (Tab 1)**

Create `frontend/src/components/outline/SectionReferenceSources.vue`:

```vue
<template>
  <div class="reference-sources">
    <div v-if="loading" class="loading-tip">加载中...</div>
    <div v-else-if="sources.length === 0" class="empty-tip">
      本次生成未使用 RAG 参考来源
    </div>
    <div v-else>
      <div class="panel-hint">本次 AI 生成时使用的参考来源，人工编辑后可能不一致。</div>
      <div v-for="(src, idx) in sources" :key="idx" class="source-item">
        <div class="source-header">
          <span class="source-rank">#{{ src.rank }}</span>
          <span class="source-title">{{ src.document_title }}</span>
          <el-tag size="small" type="info">{{ channelLabel(src.channel) }}</el-tag>
          <el-tag size="small">{{ src.kb_name }}</el-tag>
          <span class="source-score">分数 {{ src.score }}</span>
        </div>
        <div class="source-meta">
          <span v-if="src.section_path">路径: {{ src.section_path }}</span>
          <span v-if="src.page_start">页码: {{ src.page_start }}-{{ src.page_end }}</span>
        </div>
      </div>
      <el-collapse class="trace-collapse">
        <el-collapse-item title="检索 trace（调试）" name="trace">
          <pre>{{ JSON.stringify(trace, null, 2) }}</pre>
        </el-collapse-item>
      </el-collapse>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { getSectionLatestRecord } from '@/api/outlineKb'

const props = defineProps<{ sectionId: number }>()

const loading = ref(false)
const sources = ref<Array<Record<string, any>>>([])
const trace = ref<Record<string, any>>({})

const CHANNEL_LABELS: Record<string, string> = {
  company_info: '公司信息',
  historical_bid: '历史标书',
  project_case: '项目案例',
  certificate: '资质证书',
  personnel: '人员资料',
}

function channelLabel(ch: string) {
  return CHANNEL_LABELS[ch] || ch
}

async function loadRecord() {
  loading.value = true
  try {
    const res = await getSectionLatestRecord(props.sectionId)
    const data = res.data as any
    sources.value = data.rag_sources || []
    trace.value = (data.generation_meta || {}).retrieval || {}
  } catch (e) {
    sources.value = []
  } finally {
    loading.value = false
  }
}

watch(() => props.sectionId, loadRecord, { immediate: true })
</script>

<style scoped>
.loading-tip, .empty-tip { color: #909399; padding: 16px; text-align: center; }
.panel-hint { color: #909399; font-size: 12px; margin-bottom: 12px; }
.source-item { border: 1px solid #ebeef5; border-radius: 4px; padding: 12px; margin-bottom: 8px; }
.source-header { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.source-rank { font-weight: 600; color: #409eff; }
.source-title { font-weight: 500; }
.source-score { margin-left: auto; color: #909399; font-size: 12px; }
.source-meta { font-size: 12px; color: #909399; display: flex; gap: 16px; }
.trace-collapse { margin-top: 16px; }
.trace-collapse pre { font-size: 12px; background: #f5f7fa; padding: 12px; overflow-x: auto; }
</style>
```

- [ ] **Step 2: Create SectionManualRetrieval (Tab 2)**

Create `frontend/src/components/outline/SectionManualRetrieval.vue`:

```vue
<template>
  <div class="manual-retrieval">
    <div class="search-bar">
      <el-input v-model="query" placeholder="检索词（默认章节标题+写作范围）" class="query-input" />
      <el-select v-model="selectedChannels" multiple placeholder="通道（空=全部）" class="channel-select">
        <el-option label="公司信息" value="company_info" />
        <el-option label="历史标书" value="historical_bid" />
        <el-option label="项目案例" value="project_case" />
        <el-option label="资质证书" value="certificate" />
        <el-option label="人员资料" value="personnel" />
      </el-select>
      <el-button type="primary" :loading="searching" @click="handleSearch">检索</el-button>
    </div>

    <div class="hint">手动检索结果不会覆盖本次生成参考来源。勾选后的材料可用于下一次重新生成。</div>

    <div v-if="results.length > 0" class="results-section">
      <div class="section-title">检索结果（{{ results.length }}）</div>
      <div v-for="(r, idx) in results" :key="idx" class="result-item">
        <el-checkbox v-model="checkedIds" :label="r.chunk_id">
          <span class="result-title">{{ r.document_title }}</span>
          <el-tag size="small" type="info">{{ r.channel }}</el-tag>
          <span class="result-score">{{ r.score }}</span>
        </el-checkbox>
        <div class="result-preview">{{ r.content_preview?.slice(0, 100) }}...</div>
      </div>
      <el-button type="success" :disabled="checkedIds.length === 0" :loading="saving" @click="handleSave">
        加入本章节参考材料（{{ checkedIds.length }}）
      </el-button>
    </div>

    <div v-if="savedSources.length > 0" class="saved-section">
      <div class="section-title">已保存的人工选源（{{ savedSources.length }}）</div>
      <div v-for="s in savedSources" :key="s.id" class="saved-item">
        <span>{{ s.document_title }}</span>
        <el-tag size="small">{{ s.channel }}</el-tag>
        <el-button type="danger" size="small" link @click="handleDelete(s)">删除</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  searchSectionRetrieval, listSectionManualSources,
  saveSectionManualSources, deleteSectionManualSource,
} from '@/api/outlineKb'

const props = defineProps<{ sectionId: number; defaultQuery?: string }>()

const query = ref('')
const selectedChannels = ref<string[]>([])
const results = ref<Array<Record<string, any>>>([])
const checkedIds = ref<number[]>([])
const savedSources = ref<Array<Record<string, any>>>([])
const searching = ref(false)
const saving = ref(false)

watch(() => props.sectionId, () => {
  query.value = props.defaultQuery || ''
  loadSavedSources()
}, { immediate: true })

async function handleSearch() {
  searching.value = true
  try {
    const res = await searchSectionRetrieval(props.sectionId, {
      query: query.value || undefined,
      channels: selectedChannels.value.length > 0 ? selectedChannels.value : undefined,
    })
    results.value = (res.data as any).results || []
    checkedIds.value = []
  } catch (e) {
    ElMessage.error('检索失败')
  } finally {
    searching.value = false
  }
}

async function handleSave() {
  saving.value = true
  try {
    const selected = results.value.filter(r => checkedIds.value.includes(r.chunk_id))
    await saveSectionManualSources(props.sectionId, selected)
    ElMessage.success(`已保存 ${selected.length} 条`)
    checkedIds.value = []
    await loadSavedSources()
  } catch (e) {
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

async function loadSavedSources() {
  try {
    const res = await listSectionManualSources(props.sectionId)
    savedSources.value = (res.data as any) || []
  } catch (e) {
    savedSources.value = []
  }
}

async function handleDelete(source: Record<string, any>) {
  try {
    await deleteSectionManualSource(props.sectionId, source.id)
    ElMessage.success('已删除')
    await loadSavedSources()
  } catch (e) {
    ElMessage.error('删除失败')
  }
}
</script>

<style scoped>
.search-bar { display: flex; gap: 8px; margin-bottom: 12px; }
.query-input { flex: 1; }
.channel-select { width: 240px; }
.hint { color: #909399; font-size: 12px; margin-bottom: 16px; }
.results-section, .saved-section { margin-top: 16px; }
.section-title { font-weight: 600; margin-bottom: 8px; }
.result-item { border: 1px solid #ebeef5; border-radius: 4px; padding: 8px; margin-bottom: 8px; }
.result-title { font-weight: 500; margin: 0 8px; }
.result-score { color: #909399; font-size: 12px; margin-left: auto; }
.result-preview { color: #606266; font-size: 12px; margin-top: 4px; padding-left: 24px; }
.saved-item { display: flex; align-items: center; gap: 8px; padding: 8px; border-bottom: 1px solid #f0f0f0; }
</style>
```

- [ ] **Step 3: Wire dual tabs + generate matrix guidance into OutlineDetailView**

在 `OutlineDetailView.vue` 章节详情抽屉区域追加双 Tab:

```vue
<el-tabs class="reference-tabs">
  <el-tab-pane label="生成参考来源">
    <SectionReferenceSources :section-id="selectedSection.id" />
  </el-tab-pane>
  <el-tab-pane label="手动检索材料">
    <SectionManualRetrieval
      :section-id="selectedSection.id"
      :default-query="`${selectedSection.title} ${selectedSection.content_matrix?.write_scope || ''}`"
    />
  </el-tab-pane>
</el-tabs>
```

script setup 追加:

```typescript
import SectionReferenceSources from '@/components/outline/SectionReferenceSources.vue'
import SectionManualRetrieval from '@/components/outline/SectionManualRetrieval.vue'
```

并改造 `handleGenerateMatrix` 函数（在矩阵生成调用前加引导）:

```typescript
async function handleGenerateMatrix() {
  if (kbBindings.value.filter(b => b.is_active).length === 0) {
    try {
      await ElMessageBox.confirm(
        '当前大纲未关联知识库。矩阵生成将仅基于招标条款，可能写出公司无法支撑的章节。\n是否现在关联知识库？',
        '关联知识库',
        { confirmButtonText: '去关联', cancelButtonText: '继续生成', type: 'warning' }
      )
      openKbBindingDialog()
      return
    } catch {
      // 用户选「继续生成」→ 走原流程
    }
  }
  // 原有矩阵生成调用（按实际函数名保留）
}
```

- [ ] **Step 4: Type check and build**

Run:
```bash
cd frontend && npx vue-tsc --noEmit && npm run build
```
Expected: success

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/outline/SectionReferenceSources.vue frontend/src/components/outline/SectionManualRetrieval.vue frontend/src/views/outline/OutlineDetailView.vue
git commit -m "feat(frontend): 章节参考来源双 Tab + 生成矩阵 KB 引导"
```

---

### Task 16: 部署验证

**Files:**
- 无新文件，部署现有改动

**Interfaces:**
- 全链路验证

- [ ] **Step 1: Build frontend**

Run: `cd frontend && npm run build`
Expected: built successfully

- [ ] **Step 2: Build Docker images**

Run: `docker compose build web worker beat`
Expected: images built

- [ ] **Step 3: Restart services**

Run: `docker compose up -d web worker beat`
Expected: containers running

- [ ] **Step 4: Run migrations**

Run: `docker exec ai-bid-generator-web-1 python manage.py migrate`
Expected: migrations applied (Task 1/2/3 的迁移)

- [ ] **Step 5: Restart nginx**

Run: `docker compose restart nginx`
Expected: nginx restarted

- [ ] **Step 6: Verify login**

Run:
```bash
docker logs --tail 20 ai-bid-generator-web-1
curl -s http://localhost/api/auth/login -X POST -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}'
```
Expected: web 容器无报错，登录返回 token

- [ ] **Step 7: Smoke test - KB binding**

通过前端或 curl：
1. 创建知识库（如未存在）
2. 大纲详情页关联知识库
3. 点击「生成矩阵」→ 验证引导弹窗（未绑 KB 时）
4. 关联后重新生成矩阵 → 验证 `GenerationTask.result.metadata_snapshot_summary` 含 `has_kb_bindings: true`
5. 章节详情查看「生成参考来源」Tab → 验证 rag_sources 展示

- [ ] **Step 8: Commit deployment note (optional)**

如有部署配置调整，提交。否则跳过。
