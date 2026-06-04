# backend/apps/requirements/constants.py
"""条款抽取相关常量。"""

from apps.generation.constants import PromptScenario


# ============================================================================
# 抽取类型 -> PromptScenario 映射
# ============================================================================

TYPE_TO_SCENARIO = {
    "scoring": PromptScenario.REQUIREMENT_EXTRACTION_SCORING,
    "mandatory": PromptScenario.REQUIREMENT_EXTRACTION_MANDATORY,
    "qualification": PromptScenario.REQUIREMENT_EXTRACTION_QUALIFICATION,
    "commercial": PromptScenario.REQUIREMENT_EXTRACTION_COMMERCIAL,
    "technical": PromptScenario.REQUIREMENT_EXTRACTION_TECHNICAL,
    "submission": PromptScenario.REQUIREMENT_EXTRACTION_SUBMISSION,
}

# 支持的抽取类型列表
EXTRACTION_TYPES = list(TYPE_TO_SCENARIO.keys())

EXTRACTION_TYPE_NAMES = {
    "scoring": "评分项",
    "mandatory": "强制条款",
    "qualification": "资格要求",
    "commercial": "商务条款",
    "technical": "技术要求",
    "submission": "递交要求",
}


# ============================================================================
# RequirementExtractionRun 状态
# ============================================================================

class ExtractionRunStatus:
    """条款抽取运行状态。"""

    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    PARTIAL_SUCCESS = "partial_success"
    FAILED = "failed"
    CANCELLED = "cancelled"

    CHOICES = [
        (PENDING, "等待中"),
        (RUNNING, "运行中"),
        (SUCCESS, "成功"),
        (PARTIAL_SUCCESS, "部分成功"),
        (FAILED, "失败"),
        (CANCELLED, "已取消"),
    ]


# ============================================================================
# LLM 输出 JSON Schema
# ============================================================================

REQUIREMENT_ITEM_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string", "description": "条款标题"},
        "content": {"type": "string", "description": "条款内容"},
        "requirement_type": {"type": "string", "description": "条款类型"},
        "source_text": {"type": "string", "description": "原文依据"},
        "source_section": {"type": "string", "description": "章节位置"},
        "source_page": {"type": "integer", "nullable": True, "description": "页码"},
        "is_mandatory": {"type": "boolean", "description": "是否强制"},
        "is_rejection_clause": {"type": "boolean", "description": "是否废标条款"},
        "score": {"type": "number", "nullable": True, "description": "分值"},
        "confidence": {"type": "number", "minimum": 0, "maximum": 1, "description": "置信度"},
    },
    "required": ["title", "content", "requirement_type"],
}

REQUIREMENT_OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "items": {
            "type": "array",
            "items": REQUIREMENT_ITEM_SCHEMA,
        },
    },
    "required": ["items"],
}