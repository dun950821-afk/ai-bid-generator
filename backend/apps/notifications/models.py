from django.conf import settings
from django.db import models


class Notification(models.Model):
    """站内通知（当前用于任务完成推送；append-only）。

    关联任务用冗余快照（related_object_*）而非外键：任务可能被清理，
    通知是用户侧记录不应随任务删除；同表同时挂 AsyncTask / GenerationTask
    两种任务，也用快照字段避免多态外键。
    """

    KIND_TASK = "task"
    KIND_SYSTEM = "system"
    KIND_CHOICES = [
        (KIND_TASK, "任务"),
        (KIND_SYSTEM, "系统"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
        verbose_name="接收人",
    )
    kind = models.CharField("类型", max_length=16, choices=KIND_CHOICES, default=KIND_TASK)
    title = models.CharField("标题", max_length=128)
    message = models.CharField("内容", max_length=512, blank=True)
    task_type = models.CharField("任务类型", max_length=64, blank=True)
    related_object_type = models.CharField("关联对象类型", max_length=64, blank=True)
    related_object_id = models.CharField("关联对象 ID", max_length=64, blank=True)
    is_read = models.BooleanField("已读", default=False)
    created_at = models.DateTimeField("时间", auto_now_add=True)

    class Meta:
        db_table = "notification"
        verbose_name = "站内通知"
        verbose_name_plural = "站内通知"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["user", "is_read"]),
            models.Index(fields=["user", "created_at"]),
        ]

    def __str__(self):
        return f"{self.user_id} 通知 #{self.pk} ({self.title})"
