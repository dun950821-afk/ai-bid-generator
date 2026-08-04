"""抽取编排器：阶段化流程（校验 → 准备 → 并行抽取 → 汇总 → 收尾）。

阶段职责：
1. validate   - 校验文件/抽取类型
2. prepare    - 复用/创建 ExtractionRun、读全文、构建共享上下文（一次）
3. extract    - ThreadPoolExecutor 并行抽取各场景（reporter 线程唯一写进度）
4. aggregate  - 按请求顺序聚合结果
5. finalize   - 写 Run 终态（FAILED/PARTIAL_SUCCESS/SUCCESS+empty）

线程模型：
- worker 线程只调 AI + 写各自场景的条款数据（requirement_key 含类型前缀，跨场景不冲突）
- 进度零并发写：worker 更新内存 ProgressTracker（加锁），reporter 线程
  定期读快照并经 progress_callback 写 DB —— 唯一 DB 写者
"""

import logging
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

from django.utils import timezone

from apps.generation.services.ai_task_execution_service import AiTaskExecutionService
from apps.requirements.constants import (
    TYPE_TO_SCENARIO,
    ExtractionRunStatus,
)
from apps.requirements.models import RequirementExtractionRun, TenderRequirement
from apps.requirements.services.document_text_service import DocumentTextService
from apps.tender.models import TenderFile

from .context import ExtractionContextBuilder
from .errors import RequirementExtractionError
from .progress import ProgressTracker
from .single_type import SingleTypeExtractor

logger = logging.getLogger(__name__)

# 场景并发上限（DeepSeek 并行调用数）
MAX_PARALLEL_WORKERS = 6
# reporter 进度写库间隔（秒）
PROGRESS_REPORT_INTERVAL = 1.0


