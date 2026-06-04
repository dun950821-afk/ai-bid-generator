# backend/apps/tender/constants.py
"""招标文件解析枚举常量和版本常量。"""

from django.db import models


# ============================================================================
# 处理器版本常量
# ============================================================================

PARSER_VERSION = "real-parser-v1"
CHUNKER_VERSION = "rule-chunker-v1"
REQUIREMENT_EXTRACTOR_VERSION = "rule-requirement-v1"
EMBEDDER_VERSION = "bailian-embedding-v1"  # 阿里百炼 text-embedding-v4


# ============================================================================
# 流水线阶段和状态
# ============================================================================

class PipelineStage:
    """流水线阶段。"""

    PARSE = "parse"
    CHUNK = "chunk"
    REQUIREMENT_EXTRACT = "requirement_extract"
    EMBEDDING = "embedding"

    CHOICES = [
        (PARSE, "文档解析"),
        (CHUNK, "语义分块"),
        (REQUIREMENT_EXTRACT, "条款抽取"),
        (EMBEDDING, "向量嵌入"),
    ]


class PipelineStatus:
    """流水线状态。"""

    PENDING = "pending"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"

    CHOICES = [
        (PENDING, "等待中"),
        (RUNNING, "运行中"),
        (SUCCEEDED, "成功"),
        (FAILED, "失败"),
    ]


# ============================================================================
# 分块类型和层级
# ============================================================================

class ChunkType:
    """分块类型（9类）。"""

    QUALIFICATION = "qualification"
    SCORING = "scoring"
    TECH_REQ = "tech_req"
    COMMERCIAL = "commercial"
    LEGAL = "legal"
    SUBMISSION = "submission"
    CLARIFICATION = "clarification"
    SCHEDULE = "schedule"
    GENERAL = "general"

    CHOICES = [
        (QUALIFICATION, "资格要求"),
        (SCORING, "评分办法"),
        (TECH_REQ, "技术要求"),
        (COMMERCIAL, "商务条款"),
        (LEGAL, "法律条款"),
        (SUBMISSION, "投标递交"),
        (CLARIFICATION, "澄清补遗"),
        (SCHEDULE, "时间节点"),
        (GENERAL, "其他说明"),
    ]


class ChunkLevel:
    """分块层级。"""

    SECTION = "section"
    CLAUSE = "clause"
    WINDOW = "window"

    CHOICES = [
        (SECTION, "章节"),
        (CLAUSE, "条款"),
        (WINDOW, "窗口"),
    ]


# ============================================================================
# 强制程度和风险等级
# ============================================================================

class MandatoryLevel:
    """强制程度。"""

    MANDATORY = "mandatory"
    IMPORTANT = "important"
    OPTIONAL = "optional"
    UNKNOWN = "unknown"

    CHOICES = [
        (MANDATORY, "强制"),
        (IMPORTANT, "重要"),
        (OPTIONAL, "可选"),
        (UNKNOWN, "未知"),
    ]


class RiskLevel:
    """风险等级。"""

    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    UNKNOWN = "unknown"

    CHOICES = [
        (HIGH, "高"),
        (MEDIUM, "中"),
        (LOW, "低"),
        (UNKNOWN, "未知"),
    ]


# ============================================================================
# 响应策略和模板类型
# ============================================================================

class ResponseStrategy:
    """响应策略。"""

    PENDING_REVIEW = "pending_review"
    COMPLY = "comply"
    PARTIAL = "partial"
    DEVIATION = "deviation"
    EXPLAIN = "explain"
    PROVIDE_MATERIAL = "provide_material"

    CHOICES = [
        (PENDING_REVIEW, "待确认"),
        (COMPLY, "完全响应"),
        (PARTIAL, "部分响应"),
        (DEVIATION, "偏离"),
        (EXPLAIN, "需要说明"),
        (PROVIDE_MATERIAL, "提供材料"),
    ]


class ResponseTemplateType:
    """响应模板类型。"""

    COMMITMENT = "commitment"
    EVIDENCE = "evidence"
    TABLE = "table"
    NARRATIVE = "narrative"
    ATTACHMENT = "attachment"

    CHOICES = [
        (COMMITMENT, "承诺函"),
        (EVIDENCE, "证明材料"),
        (TABLE, "表格"),
        (NARRATIVE, "叙述文本"),
        (ATTACHMENT, "附件"),
    ]


# ============================================================================
# 责任角色
# ============================================================================

class OwnerRole:
    """责任角色。"""

    BID_MANAGER = "bid_manager"
    SALES = "sales"
    TECH = "tech"
    LEGAL = "legal"
    FINANCE = "finance"
    PROJECT_MANAGER = "project_manager"
    OTHER = "other"

    CHOICES = [
        (BID_MANAGER, "投标经理"),
        (SALES, "销售"),
        (TECH, "技术"),
        (LEGAL, "法务"),
        (FINANCE, "财务"),
        (PROJECT_MANAGER, "项目经理"),
        (OTHER, "其他"),
    ]


