# 内容责任矩阵实现计划 - 第一阶段

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现内容责任矩阵数据模型和自动生成功能

**Architecture:** 在现有 Section 模型新增矩阵字段，创建 GenerationTask 模型追踪任务状态，实现矩阵生成 Celery 任务和 API

**Tech Stack:** Django, DRF, Celery, PostgreSQL, JSONField

---

## 文件结构

| 文件 | 职责 |
|------|------|
| `backend/apps/outline/constants.py` | 新增矩阵相关常量和枚举 |
| `backend/apps/outline/models/section.py` | 新增矩阵字段和正文生成字段 |
| `backend/apps/outline/models/generation_task.py` | 新建 GenerationTask 任务模型 |
| `backend/apps/outline/models/__init__.py` | 导出新模型 |
| `backend/apps/outline/serializers.py` | 矩阵相关序列化器 |
| `backend/apps/outline/views.py` | 矩阵 API 接口 |
| `backend/apps/outline/urls.py` | 路由配置 |
| `backend/apps/outline/tasks.py` | 矩阵生成 Celery 任务 |
| `backend/apps/outline/services/matrix_service.py` | 矩阵生成服务 |

---

### Task 1: 新增矩阵相关常量

**Files:**
- Modify: `backend/apps/outline/constants.py`

- [ ] **Step 1: 添加矩阵相关常量类**

在 `backend/apps/outline/constants.py` 末尾添加：

```python
class SectionRole:
    """章节定位。"""

    QUALIFICATION = "qualification"
    TECHNICAL_SOLUTION = "technical_solution"
    BUSINESS_RESPONSE = "business_response"
    SERVICE_PLAN = "service_plan"
    TEAM_INTRO = "team_intro"
    ATTACHMENT = "attachment"
    OTHER = "other"

    CHOICES = [
        (QUALIFICATION, "资格证明"),
        (TECHNICAL_SOLUTION, "技术方案"),
        (BUSINESS_RESPONSE, "商务响应"),
        (SERVICE_PLAN, "服务方案"),
        (TEAM_INTRO, "团队介绍"),
        (ATTACHMENT, "附件材料"),
        (OTHER, "其他"),
    ]

    MAP = dict(CHOICES)


class ExpressionForm:
    """建议表达形式。"""

    BODY_TEXT = "body_text"
    TABLE = "table"
    COMMITMENT_LETTER = "commitment_letter"
    CERTIFICATE = "certificate"
    ATTACHMENT_INDEX = "attachment_index"
    RESUME_TABLE = "resume_table"
    MIXED = "mixed"

    CHOICES = [
        (BODY_TEXT, "正文"),
        (TABLE, "表格"),
        (COMMITMENT_LETTER, "承诺函"),
        (CERTIFICATE, "证明材料"),
        (ATTACHMENT_INDEX, "附件索引"),
        (RESUME_TABLE, "简历表"),
        (MIXED, "混合形式"),
    ]

    MAP = dict(CHOICES)


class WritingDepth:
    """写作深度。"""

    OVERVIEW = "overview"
    MODERATE = "moderate"
    DETAILED = "detailed"

    CHOICES = [
        (OVERVIEW, "概述"),
        (MODERATE, "适度展开"),
        (DETAILED, "详细展开"),
    ]

    MAP = dict(CHOICES)


class ContentMatrixStatus:
    """矩阵状态。"""

    PENDING = "pending"
    GENERATING = "generating"
    GENERATED = "generated"
    EDITED = "edited"
    FAILED = "failed"

    CHOICES = [
        (PENDING, "待生成"),
        (GENERATING, "生成中"),
        (GENERATED, "已生成"),
        (EDITED, "已编辑"),
        (FAILED, "生成失败"),
    ]

    MAP = dict(CHOICES)


class ContentGenerationStatus:
    """正文生成状态（新增，与现有 SectionGenerationStatus 区分）。"""

    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    SKIPPED = "skipped"

    CHOICES = [
        (PENDING, "待生成"),
        (RUNNING, "生成中"),
        (SUCCESS, "已完成"),
        (FAILED, "生成失败"),
        (SKIPPED, "已跳过"),
    ]

    MAP = dict(CHOICES)


class GenerationTaskType:
    """生成任务类型。"""

    MATRIX_GENERATION = "matrix_generation"
    SECTION_BATCH_GENERATION = "section_batch_generation"

    CHOICES = [
        (MATRIX_GENERATION, "矩阵生成"),
        (SECTION_BATCH_GENERATION, "章节批量生成"),
    ]


class GenerationTaskStatus:
    """生成任务状态。"""

    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    PARTIAL_SUCCESS = "partial_success"
    CANCEL_REQUESTED = "cancel_requested"
    CANCELLED = "cancelled"
    PAUSED = "paused"

    CHOICES = [
        (PENDING, "待执行"),
        (RUNNING, "执行中"),
        (SUCCESS, "成功"),
        (FAILED, "失败"),
        (PARTIAL_SUCCESS, "部分成功"),
        (CANCEL_REQUESTED, "请求取消"),
        (CANCELLED, "已取消"),
        (PAUSED, "已暂停"),
    ]


# 辅助函数
def get_section_role_display(role_code: str) -> str:
    return SectionRole.MAP.get(role_code, role_code)


def get_expression_form_display(form_code: str) -> str:
    return ExpressionForm.MAP.get(form_code, form_code)


def get_writing_depth_display(depth_code: str) -> str:
    return WritingDepth.MAP.get(depth_code, depth_code)
```

- [ ] **Step 2: 运行测试验证常量定义**

Run: `cd backend && python -c "from apps.outline.constants import ContentMatrixStatus, SectionRole; print(ContentMatrixStatus.CHOICES)"`

Expected: 输出常量列表无报错

---

### Task 2: Section 模型新增矩阵字段

**Files:**
- Modify: `backend/apps/outline/models/section.py`

- [ ] **Step 1: 在 Section 模型中新增矩阵相关字段**

修改 `backend/apps/outline/models/section.py`，在现有字段后添加：

