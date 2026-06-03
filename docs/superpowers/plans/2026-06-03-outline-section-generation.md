# 大纲提取与章节生成 - 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现大纲提取与章节生成功能，支持预设模板创建和AI解析创建，支持单章节/批量生成，整合知识库RAG检索。

**Architecture:**
- `outline` app 负责业务编排（大纲、章节、版本、生成记录）
- `generation` app 作为 AI 能力层，通过 PromptScenario 调用
- Celery 异步任务处理章节生成，AsyncTask 跟踪进度

**Tech Stack:** Django + DRF + Celery + Vue 3 + TypeScript + Element Plus + TipTap

---

## File Structure

### Backend 新建文件

```
backend/apps/outline/
├── constants.py                      # 状态常量
├── models/
│   ├── __init__.py
│   ├── outline.py                    # Outline 模型
│   ├── section.py                    # Section 模型
│   ├── section_version.py            # SectionVersion 模型
│   ├── section_generation_record.py  # SectionGenerationRecord 模型
│   └── preset_template.py            # PresetOutlineTemplate, PresetSectionTemplate
├── services/
│   ├── __init__.py
│   ├── outline_service.py            # 大纲创建服务
│   ├── section_tree_service.py       # 章节树维护服务
│   └── section_generation_service.py # 章节生成编排服务
├── tasks.py                          # Celery 任务
├── permissions.py                    # 权限码定义
├── serializers.py                    # DRF 序列化器
├── views.py                          # API 视图
└── urls.py                           # URL 路由
```

### Backend 修改文件

```
backend/apps/generation/constants.py  # 新增 PromptScenario
backend/apps/projects/permissions.py  # 注册新权限码
```

### Frontend 新建文件

```
frontend/src/api/outline.ts           # 大纲/章节 API
frontend/src/views/outline/
├── OutlineListView.vue               # 大纲列表页
├── OutlineDetailView.vue             # 大纲详情页
└── components/
    ├── SectionTree.vue               # 章节树组件
    ├── SectionEditDrawer.vue         # 章节编辑抽屉
    └── SectionGenerateDialog.vue     # 章节生成对话框
```

### Frontend 修改文件

```
frontend/src/router/index.ts          # 添加路由
```

---

## Task 1: 常量与权限定义

**Files:**
- Create: `backend/apps/outline/constants.py`
- Create: `backend/apps/outline/permissions.py`

- [ ] **Step 1: 创建 constants.py**

```python
# backend/apps/outline/constants.py
"""大纲模块常量定义。"""


class OutlineSource:
    """大纲来源。"""

    PRESET = "preset"
    AI_GENERATED = "ai"

    CHOICES = [
        (PRESET, "系统预设"),
        (AI_GENERATED, "AI解析"),
    ]


class OutlineStatus:
    """大纲状态。"""

    DRAFT = "draft"
    ACTIVE = "active"
    ARCHIVED = "archived"

    CHOICES = [
        (DRAFT, "草稿"),
        (ACTIVE, "活跃"),
        (ARCHIVED, "已归档"),
    ]


class SectionStatus:
    """章节编辑状态。"""

    DRAFT = "draft"
    GENERATED = "generated"
    REVIEWING = "reviewing"
    APPROVED = "approved"
    REJECTED = "rejected"

    CHOICES = [
        (DRAFT, "草稿"),
        (GENERATED, "已生成"),
        (REVIEWING, "待审核"),
        (APPROVED, "已确认"),
        (REJECTED, "已驳回"),
    ]


class SectionGenerationStatus:
    """章节生成状态。"""

    NOT_STARTED = "not_started"
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"

    CHOICES = [
        (NOT_STARTED, "未开始"),
        (PENDING, "等待中"),
        (RUNNING, "生成中"),
        (SUCCESS, "成功"),
        (FAILED, "失败"),
    ]


class SectionVersionSource:
    """章节版本来源。"""

    AI = "ai"
    MANUAL = "manual"

    CHOICES = [
        (AI, "AI生成"),
        (MANUAL, "手动编辑"),
    ]


class GenerationRecordStatus:
    """生成记录状态。"""

    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"

    CHOICES = [
        (PENDING, "等待中"),
        (RUNNING, "运行中"),
        (SUCCESS, "成功"),
        (FAILED, "失败"),
    ]
```

- [ ] **Step 2: 创建 permissions.py**

```python
# backend/apps/outline/permissions.py
"""大纲模块权限定义。"""

OUTLINE_PERMISSIONS = [
    ("outline.view", "查看大纲"),
    ("outline.manage", "管理大纲（创建/编辑/删除）"),
    ("section.view", "查看章节"),
    ("section.manage", "管理章节（新增/移动/删除）"),
    ("section.generate", "生成章节内容"),
    ("section.review", "审核章节"),
]
```

- [ ] **Step 3: Commit**

```bash
git add backend/apps/outline/constants.py backend/apps/outline/permissions.py
git commit -m "$(cat <<'EOF'
feat(outline): add constants and permissions definitions

- Add OutlineSource, OutlineStatus, SectionStatus constants
- Add SectionGenerationStatus, SectionVersionSource constants
- Add permission codes: outline.view/manage, section.view/manage/generate/review

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 数据模型 - Outline

**Files:**
- Create: `backend/apps/outline/models/__init__.py`
- Create: `backend/apps/outline/models/outline.py`

- [ ] **Step 1: 创建 models/__init__.py**

```python
# backend/apps/outline/models/__init__.py
"""大纲模块模型。"""

from .outline import Outline

__all__ = ["Outline"]
```

- [ ] **Step 2: 创建 Outline 模型**

```python
# backend/apps/outline/models/outline.py
"""大纲模型。"""

from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel
from apps.outline.constants import OutlineSource, OutlineStatus


class Outline(TimeStampedModel):
    """投标大纲。"""

    project = models.ForeignKey(
        "projects.Project",
        on_delete=models.CASCADE,
        related_name="outlines",
        verbose_name="项目",
    )
    lot = models.ForeignKey(
        "projects.Lot",
        on_delete=models.CASCADE,
        related_name="outlines",
        verbose_name="标段",
    )
    name = models.CharField("大纲名称", max_length=255)
    source = models.CharField(
        "来源",
        max_length=20,
        choices=OutlineSource.CHOICES,
    )
    status = models.CharField(
        "状态",
        max_length=20,
        choices=OutlineStatus.CHOICES,
        default=OutlineStatus.DRAFT,
    )
    is_current = models.BooleanField(
        "是否当前大纲",
        default=True,
        help_text="每个标段只能有一个当前大纲",
    )

    # AI生成来源（当 source=ai 时）
    source_tender_file = models.ForeignKey(
        "tender.TenderFile",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        verbose_name="源招标文件",
    )

    # 工作流预留（第一版不使用）
    workflow_instance = models.ForeignKey(
        "workflow.WorkflowInstance",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        verbose_name="工作流实例",
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        verbose_name="创建人",
    )

    class Meta:
        db_table = "outline"
        verbose_name = "投标大纲"
        verbose_name_plural = "投标大纲"
        constraints = [
            # 每个标段只能有一个 is_current=True 的大纲
            models.UniqueConstraint(
                fields=["lot"],
                condition=models.Q(is_current=True),
                name="uniq_current_outline_per_lot",
            ),
        ]
        indexes = [
            models.Index(fields=["project"]),
            models.Index(fields=["lot"]),
            models.Index(fields=["status"]),
            models.Index(fields=["is_current"]),
        ]

    def __str__(self):
        return self.name

    def clean(self):
        """校验 lot.project 与 project 一致性。"""
        from django.core.exceptions import ValidationError

        if self.lot_id and self.project_id:
            if self.lot.project_id != self.project_id:
                raise ValidationError({"lot": "lot 必须属于 project"})
```

- [ ] **Step 3: 更新 models/__init__.py 导入**

```python
# backend/apps/outline/models/__init__.py
"""大纲模块模型。"""

from .outline import Outline

__all__ = ["Outline"]
```

- [ ] **Step 4: Commit**

```bash
git add backend/apps/outline/models/
git commit -m "$(cat <<'EOF'
feat(outline): add Outline model

- Add Outline model with project/lot foreign keys
- Add is_current constraint: one current outline per lot
- Add source field for preset/ai distinction
- Add source_tender_file for AI-generated outlines

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 数据模型 - Section

**Files:**
- Modify: `backend/apps/outline/models/__init__.py`
- Create: `backend/apps/outline/models/section.py`

- [ ] **Step 1: 创建 Section 模型**

```python
# backend/apps/outline/models/section.py
"""章节模型。"""

from django.db import models

from apps.common.models import TimeStampedModel
from apps.outline.constants import SectionStatus, SectionGenerationStatus


class Section(TimeStampedModel):
    """大纲章节（树形结构）。"""

    outline = models.ForeignKey(
        "outline.Outline",
        on_delete=models.CASCADE,
        related_name="sections",
        verbose_name="大纲",
    )
    parent = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="children",
        verbose_name="父章节",
    )

    title = models.CharField("章节标题", max_length=500)
    level = models.PositiveIntegerField(
        "层级",
        default=1,
        help_text="根据 parent 自动计算，顶级章节为 1",
    )
    sort_order = models.PositiveIntegerField(
        "排序",
        default=0,
        help_text="同一 parent 下的排序序号",
    )

    # 章节内容（富文本 HTML）
    content = models.TextField("章节内容", blank=True)
    word_count = models.PositiveIntegerField("字数", default=0)

    # 状态
    status = models.CharField(
        "编辑状态",
        max_length=20,
        choices=SectionStatus.CHOICES,
        default=SectionStatus.DRAFT,
    )
    generation_status = models.CharField(
        "生成状态",
        max_length=20,
        choices=SectionGenerationStatus.CHOICES,
        default=SectionGenerationStatus.NOT_STARTED,
    )

    # 用户自定义提示词（生成时可编辑）
    user_prompt = models.TextField(
        "用户补充提示词",
        blank=True,
        help_text="用户在生成章节时补充的自定义要求",
    )

    class Meta:
        db_table = "outline_section"
        verbose_name = "大纲章节"
        verbose_name_plural = "大纲章节"
        ordering = ["sort_order", "id"]
        constraints = [
            # 同一 parent 下 sort_order 唯一，避免排序冲突
            models.UniqueConstraint(
                fields=["outline", "parent", "sort_order"],
                name="uniq_section_order_under_parent",
            ),
        ]
        indexes = [
            models.Index(fields=["outline", "parent", "sort_order"]),
            models.Index(fields=["outline", "level"]),
            models.Index(fields=["generation_status"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self):
        return self.title

    def clean(self):
        """校验 parent 属于同一 outline。"""
        from django.core.exceptions import ValidationError

        if self.parent_id and self.parent.outline_id != self.outline_id:
            raise ValidationError({"parent": "parent 必须属于同一 outline"})
```

- [ ] **Step 2: 更新 models/__init__.py**

```python
# backend/apps/outline/models/__init__.py
"""大纲模块模型。"""

from .outline import Outline
from .section import Section

__all__ = ["Outline", "Section"]
```

- [ ] **Step 3: Commit**

```bash
git add backend/apps/outline/models/
git commit -m "$(cat <<'EOF'
feat(outline): add Section model

- Add Section model with tree structure (parent FK)
- Add status and generation_status fields
- Add unique constraint for sort_order under same parent
- Add user_prompt for custom generation requirements

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 数据模型 - SectionVersion

**Files:**
- Modify: `backend/apps/outline/models/__init__.py`
- Create: `backend/apps/outline/models/section_version.py`

- [ ] **Step 1: 创建 SectionVersion 模型**

```python
# backend/apps/outline/models/section_version.py
"""章节版本模型。"""

