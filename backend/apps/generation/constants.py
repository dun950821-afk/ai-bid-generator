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
    CONTENT_REVISION = "content_revision"               # 质量校验失败后的正文自动修订
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
    # 全局事实变量（借鉴 OpenBidKit globalFactsTask）
    GLOBAL_FACT_EXTRACT = "global_fact_extract"           # 招标文件分段提取候选事实
    GLOBAL_FACT_MERGE = "global_fact_merge"               # 多段候选合并去重
    GLOBAL_FACT_SUPPLEMENT = "global_fact_supplement"     # 知识库/原方案分段补充
    GLOBAL_FACT_FINALIZE = "global_fact_finalize"         # 最终整理
    # 目录审核闭环（借鉴 OpenBidKit outlineWorkflow）
    OUTLINE_REQUIREMENT_GROUPS = "outline_requirement_groups"   # 提取评分大类
    OUTLINE_CHILDREN = "outline_children"                       # 逐大类生成二三级目录
    OUTLINE_REVIEW = "outline_review"                           # 目录审核
    # 正文编排决策（借鉴 OpenBidKit buildChapterContentPlanMessages）
    SECTION_CONTENT_PLAN = "section_content_plan"
    # 废标检查（借鉴 OpenBidKit rejectionPrompts）
    BID_INVALID_ITEMS_EXTRACT = "bid_invalid_items_extract"
    BID_CHECK_ANALYSIS = "bid_check_analysis"
    BID_CHECK_INSPECTION = "bid_check_inspection"
    BID_CHECK_FINAL = "bid_check_final"
    # 一致性审计（借鉴 OpenBidKit contentGenerationTask auditing 阶段）
    CONSISTENCY_AUDIT = "consistency_audit"
    CONSISTENCY_REPAIR = "consistency_repair"
    # 字数不足扩写（借鉴 OpenBidKit expandOneSection）
    SECTION_EXPAND = "section_expand"
    # P3 正文增强四件套
    TABLE_CLEANUP = "table_cleanup"                  # 表格清理（单表判断保留/转文字）
    OUTLINE_EXPAND = "outline_expand"                # 字数补目录（大纲级二三四级子目录扩展）
    MERMAID_ILLUSTRATION = "mermaid_illustration"     # Mermaid 配图代码生成
    IMAGE_GENERATION = "image_generation"            # AI 生图提示词生成
    # 标段级条款去重
    REQUIREMENT_DEDUP_ARBITRATION = "requirement_dedup_arbitration"  # 重复簇保留条款仲裁

    CHOICES = [
        (OUTLINE_GENERATION, "大纲生成"),
        (OUTLINE_EXTRACTION, "大纲提取"),
        (SECTION_WRITING, "章节撰写"),
        (SECTION_CONTENT_GENERATION, "正文生成"),
        (SECTION_NEEDS_ANALYSIS, "章节需求分析"),
        (CONTENT_REVISION, "正文自动修订"),
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
        (GLOBAL_FACT_EXTRACT, "全局事实提取"),
        (GLOBAL_FACT_MERGE, "全局事实合并"),
        (GLOBAL_FACT_SUPPLEMENT, "全局事实补充"),
        (GLOBAL_FACT_FINALIZE, "全局事实定稿"),
        (OUTLINE_REQUIREMENT_GROUPS, "目录评分大类提取"),
        (OUTLINE_CHILDREN, "目录子项生成"),
        (OUTLINE_REVIEW, "目录审核"),
        (SECTION_CONTENT_PLAN, "正文编排决策"),
        (BID_INVALID_ITEMS_EXTRACT, "废标项清单提取"),
        (BID_CHECK_ANALYSIS, "废标检查分析"),
        (BID_CHECK_INSPECTION, "废标检查检查"),
        (BID_CHECK_FINAL, "废标检查定稿"),
        (CONSISTENCY_AUDIT, "一致性审计"),
        (CONSISTENCY_REPAIR, "一致性修复"),
        (SECTION_EXPAND, "字数不足扩写"),
        (TABLE_CLEANUP, "表格清理"),
        (OUTLINE_EXPAND, "字数补目录"),
        (MERMAID_ILLUSTRATION, "Mermaid 配图"),
        (IMAGE_GENERATION, "AI 生图"),
        (REQUIREMENT_DEDUP_ARBITRATION, "条款去重仲裁"),
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
