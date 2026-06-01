"""招标文件处理任务。"""

import logging
from datetime import timedelta
from hashlib import sha256

from django.utils import timezone
from django.db import transaction

from apps.common.models import AsyncTask
from apps.common.services.storage import StorageService
from apps.tender.constants import (
    PARSER_VERSION,
    CHUNKER_VERSION,
    REQUIREMENT_EXTRACTOR_VERSION,
    PipelineStage,
    PipelineStatus,
)
from apps.tender.models import TenderFile, PipelineJob, ParsedDocument
from apps.tender.services.parse_service import ParseService
from apps.tender.services.chunk_service import ChunkService
from config.celery import app

logger = logging.getLogger(__name__)


# ============================================================================
# 辅助函数
# ============================================================================

def _compute_file_hash(tender_file: TenderFile) -> str:
    """计算文件哈希（基于内容）。"""
    storage = StorageService()
    content = storage.get_object(tender_file.object_key)
    return sha256(content).hexdigest()


def _mark_job_failed(job: PipelineJob, exc: Exception) -> None:
    """标记任务失败。"""
    if job:
        error_message = f"{type(exc).__name__}: {exc}"[:512]
        job.status = PipelineStatus.FAILED
        job.error_message = error_message
        job.finished_at = timezone.now()
        try:
            job.save(update_fields=["status", "error_message", "finished_at"])
        except Exception:
            logger.exception("PipelineJob save in failure handler also failed")


# ============================================================================
# 解析任务
# ============================================================================

@app.task(name="apps.tender.parse_tender_file", bind=True)
def parse_tender_file(self, task_id: int, tender_file_id: int):
    """解析招标文件。"""
    task = AsyncTask.objects.get(pk=task_id)
    tender_file = TenderFile.objects.get(pk=tender_file_id)

    job = None

    try:
        task.status = AsyncTask.STATUS_RUNNING
        task.progress = 10
        task.current_step = "开始解析"
        task.started_at = timezone.now()
        task.save(update_fields=["status", "progress", "current_step", "started_at"])

        tender_file.status = TenderFile.STATUS_PARSING
        tender_file.save(update_fields=["status", "updated_at"])

        # 创建 PipelineJob
        job = PipelineJob.objects.create(
            tender_file=tender_file,
            stage=PipelineStage.PARSE,
            status=PipelineStatus.RUNNING,
            version=PARSER_VERSION,
            input_hash=_compute_file_hash(tender_file),
        )

        # 执行解析
        parse_service = ParseService()
        parsed_doc = parse_service.parse(tender_file)

        # 更新状态
        job.status = PipelineStatus.SUCCEEDED
        job.output_hash = parsed_doc.output_hash
        job.finished_at = timezone.now()
        job.save()

        task.status = AsyncTask.STATUS_SUCCESS
        task.progress = 100
        task.current_step = "解析完成"
        task.result_payload = {
            "tender_file_id": tender_file.id,
            "parsed_document_id": parsed_doc.id,
        }
        task.finished_at = timezone.now()
        task.save()

        tender_file.status = TenderFile.STATUS_PARSED
        tender_file.save(update_fields=["status", "updated_at"])

        # 触发下一阶段
        chunk_parsed_document.delay(task_id, parsed_doc.id)

    except Exception as exc:
        logger.exception(
            "parse_tender_file failed: task_id=%s tender_file_id=%s",
            task_id,
            tender_file_id,
        )
        if job:
            _mark_job_failed(job, exc)

        # 更新 AsyncTask
        error_message = f"{type(exc).__name__}: {exc}"[:512]
        task.status = AsyncTask.STATUS_FAILED
        task.error_message = error_message
        task.finished_at = timezone.now()
        task.save(update_fields=["status", "error_message", "finished_at"])

        tender_file.status = TenderFile.STATUS_PARSE_FAILED
        tender_file.error_message = error_message
        tender_file.save(update_fields=["status", "error_message", "updated_at"])

        raise