```python
# backend/apps/outline/models/section.py
"""章节模型。"""

from django.db import models

from apps.common.models import TimeStampedModel
from apps.outline.constants import (
    ContentGenerationStatus,
    ContentMatrixStatus,
    SectionGenerationStatus,
    SectionStatus,
)


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

    # ========== 内容责任矩阵相关字段 ==========

    content_matrix = models.JSONField(
        verbose_name="内容责任矩阵",
        default=dict,
        blank=True,
        help_text="定义章节的写作边界和生成策略",
    )

    content_matrix_status = models.CharField(
        verbose_name="矩阵状态",
        max_length=20,
        default=ContentMatrixStatus.PENDING,
        choices=ContentMatrixStatus.CHOICES,
        db_index=True,
    )

    content_matrix_version = models.PositiveIntegerField(
        verbose_name="矩阵版本号",
        default=1,
    )

    content_matrix_updated_at = models.DateTimeField(
        verbose_name="矩阵更新时间",
        null=True,
        blank=True,
        db_index=True,
    )

    content_matrix_error = models.TextField(
        verbose_name="矩阵生成失败原因",
        blank=True,
        default="",
    )

    # ========== 正文生成相关字段 ==========

    content_generation_status = models.CharField(
        verbose_name="正文生成状态",
        max_length=20,
        default=ContentGenerationStatus.PENDING,
        choices=ContentGenerationStatus.CHOICES,
        db_index=True,
    )

    content_generation_error = models.TextField(
        verbose_name="正文生成失败原因",
        blank=True,
        default="",
    )

    content_generated_at = models.DateTimeField(
        verbose_name="正文生成时间",
        null=True,
        blank=True,
        db_index=True,
    )

    content_word_count = models.PositiveIntegerField(
        verbose_name="正文字数",
        default=0,
    )

    content_summary = models.TextField(
        verbose_name="章节摘要",
        blank=True,
        default="",
    )

    class Meta:
        db_table = "outline_section"
        verbose_name = "大纲章节"
        verbose_name_plural = "大纲章节"
        ordering = ["sort_order", "id"]
        constraints = [
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
            models.Index(fields=["content_matrix_status"]),
            models.Index(fields=["content_generation_status"]),
        ]

    def __str__(self):
        return self.title

    def clean(self):
        """校验 parent 属于同一 outline。"""
        from django.core.exceptions import ValidationError

        if self.parent_id and self.parent.outline_id != self.outline_id:
            raise ValidationError({"parent": "parent 必须属于同一 outline"})

    @property
    def children_count(self) -> int:
        """返回子章节数量。"""
        return self.children.count()

    @property
    def section_number(self) -> str:
        """生成章节编号（如"一"、"（一）"、"1"等）。"""
        # 根据 level 和 sort_order 生成编号
        if self.level == 1:
            # 一级章节：一、二、三
            chinese_numerals = "一二三四五六七八九十"
            idx = self.sort_order
            if idx < 10:
                return chinese_numerals[idx]
            elif idx < 20:
                return f"十{chinese_numerals[idx - 10]}"
            else:
                return f"{idx + 1}"
        elif self.level == 2:
            # 二级章节：（一）（二）（三）
            chinese_numerals = "一二三四五六七八九十"
            return f"（{chinese_numerals[self.sort_order]}）"
        elif self.level == 3:
            # 三级章节：1、2、3
            return f"{self.sort_order + 1}"
        elif self.level == 4:
            # 四级章节：1.1、1.2
            if self.parent:
                return f"{self.parent.sort_order + 1}.{self.sort_order + 1}"
            return f"{self.sort_order + 1}"
        else:
            # 五级章节：（1）（2）
            return f"（{self.sort_order + 1}）"
```

- [ ] **Step 2: 创建数据库迁移**

Run: `cd backend && python manage.py makemigrations outline --name add_content_matrix_fields`

Expected: 生成迁移文件

- [ ] **Step 3: 执行数据库迁移**

Run: `cd backend && python manage.py migrate outline`

Expected: 迁移成功

---

### Task 3: 创建 GenerationTask 模型

**Files:**
- Create: `backend/apps/outline/models/generation_task.py`
- Modify: `backend/apps/outline/models/__init__.py`

- [ ] **Step 1: 创建 GenerationTask 模型文件**

创建 `backend/apps/outline/models/generation_task.py`：

```python
# backend/apps/outline/models/generation_task.py
"""生成任务模型。"""

from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel
from apps.outline.constants import GenerationTaskStatus, GenerationTaskType


class GenerationTask(TimeStampedModel):
    """统一生成任务模型，记录矩阵生成和正文批量生成的执行状态。"""

    task_type = models.CharField(
        verbose_name="任务类型",
        max_length=30,
        choices=GenerationTaskType.CHOICES,
        db_index=True,
    )

    outline = models.ForeignKey(
        "outline.Outline",
        on_delete=models.CASCADE,
        related_name="generation_tasks",
        verbose_name="关联大纲",
    )

    status = models.CharField(
        verbose_name="任务状态",
        max_length=20,
        default=GenerationTaskStatus.PENDING,
        choices=GenerationTaskStatus.CHOICES,
        db_index=True,
    )

    total_count = models.PositiveIntegerField(
        verbose_name="总数",
        default=0,
    )

    success_count = models.PositiveIntegerField(
        verbose_name="成功数",
        default=0,
    )

    failed_count = models.PositiveIntegerField(
        verbose_name="失败数",
        default=0,
    )

    skipped_count = models.PositiveIntegerField(
        verbose_name="跳过数",
        default=0,
    )

    current_section_id = models.IntegerField(
        verbose_name="当前处理章节ID",
        null=True,
        blank=True,
    )

    error_message = models.TextField(
        verbose_name="错误信息",
        blank=True,
        default="",
    )

    celery_task_id = models.CharField(
        verbose_name="Celery 任务ID",
        max_length=255,
        blank=True,
        default="",
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        verbose_name="创建人",
    )

    finished_at = models.DateTimeField(
        verbose_name="完成时间",
        null=True,
        blank=True,
    )

    # ========== 任务参数与结果 ==========

    params = models.JSONField(
        verbose_name="任务参数",
        default=dict,
        blank=True,
        help_text="存储 section_ids、force_overwrite、parallel、skip_on_failure 等参数",
    )

    result = models.JSONField(
        verbose_name="任务结果",
        default=dict,
        blank=True,
        help_text="存储失败明细、警告信息等结果数据",
    )

    class Meta:
        db_table = "outline_generation_task"
        verbose_name = "生成任务"
        verbose_name_plural = "生成任务"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["outline", "status"]),
            models.Index(fields=["task_type"]),
            models.Index(fields=["celery_task_id"]),
        ]

    def __str__(self):
        return f"{self.get_task_type_display()}#{self.pk} ({self.get_status_display()})"
```

- [ ] **Step 2: 更新 models/__init__.py 导出**

