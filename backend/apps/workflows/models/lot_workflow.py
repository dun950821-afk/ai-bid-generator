from django.db import models

from apps.common.models import TimeStampedModel


class LotWorkflow(TimeStampedModel):
    """标段流程实例。"""

    STATUS_CHOICES = [
        ("not_started", "未开始"),
        ("in_progress", "进行中"),
        ("completed", "已完成"),
        ("failed", "已失败"),
        ("archived", "已归档"),
    ]

    lot = models.OneToOneField(
        "projects.Lot",
        on_delete=models.CASCADE,
        related_name="workflow",
        verbose_name="关联标段",
    )
    workflow_template = models.ForeignKey(
        "workflows.WorkflowTemplate",
        on_delete=models.PROTECT,
        related_name="workflow_instances",
        verbose_name="使用的模板",
    )
    status = models.CharField(
        "状态", max_length=16, choices=STATUS_CHOICES, default="not_started"
    )
    started_at = models.DateTimeField("开始时间", null=True, blank=True)
    completed_at = models.DateTimeField("完成时间", null=True, blank=True)

    class Meta:
        db_table = "lot_workflow"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["lot"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self):
        return f"{self.lot.name} / {self.get_status_display()}"

    @property
    def progress_percentage(self):
        """计算完成百分比。"""
        total = self.nodes.count()
        if total == 0:
            return 0
        completed = self.nodes.filter(status="completed").count()
        return round(completed / total * 100, 1)

    @property
    def current_node(self):
        """获取当前执行节点。"""
        return self.nodes.filter(status="in_progress").first()
