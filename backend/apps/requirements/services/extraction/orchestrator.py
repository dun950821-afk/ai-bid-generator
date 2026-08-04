"""抽取编排器：阶段化流程（校验 → 准备 → 抽取 → 汇总 → 收尾）。

阶段职责：
1. validate   - 校验文件/抽取类型
2. prepare    - 复用/创建 ExtractionRun、读全文、构建共享上下文（一次）
3. extract    - 按场景抽取（当前串行；并行见 Step 3）
4. aggregate  - 按请求顺序聚合结果
5. finalize   - 写 Run 终态（FAILED/PARTIAL_SUCCESS/SUCCESS+empty）
"""

import logging

from django.utils import timezone

from apps.generation.services.ai_task_execution_service import AiTaskExecutionService
from apps.requirements.constants import (
    EXTRACTION_TYPE_NAMES,
    TYPE_TO_SCENARIO,
    ExtractionRunStatus,
)
from apps.requirements.models import RequirementExtractionRun, TenderRequirement
from apps.requirements.services.document_text_service import DocumentTextService
from apps.tender.models import TenderFile

from .context import ExtractionContextBuilder
from .errors import RequirementExtractionError
from .single_type import SingleTypeExtractor

logger = logging.getLogger(__name__)


class ExtractionOrchestrator:
    """条款抽取编排：所有阶段在主线程串行执行。

    状态写入（ExtractionRun / 进度）只发生在本类所在线程，
    并发 worker（见 Step 3）只写各自场景的条款数据。
    """

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

        # ---- 3. extract（当前串行）----
        results = {
            "run_id": extraction_run.id,
            "total_count": 0,
            "success_count": 0,
            "failed_types": [],
            "requirement_ids": [],
            "prompt_versions": {},
        }

        total_types = len(valid_types)
        for idx, extraction_type in enumerate(valid_types):
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
                results["total_count"] += type_result["count"]
                results["success_count"] += type_result["count"]
                results["requirement_ids"].extend(type_result["ids"])
                results["prompt_versions"][extraction_type] = type_result["prompt_version"]

                if progress_callback and total_types > 0:
                    progress = 20 + int((idx + 1) / total_types * 70)
                    progress_callback(
                        min(progress, 90),
                        f"抽取 {EXTRACTION_TYPE_NAMES.get(extraction_type, extraction_type)} 完成",
                    )

            except Exception as e:
                logger.exception(
                    f"Failed to extract type={extraction_type} for tender_file={tender_file_id}: {e}"
                )
                results["failed_types"].append(extraction_type)

        # ---- 4/5. aggregate + finalize ----
        self._finalize_run(extraction_run, results)

        if progress_callback:
            progress_callback(95, "写入结果")

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