修改 `backend/apps/outline/models/__init__.py`：

```python
# backend/apps/outline/models/__init__.py
"""大纲模块模型。"""

from .generation_task import GenerationTask
from .outline import Outline
from .preset_template import PresetOutlineTemplate, PresetSectionTemplate
from .section import Section
from .section_generation_record import SectionGenerationRecord
from .section_version import SectionVersion

__all__ = [
    "GenerationTask",
    "Outline",
    "PresetOutlineTemplate",
    "PresetSectionTemplate",
    "Section",
    "SectionGenerationRecord",
    "SectionVersion",
]
```

- [ ] **Step 3: 创建数据库迁移**

Run: `cd backend && python manage.py makemigrations outline --name add_generation_task_model`

Expected: 生成迁移文件

- [ ] **Step 4: 执行数据库迁移**

Run: `cd backend && python manage.py migrate outline`

Expected: 迁移成功

---

### Task 4: 创建矩阵生成服务

**Files:**
- Create: `backend/apps/outline/services/matrix_service.py`

- [ ] **Step 1: 创建矩阵生成服务**

创建 `backend/apps/outline/services/matrix_service.py`：

```python
# backend/apps/outline/services/matrix_service.py
"""内容责任矩阵生成服务。"""

import json
import logging
from typing import Optional

from django.core.cache import cache
from django.db import transaction
from django.utils import timezone

from apps.generation.services.ai_task_execution_service import AiTaskExecutionService
from apps.outline.constants import (
    ContentMatrixStatus,
    GenerationTaskStatus,
    GenerationTaskType,
)
from apps.outline.models import GenerationTask, Outline, Section

logger = logging.getLogger(__name__)

MATRIX_LOCK_TIMEOUT = 1800  # 30分钟


class MatrixService:
    """内容责任矩阵生成服务。"""

    def get_matrix_generation_targets(
        self,
        outline_id: int,
        force_overwrite: bool = False,
        section_ids: Optional[list[int]] = None,
    ) -> list[Section]:
        """获取本次需要生成矩阵的章节。

        Args:
            outline_id: 大纲ID
            force_overwrite: 是否强制覆盖 edited 状态
            section_ids: 指定生成的章节ID列表

        Returns:
            需要生成矩阵的章节列表
        """
        sections = Section.objects.filter(outline_id=outline_id)

        if section_ids:
            sections = sections.filter(id__in=section_ids)

        if force_overwrite:
            return list(sections)

        # 默认保留 edited 状态的章节
        return list(
            sections.filter(
                content_matrix_status__in=[
                    ContentMatrixStatus.PENDING,
                    ContentMatrixStatus.FAILED,
                    ContentMatrixStatus.GENERATED,
                ]
            )
        )

    def acquire_matrix_generation_lock(self, outline_id: int) -> bool:
        """获取矩阵生成锁。"""
        cache_key = f"matrix_gen_lock:{outline_id}"
        return cache.add(cache_key, "1", timeout=MATRIX_LOCK_TIMEOUT)

    def release_matrix_generation_lock(self, outline_id: int) -> None:
        """释放矩阵生成锁。"""
        cache_key = f"matrix_gen_lock:{outline_id}"
        cache.delete(cache_key)

    def can_start_matrix_generation(self, outline_id: int) -> tuple[bool, str]:
        """检查是否可以启动新的矩阵生成任务。"""
        generating_count = Section.objects.filter(
            outline_id=outline_id,
            content_matrix_status=ContentMatrixStatus.GENERATING,
        ).count()

        if generating_count > 0:
            return False, "矩阵正在生成中，请稍后再试"
        return True, ""

    def start_matrix_generation(
        self,
        outline_id: int,
        user,
        section_ids: Optional[list[int]] = None,
        force_overwrite: bool = False,
    ) -> GenerationTask:
        """启动矩阵生成任务。

        Args:
            outline_id: 大纲ID
            user: 发起用户
            section_ids: 指定生成的章节ID列表
            force_overwrite: 是否强制覆盖 edited 状态

        Returns:
            创建的 GenerationTask 实例
        """
        # 检查是否可以启动
        can_start, message = self.can_start_matrix_generation(outline_id)
        if not can_start:
            raise ValueError(message)

        # 获取目标章节
        targets = self.get_matrix_generation_targets(
            outline_id=outline_id,
            force_overwrite=force_overwrite,
            section_ids=section_ids,
        )

        if not targets:
            raise ValueError("没有需要生成矩阵的章节")

        # 创建任务
        task = GenerationTask.objects.create(
            task_type=GenerationTaskType.MATRIX_GENERATION,
            outline_id=outline_id,
            status=GenerationTaskStatus.PENDING,
            total_count=len(targets),
            created_by=user,
            params={
                "section_ids": section_ids,
                "force_overwrite": force_overwrite,
            },
        )

        # 启动 Celery 任务
        from apps.outline.tasks import generate_content_matrix_task

        generate_content_matrix_task.delay(
            outline_id=outline_id,
            task_id=task.id,
        )

        return task

    def get_matrix_status(self, outline_id: int) -> dict:
        """获取大纲的矩阵整体状态。"""
        from django.db.models import Count

        status_counts = dict(
            Section.objects.filter(outline_id=outline_id)
            .values("content_matrix_status")
            .annotate(count=Count("id"))
            .values_list("content_matrix_status", "count")
        )

        total = sum(status_counts.values())
        is_generating = status_counts.get(ContentMatrixStatus.GENERATING, 0) > 0

        # 获取当前运行中的任务
        current_task = None
        if is_generating:
            task = GenerationTask.objects.filter(
                outline_id=outline_id,
                task_type=GenerationTaskType.MATRIX_GENERATION,
                status=GenerationTaskStatus.RUNNING,
            ).first()
            if task:
                current_task = task.id

        return {
            "total": total,
            "pending": status_counts.get(ContentMatrixStatus.PENDING, 0),
            "generating": status_counts.get(ContentMatrixStatus.GENERATING, 0),
            "generated": status_counts.get(ContentMatrixStatus.GENERATED, 0),
            "edited": status_counts.get(ContentMatrixStatus.EDITED, 0),
            "failed": status_counts.get(ContentMatrixStatus.FAILED, 0),
            "is_generating": is_generating,
            "current_task_id": current_task,
        }

    def update_section_matrix(
        self,
        section: Section,
        matrix_data: dict,
        is_user_edit: bool = False,
    ) -> Section:
        """写入矩阵数据，统一处理版本和时间更新。

        Args:
            section: 章节实例
            matrix_data: 矩阵数据
            is_user_edit: 是否为用户编辑

        Returns:
            更新后的章节实例
        """
        section.content_matrix = matrix_data
        section.content_matrix_version += 1
        section.content_matrix_updated_at = timezone.now()

        if is_user_edit:
            section.content_matrix_status = ContentMatrixStatus.EDITED
        else:
            section.content_matrix_status = ContentMatrixStatus.GENERATED

        section.content_matrix_error = ""
        section.save(
            update_fields=[
                "content_matrix",
                "content_matrix_version",
                "content_matrix_updated_at",
                "content_matrix_status",
                "content_matrix_error",
            ]
        )
        return section

    def build_outline_structure(self, outline: Outline) -> str:
        """构建大纲结构文本，用于 AI 提示词。"""
        sections = Section.objects.filter(outline=outline).order_by("sort_order", "id")

        lines = []
        for section in sections:
            indent = "  " * (section.level - 1)
            lines.append(
                f"{indent}[ID:{section.id}] {section.section_number} {section.title}"
            )

        return "\n".join(lines)

    def validate_matrix_output(
        self,
        output_data: dict,
        outline_id: int,
    ) -> tuple[dict, list[str]]:
        """校验 AI 输出的矩阵数据。

        Args:
            output_data: AI 输出的 JSON 数据
            outline_id: 大纲ID

        Returns:
            (校验后的数据, 警告列表)
        """
        warnings = []

        # 校验 sections 是否为数组
        sections = output_data.get("sections", [])
        if not isinstance(sections, list):
            raise ValueError("AI 输出缺少 sections 数组")

        # 获取大纲所有章节 ID
        valid_section_ids = set(
            Section.objects.filter(outline_id=outline_id).values_list("id", flat=True)
        )

        # 收集有效的章节
        valid_sections = []
        returned_ids = set()

        for section_data in sections:
            section_id = section_data.get("section_id")
            if not section_id:
                warnings.append("发现缺少 section_id 的章节，已跳过")
                continue

            if section_id not in valid_section_ids:
                warnings.append(f"章节 ID {section_id} 不属于当前大纲，已跳过")
                continue

            # 校验必填字段
            if not section_data.get("write_scope"):
                warnings.append(f"章节 {section_id} 缺少 write_scope，标记为失败")
                continue

            returned_ids.add(section_id)
            valid_sections.append(section_data)

        # 检查遗漏的章节
        missing_ids = valid_section_ids - returned_ids
        if missing_ids:
            warnings.append(f"缺少章节: {missing_ids}")

        return {"sections": valid_sections}, warnings
```

