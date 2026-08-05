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

    paused_at_index = models.PositiveIntegerField(
        verbose_name="暂停位置",
        default=0,
        help_text="暂停时的章节索引（仅用于展示，恢复基于子项状态）",
    )

    current_section_id = models.IntegerField(
        verbose_name="当前处理章节ID",
        null=True,
        blank=True,
    )

    current_section_title = models.CharField(
        verbose_name="当前处理章节标题",
        max_length=500,
        blank=True,
        default="",
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

    started_at = models.DateTimeField(
        verbose_name="开始时间",
        null=True,
        blank=True,
    )

    finished_at = models.DateTimeField(
        verbose_name="完成时间",
        null=True,
        blank=True,
    )

    force_stopped = models.BooleanField("已被强制结束", default=False)
    force_stopped_at = models.DateTimeField("强制结束时间", null=True, blank=True, db_index=True)

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