"""accounts 应用的 Celery 任务（spec §4.5）。

被 config.celery 的 autodiscover_tasks() 自动发现；任务名前缀 apps.accounts.*
不在 config/celery.py 的 task_routes 中，落入默认队列即可（清理任务无需独立队列）。
"""
from celery import shared_task
from django.core.management import call_command


@shared_task
def flush_expired_tokens():
    """清理 simplejwt 已过期的 outstanding / blacklisted token 记录。

    复用 rest_framework_simplejwt.token_blacklist 自带的 flushexpiredtokens
    管理命令，避免重复实现过期判定逻辑。
    """
    call_command("flushexpiredtokens")
