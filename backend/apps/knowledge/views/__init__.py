# backend/apps/knowledge/views/__init__.py
"""知识库视图。"""

from .knowledge_base_views import KnowledgeBaseListView, KnowledgeBaseDetailView
from .document_views import (
    DocumentListView,
    DocumentDetailView,
    DocumentCompleteUploadView,
    DocumentDirectUploadView,
)
from .chunk_views import ChunkListView, ChunkDetailView, KnowledgeBaseChunkListView
from .retrieval_views import RetrievalTestView

__all__ = [
    "KnowledgeBaseListView",
    "KnowledgeBaseDetailView",
    "DocumentListView",
    "DocumentDetailView",
    "DocumentCompleteUploadView",
    "DocumentDirectUploadView",
    "ChunkListView",
    "ChunkDetailView",
    "KnowledgeBaseChunkListView",
    "RetrievalTestView",
]