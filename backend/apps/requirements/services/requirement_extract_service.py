# backend/apps/requirements/services/requirement_extract_service.py
"""条款抽取服务。"""

import logging
from typing import Any

from django.db import transaction

from apps.generation.constants import PromptRunStatus, PromptScenario
from apps.generation.services.ai_task_execution_service import (
    AiTaskExecutionService,
    PromptVersionNotFoundError,
    AiTaskExecutionError,
)
from apps.requirements.models import TenderRequirement
from apps.requirements.services.candidate_selector import CandidateSelector
from apps.requirements.services.requirement_mapper import RequirementMapper
from apps.requirements.services.requirement_key import generate_requirement_key
from apps.tender.constants import ExtractionMethod
from apps.tender.models import TenderFile, ParsedDocument


logger = logging.getLogger(__name__)


class RequirementExtractionError(Exception):
    """条款抽取错误。"""
    pass


class RequirementExtractService:
    """条款抽取服务。

    从招标文件的 TenderChunk 中抽取结构化 TenderRequirement。
    """

    def __init__(self):
        self.ai_task_service = AiTaskExecutionService()
        self.candidate_selector = CandidateSelector()
        self.mapper = RequirementMapper()

    def extract_requirements(
        self,
        tender_file_id: int,
        created_by,
        mode: str = "hybrid",
        prompt_version_id: int | None = None,
        model_config_id: int | None = None,
        rag_options: dict | None = None,
        force: bool = False,
    ) -> dict:
        """执行条款抽取。

        Args:
            tender_file_id: 招标文件 ID
            created_by: 创建人用户实例
            mode: 抽取模式（rule / llm / hybrid）
            prompt_version_id: 指定提示词版本（可选）
            model_config_id: 指定模型配置（可选）
            rag_options: RAG 配置（可选）
            force: 是否强制重新抽取（清理旧数据）

        Returns:
            {
                "total_count": int,
                "created_count": int,
                "updated_count": int,
                "requirement_ids": list[int],
                "prompt_run_ids": list[int],
            }

        Raises:
            RequirementExtractionError: 抽取失败
        """
        # 1. 校验文件状态
        tender_file, parsed_doc = self._validate_tender_file(tender_file_id)

        # 2. force=true 时清理旧数据
        if force:
            self._clear_existing_requirements(tender_file, parsed_doc)

        # 3. 获取候选分块
        candidates = self.candidate_selector.select_candidates(
            parsed_document_id=parsed_doc.id,
            mode=mode,
        )

        if not candidates:
            logger.info(f"No candidate chunks found for tender_file={tender_file_id}")
            return {
                "total_count": 0,
                "created_count": 0,
                "updated_count": 0,
                "requirement_ids": [],
                "prompt_run_ids": [],
            }

        # 4. 执行抽取
        extraction_method = self._get_extraction_method(mode)
        results = {
            "total_count": 0,
            "created_count": 0,
            "updated_count": 0,
            "requirement_ids": [],
            "prompt_run_ids": [],
        }

        for chunk in candidates:
            try:
                chunk_results = self._extract_from_chunk(
                    chunk=chunk,
                    tender_file=tender_file,
                    parsed_doc=parsed_doc,
                    created_by=created_by,
                    mode=mode,
                    extraction_method=extraction_method,
                    prompt_version_id=prompt_version_id,
                    model_config_id=model_config_id,
                    rag_options=rag_options,
                )
                results["total_count"] += chunk_results["count"]
                results["created_count"] += chunk_results["created"]
                results["updated_count"] += chunk_results["updated"]
                results["requirement_ids"].extend(chunk_results["ids"])
                if chunk_results.get("prompt_run_id"):
                    results["prompt_run_ids"].append(chunk_results["prompt_run_id"])
            except Exception as e:
                logger.exception(f"Failed to extract from chunk={chunk.id}: {e}")
                continue

        return results

    def _validate_tender_file(self, tender_file_id: int) -> tuple[TenderFile, ParsedDocument]:
        """校验招标文件状态。"""
        tender_file = TenderFile.objects.get(pk=tender_file_id)

        # 检查文件状态
        if tender_file.status not in ["parsed", "chunked", "completed"]:
            raise RequirementExtractionError(
                f"文件状态为 {tender_file.status}，需要先完成解析"
            )

        # 获取活跃的解析文档
        parsed_doc = ParsedDocument.objects.filter(
            tender_file=tender_file,
            is_active=True,
        ).first()

        if not parsed_doc:
            raise RequirementExtractionError("文件尚未完成解析，无法提取条款")

        return tender_file, parsed_doc

    def _clear_existing_requirements(
        self,
        tender_file: TenderFile,
        parsed_doc: ParsedDocument,
    ) -> int:
        """清理旧的抽取结果（保留 manual 条款）。"""
        deleted, _ = TenderRequirement.objects.filter(
            tender_file=tender_file,
            parsed_document=parsed_doc,
            extraction_method__in=[
                ExtractionMethod.RULE,
                ExtractionMethod.LLM,
                ExtractionMethod.HYBRID,
            ],
        ).delete()
        logger.info(f"Cleared {deleted} existing requirements (force=True)")
        return deleted

    def _get_extraction_method(self, mode: str) -> str:
        """获取抽取方法标识。"""
        if mode == "rule":
            return ExtractionMethod.RULE
        elif mode == "llm":
            return ExtractionMethod.LLM
        else:
            return ExtractionMethod.HYBRID

    def _extract_from_chunk(
        self,
        chunk,
        tender_file: TenderFile,
        parsed_doc: ParsedDocument,
        created_by,
        mode: str,
        extraction_method: str,
        prompt_version_id: int | None,
        model_config_id: int | None,
        rag_options: dict | None,
    ) -> dict:
        """从单个分块抽取条款。"""
        results = {
            "count": 0,
            "created": 0,
            "updated": 0,
            "ids": [],
            "prompt_run_id": None,
        }

        # 规则模式：直接从 chunk 映射
        if mode == "rule":
            requirement = self._map_chunk_to_requirement(
                chunk=chunk,
                tender_file=tender_file,
                parsed_doc=parsed_doc,
                created_by=created_by,
            )
            if requirement:
                self._save_requirement(requirement)
                results["count"] = 1
                results["created"] = 1
                results["ids"].append(requirement.id)
            return results

        # LLM / hybrid 模式：调用 AI 服务
        variables = self._prepare_variables(chunk, tender_file, parsed_doc)

        try:
            prompt_run = self.ai_task_service.execute(
                scenario=PromptScenario.REQUIREMENT_EXTRACTION,
                variables=variables,
                created_by=created_by,
                prompt_version_id=prompt_version_id,
                model_config_id=model_config_id,
                rag_options=rag_options,
                source="requirement_extraction",
                business_context={
                    "tender_file_id": tender_file.id,
                    "parsed_document_id": parsed_doc.id,
                },
            )
            results["prompt_run_id"] = prompt_run.id

            if prompt_run.status != PromptRunStatus.SUCCEEDED:
                logger.warning(
                    f"PromptRun {prompt_run.id} failed: {prompt_run.error_message}"
                )
                return results

            # 解析输出
            output = prompt_run.output_json or {}
            requirements_data = output.get("requirements", [])

            for item in requirements_data:
                requirement = self.mapper.map_to_requirement(
                    llm_output=item,
                    tender_file_id=tender_file.id,
                    parsed_document_id=parsed_doc.id,
                    source_chunk_id=chunk.id,
                    prompt_version_id=prompt_run.prompt_version_id,
                    prompt_run_id=prompt_run.id,
                    extraction_method=extraction_method,
                    source_chunk_data={
                        "page_start": chunk.page_start,
                        "page_end": chunk.page_end,
                        "section_path": chunk.section_path,
                        "chunk_index": chunk.chunk_index,
                        "content_hash": chunk.content_hash,
                    },
                )
                requirement.created_by = created_by

                saved, is_created = self._save_requirement(requirement)
                if saved:
                    results["count"] += 1
                    if is_created:
                        results["created"] += 1
                    else:
                        results["updated"] += 1
                    results["ids"].append(saved.id)

        except PromptVersionNotFoundError as e:
            logger.error(f"PromptVersion not found: {e}")
            raise RequirementExtractionError(str(e))
        except AiTaskExecutionError as e:
            logger.error(f"AI task execution failed: {e}")
            raise RequirementExtractionError(str(e))

        return results

    def _map_chunk_to_requirement(
        self,
        chunk,
        tender_file: TenderFile,
        parsed_doc: ParsedDocument,
        created_by,
    ) -> TenderRequirement | None:
        """直接从 chunk 映射为 requirement（规则模式）。"""
        if not chunk.content.strip():
            return None

        requirement_key = generate_requirement_key(
            tender_file.id,
            chunk.id,
            chunk.chunk_type,
            chunk.content,
        )

        return TenderRequirement(
            tender_file=tender_file,
            parsed_document=parsed_doc,
            source_chunk=chunk,
            requirement_key=requirement_key,
            requirement_no=chunk.clause_no or "",
            requirement_type=self._map_chunk_type_to_requirement_type(chunk.chunk_type),
            content=chunk.content,
            title=chunk.section_title or "",
            summary="",
            mandatory_level="mandatory" if chunk.is_mandatory else "optional",
            risk_level="unknown",
            response_needed=True,
            evidence_needed=False,
            extraction_method=ExtractionMethod.RULE,
            source_page_start=chunk.page_start,
            source_page_end=chunk.page_end,
            source_section_path=chunk.section_path,
            source_chunk_index=chunk.chunk_index,
            source_content_hash=chunk.content_hash,
            created_by=created_by,
        )

    def _map_chunk_type_to_requirement_type(self, chunk_type: str) -> str:
        """映射分块类型到条款类型。"""
        mapping = {
            "qualification": "qualification",
            "scoring": "scoring",
            "tech_req": "tech_req",
            "commercial": "commercial",
            "legal": "legal",
            "submission": "submission",
            "clarification": "clarification",
            "schedule": "schedule",
            "general": "other",
        }
        return mapping.get(chunk_type, "other")

    def _prepare_variables(
        self,
        chunk,
        tender_file: TenderFile,
        parsed_doc: ParsedDocument,
    ) -> dict:
        """准备 LLM 输入变量。"""
        return {
            "tender_file_name": tender_file.original_name,
            "chunk_type": chunk.chunk_type,
            "section_path": chunk.section_path,
            "page_start": chunk.page_start,
            "page_end": chunk.page_end,
            "chunk_content": chunk.content,
            "requirement_type_options": [
                "qualification",
                "tech_req",
                "scoring",
                "commercial",
                "legal",
                "submission",
                "schedule",
                "material",
                "format",
                "clarification",
                "other",
            ],
        }

    def _save_requirement(self, requirement: TenderRequirement) -> tuple[TenderRequirement | None, bool]:
        """保存条款（幂等更新）。

        Returns:
            (saved_requirement, is_created)
        """
        existing = TenderRequirement.objects.filter(
            tender_file_id=requirement.tender_file_id,
            requirement_key=requirement.requirement_key,
        ).first()

        if existing:
            # 更新现有记录
            existing.requirement_type = requirement.requirement_type
            existing.title = requirement.title
            existing.content = requirement.content
            existing.summary = requirement.summary
            existing.mandatory_level = requirement.mandatory_level
            existing.risk_level = requirement.risk_level
            existing.response_needed = requirement.response_needed
            existing.evidence_needed = requirement.evidence_needed
            existing.amount_info = requirement.amount_info
            existing.deadline_info = requirement.deadline_info
            existing.score_info = requirement.score_info
            existing.evidence_types = requirement.evidence_types
            existing.raw_extracted = requirement.raw_extracted
            existing.extraction_method = requirement.extraction_method
            existing.confidence = requirement.confidence
            existing.prompt_version = requirement.prompt_version
            existing.source_prompt_run = requirement.source_prompt_run
            existing.updated_by = requirement.created_by
            existing.save()
            return existing, False
        else:
            requirement.save()
            return requirement, True
