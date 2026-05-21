"""Celery 应用：5 个命名队列 + task_routes（spec §3.6.2）。"""
import os

from celery import Celery

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

# Beat 调度骨架；具体条目由 Phase 2（flushexpiredtokens）/ Phase 3（cleanup_stale_uploads）追加
app.conf.beat_schedule = {}

app.autodiscover_tasks()
