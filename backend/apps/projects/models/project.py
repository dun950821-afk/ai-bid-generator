from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel


class Project(TimeStampedModel):
    """项目。"""

    STATUS_CHOICES = [
        ("active", "进行中"),
        ("archived", "已归档"),
        ("closed", "已关闭"),
    ]

    name = models.CharField("项目名", max_length=255)
    description = models.TextField("描述", blank=True, default="")
    status = models.CharField(
        "状态", max_length=32, choices=STATUS_CHOICES, default="active"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_projects",
        verbose_name="创建人",
    )

    class Meta:
        db_table = "projects_project"
        ordering = ["-created_at"]

    def __str__(self):
        return self.name
