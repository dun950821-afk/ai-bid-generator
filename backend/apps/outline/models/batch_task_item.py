# backend/apps/outline/models/batch_task_item.py
"""批量生成任务子项模型。"""

from django.db import models

from apps.common.models import TimeStampedModel


class BatchGenerationTaskItem(TimeStampedModel):
    """批量生成任务子项，记录每个章节的生成状态。"""

    task = models.ForeignKey(
        "outline.GenerationTask",
        on_delete=models.CASCADE,
        related_name="items",
        verbose_name="关联任务",
    )

    section = models.ForeignKey(
        "outline.Section",
        on_delete=models.CASCADE,
        related_name="batch_task_items",
        verbose_name="关联章节",
    )

    sort_index = models.PositiveIntegerField(
        verbose_name="排序序号",
        help_text="任务创建时冻结的生成顺序",
    )

    status = models.CharField(
        verbose_name="状态",
        max_length=20,
        choices=[
            ("pending", "待生成"),
            ("running", "生成中"),
            ("success", "成功"),
            ("failed", "失败"),
            ("skipped", "跳过"),
            ("cancelled", "已取消"),
        ],
        default="pending",
    )

    retry_count = models.PositiveIntegerField(
        verbose_name="重试次数",
        default=0,
        help_text="记录重试生成的次数",
    )

    generation_meta = models.JSONField(
        verbose_name="生成元数据",
        default=dict,
        blank=True,
        help_text="存储生成过程中的上下文元数据",
    )

    error_message = models.TextField(
        verbose_name="错误信息",
        blank=True,
        default="",
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

    word_count = models.PositiveIntegerField(
        verbose_name="字数",
        default=0,
    )

    class Meta:
        db_table = "outline_batch_task_item"
        verbose_name = "批量任务子项"
        verbose_name_plural = "批量任务子项"
        ordering = ["sort_index"]
        indexes = [
            models.Index(fields=["task", "status"]),
            models.Index(fields=["section"]),
        ]

    def __str__(self):
        return f"TaskItem#{self.pk} [{self.status}]"
