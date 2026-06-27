# backend/apps/knowledge/models/knowledge_chunk.py
"""知识分块模型。"""

from django.contrib.postgres.indexes import GinIndex
from django.contrib.postgres.search import SearchVectorField
from django.db import models
from pgvector.django import VectorField

from apps.common.models import TimeStampedModel
from apps.knowledge.constants import ChunkType, EmbeddingStatus


class KnowledgeChunk(TimeStampedModel):
    """知识分块。"""

    document = models.ForeignKey(
        "knowledge.KnowledgeDocument",
        on_delete=models.CASCADE,
        related_name="chunks",
        verbose_name="文档",
    )

    # 分块基本信息
    chunk_index = models.PositiveIntegerField("分块序号")
    title = models.CharField("标题", max_length=255, blank=True)
    section_path = models.CharField("章节路径", max_length=512, blank=True)
    content = models.TextField("内容")
    content_hash = models.CharField("内容哈希", max_length=64)
    chunk_type = models.CharField(
        "分块类型",
        max_length=32,
        choices=ChunkType.CHOICES,
        default=ChunkType.GENERAL,
    )

    # 位置信息
    page_start = models.PositiveIntegerField("起始页", null=True, blank=True)
    page_end = models.PositiveIntegerField("结束页", null=True, blank=True)
    token_count = models.PositiveIntegerField("Token数", default=0)

    # 元数据
    metadata = models.JSONField("元数据", default=dict, blank=True)

    # 全文检索
    bm25_text = models.TextField("全文检索文本", blank=True)
    search_vector = SearchVectorField(null=True, blank=True)

    # 向量嵌入（用于语义检索）
    embedding = VectorField(
        dimensions=1024,
        null=True,
        blank=True,
        verbose_name="嵌入向量",
    )

    # 嵌入状态
    embedding_status = models.CharField(
        "嵌入状态",
        max_length=16,
        choices=EmbeddingStatus.CHOICES,
        default=EmbeddingStatus.SKIPPED,
    )

    class Meta:
        db_table = "knowledge_chunk"
        verbose_name = "知识分块"
        verbose_name_plural = "知识分块"
        constraints = [
            models.UniqueConstraint(
                fields=["document", "content_hash"],
                name="uniq_knowledge_chunk_hash",
            ),
        ]
        indexes = [
            models.Index(fields=["document", "chunk_index"]),
            models.Index(fields=["chunk_type"]),
            GinIndex(fields=["search_vector"], name="knowledge_chunk_search_gin"),
        ]

    def __str__(self):
        return f"Chunk#{self.id} ({self.chunk_type})"
