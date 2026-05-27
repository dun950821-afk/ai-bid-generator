# backend/apps/generation/constants.py
"""提示词管理枚举常量。"""


# ============================================================================
# 提示词场景
# ============================================================================

class PromptScenario:
    """提示词场景。"""

    OUTLINE_GENERATION = "outline_generation"
    SECTION_WRITING = "section_writing"
    REQUIREMENT_ANALYSIS = "requirement_analysis"
    REQUIREMENT_RESPONSE = "requirement_response"
    SCORING_ANALYSIS = "scoring_analysis"
    DEVIATION_ANALYSIS = "deviation_analysis"
    EVIDENCE_MATCHING = "evidence_matching"
    CONTENT_POLISHING = "content_polishing"
    CONSISTENCY_CHECK = "consistency_check"
    TENDER_QA = "tender_qa"

    CHOICES = [
        (OUTLINE_GENERATION, "大纲生成"),
        (SECTION_WRITING, "章节撰写"),
        (REQUIREMENT_ANALYSIS, "条款分析"),
        (REQUIREMENT_RESPONSE, "条款响应"),
        (SCORING_ANALYSIS, "评分点分析"),
        (DEVIATION_ANALYSIS, "偏离分析"),
        (EVIDENCE_MATCHING, "资料匹配"),
        (CONTENT_POLISHING, "内容润色"),
        (CONSISTENCY_CHECK, "一致性检查"),
        (TENDER_QA, "招标问答"),
    ]


# ============================================================================
# 模板作用域
# ============================================================================

class PromptScope:
    """模板作用域。"""

    SYSTEM = "system"
    TENANT = "tenant"
    PROJECT = "project"
    USER = "user"

    CHOICES = [
        (SYSTEM, "系统级"),
        (TENANT, "企业级"),
        (PROJECT, "项目级"),
        (USER, "用户级"),
    ]


# ============================================================================
# 版本状态
# ============================================================================

class PromptVersionStatus:
    """版本状态。"""

    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"

    CHOICES = [
        (DRAFT, "草稿"),
        (PUBLISHED, "已发布"),
        (ARCHIVED, "已归档"),
    ]


# ============================================================================
# 模型类型
# ============================================================================

class ModelType:
    """模型类型。"""

    CHAT = "chat"
    EMBEDDING = "embedding"
    RERANK = "rerank"

    CHOICES = [
        (CHAT, "对话模型"),
        (EMBEDDING, "嵌入模型"),
        (RERANK, "重排序模型"),
    ]


# ============================================================================
# 运行状态
# ============================================================================

class PromptRunStatus:
    """运行状态。"""

    PENDING = "pending"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    SCHEMA_FAILED = "schema_failed"

    CHOICES = [
        (PENDING, "等待中"),
        (RUNNING, "运行中"),
        (SUCCEEDED, "成功"),
        (FAILED, "失败"),
        (SCHEMA_FAILED, "校验失败"),
    ]


# ============================================================================
# Provider 类型
# ============================================================================

class ProviderType:
    """Provider 类型。"""

    MOCK = "mock"
    DASHSCOPE = "dashscope"
    OPENAI_COMPATIBLE = "openai_compatible"

    CHOICES = [
        (MOCK, "Mock"),
        (DASHSCOPE, "阿里百炼"),
        (OPENAI_COMPATIBLE, "OpenAI 兼容"),
    ]
