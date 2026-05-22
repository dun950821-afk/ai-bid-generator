from django.conf import settings
from django.db import models
from django.core.exceptions import ValidationError

from apps.common.models import TimeStampedModel


class WorkflowNodeTemplate(TimeStampedModel):
    """节点模板。"""

    ASSIGNEE_TYPE_CHOICES = [
        ("role", "角色"),
        ("user", "用户"),
    ]

    workflow_template = models.ForeignKey(
        "workflows.WorkflowTemplate",
        on_delete=models.CASCADE,
        related_name="node_templates",
        verbose_name="所属模板",
    )
    name = models.CharField("节点名称", max_length=255)
    order = models.IntegerField("排序序号", default=0)
    default_assignee_type = models.CharField(
        "默认负责人类型", max_length=16, choices=ASSIGNEE_TYPE_CHOICES, default="role"
    )
    default_assignee_role = models.CharField(
        "默认负责人角色", max_length=64, blank=True, default=""
    )
    default_assignee_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_node_templates",
        verbose_name="默认负责人（用户）",
    )
    requires_approval = models.BooleanField("是否需要审批", default=False)
    approver_type = models.CharField(
        "审批人类型", max_length=16, choices=ASSIGNEE_TYPE_CHOICES, blank=True, default=""
    )
    approver_role = models.CharField(
        "审批角色", max_length=64, blank=True, default=""
    )
    approver_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approving_node_templates",
        verbose_name="审批人（用户）",
    )
    estimated_hours = models.FloatField("预估工时", null=True, blank=True)
    description = models.TextField("节点说明", blank=True, default="")

    class Meta:
        db_table = "workflow_node_template"
        ordering = ["order", "id"]
        indexes = [
            models.Index(fields=["workflow_template", "order"]),
        ]

    def __str__(self):
        return f"{self.workflow_template.name} / {self.name}"

    def clean(self):
        """验证：系统模板不允许设置具体用户。"""
        if self.workflow_template and self.workflow_template.scope == "system":
            if self.default_assignee_user:
                raise ValidationError(
                    {"default_assignee_user": "系统模板不允许设置默认负责人用户"}
                )
            if self.approver_user:
                raise ValidationError(
                    {"approver_user": "系统模板不允许设置审批用户"}
                )