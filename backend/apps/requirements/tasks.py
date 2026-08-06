"""条款抽取异步任务。

支持新版独立于 TenderChunk 的多轮条款抽取。
"""

import logging
from typing import Callable

from django.utils import timezone

from apps.common.models import AsyncTask
from apps.common.tasks_utils import soft_get_async_task
from apps.tender.constants import (
    EMBEDDER_VERSION,
    PipelineStage,
    PipelineStatus,
    REQUIREMENT_EXTRACTOR_VERSION,
)
from apps.tender.models import TenderFile, PipelineJob
from apps.requirements.services import (
    RequirementExtractService,
    RequirementExtractionError,
)
from apps.requirements.services.dedup_service import (
    RequirementDedupService,
    trigger_lot_dedup,
)
from apps.requirements.services.extraction.progress import ProgressCallback
from apps.requirements.constants import EXTRACTION_TYPE_NAMES
from config.celery import app

logger = logging.getLogger(__name__)


# ============================================================================
# 条款抽取任务（新版，独立于 TenderChunk）
# ============================================================================

@app.task(name="apps.requirements.extract_requirements_v2", bind=True, soft_time_limit=1800, time_limit=2100)
def extract_requirements_v2(self, task_id: int, tender_file_id: int, options: dict):
    """条款抽取异步任务（V2）。

    独立于 TenderChunk，直接从文档全文多轮抽取。

    Args:
        task_id: AsyncTask ID
        tender_file_id: TenderFile ID
        options: 抽取参数
            - extraction_types: 抽取类型列表，如 ["scoring", "mandatory"]
            - overwrite: 是否覆盖已有条款
            - model_config_id: 模型配置 ID
            - prompt_version_id: 提示词版本 ID
    """
    task = soft_get_async_task(task_id)
    if task is None:
        return
    tender_file = TenderFile.objects.get(pk=tender_file_id)

    # 创建/复用 PipelineJob（REQUIREMENT_EXTRACT 阶段）
    # 自动流水线和手动抽取共用此任务，统一在此记录阶段状态
    job, _ = PipelineJob.objects.get_or_create(
        tender_file=tender_file,
        stage=PipelineStage.REQUIREMENT_EXTRACT,
        defaults={
            "status": PipelineStatus.RUNNING,
            "version": REQUIREMENT_EXTRACTOR_VERSION,
            "started_at": timezone.now(),
        },
    )
    if job.status != PipelineStatus.RUNNING:
        job.status = PipelineStatus.RUNNING
        job.error_message = ""
        job.started_at = job.started_at or timezone.now()
        job.finished_at = None
        job.save(update_fields=["status", "error_message", "started_at", "finished_at"])

    try:
        # 更新任务状态（流水线模式下不重置 progress，沿用上一阶段值）
        progress_offset = options.get("progress_offset", 0)
        progress_range = options.get("progress_range", 100)
        task.status = AsyncTask.STATUS_RUNNING
        if progress_offset == 0:
            task.progress = 5
        task.current_step = "开始抽取条款"
        task.started_at = task.started_at or timezone.now()
        task.save(update_fields=["status", "progress", "current_step", "started_at"])

        # 创建进度回调（支持区间映射，流水线模式下映射到 [offset, offset+range]）
        progress_callback = ProgressCallback(
            task, progress_offset=progress_offset, progress_range=progress_range,
        )

        # 执行抽取
        service = RequirementExtractService()
        result = service.extract_requirements(
            tender_file_id=tender_file_id,
            extraction_types=options.get("extraction_types", ["scoring", "mandatory", "qualification"]),
            created_by=task.created_by,
            overwrite=options.get("overwrite", False),
            prompt_version_id=options.get("prompt_version_id"),
            model_config_id=options.get("model_config_id"),
            extraction_run_id=options.get("extraction_run_id"),
            progress_callback=progress_callback,
        )

        # 更新任务成功状态
        task.status = AsyncTask.STATUS_SUCCESS
        task.progress = 100
        if result["failed_types"]:
            task.current_step = f"部分完成，成功 {result['success_count']} 条，失败类型: {result['failed_types']}"
        elif result["total_count"] == 0:
            task.current_step = "抽取完成，共 0 条条款（未抽到任何条款，可继续生成大纲或检查文件内容）"
        else:
            task.current_step = f"抽取完成，共 {result['total_count']} 条条款"
        task.result_payload = {
            "run_id": result["run_id"],
            "total_count": result["total_count"],
            "success_count": result["success_count"],
            "failed_types": result["failed_types"],
            "requirement_ids": result["requirement_ids"][:100],  # 只保留前100条ID
        }
        task.finished_at = timezone.now()
        task.save()

        # 更新 PipelineJob 为成功
        job.status = PipelineStatus.SUCCEEDED
        job.finished_at = timezone.now()
        # 抽到 0 条条款：阶段技术上成功，但结果为空，记入 error_message 供前端展示警告
        if result["total_count"] == 0 and not result["failed_types"]:
            job.error_message = "未抽取到任何条款"
            job.save(update_fields=["status", "finished_at", "error_message"])
        else:
            job.save(update_fields=["status", "finished_at"])

        # 更新文件状态：抽到 0 条走专门的 empty 状态（警告但可继续）
        if result["total_count"] == 0 and not result["failed_types"]:
            tender_file.status = TenderFile.STATUS_REQUIREMENT_EXTRACTED_EMPTY
        else:
            tender_file.status = TenderFile.STATUS_REQUIREMENT_EXTRACTED
        tender_file.save(update_fields=["status", "updated_at"])

        # embedding 阶段在招标文件链路中暂未实现，extract 成功后标记为 SKIPPED，
        # 避免工作台前端「向量嵌入」阶段永久显示「等待中」。
        PipelineJob.objects.get_or_create(
            tender_file=tender_file,
            stage=PipelineStage.EMBEDDING,
            defaults={
                "status": PipelineStatus.SKIPPED,
                "version": EMBEDDER_VERSION,
                "started_at": timezone.now(),
                "finished_at": timezone.now(),
            },
        )

        logger.info(
            "Requirement extraction V2 completed: task_id=%s, run_id=%s, total=%d, failed_types=%s",
            task_id,
            result["run_id"],
            result["total_count"],
            result["failed_types"],
        )

        # 抽取成功（含部分成功）后自动触发标段级去重；失败路径不触发。
        # 防重入在 trigger_lot_dedup 内部处理；去重任务不会反向触发抽取，无循环。
        if tender_file.lot_id:
            try:
                trigger_lot_dedup(
                    tender_file.lot,
                    task.created_by,
                    source="auto_after_extract",
                )
            except Exception:
                logger.exception(
                    "Auto lot dedup trigger failed: lot_id=%s",
                    tender_file.lot_id,
                )

    except RequirementExtractionError as exc:
        logger.error(
            "Requirement extraction V2 failed: task_id=%s, error=%s",
            task_id,
            str(exc),
        )
        _mark_task_failed(task, str(exc))
        _mark_job_failed(job, str(exc))

    except Exception as exc:
        logger.exception(
            "Requirement extraction V2 unexpected error: task_id=%s",
            task_id,
        )
        _mark_task_failed(task, f"{type(exc).__name__}: {exc}")
        _mark_job_failed(job, f"{type(exc).__name__}: {exc}")
        raise


