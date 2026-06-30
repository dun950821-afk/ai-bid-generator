# backend/apps/bid_check/models/bid_check_finding.py
"""废标检查发现项模型。"""

from django.db import models

from apps.bid_check.constants import BidCheckFindingType, BidCheckSeverity


class BidCheckFinding(models.Model):
    """废标检查发现项。

    借鉴 OpenBidKit rejectionPrompts 的最终输出结构：
    {type, severity, title, summary, requirement, bidEvidence, riskReason, suggestion}
    """

    task = models.ForeignKey(
        "bid_check.BidCheckTask",
        on_delete=models.CASCADE,
        related_name="findings",
        verbose_name="检查任务",
    )
    type = models.CharField(
        "类型",
        max_length=20,
        choices=BidCheckFindingType.CHOICES,
        db_index=True,
    )
    severity = models.CharField(
        "严重程度",
        max_length=10,
        choices=BidCheckSeverity.CHOICES,
        db_index=True,
    )
    title = models.CharField(
        "标题",
        max_length=56,
        help_text="不超过 28 个中文字符",
    )
    summary = models.TextField("风险摘要")
    requirement = models.TextField(
        "检查依据",
        blank=True,
        help_text="对应检查项或招标要求",
    )
    bid_evidence = models.TextField(
        "投标文件证据",
        blank=True,
        help_text="投标文件中的明确证据、章节或缺失位置",
    )
    risk_reason = models.TextField("风险原因", blank=True)
    suggestion = models.TextField("处理建议", blank=True)
    resolved = models.BooleanField("已处理", default=False)
    resolved_at = models.DateTimeField("处理时间", null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "bid_check_finding"
        verbose_name = "废标检查发现项"
        verbose_name_plural = "废标检查发现项"
        indexes = [
            models.Index(fields=["task", "severity"]),
            models.Index(fields=["task", "type"]),
            models.Index(fields=["resolved"]),
        ]
        ordering = ["-severity", "id"]

    def __str__(self):
        return f"{self.task_id}#{self.type}:{self.title}"
