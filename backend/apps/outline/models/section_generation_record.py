# backend/apps/outline/models/section_generation_record.py
"""章节生成记录模型。"""

from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel
from apps.outline.constants import GenerationRecordStatus


class SectionGenerationRecord(TimeStampedModel):
    """章节生成记录。"""

    section = models.ForeignKey(
        "outline.Section",
        on_delete=models.CASCADE,
        related_name="generation_records",
        verbose_name="章节",
    )
    async_task = models.ForeignKey(
        "common.AsyncTask",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        verbose_name="异步任务",
        help_text="单章节生成关联 section_generate，批量生成关联 outline_generate_batch",
    )

    # 主要追溯来源
    prompt_run = models.ForeignKey(
        "generation.PromptRun",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        verbose_name="AI运行记录",
    )

    # 冗余快照（方便查询，不依赖外键）
    prompt_template_id = models.PositiveIntegerField(
        "提示词模板ID",
        null=True,
        blank=True,
    )
    prompt_version = models.CharField(
        "提示词版本号",
        max_length=50,
        blank=True,
    )
    llm_model = models.CharField(
        "LLM模型",
        max_length=100,
        blank=True,
    )

    # 输入输出摘要（不存完整正文）
    input_summary = models.JSONField(
        "输入摘要",
        default=dict,
        help_text="例：{'keywords': [...], 'kb_count': 5, 'requirement_count': 3}",
    )
    output_summary = models.JSONField(
        "输出摘要",
        default=dict,
        help_text="例：{'word_count': 1500, 'has_tables': true}",
    )

    error_message = models.TextField("错误信息", blank=True)

    # 工作流预留（第一版不使用）
    workflow_node = models.ForeignKey(
        "workflow.WorkflowNodeInstance",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        verbose_name="工作流节点",
    )

    status = models.CharField(
        "状态",
        max_length=20,
        choices=GenerationRecordStatus.CHOICES,
        default=GenerationRecordStatus.PENDING,
    )
    finished_at = models.DateTimeField("完成时间", null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        verbose_name="创建人",
    )

    class Meta:
        db_table = "outline_section_generation_record"
        verbose_name = "章节生成记录"
        verbose_name_plural = "章节生成记录"
        indexes = [
            models.Index(fields=["section", "status"]),
            models.Index(fields=["async_task"]),
            models.Index(fields=["prompt_run"]),
        ]

    def __str__(self):
        return f"GenerationRecord#{self.id} ({self.status})"