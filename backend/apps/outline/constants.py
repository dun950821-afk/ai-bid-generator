# backend/apps/outline/constants.py
"""大纲模块常量定义。"""


class OutlineSource:
    """大纲来源。"""

    PRESET = "preset"
    AI_GENERATED = "ai"

    CHOICES = [
        (PRESET, "系统预设"),
        (AI_GENERATED, "AI解析"),
    ]


class OutlineStatus:
    """大纲状态。"""

    DRAFT = "draft"
    ACTIVE = "active"
    ARCHIVED = "archived"

    CHOICES = [
        (DRAFT, "草稿"),
        (ACTIVE, "活跃"),
        (ARCHIVED, "已归档"),
    ]


class SectionStatus:
    """章节编辑状态。"""

    DRAFT = "draft"
    GENERATED = "generated"
    REVIEWING = "reviewing"
    APPROVED = "approved"
    REJECTED = "rejected"

    CHOICES = [
        (DRAFT, "草稿"),
        (GENERATED, "已生成"),
        (REVIEWING, "待审核"),
        (APPROVED, "已确认"),
        (REJECTED, "已驳回"),
    ]


class SectionGenerationStatus:
    """章节生成状态。"""

    NOT_STARTED = "not_started"
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"

    CHOICES = [
        (NOT_STARTED, "未开始"),
        (PENDING, "等待中"),
        (RUNNING, "生成中"),
        (SUCCESS, "成功"),
        (FAILED, "失败"),
    ]


class SectionVersionSource:
    """章节版本来源。"""

    AI = "ai"
    MANUAL = "manual"

    CHOICES = [
        (AI, "AI生成"),
        (MANUAL, "手动编辑"),
    ]


class GenerationRecordStatus:
    """生成记录状态。"""

    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"

    CHOICES = [
        (PENDING, "等待中"),
        (RUNNING, "运行中"),
        (SUCCESS, "成功"),
        (FAILED, "失败"),
    ]


class SectionRole:
    """章节定位。"""

    QUALIFICATION = "qualification"
    TECHNICAL_SOLUTION = "technical_solution"
    BUSINESS_RESPONSE = "business_response"
    SERVICE_PLAN = "service_plan"
    TEAM_INTRO = "team_intro"
    ATTACHMENT = "attachment"
    OTHER = "other"

    CHOICES = [
        (QUALIFICATION, "资格证明"),
        (TECHNICAL_SOLUTION, "技术方案"),
        (BUSINESS_RESPONSE, "商务响应"),
        (SERVICE_PLAN, "服务方案"),
        (TEAM_INTRO, "团队介绍"),
        (ATTACHMENT, "附件材料"),
        (OTHER, "其他"),
    ]

    MAP = dict(CHOICES)


class ExpressionForm:
    """建议表达形式。"""

    BODY_TEXT = "body_text"
    TABLE = "table"
    COMMITMENT_LETTER = "commitment_letter"
    CERTIFICATE = "certificate"
    ATTACHMENT_INDEX = "attachment_index"
    RESUME_TABLE = "resume_table"
    MIXED = "mixed"

    CHOICES = [
        (BODY_TEXT, "正文"),
        (TABLE, "表格"),
        (COMMITMENT_LETTER, "承诺函"),
        (CERTIFICATE, "证明材料"),
        (ATTACHMENT_INDEX, "附件索引"),
        (RESUME_TABLE, "简历表"),
        (MIXED, "混合形式"),
    ]

    MAP = dict(CHOICES)


class WritingDepth:
    """写作深度。"""

    OVERVIEW = "overview"
    MODERATE = "moderate"
    DETAILED = "detailed"

    CHOICES = [
        (OVERVIEW, "概述"),
        (MODERATE, "适度展开"),
        (DETAILED, "详细展开"),
    ]

    MAP = dict(CHOICES)


class ContentMatrixStatus:
    """矩阵状态。"""

    PENDING = "pending"
    GENERATING = "generating"
    GENERATED = "generated"
    EDITED = "edited"
    FAILED = "failed"

    CHOICES = [
        (PENDING, "待生成"),
        (GENERATING, "生成中"),
        (GENERATED, "已生成"),
        (EDITED, "已编辑"),
        (FAILED, "生成失败"),
    ]

    MAP = dict(CHOICES)


class ContentGenerationStatus:
    """正文生成状态（新增，与现有 SectionGenerationStatus 区分）。"""

    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    SKIPPED = "skipped"

    CHOICES = [
        (PENDING, "待生成"),
        (RUNNING, "生成中"),
        (SUCCESS, "已完成"),
        (FAILED, "生成失败"),
        (SKIPPED, "已跳过"),
    ]

    MAP = dict(CHOICES)


class GenerationTaskType:
    """生成任务类型。"""

    MATRIX_GENERATION = "matrix_generation"
    SECTION_BATCH_GENERATION = "section_batch_generation"

    CHOICES = [
        (MATRIX_GENERATION, "矩阵生成"),
        (SECTION_BATCH_GENERATION, "章节批量生成"),
    ]


class GenerationTaskStatus:
    """生成任务状态。"""

    PENDING = "pending"
    RUNNING = "running"
    PAUSE_REQUESTED = "pause_requested"
    PAUSED = "paused"
    CANCEL_REQUESTED = "cancel_requested"
    CANCELLED = "cancelled"
    COMPLETED = "completed"
    FAILED = "failed"
    PARTIAL_SUCCESS = "partial_success"

    CHOICES = [
        (PENDING, "待执行"),
        (RUNNING, "执行中"),
        (PAUSE_REQUESTED, "请求暂停"),
        (PAUSED, "已暂停"),
        (CANCEL_REQUESTED, "请求取消"),
        (CANCELLED, "已取消"),
        (COMPLETED, "已完成"),
        (FAILED, "失败"),
        (PARTIAL_SUCCESS, "部分成功"),
    ]


# 辅助函数
def get_section_role_display(role_code: str) -> str:
    return SectionRole.MAP.get(role_code, role_code)


def get_expression_form_display(form_code: str) -> str:
    return ExpressionForm.MAP.get(form_code, form_code)


def get_writing_depth_display(depth_code: str) -> str:
    return WritingDepth.MAP.get(depth_code, depth_code)