- [ ] **Step 2: 验证服务可以正常导入**

Run: `cd backend && python -c "from apps.outline.services.matrix_service import MatrixService; print('OK')"`

Expected: 输出 "OK"

---

### Task 5: 创建矩阵生成 Celery 任务

**Files:**
- Modify: `backend/apps/outline/tasks.py`

- [ ] **Step 1: 在 tasks.py 末尾添加矩阵生成任务**

在 `backend/apps/outline/tasks.py` 末尾添加：

```python
@shared_task(bind=True)
def generate_content_matrix_task(self, outline_id: int, task_id: int):
    """矩阵生成 Celery 任务。

    Args:
        outline_id: 大纲ID
        task_id: GenerationTask ID
    """
    from apps.outline.constants import ContentMatrixStatus, GenerationTaskStatus
    from apps.outline.models import GenerationTask, Outline, Section
    from apps.outline.services.matrix_service import MatrixService

    matrix_service = MatrixService()
    task = GenerationTask.objects.get(pk=task_id)
    outline = Outline.objects.get(pk=outline_id)

    # 获取任务参数
    params = task.params or {}
    section_ids = params.get("section_ids")
    force_overwrite = params.get("force_overwrite", False)

    lock_acquired = False

    try:
        # 获取锁
        if not matrix_service.acquire_matrix_generation_lock(outline_id):
            task.status = GenerationTaskStatus.FAILED
            task.error_message = "无法获取任务锁，可能有其他任务正在执行"
            task.finished_at = timezone.now()
            task.save()
            return

        lock_acquired = True

        # 更新任务状态
        task.status = GenerationTaskStatus.RUNNING
        task.save()

        # 获取目标章节
        targets = matrix_service.get_matrix_generation_targets(
            outline_id=outline_id,
            force_overwrite=force_overwrite,
            section_ids=section_ids,
        )

        if not targets:
            task.status = GenerationTaskStatus.SUCCESS
            task.error_message = "没有需要生成矩阵的章节"
            task.finished_at = timezone.now()
            task.save()
            return

        task.total_count = len(targets)
        task.save()

        # 保存原状态快照
        original_statuses = {
            s.id: {
                "status": s.content_matrix_status,
                "matrix": s.content_matrix.copy() if s.content_matrix else {},
            }
            for s in targets
        }

        # 更新章节状态为 generating
        target_ids = [s.id for s in targets]
        Section.objects.filter(id__in=target_ids).update(
            content_matrix_status=ContentMatrixStatus.GENERATING,
            content_matrix_error="",
        )

        # 构建大纲结构
        outline_structure = matrix_service.build_outline_structure(outline)

        # 获取招标要求摘要（如果有）
        requirements_summary = ""
        if outline.source_tender_file_id:
            from apps.requirements.models import TenderRequirement

            requirements = TenderRequirement.objects.filter(
                tender_file_id=outline.source_tender_file_id
            )[:20]
            if requirements:
                requirements_summary = "\n".join(
                    f"- [{r.requirement_no}] {r.title}: {r.content[:200] if r.content else ''}"
                    for r in requirements
                )

        # 调用 AI 生成矩阵
        variables = {
            "project_name": outline.project.name,
            "lot_name": outline.lot.name,
            "outline_structure": outline_structure,
            "requirements_summary": requirements_summary,
        }

        prompt_run = AiTaskExecutionService().execute(
            scenario="content_matrix_generation",
            variables=variables,
            created_by=task.created_by,
        )

        if prompt_run.status != "succeeded":
            raise Exception(prompt_run.error_message or "AI 生成矩阵失败")

        # 解析 AI 输出
        output_text = prompt_run.output_text or ""
        output_json = prompt_run.output_json or {}

        # 如果 output_json 没有 sections，尝试从 output_text 解析
        if not output_json.get("sections"):
            import json
            import re

            json_match = re.search(r"\{[\s\S]*\}", output_text)
            if json_match:
                output_json = json.loads(json_match.group())

        # 校验输出
        validated_data, warnings = matrix_service.validate_matrix_output(
            output_json, outline_id
        )

        # 记录警告
        if warnings:
            logger.warning(f"Matrix generation warnings for outline {outline_id}: {warnings}")

        # 处理每个章节
        success_count = 0
        failed_count = 0
        returned_section_ids = set()

        for section_data in validated_data.get("sections", []):
            section_id = section_data.get("section_id")
            returned_section_ids.add(section_id)

            try:
                section = Section.objects.get(pk=section_id)

                # 补全章节引用信息（ID 数组转对象数组）
                enriched_data = matrix_service.enrich_section_references(
                    section_data, outline_id
                )

                # 写入矩阵
                matrix_service.update_section_matrix(section, enriched_data)
                success_count += 1

            except Exception as e:
                logger.exception(f"Failed to update matrix for section {section_id}")
                Section.objects.filter(pk=section_id).update(
                    content_matrix_status=ContentMatrixStatus.FAILED,
                    content_matrix_error=str(e)[:500],
                )
                failed_count += 1

        # 标记缺失章节为失败
        missing_ids = set(target_ids) - returned_section_ids
        if missing_ids:
            Section.objects.filter(id__in=missing_ids).update(
                content_matrix_status=ContentMatrixStatus.FAILED,
                content_matrix_error="AI 未返回此章节的矩阵",
            )
            failed_count += len(missing_ids)

        # 更新任务状态
        task.success_count = success_count
        task.failed_count = failed_count
        task.status = (
            GenerationTaskStatus.SUCCESS
            if failed_count == 0
            else (
                GenerationTaskStatus.FAILED
                if success_count == 0
                else GenerationTaskStatus.PARTIAL_SUCCESS
            )
        )
        task.result = {
            "warnings": warnings,
            "missing_ids": list(missing_ids),
        }
        task.finished_at = timezone.now()
        task.save()

    except Exception as e:
        logger.exception(f"Matrix generation failed: outline_id={outline_id}")

        # 恢复原状态
        for section_id, original in original_statuses.items():
            Section.objects.filter(pk=section_id).update(
                content_matrix_status=original["status"],
                content_matrix=original["matrix"],
            )

        task.status = GenerationTaskStatus.FAILED
        task.error_message = str(e)[:2000]
        task.finished_at = timezone.now()
        task.save()

    finally:
        if lock_acquired:
            matrix_service.release_matrix_generation_lock(outline_id)


# 在 MatrixService 类中添加 enrich_section_references 方法
```

