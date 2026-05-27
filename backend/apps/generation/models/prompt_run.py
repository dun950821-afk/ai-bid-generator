# backend/apps/generation/models/prompt_run.py
"""提示词运行记录模型。"""

from django.db import models
from django.conf import settings

from apps.common.models import TimeStampedModel
from apps.generation.constants import PromptRunStatus


class PromptRun(TimeStampedModel):
    """提示词运行记录。

    记录每次 AI 调用的完整上下文，是核心审计资产。
    """

    prompt_template = models.ForeignKey(
        "generation.PromptTemplate",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="runs",
        verbose_name="模板",
    )
    prompt_version = models.ForeignKey(
        "generation.PromptVersion",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="版本",
    )
    model_config = models.ForeignKey(
        "generation.ModelConfig",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="模型配置",
    )
    scenario = models.CharField(
        "场景",
        max_length=64,
    )
    input_variables = models.JSONField(
        "输入变量",
        default=dict,
    )
    rendered_system_prompt = models.TextField(
        "渲染后系统提示词",
        blank=True,
    )
    rendered_user_prompt = models.TextField(
        "渲染后用户提示词",
    )
    output_text = models.TextField(
        "输出文本",
        blank=True,
    )
    output_json = models.JSONField(
        "输出 JSON",
        default=dict,
        blank=True,
    )
    status = models.CharField(
        "状态",
        max_length=16,
        choices=PromptRunStatus.CHOICES,
        default=PromptRunStatus.PENDING,
    )
    prompt_tokens = models.IntegerField(
        "提示词 Token",
        default=0,
    )
    completion_tokens = models.IntegerField(
        "输出 Token",
        default=0,
    )
    total_tokens = models.IntegerField(
        "总 Token",
        default=0,
    )
    latency_ms = models.IntegerField(
        "耗时毫秒",
        default=0,
    )
    error_message = models.TextField(
        "错误信息",
        blank=True,
    )
    is_sensitive = models.BooleanField(
        "是否包含敏感信息",
        default=False,
    )
    metadata = models.JSONField(
        "元数据",
        default=dict,
        blank=True,
        help_text="存储 schema_valid, schema_errors, rag_enabled, retrieval_log_id, retrieval_sources, rag_context_preview 等",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="创建人",
    )
    # 业务关联
    tender_file = models.ForeignKey(
        "tender.TenderFile",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="招标文件",
    )
    parsed_document = models.ForeignKey(
        "tender.ParsedDocument",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="解析文档",
    )
    # P1: 待 TenderRequirement 模型创建后启用
    # source_requirement = models.ForeignKey(
    #     "tender.TenderRequirement",
    #     on_delete=models.SET_NULL,
    #     null=True,
    #     blank=True,
    #     verbose_name="源条款",
    # )
    project = models.ForeignKey(
        "projects.Project",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="项目",
    )

    class Meta:
        db_table = "generation_prompt_run"
        verbose_name = "提示词运行"
        verbose_name_plural = "提示词运行"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["scenario"]),
            models.Index(fields=["status"]),
            models.Index(fields=["prompt_template"]),
            models.Index(fields=["model_config"]),
            models.Index(fields=["project"]),
            models.Index(fields=["created_at"]),
        ]

    def __str__(self):
        return f"PromptRun#{self.id} ({self.scenario})"
