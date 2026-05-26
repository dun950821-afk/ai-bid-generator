"""知识库模型（兼容导入）。"""

from apps.knowledge.models import (
    KnowledgeBase,
    KnowledgeDocument,
    KnowledgeChunk,
    RetrievalLog,
)

__all__ = [
    "KnowledgeBase",
    "KnowledgeDocument",
    "KnowledgeChunk",
    "RetrievalLog",
]