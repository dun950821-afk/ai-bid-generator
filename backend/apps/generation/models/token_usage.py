# backend/apps/generation/models/token_usage.py
"""Token 用量统计模型。"""

from django.db import models
from django.conf import settings

from apps.common.models import TimeStampedModel


class TokenUsageLog(TimeStampedModel):
    """Token 用量日志。

    记录每次 AI 调用的 Token 消耗，用于成本核算和配额管理。
    """

    # 关联维度
    prompt_run = models.OneToOneField(
        "generation.PromptRun",
        on_delete=models.CASCADE,
        related_name="token_usage",
        verbose_name="运行记录",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="token_usages",
        verbose_name="用户",
    )
    project = models.ForeignKey(
        "projects.Project",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="token_usages",
        verbose_name="项目",
    )
    prompt_template = models.ForeignKey(
        "generation.PromptTemplate",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="token_usages",
        verbose_name="模板",
    )
    model_config = models.ForeignKey(
        "generation.ModelConfig",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="token_usages",
        verbose_name="模型配置",
    )

    # 场景信息
    scenario = models.CharField(
        "场景",
        max_length=64,
        help_text="如 section_content_generation, outline_generation",
    )

    # Token 统计
    prompt_tokens = models.IntegerField("输入 Token", default=0)
    completion_tokens = models.IntegerField("输出 Token", default=0)
    total_tokens = models.IntegerField("总 Token", default=0)

    # 成本估算（可选）
    estimated_cost = models.DecimalField(
        "估算成本",
        max_digits=10,
        decimal_places=6,
        default=0,
        help_text="美元",
    )

    # 时间信息
    latency_ms = models.IntegerField("耗时毫秒", default=0)

    # 状态
    status = models.CharField(
        "状态",
        max_length=16,
        choices=[
            ("success", "成功"),
            ("failed", "失败"),
            ("partial", "部分成功"),
        ],
        default="success",
    )

    class Meta:
        db_table = "generation_token_usage_log"
        verbose_name = "Token 用量日志"
        verbose_name_plural = "Token 用量日志"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "created_at"]),
            models.Index(fields=["project", "created_at"]),
            models.Index(fields=["scenario"]),
            models.Index(fields=["created_at"]),
        ]

    def __str__(self):
        return f"TokenUsage #{self.id}: {self.total_tokens} tokens ({self.scenario})"


class TokenUsageSummary(TimeStampedModel):
    """Token 用量汇总（按日期聚合）。"""

    # 时间维度
    date = models.DateField("日期")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="token_summaries",
        verbose_name="用户",
        null=True,
        blank=True,
    )
    project = models.ForeignKey(
        "projects.Project",
        on_delete=models.CASCADE,
        related_name="token_summaries",
        verbose_name="项目",
        null=True,
        blank=True,
    )
    scenario = models.CharField(
        "场景",
        max_length=64,
        blank=True,
        default="",
        help_text="空表示所有场景汇总",
    )

    # 统计数据
    total_calls = models.IntegerField("总调用次数", default=0)
    success_calls = models.IntegerField("成功次数", default=0)
    failed_calls = models.IntegerField("失败次数", default=0)

    total_prompt_tokens = models.BigIntegerField("总输入 Token", default=0)
    total_completion_tokens = models.BigIntegerField("总输出 Token", default=0)
    total_tokens = models.BigIntegerField("总 Token", default=0)

    avg_latency_ms = models.IntegerField("平均延迟 ms", default=0)
    total_cost = models.DecimalField(
        "总成本",
        max_digits=12,
        decimal_places=6,
        default=0,
    )

    class Meta:
        db_table = "generation_token_usage_summary"
        verbose_name = "Token 用量汇总"
        verbose_name_plural = "Token 用量汇总"
        ordering = ["-date"]
        unique_together = [["date", "user", "project", "scenario"]]
        indexes = [
            models.Index(fields=["date"]),
            models.Index(fields=["user", "date"]),
            models.Index(fields=["project", "date"]),
        ]

    def __str__(self):
        return f"TokenSummary {self.date}: {self.total_tokens} tokens"
