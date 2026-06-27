# backend/apps/outline/models/section_manual_source.py
"""章节手动选源模型。"""

from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel


class SectionManualSource(TimeStampedModel):
    """用户手动检索并勾选的章节参考来源。

    不覆盖 SectionGenerationRecord.rag_sources，仅作为下一次重新生成的输入。
    """

    section = models.ForeignKey(
        "outline.Section",
        on_delete=models.CASCADE,
        related_name="manual_sources",
        verbose_name="所属章节",
    )
    chunk_id = models.IntegerField("chunk ID")
    document_id = models.IntegerField("文档 ID")
    document_title = models.CharField("文档标题", max_length=255)
    kb_id = models.IntegerField("知识库 ID")
    kb_name = models.CharField("知识库名称", max_length=255)
    channel = models.CharField("RAG通道", max_length=32)
    content_preview = models.TextField("内容预览", blank=True, default="")
    section_path = models.CharField("文档内路径", max_length=255, blank=True, default="")
    page_start = models.IntegerField("起始页", null=True, blank=True)
    page_end = models.IntegerField("结束页", null=True, blank=True)
    selected_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="selected_manual_sources",
        verbose_name="选择人",
    )

    class Meta:
        db_table = "section_manual_source"
        verbose_name = "章节手动选源"
        verbose_name_plural = "章节手动选源"
        constraints = [
            models.UniqueConstraint(
                fields=["section", "chunk_id"],
                name="uniq_section_chunk",
            ),
        ]
        indexes = [
            models.Index(fields=["section"]),
            models.Index(fields=["section", "channel"]),
        ]
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.section.title} - chunk#{self.chunk_id}"
