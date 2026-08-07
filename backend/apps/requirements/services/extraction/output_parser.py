"""LLM 输出结构识别与评分大类映射（纯函数，无 DB 依赖）。"""

import json
import re
from typing import Any

PAGE_RANGE_PATTERN = re.compile(
    r"(?:P|第)?\s*(\d+)\s*(?:页)?"
    r"(?:\s*[-—~～至]\s*(?:P|第)?\s*(\d+)\s*(?:页)?)?",
    re.IGNORECASE,
)

VALID_REQUIREMENT_TYPES = {
    "qualification", "tech_req", "scoring", "commercial",
    "legal", "submission", "schedule", "material",
    "format", "clarification", "other"
}

EXTRACTION_TYPE_TO_REQUIREMENT_TYPE = {
    "scoring": "scoring",
    "mandatory": "legal",  # 强制条款通常涉及法律/合规
    "qualification": "qualification",
    "commercial": "commercial",
    "technical": "tech_req",
    "submission": "submission",
}


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


def salvage_items_from_output(output: Any) -> list[dict]:
    """从结构无法识别的输出中抢救条目，兜底进「其他」分类（尽力而为）。

    - dict 有 list 值：扁平化所有 list 值作为条目
    - dict 无 list 值：整体当作一条
    - 空 dict / 空 list：无可抢救内容 -> []
    - 非 dict/list（字符串/数字）：原样包裹成一条
    """
    if isinstance(output, list):
        raw_items = output
    elif isinstance(output, dict) and output:
        list_vals = [v for v in output.values() if isinstance(v, list)]
        raw_items = [it for lst in list_vals for it in lst] if list_vals else [output]
    elif isinstance(output, dict):
        return []
    else:
        raw_items = [output]

    items = []
    for raw in raw_items:
        item = _normalize_salvage_item(raw)
        if item:
            items.append(item)
    return items


def _normalize_salvage_item(raw: Any) -> dict | None:
    """把抢救条目规范成 items 结构；提取不到任何内容时返回 None。"""
    if isinstance(raw, dict) and not raw:
        return None
    if not isinstance(raw, dict):
        raw = {"content": str(raw)}

    title = next((str(v) for k in ("title", "标题", "name", "名称") if (v := raw.get(k))), "")
    content = next(
        (str(v) for k in ("content", "内容", "value", "要求", "description", "描述", "text")
         if (v := raw.get(k))),
        "",
    )
    if not content:
        dumped = json.dumps(raw, ensure_ascii=False)
        if not dumped or dumped in ("{}", "[]"):
            return None
        content = dumped
    return {
        "title": title[:255],
        "content": content[:2000],
        "requirement_type": "other",
        "source_text": next(
            (str(v) for k in ("source_text", "evidence") if (v := raw.get(k))), ""
        )[:2000],
        "source_section": next(
            (str(v) for k in ("source", "source_section") if (v := raw.get(k))), ""
        )[:500],
        "source_page": raw.get("source_page"),
    }


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


def validate_requirement_type(raw_type: str, extraction_type: str) -> str:
    """验证并返回有效的 requirement_type。

    如果 LLM 输出的类型无效，则从 extraction_type 映射。
    """
    if raw_type and raw_type in VALID_REQUIREMENT_TYPES:
        return raw_type
    return EXTRACTION_TYPE_TO_REQUIREMENT_TYPE.get(extraction_type, "other")


def group_to_item(group: dict, extraction_type: str) -> dict:
    """将评分大类（groups[]）映射为扁平条款项（items[]）。

    大类 content 由描述 + 细项证据拼装；raw_group 保留原始结构，
    score 相关字段全部透传，便于落库。
    """
    requirement_type = validate_requirement_type(
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