class ExtractionOrchestrator:
    """条款抽取编排：主线程跑阶段，worker 线程并行抽取各场景。"""

    def __init__(
        self,
        ai_task_service: AiTaskExecutionService | None = None,
        context_builder: ExtractionContextBuilder | None = None,
    ):
        self.ai_task_service = ai_task_service or AiTaskExecutionService()
        self.context_builder = context_builder or ExtractionContextBuilder(
            document_text_service=DocumentTextService()
        )

    def run(
        self,
        *,
        tender_file_id: int,
        extraction_types: list[str],
        created_by,
        overwrite: bool = False,
        prompt_version_id: int | None = None,
        model_config_id: int | None = None,
        extraction_run_id: int | None = None,
        progress_callback=None,
    ) -> dict:
        """执行条款抽取，返回 {run_id, total_count, success_count, failed_types, requirement_ids, prompt_versions}。

        Args:
            extraction_run_id: 由 API 层预创建的运行记录 ID（复用，不新建）。
        """
        # ---- 1. validate ----
        tender_file = self._validate_tender_file(tender_file_id)
        if progress_callback:
            progress_callback(5, "验证文件状态")

        valid_types = self._validate_extraction_types(extraction_types)

        # ---- 2. prepare ----
        if overwrite:
            deleted_count, _ = TenderRequirement.objects.filter(
                tender_file=tender_file
            ).delete()
            logger.info(
                "Overwrite mode: deleted %s existing requirements for tender_file=%s",
                deleted_count, tender_file_id,
            )
            if progress_callback:
                progress_callback(8, f"已清理 {deleted_count} 条旧条款")

        extraction_run = self._prepare_run(
            tender_file=tender_file,
            valid_types=valid_types,
            overwrite=overwrite,
            created_by=created_by,
            extraction_run_id=extraction_run_id,
        )
        if progress_callback:
            progress_callback(10, "获取文档全文")

        try:
            context = self.context_builder.build(tender_file, model_config_id)
        except Exception as e:
            self._fail_run(extraction_run, f"获取文档全文失败: {e}")
            raise RequirementExtractionError(f"获取文档全文失败: {e}")

        if progress_callback:
            progress_callback(15, "开始抽取条款")

        extraction_run.status = ExtractionRunStatus.RUNNING
        extraction_run.started_at = timezone.now()
        extraction_run.save(update_fields=["status", "started_at"])

        # ---- 3. extract（并行 6 场景）----
        results = {
            "run_id": extraction_run.id,
            "total_count": 0,
            "success_count": 0,
            "failed_types": [],
            "requirement_ids": [],
            "prompt_versions": {},
        }

        type_results = self._extract_parallel(
            valid_types=valid_types,
            context=context,
            tender_file=tender_file,
            extraction_run=extraction_run,
            created_by=created_by,
            prompt_version_id=prompt_version_id,
            model_config_id=model_config_id,
            progress_callback=progress_callback,
        )

        # ---- 4. aggregate（按请求顺序聚合）----
        for extraction_type in valid_types:
            type_result, error = type_results.get(extraction_type, (None, None))
            if error is not None or type_result is None:
                results["failed_types"].append(extraction_type)
                continue
            results["total_count"] += type_result["count"]
            results["success_count"] += type_result["count"]
            results["requirement_ids"].extend(type_result["ids"])
            results["prompt_versions"][extraction_type] = type_result["prompt_version"]

        # ---- 5. finalize ----
        self._finalize_run(extraction_run, results)

        if progress_callback:
            progress_callback(95, "写入结果")

        return results

    def _extract_parallel(
        self,
        *,
        valid_types: list[str],
        context,
        tender_file: TenderFile,
        extraction_run,
        created_by,
        prompt_version_id: int | None,
        model_config_id: int | None,
        progress_callback=None,
    ) -> dict:
        """并行抽取各场景，返回 {type: (type_result, error)}。

        异常完全隔离在 worker 内，单场景失败只影响该场景。
        """
        tracker = ProgressTracker(len(valid_types))
        results: dict[str, tuple] = {}

        def worker(extraction_type: str):
            tracker.mark_started(extraction_type)
            try:
                type_result = self._extract_one(
                    extraction_type=extraction_type,
                    context=context,
                    tender_file=tender_file,
                    extraction_run=extraction_run,
                    created_by=created_by,
                    prompt_version_id=prompt_version_id,
                    model_config_id=model_config_id,
                )
                tracker.mark_finished(extraction_type, ok=True)
                return extraction_type, type_result, None
            except Exception as e:
                logger.exception(
                    "Failed to extract type=%s for tender_file=%s: %s",
                    extraction_type, tender_file.id, e,
                )
                tracker.mark_finished(extraction_type, ok=False, message=str(e))
                return extraction_type, None, e

        max_workers = min(len(valid_types), MAX_PARALLEL_WORKERS)

        # reporter：唯一写进度的线程（读内存快照 → progress_callback 写库）
        stop_event = threading.Event()

        def report_once():
            snap = tracker.snapshot()
            progress = 16 + int(snap["completed"] / len(valid_types) * 74)
            progress_callback(min(progress, 90), snap["step"])

        def reporter():
            while not stop_event.wait(PROGRESS_REPORT_INTERVAL):
                report_once()
            # 退出前补发最终快照（场景可能极快完成，周期内未上报）
            report_once()

        reporter_thread = None
        if progress_callback:
            reporter_thread = threading.Thread(target=reporter, daemon=True)
            reporter_thread.start()

        try:
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                futures = {
                    executor.submit(worker, t): t for t in valid_types
                }
                for future in as_completed(futures):
                    extraction_type, type_result, error = future.result()
                    results[extraction_type] = (type_result, error)
        finally:
            stop_event.set()
            if reporter_thread is not None:
                reporter_thread.join(timeout=PROGRESS_REPORT_INTERVAL * 2)

        return results

    def _extract_one(
        self,
        *,
        extraction_type: str,
        context,
        tender_file: TenderFile,
        extraction_run,
        created_by,
        prompt_version_id: int | None,
        model_config_id: int | None,
    ) -> dict:
        extractor = SingleTypeExtractor(self.ai_task_service)
        return extractor.extract(
            extraction_type=extraction_type,
            document_text=context.document_text,
            chunk_context=context.chunk_context,
            tender_file=tender_file,
            extraction_run=extraction_run,
            created_by=created_by,
            prompt_version_id=prompt_version_id,
            model_config_id=model_config_id,
        )

    # ------------------------------------------------------------------
    # 阶段辅助
    # ------------------------------------------------------------------

    def _prepare_run(
        self,
        *,
        tender_file,
        valid_types: list[str],
        overwrite: bool,
        created_by,
        extraction_run_id: int | None,
    ) -> RequirementExtractionRun:
        """复用 API 层预建的运行记录（修复双 Run bug），否则新建。"""
        if extraction_run_id:
            extraction_run = RequirementExtractionRun.objects.filter(
                pk=extraction_run_id, tender_file=tender_file
            ).first()
            if extraction_run:
                extraction_run.status = ExtractionRunStatus.PENDING
                extraction_run.extraction_types = valid_types
                extraction_run.overwrite = overwrite
                extraction_run.save(update_fields=["status", "extraction_types", "overwrite"])
                return extraction_run
        return RequirementExtractionRun.objects.create(
            tender_file=tender_file,
            project=tender_file.project,
            status=ExtractionRunStatus.PENDING,
            extraction_types=valid_types,
            overwrite=overwrite,
            created_by=created_by,
        )

    def _finalize_run(self, extraction_run, results: dict) -> None:
        extraction_run.total_count = results["total_count"]
        extraction_run.success_count = results["success_count"]
        extraction_run.failed_types = results["failed_types"]
        extraction_run.prompt_versions = results["prompt_versions"]

        if results["failed_types"] and results["total_count"] == 0:
            extraction_run.status = ExtractionRunStatus.FAILED
            extraction_run.error_message = f"所有抽取类型失败: {results['failed_types']}"
        elif results["failed_types"]:
            extraction_run.status = ExtractionRunStatus.PARTIAL_SUCCESS
        elif results["total_count"] == 0:
            # 所有类型都成功执行但都没抽到条款：技术成功但业务结果为空，
            # 标记 SUCCESS 并写入提示，上层 task 会把 TenderFile 标记为
            # STATUS_REQUIREMENT_EXTRACTED_EMPTY 以便前端警告用户。
            extraction_run.status = ExtractionRunStatus.SUCCESS
            extraction_run.error_message = "未抽取到任何条款"
        else:
            extraction_run.status = ExtractionRunStatus.SUCCESS

        extraction_run.finished_at = timezone.now()
        extraction_run.save()

    def _fail_run(self, extraction_run, message: str) -> None:
        extraction_run.status = ExtractionRunStatus.FAILED
        extraction_run.error_message = message[:512]
        extraction_run.finished_at = timezone.now()
        extraction_run.save()

    def _validate_tender_file(self, tender_file_id: int) -> TenderFile:
        """校验招标文件状态：只要求上传完成，不依赖解析分块流程。"""
        tender_file = TenderFile.objects.get(pk=tender_file_id)
        invalid_statuses = [
            TenderFile.STATUS_UPLOADING,
            TenderFile.STATUS_REJECTED,
            TenderFile.STATUS_UPLOAD_EXPIRED,
        ]
        if tender_file.status in invalid_statuses:
            raise RequirementExtractionError(
                f"文件状态为 {tender_file.get_status_display()}，请先完成上传"
            )
        return tender_file

    def _validate_extraction_types(self, extraction_types: list[str]) -> list[str]:
        valid_types = []
        for t in extraction_types:
            if t in TYPE_TO_SCENARIO:
                valid_types.append(t)
            else:
                logger.warning(f"Unknown extraction type: {t}, skipping")
        if not valid_types:
            raise RequirementExtractionError("没有有效的抽取类型")
        return valid_types
