# backend/apps/outline/services/generation_mode_service.py
"""章节生成模式识别服务。

根据章节结构和内容责任矩阵智能识别生成模式，不针对具体章节标题硬编码。

生成模式说明：
- parent_overview: 有子章节的父章节，只写总述和承接
- leaf_content: 普通叶子正文
- table_response: 表格、索引、清单类
- fixed_material: 证明材料、附件材料、扫描件说明类
- commitment: 承诺函、声明类
- resume_or_personnel: 人员、团队、简历类
- case_or_evidence: 案例、业绩、证明类
- summary_or_index: 目录、索引、汇总类
"""

import logging
from typing import Any

from apps.outline.models import Section

logger = logging.getLogger(__name__)


class GenerationMode:
    """生成模式常量。"""

    # 父章节模式
    PARENT_OVERVIEW = "parent_overview"

    # 普通叶子章节
    LEAF_CONTENT = "leaf_content"

    # 表格类
    TABLE_RESPONSE = "table_response"

    # 固定材料类
    FIXED_MATERIAL = "fixed_material"

    # 承诺函类
    COMMITMENT = "commitment"

    # 人员简历类
    RESUME_OR_PERSONNEL = "resume_or_personnel"

    # 案例证明类
    CASE_OR_EVIDENCE = "case_or_evidence"

    # 目录索引类
    SUMMARY_OR_INDEX = "summary_or_index"

    # 兼容旧模式
    STRICT_QUALIFICATION = "strict_qualification"
    STRICT_TABLE = "strict_table"
    STRICT_COMMITMENT = "strict_commitment"
    STRICT_ATTACHMENT_INDEX = "strict_attachment_index"
    STRICT_RESUME = "strict_resume"


