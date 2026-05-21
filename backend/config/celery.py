"""Celery 应用：5 个命名队列 + task_routes（spec §3.6.2）。"""
import os

from celery import Celery
from celery.schedules import crontab

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")

app = Celery("bid")
app.config_from_object("django.conf:settings", namespace="CELERY")

# 任务到队列的映射；后续按 task 名前缀路由，拆 worker 时无需改业务代码
app.conf.task_routes = {
    "apps.tender.*": {"queue": "parse_queue"},
    "apps.knowledge.*": {"queue": "kb_queue"},
    "apps.generation.*": {"queue": "ai_queue"},
    "apps.exporting.*": {"queue": "export_queue"},
    "apps.notifications.*": {"queue": "notify_queue"},
}

# Beat 调度；每日 03:30 清理过期 JWT 黑名单记录，Phase 3 在此追加 cleanup_stale_uploads
app.conf.beat_schedule = {
    "flush-expired-jwt-tokens": {
        "task": "apps.accounts.tasks.flush_expired_tokens",
        "schedule": crontab(hour=3, minute=30),
    },
}

app.autodiscover_tasks()
