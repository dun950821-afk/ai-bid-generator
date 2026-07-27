# backend/apps/common/tasks_utils.py
"""Celery 任务通用工具。"""

import logging

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
