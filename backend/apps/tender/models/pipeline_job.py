"""流水线任务模型。"""

from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel
from apps.tender.constants import PipelineStage, PipelineStatus


class PipelineJob(TimeStampedModel):
    """流水线任务。

    管理 TenderFile 各阶段处理状态，支持版本化和重跑。
    """

    tender_file = models.ForeignKey(
        "tender.TenderFile",
        on_delete=models.CASCADE,
        related_name="pipeline_jobs",
        verbose_name="招标文件",
    )
    stage = models.CharField(
        "阶段",
        max_length=32,
        choices=PipelineStage.CHOICES,
    )
    status = models.CharField(
        "状态",
        max_length=16,
        choices=PipelineStatus.CHOICES,
        default=PipelineStatus.PENDING,
    )
    version = models.CharField(
        "处理器版本",
        max_length=32,
    )
    input_hash = models.CharField(
        "输入哈希",
        max_length=64,
        blank=True,
    )
    output_hash = models.CharField(
        "输出哈希",
        max_length=64,
        blank=True,
    )
    started_at = models.DateTimeField(
        "开始时间",
        null=True,
        blank=True,
    )
    finished_at = models.DateTimeField(
        "完成时间",
        null=True,
        blank=True,
    )
    error_message = models.TextField(
        "错误信息",
        blank=True,
    )
    retry_count = models.PositiveSmallIntegerField(
        "重试次数",
        default=0,
    )

    class Meta:
        db_table = "tender_pipeline_job"
        verbose_name = "流水线任务"
        verbose_name_plural = "流水线任务"
        indexes = [
            models.Index(fields=["tender_file", "stage"]),
            models.Index(fields=["status"]),
            models.Index(fields=["stage", "status"]),
        ]

    def __str__(self):
        return f"{self.stage}#{self.id} ({self.status})"