# backend/apps/outline/services/generation_context_service.py
"""正文生成上下文构建服务。"""

import logging
from typing import Any

from django.db.models import Q

from apps.outline.models import Section
from apps.outline.services.requirement_match_service import RequirementMatchService
from apps.outline.services.section_tree_service import SectionTreeService

logger = logging.getLogger(__name__)


# ==============================================================================
# 严格生成模式定义
# ==============================================================================

# 严格模式禁止词映射
STRICT_MODE_FORBIDDEN_TERMS = {
    "strict_qualification": [
        "技术参数",
        "系统兼容性",
        "数据处理能力",
        "吞吐量",
        "TPS",
        "响应时间",
        "安全性要求",
        "国密算法",
        "等保",
        "扩展性",
        "接口标准",
        "部署方式",
        "可用性",
        "服务响应",
        "企业相关案例",
        "案例一",
        "案例二",
        "案例三",
        "业主单位",
        "合同金额",
        "项目时间",
        "项目概述",
        "项目成果",
        "客户满意度",
        "实施方案",
        "运维服务",
        "智慧政务",
        "智能交通",
    ],
    "strict_table": [
        "案例一",
        "案例二",
        "案例三",
        "技术参数",
        "系统架构",
        "实施方案",
        "项目业绩",
    ],
    "strict_commitment": [
        "案例一",
        "案例二",
        "技术参数",
        "项目业绩",
        "合同金额",
    ],
}


def get_generation_mode(section: Section, matrix: dict | None = None) -> str:
    """根据内容责任矩阵判断正文生成模式。

    Args:
        section: 章节实例
        matrix: 内容责任矩阵（可选，默认从 section.content_matrix 获取）

    Returns:
        生成模式字符串：
        - "strict_qualification": 严格资格证明模式
        - "strict_table": 严格表格模式
        - "strict_commitment": 严格承诺函模式
        - "strict_attachment_index": 严格附件索引模式
        - "strict_resume": 严格简历表模式
        - "normal": 普通模式
    """
    if matrix is None:
        matrix = section.content_matrix or {}

    role = matrix.get("section_role", "")
    expression_form = matrix.get("expression_form", "body_text")
    title = section.title or ""

    # 1. 资格证明 / 证书 / 营业执照 / 法人证书
    if role == "qualification":
        return "strict_qualification"

    # 2. 表格类章节
    if expression_form == "table":
        # 进一步区分表格类型
        if any(k in title for k in ["营业执照", "法人证书", "资格证明", "证书", "基本信息"]):
            return "strict_qualification"
        if any(k in title for k in ["人员", "简历"]):
            return "strict_resume"
        return "strict_table"

    # 3. 承诺函
    if expression_form == "commitment_letter":
        return "strict_commitment"

    # 4. 附件索引
    if expression_form == "attachment_index":
        return "strict_attachment_index"

    # 5. 简历表
    if expression_form == "resume_table":
        return "strict_resume"

    # 6. 标题兜底判断
    strict_keywords = [
        "营业执照",
        "法人证书",
        "资格证明",
        "证书",
        "承诺函",
        "偏离表",
        "索引表",
        "基本信息表",
    ]
    if any(k in title for k in strict_keywords):
        return "strict_table"

    return "normal"


def get_strict_generation_rules(generation_mode: str) -> str:
    """获取严格模式生成规则文本。

    Args:
        generation_mode: 生成模式

    Returns:
        严格规则文本，用于注入 Prompt
    """
    rules = {
        "strict_qualification": """
## 严格资格证明类章节要求

当前章节属于资格证明/基本信息/营业执照类章节，必须严格遵守：

1. 本章只允许输出：
   - 投标人基本信息表；
   - 营业执照或法人证书复印件说明；
   - 必要的附件位置说明。

2. 本章禁止输出：
   - 技术参数；
   - 系统架构；
   - 安全设计；
   - 实施方案；
   - 运维服务；
   - 项目案例；
   - 合同金额；
   - 客户名称；
   - 人员经验；
   - 团队介绍；
   - 服务承诺；
   - 资质清单扩展说明。

3. 如果 RAG 中没有明确公司信息，不得编造企业名称、统一社会信用代码、法定代表人、注册资本、联系人、联系电话等信息。

4. 缺少信息时，请在表格中填写"待补充"或"以营业执照载明信息为准"，并在 missing_info 中说明。

5. 不得新增模板之外的小节标题。
""",
        "strict_table": """
## 严格表格类章节要求

当前章节属于表格类章节，必须严格遵守：

1. 必须按照表格格式输出，不得改为正文段落。
2. 不得新增表格之外的章节标题。
3. 不得在表格前后添加技术参数、项目案例、实施方案等无关内容。
4. 缺少信息时填写"待补充"，不得编造。
""",
        "strict_commitment": """
## 严格承诺函类章节要求

当前章节属于承诺函类章节，必须严格遵守：

1. 必须按照承诺函格式输出。
2. 不得添加项目案例、技术参数、合同金额等无关内容。
3. 承诺内容应简洁明确，不得过度展开。
4. 不得编造企业信息。
""",
        "strict_attachment_index": """
## 严格附件索引类章节要求

当前章节属于附件索引类章节，必须严格遵守：

1. 只能输出附件清单和索引表。
2. 不得生成具体附件内容。
3. 不得添加技术方案、案例等无关内容。
""",
        "strict_resume": """
## 严格简历表类章节要求

当前章节属于人员简历表类章节，必须严格遵守：

1. 必须按照简历表格式输出。
2. 只能填写人员信息，不得添加项目案例、技术方案等。
3. 缺少人员信息时填写"待补充"，不得编造姓名、学历、职称等。
""",
    }

    return rules.get(generation_mode, "")