from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel
from apps.outline.constants import SectionVersionSource


class SectionVersion(TimeStampedModel):
    """章节版本历史。"""

    section = models.ForeignKey(
        "outline.Section",
        on_delete=models.CASCADE,
        related_name="versions",
        verbose_name="章节",
    )
    content = models.TextField("章节内容")
    version_no = models.PositiveIntegerField(
        "版本号",
        help_text="自增，每次生成或编辑递增",
    )
    source = models.CharField(
        "来源",
        max_length=20,
        choices=SectionVersionSource.CHOICES,
    )
    word_count = models.PositiveIntegerField("字数", default=0)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        verbose_name="创建人",
    )

    class Meta:
        db_table = "outline_section_version"
        verbose_name = "章节版本"
        verbose_name_plural = "章节版本"
        constraints = [
            models.UniqueConstraint(
                fields=["section", "version_no"],
                name="uniq_section_version",
            ),
        ]
        indexes = [
            models.Index(fields=["section", "version_no"]),
        ]

    def __str__(self):
        return f"{self.section.title} v{self.version_no} ({self.source})"
```

- [ ] **Step 2: 更新 models/__init__.py**

```python
# backend/apps/outline/models/__init__.py
"""大纲模块模型。"""

from .outline import Outline
from .section import Section
from .section_version import SectionVersion

__all__ = ["Outline", "Section", "SectionVersion"]
```

- [ ] **Step 3: Commit**

```bash
git add backend/apps/outline/models/
git commit -m "$(cat <<'EOF'
feat(outline): add SectionVersion model

- Add SectionVersion for version history tracking
- Add unique constraint for (section, version_no)
- Add source field to distinguish ai/manual changes

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 数据模型 - SectionGenerationRecord

**Files:**
- Modify: `backend/apps/outline/models/__init__.py`
- Create: `backend/apps/outline/models/section_generation_record.py`

- [ ] **Step 1: 创建 SectionGenerationRecord 模型**

```python
# backend/apps/outline/models/section_generation_record.py
"""章节生成记录模型。"""

from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel
from apps.outline.constants import GenerationRecordStatus


class SectionGenerationRecord(TimeStampedModel):
    """章节生成记录。"""

    section = models.ForeignKey(
        "outline.Section",
        on_delete=models.CASCADE,
        related_name="generation_records",
        verbose_name="章节",
    )
    async_task = models.ForeignKey(
        "common.AsyncTask",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        verbose_name="异步任务",
        help_text="单章节生成关联 section_generate，批量生成关联 outline_generate_batch",
    )

    # 主要追溯来源
    prompt_run = models.ForeignKey(
        "generation.PromptRun",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        verbose_name="AI运行记录",
    )

    # 冗余快照（方便查询，不依赖外键）
    prompt_template_id = models.PositiveIntegerField(
        "提示词模板ID",
        null=True,
        blank=True,
    )
    prompt_version = models.CharField(
        "提示词版本号",
        max_length=50,
        blank=True,
    )
    llm_model = models.CharField(
        "LLM模型",
        max_length=100,
        blank=True,
    )

    # 输入输出摘要（不存完整正文）
    input_summary = models.JSONField(
        "输入摘要",
        default=dict,
        help_text="例：{'keywords': [...], 'kb_count': 5, 'requirement_count': 3}",
    )
    output_summary = models.JSONField(
        "输出摘要",
        default=dict,
        help_text="例：{'word_count': 1500, 'has_tables': true}",
    )

    error_message = models.TextField("错误信息", blank=True)

    # 工作流预留（第一版不使用）
    workflow_node = models.ForeignKey(
        "workflow.WorkflowNodeInstance",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        verbose_name="工作流节点",
    )

    status = models.CharField(
        "状态",
        max_length=20,
        choices=GenerationRecordStatus.CHOICES,
        default=GenerationRecordStatus.PENDING,
    )
    finished_at = models.DateTimeField("完成时间", null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        verbose_name="创建人",
    )

    class Meta:
        db_table = "outline_section_generation_record"
        verbose_name = "章节生成记录"
        verbose_name_plural = "章节生成记录"
        indexes = [
            models.Index(fields=["section", "status"]),
            models.Index(fields=["async_task"]),
            models.Index(fields=["prompt_run"]),
        ]

    def __str__(self):
        return f"GenerationRecord#{self.id} ({self.status})"
```

- [ ] **Step 2: 更新 models/__init__.py**

```python
# backend/apps/outline/models/__init__.py
"""大纲模块模型。"""

from .outline import Outline
from .section import Section
from .section_version import SectionVersion
from .section_generation_record import SectionGenerationRecord

__all__ = [
    "Outline",
    "Section",
    "SectionVersion",
    "SectionGenerationRecord",
]
```

- [ ] **Step 3: Commit**

```bash
git add backend/apps/outline/models/
git commit -m "$(cat <<'EOF'
feat(outline): add SectionGenerationRecord model

- Add SectionGenerationRecord for tracking generation tasks
- Add async_task, prompt_run foreign keys
- Add input_summary/output_summary for lightweight storage
- Add workflow_node FK for future integration

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: 数据模型 - PresetOutlineTemplate

**Files:**
- Modify: `backend/apps/outline/models/__init__.py`
- Create: `backend/apps/outline/models/preset_template.py`

- [ ] **Step 1: 创建 PresetOutlineTemplate 和 PresetSectionTemplate 模型**

```python
# backend/apps/outline/models/preset_template.py
"""预设大纲模板模型。"""

from django.db import models

from apps.common.models import TimeStampedModel


class PresetOutlineTemplate(TimeStampedModel):
    """预设大纲模板。"""

    name = models.CharField("模板名称", max_length=255)
    description = models.TextField("模板描述", blank=True)
    category = models.CharField(
        "分类",
        max_length=50,
        blank=True,
        help_text="如：工程类、服务类、货物类（可选）",
    )
    is_active = models.BooleanField("是否启用", default=True)

    class Meta:
        db_table = "outline_preset_template"
        verbose_name = "预设大纲模板"
        verbose_name_plural = "预设大纲模板"

    def __str__(self):
        return self.name


class PresetSectionTemplate(TimeStampedModel):
    """预设章节模板。"""

    template = models.ForeignKey(
        "outline.PresetOutlineTemplate",
        on_delete=models.CASCADE,
        related_name="sections",
        verbose_name="大纲模板",
    )
    parent = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="children",
        verbose_name="父章节模板",
    )
    title = models.CharField("章节标题", max_length=500)
    level = models.PositiveIntegerField("层级", default=1)
    sort_order = models.PositiveIntegerField("排序", default=0)

    class Meta:
        db_table = "outline_preset_section_template"
        verbose_name = "预设章节模板"
        verbose_name_plural = "预设章节模板"
        ordering = ["sort_order", "id"]

    def __str__(self):
        return self.title
```

- [ ] **Step 2: 更新 models/__init__.py**

```python
# backend/apps/outline/models/__init__.py
"""大纲模块模型。"""

from .outline import Outline
from .section import Section
from .section_version import SectionVersion
from .section_generation_record import SectionGenerationRecord
from .preset_template import PresetOutlineTemplate, PresetSectionTemplate

__all__ = [
    "Outline",
    "Section",
    "SectionVersion",
    "SectionGenerationRecord",
    "PresetOutlineTemplate",
    "PresetSectionTemplate",
]
```

- [ ] **Step 3: Commit**

```bash
git add backend/apps/outline/models/
git commit -m "$(cat <<'EOF'
feat(outline): add PresetOutlineTemplate and PresetSectionTemplate models

- Add PresetOutlineTemplate for system preset templates
- Add PresetSectionTemplate for template sections
- Support category and is_active fields

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: 数据库迁移

**Files:**
- Create: `backend/apps/outline/migrations/0001_initial.py`

- [ ] **Step 1: 生成迁移文件**

```bash
cd /home/newaibook/ai-bid-generator/backend
python manage.py makemigrations outline
```

- [ ] **Step 2: 执行迁移**

```bash
python manage.py migrate outline
```

- [ ] **Step 3: Commit**

```bash
git add backend/apps/outline/migrations/
git commit -m "$(cat <<'EOF'
feat(outline): add initial migration for outline models

- Outline, Section, SectionVersion, SectionGenerationRecord
- PresetOutlineTemplate, PresetSectionTemplate

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: SectionTreeService 服务

**Files:**
- Create: `backend/apps/outline/services/__init__.py`
- Create: `backend/apps/outline/services/section_tree_service.py`

- [ ] **Step 1: 创建 services/__init__.py**

```python
# backend/apps/outline/services/__init__.py
"""大纲模块服务。"""

from .section_tree_service import SectionTreeService

__all__ = ["SectionTreeService"]
```

- [ ] **Step 2: 创建 SectionTreeService**

```python
# backend/apps/outline/services/section_tree_service.py
"""章节树维护服务。"""

from django.db import models

from apps.outline.models import Outline, Section


class SectionTreeService:
    """章节树维护服务。"""

    def add_section(
        self,
        outline_id: int,
        parent_id: int | None,
        title: str,
    ) -> Section:
        """添加章节。

        自动计算 level 和 sort_order。
        校验：
        - parent 必须属于同一 outline
        """
        outline = Outline.objects.get(pk=outline_id)

        if parent_id:
            parent = Section.objects.get(pk=parent_id)
            # 校验 parent 属于同一 outline
            if parent.outline_id != outline_id:
                raise ValueError("parent 必须属于同一 outline")
            level = parent.level + 1
        else:
            parent = None
            level = 1

        # 自动计算 sort_order（服务层统一维护）
        max_order = (
            Section.objects.filter(outline_id=outline_id, parent=parent)
            .aggregate(max_order=models.Max("sort_order"))["max_order"]
            or 0
        )

        section = Section.objects.create(
            outline=outline,
            parent=parent,
            title=title,
            level=level,
            sort_order=max_order + 1,
        )
        return section

    def move_section(
        self,
        section_id: int,
        new_parent_id: int | None,
        new_sort_order: int,
    ) -> Section:
        """移动章节。

        校验：
        1. 不能移动到自己
        2. 不能移动到自己的子节点（避免循环）
        3. new_parent 必须属于同一 outline
        4. 重排同级 sort_order（服务层统一维护）
        """
        section = Section.objects.get(pk=section_id)

        # 校验不能移动到自己
        if section_id == new_parent_id:
            raise ValueError("不能移动到自己")

        # 校验不能移动到子节点
        if new_parent_id and self._is_descendant(section_id, new_parent_id):
            raise ValueError("不能移动到自己的子节点")

        # 确定 new_parent
        if new_parent_id:
            new_parent = Section.objects.get(pk=new_parent_id)
            if new_parent.outline_id != section.outline_id:
                raise ValueError("目标章节必须属于同一大纲")
            new_level = new_parent.level + 1
        else:
            new_parent = None
            new_level = 1

        # 重排同级 sort_order
        self._reorder_siblings(section.outline_id, new_parent, new_sort_order)

        # 更新章节
        section.parent = new_parent
        section.level = new_level
        section.sort_order = new_sort_order
        section.save()

        # 递归更新子节点 level
        self._update_children_level(section)

        return section

    def _is_descendant(self, ancestor_id: int, node_id: int) -> bool:
        """检查 node_id 是否是 ancestor_id 的后代。"""
        node = Section.objects.get(pk=node_id)
        while node.parent_id:
            if node.parent_id == ancestor_id:
                return True
            node = node.parent
        return False

    def _reorder_siblings(self, outline_id: int, parent, insert_order: int):
        """重排同级章节的 sort_order，为新插入腾出位置。"""
        siblings = Section.objects.filter(
            outline_id=outline_id,
            parent=parent,
        ).exclude(sort_order=insert_order)

        for sibling in siblings:
            if sibling.sort_order >= insert_order:
                sibling.sort_order += 1
                sibling.save()

    def _update_children_level(self, section: Section):
        """递归更新子节点的 level。"""
        for child in section.children.all():
            child.level = section.level + 1
            child.save()
            self._update_children_level(child)

    def delete_section(self, section_id: int) -> None:
        """删除章节（含子章节）。"""
        section = Section.objects.get(pk=section_id)
        # 级联删除会自动处理子章节（CASCADE）
        section.delete()

    def get_section_tree(self, outline_id: int) -> list[dict]:
        """获取章节树（扁平列表）。"""
        sections = Section.objects.filter(outline_id=outline_id).order_by(
            "sort_order", "id"
        )
        return [
            {
                "id": s.id,
                "title": s.title,
                "level": s.level,
                "sort_order": s.sort_order,
                "parent_id": s.parent_id,
                "status": s.status,
                "generation_status": s.generation_status,
                "word_count": s.word_count,
            }
            for s in sections
        ]

    def get_ancestors(self, section_id: int) -> list[Section]:
        """获取祖先章节（用于生成上下文）。"""
        ancestors = []
        section = Section.objects.get(pk=section_id)
        while section.parent_id:
            section = section.parent
            ancestors.insert(0, section)
        return ancestors

    def get_siblings(self, section_id: int) -> list[Section]:
        """获取同级章节。"""
        section = Section.objects.get(pk=section_id)
        return (
            Section.objects.filter(
                outline=section.outline,
                parent=section.parent,
            )
            .exclude(pk=section_id)
            .order_by("sort_order")
        )
