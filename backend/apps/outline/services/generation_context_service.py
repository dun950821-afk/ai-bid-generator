# backend/apps/outline/services/generation_context_service.py
"""正文生成上下文构建服务。

根据 generation_mode 使用不同的 context_strategy 构建上下文。
"""

import logging
from typing import Any

from django.db.models import Q

from apps.outline.models import Section
from apps.outline.services.requirement_match_service import RequirementMatchService
from apps.outline.services.section_tree_service import SectionTreeService
from apps.outline.services.section_numbering_service import SectionNumberingService

logger = logging.getLogger(__name__)


class ContentStructurePolicy:
    """正文结构策略常量。"""

    CATEGORY_SUMMARY = "category_summary"  # 父章节总述模式
    INTERNAL_HEADINGS = "internal_headings"  # 技术叶子章节内部小标题模式
    PLAIN_PARAGRAPHS = "plain_paragraphs"  # 普通段落模式
    TABLE_ONLY = "table_only"  # 表格模式
    MATERIAL_PLACEHOLDER = "material_placeholder"  # 固定材料占位符模式


class ContentStructurePolicyService:
    """正文结构策略判断服务。

    根据章节属性自动判断正文组织方式。
    """

    def get_content_structure_policy(
        self,
        section: Section,
        generation_mode: str,
        matrix: dict | None = None,
    ) -> str:
        """判断正文结构策略。

        Args:
            section: 章节实例
            generation_mode: 生成模式
            matrix: 内容责任矩阵

        Returns:
            正文结构策略名称
        """
        if matrix is None:
            matrix = section.content_matrix or {}

        # 1. 父章节一定是 category_summary
        if generation_mode == "parent_overview":
            return ContentStructurePolicy.CATEGORY_SUMMARY

        # 2. 基于 expression_form 判断
        expression_form = matrix.get("expression_form", "body_text")
        if expression_form in ["certificate", "attachment_index"]:
            return ContentStructurePolicy.MATERIAL_PLACEHOLDER
        if expression_form in ["table", "resume_table"]:
            return ContentStructurePolicy.TABLE_ONLY

        # 3. 基于 generation_mode 判断
        if generation_mode == "fixed_material":
            return ContentStructurePolicy.MATERIAL_PLACEHOLDER
        if generation_mode == "table_response":
            return ContentStructurePolicy.TABLE_ONLY
        if generation_mode == "commitment":
            return ContentStructurePolicy.PLAIN_PARAGRAPHS
        if generation_mode in ["resume_or_personnel", "case_or_evidence"]:
            return ContentStructurePolicy.INTERNAL_HEADINGS

        # 4. 基于 section_role 判断
        section_role = matrix.get("section_role", "")
        if section_role == "technical_solution":
            # 技术方案类叶子章节使用内部小标题
            return ContentStructurePolicy.INTERNAL_HEADINGS

        # 5. 基于 writing_depth 判断
        writing_depth = matrix.get("writing_depth", "moderate")
        if writing_depth == "overview":
            return ContentStructurePolicy.PLAIN_PARAGRAPHS

        # 6. 默认返回普通段落模式
        return ContentStructurePolicy.PLAIN_PARAGRAPHS

    def get_policy_config(self, policy: str) -> dict[str, Any]:
        """获取正文结构策略配置。

        Returns:
            {
                "allow_internal_headings": bool,
                "allow_section_numbers": bool,
                "max_word_count": int,
                "min_word_count": int,
                "required_elements": list,
                "forbidden_elements": list,
                "description": str,
            }
        """
        configs = {
            ContentStructurePolicy.CATEGORY_SUMMARY: {
                "allow_internal_headings": False,
                "allow_section_numbers": False,
                "max_word_count": 500,
                "min_word_count": 200,
                "required_elements": ["总述", "范围说明"],
                "forbidden_elements": ["子章节编号", "子章节标题清单", "项目符号清单", "详细展开"],
                "description": "只写总述、范围说明、组织逻辑和承接关系",
            },
            ContentStructurePolicy.INTERNAL_HEADINGS: {
                "allow_internal_headings": True,
                "allow_section_numbers": False,
                "max_word_count": 3000,
                "min_word_count": 300,
                "required_elements": [],
                "forbidden_elements": ["大纲式编号", "无来源的具体名词"],
                "description": "允许使用无编号内部小标题，禁止大纲式编号",
            },
            ContentStructurePolicy.PLAIN_PARAGRAPHS: {
                "allow_internal_headings": False,
                "allow_section_numbers": False,
                "max_word_count": 1500,
                "min_word_count": 100,
                "required_elements": [],
                "forbidden_elements": ["章节编号", "小标题"],
                "description": "以自然段为主，不使用复杂结构",
            },
            ContentStructurePolicy.TABLE_ONLY: {
                "allow_internal_headings": False,
                "allow_section_numbers": False,
                "max_word_count": 2000,
                "min_word_count": 50,
                "required_elements": ["Markdown表格"],
                "forbidden_elements": ["长篇方案", "技术参数"],
                "description": "以紧凑 Markdown 表格为主",
            },
            ContentStructurePolicy.MATERIAL_PLACEHOLDER: {
                "allow_internal_headings": False,
                "allow_section_numbers": False,
                "max_word_count": 500,
                "min_word_count": 80,
                "required_elements": ["材料说明", "材料占位符"],
                "forbidden_elements": ["一、二、三小标题", "技术方案", "案例"],
                "description": "只输出材料说明、提交形式和材料占位符",
            },
        }
        return configs.get(policy, configs[ContentStructurePolicy.PLAIN_PARAGRAPHS])


