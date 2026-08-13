"""系统公告服务：自动下线（懒过期 + 定时任务兜底共用）。"""

from django.db.models import Q
from django.utils.timezone import now

from apps.notifications.models import Announcement


def expire_overdue_announcements() -> int:
    """把「发布中且 auto_offline_at 已到点」的公告自动下线。

    幂等：只处理 is_active=True 的记录，返回本次下线条数。
    同时用于：
    - 用户端 / 管理端查询时的懒过期（保证数据即时正确）
    - celery beat 定时任务兜底（保证无访问时也会下线）
    """
    overdue = Announcement.objects.filter(
        is_active=True,
        auto_offline_at__isnull=False,
        auto_offline_at__lte=now(),
    )
    count = overdue.count()
    if count:
        overdue.update(is_active=False, offline_at=now(), updated_at=now())
    return count
