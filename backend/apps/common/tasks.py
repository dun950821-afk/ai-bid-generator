"""通用 Celery 任务。"""

import logging
from datetime import timedelta

from django.utils import timezone

from config.celery import app

logger = logging.getLogger(__name__)


@app.task(name="apps.common.reconcile_stale_async_tasks", time_limit=300, soft_time_limit=240)
def reconcile_stale_async_tasks():
    """回收超时未完成的 AsyncTask（worker 中断/挂死兜底）。

    Celery 的 time_limit 只能解决任务挂起；进程被直接杀掉（部署、OOM）
    时没有异常回调，DB 状态会永远停在 running。此任务定期把超过宽限期
    仍 running 的任务标记为失败，并连带回收关联的抽取 run 与流水线 job。

    调度由 beat 每 60s 触发一次，内部用 Redis 原子门控控制实际执行间隔
    （reconcile_interval_seconds，默认 600s），修改参数无需重启。
    """
    from django.core.cache import cache

    from apps.task_queue.services.config_service import get_task_config

    now = timezone.now()
    interval = get_task_config("reconcile_interval_seconds")
    if not cache.add("task_queue:reconcile_last_run", now, timeout=interval):
        return {"skipped": True}

    from apps.common.models import AsyncTask
    from apps.generation.constants import PromptRunStatus
    from apps.generation.models import PromptRun
    from apps.requirements.models import RequirementExtractionRun
    from apps.tender.constants import PipelineStatus
    from apps.tender.models import PipelineJob, TenderFile
    from apps.outline.constants import ContentMatrixStatus, GenerationTaskStatus, GenerationTaskType
    from apps.outline.models import GenerationTask, Section

    msg = "任务超过宽限期仍未完成，已由系统回收（worker 可能中断，请重新触发）"
    cutoff = now - timedelta(minutes=get_task_config("stale_task_grace_minutes"))
    stale = list(
        AsyncTask.objects.filter(
            status=AsyncTask.STATUS_RUNNING,
            updated_at__lt=cutoff,
        ).values("id", "related_object_type", "related_object_id")
    )

    # 从未投递成功的 PENDING 任务（celery_task_id 为空）：不存在任何 worker 会执行它，
    # 永远停在排队中。产生原因：创建后投递窗口内进程崩溃，或业务代码只创建不投递
    # （如批量章节生成的历史书签行）。短宽限期后直接删除，避免队列列表堆积废弃任务。
    undispatched_cutoff = now - timedelta(minutes=10)
    stale_undispatched_ids = list(
        AsyncTask.objects.filter(
            status=AsyncTask.STATUS_PENDING,
            celery_task_id="",
            created_at__lt=undispatched_cutoff,
        ).values_list("id", flat=True)
    )
    if stale_undispatched_ids:
        AsyncTask.objects.filter(id__in=stale_undispatched_ids).delete()
        logger.warning("Reclaimed %s undispatched pending AsyncTasks", len(stale_undispatched_ids))

    reclaimed_runs = PromptRun.objects.filter(
        status=PromptRunStatus.RUNNING,
        updated_at__lt=cutoff,
    ).update(status=PromptRunStatus.FAILED, error_message=msg)
    reclaimed_outlines = _reclaim_generating_outlines(cutoff)
    reclaimed_generation_tasks = _reclaim_stale_generation_tasks(cutoff, msg)

    if not stale:
        if reclaimed_runs:
            logger.warning("Reclaimed %s orphan running PromptRuns", reclaimed_runs)
        if reclaimed_outlines:
            logger.warning("Reclaimed %s GENERATING outlines", reclaimed_outlines)
        if reclaimed_generation_tasks:
            logger.warning("Reclaimed %s stale generation tasks", reclaimed_generation_tasks)
        return {"reclaimed": reclaimed_runs + reclaimed_outlines + reclaimed_generation_tasks}

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

    # 关键：回收僵尸任务时，必须把卡在 parsing/chunking 的 TenderFile 标记为失败，
    # 否则前端工作台会一直显示"解析中"
    reclaimed_files = TenderFile.objects.filter(
        id__in=tender_file_ids,
        status__in=[
            TenderFile.STATUS_PARSING,
            TenderFile.STATUS_CHUNKING,
            TenderFile.STATUS_PARSE_PENDING,
        ],
    ).update(
        status=TenderFile.STATUS_PARSE_FAILED,
        error_message=msg,
        updated_at=now,
    )

    logger.warning(
        "Reclaimed %s stale async tasks: %s (runs=%s, outlines=%s, files=%s, generation_tasks=%s)",
        len(task_ids),
        task_ids,
        reclaimed_runs,
        reclaimed_outlines,
        reclaimed_files,
        reclaimed_generation_tasks,
    )
    return {"reclaimed": len(task_ids) + reclaimed_runs + reclaimed_outlines + reclaimed_files + reclaimed_generation_tasks}


