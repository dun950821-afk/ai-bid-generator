# backend/apps/outline/services/section_prompt_variables.py
"""正文生成提示词变量构建（单章 / 批量共用，唯一来源）。

历史问题：单章（generate_section_task）与批量（_execute_single_section_generation）
两条路径各自手拼 section_variables，导致 knowledge_contents 被硬编码为空、
RAG 素材与公司信息实际不进提示词。本模块收拢变量拼装，两处只允许调用这里。
"""

import logging
from typing import Any

from django.conf import settings

from apps.outline.models import Section

logger = logging.getLogger(__name__)

# 进 prompt 的 RAG 素材预算（防超长 prompt / token 浪费），可在 settings 覆盖
RAG_MAX_ITEMS = getattr(settings, "SECTION_PROMPT_RAG_MAX_ITEMS", 8)
RAG_MAX_CHARS_PER_ITEM = getattr(settings, "SECTION_PROMPT_RAG_MAX_CHARS_PER_ITEM", 800)
RAG_MAX_TOTAL_CHARS = getattr(settings, "SECTION_PROMPT_RAG_MAX_TOTAL_CHARS", 6000)

CHANNEL_NAMES = {
    "historical_bid": "历史标书",
    "company_info": "公司信息",
    "personnel": "人员资料",
    "certificate": "资质证书",
    "project_case": "项目业绩",
}

_COMPANY_FIELDS = [
    ("name", "公司名称"),
    ("unified_social_credit_code", "统一社会信用代码"),
    ("legal_representative", "法定代表人"),
    ("registered_capital", "注册资本"),
    ("registered_address", "注册地址"),
    ("official_phone", "联系电话"),
    ("contact_person", "联系人"),
    ("bank_name", "开户银行"),
    ("bank_account", "银行账号"),
]


def build_knowledge_contents(rag_materials: dict[str, list]) -> list[str]:
    """把策略裁剪后的 rag_materials 展开为模板的 knowledge_contents 变量。

    按通道顺序、通道内 rank 顺序截取，受条数 / 单条长度 / 总量三重预算约束。
    """
    items: list[str] = []
    total_chars = 0
    for channel, materials in rag_materials.items():
        channel_name = CHANNEL_NAMES.get(channel, channel)
        for material in materials:
            if len(items) >= RAG_MAX_ITEMS or total_chars >= RAG_MAX_TOTAL_CHARS:
                return items
            content = (material.get("content") or "").strip()
            if not content:
                continue
            content = content[:RAG_MAX_CHARS_PER_ITEM]
            item = f"【{channel_name}】{material.get('title', '')}\n{content}"
            items.append(item)
            total_chars += len(item)
    return items


def build_company_info(company_context: dict[str, Any]) -> str:
    """公司上下文的 company 快照 → 公司信息文本（无材料包时为空串）。"""
    company = (company_context or {}).get("company") or {}
    lines = [
        f"{label}：{company[key]}"
        for key, label in _COMPANY_FIELDS
        if company.get(key)
    ]
    return "\n".join(lines)


def build_material_notes(company_context: dict[str, Any]) -> str:
    """公司上下文 → 材料清单与占位符输出规则文本。

    注意：占位符字面量 {{ material:usage_key }} 只需在变量值中出现，
    禁止写进 Jinja 模板本体（会被当作模板表达式解析）。
    """
    context = company_context or {}
    if not context.get("available"):
        return ""

    parts = []

    available = context.get("available_materials") or []
    if available:
        lines = []
        for mat in available:
            status_text = "可用" if mat.get("available") else "已过期"
            lines.append(f"- {mat.get('title') or mat.get('usage_key')} [{status_text}]")
            if mat.get("certificate_no"):
                lines.append(f"  证书编号：{mat['certificate_no']}")
            if mat.get("valid_to"):
                lines.append(f"  有效期至：{mat['valid_to']}")
            if mat.get("insert_mode") in ("image_inline", "image_attachment"):
                usage_key = mat.get("usage_key")
                lines.append("  输出占位符：{{ material:" + str(usage_key) + " }}")
        parts.append("可用材料：\n" + "\n".join(lines))

    missing = context.get("missing_materials") or []
    if missing:
        lines = [
            f"- {m.get('description') or m.get('usage_key')}（缺失）"
            for m in missing
        ]
        parts.append("缺失材料：\n" + "\n".join(lines))

    if available or missing:
        parts.append(
            "材料输出要求：\n"
            "1. 不要编造公司名称、统一社会信用代码、法定代表人等信息\n"
            "2. 缺少信息时标注「待补充」或使用占位符\n"
            "3. 图片材料使用 {{ material:usage_key }} 占位符，后端会自动插入\n"
            "4. 不要描述图片内容或编造证照信息"
        )

    return "\n\n".join(parts)


