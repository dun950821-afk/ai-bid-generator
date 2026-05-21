from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel


class Project(TimeStampedModel):
    """项目（spec §4.3.1）；v1 最小桩，完整项目管理在 projects 后续 spec 扩展。"""

    STATUS_CHOICES = [
        ("active", "进行中"),
        ("archived", "已归档"),
        ("closed", "已关闭"),
    ]

    name = models.CharField("项目名", max_length=255)
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


class Lot(TimeStampedModel):
    """标段（spec §4.3.2）；v1 最小桩，支撑上传接口的 lot_id 维度与 object_key 路径段。
    两层权限仍在项目级，不下沉到标段级。"""

    STATUS_CHOICES = [
        ("active", "进行中"),
        ("archived", "已归档"),
    ]

    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="lots", verbose_name="项目"
    )
    name = models.CharField("标段名称", max_length=255)
    code = models.CharField("标段编号", max_length=64, blank=True)
    status = models.CharField(
        "状态", max_length=32, choices=STATUS_CHOICES, default="active"
    )

    class Meta:
        db_table = "projects_lot"
        ordering = ["id"]
        indexes = [models.Index(fields=["project"])]

    def __str__(self):
        return f"{self.project.name} / {self.name}"
