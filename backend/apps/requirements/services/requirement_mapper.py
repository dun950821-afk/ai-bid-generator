# backend/apps/requirements/services/requirement_mapper.py
"""LLM 输出映射器。"""

from apps.requirements.models import TenderRequirement
from apps.requirements.services.requirement_key import generate_requirement_key
from apps.tender.constants import (
    RequirementType,
    MandatoryLevel,
    RiskLevel,
    ResponseStrategy,
    OwnerRole,
    ExtractionMethod,
)


class RequirementMapper:
    """LLM 输出映射器。

    将 LLM 输出的 JSON 映射为 TenderRequirement 字段。
    """

    def map_to_requirement(
        self,
        llm_output: dict,
        tender_file_id: int,
        parsed_document_id: int,
        source_chunk_id: int | None,
        prompt_version_id: int | None,
        prompt_run_id: int | None,
        extraction_method: str = ExtractionMethod.HYBRID,
        source_chunk_data: dict | None = None,
    ) -> TenderRequirement:
        """映射 LLM 输出为 TenderRequirement。

        Args:
            llm_output: LLM 输出的单条条款 JSON
            tender_file_id: 招标文件 ID
            parsed_document_id: 解析文档 ID
            source_chunk_id: 来源分块 ID
            prompt_version_id: 提示词版本 ID
            prompt_run_id: AI 运行记录 ID
            extraction_method: 抽取方式
            source_chunk_data: 来源分块数据（用于冗余保存）

        Returns:
            TenderRequirement 实例（未保存）
        """
        requirement_type = self._normalize_requirement_type(
            llm_output.get("requirement_type", "")
        )
        content = llm_output.get("content", "")
        requirement_key = generate_requirement_key(
            tender_file_id,
            source_chunk_id,
            requirement_type,
            content,
        )

        requirement = TenderRequirement(
            tender_file_id=tender_file_id,
            parsed_document_id=parsed_document_id,
            source_chunk_id=source_chunk_id,
            prompt_version_id=prompt_version_id,
            source_prompt_run_id=prompt_run_id,
            requirement_key=requirement_key,
            requirement_no=llm_output.get("requirement_no", ""),
            requirement_type=requirement_type,
            title=llm_output.get("title", ""),
            content=content,
            summary=llm_output.get("summary", ""),
            mandatory_level=self._normalize_mandatory_level(
                llm_output.get("mandatory_level", "")
            ),
            risk_level=self._normalize_risk_level(
                llm_output.get("risk_level", "")
            ),
            response_needed=llm_output.get("response_needed", True),
            evidence_needed=llm_output.get("evidence_needed", False),
            amount_info=llm_output.get("amount_info", {}),
            deadline_info=llm_output.get("deadline_info", {}),
            score_info=llm_output.get("score_info", {}),
            evidence_types=llm_output.get("evidence_types", []),
            raw_extracted=llm_output,
            extraction_method=extraction_method,
            confidence=llm_output.get("confidence"),
        )

        # 冗余保存来源分块数据
        if source_chunk_data:
            requirement.source_page_start = source_chunk_data.get("page_start")
            requirement.source_page_end = source_chunk_data.get("page_end")
            requirement.source_section_path = source_chunk_data.get("section_path", "")
            requirement.source_chunk_index = source_chunk_data.get("chunk_index")
            requirement.source_content_hash = source_chunk_data.get("content_hash", "")

        return requirement

    def _normalize_requirement_type(self, value: str) -> str:
        """标准化条款类型。"""
        valid_types = [
            RequirementType.QUALIFICATION,
            RequirementType.TECH_REQ,
            RequirementType.SCORING,
            RequirementType.COMMERCIAL,
            RequirementType.LEGAL,
            RequirementType.SUBMISSION,
            RequirementType.SCHEDULE,
            RequirementType.MATERIAL,
            RequirementType.FORMAT,
            RequirementType.CLARIFICATION,
            RequirementType.OTHER,
        ]
        if value in valid_types:
            return value
        return RequirementType.OTHER

    def _normalize_mandatory_level(self, value: str) -> str:
        """标准化强制程度。"""
        valid_levels = [
            MandatoryLevel.MANDATORY,
            MandatoryLevel.IMPORTANT,
            MandatoryLevel.OPTIONAL,
            MandatoryLevel.UNKNOWN,
        ]
        if value in valid_levels:
            return value
        return MandatoryLevel.UNKNOWN

    def _normalize_risk_level(self, value: str) -> str:
        """标准化风险等级。"""
        valid_levels = [
            RiskLevel.HIGH,
            RiskLevel.MEDIUM,
            RiskLevel.LOW,
            RiskLevel.UNKNOWN,
        ]
        if value in valid_levels:
            return value
        return RiskLevel.UNKNOWN