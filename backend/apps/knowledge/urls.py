# backend/apps/knowledge/urls.py
"""知识库 URL 路由。"""

from django.urls import path

from apps.knowledge.views import (
    KnowledgeBaseListView,
    KnowledgeBaseDetailView,
    DocumentListView,
    DocumentDetailView,
    DocumentCompleteUploadView,
    DocumentDirectUploadView,
    ChunkListView,
    ChunkDetailView,
    RetrievalTestView,
    KnowledgeBaseChunkListView,
)

urlpatterns = [
    # 知识库管理
    path("bases/", KnowledgeBaseListView.as_view(), name="knowledge-base-list"),
    path("bases/<int:id>/", KnowledgeBaseDetailView.as_view(), name="knowledge-base-detail"),

    # 文档管理
    path("bases/<int:kb_id>/documents/", DocumentListView.as_view(), name="document-list"),
    path("bases/<int:kb_id>/documents/upload/", DocumentDirectUploadView.as_view(), name="document-direct-upload"),
    path("documents/<int:id>/", DocumentDetailView.as_view(), name="document-detail"),
    path("documents/<int:id>/complete-upload/", DocumentCompleteUploadView.as_view(), name="document-complete-upload"),

    # 分块管理
    path("documents/<int:doc_id>/chunks/", ChunkListView.as_view(), name="chunk-list"),
    path("chunks/<int:id>/", ChunkDetailView.as_view(), name="chunk-detail"),

    # 按知识库查询分块
    path("bases/<int:kb_id>/chunks/", KnowledgeBaseChunkListView.as_view(), name="knowledge-base-chunk-list"),

    # 检索测试
    path("retrieval/test/", RetrievalTestView.as_view(), name="retrieval-test"),
]