def _mark_task_failed(task: AsyncTask, error_message: str):
    """标记任务失败。"""
    task.status = AsyncTask.STATUS_FAILED
    task.error_message = error_message[:512]
    task.finished_at = timezone.now()
    task.save(update_fields=["status", "error_message", "finished_at"])


# ============================================================================
# 标段级条款去重任务
# ============================================================================

@app.task(name="apps.requirements.deduplicate_lot_requirements", bind=True, soft_time_limit=1800, time_limit=2100)
def deduplicate_lot_requirements_task(self, task_id: int, lot_id: int, options: dict):
    """标段级条款三层去重异步任务。

    Args:
        task_id: AsyncTask ID
        lot_id: 标段 ID
        options: 参数
            - dedup_run_id: 预创建的 RequirementDedupRun ID
    """
    task = soft_get_async_task(task_id)
    if task is None:
        return

    try:
        task.status = AsyncTask.STATUS_RUNNING
        task.progress = 5
        task.current_step = "开始标段条款去重"
        task.started_at = task.started_at or timezone.now()
        task.save(update_fields=["status", "progress", "current_step", "started_at"])

        progress_callback = ProgressCallback(task)

        service = RequirementDedupService()
        result = service.run(
            lot_id=lot_id,
            created_by=task.created_by,
            dedup_run_id=options.get("dedup_run_id"),
            progress_callback=progress_callback,
        )

        task.status = AsyncTask.STATUS_SUCCESS
        task.progress = 100
        task.current_step = (
            f"去重完成，候选 {result['total_count']} 条，"
            f"合并 {result['duplicate_count']} 条（{result['cluster_count']} 簇）"
        )
        task.result_payload = {
            "dedup_run_id": result["dedup_run_id"],
            "total_count": result["total_count"],
            "cluster_count": result["cluster_count"],
            "llm_arbitrated_count": result["llm_arbitrated_count"],
            "duplicate_count": result["duplicate_count"],
        }
        task.finished_at = timezone.now()
        task.save()

        logger.info(
            "Lot requirement dedup completed: task_id=%s, lot_id=%s, run_id=%s, duplicates=%d",
            task_id,
            lot_id,
            result["dedup_run_id"],
            result["duplicate_count"],
        )

    except Exception as exc:
        logger.exception(
            "Lot requirement dedup failed: task_id=%s, lot_id=%s",
            task_id,
            lot_id,
        )
        _mark_task_failed(task, f"{type(exc).__name__}: {exc}")
        raise


def _mark_job_failed(job: PipelineJob | None, error_message: str):
    """标记流水线阶段失败。"""
    if not job:
        return
    job.status = PipelineStatus.FAILED
    job.error_message = error_message[:512]
    job.finished_at = timezone.now()
    try:
        job.save(update_fields=["status", "error_message", "finished_at"])
    except Exception:
        logger.exception("PipelineJob save in failure handler also failed")