class GenerationModeService:
    """章节生成模式识别服务。

    识别依据：
    - 是否有 children
    - content_matrix.section_role
    - content_matrix.expression_form
    - content_matrix.writing_depth
    - content_matrix.write_scope
    - content_matrix.exclude_scope

    不根据具体章节标题写死判断。
    """

    # section_role 到生成模式的映射
    ROLE_MODE_MAP = {
        "qualification": GenerationMode.FIXED_MATERIAL,
        "technical_solution": GenerationMode.LEAF_CONTENT,
        "business_response": GenerationMode.LEAF_CONTENT,
        "service_plan": GenerationMode.LEAF_CONTENT,
        "team_intro": GenerationMode.RESUME_OR_PERSONNEL,
        "attachment": GenerationMode.FIXED_MATERIAL,
        "other": None,  # 需要进一步判断
    }

    # expression_form 到生成模式的映射
    EXPRESSION_FORM_MODE_MAP = {
        "body_text": None,  # 需要进一步判断
        "table": GenerationMode.TABLE_RESPONSE,
        "commitment_letter": GenerationMode.COMMITMENT,
        "certificate": GenerationMode.FIXED_MATERIAL,
        "attachment_index": GenerationMode.SUMMARY_OR_INDEX,
        "resume_table": GenerationMode.RESUME_OR_PERSONNEL,
        "mixed": None,  # 需要进一步判断
    }

    def get_generation_mode(self, section: Section, matrix: dict | None = None) -> str:
        """识别章节生成模式。

        Args:
            section: 章节实例
            matrix: 内容责任矩阵（可选，默认从 section.content_matrix 获取）

        Returns:
            生成模式字符串
        """
        if matrix is None:
            matrix = section.content_matrix or {}

        # 1. 首先检查是否是父章节
        if self._has_children(section):
            return GenerationMode.PARENT_OVERVIEW

        # 2. 基于 section_role 判断
        role = matrix.get("section_role", "")
        if role and self.ROLE_MODE_MAP.get(role):
            return self.ROLE_MODE_MAP[role]

        # 3. 基于 expression_form 判断
        expression_form = matrix.get("expression_form", "body_text")
        if expression_form and self.EXPRESSION_FORM_MODE_MAP.get(expression_form):
            return self.EXPRESSION_FORM_MODE_MAP[expression_form]

        # 4. 基于 write_scope 和 exclude_scope 语义分析
        write_scope = matrix.get("write_scope", "")
        exclude_scope = matrix.get("exclude_scope", "")

        scope_mode = self._infer_mode_from_scope(write_scope, exclude_scope)
        if scope_mode:
            return scope_mode

        # 5. 默认返回普通叶子章节模式
        return GenerationMode.LEAF_CONTENT

    def _has_children(self, section: Section) -> bool:
        """检查章节是否有子章节。"""
        return section.children.exists()

    def _infer_mode_from_scope(self, write_scope: str, exclude_scope: str) -> str | None:
        """从写作范围推断生成模式。

        不针对具体章节标题，而是基于语义特征。
        """
        write_lower = write_scope.lower() if write_scope else ""
        exclude_lower = exclude_scope.lower() if exclude_scope else ""

        # 检查案例/业绩特征
        case_indicators = ["案例", "业绩", "项目经验", "中标", "合同", "成功案例"]
        if any(k in write_lower for k in case_indicators):
            return GenerationMode.CASE_OR_EVIDENCE

        # 检查人员特征
        personnel_indicators = ["人员", "团队", "简历", "资质证书", "项目经理", "技术人员"]
        if any(k in write_lower for k in personnel_indicators):
            return GenerationMode.RESUME_OR_PERSONNEL

        # 检查承诺特征
        commitment_indicators = ["承诺", "声明", "保证", "响应", "偏离"]
        if any(k in write_lower for k in commitment_indicators):
            return GenerationMode.COMMITMENT

        # 检查材料/证明特征
        material_indicators = ["营业执照", "资质", "证书", "证明", "附件", "扫描件"]
        if any(k in write_lower for k in material_indicators):
            return GenerationMode.FIXED_MATERIAL

        # 检查表格/清单特征
        table_indicators = ["表格", "清单", "索引", "目录", "汇总", "一览表"]
        if any(k in write_lower for k in table_indicators):
            return GenerationMode.TABLE_RESPONSE

        return None

    def get_mode_display_name(self, mode: str) -> str:
        """获取生成模式的显示名称。"""
        mode_names = {
            GenerationMode.PARENT_OVERVIEW: "父章节总述",
            GenerationMode.LEAF_CONTENT: "普通正文",
            GenerationMode.TABLE_RESPONSE: "表格响应",
            GenerationMode.FIXED_MATERIAL: "固定材料",
            GenerationMode.COMMITMENT: "承诺函",
            GenerationMode.RESUME_OR_PERSONNEL: "人员简历",
            GenerationMode.CASE_OR_EVIDENCE: "案例证明",
            GenerationMode.SUMMARY_OR_INDEX: "目录索引",
            GenerationMode.STRICT_QUALIFICATION: "资格证明",
            GenerationMode.STRICT_TABLE: "严格表格",
            GenerationMode.STRICT_COMMITMENT: "严格承诺函",
            GenerationMode.STRICT_ATTACHMENT_INDEX: "严格附件索引",
            GenerationMode.STRICT_RESUME: "严格简历表",
        }
        return mode_names.get(mode, "未知模式")

    def get_mode_config(self, mode: str) -> dict[str, Any]:
        """获取生成模式的配置。

        Returns:
            {
                "context_strategy": 上下文构建策略名称,
                "max_rag_channels": 最大 RAG 通道数,
                "include_parent_content": 是否包含父章节内容,
                "include_child_summaries": 是否包含子章节摘要,
                "max_context_sections": 最大上下文章节数,
                "forbidden_content_types": 禁止生成的内容类型,
            }
        """
        configs = {
            GenerationMode.PARENT_OVERVIEW: {
                "context_strategy": "parent_overview",
                "max_rag_channels": 1,  # 只传必要的顶层信息
                "include_parent_content": False,
                "include_child_summaries": True,  # 传子章节列表和矩阵摘要
                "max_context_sections": 5,
                "forbidden_content_types": ["detailed_technical", "case_details", "personnel_details"],
                "description": "只写总述和承接，不展开子章节细节",
            },
            GenerationMode.LEAF_CONTENT: {
                "context_strategy": "full_context",
                "max_rag_channels": 5,
                "include_parent_content": True,
                "include_child_summaries": False,
                "max_context_sections": 10,
                "forbidden_content_types": [],
                "description": "传矩阵、得分点、RAG、上下文章节摘要",
            },
            GenerationMode.TABLE_RESPONSE: {
                "context_strategy": "table_focused",
                "max_rag_channels": 2,  # 只传表格相关素材
                "include_parent_content": False,
                "include_child_summaries": False,
                "max_context_sections": 3,
                "forbidden_content_types": ["detailed_prose", "case_narrative"],
                "description": "重点传表格结构、索引对象、评分点或响应点",
            },
            GenerationMode.FIXED_MATERIAL: {
                "context_strategy": "material_focused",
                "max_rag_channels": 2,  # 公司信息、资质证书
                "include_parent_content": False,
                "include_child_summaries": False,
                "max_context_sections": 2,
                "forbidden_content_types": ["technical_solution", "case_details", "service_plan"],
                "description": "重点传材料要求、提供形式、附件占位规则",
            },
            GenerationMode.COMMITMENT: {
                "context_strategy": "commitment_focused",
                "max_rag_channels": 1,
                "include_parent_content": False,
                "include_child_summaries": False,
                "max_context_sections": 2,
                "forbidden_content_types": ["case_details", "technical_parameters", "pricing"],
                "description": "重点传承诺事项和约束条件",
            },
            GenerationMode.RESUME_OR_PERSONNEL: {
                "context_strategy": "personnel_focused",
                "max_rag_channels": 2,  # 人员资料
                "include_parent_content": False,
                "include_child_summaries": False,
                "max_context_sections": 3,
                "forbidden_content_types": ["technical_solution", "case_narrative", "pricing"],
                "description": "重点传人员字段、角色要求、简历或人员素材",
            },
            GenerationMode.CASE_OR_EVIDENCE: {
                "context_strategy": "case_focused",
                "max_rag_channels": 3,  # 项目业绩、历史标书
                "include_parent_content": True,
                "include_child_summaries": False,
                "max_context_sections": 5,
                "forbidden_content_types": ["fabricated_facts", "unverified_claims"],
                "description": "重点传案例事实、证明材料、评分点",
            },
            GenerationMode.SUMMARY_OR_INDEX: {
                "context_strategy": "summary_focused",
                "max_rag_channels": 0,
                "include_parent_content": True,
                "include_child_summaries": True,  # 需要被汇总章节的信息
                "max_context_sections": 20,  # 可能需要大量章节信息
                "forbidden_content_types": ["detailed_content"],
                "description": "重点传被汇总或被索引章节的信息，不展开详细正文",
            },
            # 兼容旧模式
            GenerationMode.STRICT_QUALIFICATION: {
                "context_strategy": "material_focused",
                "max_rag_channels": 2,
                "include_parent_content": False,
                "include_child_summaries": False,
                "max_context_sections": 2,
                "forbidden_content_types": ["technical_solution", "case_details", "service_plan"],
                "description": "严格资格证明模式",
            },
            GenerationMode.STRICT_TABLE: {
                "context_strategy": "table_focused",
                "max_rag_channels": 2,
                "include_parent_content": False,
                "include_child_summaries": False,
                "max_context_sections": 3,
                "forbidden_content_types": ["detailed_prose", "case_narrative"],
                "description": "严格表格模式",
            },
            GenerationMode.STRICT_COMMITMENT: {
                "context_strategy": "commitment_focused",
                "max_rag_channels": 1,
                "include_parent_content": False,
                "include_child_summaries": False,
                "max_context_sections": 2,
                "forbidden_content_types": ["case_details", "technical_parameters"],
                "description": "严格承诺函模式",
            },
            GenerationMode.STRICT_ATTACHMENT_INDEX: {
                "context_strategy": "summary_focused",
                "max_rag_channels": 0,
                "include_parent_content": False,
                "include_child_summaries": True,
                "max_context_sections": 10,
                "forbidden_content_types": ["detailed_content"],
                "description": "严格附件索引模式",
            },
            GenerationMode.STRICT_RESUME: {
                "context_strategy": "personnel_focused",
                "max_rag_channels": 2,
                "include_parent_content": False,
                "include_child_summaries": False,
                "max_context_sections": 3,
                "forbidden_content_types": ["technical_solution", "case_narrative"],
                "description": "严格简历表模式",
            },
        }

        return configs.get(mode, configs[GenerationMode.LEAF_CONTENT])


