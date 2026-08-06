# backend/apps/requirements/models/dedup_run.py
"""标段级条款去重运行记录模型。"""

from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel
from apps.requirements.constants import DedupRunStatus


class RequirementDedupRun(TimeStampedModel):
    """标段级条款去重运行记录。

    记录一次标段（lot）内条款三层去重（规则 + 向量 + LLM 仲裁）的
    完整信息：参数快照、聚簇统计、错误信息等。
    """

    lot = models.ForeignKey(
        "projects.Lot",
        on_delete=models.CASCADE,
        related_name="requirement_dedup_runs",
        verbose_name="标段",
    )
    project = models.ForeignKey(
        "projects.Project",
        on_delete=models.CASCADE,
        related_name="requirement_dedup_runs",
        verbose_name="项目",
    )
    async_task = models.ForeignKey(
        "common.AsyncTask",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="requirement_dedup_runs",
        verbose_name="异步任务",
    )
    status = models.CharField(
        "状态",
        max_length=30,
        choices=DedupRunStatus.CHOICES,
        default=DedupRunStatus.PENDING,
    )
    params = models.JSONField(
        "参数快照",
        default=dict,
        blank=True,
        help_text='{"cosine_threshold": 0.92, ...}，降级等运行情况也记录在此',
    )
    total_count = models.PositiveIntegerField(
        "候选条款总数",
        default=0,
    )
    cluster_count = models.PositiveIntegerField(
        "重复簇数量",
        default=0,
        help_text="size >= 2 的簇数量",
    )
    llm_arbitrated_count = models.PositiveIntegerField(
        "LLM 仲裁簇数量",
        default=0,
        help_text="由 LLM 选出保留条款的簇数量（其余走确定性回退）",
    )
    duplicate_count = models.PositiveIntegerField(
        "已合并条款数",
        default=0,
    )
    error_message = models.TextField(
        "错误信息",
        blank=True,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="requirement_dedup_runs",
        verbose_name="创建人",
    )
    started_at = models.DateTimeField(
        "开始时间",
        null=True,
        blank=True,
    )
    finished_at = models.DateTimeField(
        "结束时间",
        null=True,
        blank=True,
    )

    class Meta:
        db_table = "requirements_dedup_run"
        verbose_name = "条款去重运行"
        verbose_name_plural = "条款去重运行"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["lot"]),
            models.Index(fields=["project"]),
            models.Index(fields=["status"]),
            models.Index(fields=["created_at"]),
        ]

    def __str__(self):
        return f"DedupRun#{self.id} (lot={self.lot_id}, {self.status})"
