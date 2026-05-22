from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel


class WorkflowTemplate(TimeStampedModel):
    """流程模板。"""

    SCOPE_CHOICES = [
        ("system", "系统级"),
        ("project", "项目级"),
    ]

    name = models.CharField("模板名称", max_length=255)
    description = models.TextField("模板描述", blank=True, default="")
    scope = models.CharField(
        "作用域", max_length=16, choices=SCOPE_CHOICES, default="system"
    )
    project = models.ForeignKey(
        "projects.Project",
        on_delete=models.CASCADE,
        related_name="workflow_templates",
        verbose_name="所属项目",
        null=True,
        blank=True,
    )
    is_active = models.BooleanField("是否启用", default=True)
    is_builtin = models.BooleanField("是否内置模板", default=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_workflow_templates",
        verbose_name="创建人",
    )

    class Meta:
        db_table = "workflow_template"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["scope"]),
            models.Index(fields=["project"]),
        ]
        constraints = [
            models.CheckConstraint(
                check=models.Q(scope="system") | models.Q(project__isnull=False),
                name="check_template_scope_project",
                violation_error_message="项目级模板必须关联项目",
            )
        ]

    def __str__(self):
        return self.name

    def can_delete(self, user):
        """检查是否可删除。"""
        if self.is_builtin:
            return False
        if self.scope == "system":
            from apps.accounts.services import permission_service
            return permission_service.has_global_permission(user, "workflow_template.manage")
        return True  # 项目级模板可由项目 owner 删除