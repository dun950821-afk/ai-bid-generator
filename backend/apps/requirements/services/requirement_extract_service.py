# backend/apps/requirements/services/requirement_extract_service.py
"""条款抽取服务（独立于 TenderChunk）。

直接从文档全文提取条款，支持多种抽取类型，每种类型使用独立的 PromptScenario。
"""

import json
import logging
import re
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
    TECHNICAL_HARD_FILTER_TITLES,
    TECHNICAL_SUSPECT_KEYWORDS,
    SCORING_HARD_FILTER_TITLES,
)
from apps.requirements.models import (
    TenderRequirement,
    RequirementExtractionRun,
    RequirementFilterLog,
)
from apps.requirements.services.document_text_service import DocumentTextService
from apps.requirements.services.requirement_key import generate_requirement_key
from apps.tender.constants import ExtractionMethod
from apps.tender.models import TenderFile, TenderChunk

logger = logging.getLogger(__name__)


# 模型偶发返回空结构/调用失败时的最大尝试次数（首次 + 重试）
MAX_AI_ATTEMPTS = 2


class RequirementExtractionError(Exception):
    """条款抽取错误。"""
    pass


# ============================================================================
# 模块级工具：页码解析 / LLM 输出结构识别
# ============================================================================

PAGE_RANGE_PATTERN = re.compile(
    r"(?:P|第)?\s*(\d+)\s*(?:页)?"
    r"(?:\s*[-—~～至]\s*(?:P|第)?\s*(\d+)\s*(?:页)?)?",
    re.IGNORECASE,
)


def detect_output_mode(payload: Any) -> str:
    """识别 LLM 输出结构：groups（评分大类）/ items（扁平条款）/ unknown。"""
    if isinstance(payload, list):
        return "items"
    if isinstance(payload, dict):
        if isinstance(payload.get("groups"), list):
            return "groups"
        if isinstance(payload.get("items"), list):
            return "items"
    return "unknown"


