# backend/apps/requirements/models/extraction_run.py
"""条款抽取运行记录模型。"""

from django.conf import settings
from django.db import models, transaction

from apps.common.models import TimeStampedModel
from apps.requirements.constants import ExtractionRunStatus


class RequirementExtractionRun(TimeStampedModel):
    """条款抽取运行记录。

    记录一次条款抽取任务的完整信息，包括抽取类型、使用的提示词版本、
    成功/失败数量等。每次抽取都会创建新的运行记录。
    """

    tender_file = models.ForeignKey(
        "tender.TenderFile",
        on_delete=models.CASCADE,
        related_name="extraction_runs",
        verbose_name="招标文件",
    )
    project = models.ForeignKey(
        "projects.Project",
        on_delete=models.CASCADE,
        related_name="extraction_runs",
        verbose_name="项目",
    )
    async_task = models.ForeignKey(
        "common.AsyncTask",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="extraction_runs",
        verbose_name="异步任务",
    )
    status = models.CharField(
        "状态",
        max_length=30,
        choices=ExtractionRunStatus.CHOICES,
        default=ExtractionRunStatus.PENDING,
    )
    extraction_types = models.JSONField(
        "抽取类型列表",
        default=list,
        help_text='["scoring", "mandatory", ...]',
    )
    prompt_versions = models.JSONField(
        "提示词版本映射",
        default=dict,
        help_text='{"scoring": {"template_id": 1, "version_id": 2, "version": "v1.0"}, ...}',
    )
    total_count = models.PositiveIntegerField(
        "总抽取数量",
        default=0,
    )
    success_count = models.PositiveIntegerField(
        "成功数量",
        default=0,
    )
    failed_types = models.JSONField(
        "失败的抽取类型",
        default=list,
        help_text='["scoring", ...]',
    )
    error_message = models.TextField(
        "错误信息",
        blank=True,
    )
    overwrite = models.BooleanField(
        "覆盖已有条款",
        default=False,
        help_text="是否覆盖已有条款（删除旧条款后重新抽取）",
    )
    is_active = models.BooleanField(
        "当前版本",
        default=False,
        help_text="每个招标文件最多一个当前版本，列表默认只展示当前版本的条款",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="extraction_runs",
        verbose_name="创建人",
    )
    started_at = models.DateTimeField(
        "开始时间",
        null=True,
        blank=True,
    )
    finished_at = models.DateTimeField(
        "结束时间",
        null=True,
        blank=True,
    )

    class Meta:
        db_table = "requirements_extraction_run"
        verbose_name = "条款抽取运行"
        verbose_name_plural = "条款抽取运行"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["tender_file"],
                condition=models.Q(is_active=True),
                name="uniq_active_extraction_run_per_file",
            ),
        ]
        indexes = [
            models.Index(fields=["tender_file"]),
            models.Index(fields=["project"]),
            models.Index(fields=["status"]),
            models.Index(fields=["created_at"]),
            models.Index(fields=["tender_file", "is_active"]),
        ]

    def __str__(self):
        return f"ExtractionRun#{self.id} ({self.status})"

    def activate(self) -> None:
        """置为当前版本（事务 + 并发保护）：同文件其他 run 置非当前，自身置当前。"""
        with transaction.atomic():
            # 锁住同一文件下的所有运行记录，防止并发切换冲突
            list(
                RequirementExtractionRun.objects.select_for_update().filter(
                    tender_file=self.tender_file,
                )
            )

            # 将其他当前版本改为非当前（排除自己）
            RequirementExtractionRun.objects.filter(
                tender_file=self.tender_file,
                is_active=True,
            ).exclude(pk=self.pk).update(is_active=False)

            # 置当前版本
            self.is_active = True
            self.save(update_fields=["is_active"])
