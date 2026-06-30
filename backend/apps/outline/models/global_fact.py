# backend/apps/outline/models/global_fact.py
"""全局事实变量模型。

借鉴 OpenBidKit globalFactsTask.cjs：从招标文件/知识库/原方案提取
"会影响全文一致性"的事实变量（项目名、工期、人员、设备、质保等），
正文生成时强制引用，避免前后矛盾。
"""

from django.db import models

from apps.common.models import TimeStampedModel
from apps.outline.constants import GlobalFactSource


class GlobalFactGroup(TimeStampedModel):
    """全局事实变量组（一个大纲一套）。

    借鉴 OpenBidKit 的 GlobalFactGroupState：
    {id, title, content, updated_at}，本模型增加 key（用于跨轮去重合并）
    和 source（标识来源便于人工核查）。
    """

    outline = models.ForeignKey(
        "outline.Outline",
        on_delete=models.CASCADE,
        related_name="global_facts",
        verbose_name="所属大纲",
    )
    key = models.CharField(
        "事实键",
        max_length=100,
        help_text="用于跨轮去重合并，英文蛇形，如 project_name/delivery_period",
    )
    title = models.CharField(
        "标题",
        max_length=200,
        help_text="如'项目名称''交货期'，供章节编排决策引用",
    )
    content = models.TextField(
        "事实内容",
        help_text="完整事实正文，正文生成时强制引用此值",
    )
    source = models.CharField(
        "来源",
        max_length=20,
        choices=GlobalFactSource.CHOICES,
        default=GlobalFactSource.TENDER,
    )
    sort_order = models.PositiveIntegerField(
        "排序",
        default=0,
    )

    class Meta:
        db_table = "outline_global_fact"
        verbose_name = "全局事实变量"
        verbose_name_plural = "全局事实变量"
        constraints = [
            models.UniqueConstraint(
                fields=["outline", "key"],
                name="uniq_global_fact_key_per_outline",
            ),
        ]
        indexes = [
            models.Index(fields=["outline"]),
            models.Index(fields=["outline", "sort_order"]),
        ]
        ordering = ["sort_order", "id"]

    def __str__(self):
        return f"{self.outline_id}#{self.key}"
