# backend/apps/knowledge/models/knowledge_base.py
"""知识库模型。"""

from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel
from apps.knowledge.constants import KnowledgeBaseType, KnowledgeBaseVisibility


class KnowledgeBase(TimeStampedModel):
    """知识库。"""

    name = models.CharField("名称", max_length=255)
    description = models.TextField("描述", blank=True)
    kb_type = models.CharField(
        "类型",
        max_length=32,
        choices=KnowledgeBaseType.CHOICES,
    )
    visibility = models.CharField(
        "可见范围",
        max_length=32,
        choices=KnowledgeBaseVisibility.CHOICES,
        default=KnowledgeBaseVisibility.PRIVATE,
    )
    is_active = models.BooleanField("是否启用", default=True)
    is_deleted = models.BooleanField("是否删除", default=False)
    deleted_at = models.DateTimeField("删除时间", null=True, blank=True)
    metadata = models.JSONField("元数据", default=dict, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="knowledge_bases",
        verbose_name="创建人",
    )

    # 统计字段（冗余，用于列表展示）
    document_count = models.PositiveIntegerField("文档数", default=0)
    chunk_count = models.PositiveIntegerField("分块数", default=0)

    class Meta:
        db_table = "knowledge_base"
        verbose_name = "知识库"
        verbose_name_plural = "知识库"
        indexes = [
            models.Index(fields=["kb_type"]),
            models.Index(fields=["visibility"]),
            models.Index(fields=["is_active"]),
            models.Index(fields=["is_deleted"]),
        ]

    def __str__(self):
        return self.name