def build_section_variables(
    section: Section,
    prepared: dict[str, Any],
    user_prompt: str,
) -> dict[str, Any]:
    """构建正文生成模板的完整变量字典（单章 / 批量共用）。

    Args:
        section: 章节实例（需已含最新的 content_plan，调用方负责刷新）
        prepared: SectionGenerationService.prepare_generation_context 的产物
        user_prompt: 用户补充要求
    """
    from apps.outline.services.generation_quality_service import (
        get_expected_word_range,
    )
    from apps.outline.services.section_generation_service import (
        SectionGenerationService,
    )

    content_matrix = prepared.get("content_matrix") or {}
    generation_mode = prepared.get("generation_mode", "leaf_content")
    content_structure_policy = prepared.get("content_structure_policy")
    company_context = prepared.get("company_context") or {}
    table_needed = bool((section.content_plan or {}).get("table", {}).get("needed"))

    variables: dict[str, Any] = {
        "current_section": prepared.get("section_info") or {},
        "content_matrix": content_matrix,
        "generation_mode": generation_mode,
        "global_forbidden_rules": prepared.get("global_forbidden_rules", ""),
        "strict_generation_rules": prepared.get("strict_generation_rules", ""),
        "analysis_points": prepared.get("analysis_points") or {},
        "writing_template": prepared.get("writing_template") or {},
        "rag_materials": prepared.get("rag_materials") or {},
        "context_sections": prepared.get("context_sections") or {},
        "outline_structure": prepared.get("outline_structure", ""),
        "project_info": prepared.get("project_info") or {},
        "user_prompt": user_prompt,
        "prompt_context": prepared.get("prompt_context", ""),
        "content_plan": section.content_plan or {},
        "selected_facts": SectionGenerationService().resolve_selected_facts(section),
        # 模板 RAG 入口：由策略裁剪后的 rag_materials 转换（此前被硬编码为空）
        "knowledge_contents": build_knowledge_contents(
            prepared.get("rag_materials") or {}
        ),
        # 投标主体（公司）信息与材料占位符规则
        "company_info": build_company_info(company_context),
        "material_notes": build_material_notes(company_context),
        "table_allowed_instruction": (
            "可以使用 Markdown 段落、列表和表格；表格必须服务于内容表达，不要为了形式硬插。"
            if table_needed
            else "只能使用 Markdown 段落、普通列表和加粗引导语，严禁输出 Markdown 表格或 HTML 表格。"
        ),
        "table_cell_instruction": (
            "表格单元格内如有多项内容，优先使用编号、顿号、分号或短句，不要使用 HTML <br> 标签。"
            if table_needed
            else "如需表达多项参数、职责、流程或措施，请改用分段文字或普通列表，不要用表格模拟。"
        ),
    }

    # 注入字数预期（模板有 {% if %} 守卫，取不到区间则不传这两个 key）
    word_range = get_expected_word_range(
        generation_mode,
        writing_depth=content_matrix.get("writing_depth", "moderate"),
        content_structure_policy=content_structure_policy,
    )
    if word_range:
        # 规则：target_words 取区间下限 min（保底字数），max_words 取区间上限 max
        variables["target_words"] = word_range["min"]
        variables["max_words"] = word_range["max"]

    return variables
