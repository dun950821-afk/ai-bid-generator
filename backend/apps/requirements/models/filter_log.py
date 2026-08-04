"""条款抽取误分类过滤日志模型。"""

from django.db import models

from apps.common.models import TimeStampedModel


class RequirementFilterLog(TimeStampedModel):
    """条款抽取过滤日志。

    记录被丢弃（hard）与被软标记（suspected）的抽取项，
    便于误删后排查与统计模型识别率。
    """

    LEVEL_HARD = "hard"
    LEVEL_SUSPECTED = "suspected"

    LEVEL_CHOICES = [
        (LEVEL_HARD, "硬过滤"),
        (LEVEL_SUSPECTED, "疑似标记"),
    ]

    tender_file = models.ForeignKey(
        "tender.TenderFile",
        on_delete=models.CASCADE,
        related_name="requirement_filter_logs",
        verbose_name="招标文件",
    )
    extraction_type = models.CharField(
        "抽取类型",
        max_length=50,
        db_index=True,
    )
    title = models.CharField(
        "条款标题",
        max_length=255,
        blank=True,
    )
    matched_keyword = models.CharField(
        "命中关键词",
        max_length=100,
        blank=True,
    )
    filter_level = models.CharField(
        "过滤级别",
        max_length=16,
        choices=LEVEL_CHOICES,
    )
    filter_reason = models.CharField(
        "过滤原因",
        max_length=255,
        blank=True,
    )
    raw_llm_item = models.JSONField(
        "原始 LLM 输出项",
        null=True,
        blank=True,
    )

    class Meta:
        verbose_name = "条款过滤日志"
        verbose_name_plural = verbose_name
        ordering = ["-created_at"]
