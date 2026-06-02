# backend/apps/knowledge/views/chunk_views.py
"""分块视图。"""

from django.contrib.postgres.search import SearchVector
from django.db.models import Q
from rest_framework import generics
from rest_framework.permissions import IsAuthenticated

from apps.accounts.permissions import RequirePermission
from apps.common.pagination import DefaultPagination
from apps.knowledge.models import KnowledgeChunk
from apps.knowledge.serializers import KnowledgeChunkSerializer


class ChunkListView(generics.ListAPIView):
    """分块列表。"""

    serializer_class = KnowledgeChunkSerializer
    permission_classes = [IsAuthenticated, RequirePermission]
    required_permission = "knowledge.manage"
    pagination_class = DefaultPagination

    def get_queryset(self):
        doc_id = self.kwargs["doc_id"]
        return KnowledgeChunk.objects.filter(
            document_id=doc_id,
            document__is_deleted=False,
            document__knowledge_base__is_deleted=False,
        ).order_by("chunk_index")


class ChunkDetailView(generics.RetrieveAPIView):
    """分块详情。"""

    serializer_class = KnowledgeChunkSerializer
    permission_classes = [IsAuthenticated, RequirePermission]
    required_permission = "knowledge.manage"
    lookup_field = "id"

    def get_queryset(self):
        return KnowledgeChunk.objects.filter(
            document__is_deleted=False,
            document__knowledge_base__is_deleted=False,
        )


class KnowledgeBaseChunkListView(generics.ListAPIView):
    """按知识库查询分块列表。"""

    serializer_class = KnowledgeChunkSerializer
    permission_classes = [IsAuthenticated, RequirePermission]
    required_permission = "knowledge.view"
    pagination_class = DefaultPagination

    def get_queryset(self):
        kb_id = self.kwargs["kb_id"]
        queryset = KnowledgeChunk.objects.filter(
            document__knowledge_base_id=kb_id,
            document__is_deleted=False,
            document__knowledge_base__is_deleted=False,
        ).select_related("document")

        # 按 document_id 筛选
        document_id = self.request.query_params.get("document_id")
        if document_id:
            queryset = queryset.filter(document_id=document_id)

        # 按 keyword 搜索
        keyword = self.request.query_params.get("keyword")
        if keyword:
            queryset = queryset.filter(
                Q(title__icontains=keyword) | Q(content__icontains=keyword)
            )

        return queryset.order_by("document_id", "chunk_index")