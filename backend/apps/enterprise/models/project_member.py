# -*- coding: utf-8 -*-
"""企业项目人员库模型(REPEAT_BLOCK 人员简历填充数据源)。"""

from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel


class ProjectMember(TimeStampedModel):
    """企业项目人员(简历块自动填充数据源)。"""

    company = models.ForeignKey(
        "enterprise.CompanyProfile",
        on_delete=models.CASCADE,
        related_name="members",
        verbose_name="所属公司",
    )
    name = models.CharField("姓名", max_length=64)
    role = models.CharField("角色/岗位", max_length=128, blank=True, default="")
    title = models.CharField("职称", max_length=128, blank=True, default="")
    experience_years = models.PositiveIntegerField("工作年限", null=True, blank=True)
    certificates = models.TextField(
        "专业证书", blank=True, default="",
        help_text="如 CISP、CISSP、PMP 等, 逗号分隔",
    )
    projects = models.TextField(
        "项目经历", blank=True, default="",
        help_text="参与过的项目简要描述",
    )
    material = models.ForeignKey(
        "enterprise.CompanyMaterial",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="member_materials",
        verbose_name="社保证明材料",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_project_members",
        verbose_name="创建人",
    )

    class Meta:
        db_table = "enterprise_project_member"
        verbose_name = "项目人员"
        verbose_name_plural = "项目人员"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["company", "name"]),
            models.Index(fields=["company", "role"]),
        ]

    def __str__(self):
        return f"{self.name} ({self.role or '未定角色'})"