```

- [ ] **Step 3: Commit**

```bash
git add backend/apps/outline/services/
git commit -m "$(cat <<'EOF'
feat(outline): add SectionTreeService

- add_section: auto-calculate level and sort_order
- move_section: prevent circular moves, reorder siblings
- delete_section: cascade delete children
- get_section_tree, get_ancestors, get_siblings

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: OutlineService 服务

**Files:**
- Modify: `backend/apps/outline/services/__init__.py`
- Create: `backend/apps/outline/services/outline_service.py`

- [ ] **Step 1: 创建 OutlineService**

```python
# backend/apps/outline/services/outline_service.py
"""大纲管理服务。"""

from django.core.exceptions import ValidationError
from django.db import transaction

from apps.outline.constants import OutlineSource, OutlineStatus
from apps.outline.models import Outline, Section, PresetOutlineTemplate


class OutlineService:
    """大纲管理服务。"""

    @transaction.atomic
    def create_from_preset(
        self,
        lot_id: int,
        template_id: int,
        name: str | None = None,
        created_by=None,
    ) -> Outline:
        """从预设模板创建大纲。

        事务内：
        1. 校验 lot.project 一致性
        2. 将同 lot 下其他 Outline.is_current 置为 False
        3. 创建新 Outline
        4. 复制模板章节到 Section
        """
        from apps.projects.models import Lot

        lot = Lot.objects.select_related("project").get(pk=lot_id)
        project = lot.project
        template = PresetOutlineTemplate.objects.get(pk=template_id, is_active=True)

        # 置空其他当前大纲
        Outline.objects.filter(lot=lot, is_current=True).update(is_current=False)

        # 创建大纲
        outline = Outline.objects.create(
            project=project,
            lot=lot,
            name=name or f"{lot.name} - {template.name}",
            source=OutlineSource.PRESET,
            status=OutlineStatus.DRAFT,
            is_current=True,
            created_by=created_by,
        )

        # 复制模板章节
        self._copy_template_sections(outline, template)

        return outline

    @transaction.atomic
    def create_from_ai(
        self,
        tender_file_id: int,
        sections_data: list[dict],
        name: str | None = None,
        created_by=None,
    ) -> Outline:
        """AI解析招标文件生成大纲。

        校验：
        - TenderFile 必须绑定 Lot

        Args:
            tender_file_id: 招标文件ID
            sections_data: AI解析返回的章节列表 [{"title": "...", "level": 1}, ...]
            name: 大纲名称（可选）
            created_by: 创建人
        """
        from apps.tender.models import TenderFile

        tender_file = TenderFile.objects.select_related("project", "lot").get(
            pk=tender_file_id
        )

        # 校验：tender_file.lot 必不为空
        if not tender_file.lot:
            raise ValidationError({"tender_file": "招标文件必须绑定标段"})

        lot = tender_file.lot
        project = tender_file.project

        # 置空其他当前大纲
        Outline.objects.filter(lot=lot, is_current=True).update(is_current=False)

        # 创建大纲
        outline = Outline.objects.create(
            project=project,
            lot=lot,
            name=name or f"{lot.name} - AI解析大纲",
            source=OutlineSource.AI_GENERATED,
            source_tender_file=tender_file,
            status=OutlineStatus.DRAFT,
            is_current=True,
            created_by=created_by,
        )

        # 创建章节
        self._create_sections_from_ai_result(outline, sections_data)

        return outline

    def _copy_template_sections(self, outline: Outline, template: PresetOutlineTemplate):
        """复制模板章节到大纲。"""
        from apps.outline.models import PresetSectionTemplate

        template_sections = PresetSectionTemplate.objects.filter(
            template=template
        ).order_by("sort_order")

        for ts in template_sections:
            Section.objects.create(
                outline=outline,
                parent=None,  # 第一版不支持复制嵌套结构
                title=ts.title,
                level=ts.level,
                sort_order=ts.sort_order,
            )

    def _create_sections_from_ai_result(
        self, outline: Outline, sections_data: list[dict]
    ):
        """从 AI 解析结果创建章节。"""
        for idx, section_data in enumerate(sections_data):
            Section.objects.create(
                outline=outline,
                parent=None,  # 第一版扁平结构
                title=section_data.get("title", ""),
                level=section_data.get("level", 1),
                sort_order=idx,
            )

    def set_current(self, outline_id: int) -> Outline:
        """设置大纲为当前大纲。"""
        outline = Outline.objects.get(pk=outline_id)

        with transaction.atomic():
            # 置空其他当前大纲
            Outline.objects.filter(lot=outline.lot, is_current=True).update(
                is_current=False
            )
            # 设置当前
            outline.is_current = True
            outline.save()

        return outline
```

- [ ] **Step 2: 更新 services/__init__.py**

```python
# backend/apps/outline/services/__init__.py
"""大纲模块服务。"""

from .outline_service import OutlineService
from .section_tree_service import SectionTreeService

__all__ = ["OutlineService", "SectionTreeService"]
```

- [ ] **Step 3: Commit**

```bash
git add backend/apps/outline/services/
git commit -m "$(cat <<'EOF'
feat(outline): add OutlineService

- create_from_preset: copy template sections to outline
- create_from_ai: create from AI-parsed sections_data
- Validate tender_file.lot is not null for AI generation
- set_current: manage is_current flag atomically

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: SectionGenerationService 服务

**Files:**
- Modify: `backend/apps/outline/services/__init__.py`
- Create: `backend/apps/outline/services/section_generation_service.py`

- [ ] **Step 1: 创建 SectionGenerationService（第一部分 - 分析与上下文准备）**

```python
# backend/apps/outline/services/section_generation_service.py
"""章节生成编排服务。"""

import logging
from django.contrib.auth import get_user_model
from django.db import models, transaction

from apps.common.models import AsyncTask
from apps.knowledge.services.retrieval_service import RetrievalService
from apps.knowledge.services.rag_context_builder import RagContextBuilder
from apps.outline.constants import (
    GenerationRecordStatus,
    SectionGenerationStatus,
    SectionStatus,
    SectionVersionSource,
)
from apps.outline.models import Section, SectionVersion, SectionGenerationRecord
from apps.outline.services.section_tree_service import SectionTreeService

User = get_user_model()
logger = logging.getLogger(__name__)


class SectionGenerationService:
    """章节生成编排服务。"""

    def analyze_section_needs(self, section_id: int) -> dict:
        """分析章节生成需求（同步调用）。

        Returns:
            {
                "keywords": ["资质证书", "项目经验"],
                "knowledge_types": ["company_qualification", "past_cases"],
                "requirement_types": ["qualification", "scoring"],
                "background": "本章节需要展示公司的技术资质...",
                "suggested_prompt": "请重点展示ISO9001认证..."
            }

        注意：分析失败返回默认建议，不影响用户手动填写提示词。
        """
        from apps.generation.services.ai_task_execution_service import (
            AiTaskExecutionService,
            PromptVersionNotFoundError,
        )

        section = Section.objects.select_related("outline", "outline__lot").get(
            pk=section_id
        )

        try:
            # 调用 AI 分析（使用 section_needs_analysis scenario）
            prompt_run = AiTaskExecutionService().execute(
                scenario="section_needs_analysis",
                variables={
                    "section_title": section.title,
                    "section_level": section.level,
                    "outline_name": section.outline.name,
                    "lot_name": section.outline.lot.name,
                },
                created_by=section.outline.created_by,
            )

            if prompt_run.status == "succeeded":
                return prompt_run.output_json or {}
            else:
                logger.warning(
                    f"Section needs analysis failed: {prompt_run.error_message}"
                )
                return self._get_default_analysis(section)

        except PromptVersionNotFoundError as e:
            logger.warning(f"PromptVersion not found: {e}")
            return self._get_default_analysis(section)
        except Exception as e:
            logger.warning(f"Section needs analysis error: {e}")
            return self._get_default_analysis(section)

    def _get_default_analysis(self, section: Section) -> dict:
        """返回默认分析结果（当 AI 分析失败时）。"""
        return {
            "keywords": [section.title],
            "knowledge_types": [],
            "requirement_types": [],
            "background": f"本章为{section.title}",
            "suggested_prompt": "",
        }
