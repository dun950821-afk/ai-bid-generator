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

    content_generation_meta = models.JSONField(
        verbose_name="正文生成元数据",
        default=dict,
        blank=True,
        help_text="存储 used_analysis_point_ids, used_rag_material_ids, missing_info, risk_flags, quality_report",
    )

    # ========== 正文编排决策（借鉴 OpenBidKit buildChapterContentPlanMessages）==========
    content_plan = models.JSONField(
        verbose_name="正文编排决策",
        default=dict,
        blank=True,
        help_text="planning 阶段输出，含 writing_focus/knowledge/facts/table/mermaid/image",
    )
    content_plan_updated_at = models.DateTimeField(
        verbose_name="编排决策更新时间",
        null=True,
        blank=True,
        db_index=True,
    )

    # ========== P3 正文增强字段（Mermaid 配图 + AI 生图）==========
    mermaid_code = models.TextField(
        verbose_name="Mermaid 代码",
        blank=True,
        default="",
        help_text="Mermaid 配图代码，渲染成功后存入",
    )
    mermaid_object_key = models.CharField(
        verbose_name="Mermaid 图片对象键",
        max_length=500,
        blank=True,
        default="",
        help_text="MinIO 中渲染后的 PNG 对象键",
    )
    image_prompt = models.TextField(
        verbose_name="生图提示词",
        blank=True,
        default="",
        help_text="AI 生图 prompt，未配置生图模型时存此字段供手动生图",
    )
    image_object_key = models.CharField(
        verbose_name="生图对象键",
        max_length=500,
        blank=True,
        default="",
        help_text="MinIO 中生成的图片对象键",
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
        """生成章节编号（一、二、三 或 1.1, 1.2 等）。

        规则：
        - Level 1: 中文数字（一、二、三）
        - Level 2+: 小数层级编号（1.1, 1.2, 1.1.1 等）
        """
        if self.level == 1:
            # 一级章节：一、二、三
            return self._to_chinese_numeral(self.sort_order)
        else:
            # 二级及以上：递归拼接父章节编号
            if self.parent:
                parent_num = self.parent.section_number
                return f"{parent_num}.{self.sort_order + 1}"
            return f"{self.sort_order + 1}"

    @property
    def section_number_display(self) -> str:
        """生成章节编号用于前端显示。

        格式：编号 + 标题，如 "一、项目概述" 或 "1.1 项目背景"
        """
        number = self.section_number
        if self.level == 1:
            return f"{number}、{self.title}"
        else:
            return f"{number} {self.title}"

    @staticmethod
    def _to_chinese_numeral(idx: int) -> str:
        """将索引转换为中文数字。

        Args:
            idx: 索引值（从0开始）

        Returns:
            中文数字（一、二、三...十、十一...二十...）
        """
        chinese_numerals = "一二三四五六七八九十"
        num = idx + 1  # 转为从1开始
        if num <= 10:
            return chinese_numerals[num - 1]
        elif num <= 19:
            return f"十{chinese_numerals[num - 11]}"
        elif num == 20:
            return "二十"
        elif num <= 29:
            return f"二十{chinese_numerals[num - 21]}"
        else:
            # 超出常用范围，用阿拉伯数字
            return str(num)
