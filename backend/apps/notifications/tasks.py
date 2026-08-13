"""notifications 应用的 Celery 任务（系统公告自动下线兜底）。

任务名前缀 apps.notifications.* 已由 config/celery.py 的 task_routes
路由到 notify_queue（worker 监听队列之一），无需额外配置。
"""
from celery import shared_task

from apps.notifications.services.announcement_service import expire_overdue_announcements


@shared_task(name="apps.notifications.expire_announcements")
def expire_announcements() -> int:
    """自动下线到期的系统公告（beat 每 60s 触发，幂等）。"""
    return expire_overdue_announcements()
