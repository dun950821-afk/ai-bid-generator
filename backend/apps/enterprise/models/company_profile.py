# backend/apps/enterprise/models/company_profile.py
"""公司主体模型。"""

from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel
from apps.enterprise.constants import CompanyStatus


class CompanyProfile(TimeStampedModel):
    """公司主体信息（结构化主数据）。

    维护公司级主数据，包括公司名称、统一社会信用代码、法人、注册资本等。
    这些信息不依赖 RAG，可校验、可版本化、可复用。
    """

    name = models.CharField("公司名称", max_length=255)
    short_name = models.CharField("公司简称", max_length=100, blank=True, default="")
    unified_social_credit_code = models.CharField(
        "统一社会信用代码",
        max_length=64,
        unique=True,
        blank=True,
        default="",
    )
    legal_representative = models.CharField(
        "法定代表人",
        max_length=100,
        blank=True,
        default="",
    )
    registered_capital = models.CharField(
        "注册资本",
        max_length=100,
        blank=True,
        default="",
    )
    established_date = models.DateField("成立日期", null=True, blank=True)
    registered_address = models.TextField("注册地址", blank=True, default="")
    business_scope = models.TextField("经营范围", blank=True, default="")
    company_intro = models.TextField("公司简介", blank=True, default="")

    # 联系信息
    official_phone = models.CharField("联系电话", max_length=100, blank=True, default="")
    official_email = models.CharField("邮箱", max_length=100, blank=True, default="")
    website = models.CharField("官网", max_length=255, blank=True, default="")
    contact_person = models.CharField("联系人", max_length=100, blank=True, default="")

    # 银行账户信息
    bank_name = models.CharField("开户银行", max_length=255, blank=True, default="")
    bank_account = models.CharField("银行账号", max_length=100, blank=True, default="")

    # 状态管理。默认启用：创建公司是主数据完整录入动作，
    # 若默认 draft，前端无启用入口且选择器只查 active，公司将永远无法关联
    status = models.CharField(
        "状态",
        max_length=20,
        choices=CompanyStatus.CHOICES,
        default=CompanyStatus.ACTIVE,
        db_index=True,
    )
    version = models.PositiveIntegerField("版本号", default=1)
    is_default = models.BooleanField(
        "默认公司",
        default=False,
        help_text="系统只能有一个默认公司",
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_companies",
        verbose_name="创建人",
    )

    class Meta:
        db_table = "enterprise_company_profile"
        verbose_name = "公司主体"
        verbose_name_plural = "公司主体"
        ordering = ["-is_default", "-created_at"]
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["is_default"]),
            models.Index(fields=["unified_social_credit_code"]),
        ]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        """确保只有一个默认公司。"""
        if self.is_default:
            CompanyProfile.objects.filter(is_default=True).exclude(pk=self.pk).update(
                is_default=False
            )
        super().save(*args, **kwargs)

    def to_snapshot(self) -> dict:
        """生成公司信息快照。"""
        return {
            "id": self.id,
            "name": self.name,
            "short_name": self.short_name,
            "unified_social_credit_code": self.unified_social_credit_code,
            "legal_representative": self.legal_representative,
            "registered_capital": self.registered_capital,
            "established_date": (
                self.established_date.isoformat() if self.established_date else None
            ),
            "registered_address": self.registered_address,
            "business_scope": self.business_scope,
            "company_intro": self.company_intro,
            "official_phone": self.official_phone,
            "official_email": self.official_email,
            "website": self.website,
            "contact_person": self.contact_person,
            "bank_name": self.bank_name,
            "bank_account": self.bank_account,
            "version": self.version,
        }
