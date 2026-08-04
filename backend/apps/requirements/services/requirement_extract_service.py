# backend/apps/requirements/services/requirement_extract_service.py
"""条款抽取服务门面（薄层）。

所有业务逻辑已拆分到 services/extraction/ 包（阶段化编排）：
- ExtractionOrchestrator：校验 → 准备（上下文一次构建）→ 抽取 → 汇总 → 收尾
- SingleTypeExtractor：单场景 AI 调用/重试/解析/过滤/落库

本文件保留旧类名与私有方法签名，兼容既有调用方与测试；
新增代码请直接使用 extraction 包，不要再往本文件堆逻辑。
"""

import logging
from typing import Callable

from apps.generation.models import PromptRun
from apps.tender.models import TenderFile, TenderChunk

from .extraction import (
    MAX_AI_ATTEMPTS,  # noqa: F401 (re-export, 兼容旧引用)
    ExtractionOrchestrator,
    RequirementExtractionError,  # noqa: F401 (re-export)
    detect_output_mode,  # noqa: F401 (re-export)
    parse_page_range,  # noqa: F401 (re-export)
)
from .extraction.context import (
    build_chunk_context,
    chunk_context_budget,
    get_model_config,
)
from .extraction.filter import MisclassificationFilter
from .extraction.output_parser import (
    group_to_item,
    validate_requirement_type,
)
from .extraction.single_type import SingleTypeExtractor
from .extraction.writer import RequirementWriter

logger = logging.getLogger(__name__)

__all__ = [
    "RequirementExtractService",
    "RequirementExtractionError",
    "MAX_AI_ATTEMPTS",
    "detect_output_mode",
    "parse_page_range",
]


class RequirementExtractService:
    """条款抽取服务（门面，委托 ExtractionOrchestrator 执行）。"""

    def __init__(self):
        self.orchestrator = ExtractionOrchestrator()
        self.ai_task_service = self.orchestrator.ai_task_service
        self.document_text_service = self.orchestrator.context_builder.document_text_service

    def extract_requirements(
        self,
        tender_file_id: int,
        extraction_types: list[str],
        created_by,
        overwrite: bool = False,
        prompt_version_id: int | None = None,
        model_config_id: int | None = None,
        progress_callback: Callable[[int, str], None] | None = None,
        extraction_run_id: int | None = None,
    ) -> dict:
        """执行条款抽取（多场景），返回与旧版一致的聚合结果 dict。"""
        return self.orchestrator.run(
            tender_file_id=tender_file_id,
            extraction_types=extraction_types,
            created_by=created_by,
            overwrite=overwrite,
            prompt_version_id=prompt_version_id,
            model_config_id=model_config_id,
            extraction_run_id=extraction_run_id,
            progress_callback=progress_callback,
        )

    # ------------------------------------------------------------------
    # 以下私有方法为旧调用方/测试兼容委托（行为与原实现一致）
    # ------------------------------------------------------------------

    def _extract_single_type(
        self,
        extraction_type: str,
        document_text: str,
        tender_file: TenderFile,
        extraction_run,
        created_by,
        prompt_version_id: int | None,
        model_config_id: int | None,
    ) -> dict:
        model_config = self._get_model_config(model_config_id)
        chunk_context = self._build_chunk_context(
            tender_file,
            chunk_context_budget(model_config),
        )
        extractor = SingleTypeExtractor(self.ai_task_service)
        return extractor.extract(
            extraction_type=extraction_type,
            document_text=document_text,
            chunk_context=chunk_context,
            tender_file=tender_file,
            extraction_run=extraction_run,
            created_by=created_by,
            prompt_version_id=prompt_version_id,
            model_config_id=model_config_id,
        )

    def _group_to_item(self, group: dict, extraction_type: str) -> dict:
        return group_to_item(group, extraction_type)

    def _filter_misclassified(
        self,
        items: list[dict],
        extraction_type: str,
        tender_file: TenderFile,
    ) -> list[dict]:
        return MisclassificationFilter().apply(items, extraction_type, tender_file)

    def _create_requirement(
        self,
        item: dict,
        tender_file: TenderFile,
        extraction_run,
        prompt_run: PromptRun,
        extraction_type: str,
        created_by,
    ):
        return RequirementWriter().create(
            item=item,
            tender_file=tender_file,
            extraction_run=extraction_run,
            prompt_run=prompt_run,
            extraction_type=extraction_type,
            created_by=created_by,
        )

    def _validate_tender_file(self, tender_file_id: int) -> TenderFile:
        return self.orchestrator._validate_tender_file(tender_file_id)

    def _validate_extraction_types(self, extraction_types: list[str]) -> list[str]:
        return self.orchestrator._validate_extraction_types(extraction_types)

    def _get_model_config(self, model_config_id: int | None):
        return get_model_config(model_config_id)

    def _build_chunk_context(self, tender_file: TenderFile, max_context_length: int) -> str:
        return build_chunk_context(tender_file, max_context_length)

    def _validate_requirement_type(self, raw_type: str, extraction_type: str) -> str:
        return validate_requirement_type(raw_type, extraction_type)

    def _get_prompt_version_info(self, prompt_run: PromptRun) -> dict:
        return {
            "template_id": prompt_run.prompt_template_id,
            "version_id": prompt_run.prompt_version_id,
            "version": prompt_run.prompt_version.version if prompt_run.prompt_version else "",
        }
