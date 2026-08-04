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
        "requirement_type": {
            "type": "string",
            "description": "条款类型（必须为枚举之一）",
            "enum": [
                "qualification", "tech_req", "scoring",
                "commercial", "submission", "legal",
            ],
        },
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


# ============================================================================
# 误分类过滤关键词（程序侧兜底，防止模型偶发把非本场景内容混入）
#
# 三级策略：
#   一级（hard）：标题精确命中 -> 直接丢弃并记日志
#   二级（suspected）：内容命中 -> 保留并软标记（filter_status=suspected）+ 记日志
#   三级：优先信任原文评分分类结构（提示词侧约束，代码不做关键词覆盖）
# ============================================================================

# technical（技术需求）场景：标题命中即丢弃。
# 只放明确不可能成为技术需求的纯商务/资格/程序词；3.1 起不再放可能误杀技术标题的词
# （如「投标文件制作」「类似项目业绩」等已降级为软标记，见 TECHNICAL_SUSPECT_KEYWORDS）。
TECHNICAL_HARD_FILTER_TITLES = [
    "价格评审", "报价得分", "投标报价", "商务报价", "价格得分",
    "注册资本", "企业规模", "财务状况", "纳税情况", "财务审计",
    "企业信用", "信用情况", "企业荣誉", "企业认证",
    "资格审查", "资格预审", "符合性审查", "废标条件",
    "付款条件", "合同价款", "履约保证金", "投标保证金",
    "开标时间", "投标截止",
]

# technical 场景：内容命中只软标记，不删除。
# 例：「项目经理应具备相关技术资格证书」命中「资格」，但属于团队技术能力评分。
# 用户明确：资质/证书/人员/业绩/合同/服务/响应等词不得作为内容硬删除条件。
TECHNICAL_SUSPECT_KEYWORDS = [
    "资质", "证书", "业绩", "合同", "付款", "报价",
    "资格", "注册资金", "保证金", "纳税", "营业执照",
    "投标文件制作", "类似项目业绩", "企业项目业绩", "法律条款", "合规声明",
]

# scoring 场景：标题命中且无分值（score 为 null）才丢弃。
# 有分值的评分项必须保留（例：「具有ISO 27001认证得2分」是明确评分项）。
SCORING_HARD_FILTER_TITLES = [
    "资格审查", "资格预审", "符合性审查", "废标条件",
    "投标文件递交", "递交要求", "开标时间", "投标截止",
]