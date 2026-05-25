"""解析文档模型。"""

from django.db import models

from apps.common.models import TimeStampedModel
from apps.tender.constants import ParseQuality


class ParsedDocument(TimeStampedModel):
    """解析文档层。

    存储 Markdown 解析结果、质量指标、证据链。
    支持多版本，同一 TenderFile 只能有一个 active 版本。
    """

    tender_file = models.ForeignKey(
        "tender.TenderFile",
        on_delete=models.CASCADE,
        related_name="parsed_documents",
        verbose_name="招标文件",
    )
    is_active = models.BooleanField(
        "是否活跃版本",
        default=True,
    )
    markdown_uri = models.CharField(
        "Markdown URI",
        max_length=512,
        blank=True,
    )
    raw_result_uri = models.CharField(
        "原始解析结果 URI",
        max_length=512,
        blank=True,
    )
    assets_uri = models.CharField(
        "资源目录 URI",
        max_length=512,
        blank=True,
    )
    page_count = models.PositiveIntegerField(
        "页数",
        default=0,
    )
    parse_engine = models.CharField(
        "解析引擎",
        max_length=50,
        blank=True,
    )
    parser_version = models.CharField(
        "解析引擎版本",
        max_length=32,
        blank=True,
    )
    parse_quality = models.CharField(
        "解析质量",
        max_length=16,
        choices=ParseQuality.CHOICES,
        blank=True,
    )
    parse_profile = models.JSONField(
        "解析配置快照",
        default=dict,
        blank=True,
    )
    page_map_uri = models.CharField(
        "页码映射 URI",
        max_length=512,
        blank=True,
    )
    page_map_summary = models.JSONField(
        "页码映射摘要",
        default=dict,
        blank=True,
    )
    section_tree = models.JSONField(
        "目录树",
        default=dict,
        blank=True,
    )
    quality_metrics = models.JSONField(
        "解析质量指标",
        default=dict,
        blank=True,
    )
    parse_duration = models.FloatField(
        "解析耗时（秒）",
        null=True,
        blank=True,
    )
    input_hash = models.CharField(
        "输入文件哈希",
        max_length=64,
        blank=True,
    )
    output_hash = models.CharField(
        "输出结果哈希",
        max_length=64,
        blank=True,
    )

    class Meta:
        db_table = "tender_parsed_document"
        verbose_name = "解析文档"
        verbose_name_plural = "解析文档"
        constraints = [
            models.UniqueConstraint(
                fields=["tender_file", "parser_version", "input_hash"],
                name="uniq_parsed_document_version",
            ),
            models.UniqueConstraint(
                fields=["tender_file"],
                condition=models.Q(is_active=True),
                name="uniq_active_parsed_document_per_tender_file",
            ),
        ]
        indexes = [
            models.Index(fields=["tender_file", "is_active"]),
            models.Index(fields=["parser_version"]),
        ]

    def __str__(self):
        return f"ParsedDocument#{self.id} ({self.tender_file.original_name})"