"""强制结束任务服务：revoke Celery 任务 + 按类型 DB 收尾。"""

import logging
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

logger = logging.getLogger(__name__)

FORCE_STOP_MESSAGE = "任务已被强制结束"

TERMINAL_STATUSES = ("completed", "failed", "cancelled", "partial_success")


def _revoke(celery_task_id: str) -> bool:
    """revoke 并终止 celery 任务（SIGKILL）。异常不阻断 DB 收尾。"""
    if not celery_task_id:
        return False
    try:
        from config.celery import app

        app.control.revoke(celery_task_id, terminate=True, signal="SIGKILL")
        logger.info("Revoked celery task %s", celery_task_id)
        return True
    except Exception:
        logger.warning("Failed to revoke celery task %s", celery_task_id, exc_info=True)
        return False


def _log_force_stop(*, user, request, target_type, target_id, reason=""):
    try:
        from apps.audit.services.audit_service import log_operation

        log_operation(
            actor=user,
            action="task_queue.force_stop",
            request=request,
            target_type=target_type,
            target_id=target_id,
            summary=FORCE_STOP_MESSAGE,
            extra={"reason": reason[:500]},
        )
    except Exception:
        logger.warning("Failed to write force-stop audit log", exc_info=True)


@transaction.atomic
def force_stop_generation_task(task_id: int, *, user, request=None, reason: str = "") -> dict:
    """强制结束 GenerationTask（矩阵/批量正文）。

    Returns:
        {"success": True, ...} 或抛 GenerationTaskAlreadyEnded（终态/已强制结束）
    """
    from apps.outline.constants import ContentMatrixStatus, GenerationTaskStatus, GenerationTaskType
    from apps.outline.models import GenerationTask, Section

    task = GenerationTask.objects.select_for_update().get(pk=task_id)
    if task.status in TERMINAL_STATUSES or task.force_stopped:
        raise AlreadyEndedError("任务已结束，无需强制结束")

    now = timezone.now()
    revoked = _revoke(task.celery_task_id)

    if task.task_type == GenerationTaskType.MATRIX_GENERATION:
        # 章节重置为 PENDING + 显式释放矩阵锁（SIGKILL 后任务 finally 不执行）
        Section.objects.filter(
            outline_id=task.outline_id,
            content_matrix_status=ContentMatrixStatus.GENERATING,
        ).update(
            content_matrix_status=ContentMatrixStatus.PENDING,
            content_matrix_error=FORCE_STOP_MESSAGE,
        )
        try:
            from apps.outline.services.matrix_service import MatrixService

            MatrixService().release_matrix_generation_lock(task.outline_id)
        except Exception:
            logger.warning("Failed to release matrix lock for outline %s", task.outline_id, exc_info=True)
        task.status = GenerationTaskStatus.FAILED
    elif task.task_type == GenerationTaskType.SECTION_BATCH_GENERATION:
        # 必须置 CANCELLED：_finalize_batch_task 对 CANCELLED early-return，
        # 在跑子任务/chord 回调不会把终态覆盖回 COMPLETED
        from apps.outline.models import BatchGenerationTaskItem

        BatchGenerationTaskItem.objects.filter(
            task=task, status__in=["pending", "running"],
        ).update(status="cancelled", finished_at=now)
        task.status = GenerationTaskStatus.CANCELLED
    else:
        task.status = GenerationTaskStatus.FAILED

    task.force_stopped = True
    task.force_stopped_at = now
    task.error_message = FORCE_STOP_MESSAGE
    task.finished_at = now
    task.save(update_fields=[
        "status", "force_stopped", "force_stopped_at",
        "error_message", "finished_at", "updated_at",
    ])

    _log_force_stop(
        user=user, request=request, target_type="GenerationTask",
        target_id=task_id, reason=reason,
    )
    logger.warning(
        "Force-stopped generation task %s (%s) by user %s, revoked=%s",
        task_id, task.task_type, user.id if user else None, revoked,
    )
    return {"success": True, "status": task.status, "revoked": revoked}


