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
    "apps.requirements.*": {"queue": "parse_queue"},
    "apps.knowledge.*": {"queue": "kb_queue"},
    "apps.outline.*": {"queue": "ai_queue"},
    "apps.generation.*": {"queue": "ai_queue"},
    "apps.bid_check.*": {"queue": "ai_queue"},
    "apps.exporting.*": {"queue": "export_queue"},
    "apps.notifications.*": {"queue": "notify_queue"},
    # 响应模板: 识别与填充均含 LLM 调用, 走 ai_queue
    "apps.response_template.*": {"queue": "ai_queue"},
    # 无路由会落入默认 celery 队列，而 worker -Q 不含默认队列 → 任务永不执行
    "apps.common.*": {"queue": "notify_queue"},
}

# Beat 调度；每日 03:30 清理过期 JWT 黑名单记录，Phase 3 在此追加 cleanup_stale_uploads
app.conf.beat_schedule = {
    "flush-expired-jwt-tokens": {
        "task": "apps.accounts.tasks.flush_expired_tokens",
        "schedule": crontab(hour=3, minute=30),
    },
}

app.conf.beat_schedule.update(
    {
        "cleanup-stale-uploads-hourly": {
            "task": "apps.tender.cleanup_stale_uploads",
            "schedule": 60 * 60,
        },
        # 回收 worker 中断后永远停在 running 的 AsyncTask。
        # beat 固定 60s tick，实际执行间隔由任务内部 Redis 门控
        # （reconcile_interval_seconds 参数，默认 600s），改参数无需重启。
        "reconcile-stale-async-tasks": {
            "task": "apps.common.reconcile_stale_async_tasks",
            "schedule": 60,
        },
    }
)

app.autodiscover_tasks()