class ContextStrategy:
    """上下文构建策略基类。"""

    def build(
        self,
        section: Section,
        rag_materials: dict[str, list],
        analysis_points: dict[str, Any],
        outline_structure: str,
        project_info: dict[str, Any],
    ) -> dict[str, Any]:
        """构建上下文。"""
        raise NotImplementedError

    def _get_current_section_info(self, section: Section) -> dict[str, Any]:
        """获取当前章节信息，使用统一的编号服务。"""
        from apps.outline.services.section_numbering_service import SectionNumberingService

        all_sections = Section.objects.filter(outline=section.outline)
        numbering_service = SectionNumberingService()
        number_map = numbering_service.build_number_map(all_sections)

        return {
            "id": section.id,
            "section_number": number_map.get(section.id, section.section_number),
            "section_number_display": number_map.get(section.id, section.section_number),
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

    def _get_context_sections(
        self,
        section: Section,
        max_sections: int = 10,
    ) -> dict[str, Any]:
        """获取上下文章节摘要。"""
        from apps.outline.services.section_numbering_service import SectionNumberingService

        result = {
            "parent_section": None,
            "child_sections": [],
            "preceding_siblings": [],
            "reference_sections": [],
            "no_duplicate_sections": [],
            "dependency_sections": [],
        }

        # 获取统一编号
        all_sections = Section.objects.filter(outline=section.outline)
        numbering_service = SectionNumberingService()
        number_map = numbering_service.build_number_map(all_sections)

        # 父章节
        if section.parent_id:
            parent = Section.objects.filter(id=section.parent_id).first()
            if parent and parent.content:
                result["parent_section"] = {
                    "id": parent.id,
                    "title": parent.title,
                    "section_number": number_map.get(parent.id, parent.section_number),
                    "summary": parent.content[:500] if parent.content else "",
                }

        # 子章节
        children = Section.objects.filter(parent=section).order_by("sort_order")[:5]
        result["child_sections"] = [
            {
                "id": child.id,
                "title": child.title,
                "section_number": number_map.get(child.id, child.section_number),
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
                "section_number": number_map.get(sib.id, sib.section_number),
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
                    "section_number": number_map.get(ref.id, ref.section_number),
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
                    "section_number": number_map.get(nd.id, nd.section_number),
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
                    "section_number": number_map.get(dep.id, dep.section_number),
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

    def _get_writing_template(
        self,
        section: Section,
        analysis_points: dict[str, Any] | None,
    ) -> dict[str, Any] | None:
        """获取章节撰写模板。"""
        from apps.outline.services.section_template_service import SectionTemplateService

        template_service = SectionTemplateService()
        return template_service.select_template(section, analysis_points)


class FullContextStrategy(ContextStrategy):
    """完整上下文策略（普通叶子章节）。"""

    def build(
        self,
        section: Section,
        rag_materials: dict[str, list],
        analysis_points: dict[str, Any],
        outline_structure: str,
        project_info: dict[str, Any],
    ) -> dict[str, Any]:
        """构建完整上下文，包含所有信息。"""
        content_matrix = self._get_content_matrix(section)
        context_sections = self._get_context_sections(section, max_sections=10)
        writing_template = self._get_writing_template(section, analysis_points)

        return {
            "current_section": self._get_current_section_info(section),
            "content_matrix": content_matrix,
            "analysis_points": analysis_points,
            "rag_materials": rag_materials,
            "context_sections": context_sections,
            "outline_structure": outline_structure,
            "project_info": project_info,
            "writing_template": writing_template,
        }


class ParentOverviewStrategy(ContextStrategy):
    """父章节总述策略。

    只传父章节边界、子章节列表、子章节矩阵摘要，不传大量 RAG 原文。
    """

    def build(
        self,
        section: Section,
        rag_materials: dict[str, list],
        analysis_points: dict[str, Any],
        outline_structure: str,
        project_info: dict[str, Any],
    ) -> dict[str, Any]:
        """构建父章节上下文。"""
        content_matrix = self._get_content_matrix(section)

        # 获取子章节列表和矩阵摘要
        children = section.children.all().order_by("sort_order")
        child_summaries = []
        for child in children:
            child_matrix = child.content_matrix or {}
            child_summaries.append({
                "section_number": child.section_number,
                "title": child.title,
                "section_role": child_matrix.get("section_role", "other"),
                "write_scope": child_matrix.get("write_scope", "")[:100],  # 截断
            })

        return {
            "current_section": self._get_current_section_info(section),
            "content_matrix": content_matrix,
            "analysis_points": analysis_points,
            "rag_materials": {},  # 父章节不传 RAG 原文
            "context_sections": {
                "child_sections": child_summaries,
                "child_count": len(child_summaries),
            },
            "outline_structure": outline_structure,
            "project_info": project_info,
            "writing_template": {
                "template_key": "parent_overview",
                "template_content": (
                    "本章节为父章节，需撰写总述和承接内容。\n\n"
                    "总述要求：\n"
                    "1. 简要说明本章节的定位和作用\n"
                    "2. 概述后续子章节的结构安排\n"
                    "3. 引导读者理解整体框架\n\n"
                    "注意事项：\n"
                    "- 不展开子章节的具体内容\n"
                    "- 不重复子章节的细节\n"
                    "- 保持简洁，通常 200-500 字"
                ),
            },
        }


class TableFocusedStrategy(ContextStrategy):
    """表格聚焦策略。

    重点传表格结构、索引对象、评分点或响应点。
    """

    def build(
        self,
        section: Section,
        rag_materials: dict[str, list],
        analysis_points: dict[str, Any],
        outline_structure: str,
        project_info: dict[str, Any],
    ) -> dict[str, Any]:
        """构建表格类上下文。"""
        content_matrix = self._get_content_matrix(section)

        # 只传表格相关的 RAG 素材
        table_rag = {}
        for channel in ["company_info", "certificate"]:
            if channel in rag_materials:
                table_rag[channel] = rag_materials[channel][:2]

        # 从分析点提取表格结构建议
        table_structure = self._infer_table_structure(analysis_points, content_matrix)

        return {
            "current_section": self._get_current_section_info(section),
            "content_matrix": content_matrix,
            "analysis_points": analysis_points,
            "rag_materials": table_rag,
            "context_sections": {},  # 表格类不需要上下文章节
            "outline_structure": outline_structure,
            "project_info": project_info,
            "table_structure": table_structure,
            "writing_template": {
                "template_key": "table_response",
                "template_content": (
                    "本章节为表格类章节。\n\n"
                    "输出要求：\n"
                    "1. 必须输出 Markdown 表格格式\n"
                    "2. 表格应紧凑、无多余空行\n"
                    "3. 缺少信息填写「待补充」，不编造\n"
                    "4. 不添加表格之外的长篇文字说明"
                ),
            },
        }

    def _infer_table_structure(
        self,
        analysis_points: dict[str, Any],
        content_matrix: dict[str, Any],
    ) -> dict[str, Any]:
        """从分析点推断表格结构。"""
        score_points = analysis_points.get("score_points", [])
        must_respond = analysis_points.get("must_respond", [])

        columns = ["序号", "项目", "内容"]
        if score_points:
            columns = ["序号", "评审项", "招标要求", "投标响应"]

        return {
            "suggested_columns": columns,
            "row_count_estimate": len(score_points) + len(must_respond),
        }


class MaterialFocusedStrategy(ContextStrategy):
    """材料聚焦策略。

    重点传材料要求、提供形式、附件占位规则，不传无关技术方案和案例正文。
    """

    def build(
        self,
        section: Section,
        rag_materials: dict[str, list],
        analysis_points: dict[str, Any],
        outline_structure: str,
        project_info: dict[str, Any],
    ) -> dict[str, Any]:
        """构建材料类上下文。"""
        content_matrix = self._get_content_matrix(section)

        # 只传公司信息和资质证书
        material_rag = {}
        for channel in ["company_info", "certificate"]:
            if channel in rag_materials:
                material_rag[channel] = rag_materials[channel][:3]

        return {
            "current_section": self._get_current_section_info(section),
            "content_matrix": content_matrix,
            "analysis_points": {},  # 材料类不需要分析点
            "rag_materials": material_rag,
            "context_sections": {},
            "outline_structure": "",  # 材料类不需要大纲结构
            "project_info": project_info,
            "writing_template": {
                "template_key": "fixed_material",
                "template_content": (
                    "本章节为证明材料/附件材料类章节。\n\n"
                    "输出要求：\n"
                    "1. 只输出材料说明、提交形式、附件占位\n"
                    "2. 不生成技术方案、案例、服务承诺等无关内容\n"
                    "3. 缺少信息时标注「待补充营业执照载明信息」\n"
                    "4. 不编造企业名称、统一社会信用代码等信息"
                ),
            },
        }


class CommitmentFocusedStrategy(ContextStrategy):
    """承诺函聚焦策略。

    重点传承诺事项和约束条件。
    """

    def build(
        self,
        section: Section,
        rag_materials: dict[str, list],
        analysis_points: dict[str, Any],
        outline_structure: str,
        project_info: dict[str, Any],
    ) -> dict[str, Any]:
        """构建承诺函上下文。"""
        content_matrix = self._get_content_matrix(section)

        return {
            "current_section": self._get_current_section_info(section),
            "content_matrix": content_matrix,
            "analysis_points": analysis_points,
            "rag_materials": {},  # 承诺函不需要 RAG
            "context_sections": {},
            "outline_structure": "",
            "project_info": project_info,
            "writing_template": {
                "template_key": "commitment",
                "template_content": (
                    "本章节为承诺函/声明类章节。\n\n"
                    "输出要求：\n"
                    "1. 按承诺函标准格式输出\n"
                    "2. 承诺内容应简洁明确\n"
                    "3. 不添加项目案例、技术参数等无关内容\n"
                    "4. 不编造企业信息"
                ),
            },
        }


class PersonnelFocusedStrategy(ContextStrategy):
    """人员聚焦策略。

    重点传人员字段、角色要求、简历或人员素材。
    """

    def build(
        self,
        section: Section,
        rag_materials: dict[str, list],
        analysis_points: dict[str, Any],
        outline_structure: str,
        project_info: dict[str, Any],
    ) -> dict[str, Any]:
        """构建人员类上下文。"""
        content_matrix = self._get_content_matrix(section)

        # 只传人员资料
        personnel_rag = {}
        if "personnel" in rag_materials:
            personnel_rag["personnel"] = rag_materials["personnel"][:5]

        return {
            "current_section": self._get_current_section_info(section),
            "content_matrix": content_matrix,
            "analysis_points": analysis_points,
            "rag_materials": personnel_rag,
            "context_sections": {},
            "outline_structure": outline_structure,
            "project_info": project_info,
            "writing_template": {
                "template_key": "resume_or_personnel",
                "template_content": (
                    "本章节为人员/团队/简历类章节。\n\n"
                    "输出要求：\n"
                    "1. 只输出人员相关信息\n"
                    "2. 不混入技术方案、案例等无关内容\n"
                    "3. 缺少人员信息时填写「待补充」\n"
                    "4. 不编造姓名、学历、职称等"
                ),
            },
        }


class CaseFocusedStrategy(ContextStrategy):
    """案例聚焦策略。

    重点传案例事实、证明材料、评分点。
    """

    def build(
        self,
        section: Section,
        rag_materials: dict[str, list],
        analysis_points: dict[str, Any],
        outline_structure: str,
        project_info: dict[str, Any],
    ) -> dict[str, Any]:
        """构建案例类上下文。"""
        content_matrix = self._get_content_matrix(section)

        # 传项目业绩和历史标书
        case_rag = {}
        for channel in ["project_case", "historical_bid"]:
            if channel in rag_materials:
                case_rag[channel] = rag_materials[channel][:5]

        # 获取父章节上下文
        context_sections = {}
        if section.parent_id:
            parent = Section.objects.filter(id=section.parent_id).first()
            if parent and parent.content:
                context_sections["parent_section"] = {
                    "section_number": parent.section_number,
                    "title": parent.title,
                    "summary": parent.content[:300],
                }

        return {
            "current_section": self._get_current_section_info(section),
            "content_matrix": content_matrix,
            "analysis_points": analysis_points,
            "rag_materials": case_rag,
            "context_sections": context_sections,
            "outline_structure": outline_structure,
            "project_info": project_info,
            "writing_template": {
                "template_key": "case_or_evidence",
                "template_content": (
                    "本章节为案例/业绩/证明类章节。\n\n"
                    "输出要求：\n"
                    "1. 以事实材料为主，不编造内容\n"
                    "2. 引用 RAG 中的真实案例信息\n"
                    "3. 缺少案例时标注「待补充相关业绩」\n"
                    "4. 不编造业主单位、合同金额等信息"
                ),
            },
        }


class SummaryFocusedStrategy(ContextStrategy):
    """目录索引聚焦策略。

    重点传被汇总或被索引章节的信息，不展开详细正文。
    """

    def build(
        self,
        section: Section,
        rag_materials: dict[str, list],
        analysis_points: dict[str, Any],
        outline_structure: str,
        project_info: dict[str, Any],
    ) -> dict[str, Any]:
        """构建目录索引类上下文。"""
        content_matrix = self._get_content_matrix(section)

        # 获取需要汇总的章节信息
        outline = section.outline
        all_sections = Section.objects.filter(outline=outline).order_by("sort_order")

        # 使用统一的编号服务
        numbering_service = SectionNumberingService()
        number_map = numbering_service.build_number_map(all_sections)

        section_list = []
        for sec in all_sections:
            if sec.id != section.id:  # 排除自己
                section_list.append({
                    "section_number": number_map.get(sec.id, sec.section_number),
                    "title": sec.title,
                    "has_content": bool(sec.content),
                    "word_count": sec.word_count,
                })

        return {
            "current_section": self._get_current_section_info(section),
            "content_matrix": content_matrix,
            "analysis_points": {},
            "rag_materials": {},  # 目录类不需要 RAG
            "context_sections": {
                "all_sections": section_list[:30],  # 最多 30 个章节
                "total_count": len(section_list),
            },
            "outline_structure": outline_structure,
            "project_info": project_info,
            "writing_template": {
                "template_key": "summary_or_index",
                "template_content": (
                    "本章节为目录/索引/汇总类章节。\n\n"
                    "输出要求：\n"
                    "1. 只输出目录或索引表格\n"
                    "2. 不展开各章节的详细正文\n"
                    "3. 可包含章节编号、标题、页码占位符\n"
                    "4. 保持简洁"
                ),
            },
        }


class GenerationContextService:
    """正文生成上下文构建服务。

    根据 generation_mode 选择不同的策略构建上下文。
    """

    # 策略映射
    STRATEGY_MAP = {
        "parent_overview": ParentOverviewStrategy(),
        "leaf_content": FullContextStrategy(),
        "table_response": TableFocusedStrategy(),
        "fixed_material": MaterialFocusedStrategy(),
        "commitment": CommitmentFocusedStrategy(),
        "resume_or_personnel": PersonnelFocusedStrategy(),
        "case_or_evidence": CaseFocusedStrategy(),
        "summary_or_index": SummaryFocusedStrategy(),
        # 兼容旧模式
        "strict_qualification": MaterialFocusedStrategy(),
        "strict_table": TableFocusedStrategy(),
        "strict_commitment": CommitmentFocusedStrategy(),
        "strict_attachment_index": SummaryFocusedStrategy(),
        "strict_resume": PersonnelFocusedStrategy(),
    }

    def build_generation_context(
        self,
        section: Section,
        rag_materials: dict[str, list] | None = None,
        include_template: bool = True,
    ) -> dict[str, Any]:
        """构建正文生成上下文。

        Args:
            section: 章节实例
            rag_materials: RAG 检索结果
            include_template: 是否包含撰写模板

        Returns:
            完整的生成上下文字典
        """
        from apps.outline.services.generation_mode_service import (
            GenerationModeService,
            get_global_forbidden_rules,
        )

        # 1. 识别生成模式
        mode_service = GenerationModeService()
        generation_mode = mode_service.get_generation_mode(section)
        mode_config = mode_service.get_mode_config(generation_mode)

        # 2. 识别正文结构策略
        policy_service = ContentStructurePolicyService()
        content_structure_policy = policy_service.get_content_structure_policy(
            section=section,
            generation_mode=generation_mode,
            matrix=section.content_matrix,
        )
        policy_config = policy_service.get_policy_config(content_structure_policy)

        # 3. 获取模式配置
        context_strategy_name = mode_config.get("context_strategy", "full_context")

        # 4. 准备公共数据
        analysis_points = self._get_analysis_points(section)
        outline_structure = self._get_outline_structure(section)
        project_info = self._get_project_info(section)

        # 5. 选择策略并构建上下文
        strategy = self.STRATEGY_MAP.get(context_strategy_name, FullContextStrategy())
        context = strategy.build(
            section=section,
            rag_materials=rag_materials or {},
            analysis_points=analysis_points,
            outline_structure=outline_structure,
            project_info=project_info,
        )

        # 6. 添加元信息
        context["generation_mode"] = generation_mode
        context["context_strategy"] = context_strategy_name
        context["mode_config"] = mode_config

        # 7. 添加正文结构策略
        context["content_structure_policy"] = content_structure_policy
        context["policy_config"] = policy_config

        # 8. 添加全局禁止规则
        context["global_forbidden_rules"] = get_global_forbidden_rules()

        # 9. 添加严格模式规则（兼容）
        context["strict_generation_rules"] = self._get_strict_rules(generation_mode)

        # 10. 添加公司材料上下文
        context["company_context"] = self._get_company_context(section)

        return context

    def _get_current_section_info(self, section: Section) -> dict[str, Any]:
        """获取当前章节信息，使用统一的编号服务。"""
        from apps.outline.services.section_numbering_service import SectionNumberingService

        # 使用统一的编号服务
        all_sections = Section.objects.filter(outline=section.outline)
        numbering_service = SectionNumberingService()
        number_map = numbering_service.build_number_map(all_sections)

        return {
            "id": section.id,
            "section_number": number_map.get(section.id, section.section_number),
            "section_number_display": number_map.get(section.id, section.section_number),
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

    def _get_context_sections(
        self,
        section: Section,
        max_sections: int = 10,
    ) -> dict[str, Any]:
        """获取上下文章节摘要。"""
        from apps.outline.services.section_numbering_service import SectionNumberingService

        result = {
            "parent_section": None,
            "child_sections": [],
            "preceding_siblings": [],
            "reference_sections": [],
            "no_duplicate_sections": [],
            "dependency_sections": [],
        }

        # 获取统一编号
        all_sections = Section.objects.filter(outline=section.outline)
        numbering_service = SectionNumberingService()
        number_map = numbering_service.build_number_map(all_sections)

        # 父章节
        if section.parent_id:
            parent = Section.objects.filter(id=section.parent_id).first()
            if parent and parent.content:
                result["parent_section"] = {
                    "id": parent.id,
                    "title": parent.title,
                    "section_number": number_map.get(parent.id, parent.section_number),
                    "summary": parent.content[:500] if parent.content else "",
                }

        # 子章节
        children = Section.objects.filter(parent=section).order_by("sort_order")[:5]
        result["child_sections"] = [
            {
                "id": child.id,
                "title": child.title,
                "section_number": number_map.get(child.id, child.section_number),
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
                "section_number": number_map.get(sib.id, sib.section_number),
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
                    "section_number": number_map.get(ref.id, ref.section_number),
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
                    "section_number": number_map.get(nd.id, nd.section_number),
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
                    "section_number": number_map.get(dep.id, dep.section_number),
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
        """生成大纲树形结构文本，使用统一编号。"""
        from apps.outline.services.section_numbering_service import SectionNumberingService

        outline = section.outline
        all_sections = Section.objects.filter(outline=outline).order_by("sort_order")

        # 使用统一的编号服务
        numbering_service = SectionNumberingService()
        number_map = numbering_service.build_number_map(all_sections)

        lines = []
        for sec in all_sections:
            indent = "  " * (sec.level - 1)
            prefix = "→" if sec.id == section.id else " "
            number = number_map.get(sec.id, sec.section_number)
            lines.append(f"{prefix}{indent}{number} {sec.title}")

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

    def _get_company_context(self, section: Section) -> dict[str, Any]:
        """获取公司材料上下文。

        如果大纲关联了材料包，返回公司信息快照和材料列表。
        AI 只使用材料元数据，不处理敏感图片原图。
        """
        outline = section.outline

        # 检查是否有关联的材料包
        try:
            material_package = outline.material_package
        except Exception:
            return {"available": False, "reason": "材料包未创建"}

        if not material_package:
            return {"available": False, "reason": "材料包未创建"}

        # 获取公司信息快照
        company_snapshot = material_package.company_snapshot or {}

        # 从 content_matrix 获取章节所需材料
        required_materials = self._get_required_materials_from_matrix(section)

        # 获取材料包中的材料
        available_materials = []
        missing_materials = []

        for req in required_materials:
            usage_key = req.get("usage_key")
            item = material_package.items.filter(usage_key=usage_key).select_related("material").first()

            if item and item.material:
                material = item.material
                available_materials.append({
                    "usage_key": usage_key,
                    "title": material.title,
                    "material_type": material.material_type,
                    "available": material.status == "active" and not material.is_expired,
                    "is_expired": material.is_expired,
                    "valid_to": material.valid_to.isoformat() if material.valid_to else None,
                    "certificate_no": material.certificate_no,
                    "issuing_authority": material.issuing_authority,
                    "is_sensitive": material.is_sensitive,
                    "insert_mode": req.get("insert_mode", "image_attachment"),
                    "description": req.get("description", ""),
                })
            else:
                missing_materials.append({
                    "usage_key": usage_key,
                    "material_type": req.get("material_type"),
                    "description": req.get("description", ""),
                    "required": req.get("required", True),
                })

        return {
            "available": True,
            "company": company_snapshot,
            "required_materials": required_materials,
            "available_materials": available_materials,
            "missing_materials": missing_materials,
            "package_status": material_package.status,
            "package_locked": material_package.status == "locked",
        }

    def _get_required_materials_from_matrix(self, section: Section) -> list[dict]:
        """从内容责任矩阵提取所需材料。"""
        matrix = section.content_matrix or {}
        return matrix.get("required_materials", [])

    def _get_writing_template(
        self,
        section: Section,
        analysis_points: dict[str, Any] | None,
    ) -> dict[str, Any] | None:
        """获取章节撰写模板。"""
        from apps.outline.services.section_template_service import SectionTemplateService

        template_service = SectionTemplateService()
        return template_service.select_template(section, analysis_points)

    def _get_strict_rules(self, generation_mode: str) -> str:
        """获取严格模式规则（兼容旧模式）。"""
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

    def build_prompt_context(self, context: dict[str, Any]) -> str:
        """构建用于提示词的上下文文本。"""
        sections = []

        # 全局禁止规则（放在最前面）
        global_rules = context.get("global_forbidden_rules", "")
        if global_rules:
            sections.append(global_rules)

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

        # 子章节列表（父章节模式）
        if ctx_sections.get("child_sections"):
            child_text = "\n".join(
                f"- {s['section_number']} {s['title']}"
                for s in ctx_sections["child_sections"]
            )
            sections.append(f"【子章节列表】\n{child_text}")

        # 章节撰写模板
        writing_template = context.get("writing_template")
        if writing_template:
            template_text = self._format_writing_template(writing_template)
            sections.append(template_text)

        # 大纲结构
        outline_str = context.get("outline_structure", "")
        if outline_str:
            sections.append(f"【大纲结构】\n{outline_str}")

        # 公司材料上下文
        company_context = context.get("company_context", {})
        if company_context.get("available"):
            company_text = self._format_company_context(company_context)
            if company_text:
                sections.append(company_text)

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

    def _format_company_context(self, company_context: dict[str, Any]) -> str:
        """格式化公司材料上下文。

        AI 只接收材料元数据，不接收敏感图片原图。
        """
        parts = []

        # 公司基本信息
        company = company_context.get("company", {})
        if company:
            company_lines = []
            if company.get("name"):
                company_lines.append(f"公司名称：{company['name']}")
            if company.get("unified_social_credit_code"):
                company_lines.append(f"统一社会信用代码：{company['unified_social_credit_code']}")
            if company.get("legal_representative"):
                company_lines.append(f"法定代表人：{company['legal_representative']}")
            if company.get("registered_capital"):
                company_lines.append(f"注册资本：{company['registered_capital']}")
            if company.get("registered_address"):
                company_lines.append(f"注册地址：{company['registered_address']}")
            if company.get("official_phone"):
                company_lines.append(f"联系电话：{company['official_phone']}")
            if company.get("contact_person"):
                company_lines.append(f"联系人：{company['contact_person']}")
            if company.get("bank_name"):
                company_lines.append(f"开户银行：{company['bank_name']}")
            if company.get("bank_account"):
                company_lines.append(f"银行账号：{company['bank_account']}")

            if company_lines:
                parts.append("【公司信息】\n" + "\n".join(company_lines))

        # 可用材料列表
        available_materials = company_context.get("available_materials", [])
        if available_materials:
            material_lines = []
            for mat in available_materials:
                status_text = "可用" if mat.get("available") else "已过期"
                material_lines.append(
                    f"- {mat.get('title', mat.get('usage_key'))} [{status_text}]"
                )
                if mat.get("certificate_no"):
                    material_lines.append(f"  证书编号：{mat['certificate_no']}")
                if mat.get("valid_to"):
                    material_lines.append(f"  有效期至：{mat['valid_to']}")
                # 提示插入方式
                insert_mode = mat.get("insert_mode", "image_attachment")
                if insert_mode in ["image_inline", "image_attachment"]:
                    material_lines.append(
                        f"  输出占位符：{{{{ material:{mat['usage_key']} }}}}"
                    )

            parts.append("【可用材料】\n" + "\n".join(material_lines))

        # 缺失材料
        missing_materials = company_context.get("missing_materials", [])
        if missing_materials:
            missing_lines = []
            for mat in missing_materials:
                desc = mat.get("description", mat.get("usage_key"))
                missing_lines.append(f"- {desc}（缺失）")
            parts.append("【缺失材料】\n" + "\n".join(missing_lines))

        # 材料输出提示
        if available_materials or missing_materials:
            parts.append(
                "【材料输出要求】\n"
                "1. 不要编造公司名称、统一社会信用代码、法定代表人等信息\n"
                "2. 缺少信息时标注「待补充」或使用占位符\n"
                "3. 图片材料使用 {{ material:usage_key }} 占位符，后端会自动插入\n"
                "4. 不要描述图片内容或编造证照信息"
            )

        return "\n\n".join(parts)
def get_generation_mode(section: Section, matrix: dict | None = None) -> str:
    """获取章节生成模式（兼容旧接口）。"""
    from apps.outline.services.generation_mode_service import get_generation_mode as _get_mode
    return _get_mode(section, matrix)


def get_strict_generation_rules(generation_mode: str) -> str:
    """获取严格模式生成规则文本（兼容旧接口）。"""
    service = GenerationContextService()
    return service._get_strict_rules(generation_mode)
