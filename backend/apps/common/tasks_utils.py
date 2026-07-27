# backend/apps/common/tasks_utils.py
"""Celery 任务通用工具。"""

import logging

from django.db import transaction

logger = logging.getLogger(__name__)


def soft_get_async_task(async_task_id):
    """获取 AsyncTask，不存在时返回 None 并记日志。

    用法：
        async_task = soft_get_async_task(async_task_id)
        if async_task is None:
            return
    """
    from apps.common.models import AsyncTask

    try:
        return AsyncTask.objects.get(pk=async_task_id)
    except AsyncTask.DoesNotExist:
        logger.warning(
            "AsyncTask not found, ignoring stale task message: id=%s",
            async_task_id,
        )
        return None


def enqueue_after_commit(task_func, *args, **kwargs):
    """事务提交后投递 Celery 任务 (.delay); 不在事务中则同步执行。

    Args:
        task_func: Celery 任务对象 (必须有 .delay 方法)
        *args, **kwargs: 透传给 task_func.delay

    用法:
        enqueue_after_commit(
            generate_outline_task,
            tender_file_id=tender_file_id,
            async_task_id=async_task.id,
        )
    """
    def _enqueue():
        try:
            task_func.delay(*args, **kwargs)
        except Exception:
            logger.exception(
                "Failed to enqueue celery task after commit: task=%s",
                getattr(task_func, "name", task_func),
            )

    transaction.on_commit(_enqueue)

