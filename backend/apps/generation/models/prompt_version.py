# backend/apps/generation/models/prompt_version.py
"""提示词版本模型。"""

from django.conf import settings
from django.db import models, transaction

from apps.common.models import TimeStampedModel
from apps.generation.constants import PromptVersionStatus


class PromptVersion(TimeStampedModel):
    """提示词版本。

    存放模板的实际内容，支持版本化管理。
    """

    template = models.ForeignKey(
        "generation.PromptTemplate",
        on_delete=models.CASCADE,
        related_name="versions",
        verbose_name="模板",
    )
    version = models.CharField(
        "版本号",
        max_length=32,
    )
    system_prompt = models.TextField(
        "系统提示词",
        blank=True,
    )
    user_prompt = models.TextField(
        "用户提示词",
    )
    output_schema = models.JSONField(
        "输出 Schema",
        default=dict,
        blank=True,
        help_text="JSON Schema 定义期望输出结构",
    )
    variable_schema = models.JSONField(
        "变量 Schema",
        default=dict,
        blank=True,
        help_text="JSON Schema 定义输入变量结构",
    )
    status = models.CharField(
        "状态",
        max_length=16,
        choices=PromptVersionStatus.CHOICES,
        default=PromptVersionStatus.DRAFT,
    )
    changelog = models.TextField(
        "变更说明",
        blank=True,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="创建人",
    )

    class Meta:
        db_table = "generation_prompt_version"
        verbose_name = "提示词版本"
        verbose_name_plural = "提示词版本"
        constraints = [
            models.UniqueConstraint(
                fields=["template", "version"],
                name="uniq_prompt_version",
            ),
            models.UniqueConstraint(
                fields=["template"],
                condition=models.Q(status=PromptVersionStatus.PUBLISHED),
                name="uniq_published_prompt_version_per_template",
            ),
        ]
        indexes = [
            models.Index(fields=["template", "status"]),
        ]

    def __str__(self):
        return f"{self.template.key}@{self.version} ({self.status})"

    def publish(self) -> None:
        """发布版本（事务 + 并发保护）。"""
        with transaction.atomic():
            # 锁住同一模板下的所有版本，防止并发发布冲突
            list(
                PromptVersion.objects.select_for_update().filter(
                    template=self.template,
                )
            )

            # 将当前 published 版本改为 archived（排除自己）
            PromptVersion.objects.filter(
                template=self.template,
                status=PromptVersionStatus.PUBLISHED,
            ).exclude(pk=self.pk).update(status=PromptVersionStatus.ARCHIVED)

            # 发布当前版本
            self.status = PromptVersionStatus.PUBLISHED
            self.save(update_fields=["status"])
