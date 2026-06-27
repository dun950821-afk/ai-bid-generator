# backend/apps/enterprise/models/company_material.py
"""企业材料模型。"""

from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel
from apps.common.services.storage import StorageService
from apps.enterprise.constants import MaterialStatus, MaterialType


class CompanyMaterial(TimeStampedModel):
    """企业材料资产（图片/PDF）。

    统一管理营业执照、身份证、资质证书、案例证明、社保证明等材料。
    文件存储在 MinIO，通过 StorageService 管理。
    """

    company = models.ForeignKey(
        "enterprise.CompanyProfile",
        on_delete=models.CASCADE,
        related_name="materials",
        verbose_name="所属公司",
    )

    material_type = models.CharField(
        "材料类型",
        max_length=50,
        choices=MaterialType.CHOICES,
        db_index=True,
    )
    title = models.CharField("材料名称", max_length=255)

    # MinIO 存储
    object_key = models.CharField(
        "MinIO 对象键",
        max_length=500,
        blank=True,
        default="",
        help_text="MinIO 中的对象路径",
    )
    file_size = models.PositiveIntegerField(
        "文件大小",
        default=0,
        help_text="文件大小（字节）",
    )
    content_type = models.CharField(
        "内容类型",
        max_length=100,
        blank=True,
        default="",
        help_text="MIME 类型",
    )

    # 有效期管理
    valid_from = models.DateField("有效期开始", null=True, blank=True)
    valid_to = models.DateField(
        "有效期结束",
        null=True,
        blank=True,
        db_index=True,
    )

    # 证书信息
    issuing_authority = models.CharField(
        "发证机构",
        max_length=255,
        blank=True,
        default="",
    )
    certificate_no = models.CharField(
        "证书编号",
        max_length=255,
        blank=True,
        default="",
    )

    # OCR/解析结果
    extracted_text = models.TextField("OCR解析文本", blank=True, default="")
    tags = models.JSONField("标签", default=list, blank=True)

    # 敏感性标记
    is_sensitive = models.BooleanField(
        "是否敏感材料",
        default=False,
        help_text="身份证、授权书等敏感材料",
    )
    status = models.CharField(
        "状态",
        max_length=20,
        choices=MaterialStatus.CHOICES,
        default=MaterialStatus.ACTIVE,
        db_index=True,
    )

    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="uploaded_materials",
        verbose_name="上传人",
    )

    class Meta:
        db_table = "enterprise_company_material"
        verbose_name = "企业材料"
        verbose_name_plural = "企业材料"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["company", "material_type"]),
            models.Index(fields=["status"]),
            models.Index(fields=["valid_to"]),
            models.Index(fields=["is_sensitive"]),
            models.Index(fields=["status", "valid_to"], name="material_status_valid_idx"),
        ]

    def __str__(self):
        return f"{self.company.name} - {self.title}"

    def save(self, *args, **kwargs):
        """自动设置敏感标记。"""
        if self.material_type in MaterialType.SENSITIVE_TYPES:
            self.is_sensitive = True
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        """删除前检查是否被锁定的材料包引用。"""
        from django.core.exceptions import ValidationError
        from apps.enterprise.constants import PackageStatus

        # 检查是否被锁定的材料包引用
        locked_packages = self.package_items.filter(
            package__status=PackageStatus.LOCKED
        ).select_related("package")

        if locked_packages.exists():
            package_names = [item.package.name or f"材料包#{item.package.id}" for item in locked_packages[:3]]
            raise ValidationError(
                f"材料已被以下锁定的材料包引用，无法删除：{', '.join(package_names)}"
            )

        super().delete(*args, **kwargs)

    def get_file_url(self, absolute_url: bool = False) -> str:
        """获取文件访问 URL。

        Args:
            absolute_url: 是否强制返回绝对 URL（用于外部服务）

        Returns:
            文件 URL
        """
        if not self.object_key:
            return ""

        from django.conf import settings
        storage = StorageService()

        if self.is_sensitive:
            # 敏感材料使用更短的预签名 URL（5分钟）
            return storage.presigned_get_object(
                self.object_key,
                expires_seconds=300,  # 5 分钟
                absolute_url=absolute_url,
            )
        else:
            # 公开材料直接返回公开 URL
            if settings.MINIO_PROXY_ENABLED and not absolute_url:
                return f"/minio/{settings.MINIO_BUCKET}/{self.object_key}"
            else:
                scheme = "https" if settings.MINIO_SECURE else "http"
                return f"{scheme}://{settings.MINIO_PUBLIC_ENDPOINT}/{settings.MINIO_BUCKET}/{self.object_key}"

    @property
    def is_expired(self) -> bool:
        """检查材料是否已过期。"""
        if self.valid_to:
            from datetime import date
            return self.valid_to < date.today()
        return False

    @property
    def days_to_expire(self) -> int | None:
        """计算距离过期天数。"""
        if self.valid_to:
            from datetime import date
            delta = self.valid_to - date.today()
            return delta.days
        return None

    def to_usage_dict(self) -> dict:
        """生成用于生成上下文的材料信息。"""
        return {
            "id": self.id,
            "usage_key": self.material_type,
            "title": self.title,
            "material_type": self.material_type,
            "available": self.status == MaterialStatus.ACTIVE and not self.is_expired,
            "is_expired": self.is_expired,
            "days_to_expire": self.days_to_expire,
            "valid_to": self.valid_to.isoformat() if self.valid_to else None,
            "certificate_no": self.certificate_no,
            "issuing_authority": self.issuing_authority,
            "is_sensitive": self.is_sensitive,
        }