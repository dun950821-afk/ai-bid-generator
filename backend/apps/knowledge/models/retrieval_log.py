# backend/apps/knowledge/models/retrieval_log.py
"""检索日志模型。"""

from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel
from apps.knowledge.constants import RetrievalMode


class RetrievalLog(TimeStampedModel):
    """检索日志。"""

    query = models.TextField("查询文本")
    knowledge_bases = models.JSONField("知识库ID列表", default=list)
    filters = models.JSONField("过滤条件", default=dict, blank=True)
    top_k = models.PositiveIntegerField("Top K", default=10)
    retrieval_mode = models.CharField(
        "检索模式",
        max_length=32,
        choices=RetrievalMode.CHOICES,
        default=RetrievalMode.POSTGRES_FULLTEXT,
    )

    # 检索结果
    retrieved_chunks = models.JSONField("检索结果", default=list)
    selected_chunks = models.JSONField("最终选中结果", default=list, blank=True)

    # 关联
    prompt_run = models.ForeignKey(
        "generation.PromptRun",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="retrieval_logs",
        verbose_name="提示词运行",
    )
    workflow_node = models.ForeignKey(
        "workflows.WorkflowNodeInstance",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="retrieval_logs",
        verbose_name="工作流节点",
    )

    # 性能指标
    latency_ms = models.PositiveIntegerField("耗时毫秒")

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="retrieval_logs",
        verbose_name="创建人",
    )

    # Orchestrator trace 关联
    retrieval_run_id = models.CharField(
        "检索运行ID",
        max_length=64,
        blank=True,
        default="",
        db_index=True,
    )
    trace_meta = models.JSONField("trace元数据", default=dict, blank=True)
    fallback_reason = models.CharField(
        "降级原因",
        max_length=64,
        blank=True,
        default="",
    )

    class Meta:
        db_table = "knowledge_retrieval_log"
        verbose_name = "检索日志"
        verbose_name_plural = "检索日志"
        indexes = [
            models.Index(fields=["created_at"]),
            models.Index(fields=["prompt_run"]),
            models.Index(fields=["workflow_node"]),
        ]

    def __str__(self):
        return f"RetrievalLog#{self.id} ({self.query[:50]}...)"