- [ ] **Step 2: 在 MatrixService 中添加 enrich_section_references 方法**

在 `backend/apps/outline/services/matrix_service.py` 的 `MatrixService` 类中添加：

```python
    def enrich_section_references(
        self,
        section_data: dict,
        outline_id: int,
    ) -> dict:
        """补全章节引用信息（ID 数组转对象数组）。

        Args:
            section_data: AI 输出的章节数据
            outline_id: 大纲ID

        Returns:
            补全后的章节数据
        """
        result = section_data.copy()

        # 获取所有引用章节 ID
        ref_field_names = [
            "reference_sections",
            "no_duplicate_sections",
            "dependency_sections",
        ]

        for field_name in ref_field_names:
            ids = section_data.get(field_name, [])
            if not ids:
                result[field_name] = []
                continue

            # ID 转对象数组
            sections = Section.objects.filter(id__in=ids, outline_id=outline_id)
            section_map = {s.id: s for s in sections}

            enriched = []
            for sid in ids:
                if sid in section_map:
                    s = section_map[sid]
                    enriched.append({
                        "id": s.id,
                        "section_number": s.section_number,
                        "title": s.title,
                    })

            result[field_name] = enriched

        # 处理 related_requirements（保持 ID 数组）
        if "related_requirements" not in result:
            result["related_requirements"] = []

        return result
```

- [ ] **Step 3: 验证任务可以正常导入**

Run: `cd backend && python -c "from apps.outline.tasks import generate_content_matrix_task; print('OK')"`

Expected: 输出 "OK"

---

### Task 6: 创建矩阵相关序列化器

**Files:**
- Modify: `backend/apps/outline/serializers.py`

- [ ] **Step 1: 在 serializers.py 末尾添加矩阵相关序列化器**

在 `backend/apps/outline/serializers.py` 末尾添加：

```python
# ========== 矩阵相关序列化器 ==========


class ContentMatrixSerializer(serializers.Serializer):
    """内容责任矩阵序列化器。"""

    section_role = serializers.CharField(required=False, allow_blank=True)
    write_scope = serializers.CharField(required=True, allow_blank=False)
    exclude_scope = serializers.CharField(required=False, allow_blank=True)
    reference_sections = serializers.ListField(required=False, default=list)
    no_duplicate_sections = serializers.ListField(required=False, default=list)
    dependency_sections = serializers.ListField(required=False, default=list)
    expression_form = serializers.CharField(required=False, allow_blank=True)
    writing_depth = serializers.CharField(required=False, allow_blank=True)
    related_requirements = serializers.ListField(required=False, default=list)
    generation_priority = serializers.IntegerField(required=False, default=50, min_value=0, max_value=100)
    ai_reasoning_summary = serializers.CharField(required=False, allow_blank=True)
    manual_notes = serializers.CharField(required=False, allow_blank=True)


class SectionMatrixSerializer(serializers.Serializer):
    """章节矩阵状态序列化器。"""

    section_id = serializers.IntegerField(source="id")
    content_matrix = ContentMatrixSerializer(required=False)
    content_matrix_status = serializers.CharField()
    content_matrix_version = serializers.IntegerField()
    content_matrix_updated_at = serializers.DateTimeField()
    content_matrix_error = serializers.CharField()


class UpdateMatrixSerializer(serializers.Serializer):
    """更新矩阵序列化器（乐观锁）。"""

    content_matrix_version = serializers.IntegerField(required=True)
    content_matrix = ContentMatrixSerializer(required=True)


class GenerateMatrixSerializer(serializers.Serializer):
    """生成矩阵请求序列化器。"""

    force = serializers.BooleanField(required=False, default=False)
    section_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        allow_empty=True,
    )


class MatrixStatusSerializer(serializers.Serializer):
    """矩阵整体状态序列化器。"""

    total = serializers.IntegerField()
    pending = serializers.IntegerField()
    generating = serializers.IntegerField()
    generated = serializers.IntegerField()
    edited = serializers.IntegerField()
    failed = serializers.IntegerField()
    is_generating = serializers.BooleanField()
    current_task_id = serializers.IntegerField(allow_null=True)


class GenerationTaskSerializer(serializers.ModelSerializer):
    """生成任务序列化器。"""

    current_section_title = serializers.SerializerMethodField()

    class Meta:
        model = GenerationTask
        fields = [
            "id",
            "task_type",
            "status",
            "total_count",
            "success_count",
            "failed_count",
            "skipped_count",
            "current_section_id",
            "current_section_title",
            "error_message",
            "created_at",
            "updated_at",
            "finished_at",
            "params",
            "result",
        ]

    def get_current_section_title(self, obj):
        if obj.current_section_id:
            from apps.outline.models import Section

            try:
                section = Section.objects.get(pk=obj.current_section_id)
                return section.title
            except Section.DoesNotExist:
                pass
        return None
```

