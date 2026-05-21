from django.conf import settings
from django.db import models


class TimeStampedModel(models.Model):
    """提供 created_at / updated_at 时间戳的抽象基类（spec §3.5）。"""

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class AsyncTask(TimeStampedModel):
    """统一异步任务模型（spec §3.6.1）。

    关键约束：result_payload 只放对象引用、ID、统计摘要等轻量数据，
    生成的章节正文、解析全文等大体量内容写入各自业务表，不塞进本表。
    """

    STATUS_PENDING = "pending"
    STATUS_RUNNING = "running"
    STATUS_SUCCESS = "success"
    STATUS_FAILED = "failed"
    STATUS_CANCELLED = "cancelled"
    STATUS_RETRYING = "retrying"
    STATUS_CHOICES = [
        (STATUS_PENDING, "等待中"),
        (STATUS_RUNNING, "运行中"),
        (STATUS_SUCCESS, "成功"),
        (STATUS_FAILED, "失败"),
        (STATUS_CANCELLED, "已取消"),
        (STATUS_RETRYING, "重试中"),
    ]

    task_type = models.CharField("任务类型", max_length=64)
    celery_task_id = models.CharField("Celery 任务 ID", max_length=255, blank=True)
    status = models.CharField(
        "状态", max_length=16, choices=STATUS_CHOICES, default=STATUS_PENDING
    )
    progress = models.PositiveSmallIntegerField("进度百分比", default=0)
    current_step = models.CharField("当前步骤", max_length=255, blank=True)
    total_steps = models.PositiveSmallIntegerField("总步骤数", default=1)
    related_object_type = models.CharField("关联对象类型", max_length=64, blank=True)
    related_object_id = models.CharField("关联对象 ID", max_length=64, blank=True)
    input_payload = models.JSONField("输入参数", default=dict, blank=True)
    result_payload = models.JSONField("结果（仅引用/摘要）", default=dict, blank=True)
    error_message = models.TextField("失败原因", blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="async_tasks",
        verbose_name="发起人",
    )
    started_at = models.DateTimeField("开始时间", null=True, blank=True)
    finished_at = models.DateTimeField("结束时间", null=True, blank=True)

    class Meta:
        db_table = "common_async_task"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["celery_task_id"]),
            models.Index(fields=["status"]),
            models.Index(fields=["task_type"]),
            models.Index(fields=["created_by"]),
            models.Index(fields=["related_object_type", "related_object_id"]),
        ]

    def __str__(self):
        return f"{self.task_type}#{self.pk} ({self.status})"
