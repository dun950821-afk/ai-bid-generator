"""条款落库：构建 TenderRequirement 并幂等写入。"""

from apps.requirements.models import TenderRequirement
from apps.requirements.services.requirement_key import generate_requirement_key
from apps.tender.constants import ExtractionMethod

from .output_parser import parse_page_range, validate_requirement_type


class RequirementWriter:
    """单条条款落库（幂等：requirement_key 存在则更新，否则创建）。"""

    def create(
        self,
        *,
        item: dict,
        tender_file,
        extraction_run,
        prompt_run,
        extraction_type: str,
        created_by,
    ) -> TenderRequirement | None:
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

        existing = TenderRequirement.objects.filter(
            tender_file=tender_file,
            requirement_key=requirement_key,
        ).first()

        raw_type = item.get("requirement_type", "")
        requirement_type = validate_requirement_type(raw_type, extraction_type)
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
            for key, value in requirement_data.items():
                setattr(existing, key, value)
            existing.updated_by = created_by
            existing.save()
            return existing

        requirement = TenderRequirement(
            tender_file=tender_file,
            requirement_key=requirement_key,
            **requirement_data,
        )
        requirement.save()
        return requirement
