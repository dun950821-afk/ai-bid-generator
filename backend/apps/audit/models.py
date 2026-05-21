from django.conf import settings
from django.db import models


class OperationLog(models.Model):
    """操作 / 审计日志（spec §5.10）；append-only，仅有 created_at。

    actor 可为空：登录失败等无已认证用户的事件，actor 留 None，
    尝试的用户名与失败原因写入 extra，不得硬塞成某个 User。
    """

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="operation_logs",
        verbose_name="操作者",
    )
    action = models.CharField("动作类型", max_length=64)
    target_type = models.CharField("对象类型", max_length=64, blank=True)
    target_id = models.CharField("对象 ID", max_length=64, blank=True)
    summary = models.CharField("摘要", max_length=255, blank=True)
    extra = models.JSONField("附加上下文", default=dict, blank=True)
    ip = models.GenericIPAddressField("来源 IP", null=True, blank=True)
    user_agent = models.CharField("User-Agent", max_length=512, blank=True)
    created_at = models.DateTimeField("时间", auto_now_add=True)

    class Meta:
        db_table = "audit_operation_log"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["actor"]),
            models.Index(fields=["action"]),
            models.Index(fields=["created_at"]),
        ]

    def __str__(self):
        return f"{self.action} @ {self.created_at:%Y-%m-%d %H:%M}"
