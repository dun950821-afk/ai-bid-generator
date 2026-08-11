from django.db import models

from apps.common.models import TimeStampedModel


class Lot(TimeStampedModel):
    """标段。"""

    STATUS_CHOICES = [
        ("active", "进行中"),
        ("archived", "已归档"),
    ]

    WORKFLOW_STATUS_CHOICES = [
        ("not_started", "未开始"),
        ("in_progress", "进行中"),
        ("completed", "已完成"),
        ("archived", "已归档"),
    ]

    project = models.ForeignKey(
        "projects.Project", on_delete=models.CASCADE, related_name="lots", verbose_name="项目"
    )
    name = models.CharField("标段名称", max_length=255)
    code = models.CharField("标段编号", max_length=64, blank=True)

    # ---- 招标方信息（模板变量 project.tenderer/agent/... 的数据源）----
    tenderer = models.CharField("招标人", max_length=255, blank=True, default="")
    agent = models.CharField("招标代理机构", max_length=255, blank=True, default="")
    bid_deadline = models.CharField("投标截止时间", max_length=64, blank=True, default="")
    contact_name = models.CharField("招标联系人", max_length=100, blank=True, default="")
    contact_phone = models.CharField("招标联系电话", max_length=100, blank=True, default="")
    status = models.CharField(
        "状态", max_length=32, choices=STATUS_CHOICES, default="active"
    )
    workflow_status = models.CharField(
        "流程状态", max_length=16, choices=WORKFLOW_STATUS_CHOICES, default="not_started"
    )

    class Meta:
        db_table = "projects_lot"
        ordering = ["id"]
        indexes = [
            models.Index(fields=["project"]),
            models.Index(fields=["workflow_status"]),
        ]

    def __str__(self):
        return f"{self.project.name} / {self.name}"

    @property
    def has_workflow(self):
        """检查是否已创建工作流。"""
        return hasattr(self, "workflow") and self.workflow is not None