def _reclaim_generating_outlines(cutoff) -> int:
    """清理卡在 GENERATING 的 outline 草稿（任务硬限 50 分钟，超宽限期必已死）。

    与 generate_outline_task 失败分支行为一致：无章节删除，有章节保留为 DRAFT 可见。
    """
    from apps.outline.constants import OutlineStatus
    from apps.outline.models import Outline, Section

    reclaimed = 0
    for outline in Outline.objects.filter(
        status=OutlineStatus.GENERATING,
        updated_at__lt=cutoff,
    ):
        if not Section.objects.filter(outline=outline).exists():
            outline.delete()
        else:
            outline.status = OutlineStatus.DRAFT
            outline.save(update_fields=["status", "updated_at"])
        reclaimed += 1
    return reclaimed


def _reclaim_stale_generation_tasks(cutoff, msg: str) -> int:
    """回收卡住的 GenerationTask（矩阵生成/章节批量生成）。

    覆盖场景：
    1. RUNNING 超时：worker 中断后任务永远停在 RUNNING
    2. PENDING 超时：Celery 投递失败被静默吞掉后任务停在 PENDING，
       create_batch_task 会把 PENDING/RUNNING 视为占用，该大纲从此无法再发起批量生成

    回收动作：
    - 矩阵任务：关联 GENERATING Section 重置为 PENDING，允许重新生成
    - 批量任务：pending/running 子项置 failed，解除占用
    - 任务本身置 FAILED
    """
    from apps.outline.constants import ContentMatrixStatus, GenerationTaskStatus, GenerationTaskType
    from apps.outline.models import BatchGenerationTaskItem, GenerationTask, Section
    from apps.task_queue.services.config_service import get_task_config

    now = timezone.now()
    # PENDING 允许更长的宽限期，避免 worker 正常排队时被误回收
    pending_cutoff = cutoff - timedelta(minutes=get_task_config("stale_task_grace_minutes"))
    reclaimed = 0

    stale_tasks = list(
        GenerationTask.objects.filter(
            status=GenerationTaskStatus.RUNNING,
            updated_at__lt=cutoff,
        )
    ) + list(
        GenerationTask.objects.filter(
            status=GenerationTaskStatus.PENDING,
            updated_at__lt=pending_cutoff,
        )
    )

    for task in stale_tasks:
        if task.task_type == GenerationTaskType.MATRIX_GENERATION:
            # 重置关联的 GENERATING 章节为 PENDING
            Section.objects.filter(
                outline_id=task.outline_id,
                content_matrix_status=ContentMatrixStatus.GENERATING,
            ).update(
                content_matrix_status=ContentMatrixStatus.PENDING,
                content_matrix_error="任务中断，已自动重置",
            )
        elif task.task_type == GenerationTaskType.SECTION_BATCH_GENERATION:
            # 子项置 failed，解除 create_batch_task 的占用
            BatchGenerationTaskItem.objects.filter(
                task=task,
                status__in=["pending", "running"],
            ).update(
                status="failed",
                error_message=msg,
                finished_at=now,
            )

        # 标记任务失败
        task.status = GenerationTaskStatus.FAILED
        task.error_message = msg
        task.finished_at = now
        task.save(update_fields=["status", "error_message", "finished_at", "updated_at"])
        reclaimed += 1

    return reclaimed