@transaction.atomic
def force_stop_async_task(task_id: int, *, user, request=None, reason: str = "") -> dict:
    """强制结束 AsyncTask（文件解析/大纲生成/知识库等），联动收尾关联对象。"""
    from apps.common.models import AsyncTask

    task = AsyncTask.objects.select_for_update().get(pk=task_id)
    if task.status in (AsyncTask.STATUS_SUCCESS, AsyncTask.STATUS_FAILED,
                       AsyncTask.STATUS_CANCELLED) or task.force_stopped:
        raise AlreadyEndedError("任务已结束，无需强制结束")

    now = timezone.now()
    revoked = _revoke(task.celery_task_id)

    task.status = AsyncTask.STATUS_CANCELLED
    task.force_stopped = True
    task.force_stopped_at = now
    task.error_message = FORCE_STOP_MESSAGE
    task.finished_at = now
    task.save(update_fields=[
        "status", "force_stopped", "force_stopped_at",
        "error_message", "finished_at", "updated_at",
    ])

    _reclaim_related_objects(task, now)

    _log_force_stop(
        user=user, request=request, target_type="AsyncTask",
        target_id=task_id, reason=reason,
    )
    logger.warning(
        "Force-stopped async task %s (%s) by user %s, revoked=%s",
        task_id, task.task_type, user.id if user else None, revoked,
    )
    return {"success": True, "status": task.status, "revoked": revoked}


def _reclaim_related_objects(task, now) -> None:
    """按关联对象类型联动收尾（对齐 reconcile_stale_async_tasks 的回收行为）。"""
    related_type = task.related_object_type
    related_id = task.related_object_id

    if related_type == "TenderFile" and related_id:
        from apps.tender.constants import PipelineStatus as TenderPipelineStatus
        from apps.tender.models import TenderFile

        TenderFile.objects.filter(
            id=int(related_id),
            status__in=[
                TenderFile.STATUS_PARSING,
                TenderFile.STATUS_CHUNKING,
                TenderFile.STATUS_PARSE_PENDING,
            ],
        ).update(
            status=TenderFile.STATUS_PARSE_FAILED,
            error_message=FORCE_STOP_MESSAGE,
            updated_at=now,
        )
        from apps.requirements.models import RequirementExtractionRun

        RequirementExtractionRun.objects.filter(
            async_task_id=task.id, status="running",
        ).update(status="failed", error_message=FORCE_STOP_MESSAGE, finished_at=now)
        from apps.tender.models import PipelineJob

        PipelineJob.objects.filter(
            tender_file_id=int(related_id),
            status=TenderPipelineStatus.RUNNING,
        ).update(status=TenderPipelineStatus.FAILED, error_message=FORCE_STOP_MESSAGE, finished_at=now)

    elif related_type == "Outline" and related_id:
        from apps.outline.constants import OutlineStatus
        from apps.outline.models import Outline, Section

        outline = Outline.objects.filter(pk=int(related_id)).first()
        if outline and outline.status == OutlineStatus.GENERATING:
            if not Section.objects.filter(outline=outline).exists():
                outline.delete()
            else:
                outline.status = OutlineStatus.DRAFT
                outline.save(update_fields=["status", "updated_at"])

    elif related_type == "Section" and related_id:
        from apps.outline.constants import ContentGenerationStatus, GenerationRecordStatus, SectionGenerationStatus
        from apps.outline.models import Section, SectionGenerationRecord

        section = Section.objects.filter(pk=int(related_id)).first()
        if section:
            if section.generation_status == SectionGenerationStatus.RUNNING:
                section.generation_status = SectionGenerationStatus.FAILED
            if section.content_generation_status == ContentGenerationStatus.RUNNING:
                section.content_generation_status = ContentGenerationStatus.FAILED
                section.content_generation_error = FORCE_STOP_MESSAGE
            section.save(update_fields=[
                "generation_status", "content_generation_status",
                "content_generation_error", "updated_at",
            ])
        SectionGenerationRecord.objects.filter(
            async_task_id=task.id, status=GenerationRecordStatus.RUNNING,
        ).update(status=GenerationRecordStatus.FAILED, error_message=FORCE_STOP_MESSAGE, finished_at=now)


class AlreadyEndedError(Exception):
    """任务已处于终态或已被强制结束。"""
    pass
