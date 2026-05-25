# backend/apps/generation/models/prompt_template.py
"""提示词模板模型。"""

from django.db import models

from apps.common.models import TimeStampedModel
from apps.generation.constants import PromptScenario, PromptScope


class PromptTemplate(TimeStampedModel):
    """提示词模板。

    管理提示词模板的逻辑身份，一个模板可有多个版本。
    """

    key = models.CharField(
        "模板键",
        max_length=100,
    )
    name = models.CharField(
        "模板名称",
        max_length=100,
    )
    scenario = models.CharField(
        "场景",
        max_length=64,
        choices=PromptScenario.CHOICES,
    )
    description = models.TextField(
        "描述",
        blank=True,
    )
    scope = models.CharField(
        "作用域",
        max_length=32,
        choices=PromptScope.CHOICES,
        default=PromptScope.SYSTEM,
    )
    project = models.ForeignKey(
        "projects.Project",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        verbose_name="项目",
    )
    is_active = models.BooleanField(
        "是否启用",
        default=True,
    )

    class Meta:
        db_table = "generation_prompt_template"
        verbose_name = "提示词模板"
        verbose_name_plural = "提示词模板"
        constraints = [
            models.UniqueConstraint(
                fields=["key", "scope", "project"],
                name="uniq_prompt_template_scope_project_key",
                condition=models.Q(project__isnull=False),
            ),
            models.UniqueConstraint(
                fields=["key", "scope"],
                name="uniq_prompt_template_scope_key",
                condition=models.Q(project__isnull=True),
            ),
        ]
        indexes = [
            models.Index(fields=["scenario"]),
            models.Index(fields=["scope"]),
        ]

    def __str__(self):
        return f"{self.key} ({self.scenario})"
