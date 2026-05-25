# backend/apps/generation/models/model_provider.py
"""模型供应商模型。"""

from django.db import models

from apps.common.models import TimeStampedModel


class ModelProvider(TimeStampedModel):
    """模型供应商。"""

    key = models.CharField(
        "供应商键",
        max_length=64,
        unique=True,
    )
    name = models.CharField(
        "供应商名称",
        max_length=100,
    )
    provider_type = models.CharField(
        "供应商类型",
        max_length=64,
        help_text="mock / dashscope / openai_compatible",
    )
    base_url = models.CharField(
        "Base URL",
        max_length=255,
        blank=True,
    )
    api_key_env = models.CharField(
        "API Key 环境变量名",
        max_length=64,
        blank=True,
        default="",
    )
    is_active = models.BooleanField(
        "是否启用",
        default=True,
    )
    config_defaults = models.JSONField(
        "默认配置",
        default=dict,
        blank=True,
    )

    class Meta:
        db_table = "generation_model_provider"
        verbose_name = "模型供应商"
        verbose_name_plural = "模型供应商"

    def __str__(self):
        return self.name
