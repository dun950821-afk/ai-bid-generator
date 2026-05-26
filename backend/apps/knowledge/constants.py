# backend/apps/knowledge/constants.py
"""知识库常量定义。"""


class KnowledgeBaseType:
    """知识库类型。"""

    COMPANY_PROFILE = "company_profile"
    CASE_LIBRARY = "case_library"
    QUALIFICATION = "qualification"
    PRODUCT = "product"
    BID_HISTORY = "bid_history"
    TECHNICAL_SOLUTION = "technical_solution"

    CHOICES = [
        (COMPANY_PROFILE, "公司介绍"),
        (CASE_LIBRARY, "项目案例库"),
        (QUALIFICATION, "资质证书库"),
        (PRODUCT, "产品资料库"),
        (BID_HISTORY, "历史标书库"),
        (TECHNICAL_SOLUTION, "技术方案库"),
    ]


class KnowledgeBaseVisibility:
    """知识库可见范围。"""

    SYSTEM = "system"
    TENANT = "tenant"
    PROJECT = "project"
    PRIVATE = "private"

    CHOICES = [
        (SYSTEM, "系统级"),
        (TENANT, "企业级"),
        (PROJECT, "项目级"),
        (PRIVATE, "私有"),
    ]

    # P0 允许创建的范围
    P0_ALLOWED = [PRIVATE, SYSTEM]


class DocumentStatus:
    """文档总状态。"""

    UPLOADING = "uploading"
    PROCESSING = "processing"
    READY = "ready"
    FAILED = "failed"

    CHOICES = [
        (UPLOADING, "上传中"),
        (PROCESSING, "处理中"),
        (READY, "可用"),
        (FAILED, "失败"),
    ]


class ParseStatus:
    """解析状态。"""

    PENDING = "pending"
    PARSING = "parsing"
    PARSED = "parsed"
    FAILED = "failed"

    CHOICES = [
        (PENDING, "待解析"),
        (PARSING, "解析中"),
        (PARSED, "已解析"),
        (FAILED, "解析失败"),
    ]


class ChunkStatus:
    """分块状态。"""

    PENDING = "pending"
    CHUNKING = "chunking"
    CHUNKED = "chunked"
    FAILED = "failed"

    CHOICES = [
        (PENDING, "待分块"),
        (CHUNKING, "分块中"),
        (CHUNKED, "已分块"),
        (FAILED, "分块失败"),
    ]


class EmbeddingStatus:
    """嵌入状态。"""

    SKIPPED = "skipped"
    PENDING = "pending"
    PROCESSING = "processing"
    DONE = "done"
    FAILED = "failed"

    CHOICES = [
        (SKIPPED, "跳过"),
        (PENDING, "待嵌入"),
        (PROCESSING, "嵌入中"),
        (DONE, "已嵌入"),
        (FAILED, "嵌入失败"),
    ]


class IndexStatus:
    """索引状态。"""

    PENDING = "pending"
    INDEXING = "indexing"
    INDEXED = "indexed"
    FAILED = "failed"

    CHOICES = [
        (PENDING, "待索引"),
        (INDEXING, "索引中"),
        (INDEXED, "已索引"),
        (FAILED, "索引失败"),
    ]


class ChunkType:
    """分块类型。"""

    PARAGRAPH = "paragraph"
    TABLE = "table"
    LIST = "list"
    HEADING = "heading"
    CODE = "code"
    GENERAL = "general"

    CHOICES = [
        (PARAGRAPH, "段落"),
        (TABLE, "表格"),
        (LIST, "列表"),
        (HEADING, "标题"),
        (CODE, "代码"),
        (GENERAL, "通用"),
    ]


class RetrievalMode:
    """检索模式。"""

    POSTGRES_FULLTEXT = "postgres_fulltext"
    KEYWORD = "keyword"
    VECTOR = "vector"
    HYBRID = "hybrid"
    HYBRID_RERANK = "hybrid_rerank"

    CHOICES = [
        (POSTGRES_FULLTEXT, "PostgreSQL全文检索"),
        (KEYWORD, "关键词匹配"),
        (VECTOR, "向量检索"),
        (HYBRID, "混合检索"),
        (HYBRID_RERANK, "混合检索+重排序"),
    ]


# 分块配置
MIN_CHUNK_SIZE = 50
MAX_CHUNK_TOKENS = 512
CHUNKER_VERSION = "knowledge-chunker-v1"
