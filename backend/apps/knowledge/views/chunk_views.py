# backend/apps/knowledge/views/chunk_views.py
"""分块视图。"""

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