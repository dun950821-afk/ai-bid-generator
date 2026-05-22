from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel


class ProjectRole(TimeStampedModel):
    """项目角色（支持自定义）。"""

    CORE_OWNER_PERMISSIONS = [
        "project.view",
        "project.update",
        "project.member.manage",
    ]

    project = models.ForeignKey(
        "projects.Project",
        on_delete=models.CASCADE,
        related_name="roles",
        verbose_name="所属项目",
    )
    name = models.CharField("角色名称", max_length=128)
    code = models.CharField("角色编码", max_length=64)
    permissions = models.JSONField("权限码列表", default=list)
    is_builtin = models.BooleanField("是否内置角色", default=False)
    is_default = models.BooleanField("是否默认角色", default=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_project_roles",
        verbose_name="创建人",
    )

    class Meta:
        db_table = "projects_project_role"
        constraints = [
            models.UniqueConstraint(
                fields=["project", "code"],
                name="uniq_projectrole_project_code",
            )
        ]
        indexes = [
            models.Index(fields=["project"]),
        ]

    def __str__(self):
        return f"{self.project.name} / {self.name}"

    def save(self, *args, **kwargs):
        """Owner 角色自动合并核心权限。"""
        if self.code == "owner":
            merged = set(self.permissions) | set(self.CORE_OWNER_PERMISSIONS)
            self.permissions = list(merged)
        super().save(*args, **kwargs)
