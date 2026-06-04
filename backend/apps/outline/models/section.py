# backend/apps/outline/models/section.py
"""章节模型。"""

from django.db import models

from apps.common.models import TimeStampedModel
from apps.outline.constants import (
    ContentGenerationStatus,
    ContentMatrixStatus,
    SectionGenerationStatus,
    SectionStatus,
)


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

    # ========== 内容责任矩阵相关字段 ==========

    content_matrix = models.JSONField(
        verbose_name="内容责任矩阵",
        default=dict,
        blank=True,
        help_text="定义章节的写作边界和生成策略",
    )

    content_matrix_status = models.CharField(
        verbose_name="矩阵状态",
        max_length=20,
        default=ContentMatrixStatus.PENDING,
        choices=ContentMatrixStatus.CHOICES,
        db_index=True,
    )

    content_matrix_version = models.PositiveIntegerField(
        verbose_name="矩阵版本号",
        default=1,
    )

    content_matrix_updated_at = models.DateTimeField(
        verbose_name="矩阵更新时间",
        null=True,
        blank=True,
        db_index=True,
    )

    content_matrix_error = models.TextField(
        verbose_name="矩阵生成失败原因",
        blank=True,
        default="",
    )

    # ========== 正文生成相关字段 ==========

    content_generation_status = models.CharField(
        verbose_name="正文生成状态",
        max_length=20,
        default=ContentGenerationStatus.PENDING,
        choices=ContentGenerationStatus.CHOICES,
        db_index=True,
    )

    content_generation_error = models.TextField(
        verbose_name="正文生成失败原因",
        blank=True,
        default="",
    )

    content_generated_at = models.DateTimeField(
        verbose_name="正文生成时间",
        null=True,
        blank=True,
        db_index=True,
    )

    content_word_count = models.PositiveIntegerField(
        verbose_name="正文字数",
        default=0,
    )

    content_summary = models.TextField(
        verbose_name="章节摘要",
        blank=True,
        default="",
    )

    class Meta:
        db_table = "outline_section"
        verbose_name = "大纲章节"
        verbose_name_plural = "大纲章节"
        ordering = ["sort_order", "id"]
        constraints = [
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
            models.Index(fields=["content_matrix_status"]),
            models.Index(fields=["content_generation_status"]),
        ]

    def __str__(self):
        return self.title

    def clean(self):
        """校验 parent 属于同一 outline。"""
        from django.core.exceptions import ValidationError

        if self.parent_id and self.parent.outline_id != self.outline_id:
            raise ValidationError({"parent": "parent 必须属于同一 outline"})

    @property
    def children_count(self) -> int:
        """返回子章节数量。"""
        return self.children.count()

    @property
    def section_number(self) -> str:
        """生成章节编号（如"一"、"（一）"、"1"等）。"""
        # 根据 level 和 sort_order 生成编号
        if self.level == 1:
            # 一级章节：一、二、三
            chinese_numerals = "一二三四五六七八九十"
            idx = self.sort_order
            if idx < 10:
                return chinese_numerals[idx]
            elif idx < 20:
                return f"十{chinese_numerals[idx - 10] if idx > 10 else ''}"
            else:
                return f"{idx + 1}"
        elif self.level == 2:
            # 二级章节：（一）（二）（三）
            chinese_numerals = "一二三四五六七八九十"
            idx = self.sort_order
            if idx < 10:
                return f"（{chinese_numerals[idx]}）"
            elif idx < 20:
                return f"（十{chinese_numerals[idx - 10] if idx > 10 else ''}）"
            else:
                return f"（{idx + 1}）"
        elif self.level == 3:
            # 三级章节：1、2、3
            return f"{self.sort_order + 1}"
        elif self.level == 4:
            # 四级章节：1.1、1.2
            if self.parent:
                return f"{self.parent.sort_order + 1}.{self.sort_order + 1}"
            return f"{self.sort_order + 1}"
        else:
            # 五级章节：（1）（2）
            return f"（{self.sort_order + 1}）"
