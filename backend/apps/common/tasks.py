"""通用 Celery 任务。"""

import logging
from datetime import timedelta

from django.utils import timezone

from config.celery import app

logger = logging.getLogger(__name__)

# 超过该宽限期仍未完成的任务视为僵尸任务
STALE_TASK_GRACE_MINUTES = 45


@app.task(name="apps.common.reconcile_stale_async_tasks", time_limit=300, soft_time_limit=240)
def reconcile_stale_async_tasks():
    """回收超时未完成的 AsyncTask（worker 中断/挂死兜底）。

    Celery 的 time_limit 只能解决任务挂起；进程被直接杀掉（部署、OOM）
    时没有异常回调，DB 状态会永远停在 running。此任务定期把超过宽限期
    仍 running 的任务标记为失败，并连带回收关联的抽取 run 与流水线 job。
    """
    from apps.common.models import AsyncTask
    from apps.requirements.models import RequirementExtractionRun
    from apps.tender.constants import PipelineStatus
    from apps.tender.models import PipelineJob

    cutoff = timezone.now() - timedelta(minutes=STALE_TASK_GRACE_MINUTES)
    stale = list(
        AsyncTask.objects.filter(
            status=AsyncTask.STATUS_RUNNING,
            updated_at__lt=cutoff,
        ).values("id", "related_object_type", "related_object_id")
    )
    if not stale:
        return {"reclaimed": 0}

    msg = "任务超过宽限期仍未完成，已由系统回收（worker 可能中断，请重新触发）"
    now = timezone.now()
    task_ids = [t["id"] for t in stale]
    tender_file_ids = {
        t["related_object_id"]
        for t in stale
        if t["related_object_type"] == "TenderFile" and t["related_object_id"]
    }

    AsyncTask.objects.filter(id__in=task_ids).update(
        status=AsyncTask.STATUS_FAILED,
        error_message=msg,
        finished_at=now,
    )
    RequirementExtractionRun.objects.filter(
        async_task_id__in=task_ids,
        status="running",
    ).update(status="failed", error_message=msg, finished_at=now)
    PipelineJob.objects.filter(
        tender_file_id__in=tender_file_ids,
        status=PipelineStatus.RUNNING,
    ).update(status=PipelineStatus.FAILED, error_message=msg, finished_at=now)

    logger.warning("Reclaimed %s stale async tasks: %s", len(task_ids), task_ids)
    return {"reclaimed": len(task_ids)}
