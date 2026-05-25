# backend/apps/workflows/models/workflow_audit_log.py
"""工作流审计日志模型。"""

from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel


class WorkflowAuditLog(TimeStampedModel):
    """工作流审计日志。"""

    lot_workflow = models.ForeignKey(
        "workflows.LotWorkflow",
        on_delete=models.CASCADE,
        related_name="audit_logs",
        verbose_name="工作流实例",
    )
    node = models.ForeignKey(
        "workflows.WorkflowNodeInstance",
        on_delete=models.CASCADE,
        related_name="audit_logs",
        verbose_name="节点",
    )
    action = models.CharField(
        "动作",
        max_length=32,
    )
    previous_status = models.CharField(
        "变更前状态",
        max_length=32,
    )
    new_status = models.CharField(
        "变更后状态",
        max_length=32,
    )
    operator = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="操作人",
    )
    reason = models.TextField(
        "原因/备注",
        blank=True,
    )
    error_message = models.TextField(
        "错误信息",
        blank=True,
    )

    class Meta:
        db_table = "workflow_audit_log"
        verbose_name = "工作流审计日志"
        verbose_name_plural = "工作流审计日志"
        indexes = [
            models.Index(fields=["lot_workflow", "created_at"]),
            models.Index(fields=["node", "created_at"]),
            models.Index(fields=["action"]),
        ]

    def __str__(self):
        return f"{self.node.name} / {self.action}"
