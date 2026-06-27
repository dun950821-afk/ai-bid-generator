# backend/apps/outline/models/outline_knowledge_base.py
"""大纲-知识库关联模型。"""

from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel


class OutlineKnowledgeBase(TimeStampedModel):
    """大纲与知识库的绑定关系。"""

    outline = models.ForeignKey(
        "outline.Outline",
        on_delete=models.CASCADE,
        related_name="kb_bindings",
        verbose_name="所属大纲",
    )
    knowledge_base = models.ForeignKey(
        "knowledge.KnowledgeBase",
        on_delete=models.CASCADE,
        related_name="outline_bindings",
        verbose_name="知识库",
    )
    sort_order = models.PositiveIntegerField("排序", default=0)
    is_active = models.BooleanField("是否启用", default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="outline_kb_bindings",
        verbose_name="创建人",
    )

    class Meta:
        db_table = "outline_knowledge_base"
        verbose_name = "大纲知识库关联"
        verbose_name_plural = "大纲知识库关联"
        constraints = [
            models.UniqueConstraint(
                fields=["outline", "knowledge_base"],
                name="uniq_outline_kb",
            ),
        ]
        indexes = [
            models.Index(fields=["outline", "is_active"]),
            models.Index(fields=["outline", "sort_order"]),
            models.Index(fields=["knowledge_base"]),
        ]
        ordering = ["sort_order", "id"]

    def __str__(self):
        return f"{self.outline.name} - {self.knowledge_base.name}"