- [ ] **Step 2: 在文件顶部导入 GenerationTask**

在 `backend/apps/outline/serializers.py` 的导入部分添加：

```python
from apps.outline.models import (
    GenerationTask,
    Outline,
    PresetOutlineTemplate,
    Section,
    SectionVersion,
)
```

- [ ] **Step 3: 验证序列化器可以正常导入**

Run: `cd backend && python -c "from apps.outline.serializers import MatrixStatusSerializer; print('OK')"`

Expected: 输出 "OK"

---

### Task 7: 创建矩阵 API 视图

**Files:**
- Modify: `backend/apps/outline/views.py`

- [ ] **Step 1: 在 OutlineViewSet 中添加矩阵相关接口**

在 `backend/apps/outline/views.py` 的 `OutlineViewSet` 类中添加：

```python
    @action(detail=True, methods=["get"])
    def matrix_status(self, request, pk=None):
        """获取矩阵整体状态。"""
        outline = self.get_object()
        from apps.outline.services.matrix_service import MatrixService

        result = MatrixService().get_matrix_status(outline.id)
        from apps.outline.serializers import MatrixStatusSerializer

        serializer = MatrixStatusSerializer(result)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def generate_matrix(self, request, pk=None):
        """批量生成矩阵。"""
        outline = self.get_object()
        from apps.outline.serializers import GenerateMatrixSerializer
        from apps.outline.services.matrix_service import MatrixService

        serializer = GenerateMatrixSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            task = MatrixService().start_matrix_generation(
                outline_id=outline.id,
                user=request.user,
                section_ids=serializer.validated_data.get("section_ids"),
                force_overwrite=serializer.validated_data.get("force", False),
            )

            return Response(
                {
                    "task_id": task.id,
                    "status": task.status,
                    "target_count": task.total_count,
                },
                status=status.HTTP_202_ACCEPTED,
            )
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["post"])
    def retry_matrix_failed(self, request, pk=None):
        """重试失败的矩阵。"""
        outline = self.get_object()
        from apps.outline.services.matrix_service import MatrixService

        # 获取失败的章节
        from apps.outline.constants import ContentMatrixStatus
        from apps.outline.models import Section

        failed_sections = Section.objects.filter(
            outline=outline,
            content_matrix_status=ContentMatrixStatus.FAILED,
        )
        failed_ids = list(failed_sections.values_list("id", flat=True))

        if not failed_ids:
            return Response({"message": "没有失败的矩阵需要重试"})

        try:
            task = MatrixService().start_matrix_generation(
                outline_id=outline.id,
                user=request.user,
                section_ids=failed_ids,
                force_overwrite=False,
            )

            return Response(
                {
                    "task_id": task.id,
                    "retry_count": len(failed_ids),
                }
            )
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
```

- [ ] **Step 2: 在 SectionViewSet 中添加矩阵操作接口**

在 `backend/apps/outline/views.py` 的 `SectionViewSet` 类中添加：

```python
    @action(detail=True, methods=["get"])
    def matrix(self, request, pk=None):
        """获取章节矩阵。"""
        section = self.get_object()
        from apps.outline.serializers import SectionMatrixSerializer

        serializer = SectionMatrixSerializer(section)
        return Response(serializer.data)

    @action(detail=True, methods=["put"])
    def matrix(self, request, pk=None):
        """更新章节矩阵（人工编辑，乐观锁）。"""
        section = self.get_object()
        from apps.outline.serializers import UpdateMatrixSerializer
        from apps.outline.services.matrix_service import MatrixService

        serializer = UpdateMatrixSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # 乐观锁检查
        if section.content_matrix_version != serializer.validated_data["content_matrix_version"]:
            return Response(
                {
                    "success": False,
                    "error_code": "VERSION_CONFLICT",
                    "message": "矩阵内容已被其他操作更新，请刷新后再编辑。",
                },
                status=status.HTTP_409_CONFLICT,
            )

        # 更新矩阵
        matrix_data = serializer.validated_data["content_matrix"]
        # 合并原有矩阵数据
        merged_matrix = section.content_matrix.copy() if section.content_matrix else {}
        merged_matrix.update(matrix_data)

        MatrixService().update_section_matrix(section, merged_matrix, is_user_edit=True)

        return Response(
            {
                "success": True,
                "content_matrix_version": section.content_matrix_version,
                "content_matrix_status": section.content_matrix_status,
            }
        )

    @action(detail=True, methods=["post"])
    def generate_matrix(self, request, pk=None):
        """生成单个章节矩阵。"""
        section = self.get_object()

        force = request.data.get("force", False)

        # 检查是否可以生成
        from apps.outline.constants import ContentMatrixStatus

        if section.content_matrix_status == ContentMatrixStatus.EDITED and not force:
            return Response(
                {"error": "章节矩阵已编辑，需要确认强制覆盖"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 启动矩阵生成
        from apps.outline.services.matrix_service import MatrixService

        try:
            task = MatrixService().start_matrix_generation(
                outline_id=section.outline_id,
                user=request.user,
                section_ids=[section.id],
                force_overwrite=force,
            )

            return Response(
                {
                    "task_id": task.id,
                    "status": task.status,
                },
                status=status.HTTP_202_ACCEPTED,
            )
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
```

注意：Django 的 `@action` 装饰器不支持同名方法。需要将 `matrix` 的 GET 和 PUT 合并为一个 action：

