# backend/apps/generation/models/model_config.py
"""模型配置模型。"""

from django.db import models

from apps.common.models import TimeStampedModel
from apps.generation.constants import ModelType


class ModelConfig(TimeStampedModel):
    """模型配置。"""

    provider = models.ForeignKey(
        "generation.ModelProvider",
        on_delete=models.CASCADE,
        related_name="models",
        verbose_name="供应商",
    )
    model_name = models.CharField(
        "模型名称",
        max_length=100,
    )
    model_type = models.CharField(
        "模型类型",
        max_length=16,
        choices=ModelType.CHOICES,
        default=ModelType.CHAT,
    )
    display_name = models.CharField(
        "显示名称",
        max_length=100,
        blank=True,
    )
    temperature = models.FloatField(
        "Temperature",
        default=0.2,
    )
    max_tokens = models.IntegerField(
        "最大 Token",
        default=4096,
    )
    top_p = models.FloatField(
        "Top P",
        default=0.8,
    )
    timeout_seconds = models.IntegerField(
        "超时秒数",
        default=60,
    )
    retry_count = models.IntegerField(
        "重试次数",
        default=2,
    )
    is_default = models.BooleanField(
        "是否默认",
        default=False,
    )
    is_active = models.BooleanField(
        "是否启用",
        default=True,
    )
    # DeepSeek V4 思考模式配置
    enable_thinking = models.BooleanField(
        "启用思考模式",
        default=False,
        help_text="DeepSeek V4 专用：启用思考模式（reasoning）",
    )
    reasoning_effort = models.CharField(
        "推理强度",
        max_length=16,
        blank=True,
        default="",
        help_text="DeepSeek V4 专用：low/medium/high",
    )

    class Meta:
        db_table = "generation_model_config"
        verbose_name = "模型配置"
        verbose_name_plural = "模型配置"
        constraints = [
            models.UniqueConstraint(
                fields=["model_type"],
                condition=models.Q(is_default=True, is_active=True),
                name="uniq_default_model_per_type",
            ),
        ]
        indexes = [
            models.Index(fields=["model_type"]),
        ]

    def __str__(self):
        return f"{self.provider.name}/{self.model_name}"
