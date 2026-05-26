# backend/apps/knowledge/models/knowledge_document.py
"""知识文档模型。"""

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.common.models import TimeStampedModel
from apps.knowledge.constants import DocumentStatus, ParseStatus, ChunkStatus, EmbeddingStatus, IndexStatus


class KnowledgeDocument(TimeStampedModel):
    """知识文档。"""

    knowledge_base = models.ForeignKey(
        "knowledge.KnowledgeBase",
        on_delete=models.CASCADE,
        related_name="documents",
        verbose_name="知识库",
    )

    # 文件信息
    file_name = models.CharField("文件名", max_length=255)
    file_uri = models.CharField("文件URI", max_length=512, blank=True)
    file_hash = models.CharField("文件哈希", max_length=64, blank=True)
    file_size = models.BigIntegerField("文件大小", default=0)
    mime_type = models.CharField("MIME类型", max_length=128, blank=True)

    # 解析相关
    parsed_uri = models.CharField("解析结果URI", max_length=512, blank=True)
    raw_result_uri = models.CharField("原始解析结果URI", max_length=512, blank=True)
    parser_version = models.CharField("解析器版本", max_length=32, blank=True)
    chunker_version = models.CharField("分块器版本", max_length=32, blank=True)

    # 状态
    status = models.CharField(
        "总状态",
        max_length=16,
        choices=DocumentStatus.CHOICES,
        default=DocumentStatus.UPLOADING,
    )
    parse_status = models.CharField(
        "解析状态",
        max_length=16,
        choices=ParseStatus.CHOICES,
        default=ParseStatus.PENDING,
    )
    chunk_status = models.CharField(
        "分块状态",
        max_length=16,
        choices=ChunkStatus.CHOICES,
        default=ChunkStatus.PENDING,
    )
    embedding_status = models.CharField(
        "嵌入状态",
        max_length=16,
        choices=EmbeddingStatus.CHOICES,
        default=EmbeddingStatus.SKIPPED,
    )
    index_status = models.CharField(
        "索引状态",
        max_length=16,
        choices=IndexStatus.CHOICES,
        default=IndexStatus.PENDING,
    )

    # 软删除
    is_deleted = models.BooleanField("是否删除", default=False)
    deleted_at = models.DateTimeField("删除时间", null=True, blank=True)

    # 异步任务
    parse_task = models.ForeignKey(
        "common.AsyncTask",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="knowledge_documents",
        verbose_name="解析任务",
    )

    # 元数据
    metadata = models.JSONField("元数据", default=dict, blank=True)
    error_message = models.TextField("错误信息", blank=True)

    # 统计
    chunk_count = models.PositiveIntegerField("分块数", default=0)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="knowledge_documents",
        verbose_name="创建人",
    )

    class Meta:
        db_table = "knowledge_document"
        verbose_name = "知识文档"
        verbose_name_plural = "知识文档"
        constraints = [
            models.UniqueConstraint(
                fields=["knowledge_base", "file_hash"],
                condition=models.Q(file_hash__gt=""),
                name="uniq_knowledge_document_file_hash",
            ),
        ]
        indexes = [
            models.Index(fields=["knowledge_base"]),
            models.Index(fields=["status"]),
            models.Index(fields=["parse_status"]),
            models.Index(fields=["chunk_status"]),
            models.Index(fields=["is_deleted"]),
        ]

    def __str__(self):
        return self.file_name

    def soft_delete(self):
        """软删除文档。"""
        self.is_deleted = True
        self.deleted_at = timezone.now()
        self.save(update_fields=["is_deleted", "deleted_at"])