@app.task(name="apps.tender.chunk_parsed_document", bind=True)
def chunk_parsed_document(self, task_id: int, parsed_doc_id: int):
    """语义分块。"""
    parsed_doc = ParsedDocument.objects.get(pk=parsed_doc_id)
    task = AsyncTask.objects.get(pk=task_id)

    job = None

    try:
        task.current_step = "开始分块"
        task.save(update_fields=["current_step"])

        job = PipelineJob.objects.create(
            tender_file=parsed_doc.tender_file,
            stage=PipelineStage.CHUNK,
            status=PipelineStatus.RUNNING,
            version=CHUNKER_VERSION,
        )

        chunk_service = ChunkService()
        chunks = chunk_service.chunk(parsed_doc)

        job.status = PipelineStatus.SUCCEEDED
        job.finished_at = timezone.now()
        job.save()

        task.current_step = f"分块完成，共 {len(chunks)} 个分块"
        task.save(update_fields=["current_step"])

        parsed_doc.tender_file.status = TenderFile.STATUS_CHUNKED
        parsed_doc.tender_file.save(update_fields=["status", "updated_at"])

        # 触发下一阶段（P1：条款抽取）
        # extract_requirements.delay(task_id, parsed_doc.id)

    except Exception as exc:
        logger.exception(
            "chunk_parsed_document failed: task_id=%s parsed_doc_id=%s",
            task_id,
            parsed_doc_id,
        )
        if job:
            _mark_job_failed(job, exc)

        # 更新 AsyncTask 状态
        error_message = f"{type(exc).__name__}: {exc}"[:512]
        task.status = AsyncTask.STATUS_FAILED
        task.error_message = error_message
        task.finished_at = timezone.now()
        task.save(update_fields=["status", "error_message", "finished_at"])

        # 更新 TenderFile 状态为解析失败
        parsed_doc.tender_file.status = TenderFile.STATUS_PARSE_FAILED
        parsed_doc.tender_file.error_message = error_message
        parsed_doc.tender_file.save(update_fields=["status", "error_message", "updated_at"])

        raise


@app.task(name="apps.tender.extract_requirements", bind=True)
def extract_requirements(self, task_id: int, parsed_doc_id: int):
    """条款抽取（P1）。"""
    parsed_doc = ParsedDocument.objects.get(pk=parsed_doc_id)
    task = AsyncTask.objects.get(pk=task_id)

    job = None

    try:
        task.current_step = "开始抽取条款"
        task.save(update_fields=["current_step"])

        job = PipelineJob.objects.create(
            tender_file=parsed_doc.tender_file,
            stage=PipelineStage.REQUIREMENT_EXTRACT,
            status=PipelineStatus.RUNNING,
            version=REQUIREMENT_EXTRACTOR_VERSION,
        )

        # TODO: P1 阶段实现
        # extract_service = RequirementExtractService()
        # requirements = extract_service.extract(parsed_doc)

        job.status = PipelineStatus.SUCCEEDED
        job.finished_at = timezone.now()
        job.save()

        parsed_doc.tender_file.status = TenderFile.STATUS_REQUIREMENT_EXTRACTED
        parsed_doc.tender_file.save(update_fields=["status", "updated_at"])

    except Exception as exc:
        logger.exception(
            "extract_requirements failed: task_id=%s parsed_doc_id=%s",
            task_id,
            parsed_doc_id,
        )
        if job:
            _mark_job_failed(job, exc)
        raise


# ============================================================================
# 清理任务
# ============================================================================

@app.task(name="apps.tender.cleanup_stale_uploads")
def cleanup_stale_uploads():
    """清理超过 grace 仍未完成的孤儿上传记录。"""
    storage = StorageService()
    from django.conf import settings

    grace_hours = getattr(settings, "UPLOAD_GRACE_HOURS", 1)
    cutoff = timezone.now() - timedelta(hours=grace_hours)
    qs = TenderFile.objects.filter(
        status__in=[TenderFile.STATUS_UPLOADING, TenderFile.STATUS_REJECTED],
        created_at__lt=cutoff,
    )
    count = 0
    for tender_file in qs:
        try:
            storage.remove_object(tender_file.object_key)
        except Exception:
            pass
        tender_file.status = TenderFile.STATUS_UPLOAD_EXPIRED
        tender_file.save(update_fields=["status", "updated_at"])
        count += 1
    return {"expired": count}