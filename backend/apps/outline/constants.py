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
