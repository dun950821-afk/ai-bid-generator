from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel


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


class Announcement(TimeStampedModel):
    """系统公告（全局广播，发布/下线维护）。

    is_active 表示发布状态：True=发布中（用户端可见），False=草稿/已下线。
    用户级「是否弹窗/是否不再提示」记录在 AnnouncementAck，公告本身不按用户区分。
    """

    title = models.CharField("标题", max_length=200)
    content = models.TextField("内容")
    is_active = models.BooleanField("是否发布", default=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="announcements_created",
        verbose_name="发布人",
    )
    published_at = models.DateTimeField("首次发布时间", null=True, blank=True)
    offline_at = models.DateTimeField("最近下线时间", null=True, blank=True)

    class Meta:
        db_table = "announcement"
        verbose_name = "系统公告"
        verbose_name_plural = "系统公告"
        ordering = ["-published_at", "-created_at", "-id"]

    def __str__(self):
        return f"公告 #{self.pk} ({self.title})"


class AnnouncementAck(models.Model):
    """用户对公告的确认状态。

    - dismissed=True：用户点了「不再提示」，该公告对该用户永久隐藏。
    - dismissed=False + seen_at 有值：用户点过「关闭」，下次登录若公告仍发布中会再次弹出。
    幂等保证：同一 (announcement, user) 唯一，重复 ack 只更新时间戳不重复创建。
    """

    announcement = models.ForeignKey(
        Announcement,
        on_delete=models.CASCADE,
        related_name="acks",
        verbose_name="公告",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="announcement_acks",
        verbose_name="用户",
    )
    dismissed = models.BooleanField("不再提示", default=False)
    seen_at = models.DateTimeField("最近查看时间", null=True, blank=True)
    dismissed_at = models.DateTimeField("不再提示时间", null=True, blank=True)
    created_at = models.DateTimeField("首次确认时间", auto_now_add=True)
    updated_at = models.DateTimeField("更新时间", auto_now=True)

    class Meta:
        db_table = "announcement_ack"
        verbose_name = "公告确认"
        verbose_name_plural = "公告确认"
        constraints = [
            models.UniqueConstraint(
                fields=["announcement", "user"],
                name="uniq_announcement_user",
            ),
        ]

    def __str__(self):
        return f"{self.user_id} × 公告#{self.announcement_id} (dismiss={self.dismissed})"
