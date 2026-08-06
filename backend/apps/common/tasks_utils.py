# backend/apps/common/tasks_utils.py
"""Celery 任务通用工具。"""

import logging

from django.db import transaction
from django.utils import timezone

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


def enqueue_after_commit(task_func, *args, async_task=None, **kwargs):
    """事务提交后投递 Celery 任务 (.delay); 不在事务中则同步执行。

    Args:
        task_func: Celery 任务对象 (必须有 .delay 方法)
        *args, **kwargs: 透传给 task_func.delay
        async_task: 可选 AsyncTask 实例，投递成功后回写 celery_task_id
            （强制结束 revoke 前置）

    用法:
        enqueue_after_commit(
            generate_outline_task,
            tender_file_id=tender_file_id,
            async_task_id=async_task.id,
            async_task=async_task,
        )
    """
    def _enqueue():
        try:
            result = task_func.delay(*args, **kwargs)
            if async_task is not None:
                _persist_celery_task_id(async_task.pk, result)
        except Exception as exc:
            logger.exception(
                "Failed to enqueue celery task after commit: task=%s",
                getattr(task_func, "name", task_func),
            )
            # 投递失败必须回写终态，否则 AsyncTask 永远停在 PENDING：
            # 前端轮询一直显示"进行中"，且幂等逻辑使重新点击返回同一个死任务
            if async_task is not None:
                from apps.common.models import AsyncTask

                try:
                    async_task.status = AsyncTask.STATUS_FAILED
                    async_task.error_message = f"任务投递失败: {str(exc)[:500]}"
                    async_task.finished_at = timezone.now()
                    async_task.save(update_fields=["status", "error_message", "finished_at", "updated_at"])
                except Exception:
                    logger.exception("Failed to mark async task %s failed on enqueue error", async_task.pk)

    transaction.on_commit(_enqueue)


def dispatch_async_task(async_task, task_func, *args, **kwargs):
    """投递 Celery 任务并回写 celery_task_id（强制结束 revoke 前置）。

    Args:
        async_task: AsyncTask 实例（必须已持久化）
        task_func: Celery 任务对象 (必须有 .delay 方法)
        *args, **kwargs: 透传给 task_func.delay

    用法:
        dispatch_async_task(async_task, generate_outline_task,
                            outline_id=outline.id, async_task_id=async_task.id)
    """
    result = task_func.delay(*args, **kwargs)
    try:
        _persist_celery_task_id(async_task.pk, result)
    except Exception:
        logger.exception(
            "Failed to persist celery_task_id for async task %s",
            async_task.pk,
        )


def _persist_celery_task_id(async_task_pk, result) -> None:
    """回写 celery_task_id；非字符串 id（测试 mock）跳过，避免损坏事务。"""
    from apps.common.models import AsyncTask

    task_id = getattr(result, "id", None)
    if not isinstance(task_id, str) or not task_id:
        return
    AsyncTask.objects.filter(pk=async_task_pk).update(celery_task_id=task_id)


def close_old_connections_safely():
    """close_old_connections 的安全版本：跳过处于 atomic 块中的连接。

    Celery worker 长驻进程中用于主动归还失效/过期的数据库连接；
    但测试（django TestCase）中连接被 atomic 包裹，直接关闭会破坏测试事务，
    因此跳过 in_atomic_block 的连接。
    """
    from django.db import connections

    for conn in connections.all():
        if conn.connection is not None and not conn.in_atomic_block:
            conn.close_if_unusable_or_obsolete()