# ============================================================================
# 解析质量和嵌入状态
# ============================================================================

class ParseQuality:
    """解析质量。"""

    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"

    CHOICES = [
        (HIGH, "高"),
        (MEDIUM, "中"),
        (LOW, "低"),
    ]


class EmbeddingStatus:
    """嵌入状态。"""

    PENDING = "pending"
    DONE = "done"
    FAILED = "failed"
    SKIPPED = "skipped"

    CHOICES = [
        (PENDING, "待嵌入"),
        (DONE, "已完成"),
        (FAILED, "失败"),
        (SKIPPED, "跳过"),
    ]


class ExtractionMethod:
    """抽取方法。"""

    RULE = "rule"
    LLM = "llm"
    HYBRID = "hybrid"
    MANUAL = "manual"

    CHOICES = [
        (RULE, "规则"),
        (LLM, "LLM"),
        (HYBRID, "混合"),
        (MANUAL, "人工"),
    ]


class ReviewStatus:
    """审核状态。"""

    PENDING = "pending"
    REVIEWED = "reviewed"
    CONFIRMED = "confirmed"
    REJECTED = "rejected"

    CHOICES = [
        (PENDING, "待审核"),
        (REVIEWED, "已审核"),
        (CONFIRMED, "已确认"),
        (REJECTED, "已驳回"),
    ]


class RequirementType:
    """条款类型（11类）。"""

    QUALIFICATION = "qualification"
    TECH_REQ = "tech_req"
    SCORING = "scoring"
    COMMERCIAL = "commercial"
    LEGAL = "legal"
    SUBMISSION = "submission"
    SCHEDULE = "schedule"
    MATERIAL = "material"
    FORMAT = "format"
    CLARIFICATION = "clarification"
    OTHER = "other"

    CHOICES = [
        (QUALIFICATION, "资格要求"),
        (TECH_REQ, "技术要求"),
        (SCORING, "评分项"),
        (COMMERCIAL, "商务条款"),
        (LEGAL, "合同法律"),
        (SUBMISSION, "投标递交要求"),
        (SCHEDULE, "履约周期"),
        (MATERIAL, "材料要求"),
        (FORMAT, "文件格式要求"),
        (CLARIFICATION, "澄清补遗"),
        (OTHER, "其他"),
    ]


# ============================================================================
# 解析质量和嵌入状态
# ============================================================================

CHUNK_TYPE_KEYWORDS = {
    ChunkType.QUALIFICATION: [
        "资格要求", "资质要求", "投标人资格", "准入条件",
        "资格审查", "资格条件", "资质条件",
    ],
    ChunkType.SCORING: [
        "评分标准", "评标办法", "得分", "分值",
        "评分细则", "评分方法", "评标方法",
    ],
    ChunkType.TECH_REQ: [
        "技术参数", "技术规格", "技术要求", "性能指标",
        "技术标准", "技术指标", "技术规范",
    ],
    ChunkType.COMMERCIAL: [
        "报价", "付款方式", "投标保证金", "商务条款",
        "合同价款", "结算方式", "支付方式",
    ],
    ChunkType.LEGAL: [
        "合同条款", "违约责任", "争议解决", "法律适用",
        "合同生效", "合同终止", "索赔",
    ],
    ChunkType.SUBMISSION: [
        "投标截止", "开标时间", "投标文件", "递交",
        "密封", "签章", "盖章", "签字", "授权",
    ],
    ChunkType.CLARIFICATION: [
        "澄清", "补遗", "更正", "修改通知",
        "答疑", "补充通知",
    ],
    ChunkType.SCHEDULE: [
        "交付期限", "服务期", "质保期", "实施周期",
        "项目周期", "工期", "服务期限",
    ],
}


# ============================================================================
# 强制条款识别
# ============================================================================

MANDATORY_KEYWORDS = [
    "必须", "不得", "应当", "应",
    "否则作废标处理", "废标",
    "否则视为", "视为放弃",
    "不符合要求", "不满足",
    "实质性要求", "关键条款",
]

MANDATORY_SYMBOLS = ["★", "※", "●"]

# * 后面紧跟强制关键词才识别
MANDATORY_STAR_PATTERN = r"\*[\s]*(必须|不得|应|废标|实质性要求)"


# ============================================================================
# 特征提取正则
# ============================================================================

DEADLINE_PATTERNS = [
    r"\d{4}年\d{1,2}月\d{1,2}日",
    r"\d{4}-\d{2}-\d{2}",
    r"截止.*\d+.*日",
]

AMOUNT_PATTERNS = [
    r"\d+(\.\d+)?\s*万元",
    r"\d+(\.\d+)?\s*元",
    r"人民币.*\d+",
]

SCORE_PATTERNS = [
    r"\d+分",
    r"得分.*\d+",
    r"分值.*\d+",
]

PENALTY_KEYWORDS = [
    "违约金", "罚款", "扣款", "赔偿",
    "处罚", "惩罚", "扣分",
]