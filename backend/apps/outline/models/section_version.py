# backend/apps/outline/models/section_version.py
"""章节版本模型。"""

from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel
from apps.outline.constants import SectionVersionSource


class SectionVersion(TimeStampedModel):
    """章节版本历史。"""

    section = models.ForeignKey(
        "outline.Section",
        on_delete=models.CASCADE,
        related_name="versions",
        verbose_name="章节",
    )
    content = models.TextField("章节内容")
    version_no = models.PositiveIntegerField(
        "版本号",
        help_text="自增，每次生成或编辑递增",
    )
    source = models.CharField(
        "来源",
        max_length=20,
        choices=SectionVersionSource.CHOICES,
    )
    word_count = models.PositiveIntegerField("字数", default=0)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        verbose_name="创建人",
    )

    class Meta:
        db_table = "outline_section_version"
        verbose_name = "章节版本"
        verbose_name_plural = "章节版本"
        constraints = [
            models.UniqueConstraint(
                fields=["section", "version_no"],
                name="uniq_section_version",
            ),
        ]
        indexes = [
            models.Index(fields=["section", "version_no"]),
        ]

    def __str__(self):
        return f"{self.section.title} v{self.version_no} ({self.source})"