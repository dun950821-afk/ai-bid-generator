from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel


class WorkflowNodeInstance(TimeStampedModel):
    """节点实例（运行时）。"""

    STATUS_CHOICES = [
        ("pending", "待处理"),
        ("in_progress", "进行中"),
        ("completed", "已完成"),
        ("failed", "已失败"),
        ("skipped", "已跳过"),
    ]

    APPROVAL_STATUS_CHOICES = [
        ("not_required", "无需审批"),
        ("pending", "待审批"),
        ("approved", "已通过"),
        ("rejected", "已驳回"),
    ]

    lot_workflow = models.ForeignKey(
        "workflows.LotWorkflow",
        on_delete=models.CASCADE,
        related_name="nodes",
        verbose_name="所属流程实例",
    )
    node_template = models.ForeignKey(
        "workflows.WorkflowNodeTemplate",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="node_instances",
        verbose_name="关联节点模板",
    )

    # 快照字段（从模板拷贝，后续修改不影响）
    name = models.CharField("节点名称", max_length=255)
    order = models.IntegerField("排序序号")
    requires_approval = models.BooleanField("是否需要审批", default=False)

    # 运行时状态
    status = models.CharField(
        "状态", max_length=16, choices=STATUS_CHOICES, default="pending"
    )
    assignee_type = models.CharField(
        "负责人类型", max_length=16, choices=[("role", "角色"), ("user", "用户")], default="role"
    )
    assignee_role = models.CharField("负责人角色", max_length=64, blank=True, default="")
    assignee_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_nodes",
        verbose_name="负责人（用户）",
    )

    # 时间戳
    started_at = models.DateTimeField("开始时间", null=True, blank=True)
    completed_at = models.DateTimeField("完成时间", null=True, blank=True)
    failed_at = models.DateTimeField("失败时间", null=True, blank=True)
    failure_reason = models.TextField("失败原因", blank=True, default="")

    # 审批相关
    approval_status = models.CharField(
        "审批状态", max_length=16, choices=APPROVAL_STATUS_CHOICES, default="not_required"
    )
    approver_type = models.CharField(
        "审批人类型", max_length=16, choices=[("role", "角色"), ("user", "用户")], blank=True, default=""
    )
    approver_role = models.CharField("审批角色", max_length=64, blank=True, default="")
    approver_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_nodes",
        verbose_name="审批人（用户）",
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_node_instances",
        verbose_name="实际审批人",
    )
    approved_at = models.DateTimeField("审批时间", null=True, blank=True)
    approval_comment = models.TextField("审批意见", blank=True, default="")

    # 重试计数
    retry_count = models.IntegerField("重试次数", default=0)

    class Meta:
        db_table = "workflow_node_instance"
        ordering = ["order", "id"]
        indexes = [
            models.Index(fields=["lot_workflow", "order"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self):
        return f"{self.lot_workflow.lot.name} / {self.name}"

    def can_start(self):
        """检查是否可以开始执行。"""
        if self.status not in ["pending", "failed"]:
            return False, "节点状态不允许开始"

        # 检查前置节点
        prev_nodes = WorkflowNodeInstance.objects.filter(
            lot_workflow=self.lot_workflow,
            order__lt=self.order,
        ).exclude(status="skipped")

        for node in prev_nodes:
            if node.status != "completed":
                return False, f"前置节点「{node.name}」未完成"

        return True, ""

    def can_complete(self):
        """检查是否可以完成。"""
        if self.status != "in_progress":
            return False, "节点未在执行中"

        if self.requires_approval and self.approval_status != "approved":
            return False, "节点需要审批通过后才能完成"

        return True, ""