```python
    @action(detail=True, methods=["get", "put"])
    def matrix(self, request, pk=None):
        """获取或更新章节矩阵。"""
        section = self.get_object()

        if request.method == "GET":
            from apps.outline.serializers import SectionMatrixSerializer

            serializer = SectionMatrixSerializer(section)
            return Response(serializer.data)

        # PUT 方法
        from apps.outline.serializers import UpdateMatrixSerializer
        from apps.outline.services.matrix_service import MatrixService

        serializer = UpdateMatrixSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # 乐观锁检查
        if section.content_matrix_version != serializer.validated_data["content_matrix_version"]:
            return Response(
                {
                    "success": False,
                    "error_code": "VERSION_CONFLICT",
                    "message": "矩阵内容已被其他操作更新，请刷新后再编辑。",
                },
                status=status.HTTP_409_CONFLICT,
            )

        # 更新矩阵
        matrix_data = serializer.validated_data["content_matrix"]
        merged_matrix = section.content_matrix.copy() if section.content_matrix else {}
        merged_matrix.update(matrix_data)

        MatrixService().update_section_matrix(section, merged_matrix, is_user_edit=True)

        return Response(
            {
                "success": True,
                "content_matrix_version": section.content_matrix_version,
                "content_matrix_status": section.content_matrix_status,
            }
        )
```

- [ ] **Step 3: 验证视图可以正常导入**

Run: `cd backend && python -c "from apps.outline.views import OutlineViewSet; print('OK')"`

Expected: 输出 "OK"

---

### Task 8: 创建 GenerationTask 视图集

**Files:**
- Modify: `backend/apps/outline/views.py`
- Modify: `backend/apps/outline/urls.py`

- [ ] **Step 1: 在 views.py 添加 GenerationTaskViewSet**

在 `backend/apps/outline/views.py` 末尾添加：

```python
class GenerationTaskViewSet(viewsets.ReadOnlyModelViewSet):
    """生成任务视图集。"""

    queryset = GenerationTask.objects.select_related("outline", "created_by")
    serializer_class = GenerationTaskSerializer
    permission_classes = [RequirePermission]

    def get_queryset(self):
        queryset = super().get_queryset()
        outline_id = self.request.query_params.get("outline_id")
        if outline_id:
            queryset = queryset.filter(outline_id=outline_id)
        return queryset

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        """请求取消任务（软取消）。"""
        task = self.get_object()

        if task.status not in ["pending", "running"]:
            return Response(
                {"error": "任务已完成，无法取消"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from apps.outline.constants import GenerationTaskStatus

        task.status = GenerationTaskStatus.CANCEL_REQUESTED
        task.save()

        return Response(
            {
                "success": True,
                "status": task.status,
                "message": "系统将停止后续章节生成，当前正在生成的章节可能会继续完成。",
            }
        )
```

- [ ] **Step 2: 在 urls.py 中注册路由**

修改 `backend/apps/outline/urls.py`：

```python
# backend/apps/outline/urls.py
"""大纲模块路由配置。"""

from rest_framework.routers import DefaultRouter

from apps.outline.views import (
    GenerationTaskViewSet,
    OutlineViewSet,
    PresetOutlineTemplateViewSet,
    SectionViewSet,
)

router = DefaultRouter()
router.register(r"preset-templates", PresetOutlineTemplateViewSet, basename="preset-template")
router.register(r"outlines", OutlineViewSet, basename="outline")
router.register(r"sections", SectionViewSet, basename="section")
router.register(r"generation-tasks", GenerationTaskViewSet, basename="generation-task")

urlpatterns = router.urls
```

- [ ] **Step 3: 验证路由配置**

Run: `cd backend && python -c "from apps.outline.urls import urlpatterns; print(len(urlpatterns), 'routes')"`

Expected: 输出路由数量

---

### Task 9: 大纲创建后自动触发矩阵生成

**Files:**
- Modify: `backend/apps/outline/tasks.py`

- [ ] **Step 1: 修改 generate_outline_task 任务**

在 `backend/apps/outline/tasks.py` 的 `generate_outline_task` 函数末尾，添加触发矩阵生成的逻辑：

找到这段代码：
```python
        async_task.status = "success"
        async_task.progress = 100
        async_task.current_step = "大纲生成完成"
        async_task.result_payload = {
            "outline_id": outline.id,
            "section_count": len(sections),
            "prompt_run_id": prompt_run.id,
        }
        async_task.finished_at = timezone.now()
        async_task.save()
```

修改为：
```python
        async_task.status = "success"
        async_task.progress = 100
        async_task.current_step = "大纲生成完成，正在生成内容责任矩阵"
        async_task.result_payload = {
            "outline_id": outline.id,
            "section_count": len(sections),
            "prompt_run_id": prompt_run.id,
        }
        async_task.finished_at = timezone.now()
        async_task.save()

        # 自动触发矩阵生成
        try:
            from apps.outline.services.matrix_service import MatrixService

            MatrixService().start_matrix_generation(
                outline_id=outline.id,
                user=user,
            )
        except Exception as e:
            # 矩阵生成失败不影响大纲创建
            logger.warning(f"Failed to start matrix generation for outline {outline.id}: {e}")
```

- [ ] **Step 2: 验证任务修改**

Run: `cd backend && python -c "from apps.outline.tasks import generate_outline_task; print('OK')"`

Expected: 输出 "OK"

---

### Task 10: 创建提示词模板种子数据

**Files:**
- Modify: `backend/apps/generation/management/commands/seed_prompts.py`

- [ ] **Step 1: 在 seed_prompts.py 中添加矩阵生成提示词**

在 `backend/apps/generation/management/commands/seed_prompts.py` 的 `handle` 方法中，添加矩阵生成提示词的种子数据：