```

- [ ] **Step 2: 添加上下文准备方法**

```python
    def prepare_generation_context(
        self,
        section_id: int,
        analysis_result: dict,
        user_prompt: str,
        user_id: int,
    ) -> dict:
        """准备生成上下文（检索知识库 + 条款）。

        注意：此方法在 Celery 任务内部调用，不传递大段正文。
        """
        from apps.knowledge.models import KnowledgeBase
        from apps.requirements.models import TenderRequirement

        section = Section.objects.select_related("outline__lot").get(pk=section_id)
        outline = section.outline
        user = User.objects.get(pk=user_id)

        # 1. 检索知识库
        keywords = analysis_result.get("keywords", [])
        knowledge_base_ids = self._get_project_knowledge_bases(outline.lot.project_id)

        retrieved_knowledge = ""
        if knowledge_base_ids and keywords:
            try:
                retrieval_result = RetrievalService().search(
                    query=" ".join(keywords),
                    knowledge_base_ids=knowledge_base_ids,
                    top_k=10,
                    created_by=user,
                )
                retrieved_knowledge = RagContextBuilder().build(
                    retrieval_results=retrieval_result["results"],
                    max_tokens=4000,
                )["text"]
            except Exception as e:
                logger.warning(f"Knowledge retrieval failed: {e}")

        # 2. 获取关联条款
        related_requirements = self._get_related_requirements(
            outline.lot_id,
            analysis_result.get("requirement_types", []),
        )

        # 3. 获取父章节和前置章节内容（保持连贯性，避免重复）
        parent_context = self._get_parent_context(section)
        sibling_context = self._get_sibling_context(section)

        return {
            "section_info": {
                "title": section.title,
                "level": section.level,
                "sort_order": section.sort_order,
                "section_id": section_id,
            },
            "retrieved_knowledge": retrieved_knowledge,
            "related_requirements": related_requirements,
            "parent_context": parent_context,
            "sibling_context": sibling_context,
            "user_prompt": user_prompt,
            "analysis_result": analysis_result,
            "outline_name": outline.name,
            "lot_name": outline.lot.name,
        }

    def _get_project_knowledge_bases(self, project_id: int) -> list[int]:
        """获取项目关联的知识库。"""
        from apps.knowledge.models import KnowledgeBase

        # 第一版返回全局活跃知识库
        return list(
            KnowledgeBase.objects.filter(is_active=True).values_list("id", flat=True)[
                :5
            ]
        )

    def _get_related_requirements(
        self,
        lot_id: int,
        requirement_types: list[str],
    ) -> list[dict]:
        """获取关联的招标条款。"""
        from apps.requirements.models import TenderRequirement

        if not requirement_types:
            requirements = TenderRequirement.objects.filter(
                tender_file__lot_id=lot_id,
                is_active=True,
            ).order_by("sort_order")[:20]
        else:
            requirements = TenderRequirement.objects.filter(
                tender_file__lot_id=lot_id,
                requirement_type__in=requirement_types,
                is_active=True,
            ).order_by("sort_order")[:20]

        return [
            {
                "requirement_no": r.requirement_no,
                "title": r.title,
                "content": r.content[:500] if r.content else "",  # 摘要
                "requirement_type": r.requirement_type,
            }
            for r in requirements
        ]

    def _get_parent_context(self, section: Section) -> str:
        """获取父章节内容摘要。"""
        ancestors = SectionTreeService().get_ancestors(section.id)
        if not ancestors:
            return ""

        # 只取直接父章节的内容摘要
        parent = ancestors[-1] if ancestors else None
        if parent and parent.content:
            return f"【父章节：{parent.title}】\n{parent.content[:1000]}"

        return ""

    def _get_sibling_context(self, section: Section) -> str:
        """获取同级前置章节摘要（避免内容重复）。"""
        siblings = Section.objects.filter(
            outline=section.outline,
            parent=section.parent,
            sort_order__lt=section.sort_order,
            generation_status=SectionGenerationStatus.SUCCESS,
        ).order_by("sort_order")[:3]

        if not siblings:
            return ""

        context_parts = []
        for s in siblings:
            if s.content:
                context_parts.append(f"【{s.title}】已涵盖：{s.content[:300]}...")

        return "\n".join(context_parts)
```

- [ ] **Step 3: 添加生成方法**

```python
    @transaction.atomic
    def generate_section(
        self,
        section_id: int,
        analysis_result: dict,
        user_prompt: str,
        created_by,
        force: bool = False,
    ) -> AsyncTask:
        """生成章节内容（异步）。

        Args:
            section_id: 章节ID
            analysis_result: AI分析结果
            user_prompt: 用户补充提示词
            created_by: 创建人
            force: 是否强制重新生成

        防重逻辑：
        - 如果 generation_status in ["pending", "running"] 且 force=False
          - 返回已有 AsyncTask
        - 如果 generation_status == "running" 且 force=True
          - 不允许覆盖正在运行的任务，抛出异常

        Returns:
            AsyncTask 实例
        """
        from apps.outline.tasks import generate_section_task

        section = Section.objects.select_for_update().get(pk=section_id)

        # 并发防重
        if section.generation_status in [
            SectionGenerationStatus.PENDING,
            SectionGenerationStatus.RUNNING,
        ]:
            if not force:
                # 返回已有任务
                existing_record = SectionGenerationRecord.objects.filter(
                    section=section,
                    status__in=[
                        GenerationRecordStatus.PENDING,
                        GenerationRecordStatus.RUNNING,
                    ],
                ).first()

                if existing_record and existing_record.async_task:
                    return existing_record.async_task

            if section.generation_status == SectionGenerationStatus.RUNNING:
                # force=true 也不得覆盖 running 任务
                raise ValueError("章节正在生成中，请等待完成后再重新生成")

        # 创建 AsyncTask
        async_task = AsyncTask.objects.create(
            task_type="section_generate",
            related_object_type="Section",
            related_object_id=str(section_id),
            input_payload={
                "section_id": section_id,
                "has_analysis": bool(analysis_result),
                "has_user_prompt": bool(user_prompt),
            },
            created_by=created_by,
        )

        # 创建生成记录
        record = SectionGenerationRecord.objects.create(
            section=section,
            async_task=async_task,
            input_summary={
                "keywords": analysis_result.get("keywords", []),
                "requirement_types": analysis_result.get("requirement_types", []),
                "has_user_prompt": bool(user_prompt),
            },
            status=GenerationRecordStatus.PENDING,
            created_by=created_by,
        )

        # 更新章节状态
        section.generation_status = SectionGenerationStatus.PENDING
        section.user_prompt = user_prompt
        section.save()

        # 触发 Celery 任务（不传递大段正文）
        generate_section_task.delay(
            section_id=section_id,
            record_id=record.id,
            analysis_result=analysis_result,
            user_prompt=user_prompt,
            user_id=created_by.id,
        )

        return async_task
```

- [ ] **Step 4: 更新 services/__init__.py**

```python
# backend/apps/outline/services/__init__.py
"""大纲模块服务。"""

from .outline_service import OutlineService
from .section_tree_service import SectionTreeService
from .section_generation_service import SectionGenerationService

__all__ = [
    "OutlineService",
    "SectionTreeService",
    "SectionGenerationService",
]
```

- [ ] **Step 5: Commit**

```bash
git add backend/apps/outline/services/
git commit -m "$(cat <<'EOF'
feat(outline): add SectionGenerationService

- analyze_section_needs: sync AI call for needs analysis
- prepare_generation_context: retrieve knowledge + requirements
- generate_section: async task with concurrency guard
- Support force flag with running task protection

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Celery 任务

**Files:**
- Create: `backend/apps/outline/tasks.py`

- [ ] **Step 1: 创建 Celery 任务**

```python
# backend/apps/outline/tasks.py
"""大纲模块 Celery 任务。"""

import logging
from celery import shared_task
from django.contrib.auth import get_user_model
from django.db import models, transaction
from django.utils import timezone

from apps.common.models import AsyncTask
from apps.outline.constants import (
    GenerationRecordStatus,
    SectionGenerationStatus,
    SectionStatus,
    SectionVersionSource,
)
from apps.outline.models import Outline, Section, SectionVersion, SectionGenerationRecord
from apps.outline.services.section_generation_service import SectionGenerationService

User = get_user_model()
logger = logging.getLogger(__name__)


@shared_task(bind=True)
def generate_section_task(
    self,
    section_id: int,
    record_id: int,
    analysis_result: dict,
    user_prompt: str,
    user_id: int,
):
    """单章节生成任务。

    注意：任务参数不传递大段上下文正文，
    具体上下文在任务内部通过 prepare_generation_context 重新构建。
    """
    try:
        section = Section.objects.get(pk=section_id)
        record = SectionGenerationRecord.objects.get(pk=record_id)
        user = User.objects.get(pk=user_id)

        # 更新状态
        section.generation_status = SectionGenerationStatus.RUNNING
        section.save()
        record.status = GenerationRecordStatus.RUNNING
        record.save()

        # 在任务内部构建上下文
        context = SectionGenerationService().prepare_generation_context(
            section_id=section_id,
            analysis_result=analysis_result,
            user_prompt=user_prompt,
            user_id=user_id,
        )

        # 调用 AI 生成
        from apps.generation.services.ai_task_execution_service import (
            AiTaskExecutionService,
        )

        prompt_run = AiTaskExecutionService().execute(
            scenario="section_writing",
            variables=context,
            created_by=user,
        )

        if prompt_run.status == "succeeded":
            content = prompt_run.output_json.get("content", "")
            word_count = len(content)

            # 保存内容（事务内生成版本号）
            with transaction.atomic():
                section = Section.objects.select_for_update().get(pk=section_id)

                # 更新章节
                section.content = content
                section.word_count = word_count
                section.generation_status = SectionGenerationStatus.SUCCESS
                section.status = SectionStatus.GENERATED
                section.save()

                # 创建版本（version_no 事务内计算）
                max_version = (
                    SectionVersion.objects.filter(section=section)
                    .aggregate(max_version=models.Max("version_no"))["max_version"]
                    or 0
                )
                SectionVersion.objects.create(
                    section=section,
                    content=content,
                    version_no=max_version + 1,
                    source=SectionVersionSource.AI,
                    word_count=word_count,
                    created_by=user,
                )

            # 更新记录（不存完整正文）
            record.prompt_run = prompt_run
            record.prompt_template_id = prompt_run.prompt_template_id
            record.prompt_version = (
                prompt_run.prompt_version.version if prompt_run.prompt_version else ""
            )
            record.llm_model = (
                prompt_run.model_config.display_name if prompt_run.model_config else ""
            )
            record.output_summary = {
                "word_count": word_count,
                "prompt_run_id": prompt_run.id,
            }
            record.status = GenerationRecordStatus.SUCCESS
            record.finished_at = timezone.now()
            record.save()

        else:
            raise Exception(prompt_run.error_message or "AI 生成失败")

    except Exception as e:
        logger.exception(f"Section generation failed: section_id={section_id}")

        section = Section.objects.get(pk=section_id)
        section.generation_status = SectionGenerationStatus.FAILED
        section.save()

        record = SectionGenerationRecord.objects.get(pk=record_id)
        record.status = GenerationRecordStatus.FAILED
        record.error_message = str(e)[:2000]
        record.finished_at = timezone.now()
        record.save()

        raise


@shared_task(bind=True)
def generate_sections_batch_task(
    self,
    outline_id: int,
    async_task_id: int,
    user_id: int,
):
    """批量生成章节任务。"""
    user = User.objects.get(pk=user_id)
    async_task = AsyncTask.objects.get(pk=async_task_id)

    # 获取待生成的记录
    records = (
        SectionGenerationRecord.objects.filter(
            async_task=async_task,
            status=GenerationRecordStatus.PENDING,
        )
        .select_related("section")
        .order_by("section__sort_order")
    )

    total = records.count()
    completed = 0
    failed = 0

    for idx, record in enumerate(records, 1):
        try:
            # 分析需求（同步）
            analysis = SectionGenerationService().analyze_section_needs(
                record.section_id
            )

            # 准备上下文（任务内部构建）
            context = SectionGenerationService().prepare_generation_context(
                section_id=record.section_id,
                analysis_result=analysis,
                user_prompt=record.section.user_prompt or "",
                user_id=user_id,
            )

            # 生成章节
            from apps.generation.services.ai_task_execution_service import (
                AiTaskExecutionService,
            )

            prompt_run = AiTaskExecutionService().execute(
                scenario="section_writing",
                variables=context,
                created_by=user,
            )

            if prompt_run.status == "succeeded":
                content = prompt_run.output_json.get("content", "")
                word_count = len(content)

                # 保存内容（事务内）
                with transaction.atomic():
                    section = Section.objects.select_for_update().get(
                        pk=record.section_id
                    )

                    section.content = content
                    section.word_count = word_count
                    section.generation_status = SectionGenerationStatus.SUCCESS
                    section.status = SectionStatus.GENERATED
                    section.save()

                    max_version = (
                        SectionVersion.objects.filter(section=section)
                        .aggregate(max_version=models.Max("version_no"))["max_version"]
                        or 0
                    )
                    SectionVersion.objects.create(
                        section=section,
                        content=content,
                        version_no=max_version + 1,
                        source=SectionVersionSource.AI,
                        word_count=word_count,
                        created_by=user,
                    )

                record.status = GenerationRecordStatus.SUCCESS
                record.output_summary = {"word_count": word_count}
                completed += 1

            else:
                record.status = GenerationRecordStatus.FAILED
                record.error_message = prompt_run.error_message or "AI 生成失败"
                failed += 1

        except Exception as e:
            logger.exception(
                f"Batch section generation failed: section_id={record.section_id}"
            )
            record.status = GenerationRecordStatus.FAILED
            record.error_message = str(e)[:2000]
            failed += 1

        record.finished_at = timezone.now()
        record.save()

        # 更新整体进度
        progress = int((idx / total) * 100) if total > 0 else 100
        async_task.progress = progress
        async_task.current_step = f"已完成 {completed}/{total}，失败 {failed}"
        async_task.save()

    # 完成任务
    async_task.result_payload = {
        "total": total,
        "completed": completed,
        "failed": failed,
    }
    async_task.status = (
        "success"
        if failed == 0
        else ("failed" if completed == 0 else "success")
    )
    async_task.finished_at = timezone.now()
    async_task.save()
```

