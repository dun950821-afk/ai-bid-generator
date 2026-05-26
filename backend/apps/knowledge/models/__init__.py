# backend/apps/knowledge/models/__init__.py
"""知识库模型。"""

from .knowledge_base import KnowledgeBase
from .knowledge_document import KnowledgeDocument
from .knowledge_chunk import KnowledgeChunk
from .retrieval_log import RetrievalLog

__all__ = [
    "KnowledgeBase",
    "KnowledgeDocument",
    "KnowledgeChunk",
    "RetrievalLog",
]
