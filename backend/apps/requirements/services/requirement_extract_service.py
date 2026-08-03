# backend/apps/requirements/services/requirement_extract_service.py
"""条款抽取服务（独立于 TenderChunk）。

直接从文档全文提取条款，支持多种抽取类型，每种类型使用独立的 PromptScenario。
"""

import json
import logging
from typing import Any, Callable

from django.db import transaction
from django.utils import timezone

from apps.generation.constants import PromptRunStatus
from apps.generation.models import PromptRun
from apps.generation.services.ai_task_execution_service import (
    AiTaskExecutionService,
    PromptVersionNotFoundError,
    AiTaskExecutionError,
)
from apps.requirements.constants import (
    TYPE_TO_SCENARIO,
    EXTRACTION_TYPE_NAMES,
    ExtractionRunStatus,
)
from apps.requirements.models import TenderRequirement, RequirementExtractionRun
from apps.requirements.services.document_text_service import DocumentTextService
from apps.requirements.services.requirement_key import generate_requirement_key
from apps.tender.constants import ExtractionMethod
from apps.tender.models import TenderFile, TenderChunk

logger = logging.getLogger(__name__)


class RequirementExtractionError(Exception):
    """条款抽取错误。"""
    pass


class RequirementExtractService:
    """条款抽取服务（新版）。

    直接从文档全文提取条款，不依赖 TenderChunk。
    支持多种抽取类型：scoring, mandatory, qualification, commercial, technical, submission。
    """

    def __init__(self):
        self.ai_task_service = AiTaskExecutionService()
        self.document_text_service = DocumentTextService()

    def extract_requirements(
        self,
        tender_file_id: int,
        extraction_types: list[str],
        created_by,
        overwrite: bool = False,
        prompt_version_id: int | None = None,
        model_config_id: int | None = None,
        progress_callback: Callable[[int, str], None] | None = None,
    ) -> dict:
        """执行条款抽取（多轮）。

        Args:
            tender_file_id: 招标文件 ID
            extraction_types: 抽取类型列表，如 ["scoring", "mandatory", "qualification"]
            created_by: 创建人用户实例
            overwrite: 是否覆盖已有条款
            prompt_version_id: 指定提示词版本（可选）
            model_config_id: 指定模型配置（可选）
            progress_callback: 进度回调函数 (progress: int, step: str)

        Returns:
            {
                "run_id": int,
                "total_count": int,
                "success_count": int,
                "failed_types": list[str],
                "requirement_ids": list[int],
            }

        Raises:
            RequirementExtractionError: 抽取失败
        """
        # 1. 校验文件
        tender_file = self._validate_tender_file(tender_file_id)
        if progress_callback:
            progress_callback(5, "验证文件状态")

        # 2. 校验抽取类型
        valid_types = self._validate_extraction_types(extraction_types)

        # 2.5 overwrite=True 时全删旧条款
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

        # 3. 创建抽取运行记录
        extraction_run = RequirementExtractionRun.objects.create(
            tender_file=tender_file,
            project=tender_file.project,
            status=ExtractionRunStatus.PENDING,
            extraction_types=valid_types,
            overwrite=overwrite,
            created_by=created_by,
        )
        if progress_callback:
            progress_callback(10, "获取文档全文")

        # 4. 获取文档全文
        try:
            document_text = self.document_text_service.get_document_text(tender_file)
        except Exception as e:
            extraction_run.status = ExtractionRunStatus.FAILED
            extraction_run.error_message = f"获取文档全文失败: {e}"
            extraction_run.finished_at = timezone.now()
            extraction_run.save()
            raise RequirementExtractionError(f"获取文档全文失败: {e}")

        if progress_callback:
            progress_callback(15, "开始多轮抽取")

        # 5. 更新运行状态
        extraction_run.status = ExtractionRunStatus.RUNNING
        extraction_run.started_at = timezone.now()
        extraction_run.save()

        # 6. 执行多轮抽取
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
                type_result = self._extract_single_type(
                    extraction_type=extraction_type,
                    document_text=document_text,
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

        # 7. 更新运行结果
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

        if progress_callback:
            progress_callback(95, "写入结果")

        return results

    def _validate_tender_file(self, tender_file_id: int) -> TenderFile:
        """校验招标文件状态。

        只需要文件已上传完成，不需要解析/分块状态。
        条款抽取独立于解析分块流程，直接从原始文件提取文本。
        """
        tender_file = TenderFile.objects.get(pk=tender_file_id)

        # 只检查文件是否上传完成（排除上传中、拒绝、过期状态）
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
        """校验并返回有效的抽取类型。"""
        valid_types = []
        for t in extraction_types:
            if t in TYPE_TO_SCENARIO:
                valid_types.append(t)
            else:
                logger.warning(f"Unknown extraction type: {t}, skipping")
        if not valid_types:
            raise RequirementExtractionError("没有有效的抽取类型")
        return valid_types

    def _extract_single_type(
        self,
        extraction_type: str,
        document_text: str,
        tender_file: TenderFile,
        extraction_run: RequirementExtractionRun,
        created_by,
        prompt_version_id: int | None,
        model_config_id: int | None,
    ) -> dict:
        """执行单类型抽取。"""
        scenario = TYPE_TO_SCENARIO[extraction_type]

        # 获取模型配置（用于 context_length）
        model_config = self._get_model_config(model_config_id)

        # 构建解析分块上下文（辅助参考）
        max_context_chars = int(model_config.context_length * 0.5) if model_config and model_config.context_length else 64000
        chunk_context = self._build_chunk_context(tender_file, max_context_chars)

        # 准备输入变量
        variables = {
            "document_text": document_text,
            "chunk_context": chunk_context,
            "extraction_type": extraction_type,
            "extraction_type_name": EXTRACTION_TYPE_NAMES.get(extraction_type, extraction_type),
        }

        # 调用 AI 服务
        # 注意：不传递 prompt_version_id，让 AI 服务根据 scenario 自动查找 published 版本
        try:
            prompt_run = self.ai_task_service.execute(
                scenario=scenario,
                variables=variables,
                created_by=created_by,
                prompt_version_id=None,  # 自动查找场景对应的 published 版本
                model_config_id=model_config_id,
                source="requirement_extraction_v2",
                business_context={
                    "tender_file_id": tender_file.id,
                    "project_id": tender_file.project_id,
                },
            )
        except PromptVersionNotFoundError as e:
            logger.error(f"PromptVersion not found for scenario={scenario}: {e}")
            raise RequirementExtractionError(f"未找到提示词版本: {scenario}")
        except AiTaskExecutionError as e:
            logger.error(f"AI task execution failed: {e}")
            raise RequirementExtractionError(f"AI 调用失败: {e}")

        # 检查结果状态
        if prompt_run.status != PromptRunStatus.SUCCEEDED:
            raise RequirementExtractionError(
                f"AI 调用未成功: {prompt_run.error_message}"
            )

        # 解析输出（支持数组格式和 {items: [...]} 格式）
        output = prompt_run.output_json or {}
        if isinstance(output, list):
            # 直接是数组格式
            items = output
        else:
            # {items: [...]} 格式
            items = output.get("items", [])

        if not items:
            logger.info(f"No items extracted for type={extraction_type}")
            return {
                "count": 0,
                "ids": [],
                "prompt_version": self._get_prompt_version_info(prompt_run),
            }

        # 保存条款
        requirement_ids = []
        with transaction.atomic():
            for item in items:
                requirement = self._create_requirement(
                    item=item,
                    tender_file=tender_file,
                    extraction_run=extraction_run,
                    prompt_run=prompt_run,
                    extraction_type=extraction_type,
                    created_by=created_by,
                )
                if requirement:
                    requirement_ids.append(requirement.id)

        return {
            "count": len(requirement_ids),
            "ids": requirement_ids,
            "prompt_version": self._get_prompt_version_info(prompt_run),
        }

    def _create_requirement(
        self,
        item: dict,
        tender_file: TenderFile,
        extraction_run: RequirementExtractionRun,
        prompt_run: PromptRun,
        extraction_type: str,
        created_by,
    ) -> TenderRequirement | None:
        """创建单条条款。"""
        # 生成唯一键
        title = (item.get("title", "") or "").strip()[:255]
        content = item.get("content", "")
        if not content:
            return None

        # fallback 加固：LLM 未返回 title 时，用 content 前 10 字 + "…" 兜底
        if not title:
            title = content[:10].strip()
            if len(content) > 10:
                title = title + "…"

        requirement_key = generate_requirement_key(
            tender_file.id,
            extraction_type,
            title,
        )

        # 检查是否已存在
        existing = TenderRequirement.objects.filter(
            tender_file=tender_file,
            requirement_key=requirement_key,
        ).first()

        # 提取字段
        # requirement_type: 从 LLM 输出获取，验证后使用
        raw_type = item.get("requirement_type", "")
        requirement_type = self._validate_requirement_type(raw_type, extraction_type)
        is_mandatory = item.get("is_mandatory", False)
        is_rejection_clause = item.get("is_rejection_clause", False)
        score = item.get("score")
        confidence = item.get("confidence")
        source_text = item.get("source_text", "")[:2000]
        source_section = item.get("source_section", "")[:500]
        source_page = item.get("source_page")

        # 构建条款数据
        requirement_data = {
            "requirement_type": requirement_type,
            "title": title,
            "content": content,
            "mandatory_level": "mandatory" if (is_mandatory or is_rejection_clause) else "optional",
            "risk_level": "high" if is_rejection_clause else ("medium" if is_mandatory else "unknown"),
            "score_info": {"score": score} if score is not None else {},
            "source_section_path": (source_section or "")[:512],
            "source_page_start": source_page,
            "extraction_type": extraction_type,
            "extraction_method": ExtractionMethod.LLM,
            "extraction_run": extraction_run,
            "prompt_version": prompt_run.prompt_version,
            "source_prompt_run": prompt_run,
            "prompt_template_id": prompt_run.prompt_template_id,
            "prompt_version_str": prompt_run.prompt_version.version if prompt_run.prompt_version else "",
            "llm_model": prompt_run.model_config.display_name if prompt_run.model_config else "",
            "source_text": source_text,
            "source_section": source_section,
            "source_page": source_page,
            "raw_llm_item": item,
            "confidence": confidence,
            "created_by": created_by,
        }

        if existing:
            # 更新现有记录
            for key, value in requirement_data.items():
                setattr(existing, key, value)
            existing.updated_by = created_by
            existing.save()
            return existing
        else:
            # 创建新记录
            requirement = TenderRequirement(
                tender_file=tender_file,
                requirement_key=requirement_key,
                **requirement_data,
            )
            requirement.save()
            return requirement

    def _get_model_config(self, model_config_id: int | None):
        """获取模型配置。优先用指定 ID，否则用默认 chat 模型。"""
        from apps.generation.models import ModelConfig
        if model_config_id:
            mc = ModelConfig.objects.filter(pk=model_config_id, is_active=True).first()
            if mc:
                return mc
        return ModelConfig.objects.filter(is_active=True, is_default=True, model_type="chat").first()

    def _build_chunk_context(self, tender_file: TenderFile, max_context_length: int) -> str:
        """构建解析分块上下文字符串。

        Args:
            tender_file: 招标文件实例
            max_context_length: 最大字符数上限

        Returns:
            拼接好的分块上下文字符串；无分块时返回空字符串
        """
        chunks = (
            TenderChunk.objects
            .filter(
                parsed_document__tender_file=tender_file,
                parsed_document__is_active=True,
            )
            .exclude(content="")
            .order_by("page_start", "section_path", "id")
        )

        if not chunks.exists():
            return ""

        parts = []
        current_length = 0
        total_count = chunks.count()
        for idx, chunk in enumerate(chunks, 1):
            page_info = ""
            if chunk.page_start is not None and chunk.page_end is not None:
                page_info = f"{chunk.page_start}-{chunk.page_end}"
            elif chunk.page_start is not None:
                page_info = str(chunk.page_start)

            block = (
                f"=== 分块 #{idx} ===\n"
                f"类型: {chunk.chunk_type}\n"
                f"章节路径: {chunk.section_path or '(无)'}\n"
                f"页码: {page_info or '(无)'}\n"
                f"内容:\n{chunk.content}\n"
            )
            if current_length + len(block) > max_context_length:
                parts.append(f"\n[注: 已截断，剩余 {total_count - idx + 1} 个分块未显示]")
                break
            parts.append(block)
            current_length += len(block)

        return "\n".join(parts)

    def _validate_requirement_type(self, raw_type: str, extraction_type: str) -> str:
        """验证并返回有效的 requirement_type。

        如果 LLM 输出的类型无效，则从 extraction_type 映射。
        """
        # 有效的 requirement_type 列表
        VALID_TYPES = {
            "qualification", "tech_req", "scoring", "commercial",
            "legal", "submission", "schedule", "material",
            "format", "clarification", "other"
        }

        # 如果 LLM 输出的类型有效，直接使用
        if raw_type and raw_type in VALID_TYPES:
            return raw_type

        # 否则从 extraction_type 映射
        TYPE_MAPPING = {
            "scoring": "scoring",
            "mandatory": "legal",  # 强制条款通常涉及法律/合规
            "qualification": "qualification",
            "commercial": "commercial",
            "technical": "tech_req",
            "submission": "submission",
        }
        return TYPE_MAPPING.get(extraction_type, "other")

    def _get_prompt_version_info(self, prompt_run: PromptRun) -> dict:
        """获取提示词版本信息。"""
        return {
            "template_id": prompt_run.prompt_template_id,
            "version_id": prompt_run.prompt_version_id,
            "version": prompt_run.prompt_version.version if prompt_run.prompt_version else "",
        }
