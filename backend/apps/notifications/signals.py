"""任务终态 → 站内通知。

两个任务模型（AsyncTask / GenerationTask）的写入口分散在多个 celery 任务与
服务里，统一挂在 post_save 上，避免逐个调用点埋通知代码。
终态状态不会再变化，故每个任务最多触发一次；去重兜底（幂等）见各 notify_*。
"""

from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.common.models import AsyncTask
from apps.notifications.models import Notification
from apps.notifications.services.notification_service import (
    notify_async_task_finished,
    notify_generation_task_finished,
)


@receiver(post_save, sender=AsyncTask)
def _async_task_finished(sender, instance, **kwargs):
    if not instance.created_by_id:
        return
    if instance.status not in (AsyncTask.STATUS_SUCCESS, AsyncTask.STATUS_FAILED, AsyncTask.STATUS_CANCELLED):
        return
    if Notification.objects.filter(
        user_id=instance.created_by_id,
        related_object_type="async_task",
        related_object_id=str(instance.pk),
    ).exists():
        return
    notify_async_task_finished(instance)


@receiver(post_save, sender="outline.GenerationTask")
def _generation_task_finished(sender, instance, **kwargs):
    if not instance.created_by_id:
        return
    if Notification.objects.filter(
        user_id=instance.created_by_id,
        related_object_type="generation_task",
        related_object_id=str(instance.pk),
    ).exists():
        return
    notify_generation_task_finished(instance)
