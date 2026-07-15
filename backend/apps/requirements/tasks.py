"""条款抽取异步任务。

支持新版独立于 TenderChunk 的多轮条款抽取。
"""

import logging
from typing import Callable

from django.utils import timezone

from apps.common.models import AsyncTask
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
from apps.requirements.constants import EXTRACTION_TYPE_NAMES
from config.celery import app

logger = logging.getLogger(__name__)


# ============================================================================
# 进度回调管理
# ============================================================================

class ProgressCallback:
    """进度回调管理器，避免过度频繁写库。

    只有当 progress 变化 >= 5% 或 current_step 变化时才保存。
    支持区间映射：当作为解析流水线一段时，传入 offset/range 把 0-100 映射到
    [offset, offset+range] 区间（如 extract 段映射到 65-100）。
    """

    def __init__(self, task: AsyncTask, progress_offset: int = 0, progress_range: int = 100):
        self.task = task
        self.progress_offset = min(100, max(0, progress_offset))
        self.progress_range = min(100 - self.progress_offset, max(0, progress_range))
        self.last_progress = task.progress
        self.last_step = task.current_step

    def _map_progress(self, progress: int) -> int:
        """把子任务的 0-100 映射到 [offset, offset+range]。"""
        progress = min(100, max(0, progress))
        return min(100, self.progress_offset + int(progress * self.progress_range / 100))

    def __call__(self, progress: int, step: str):
        """更新进度。"""
        mapped = self._map_progress(progress)

        # 检查是否需要保存
        progress_changed = abs(mapped - self.last_progress) >= 5
        step_changed = step != self.last_step

        if progress_changed or step_changed:
            self.task.progress = mapped
            self.task.current_step = step
            self.task.save(update_fields=["progress", "current_step"])
            self.last_progress = mapped
            self.last_step = step
            logger.debug(
                "Task %s progress: %d%% - %s",
                self.task.id,
                mapped,
                step,
            )


# ============================================================================
# 条款抽取任务（新版，独立于 TenderChunk）
# ============================================================================

@app.task(name="apps.requirements.extract_requirements_v2", bind=True)
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
    task = AsyncTask.objects.get(pk=task_id)
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
            progress_callback=progress_callback,
        )

        # 更新任务成功状态
        task.status = AsyncTask.STATUS_SUCCESS
        task.progress = 100
        if result["failed_types"]:
            task.current_step = f"部分完成，成功 {result['success_count']} 条，失败类型: {result['failed_types']}"
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
        job.save(update_fields=["status", "finished_at"])

        # 更新文件状态
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


# ============================================================================
# 兼容旧版任务（保留向后兼容）
# ============================================================================

@app.task(name="apps.requirements.extract_requirements_task", bind=True)
def extract_requirements_task(self, task_id: int, tender_file_id: int, options: dict):
    """条款抽取异步任务（旧版，保留向后兼容）。

    Args:
        task_id: AsyncTask ID
        tender_file_id: TenderFile ID
        options: 抽取参数
            - mode: 抽取模式 (rule/llm/hybrid)
            - force: 是否强制重新抽取
            - model_config_id: 模型配置 ID
            - prompt_version_id: 提示词版本 ID
    """
    # 转换为新的抽取类型
    mode = options.get("mode", "hybrid")
    force = options.get("force", False)

    # 根据模式确定抽取类型
    if mode == "rule":
        # 规则模式：只抽取明确类型
        extraction_types = ["mandatory"]
    else:
        # LLM/hybrid 模式：抽取所有类型
        extraction_types = ["scoring", "mandatory", "qualification", "commercial", "technical", "submission"]

    # 构建新的选项
    new_options = {
        "extraction_types": extraction_types,
        "overwrite": force,
        "model_config_id": options.get("model_config_id"),
        "prompt_version_id": options.get("prompt_version_id"),
    }

    # 直接执行抽取逻辑（不通过 Celery 任务调用）
    task = AsyncTask.objects.get(pk=task_id)
    tender_file = TenderFile.objects.get(pk=tender_file_id)

    try:
        # 更新任务状态
        task.status = AsyncTask.STATUS_RUNNING
        task.progress = 5
        task.current_step = "初始化"
        task.started_at = timezone.now()
        task.save(update_fields=["status", "progress", "current_step", "started_at"])

        # 创建进度回调
        progress_callback = ProgressCallback(task)

        # 执行抽取
        service = RequirementExtractService()
        result = service.extract_requirements(
            tender_file_id=tender_file_id,
            extraction_types=new_options["extraction_types"],
            created_by=task.created_by,
            overwrite=new_options["overwrite"],
            prompt_version_id=new_options.get("prompt_version_id"),
            model_config_id=new_options.get("model_config_id"),
            progress_callback=progress_callback,
        )

        # 更新任务成功状态
        task.status = AsyncTask.STATUS_SUCCESS
        task.progress = 100
        if result["failed_types"]:
            task.current_step = f"部分完成，成功 {result['success_count']} 条，失败类型: {result['failed_types']}"
        else:
            task.current_step = f"抽取完成，共 {result['total_count']} 条条款"
        task.result_payload = {
            "run_id": result["run_id"],
            "total_count": result["total_count"],
            "success_count": result["success_count"],
            "failed_types": result["failed_types"],
            "requirement_ids": result["requirement_ids"][:100],
        }
        task.finished_at = timezone.now()
        task.save()

        # 更新文件状态
        tender_file.status = TenderFile.STATUS_REQUIREMENT_EXTRACTED
        tender_file.save(update_fields=["status", "updated_at"])

        logger.info(
            "Requirement extraction completed: task_id=%s, run_id=%s, total=%d",
            task_id,
            result["run_id"],
            result["total_count"],
        )

    except RequirementExtractionError as exc:
        logger.error(
            "Requirement extraction failed: task_id=%s, error=%s",
            task_id,
            str(exc),
        )
        _mark_task_failed(task, str(exc))

    except Exception as exc:
        logger.exception(
            "Requirement extraction unexpected error: task_id=%s",
            task_id,
        )
        _mark_task_failed(task, f"{type(exc).__name__}: {exc}")
        raise


def _mark_task_failed(task: AsyncTask, error_message: str):
    """标记任务失败。"""
    task.status = AsyncTask.STATUS_FAILED
    task.error_message = error_message[:512]
    task.finished_at = timezone.now()
    task.save(update_fields=["status", "error_message", "finished_at"])


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
