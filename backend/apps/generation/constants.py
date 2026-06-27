# backend/apps/generation/constants.py
"""提示词管理枚举常量。"""


# ============================================================================
# 提示词场景
# ============================================================================

class PromptScenario:
    """提示词场景。"""

    OUTLINE_GENERATION = "outline_generation"
    OUTLINE_EXTRACTION = "outline_extraction"           # AI解析招标文件生成大纲
    SECTION_WRITING = "section_writing"
    SECTION_CONTENT_GENERATION = "section_content_generation"  # 正文生成（带矩阵+RAG+模板）
    SECTION_NEEDS_ANALYSIS = "section_needs_analysis"   # 分析章节生成需求
    REQUIREMENT_ANALYSIS = "requirement_analysis"
    REQUIREMENT_RESPONSE = "requirement_response"
    REQUIREMENT_EXTRACTION = "requirement_extraction"
    # 条款抽取细分场景（独立于 TenderChunk）
    REQUIREMENT_EXTRACTION_SCORING = "requirement_extraction_scoring"
    REQUIREMENT_EXTRACTION_MANDATORY = "requirement_extraction_mandatory"
    REQUIREMENT_EXTRACTION_QUALIFICATION = "requirement_extraction_qualification"
    REQUIREMENT_EXTRACTION_COMMERCIAL = "requirement_extraction_commercial"
    REQUIREMENT_EXTRACTION_TECHNICAL = "requirement_extraction_technical"
    REQUIREMENT_EXTRACTION_SUBMISSION = "requirement_extraction_submission"
    # 内容责任矩阵
    CONTENT_MATRIX_GENERATION = "content_matrix_generation"
    CONTENT_MATRIX_GENERATION_V2 = "content_matrix_generation_v2"
    SCORING_ANALYSIS = "scoring_analysis"
    DEVIATION_ANALYSIS = "deviation_analysis"
    EVIDENCE_MATCHING = "evidence_matching"
    CONTENT_POLISHING = "content_polishing"
    CONSISTENCY_CHECK = "consistency_check"
    TENDER_QA = "tender_qa"

    CHOICES = [
        (OUTLINE_GENERATION, "大纲生成"),
        (OUTLINE_EXTRACTION, "大纲提取"),
        (SECTION_WRITING, "章节撰写"),
        (SECTION_CONTENT_GENERATION, "正文生成"),
        (SECTION_NEEDS_ANALYSIS, "章节需求分析"),
        (REQUIREMENT_ANALYSIS, "条款分析"),
        (REQUIREMENT_RESPONSE, "条款响应"),
        (REQUIREMENT_EXTRACTION, "条款抽取"),
        (REQUIREMENT_EXTRACTION_SCORING, "评分项抽取"),
        (REQUIREMENT_EXTRACTION_MANDATORY, "强制条款抽取"),
        (REQUIREMENT_EXTRACTION_QUALIFICATION, "资格要求抽取"),
        (REQUIREMENT_EXTRACTION_COMMERCIAL, "商务条款抽取"),
        (REQUIREMENT_EXTRACTION_TECHNICAL, "技术要求抽取"),
        (REQUIREMENT_EXTRACTION_SUBMISSION, "递交要求抽取"),
        (CONTENT_MATRIX_GENERATION, "内容责任矩阵生成"),
        (CONTENT_MATRIX_GENERATION_V2, "内容责任矩阵生成v2（带公司材料边界）"),
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
    DEEPSEEK = "deepseek"
    DASHSCOPE = "dashscope"
    OPENAI_COMPATIBLE = "openai_compatible"

    CHOICES = [
        (MOCK, "Mock"),
        (DEEPSEEK, "DeepSeek"),
        (DASHSCOPE, "阿里百炼"),
        (OPENAI_COMPATIBLE, "OpenAI 兼容"),
    ]
