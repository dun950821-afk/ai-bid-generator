# -*- coding: utf-8 -*-
"""企业项目案例模型(响应模板 REPEAT_TABLE 数据源)。"""

from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel


class CompanyCase(TimeStampedModel):
    """企业过往项目案例。

    用于响应文件"响应人案例情况"表格的自动匹配与填充。
    """

    SOURCE_MANUAL = "manual"
    SOURCE_IMPORT = "import"

    SOURCE_CHOICES = [
        (SOURCE_MANUAL, "手动录入"),
        (SOURCE_IMPORT, "系统导入"),
    ]

    company = models.ForeignKey(
        "enterprise.CompanyProfile",
        on_delete=models.CASCADE,
        related_name="cases",
        verbose_name="所属公司",
    )

    project_name = models.CharField("项目名称", max_length=255)
    client_name = models.CharField("甲方名称", max_length=255, blank=True, default="")
    client_contact = models.CharField(
        "甲方证明人", max_length=255, blank=True, default="",
        help_text="姓名、职务、联系电话",
    )
    amount = models.DecimalField(
        "实施金额(万元)", max_digits=14, decimal_places=2, null=True, blank=True,
    )
    start_date = models.DateField("项目开始年月", null=True, blank=True)
    end_date = models.DateField("项目结束年月", null=True, blank=True)
    scope = models.TextField("项目范围概述", blank=True, default="")
    remark = models.TextField("备注", blank=True, default="")

    source = models.CharField(
        "来源",
        max_length=20,
        choices=SOURCE_CHOICES,
        default=SOURCE_MANUAL,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_company_cases",
        verbose_name="创建人",
    )

    class Meta:
        db_table = "enterprise_company_case"
        verbose_name = "企业项目案例"
        verbose_name_plural = "企业项目案例"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["company", "project_name"]),
            models.Index(fields=["company", "client_name"]),
        ]

    def __str__(self):
        return f"{self.project_name} ({self.client_name or '无甲方'})"

    def period_text(self) -> str:
        """项目起止年月文本(如 2024.01-2024.06)。"""
        fmt = lambda d: d.strftime("%Y.%m") if d else ""
        start = fmt(self.start_date)
        end = fmt(self.end_date)
        if start and end:
            return f"{start}-{end}"
        return start or end or ""

    def amount_text(self) -> str:
        """金额文本(万元), 空则返回空串。"""
        if self.amount is None:
            return ""
        val = float(self.amount)
        if val == int(val):
            return str(int(val))
        return f"{val:.2f}"
