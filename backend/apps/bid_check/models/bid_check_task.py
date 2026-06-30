# backend/apps/bid_check/models/bid_check_task.py
"""废标检查任务模型。"""

from django.conf import settings
from django.db import models

from apps.bid_check.constants import BidCheckTaskStatus


class BidCheckTask(models.Model):
    """废标检查任务。

    借鉴 OpenBidKit rejectionCheckTask：对投标文件执行三轮废标检查
    （分析→检查→定稿），输出结构化发现项。
    """

    outline = models.ForeignKey(
        "outline.Outline",
        on_delete=models.CASCADE,
        related_name="bid_checks",
        verbose_name="所属大纲",
    )
    bid_document = models.ForeignKey(
        "outline.BidDocument",
        on_delete=models.CASCADE,
        related_name="bid_checks",
        verbose_name="投标文件",
    )
    status = models.CharField(
        "状态",
        max_length=20,
        choices=BidCheckTaskStatus.CHOICES,
        default=BidCheckTaskStatus.PENDING,
        db_index=True,
    )
    invalid_bid_items = models.TextField(
        "无效投标清单",
        blank=True,
        help_text="第一阶段从招标文件提取的废标项清单 markdown",
    )
    rejection_items = models.TextField(
        "废标项清单",
        blank=True,
    )
    custom_check_items = models.TextField(
        "自定义检查项",
        blank=True,
    )
    findings_summary = models.JSONField(
        "结果摘要",
        default=dict,
        blank=True,
        help_text="如 {high:2, medium:3, low:1}",
    )
    error_message = models.TextField("错误信息", blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="bid_checks",
        verbose_name="发起人",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    finished_at = models.DateTimeField("完成时间", null=True, blank=True)

    class Meta:
        db_table = "bid_check_task"
        verbose_name = "废标检查任务"
        verbose_name_plural = "废标检查任务"
        indexes = [
            models.Index(fields=["outline"]),
            models.Index(fields=["bid_document"]),
            models.Index(fields=["status"]),
        ]
        ordering = ["-created_at"]

    def __str__(self):
        return f"BidCheckTask#{self.id} ({self.status})"
