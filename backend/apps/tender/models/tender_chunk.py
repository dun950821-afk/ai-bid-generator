"""语义分块模型。"""

from django.db import models

from apps.common.models import TimeStampedModel
from apps.tender.constants import ChunkType, ChunkLevel, EmbeddingStatus


class TenderChunk(TimeStampedModel):
    """语义分块层。

    三层结构：section → clause → window
    支持父子关系、类型分类、特征标记、向量嵌入。
    """

    parsed_document = models.ForeignKey(
        "tender.ParsedDocument",
        on_delete=models.CASCADE,
        related_name="chunks",
        verbose_name="解析文档",
    )
    parent_chunk = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="child_chunks",
        verbose_name="父分块",
    )
    source_file = models.ForeignKey(
        "tender.TenderFile",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="source_chunks",
        verbose_name="来源文件",
        help_text="合并解析时标注 chunk 来源文件；None 表示主文件",
    )
    chunk_level = models.CharField(
        "分块层级",
        max_length=16,
        choices=ChunkLevel.CHOICES,
    )
    chunk_index = models.PositiveIntegerField(
        "分块序号",
    )
    content_hash = models.CharField(
        "内容哈希",
        max_length=64,
    )
    chunk_type = models.CharField(
        "主类型",
        max_length=32,
        choices=ChunkType.CHOICES,
        default=ChunkType.GENERAL,
    )
    secondary_types = models.JSONField(
        "次类型数组",
        default=list,
        blank=True,
    )
    classification_confidence = models.FloatField(
        "分类置信度",
        null=True,
        blank=True,
    )
    matched_keywords = models.JSONField(
        "匹配的关键词",
        default=list,
        blank=True,
    )
    matched_section = models.CharField(
        "匹配的章节标题",
        max_length=255,
        blank=True,
    )
    section_title = models.CharField(
        "所属章节标题",
        max_length=255,
        blank=True,
    )
    section_path = models.CharField(
        "层级路径",
        max_length=512,
        blank=True,
    )
    clause_no = models.CharField(
        "条款编号",
        max_length=64,
        blank=True,
    )
    content = models.TextField(
        "文本内容",
    )
    token_count = models.PositiveIntegerField(
        "Token 数量",
        default=0,
    )
    page_start = models.PositiveIntegerField(
        "起始页码",
        null=True,
        blank=True,
    )
    page_end = models.PositiveIntegerField(
        "结束页码",
        null=True,
        blank=True,
    )
    source_offsets = models.JSONField(
        "原文偏移量",
        default=dict,
        blank=True,
    )
    is_table = models.BooleanField(
        "是否表格内容",
        default=False,
    )
    is_mandatory = models.BooleanField(
        "是否强制条款",
        default=False,
    )
    has_deadline = models.BooleanField(
        "是否含截止时间",
        default=False,
    )
    has_amount = models.BooleanField(
        "是否含金额",
        default=False,
    )
    has_score = models.BooleanField(
        "是否含评分",
        default=False,
    )
    has_penalty = models.BooleanField(
        "是否含惩罚条款",
        default=False,
    )
    has_timeline = models.BooleanField(
        "是否含时间节点",
        default=False,
    )
    embedding_status = models.CharField(
        "嵌入状态",
        max_length=16,
        choices=EmbeddingStatus.CHOICES,
        default=EmbeddingStatus.PENDING,
    )
    embedding_model = models.CharField(
        "嵌入模型",
        max_length=64,
        blank=True,
    )
    # 向量字段将在 P2 阶段添加
    # embedding = VectorField(1536)
    bm25_text = models.TextField(
        "BM25 检索文本",
        blank=True,
    )

    class Meta:
        db_table = "tender_chunk"
        verbose_name = "语义分块"
        verbose_name_plural = "语义分块"
        constraints = [
            models.UniqueConstraint(
                fields=["parsed_document", "content_hash"],
                name="uniq_chunk_content_hash",
            ),
        ]
        indexes = [
            models.Index(fields=["parsed_document", "chunk_index"]),
            models.Index(fields=["parsed_document", "chunk_type"]),
            models.Index(fields=["parsed_document", "section_path"]),
            models.Index(fields=["page_start", "page_end"]),
            models.Index(fields=["chunk_type"]),
            models.Index(fields=["is_mandatory"]),
        ]

    def __str__(self):
        return f"Chunk#{self.id} ({self.chunk_type})"