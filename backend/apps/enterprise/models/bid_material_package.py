# backend/apps/enterprise/models/bid_material_package.py
"""标书材料包模型。"""

from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel
from apps.enterprise.constants import PackageStatus


class BidMaterialPackage(TimeStampedModel):
    """标书项目的材料包（快照）。

    每个标书项目创建独立材料包，锁定本次标书使用的公司信息和材料版本。
    更新公司资料不会影响已锁定的历史标书材料包。
    """

    outline = models.OneToOneField(
        "outline.Outline",
        on_delete=models.CASCADE,
        related_name="material_package",
        verbose_name="所属大纲",
    )
    company = models.ForeignKey(
        "enterprise.CompanyProfile",
        on_delete=models.PROTECT,
        related_name="material_packages",
        verbose_name="公司主体",
    )

    name = models.CharField("材料包名称", max_length=255, blank=True, default="")
    status = models.CharField(
        "状态",
        max_length=20,
        choices=PackageStatus.CHOICES,
        default=PackageStatus.DRAFT,
        db_index=True,
    )

    # 公司信息快照（JSON）
    company_snapshot = models.JSONField(
        "公司信息快照",
        default=dict,
        blank=True,
        help_text="锁定时的公司信息快照",
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_material_packages",
        verbose_name="创建人",
    )

    locked_at = models.DateTimeField(
        "锁定时间",
        null=True,
        blank=True,
    )

    class Meta:
        db_table = "enterprise_bid_material_package"
        verbose_name = "标书材料包"
        verbose_name_plural = "标书材料包"
        indexes = [
            models.Index(fields=["outline"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self):
        return f"{self.name or f'材料包#{self.id}'} - {self.outline.name}"

    def lock(self):
        """锁定材料包。"""
        if self.status == PackageStatus.LOCKED:
            return

        from django.utils import timezone
        self.status = PackageStatus.LOCKED
        self.locked_at = timezone.now()
        self.save(update_fields=["status", "locked_at"])

    def is_editable(self) -> bool:
        """检查材料包是否可编辑。"""
        return self.status == PackageStatus.DRAFT

    def get_material_by_usage_key(self, usage_key: str):
        """根据 usage_key 获取材料。"""
        item = self.items.filter(usage_key=usage_key).select_related("material").first()
        return item.material if item else None


class BidMaterialPackageItem(TimeStampedModel):
    """材料包中的材料明细。"""

    package = models.ForeignKey(
        BidMaterialPackage,
        on_delete=models.CASCADE,
        related_name="items",
        verbose_name="所属材料包",
    )
    material = models.ForeignKey(
        "enterprise.CompanyMaterial",
        on_delete=models.PROTECT,
        related_name="package_items",
        verbose_name="材料",
    )

    usage_key = models.CharField(
        "用途标识",
        max_length=100,
        db_index=True,
        help_text="如 business_license, legal_id_front, qualification_iso9001",
    )
    display_order = models.PositiveIntegerField("显示顺序", default=0)
    required = models.BooleanField("是否必需", default=False)
    notes = models.TextField("备注", blank=True, default="")

    class Meta:
        db_table = "enterprise_bid_material_package_item"
        verbose_name = "材料包明细"
        verbose_name_plural = "材料包明细"
        ordering = ["display_order", "id"]
        indexes = [
            models.Index(fields=["package", "usage_key"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["package", "usage_key"],
                name="uniq_package_usage_key",
            ),
        ]

    def __str__(self):
        return f"{self.package.name} - {self.usage_key}"