def parse_page_range(source_page: Any) -> tuple[int | None, int | None]:
    """解析页码为 (start, end)。

    支持 P22 / P22-P23 / 第22页 / 22-23 / P22～P23 等格式；
    "P22、P24" 是两个离散页，只取首个作为 start（end 为 None）。
    """
    if source_page is None:
        return None, None
    if isinstance(source_page, int):
        return source_page, None
    text = str(source_page).strip()
    if not text:
        return None, None
    m = PAGE_RANGE_PATTERN.search(text)
    if not m:
        return None, None
    start = int(m.group(1))
    end = int(m.group(2)) if m.group(2) else None
    if end is not None and end < start:
        end = None
    return start, end


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
        # 生产实测模型偶发返回空结构 {}（约 1/4 任务出现），解析失败后自动重试一次
        prompt_run = None
        last_error = None
        for attempt in range(MAX_AI_ATTEMPTS):
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
                logger.warning(
                    "AI task execution failed (attempt=%s): %s", attempt + 1, e
                )
                last_error = RequirementExtractionError(f"AI 调用失败: {e}")
                continue

            if prompt_run.status != PromptRunStatus.SUCCEEDED:
                last_error = RequirementExtractionError(
                    f"AI 调用未成功: {prompt_run.error_message}"
                )
                continue

            # 解析输出（兼容三结构：groups 评分大类 / items 扁平条款 / 数组）
            # 注意：空数组 [] 是合法的"无条款"响应，不能用 or {} 转成空 dict
            output = prompt_run.output_json
            if output is None:
                output = {}
            mode = detect_output_mode(output)
            if mode != "unknown":
                break  # 结构合法，跳出重试循环

            # 输出结构异常（空 dict/缺 items 键等）视为模型响应失败而非"没有条款"：
            # 正常"无内容"应输出 {"items": []}，会命中 items 分支走 count=0 成功路径
            summary = json.dumps(output, ensure_ascii=False)[:200]
            last_error = RequirementExtractionError(
                f"AI 输出结构无法识别（type={extraction_type}）: {summary or '(空输出)'}"
            )
            logger.warning(
                "Unrecognized AI output (attempt=%s) type=%s: %s",
                attempt + 1, extraction_type, summary or "(空输出)",
            )
        else:
            # 重试全部失败
            raise last_error or RequirementExtractionError("AI 调用失败")

        if mode == "groups":
            items = [
                self._group_to_item(g, extraction_type)
                for g in output["groups"]
            ]
        elif mode == "items":
            items = output["items"] if isinstance(output, dict) else output

        # 误分类三级过滤：hard 直接丢弃并记日志，suspected 保留并软标记
        items = self._filter_misclassified(
            items,
            extraction_type=extraction_type,
            tender_file=tender_file,
        )

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

    def _group_to_item(self, group: dict, extraction_type: str) -> dict:
        """将评分大类（groups[]）映射为扁平条款项（items[]）。

        大类 content 由描述 + 细项证据拼装；raw_group 保留原始结构，
        score 相关字段全部透传，便于 _create_requirement 落库。
        """
        # groups 输出不含 requirement_type 字段时（如 technical 提示词），
        # 从 extraction_type 映射，避免 technical 大类全部落进 scoring
        requirement_type = self._validate_requirement_type(
            group.get("requirement_type"), extraction_type
        )
        title = (group.get("title") or "").strip()
        description = group.get("description") or ""
        detail_points = group.get("detail_points") or []
        if not title:
            title = (description or "")[:10].strip()

        content_parts = [description]
        for dp in detail_points:
            point_text = f"- {dp.get('title') or ''}: {dp.get('requirement') or ''}"
            evidence = dp.get("evidence") or ""
            if evidence:
                point_text += f"（依据：{evidence}）"
            if point_text.strip("-: "):
                content_parts.append(point_text)
        content = "\n".join(p for p in content_parts if p)

        return {
            "title": title,
            "content": content,
            "requirement_type": requirement_type,
            "score": group.get("score"),
            "score_text": group.get("score_text"),
            "score_basis": group.get("score_basis"),
            "calculation_note": group.get("calculation_note"),
            "score_status": group.get("score_status"),
            "classification_reason": group.get("classification_reason"),
            "source_text": group.get("evidence") or group.get("source_text") or "",
            "source_section": group.get("source") or group.get("source_section") or "",
            "source_page": group.get("source_page"),
            "confidence": group.get("confidence"),
            "detail_points": detail_points,
            "raw_group": group,
        }

    def _filter_misclassified(
        self,
        items: list[dict],
        extraction_type: str,
        tender_file: TenderFile,
    ) -> list[dict]:
        """误分类三级过滤。

        一级（hard）：标题精确命中关键词 -> 直接丢弃并记日志；
        二级（suspected）：内容命中关键词 -> 保留并软标记 + 记日志；
        三级：其余情况信任原文评分分类结构。
        """
        kept = []
        for item in items:
            title = (item.get("title") or "").strip()
            content = item.get("content") or ""
            filter_level = None
            matched_keyword = ""
            reason = ""

            if extraction_type == "technical":
                if title in TECHNICAL_HARD_FILTER_TITLES:
                    filter_level = RequirementFilterLog.LEVEL_HARD
                    matched_keyword = title
                    reason = "技术标目录场景：标题命中硬过滤清单"
                else:
                    hit = next(
                        (kw for kw in TECHNICAL_SUSPECT_KEYWORDS if kw in content),
                        None,
                    )
                    if hit:
                        filter_level = RequirementFilterLog.LEVEL_SUSPECTED
                        matched_keyword = hit
                        reason = "技术标目录场景：内容命中疑似关键词，软标记待人工复核"
            elif extraction_type == "scoring":
                # 仅无分值的项才可能丢弃；有分值的评分项必须保留
                score_is_null = (
                    item.get("score") is None
                    or item.get("score_status") == "not_applicable"
                )
                if title in SCORING_HARD_FILTER_TITLES and score_is_null:
                    filter_level = RequirementFilterLog.LEVEL_HARD
                    matched_keyword = title
                    reason = "评分场景：无分值且标题命中硬过滤清单"

            if filter_level is None:
                kept.append(item)
                continue

            self._log_filter(
                tender_file=tender_file,
                extraction_type=extraction_type,
                item=item,
                filter_level=filter_level,
                matched_keyword=matched_keyword,
                filter_reason=reason,
            )
            if filter_level == RequirementFilterLog.LEVEL_HARD:
                logger.info(
                    "Hard-filtered item type=%s title=%s keyword=%s",
                    extraction_type, title, matched_keyword,
                )
                continue

            item["filter_status"] = "suspected"
            item["filter_reason"] = reason
            kept.append(item)
        return kept

    def _log_filter(
        self,
        tender_file: TenderFile,
        extraction_type: str,
        item: dict,
        filter_level: str,
        matched_keyword: str,
        filter_reason: str,
    ) -> None:
        """写入误分类过滤日志。"""
        RequirementFilterLog.objects.create(
            tender_file=tender_file,
            extraction_type=extraction_type,
            title=(item.get("title") or "")[:255],
            matched_keyword=matched_keyword[:100],
            filter_level=filter_level,
            filter_reason=filter_reason[:255],
            raw_llm_item=item,
        )

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
        # 3.1 合同法律场景输出 mandatory_level（mandatory/general），兼容 3.0 的 is_mandatory
        is_mandatory = is_mandatory or item.get("mandatory_level") == "mandatory"
        is_rejection_clause = item.get("is_rejection_clause", False)
        score = item.get("score")
        # 模型偶发输出字符串置信度（如 "high"），FloatField 落库会抛错，
        # 非数字一律视为缺失，避免单条脏数据拖垮整个场景
        confidence = item.get("confidence")
        if not isinstance(confidence, (int, float)) or isinstance(confidence, bool):
            confidence = None
        source_text = item.get("source_text", "")[:2000]
        source_section = item.get("source_section", "")[:500]
        source_page_start, source_page_end = parse_page_range(item.get("source_page"))

        # score_info：分值 + score_status 枚举 + 分值来源说明
        score_info: dict = {}
        if score is not None:
            score_info["score"] = score
        if item.get("score_status"):
            score_info["score_status"] = item["score_status"]
        for key in ("score_text", "score_basis", "calculation_note"):
            if item.get(key):
                score_info[key] = item[key]

        # 一致性检查：大类分值 vs 细项合计，只标记不覆盖
        detail_points = item.get("detail_points") or []
        if score is not None and detail_points:
            try:
                total = sum(float(dp.get("score") or 0) for dp in detail_points)
                if abs(float(score) - total) > 0.01:
                    score_info["consistency_review"] = True
                    score_info["consistency_note"] = (
                        f"大类分值 {score} 与细项合计 {total} 不一致，待人工确认"
                    )
            except (TypeError, ValueError):
                pass

        # 构建条款数据
        requirement_data = {
            "requirement_type": requirement_type,
            "title": title,
            "content": content,
            "mandatory_level": "mandatory" if (is_mandatory or is_rejection_clause) else "optional",
            "risk_level": "high" if is_rejection_clause else ("medium" if is_mandatory else "unknown"),
            "score_info": score_info,
            "source_section_path": (source_section or "")[:512],
            "source_page_start": source_page_start,
            "source_page_end": source_page_end,
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
            "source_page": source_page_start,
            "raw_llm_item": item.get("raw_group", item),
            "detail_points": item.get("detail_points") or [],
            "classification_reason": (item.get("classification_reason") or "")[:1000],
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