- [ ] **Step 2: Commit**

```bash
git add backend/apps/outline/tasks.py
git commit -m "$(cat <<'EOF'
feat(outline): add Celery tasks for section generation

- generate_section_task: single section generation
- generate_sections_batch_task: batch generation with progress
- Build context inside task, not passed as parameters
- Use select_for_update for version_no calculation

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: DRF 序列化器

**Files:**
- Create: `backend/apps/outline/serializers.py`

- [ ] **Step 1: 创建序列化器**

```python
# backend/apps/outline/serializers.py
"""大纲模块序列化器。"""

from rest_framework import serializers

from apps.outline.models import (
    Outline,
    Section,
    SectionVersion,
    SectionGenerationRecord,
    PresetOutlineTemplate,
    PresetSectionTemplate,
)


class PresetSectionTemplateSerializer(serializers.ModelSerializer):
    """预设章节模板序列化器。"""

    class Meta:
        model = PresetSectionTemplate
        fields = ["id", "title", "level", "sort_order", "parent"]


class PresetOutlineTemplateSerializer(serializers.ModelSerializer):
    """预设大纲模板序列化器。"""

    sections = PresetSectionTemplateSerializer(many=True, read_only=True)

    class Meta:
        model = PresetOutlineTemplate
        fields = ["id", "name", "description", "category", "is_active", "sections"]