class GenerationContextService:
    """正文生成上下文构建服务。

    汇总所有数据源，构建完整的生成上下文：
    - 当前章节信息
    - 内容责任矩阵
    - AI 解析内容（条款匹配）
    - RAG 素材（外部调用）
    - 上下文章节摘要
    - 大纲整体结构
    """

    def build_generation_context(
        self,
        section: Section,
        rag_materials: dict[str, list] | None = None,
        include_template: bool = True,
    ) -> dict[str, Any]:
        """构建正文生成上下文。

        Args:
            section: 章节实例
            rag_materials: RAG 检索结果（可选，由外部服务提供）
            include_template: 是否包含撰写模板

        Returns:
            完整的生成上下文字典
        """
        # 1. 当前章节信息
        current_section = self._get_current_section_info(section)

        # 2. 内容责任矩阵
        content_matrix = self._get_content_matrix(section)

        # 3. 判断生成模式
        generation_mode = get_generation_mode(section, content_matrix)

        # 4. AI 解析内容（条款匹配）
        analysis_points = self._get_analysis_points(section)

        # 5. 上下文章节摘要
        context_sections = self._get_context_sections(section)

        # 6. 大纲整体结构
        outline_structure = self._get_outline_structure(section)

        # 7. 项目信息
        project_info = self._get_project_info(section)

        # 8. 章节撰写模板
        writing_template = None
        if include_template:
            writing_template = self._get_writing_template(section, analysis_points)

        # 9. 获取严格模式生成规则
        strict_generation_rules = get_strict_generation_rules(generation_mode)

        return {
            "current_section": current_section,
            "content_matrix": content_matrix,
            "generation_mode": generation_mode,
            "analysis_points": analysis_points,
            "rag_materials": rag_materials or {},
            "context_sections": context_sections,
            "outline_structure": outline_structure,
            "project_info": project_info,
            "writing_template": writing_template,
            "strict_generation_rules": strict_generation_rules,
        }

    def _get_current_section_info(self, section: Section) -> dict[str, Any]:
        """获取当前章节信息。"""
        return {
            "id": section.id,
            "section_number": section.section_number,
            "title": section.title,
            "level": section.level,
            "sort_order": section.sort_order,
        }

    def _get_content_matrix(self, section: Section) -> dict[str, Any]:
        """获取内容责任矩阵。"""
        matrix = section.content_matrix or {}
        return {
            "section_role": matrix.get("section_role", "other"),
            "write_scope": matrix.get("write_scope", ""),
            "exclude_scope": matrix.get("exclude_scope", ""),
            "expression_form": matrix.get("expression_form", "body_text"),
            "writing_depth": matrix.get("writing_depth", "moderate"),
            "manual_notes": matrix.get("manual_notes", ""),
            "generation_priority": matrix.get("generation_priority", 50),
            "reference_sections": matrix.get("reference_sections", []),
            "no_duplicate_sections": matrix.get("no_duplicate_sections", []),
            "dependency_sections": matrix.get("dependency_sections", []),
        }

    def _get_analysis_points(self, section: Section) -> dict[str, Any]:
        """获取 AI 解析内容（条款匹配）。"""
        match_service = RequirementMatchService()
        matched = match_service.get_matched_requirements(section)

        return {
            "must_respond": matched["must_respond"],
            "score_points": matched["score_points"],
            "format_requirements": matched["format_requirements"],
            "all_matched": matched["all_matched"],
        }

    def _get_context_sections(self, section: Section) -> dict[str, Any]:
        """获取上下文章节摘要。

        包括：
        - 父章节摘要
        - 子章节摘要
        - 前置兄弟章节摘要
        - reference_sections 摘要
        - no_duplicate_sections 摘要
        - dependency_sections 摘要
        """
        result = {
            "parent_section": None,
            "child_sections": [],
            "preceding_siblings": [],
            "reference_sections": [],
            "no_duplicate_sections": [],
            "dependency_sections": [],
        }

        # 父章节
        if section.parent_id:
            parent = Section.objects.filter(id=section.parent_id).first()
            if parent and parent.content:
                result["parent_section"] = {
                    "id": parent.id,
                    "title": parent.title,
                    "section_number": parent.section_number,
                    "summary": parent.content[:500] if parent.content else "",
                }

        # 子章节
        children = Section.objects.filter(parent=section).order_by("sort_order")[:5]
        result["child_sections"] = [
            {
                "id": child.id,
                "title": child.title,
                "section_number": child.section_number,
                "summary": child.content[:200] if child.content else "",
            }
            for child in children
        ]

        # 前置兄弟章节
        siblings = Section.objects.filter(
            outline=section.outline,
            parent=section.parent,
            sort_order__lt=section.sort_order,
        ).order_by("-sort_order")[:3]

        result["preceding_siblings"] = [
            {
                "id": sib.id,
                "title": sib.title,
                "section_number": sib.section_number,
                "summary": sib.content[:300] if sib.content else "",
            }
            for sib in siblings
        ]

        # 从 content_matrix 获取关联章节
        content_matrix = section.content_matrix or {}

        # reference_sections
        reference_ids = self._extract_section_ids(
            content_matrix.get("reference_sections", [])
        )
        if reference_ids:
            refs = Section.objects.filter(id__in=reference_ids)
            result["reference_sections"] = [
                {
                    "id": ref.id,
                    "title": ref.title,
                    "section_number": ref.section_number,
                    "summary": ref.content[:200] if ref.content else "",
                }
                for ref in refs
            ]

        # no_duplicate_sections
        no_dup_ids = self._extract_section_ids(
            content_matrix.get("no_duplicate_sections", [])
        )
        if no_dup_ids:
            no_dups = Section.objects.filter(id__in=no_dup_ids)
            result["no_duplicate_sections"] = [
                {
                    "id": nd.id,
                    "title": nd.title,
                    "section_number": nd.section_number,
                    "summary": nd.content[:300] if nd.content else "",
                }
                for nd in no_dups
            ]

        # dependency_sections
        dep_ids = self._extract_section_ids(
            content_matrix.get("dependency_sections", [])
        )
        if dep_ids:
            deps = Section.objects.filter(id__in=dep_ids)
            result["dependency_sections"] = [
                {
                    "id": dep.id,
                    "title": dep.title,
                    "section_number": dep.section_number,
                    "summary": dep.content[:200] if dep.content else "",
                }
                for dep in deps
            ]

        return result

    def _extract_section_ids(self, sections_list: list) -> list[int]:
        """从章节列表中提取 ID。"""
        ids = []
        for item in sections_list:
            if isinstance(item, int):
                ids.append(item)
            elif isinstance(item, dict) and "id" in item:
                ids.append(item["id"])
        return ids

    def _get_outline_structure(self, section: Section) -> str:
        """生成大纲树形结构文本。

        用于让 LLM 了解整体结构。
        """
        outline = section.outline
        all_sections = Section.objects.filter(outline=outline).order_by("sort_order")

        lines = []
        for sec in all_sections:
            indent = "  " * (sec.level - 1)
            prefix = "→" if sec.id == section.id else " "
            lines.append(f"{prefix}{indent}{sec.section_number} {sec.title}")

        return "\n".join(lines)

    def _get_project_info(self, section: Section) -> dict[str, Any]:
        """获取项目信息。"""
        outline = section.outline
        lot = outline.lot
        project = lot.project if lot else None

        return {
            "project_name": project.name if project else "",
            "project_id": project.id if project else None,
            "lot_name": lot.name if lot else "",
            "lot_id": lot.id if lot else None,
            "outline_name": outline.name,
            "outline_id": outline.id,
        }

    def _get_writing_template(
        self,
        section: Section,
        analysis_points: dict[str, Any] | None,
    ) -> dict[str, Any] | None:
        """获取章节撰写模板。"""
        from apps.outline.services.section_template_service import SectionTemplateService

        template_service = SectionTemplateService()
        return template_service.select_template(section, analysis_points)

    def build_prompt_context(self, context: dict[str, Any]) -> str:
        """构建用于提示词的上下文文本。

        Args:
            context: build_generation_context 返回的上下文

        Returns:
            格式化的上下文文本
        """
        sections = []

        # 项目信息
        project_info = context.get("project_info", {})
        if project_info.get("project_name"):
            sections.append(
                f"【项目信息】\n"
                f"项目：{project_info['project_name']}\n"
                f"标段：{project_info.get('lot_name', '')}"
            )

        # 当前章节
        current = context.get("current_section", {})
        sections.append(
            f"【当前章节】\n"
            f"{current.get('section_number', '')} {current.get('title', '')}"
        )

        # 内容责任矩阵
        matrix = context.get("content_matrix", {})
        if matrix.get("write_scope"):
            sections.append(
                f"【写作范围】\n"
                f"应写：{matrix['write_scope']}"
            )
        if matrix.get("exclude_scope"):
            sections.append(
                f"【排除范围】\n"
                f"禁写：{matrix['exclude_scope']}"
            )
        if matrix.get("manual_notes"):
            sections.append(
                f"【人工备注】\n"
                f"{matrix['manual_notes']}"
            )

        # AI 解析内容
        analysis = context.get("analysis_points", {})
        if analysis.get("must_respond"):
            must_respond_text = "\n".join(
                f"- [{r['requirement_no']}] {r['title']}"
                for r in analysis["must_respond"][:5]
            )
            sections.append(f"【必须响应条款】\n{must_respond_text}")

        if analysis.get("score_points"):
            score_text = "\n".join(
                f"- [{r['requirement_no']}] {r['title']}"
                for r in analysis["score_points"][:10]
            )
            sections.append(f"【得分点】\n{score_text}")

        # RAG 素材
        rag = context.get("rag_materials", {})
        if rag:
            rag_text = self._format_rag_materials(rag)
            if rag_text:
                sections.append(f"【参考素材】\n{rag_text}")

        # 上下文章节
        ctx_sections = context.get("context_sections", {})
        if ctx_sections.get("no_duplicate_sections"):
            no_dup_text = "\n".join(
                f"- {s['section_number']} {s['title']}"
                for s in ctx_sections["no_duplicate_sections"]
            )
            sections.append(f"【禁止重复章节】\n{no_dup_text}")

        if ctx_sections.get("reference_sections"):
            ref_text = "\n".join(
                f"- {s['section_number']} {s['title']}"
                for s in ctx_sections["reference_sections"]
            )
            sections.append(f"【可引用章节】\n{ref_text}")

        # 章节撰写模板
        writing_template = context.get("writing_template")
        if writing_template:
            template_text = self._format_writing_template(writing_template)
            sections.append(template_text)

        # 大纲结构
        outline_str = context.get("outline_structure", "")
        if outline_str:
            sections.append(f"【大纲结构】\n{outline_str}")

        # 严格模式规则
        strict_rules = context.get("strict_generation_rules", "")
        if strict_rules:
            sections.append(strict_rules)

        return "\n\n".join(sections)

    def _format_writing_template(self, template: dict[str, Any]) -> str:
        """格式化章节撰写模板。"""
        parts = [
            f"【章节撰写模板：{template.get('name', '未命名模板')}】",
            "",
            "模板结构：",
            template.get("template_content", ""),
        ]

        required_slots = template.get("required_slots", [])
        if required_slots:
            slot_text = "\n".join(
                f"- {slot.get('name')}: {slot.get('description', '')}"
                for slot in required_slots
            )
            parts.append(f"\n必填槽位：\n{slot_text}")

        optional_slots = template.get("optional_slots", [])
        if optional_slots:
            slot_text = "\n".join(
                f"- {slot.get('name')}: {slot.get('description', '')}"
                for slot in optional_slots
            )
            parts.append(f"\n可选槽位：\n{slot_text}")

        return "\n".join(parts)

    def _format_rag_materials(self, rag_materials: dict[str, list]) -> str:
        """格式化 RAG 素材。"""
        parts = []

        # 定义通道的中文名称
        channel_names = {
            "historical_bid": "历史标书",
            "company_info": "公司信息",
            "personnel": "人员资料",
            "certificate": "资质证书",
            "project_case": "项目业绩",
        }

        for channel, materials in rag_materials.items():
            if materials:
                channel_name = channel_names.get(channel, channel)
                material_lines = []
                for i, m in enumerate(materials[:5], 1):
                    title = m.get("title", "")
                    content = m.get("content", "")[:200]
                    material_lines.append(f"{i}. {title}: {content}")
                parts.append(f"【{channel_name}】\n" + "\n".join(material_lines))

        return "\n\n".join(parts)
