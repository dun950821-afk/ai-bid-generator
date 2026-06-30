# backend/apps/bid_check/tasks.py
"""废标检查 Celery 任务。"""

from celery import shared_task


@shared_task(bind=True)
def bid_check_task(self, task_id: int, async_task_id: int, user_id: int):
    """废标检查任务（借鉴 OpenBidKit rejectionCheckTask）。

    三轮流程：提取清单 → 分析 → 检查 → 定稿。
    进度与状态写入 AsyncTask。
    """
    from apps.bid_check.services.bid_check_workflow import run_bid_check

    run_bid_check(
        task_id=task_id,
        async_task_id=async_task_id,
        user_id=user_id,
    )
