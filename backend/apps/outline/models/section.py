# backend/apps/outline/models/section.py
"""章节模型。"""

from django.db import models

from apps.common.models import TimeStampedModel
from apps.outline.constants import SectionStatus, SectionGenerationStatus


class Section(TimeStampedModel):
    """大纲章节（树形结构）。"""

    outline = models.ForeignKey(
        "outline.Outline",
        on_delete=models.CASCADE,
        related_name="sections",
        verbose_name="大纲",
    )
    parent = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="children",
        verbose_name="父章节",
    )

    title = models.CharField("章节标题", max_length=500)
    level = models.PositiveIntegerField(
        "层级",
        default=1,
        help_text="根据 parent 自动计算，顶级章节为 1",
    )
    sort_order = models.PositiveIntegerField(
        "排序",
        default=0,
        help_text="同一 parent 下的排序序号",
    )

    # 章节内容（富文本 HTML）
    content = models.TextField("章节内容", blank=True)
    word_count = models.PositiveIntegerField("字数", default=0)

    # 状态
    status = models.CharField(
        "编辑状态",
        max_length=20,
        choices=SectionStatus.CHOICES,
        default=SectionStatus.DRAFT,
    )
    generation_status = models.CharField(
        "生成状态",
        max_length=20,
        choices=SectionGenerationStatus.CHOICES,
        default=SectionGenerationStatus.NOT_STARTED,
    )

    # 用户自定义提示词（生成时可编辑）
    user_prompt = models.TextField(
        "用户补充提示词",
        blank=True,
        help_text="用户在生成章节时补充的自定义要求",
    )

    class Meta:
        db_table = "outline_section"
        verbose_name = "大纲章节"
        verbose_name_plural = "大纲章节"
        ordering = ["sort_order", "id"]
        constraints = [
            # 同一 parent 下 sort_order 唯一，避免排序冲突
            models.UniqueConstraint(
                fields=["outline", "parent", "sort_order"],
                name="uniq_section_order_under_parent",
            ),
        ]
        indexes = [
            models.Index(fields=["outline", "parent", "sort_order"]),
            models.Index(fields=["outline", "level"]),
            models.Index(fields=["generation_status"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self):
        return self.title

    def clean(self):
        """校验 parent 属于同一 outline。"""
        from django.core.exceptions import ValidationError

        if self.parent_id and self.parent.outline_id != self.outline_id:
            raise ValidationError({"parent": "parent 必须属于同一 outline"})