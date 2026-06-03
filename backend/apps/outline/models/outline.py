# backend/apps/outline/models/outline.py
"""大纲模型。"""

from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel
from apps.outline.constants import OutlineSource, OutlineStatus


class Outline(TimeStampedModel):
    """投标大纲。"""

    project = models.ForeignKey(
        "projects.Project",
        on_delete=models.CASCADE,
        related_name="outlines",
        verbose_name="项目",
    )
    lot = models.ForeignKey(
        "projects.Lot",
        on_delete=models.CASCADE,
        related_name="outlines",
        verbose_name="标段",
    )
    name = models.CharField("大纲名称", max_length=255)
    source = models.CharField(
        "来源",
        max_length=20,
        choices=OutlineSource.CHOICES,
    )
    status = models.CharField(
        "状态",
        max_length=20,
        choices=OutlineStatus.CHOICES,
        default=OutlineStatus.DRAFT,
    )
    is_current = models.BooleanField(
        "是否当前大纲",
        default=True,
        help_text="每个标段只能有一个当前大纲",
    )

    # AI生成来源（当 source=ai 时）
    source_tender_file = models.ForeignKey(
        "tender.TenderFile",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        verbose_name="源招标文件",
    )

    # 工作流预留（第一版不使用）
    workflow_instance = models.ForeignKey(
        "workflow.WorkflowInstance",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        verbose_name="工作流实例",
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        verbose_name="创建人",
    )

    class Meta:
        db_table = "outline"
        verbose_name = "投标大纲"
        verbose_name_plural = "投标大纲"
        constraints = [
            # 每个标段只能有一个 is_current=True 的大纲
            models.UniqueConstraint(
                fields=["lot"],
                condition=models.Q(is_current=True),
                name="uniq_current_outline_per_lot",
            ),
        ]
        indexes = [
            models.Index(fields=["project"]),
            models.Index(fields=["lot"]),
            models.Index(fields=["status"]),
            models.Index(fields=["is_current"]),
        ]

    def __str__(self):
        return self.name

    def clean(self):
        """校验 lot.project 与 project 一致性。"""
        from django.core.exceptions import ValidationError

        if self.lot_id and self.project_id:
            if self.lot.project_id != self.project_id:
                raise ValidationError({"lot": "lot 必须属于 project"})