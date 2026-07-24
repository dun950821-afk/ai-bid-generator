"""招标文件模型。"""

from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel


class TenderFile(TimeStampedModel):
    """招标/附件文件元数据。文件内容存 MinIO，不入数据库。"""

    CATEGORY_TENDER = "tender_file"
    CATEGORY_ATTACHMENT = "attachment"
    CATEGORY_CLARIFICATION = "clarification"

    CATEGORY_CHOICES = [
        (CATEGORY_TENDER, "招标文件"),
        (CATEGORY_ATTACHMENT, "附件"),
        (CATEGORY_CLARIFICATION, "澄清/补遗"),
    ]

    STATUS_UPLOADING = "uploading"
    STATUS_PARSE_PENDING = "parse_pending"
    STATUS_PARSING = "parsing"
    STATUS_PARSED = "parsed"
    STATUS_PARSE_FAILED = "parse_failed"
    STATUS_READY = "ready"
    STATUS_REJECTED = "rejected"
    STATUS_ARCHIVED = "archived"
    STATUS_UPLOAD_EXPIRED = "upload_expired"
    # 新增状态
    STATUS_CHUNKED = "chunked"
    STATUS_REQUIREMENT_EXTRACTED = "requirement_extracted"
    STATUS_REQUIREMENT_EXTRACTED_EMPTY = "requirement_extracted_empty"
    STATUS_INDEXED = "indexed"

    STATUS_CHOICES = [
        (STATUS_UPLOADING, "上传中"),
        (STATUS_PARSE_PENDING, "待解析"),
        (STATUS_PARSING, "解析中"),
        (STATUS_PARSED, "已解析"),
        (STATUS_PARSE_FAILED, "解析失败"),
        (STATUS_READY, "可用"),
        (STATUS_REJECTED, "已拒绝"),
        (STATUS_ARCHIVED, "已归档"),
        (STATUS_UPLOAD_EXPIRED, "上传过期"),
        (STATUS_CHUNKED, "已分块"),
        (STATUS_REQUIREMENT_EXTRACTED, "已抽取条款"),
        (STATUS_REQUIREMENT_EXTRACTED_EMPTY, "未抽到条款"),
        (STATUS_INDEXED, "已索引"),
    ]

    project = models.ForeignKey(
        "projects.Project",
        on_delete=models.CASCADE,
        related_name="tender_files",
    )
    lot = models.ForeignKey(
        "projects.Lot",
        on_delete=models.CASCADE,
        related_name="tender_files",
        null=True,
        blank=True,
    )
    original_name = models.CharField("原始文件名", max_length=255)
    file_size = models.BigIntegerField("文件大小")
    content_type = models.CharField("内容类型", max_length=128, blank=True)
    file_category = models.CharField(
        "文件类别",
        max_length=32,
        choices=CATEGORY_CHOICES,
        default=CATEGORY_TENDER,
    )
    object_key = models.CharField("MinIO 对象键", max_length=512, unique=True)
    # 文档全文存储（用于条款抽取，不入数据库）
    document_text_object_key = models.CharField(
        "文档全文 MinIO 键",
        max_length=512,
        blank=True,
        help_text="存储 DOCX 解析后的纯文本全文，用于条款抽取",
    )
    document_text_hash = models.CharField(
        "文档全文哈希",
        max_length=64,
        blank=True,
        help_text="SHA256 哈希，用于判断是否需要重新提取",
    )
    status = models.CharField(
        "状态",
        max_length=32,
        choices=STATUS_CHOICES,
        default=STATUS_UPLOADING,
    )
    parse_task = models.ForeignKey(
        "common.AsyncTask",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="tender_files",
    )
    error_message = models.TextField("错误信息", blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_tender_files",
    )

    class Meta:
        db_table = "tender_file"
        verbose_name = "招标文件"
        verbose_name_plural = "招标文件"
        indexes = [
            models.Index(fields=["project"]),
            models.Index(fields=["lot"]),
            models.Index(fields=["status"]),
            models.Index(fields=["file_category"]),
        ]

    def __str__(self):
        return self.original_name