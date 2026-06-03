# backend/apps/outline/models/preset_template.py
"""预设大纲模板模型。"""

from django.db import models

from apps.common.models import TimeStampedModel


class PresetOutlineTemplate(TimeStampedModel):
    """预设大纲模板。"""

    name = models.CharField("模板名称", max_length=255)
    description = models.TextField("模板描述", blank=True)
    category = models.CharField(
        "分类",
        max_length=50,
        blank=True,
        help_text="如：工程类、服务类、货物类（可选）",
    )
    is_active = models.BooleanField("是否启用", default=True)

    class Meta:
        db_table = "outline_preset_template"
        verbose_name = "预设大纲模板"
        verbose_name_plural = "预设大纲模板"

    def __str__(self):
        return self.name


class PresetSectionTemplate(TimeStampedModel):
    """预设章节模板。"""

    template = models.ForeignKey(
        "outline.PresetOutlineTemplate",
        on_delete=models.CASCADE,
        related_name="sections",
        verbose_name="大纲模板",
    )
    parent = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="children",
        verbose_name="父章节模板",
    )
    title = models.CharField("章节标题", max_length=500)
    level = models.PositiveIntegerField("层级", default=1)
    sort_order = models.PositiveIntegerField("排序", default=0)

    class Meta:
        db_table = "outline_preset_section_template"
        verbose_name = "预设章节模板"
        verbose_name_plural = "预设章节模板"
        ordering = ["sort_order", "id"]

    def __str__(self):
        return self.title