class SectionSerializer(serializers.ModelSerializer):
    """章节序列化器。"""

    status_display = serializers.CharField(source="get_status_display", read_only=True)
    generation_status_display = serializers.CharField(
        source="get_generation_status_display", read_only=True
    )

    class Meta:
        model = Section
        fields = [
            "id",
            "outline",
            "parent",
            "title",
            "level",
            "sort_order",
            "content",
            "word_count",
            "status",
            "status_display",
            "generation_status",
            "generation_status_display",
            "user_prompt",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["outline", "level", "sort_order", "word_count"]


class SectionTreeSerializer(serializers.ModelSerializer):
    """章节树序列化器（扁平列表）。"""

    status_display = serializers.CharField(source="get_status_display", read_only=True)
    generation_status_display = serializers.CharField(
        source="get_generation_status_display", read_only=True
    )
    children_count = serializers.SerializerMethodField()

    class Meta:
        model = Section
        fields = [
            "id",
            "parent",
            "title",
            "level",
            "sort_order",
            "status",
            "status_display",
            "generation_status",
            "generation_status_display",
            "word_count",
            "children_count",
        ]

    def get_children_count(self, obj) -> int:
        return obj.children.count()


class SectionVersionSerializer(serializers.ModelSerializer):
    """章节版本序列化器。"""

    source_display = serializers.CharField(source="get_source_display", read_only=True)
    created_by_name = serializers.CharField(
        source="created_by.get_full_name", read_only=True
    )

    class Meta:
        model = SectionVersion
        fields = [
            "id",
            "version_no",
            "source",
            "source_display",
            "word_count",
            "created_by_name",
            "created_at",
        ]


class SectionVersionDetailSerializer(serializers.ModelSerializer):
    """章节版本详情序列化器（含内容）。"""

    source_display = serializers.CharField(source="get_source_display", read_only=True)

    class Meta:
        model = SectionVersion
        fields = [
            "id",
            "version_no",
            "content",
            "source",
            "source_display",
            "word_count",
            "created_at",
        ]


class OutlineSerializer(serializers.ModelSerializer):
    """大纲序列化器。"""

    source_display = serializers.CharField(source="get_source_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    lot_name = serializers.CharField(source="lot.name", read_only=True)
    project_name = serializers.CharField(source="project.name", read_only=True)
    created_by_name = serializers.CharField(
        source="created_by.get_full_name", read_only=True
    )
    section_count = serializers.SerializerMethodField()

    class Meta:
        model = Outline
        fields = [
            "id",
            "project",
            "lot",
            "name",
            "source",
            "source_display",
            "status",
            "status_display",
            "is_current",
            "lot_name",
            "project_name",
            "created_by_name",
            "section_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["project", "source", "is_current", "created_by"]

    def get_section_count(self, obj) -> int:
        return obj.sections.count()


class OutlineDetailSerializer(OutlineSerializer):
    """大纲详情序列化器（含章节树）。"""

    sections = SectionTreeSerializer(many=True, read_only=True)

    class Meta(OutlineSerializer.Meta):
        fields = OutlineSerializer.Meta.fields + ["sections"]


class OutlineCreateFromPresetSerializer(serializers.Serializer):
    """从预设模板创建大纲序列化器。"""

    lot_id = serializers.IntegerField()
    template_id = serializers.IntegerField()
    name = serializers.CharField(max_length=255, required=False, allow_blank=True)


class OutlineCreateFromAiSerializer(serializers.Serializer):
    """AI解析创建大纲序列化器。"""

    tender_file_id = serializers.IntegerField()
    name = serializers.CharField(max_length=255, required=False, allow_blank=True)
    sections_data = serializers.ListField(
        child=serializers.DictField(),
        help_text="AI解析返回的章节列表",
    )


class SectionMoveSerializer(serializers.Serializer):
    """章节移动序列化器。"""

    new_parent_id = serializers.IntegerField(allow_null=True)
    new_sort_order = serializers.IntegerField()


class SectionAnalyzeSerializer(serializers.Serializer):
    """章节分析结果序列化器。"""

    keywords = serializers.ListField(child=serializers.CharField())
    knowledge_types = serializers.ListField(child=serializers.CharField())
    requirement_types = serializers.ListField(child=serializers.CharField())
    background = serializers.CharField()
    suggested_prompt = serializers.CharField()


class SectionGenerateSerializer(serializers.Serializer):
    """章节生成请求序列化器。"""

    user_prompt = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
        help_text="用户补充提示词",
    )
    analysis_result = serializers.DictField(
        required=False,
        default=dict,
        help_text="AI分析结果（可选，前端可传入）",
    )
    force = serializers.BooleanField(
        default=False,
        help_text="是否强制重新生成",
    )


class SectionRollbackSerializer(serializers.Serializer):
    """章节回滚序列化器。"""

    version_no = serializers.IntegerField()


class GenerationStatusSerializer(serializers.Serializer):
    """生成状态序列化器。"""

    task_id = serializers.IntegerField()
    status = serializers.CharField()
    progress = serializers.IntegerField()
    current_step = serializers.CharField()
    total = serializers.IntegerField()
    completed = serializers.IntegerField()
    failed = serializers.IntegerField()
    running = serializers.IntegerField()
    sections = serializers.ListField(child=serializers.DictField())
```

- [ ] **Step 2: Commit**

```bash
git add backend/apps/outline/serializers.py
git commit -m "$(cat <<'EOF'
feat(outline): add DRF serializers

- OutlineSerializer, OutlineDetailSerializer with sections
- SectionSerializer, SectionTreeSerializer
- SectionVersionSerializer, SectionVersionDetailSerializer
- Request serializers: create, move, generate, rollback

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: API 视图

**Files:**
- Create: `backend/apps/outline/views.py`

- [ ] **Step 1: 创建视图**

```python
# backend/apps/outline/views.py
"""大纲模块 API 视图。"""

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.common.models import AsyncTask
from apps.outline.models import (
    Outline,
    Section,
    SectionVersion,
    PresetOutlineTemplate,
)
from apps.outline.serializers import (
    GenerationStatusSerializer,
    OutlineCreateFromAiSerializer,
    OutlineCreateFromPresetSerializer,
    OutlineDetailSerializer,
    OutlineSerializer,
    PresetOutlineTemplateSerializer,
    SectionAnalyzeSerializer,
    SectionGenerateSerializer,
    SectionMoveSerializer,
    SectionRollbackSerializer,
    SectionSerializer,
    SectionTreeSerializer,
    SectionVersionDetailSerializer,
    SectionVersionSerializer,
)
from apps.outline.services.outline_service import OutlineService
from apps.outline.services.section_generation_service import SectionGenerationService
from apps.outline.services.section_tree_service import SectionTreeService


class PresetOutlineTemplateViewSet(viewsets.ReadOnlyModelViewSet):
    """预设大纲模板视图集。"""

    queryset = PresetOutlineTemplate.objects.filter(is_active=True).prefetch_related(
        "sections"
    )
    serializer_class = PresetOutlineTemplateSerializer


class OutlineViewSet(viewsets.ModelViewSet):
    """大纲视图集。"""

    queryset = Outline.objects.select_related("project", "lot", "created_by")
    serializer_class = OutlineSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        project_id = self.request.query_params.get("project_id")
        lot_id = self.request.query_params.get("lot_id")
        is_current = self.request.query_params.get("is_current")

        if project_id:
            queryset = queryset.filter(project_id=project_id)
        if lot_id:
            queryset = queryset.filter(lot_id=lot_id)
        if is_current is not None:
            queryset = queryset.filter(is_current=is_current.lower() == "true")

        return queryset

    def get_serializer_class(self):
        if self.action == "retrieve":
            return OutlineDetailSerializer
        return OutlineSerializer

    @action(detail=False, methods=["post"])
    def from_preset(self, request):
        """从预设模板创建大纲。"""
        serializer = OutlineCreateFromPresetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        outline = OutlineService().create_from_preset(
            lot_id=serializer.validated_data["lot_id"],
            template_id=serializer.validated_data["template_id"],
            name=serializer.validated_data.get("name"),
            created_by=request.user,
        )

        return Response(
            OutlineDetailSerializer(outline).data, status=status.HTTP_201_CREATED
        )

    @action(detail=False, methods=["post"])
    def from_ai(self, request):
        """AI解析创建大纲。"""
        serializer = OutlineCreateFromAiSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        outline = OutlineService().create_from_ai(
            tender_file_id=serializer.validated_data["tender_file_id"],
            sections_data=serializer.validated_data["sections_data"],
            name=serializer.validated_data.get("name"),
            created_by=request.user,
        )

        return Response(
            OutlineDetailSerializer(outline).data, status=status.HTTP_201_CREATED
        )

    @action(detail=True, methods=["get"])
    def sections(self, request, pk=None):
        """获取章节树。"""
        outline = self.get_object()
        sections = Section.objects.filter(outline=outline).order_by("sort_order", "id")
        serializer = SectionTreeSerializer(sections, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def reorder_sections(self, request, pk=None):
        """重排章节。"""
        outline = self.get_object()
        section_orders = request.data.get("sections", [])

        for item in section_orders:
            Section.objects.filter(
                id=item["id"],
                outline=outline,
            ).update(sort_order=item["sort_order"])

        return Response({"message": "排序已更新"})

    @action(detail=True, methods=["post"])
    def generate_all(self, request, pk=None):
        """批量生成所有章节。"""
        outline = self.get_object()

        async_task = SectionGenerationService().generate_sections_batch(
            outline_id=outline.id,
            created_by=request.user,
        )

        return Response(
            {
                "task_id": async_task.id,
                "status": async_task.status,
                "message": "批量生成任务已提交",
            }
        )

    @action(detail=True, methods=["get"])
    def generation_status(self, request, pk=None):
        """获取批量生成进度。"""
        outline = self.get_object()
        result = SectionGenerationService().get_batch_generation_status(outline.id)
        serializer = GenerationStatusSerializer(result)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def set_current(self, request, pk=None):
        """设置为当前大纲。"""
        outline = self.get_object()
        OutlineService().set_current(outline.id)
        return Response({"message": "已设置为当前大纲"})


class SectionViewSet(viewsets.ModelViewSet):
    """章节视图集。"""

    queryset = Section.objects.select_related("outline")
    serializer_class = SectionSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        outline_id = self.request.query_params.get("outline_id")
        if outline_id:
            queryset = queryset.filter(outline_id=outline_id)
        return queryset

    def perform_create(self, serializer):
        """创建章节时自动计算 level 和 sort_order。"""
        outline_id = self.request.data.get("outline")
        parent_id = self.request.data.get("parent")
        title = self.request.data.get("title")

        section = SectionTreeService().add_section(
            outline_id=outline_id,
            parent_id=parent_id,
            title=title,
        )
        serializer.instance = section

    @action(detail=True, methods=["post"])
    def move(self, request, pk=None):
        """移动章节。"""
        section = self.get_object()
        serializer = SectionMoveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        updated_section = SectionTreeService().move_section(
            section_id=section.id,
            new_parent_id=serializer.validated_data["new_parent_id"],
            new_sort_order=serializer.validated_data["new_sort_order"],
        )

        return Response(SectionSerializer(updated_section).data)

    @action(detail=True, methods=["post"])
    def analyze(self, request, pk=None):
        """分析章节生成需求。"""
        section = self.get_object()
        result = SectionGenerationService().analyze_section_needs(section.id)
        serializer = SectionAnalyzeSerializer(result)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def generate(self, request, pk=None):
        """生成章节内容。"""
        section = self.get_object()
        serializer = SectionGenerateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # 获取分析结果
        analysis_result = serializer.validated_data.get("analysis_result")
        if not analysis_result:
            # 如果未传入分析结果，自动分析
            analysis_result = SectionGenerationService().analyze_section_needs(
                section.id
            )

        async_task = SectionGenerationService().generate_section(
            section_id=section.id,
            analysis_result=analysis_result,
            user_prompt=serializer.validated_data.get("user_prompt", ""),
            created_by=request.user,
            force=serializer.validated_data["force"],
        )

        return Response(
            {
                "task_id": async_task.id,
                "status": async_task.status,
                "message": "章节生成任务已提交",
            }
        )

    @action(detail=True, methods=["get"])
    def versions(self, request, pk=None):
        """获取版本历史。"""
        section = self.get_object()
        versions = SectionVersion.objects.filter(section=section).order_by("-version_no")
        serializer = SectionVersionSerializer(versions, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def rollback(self, request, pk=None):
        """回滚到指定版本。"""
        section = self.get_object()
        serializer = SectionRollbackSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        version_no = serializer.validated_data["version_no"]
        try:
            version = SectionVersion.objects.get(section=section, version_no=version_no)
        except SectionVersion.DoesNotExist:
            return Response(
                {"error": f"版本 {version_no} 不存在"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # 创建新版本（来源为手动）
        from apps.outline.constants import SectionVersionSource

        max_version = (
            SectionVersion.objects.filter(section=section)
            .aggregate(max_version=models.Max("version_no"))["max_version"]
            or 0
        )

        new_version = SectionVersion.objects.create(
            section=section,
            content=version.content,
            version_no=max_version + 1,
            source=SectionVersionSource.MANUAL,
            word_count=version.word_count,
            created_by=request.user,
        )

        # 更新章节内容
        section.content = version.content
        section.word_count = version.word_count
        section.save()

        return Response(
            {
                "message": f"已回滚到版本 {version_no}",
                "current_version": SectionVersionDetailSerializer(new_version).data,
            }
        )
```

- [ ] **Step 2: Commit**

```bash
git add backend/apps/outline/views.py
git commit -m "$(cat <<'EOF'
feat(outline): add API views

- PresetOutlineTemplateViewSet: read-only template list
- OutlineViewSet: CRUD + from_preset/from_ai + generate_all
- SectionViewSet: CRUD + move + analyze + generate + rollback
- Support generation_status endpoint for batch progress

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: URL 路由

**Files:**
- Create: `backend/apps/outline/urls.py`

- [ ] **Step 1: 创建 URL 路由**

```python
# backend/apps/outline/urls.py
"""大纲模块 URL 路由。"""

from rest_framework.routers import DefaultRouter

from apps.outline.views import (
    OutlineViewSet,
    PresetOutlineTemplateViewSet,
    SectionViewSet,
)

router = DefaultRouter()
router.register(r"preset-templates", PresetOutlineTemplateViewSet, basename="preset-template")
router.register(r"outlines", OutlineViewSet, basename="outline")
router.register(r"sections", SectionViewSet, basename="section")

urlpatterns = router.urls
```

- [ ] **Step 2: 注册到主 URL 配置**

检查 `backend/config/urls.py`，添加：

```python
# 在 urlpatterns 中添加
path("api/", include("apps.outline.urls")),
```

- [ ] **Step 3: Commit**

```bash
git add backend/apps/outline/urls.py
git commit -m "$(cat <<'EOF'
feat(outline): add URL routing

- Register PresetOutlineTemplateViewSet, OutlineViewSet, SectionViewSet
- Use DefaultRouter for standard REST endpoints

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: PromptScenario 扩展

**Files:**
- Modify: `backend/apps/generation/constants.py`

- [ ] **Step 1: 添加新的 PromptScenario**

在 `backend/apps/generation/constants.py` 的 `PromptScenario` 类中添加：

```python
class PromptScenario:
    # ... 现有场景 ...

    # 大纲与章节生成（每个场景独立模板）
    OUTLINE_EXTRACTION = "outline_extraction"           # AI解析招标文件生成大纲
    SECTION_NEEDS_ANALYSIS = "section_needs_analysis"   # 分析章节生成需求
    SECTION_WRITING = "section_writing"                 # 章节内容生成

    # 更新 CHOICES
    CHOICES = [
        # ... 现有选项 ...
        (OUTLINE_EXTRACTION, "大纲提取"),
        (SECTION_NEEDS_ANALYSIS, "章节需求分析"),
        (SECTION_WRITING, "章节撰写"),
    ]
```

- [ ] **Step 2: Commit**

```bash
git add backend/apps/generation/constants.py
git commit -m "$(cat <<'EOF'
feat(generation): add PromptScenario for outline and section

- OUTLINE_EXTRACTION: AI parse tender file to outline
- SECTION_NEEDS_ANALYSIS: Analyze section generation needs
- SECTION_WRITING: Generate section content

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: 前端 API 定义

**Files:**
- Create: `frontend/src/api/outline.ts`

- [ ] **Step 1: 创建前端 API**

```typescript
// frontend/src/api/outline.ts
import { http } from './http'

// ============================================================================
// 类型定义
// ============================================================================

export interface Outline {
  id: number
  project: number
  lot: number
  lot_name: string
  project_name: string
  name: string
  source: string
  source_display: string
  status: string
  status_display: string
  is_current: boolean
  section_count: number
  created_by_name: string
  created_at: string
  updated_at: string
}

export interface OutlineDetail extends Outline {
  sections: SectionTreeItem[]
}

export interface Section {
  id: number
  outline: number
  parent: number | null
  title: string
  level: number
  sort_order: number
  content: string
  word_count: number
  status: string
  status_display: string
  generation_status: string
  generation_status_display: string
  user_prompt: string
  created_at: string
  updated_at: string
}

export interface SectionTreeItem {
  id: number
  parent: number | null
  title: string
  level: number
  sort_order: number
  status: string
  status_display: string
  generation_status: string
  generation_status_display: string
  word_count: number
  children_count: number
}

export interface SectionVersion {
  id: number
  version_no: number
  source: string
  source_display: string
  word_count: number
  created_by_name: string
  created_at: string
}

export interface PresetTemplate {
  id: number
  name: string
  description: string
  category: string
  is_active: boolean
  sections: {
    id: number
    title: string
    level: number
    sort_order: number
  }[]
}

export interface GenerationStatus {
  task_id: number
  status: string
  progress: number
  current_step: string
  total: number
  completed: number
  failed: number
  running: number
  sections: {
    id: number
    title: string
    status: string
  }[]
}

export interface AnalysisResult {
  keywords: string[]
  knowledge_types: string[]
  requirement_types: string[]
  background: string
  suggested_prompt: string
}

// ============================================================================
// 预设模板 API
// ============================================================================

export function listPresetTemplates() {
  return http.get<PresetTemplate[]>('/api/preset-templates/')
}

export function getPresetTemplate(id: number) {
  return http.get<PresetTemplate>(`/api/preset-templates/${id}/`)
}

// ============================================================================
// 大纲 API
// ============================================================================

export interface OutlineListParams {
  project_id?: number
  lot_id?: number
  is_current?: boolean
}

export function listOutlines(params?: OutlineListParams) {
  return http.get<Outline[]>('/api/outlines/', { params })
}

export function getOutline(id: number) {
  return http.get<OutlineDetail>(`/api/outlines/${id}/`)
}

export function createOutline(data: { lot: number; name: string }) {
  return http.post<Outline>('/api/outlines/', data)
}

export function updateOutline(id: number, data: Partial<Outline>) {
  return http.patch<Outline>(`/api/outlines/${id}/`, data)
}

export function deleteOutline(id: number) {
  return http.delete(`/api/outlines/${id}/`)
}

export function createOutlineFromPreset(data: {
  lot_id: number
  template_id: number
  name?: string
}) {
  return http.post<OutlineDetail>('/api/outlines/from_preset/', data)
}

export function createOutlineFromAi(data: {
  tender_file_id: number
  sections_data: { title: string; level: number }[]
  name?: string
}) {
  return http.post<OutlineDetail>('/api/outlines/from_ai/', data)
}

export function getOutlineSections(outlineId: number) {
  return http.get<SectionTreeItem[]>(`/api/outlines/${outlineId}/sections/`)
}

export function reorderSections(outlineId: number, sections: { id: number; sort_order: number }[]) {
  return http.post(`/api/outlines/${outlineId}/reorder_sections/`, { sections })
}

export function generateAllSections(outlineId: number) {
  return http.post<{ task_id: number; status: string; message: string }>(
    `/api/outlines/${outlineId}/generate_all/`
  )
}

export function getGenerationStatus(outlineId: number) {
  return http.get<GenerationStatus>(`/api/outlines/${outlineId}/generation_status/`)
}

export function setOutlineCurrent(id: number) {
  return http.post(`/api/outlines/${id}/set_current/`)
}

// ============================================================================
// 章节 API
// ============================================================================

export function getSection(id: number) {
  return http.get<Section>(`/api/sections/${id}/`)
}

export function createSection(data: { outline: number; parent?: number; title: string }) {
  return http.post<Section>('/api/sections/', data)
}

export function updateSection(id: number, data: Partial<Section>) {
  return http.patch<Section>(`/api/sections/${id}/`, data)
}

export function deleteSection(id: number) {
  return http.delete(`/api/sections/${id}/`)
}

export function moveSection(id: number, data: { new_parent_id: number | null; new_sort_order: number }) {
  return http.post<Section>(`/api/sections/${id}/move/`, data)
}

export function analyzeSection(id: number) {
  return http.post<AnalysisResult>(`/api/sections/${id}/analyze/`)
}

export function generateSection(id: number, data: {
  user_prompt?: string
  analysis_result?: AnalysisResult
  force?: boolean
}) {
  return http.post<{ task_id: number; status: string; message: string }>(
    `/api/sections/${id}/generate/`,
    data
  )
}

export function getSectionVersions(id: number) {
  return http.get<SectionVersion[]>(`/api/sections/${id}/versions/`)
}

export function rollbackSection(id: number, version_no: number) {
  return http.post(`/api/sections/${id}/rollback/`, { version_no })
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/outline.ts
git commit -m "$(cat <<'EOF'
feat(frontend): add outline API definitions

- PresetTemplate, Outline, Section types
- CRUD APIs for outline and section
- Generation APIs: analyze, generate, generateAll
- Version APIs: versions, rollback

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 17: 前端路由配置

**Files:**
- Modify: `frontend/src/router/index.ts`

- [ ] **Step 1: 添加大纲路由**

在路由配置中添加大纲相关路由：

```typescript
// 在 routes 数组中添加
{
  path: '/projects/:projectId/outlines',
  name: 'ProjectOutlines',
  component: () => import('@/views/outline/OutlineListView.vue'),
  meta: { title: '大纲列表' },
},
{
  path: '/outlines/:outlineId',
  name: 'OutlineDetail',
  component: () => import('@/views/outline/OutlineDetailView.vue'),
  meta: { title: '大纲详情' },
},
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/router/index.ts
git commit -m "$(cat <<'EOF'
feat(frontend): add outline routes

- ProjectOutlines: outline list by project
- OutlineDetail: outline detail with section tree

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 18: 前端组件 - SectionTree

**Files:**
- Create: `frontend/src/views/outline/components/SectionTree.vue`

- [ ] **Step 1: 创建章节树组件**

```vue
<!-- frontend/src/views/outline/components/SectionTree.vue -->
<template>
  <div class="section-tree">
    <el-table
      :data="sections"
      row-key="id"
      :tree-props="{ children: 'children', hasChildren: 'hasChildren' }"
      :indent="24"
      @row-click="handleRowClick"
    >
      <el-table-column prop="title" label="章节标题">
        <template #default="{ row }">
          <span :style="{ paddingLeft: (row.level - 1) * 20 + 'px' }">
            <el-icon v-if="row.children_count > 0" class="tree-icon">
              <Folder />
            </el-icon>
            <el-icon v-else class="tree-icon">
              <Document />
            </el-icon>
            {{ row.title }}
          </span>
        </template>
      </el-table-column>

      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="getStatusType(row.status)" size="small">
            {{ row.status_display }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column prop="generation_status" label="生成状态" width="120">
        <template #default="{ row }">
          <el-tag
            v-if="row.generation_status !== 'not_started'"
            :type="getGenerationStatusType(row.generation_status)"
            size="small"
          >
            {{ row.generation_status_display }}
          </el-tag>
          <span v-else class="text-muted">-</span>
        </template>
      </el-table-column>

      <el-table-column prop="word_count" label="字数" width="80">
        <template #default="{ row }">
          {{ row.word_count || '-' }}
        </template>
      </el-table-column>

      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click.stop="handleGenerate(row)">
            生成
          </el-button>
          <el-button link type="primary" @click.stop="handleEdit(row)">
            编辑
          </el-button>
          <el-dropdown trigger="click" @command="(cmd: string) => handleCommand(cmd, row)">
            <el-button link>
              <el-icon><MoreFilled /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="add_child">添加子章节</el-dropdown-item>
                <el-dropdown-item command="versions">版本历史</el-dropdown-item>
                <el-dropdown-item command="delete" divided>删除</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { Folder, Document, MoreFilled } from '@element-plus/icons-vue'
import type { SectionTreeItem } from '@/api/outline'

defineProps<{
  sections: SectionTreeItem[]
}>()

const emit = defineEmits<{
  (e: 'generate', section: SectionTreeItem): void
  (e: 'edit', section: SectionTreeItem): void
  (e: 'add-child', section: SectionTreeItem): void
  (e: 'versions', section: SectionTreeItem): void
  (e: 'delete', section: SectionTreeItem): void
}>()

function handleRowClick(row: SectionTreeItem) {
  emit('edit', row)
}

function handleGenerate(row: SectionTreeItem) {
  emit('generate', row)
}

function handleEdit(row: SectionTreeItem) {
  emit('edit', row)
}

function handleCommand(cmd: string, row: SectionTreeItem) {
  switch (cmd) {
    case 'add_child':
      emit('add-child', row)
      break
    case 'versions':
      emit('versions', row)
      break
    case 'delete':
      emit('delete', row)
      break
  }
}

function getStatusType(status: string): string {
  const map: Record<string, string> = {
    draft: 'info',
    generated: 'success',
    reviewing: 'warning',
    approved: 'success',
    rejected: 'danger',
  }
  return map[status] || 'info'
}

function getGenerationStatusType(status: string): string {
  const map: Record<string, string> = {
    pending: 'warning',
    running: 'primary',
    success: 'success',
    failed: 'danger',
  }
  return map[status] || 'info'
}
</script>

<style scoped>
.section-tree {
  min-height: 200px;
}

.tree-icon {
  margin-right: 4px;
  vertical-align: middle;
}

.text-muted {
  color: var(--el-text-color-placeholder);
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/views/outline/components/SectionTree.vue
git commit -m "$(cat <<'EOF'
feat(frontend): add SectionTree component

- Table with tree structure support
- Status and generation_status display
- Actions: generate, edit, add-child, versions, delete

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 19: 前端组件 - SectionGenerateDialog

**Files:**
- Create: `frontend/src/views/outline/components/SectionGenerateDialog.vue`

- [ ] **Step 1: 创建章节生成对话框**

```vue
<!-- frontend/src/views/outline/components/SectionGenerateDialog.vue -->
<template>
  <el-dialog
    v-model="visible"
    :title="`生成章节：${section?.title || ''}`"
    width="700px"
    :close-on-click-modal="false"
  >
    <div v-loading="analyzing" class="generate-content">
      <!-- AI 分析结果 -->
      <el-card shadow="never" class="analysis-card">
        <template #header>
          <div class="card-header">
            <span>AI 分析结果</span>
            <el-button link @click="handleReanalyze" :loading="analyzing">
              重新分析
            </el-button>
          </div>
        </template>

        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="检索关键词">
            <el-tag
              v-for="kw in analysisResult.keywords"
              :key="kw"
              size="small"
              class="keyword-tag"
            >
              {{ kw }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="背景说明">
            {{ analysisResult.background }}
          </el-descriptions-item>
        </el-descriptions>

        <div class="suggested-prompt">
          <div class="label">AI 建议提示：</div>
          <div class="content">{{ analysisResult.suggested_prompt }}</div>
        </div>
      </el-card>

      <!-- AI 提示词框 -->
      <el-card shadow="never" class="prompt-card">
        <template #header>
          <span>AI 提示词框（可编辑）</span>
        </template>
        <el-input
          v-model="userPrompt"
          type="textarea"
          :rows="6"
          placeholder="请输入您的补充要求，AI 将根据这些要求生成章节内容..."
        />
      </el-card>
    </div>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" @click="handleGenerate" :loading="generating">
        确认生成
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  analyzeSection,
  generateSection,
  type SectionTreeItem,
  type AnalysisResult,
} from '@/api/outline'

const props = defineProps<{
  modelValue: boolean
  section: SectionTreeItem | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'success', taskId: number): void
}>()

const visible = ref(false)
const analyzing = ref(false)
const generating = ref(false)
const userPrompt = ref('')
const analysisResult = ref<AnalysisResult>({
  keywords: [],
  knowledge_types: [],
  requirement_types: [],
  background: '',
  suggested_prompt: '',
})

watch(
  () => props.modelValue,
  (val) => {
    visible.value = val
    if (val && props.section) {
      handleAnalyze()
    }
  }
)

watch(visible, (val) => {
  emit('update:modelValue', val)
})

async function handleAnalyze() {
  if (!props.section) return

  analyzing.value = true
  try {
    const res = await analyzeSection(props.section.id)
    analysisResult.value = res.data
    userPrompt.value = res.data.suggested_prompt || ''
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '分析失败')
  } finally {
    analyzing.value = false
  }
}

function handleReanalyze() {
  handleAnalyze()
}

async function handleGenerate() {
  if (!props.section) return

  generating.value = true
  try {
    const res = await generateSection(props.section.id, {
      user_prompt: userPrompt.value,
      analysis_result: analysisResult.value,
      force: false,
    })
    ElMessage.success('章节生成任务已提交')
    emit('success', res.data.task_id)
    visible.value = false
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '生成失败')
  } finally {
    generating.value = false
  }
}
</script>

<style scoped>
.generate-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.analysis-card,
.prompt-card {
  margin-bottom: 0;
}

.keyword-tag {
  margin-right: 4px;
  margin-bottom: 4px;
}

.suggested-prompt {
  margin-top: 12px;
  padding: 12px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
}

.suggested-prompt .label {
  font-weight: 500;
  margin-bottom: 4px;
}

.suggested-prompt .content {
  color: var(--el-text-color-regular);
  white-space: pre-wrap;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/views/outline/components/SectionGenerateDialog.vue
git commit -m "$(cat <<'EOF'
feat(frontend): add SectionGenerateDialog component

- AI analysis result display with keywords
- Editable user prompt textarea
- Generate button triggers async task

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 20: 前端页面 - OutlineListView

**Files:**
- Create: `frontend/src/views/outline/OutlineListView.vue`

- [ ] **Step 1: 创建大纲列表页**

```vue
<!-- frontend/src/views/outline/OutlineListView.vue -->
<template>
  <div class="outline-list">
    <div class="page-header">
      <h2>大纲管理</h2>
      <el-button type="primary" @click="showCreateDialog = true">
        创建大纲
      </el-button>
    </div>

    <!-- 筛选 -->
    <el-form :inline="true" class="filter-form">
      <el-form-item label="项目">
        <el-select v-model="filters.project_id" placeholder="选择项目" clearable @change="loadOutlines">
          <el-option
            v-for="p in projects"
            :key="p.id"
            :label="p.name"
            :value="p.id"
          />
        </el-select>
      </el-form-item>
    </el-form>

    <!-- 大纲列表 -->
    <el-table :data="outlines" v-loading="loading">
      <el-table-column prop="name" label="大纲名称" />
      <el-table-column prop="lot_name" label="标段" width="150" />
      <el-table-column prop="source_display" label="来源" width="100" />
      <el-table-column prop="status_display" label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="getStatusType(row.status)" size="small">
            {{ row.status_display }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="section_count" label="章节数" width="80" />
      <el-table-column prop="is_current" label="当前" width="80">
        <template #default="{ row }">
          <el-tag v-if="row.is_current" type="success" size="small">是</el-tag>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column prop="created_at" label="创建时间" width="180">
        <template #default="{ row }">
          {{ formatDate(row.created_at) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="handleDetail(row)">
            查看
          </el-button>
          <el-button
            v-if="!row.is_current"
            link
            type="warning"
            @click="handleSetCurrent(row)"
          >
            设为当前
          </el-button>
          <el-button link type="danger" @click="handleDelete(row)">
            删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 创建大纲对话框 -->
    <OutlineCreateDialog
      v-model="showCreateDialog"
      :project-id="filters.project_id"
      @success="handleCreateSuccess"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { listOutlines, deleteOutline, setOutlineCurrent, type Outline } from '@/api/outline'
import { listProjects, type Project } from '@/api/project'
import OutlineCreateDialog from './components/OutlineCreateDialog.vue'

const router = useRouter()

const loading = ref(false)
const outlines = ref<Outline[]>([])
const projects = ref<Project[]>([])
const filters = ref({
  project_id: null as number | null,
})
const showCreateDialog = ref(false)

onMounted(async () => {
  await loadProjects()
  await loadOutlines()
})

async function loadProjects() {
  try {
    const res = await listProjects()
    projects.value = res.data
  } catch (err) {
    console.error('加载项目失败:', err)
  }
}

async function loadOutlines() {
  loading.value = true
  try {
    const res = await listOutlines({
      project_id: filters.value.project_id || undefined,
    })
    outlines.value = res.data
  } catch (err) {
    ElMessage.error('加载大纲列表失败')
  } finally {
    loading.value = false
  }
}

function handleDetail(row: Outline) {
  router.push(`/outlines/${row.id}`)
}

async function handleSetCurrent(row: Outline) {
  try {
    await ElMessageBox.confirm('确认将此大纲设为当前大纲？', '提示')
    await setOutlineCurrent(row.id)
    ElMessage.success('已设置为当前大纲')
    loadOutlines()
  } catch (err: any) {
    if (err !== 'cancel') {
      ElMessage.error(err.response?.data?.message || '操作失败')
    }
  }
}

async function handleDelete(row: Outline) {
  try {
    await ElMessageBox.confirm('确认删除此大纲？删除后无法恢复。', '警告', {
      type: 'warning',
    })
    await deleteOutline(row.id)
    ElMessage.success('删除成功')
    loadOutlines()
  } catch (err: any) {
    if (err !== 'cancel') {
      ElMessage.error(err.response?.data?.message || '删除失败')
    }
  }
}

function handleCreateSuccess() {
  showCreateDialog.value = false
  loadOutlines()
}

function getStatusType(status: string): string {
  const map: Record<string, string> = {
    draft: 'info',
    active: 'success',
    archived: 'warning',
  }
  return map[status] || 'info'
}

function formatDate(date: string): string {
  return new Date(date).toLocaleString('zh-CN')
}
</script>

<style scoped>
.outline-list {
  padding: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.page-header h2 {
  margin: 0;
}

.filter-form {
  margin-bottom: 16px;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/views/outline/OutlineListView.vue
git commit -m "$(cat <<'EOF'
feat(frontend): add OutlineListView page

- Outline list with project filter
- Actions: view, set current, delete
- Integrate OutlineCreateDialog

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 21: 前端页面 - OutlineDetailView

**Files:**
- Create: `frontend/src/views/outline/OutlineDetailView.vue`

- [ ] **Step 1: 创建大纲详情页**

```vue
<!-- frontend/src/views/outline/OutlineDetailView.vue -->
<template>
  <div class="outline-detail" v-loading="pageLoading">
    <div class="page-header">
      <div class="header-left">
        <el-button link @click="router.back()">
          <el-icon><ArrowLeft /></el-icon>
          返回
        </el-button>
        <h2>{{ outline?.name || '大纲详情' }}</h2>
        <el-tag v-if="outline" :type="getStatusType(outline.status)" size="small">
          {{ outline.status_display }}
        </el-tag>
      </div>
      <div class="header-right">
        <el-button @click="handleGenerateAll" :loading="generatingAll">
          批量生成
        </el-button>
      </div>
    </div>

    <!-- 批量生成进度 -->
    <el-card v-if="generationStatus && generationStatus.status !== 'not_started'" class="progress-card">
      <div class="progress-header">
        <span>批量生成进度</span>
        <el-button link @click="refreshGenerationStatus">刷新</el-button>
      </div>
      <el-progress :percentage="generationStatus.progress" :status="getProgressStatus(generationStatus.status)" />
      <div class="progress-info">
        {{ generationStatus.current_step }}
      </div>
    </el-card>

    <!-- 章节树 -->
    <SectionTree
      v-if="sections.length > 0"
      :sections="sections"
      @generate="handleGenerate"
      @edit="handleEdit"
      @add-child="handleAddChild"
      @versions="handleVersions"
      @delete="handleDeleteSection"
    />

    <el-empty v-else-if="!pageLoading" description="暂无章节" />

    <!-- 章节生成对话框 -->
    <SectionGenerateDialog
      v-model="showGenerateDialog"
      :section="selectedSection"
      @success="handleGenerateSuccess"
    />

    <!-- 章节编辑抽屉 -->
    <SectionEditDrawer
      v-model="showEditDrawer"
      :section-id="selectedSection?.id || 0"
      @saved="loadSections"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft } from '@element-plus/icons-vue'
import {
  getOutline,
  getOutlineSections,
  generateAllSections,
  getGenerationStatus,
  deleteSection,
  type OutlineDetail,
  type SectionTreeItem,
  type GenerationStatus,
} from '@/api/outline'
import SectionTree from './components/SectionTree.vue'
import SectionGenerateDialog from './components/SectionGenerateDialog.vue'
import SectionEditDrawer from './components/SectionEditDrawer.vue'

const route = useRoute()
const router = useRouter()

const outlineId = computed(() => Number(route.params.outlineId))
const pageLoading = ref(false)
const generatingAll = ref(false)

const outline = ref<OutlineDetail | null>(null)
const sections = ref<SectionTreeItem[]>([])
const generationStatus = ref<GenerationStatus | null>(null)

const showGenerateDialog = ref(false)
const showEditDrawer = ref(false)
const selectedSection = ref<SectionTreeItem | null>(null)

onMounted(() => {
  loadPageData()
})

async function loadPageData() {
  pageLoading.value = true
  try {
    const [outlineRes, sectionsRes] = await Promise.all([
      getOutline(outlineId.value),
      getOutlineSections(outlineId.value),
    ])
    outline.value = outlineRes.data
    sections.value = sectionsRes.data

    // 检查批量生成状态
    const statusRes = await getGenerationStatus(outlineId.value)
    generationStatus.value = statusRes.data
  } catch (err) {
    ElMessage.error('加载失败')
    router.back()
  } finally {
    pageLoading.value = false
  }
}

async function loadSections() {
  try {
    const res = await getOutlineSections(outlineId.value)
    sections.value = res.data
  } catch (err) {
    console.error('加载章节失败:', err)
  }
}

async function refreshGenerationStatus() {
  try {
    const res = await getGenerationStatus(outlineId.value)
    generationStatus.value = res.data
  } catch (err) {
    console.error('刷新状态失败:', err)
  }
}

async function handleGenerateAll() {
  try {
    await ElMessageBox.confirm('确认批量生成所有章节？这可能需要较长时间。', '提示')
    generatingAll.value = true
    const res = await generateAllSections(outlineId.value)
    ElMessage.success('批量生成任务已提交')
    refreshGenerationStatus()
  } catch (err: any) {
    if (err !== 'cancel') {
      ElMessage.error(err.response?.data?.message || '操作失败')
    }
  } finally {
    generatingAll.value = false
  }
}

function handleGenerate(row: SectionTreeItem) {
  selectedSection.value = row
  showGenerateDialog.value = true
}

function handleEdit(row: SectionTreeItem) {
  selectedSection.value = row
  showEditDrawer.value = true
}

function handleAddChild(row: SectionTreeItem) {
  // TODO: 实现添加子章节
  ElMessage.info('添加子章节功能待实现')
}

function handleVersions(row: SectionTreeItem) {
  // TODO: 实现版本历史
  ElMessage.info('版本历史功能待实现')
}

async function handleDeleteSection(row: SectionTreeItem) {
  try {
    await ElMessageBox.confirm('确认删除此章节？删除后无法恢复。', '警告', {
      type: 'warning',
    })
    await deleteSection(row.id)
    ElMessage.success('删除成功')
    loadSections()
  } catch (err: any) {
    if (err !== 'cancel') {
      ElMessage.error(err.response?.data?.message || '删除失败')
    }
  }
}

function handleGenerateSuccess(taskId: number) {
  refreshGenerationStatus()
  loadSections()
}

function getStatusType(status: string): string {
  const map: Record<string, string> = {
    draft: 'info',
    active: 'success',
    archived: 'warning',
  }
  return map[status] || 'info'
}

function getProgressStatus(status: string): '' | 'success' | 'warning' | 'exception' {
  const map: Record<string, '' | 'success' | 'warning' | 'exception'> = {
    pending: '',
    running: '',
    success: 'success',
    failed: 'exception',
  }
  return map[status] || ''
}
</script>

<style scoped>
.outline-detail {
  padding: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-left h2 {
  margin: 0;
}

.progress-card {
  margin-bottom: 20px;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.progress-info {
  margin-top: 8px;
  color: var(--el-text-color-secondary);
  font-size: 14px;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/views/outline/OutlineDetailView.vue
git commit -m "$(cat <<'EOF'
feat(frontend): add OutlineDetailView page

- Section tree with actions
- Batch generation with progress display
- Integrate SectionGenerateDialog and SectionEditDrawer

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 22: 运行测试与验证

**Files:**
- 无新文件

- [ ] **Step 1: 运行后端测试**

```bash
cd /home/newaibook/ai-bid-generator/backend
python -m pytest --tb=short -q
```

- [ ] **Step 2: 运行数据库迁移（如有遗漏）**

```bash
python manage.py makemigrations --check
python manage.py migrate
```

- [ ] **Step 3: 启动开发服务器测试 API**

```bash
python manage.py runserver 0.0.0.0:8000
```

- [ ] **Step 4: 测试关键 API 端点**

```bash
# 测试预设模板列表
curl -s http://localhost:8000/api/preset-templates/ | jq .

# 测试大纲列表
curl -s http://localhost:8000/api/outlines/ | jq .
```

---

## Spec Coverage Check

| Spec 章节 | 任务覆盖 |
|----------|---------|
| 3.1 Outline 模型 | Task 2 |
| 3.2 Section 模型 | Task 3 |
| 3.3 SectionVersion 模型 | Task 4 |
| 3.4 SectionGenerationRecord 模型 | Task 5 |
| 3.5 PresetOutlineTemplate 模型 | Task 6 |
| 5.1 OutlineService | Task 9 |
| 5.2 SectionTreeService | Task 8 |
| 5.3 SectionGenerationService | Task 10 |
| 6 Celery 任务 | Task 11 |
| 7 权限设计 | Task 1 |
| 8 API 设计 | Task 12-14 |
| 9 前端设计 | Task 16-21 |
| 10 PromptScenario | Task 15 |
| 11 实现约束 | 各任务已覆盖 |

---

**Plan complete and saved to `docs/superpowers/plans/2026-06-03-outline-section-generation.md`.**

**Two execution options:**

1. **Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**