```python
        # 内容责任矩阵生成提示词
        self._create_prompt(
            scenario="content_matrix_generation",
            name="内容责任矩阵生成",
            description="根据招标文件目录结构，为每个章节划分写作边界",
            system_prompt="""你是一位资深投标文件编制专家，擅长根据招标文件目录结构，为每个章节划分写作边界，确保投标文件内容不重复、不遗漏、前后连贯。

你的任务是生成一张"内容责任矩阵"，明确每个章节写什么、不写什么、如何与其他章节衔接，并为后续逐章节生成正文提供边界约束。

核心原则：

1. 父章节只写总述、编制目的、内容范围、结构说明和承接关系，不展开子章节细节。
2. 子章节写具体内容，不重复父章节总述，不提前展开其他兄弟章节内容。
3. 每个内容点只能在一个章节详细展开，其他章节如需提及，只能使用"详见 ×× 章节"的方式简要引用。
4. 资格证明、承诺函、偏离表、报价表、人员简历、证书材料等固定格式内容，应按表格、承诺函、证明材料、附件索引或简历表方式处理，不要写成大段技术方案正文。
5. 技术方案类章节可以详细展开，表达应专业、稳健、可落地。
6. 最终汇总类章节，如评标索引表、目录、响应索引、偏离汇总表等，应以后置汇总和索引为主，不提前生成具体正文内容。
7. 如果某章节依赖其他章节内容，应在 dependency_sections 中明确列出依赖章节。
8. 如果某章节容易与其他章节重复，应在 no_duplicate_sections 中明确列出禁止重复展开的章节。

输出要求：

1. 必须严格按照 JSON 格式输出，不要添加任何解释文本、Markdown 标记或额外说明。
2. 每个输入章节都必须出现在输出结果中，不得遗漏。
3. section_id 必须与输入的章节 ID 完全对应，不得自行编造、修改或重排 ID。
4. section_number 和 title 应与输入目录保持一致。
5. section_role、expression_form、writing_depth 必须使用指定枚举值。
6. reference_sections、no_duplicate_sections、dependency_sections、related_requirements 只能输出 ID 数组。
7. generation_priority 必须为 0-100 的整数，数值越大，正文生成越靠前。
8. 父章节的 generation_priority 应低于其子章节；最终汇总类章节的 generation_priority 应最低。
9. ai_reasoning_summary 应简要说明该章节边界划分依据，便于用户后续编辑。
10. 不要输出"作为AI""根据你提供的目录"等非投标文件系统语言。""",
            user_prompt_template="""请根据以下投标文件目录结构，生成内容责任矩阵。

## 项目信息
- 项目名称：{{ project_name }}
- 标段名称：{{ lot_name }}

## 完整目录结构

{{ outline_structure }}

{{#if requirements_summary }}
## 招标关键条款摘要

{{ requirements_summary }}
{{/if}}

## 输出格式要求

请输出 JSON 格式，结构如下：

{
  "sections": [
    {
      "section_id": 章节ID（必须与输入一致）,
      "section_number": "章节编号",
      "title": "章节标题",
      "section_role": "章节定位",
      "write_scope": "本章写什么（详细说明写作范围）",
      "exclude_scope": "本章不写什么（明确排除的内容）",
      "reference_sections": [可引用的章节ID数组],
      "no_duplicate_sections": [禁止重复展开的章节ID数组],
      "dependency_sections": [必须先完成的章节ID数组],
      "expression_form": "建议表达形式",
      "writing_depth": "写作深度",
      "related_requirements": [关联的招标条款ID数组],
      "generation_priority": 生成优先级（0-100，数值越大越先生成）,
      "ai_reasoning_summary": "AI划分说明（解释为什么这样划分边界）"
    }
  ]
}

## 枚举值说明

section_role 可选值：
- "qualification"：资格证明
- "technical_solution"：技术方案
- "business_response"：商务响应
- "service_plan"：服务方案
- "team_intro"：团队介绍
- "attachment"：附件材料
- "other"：其他

expression_form 可选值：
- "body_text"：正文
- "table"：表格
- "commitment_letter"：承诺函
- "certificate"：证明材料
- "attachment_index"：附件索引
- "resume_table"：简历表
- "mixed"：混合形式

writing_depth 可选值：
- "overview"：概述（适用于父章节、索引类）
- "moderate"：适度展开
- "detailed"：详细展开（适用于叶子技术章节）""",
            variables_schema={
                "type": "object",
                "properties": {
                    "project_name": {"type": "string"},
                    "lot_name": {"type": "string"},
                    "outline_structure": {"type": "string"},
                    "requirements_summary": {"type": "string"},
                },
                "required": ["project_name", "lot_name", "outline_structure"],
            },
            output_schema={
                "type": "object",
                "required": ["sections"],
                "properties": {
                    "sections": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "required": ["section_id", "title", "write_scope"],
                            "properties": {
                                "section_id": {"type": "integer"},
                                "section_number": {"type": "string"},
                                "title": {"type": "string"},
                                "section_role": {"type": "string"},
                                "write_scope": {"type": "string", "minLength": 1},
                                "exclude_scope": {"type": "string"},
                                "reference_sections": {"type": "array", "items": {"type": "integer"}},
                                "no_duplicate_sections": {"type": "array", "items": {"type": "integer"}},
                                "dependency_sections": {"type": "array", "items": {"type": "integer"}},
                                "expression_form": {"type": "string"},
                                "writing_depth": {"type": "string"},
                                "related_requirements": {"type": "array", "items": {"type": "integer"}},
                                "generation_priority": {"type": "integer", "minimum": 0, "maximum": 100},
                                "ai_reasoning_summary": {"type": "string"},
                            },
                        },
                    }
                },
            },
        )
```

- [ ] **Step 2: 运行种子命令**

Run: `cd backend && python manage.py seed_prompts`

Expected: 提示词创建成功

---

### Task 11: 提交代码

**Files:**
- All modified files

- [ ] **Step 1: 提交第一阶段代码**

Run:
```bash
cd backend && git add apps/outline/constants.py apps/outline/models/ apps/outline/services/matrix_service.py apps/outline/serializers.py apps/outline/views.py apps/outline/urls.py apps/outline/tasks.py
git commit -m "$(cat <<'EOF'
feat(outline): add content matrix generation feature (Phase 1)

- Add matrix status and generation status constants
- Add content_matrix fields to Section model
- Add GenerationTask model for task tracking
- Add MatrixService for matrix generation logic
- Add generate_content_matrix_task Celery task
- Add matrix API endpoints (status, generate, retry)
- Add GenerationTaskViewSet for task management
- Auto-trigger matrix generation after outline creation
- Add content_matrix_generation prompt template

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

Expected: 提交成功

---

## 后续阶段预览

### 第二阶段：矩阵编辑界面和状态展示
- 前端矩阵编辑对话框组件
- 矩阵状态图标显示
- 矩阵版本冲突处理

### 第三阶段：批量生成顺序计算
- 推荐生成顺序计算算法
- 生成顺序预览界面
- 依赖冲突检测

### 第四阶段：正文生成上下文和提示词接入
- 正文生成目标章节筛选
- 上下文构建服务
- 章节正文生成提示词

### 第五阶段：防重复校验、失败重试、任务控制
- 防重复校验功能
- 章节摘要自动生成
- 任务控制 API
