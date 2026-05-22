from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel


class ProjectMember(TimeStampedModel):
    """项目成员（一个用户在一个项目内只有一个角色）。"""

    project = models.ForeignKey(
        "projects.Project", on_delete=models.CASCADE, related_name="members", verbose_name="项目"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="project_memberships",
        verbose_name="用户",
    )
    project_role = models.ForeignKey(
        "projects.ProjectRole",
        on_delete=models.PROTECT,
        related_name="members",
        verbose_name="项目角色",
    )
    added_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="added_members",
        verbose_name="添加人",
    )

    class Meta:
        db_table = "projects_project_member"
        constraints = [
            models.UniqueConstraint(
                fields=["project", "user"], name="uniq_projectmember_project_user"
            )
        ]
        indexes = [
            models.Index(fields=["project"]),
            models.Index(fields=["user"]),
        ]

    def __str__(self):
        return f"{self.project.name} / {self.user.username} ({self.project_role.name})"
