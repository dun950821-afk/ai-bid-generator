# backend/apps/outline/models/bid_document.py
"""标书 Word 文档模型。"""

from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel
from apps.common.services.storage import StorageService


class BidDocumentStatus:
    """文档状态常量。"""

    DRAFT = "draft"
    EDITING = "editing"
    SAVED = "saved"
    EXPORTED = "exported"

    CHOICES = [
        (DRAFT, "草稿"),
        (EDITING, "编辑中"),
        (SAVED, "已保存"),
        (EXPORTED, "已导出"),
    ]


class BidDocument(TimeStampedModel):
    """标书 Word 文档。

    用于存储 ONLYOFFICE 编辑的整份标书 docx 文件。
    文件存储在 MinIO，通过 presigned URL 访问。
    """

    outline = models.ForeignKey(
        "outline.Outline",
        on_delete=models.CASCADE,
        related_name="bid_documents",
        verbose_name="所属大纲",
    )

    title = models.CharField(
        verbose_name="文档标题",
        max_length=255,
    )

    # MinIO 存储相关字段
    object_key = models.CharField(
        verbose_name="MinIO 对象键",
        max_length=500,
        blank=True,
        help_text="MinIO 中的对象路径",
    )

    # 保留 docx_file 用于兼容，但不再使用
    docx_file = models.FileField(
        verbose_name="Word 文件",
        upload_to="bid_documents/%Y/%m/%d/",
        blank=True,
        null=True,
    )

    version = models.PositiveIntegerField(
        verbose_name="版本号",
        default=1,
    )

    file_key = models.CharField(
        verbose_name="ONLYOFFICE 文件 Key",
        max_length=128,
        db_index=True,
        help_text="每次保存后更新，用于 ONLYOFFICE 缓存刷新",
    )

    status = models.CharField(
        verbose_name="文档状态",
        max_length=20,
        default=BidDocumentStatus.DRAFT,
        choices=BidDocumentStatus.CHOICES,
        db_index=True,
    )

    saved_at = models.DateTimeField(
        verbose_name="最后保存时间",
        null=True,
        blank=True,
        help_text="ONLYOFFICE status=2 保存成功的时间",
    )

    force_saved_at = models.DateTimeField(
        verbose_name="强制保存时间",
        null=True,
        blank=True,
        help_text="ONLYOFFICE status=6 强制保存的时间",
    )

    last_callback_status = models.CharField(
        verbose_name="最后回调状态",
        max_length=20,
        blank=True,
        default="",
        help_text="ONLYOFFICE callback 的 status 值",
    )

    last_callback_payload = models.JSONField(
        verbose_name="最后回调数据",
        default=dict,
        blank=True,
        help_text="ONLYOFFICE callback 的完整 payload（调试用）",
    )

    # ---- 模板渲染快照（方案 §49：半年后仍能追溯用了哪个模板）----
    template = models.ForeignKey(
        "outline.BidWordTemplate",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="bid_documents",
        verbose_name="使用的模板",
    )
    template_version = models.ForeignKey(
        "outline.BidWordTemplateVersion",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="bid_documents",
        verbose_name="使用的模板版本",
    )
    template_file_hash = models.CharField(
        verbose_name="模板文件 SHA256",
        max_length=64,
        blank=True,
        default="",
    )
    render_context_snapshot = models.JSONField(
        verbose_name="渲染上下文快照",
        default=dict,
        blank=True,
        help_text="渲染时的变量取值快照（仅文本变量，不含图片）",
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="创建人",
    )

    class Meta:
        db_table = "outline_bid_document"
        verbose_name = "标书 Word 文档"
        verbose_name_plural = "标书 Word 文档"
        ordering = ["-version"]
        indexes = [
            models.Index(fields=["outline", "-version"]),
            models.Index(fields=["file_key"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self):
        return f"{self.title} (v{self.version})"

    def generate_file_key(self):
        """生成新的 file_key。"""
        import time

        return f"outline-{self.outline_id}-v{self.version}-{int(time.time() * 1000)}"

    def get_file_url(self, absolute_url: bool = False) -> str:
        """获取文件访问 URL。

        Bucket 策略是最小权限（仅 editor/images/* 公开读），文档对象必须
        走 presigned URL 下载（ONLYOFFICE 与浏览器都需要），不能依赖匿名
        公开读——否则 ONLYOFFICE 下载文档时 403 导致编辑器白屏。
        """
        if self.object_key:
            return StorageService().presigned_get_object(
                self.object_key, absolute_url=absolute_url
            )
        elif self.docx_file:
            # 兼容旧数据
            return f"{settings.ONLYOFFICE_PUBLIC_BASE_URL}{self.docx_file.url}"
        return ""

    def save_file(self, content: bytes, filename: str, content_type: str = "application/vnd.openxmlformats-officedocument.wordprocessingml.document") -> str:
        """保存文件到 MinIO。

        Args:
            content: 文件内容（字节）
            filename: 文件名
            content_type: MIME 类型

        Returns:
            MinIO 对象键
        """
        from datetime import datetime
        today = datetime.now()
        object_key = f"bid_documents/{today.year}/{today.month:02d}/{today.day:02d}/{filename}"

        storage = StorageService()
        storage.put_object(object_key, content, content_type=content_type)

        self.object_key = object_key
        return object_key