# 全局禁止输出规则（适用于所有模式）
GLOBAL_FORBIDDEN_OUTPUT_RULES = """
## 全局禁止输出规则（必须严格遵守）

1. 禁止输出章节编号
   - 不要输出 "一、"、"二、"、"1.1"、"1.2" 等任何形式的章节编号
   - 不要输出 "第X章"、"第X节" 等章节标识

2. 禁止输出章节标题
   - 不要输出当前章节的标题
   - 不要输出 Markdown 标题格式（如 # 标题、## 标题）
   - Section.content 只保存正文内容，标题由系统统一渲染

3. 禁止输出内部引用
   - 不要输出数据库 ID（如 "章节45"、"ID:123"）
   - 不要输出内部编号
   - 引用其他章节时使用 "X.X 章节名称" 格式

4. 禁止输出 AI 解释性文字
   - 不要输出 "以下是生成内容"、"根据要求生成" 等
   - 不要输出 "以上是本章内容" 等结尾语
   - 直接输出正文内容即可

5. 章节编号说明
   - section_number_display 仅供理解当前位置参考
   - 绝对不要将编号输出到正文中
"""


def get_generation_mode(section: Section, matrix: dict | None = None) -> str:
    """获取章节生成模式（兼容旧接口）。

    Args:
        section: 章节实例
        matrix: 内容责任矩阵

    Returns:
        生成模式字符串
    """
    service = GenerationModeService()
    return service.get_generation_mode(section, matrix)


def get_mode_config(mode: str) -> dict[str, Any]:
    """获取生成模式配置。"""
    service = GenerationModeService()
    return service.get_mode_config(mode)


def get_global_forbidden_rules() -> str:
    """获取全局禁止输出规则。"""
    return GLOBAL_FORBIDDEN_OUTPUT_RULES
