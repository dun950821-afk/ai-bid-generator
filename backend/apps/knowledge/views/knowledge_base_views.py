# backend/apps/knowledge/views/knowledge_base_views.py
"""知识库视图。"""

from django.utils import timezone
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import RequirePermission
from apps.common.pagination import DefaultPagination
from apps.knowledge.models import KnowledgeBase
from apps.knowledge.serializers import KnowledgeBaseSerializer


class KnowledgeBaseListView(generics.ListCreateAPIView):
    """知识库列表。"""

    serializer_class = KnowledgeBaseSerializer
    permission_classes = [IsAuthenticated, RequirePermission]
    required_permission = "knowledge.manage"
    pagination_class = DefaultPagination

    def get_queryset(self):
        return KnowledgeBase.objects.filter(is_deleted=False).order_by("-created_at")

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class KnowledgeBaseDetailView(generics.RetrieveUpdateDestroyAPIView):
    """知识库详情。"""

    serializer_class = KnowledgeBaseSerializer
    permission_classes = [IsAuthenticated, RequirePermission]
    required_permission = "knowledge.manage"
    lookup_field = "id"

    def get_queryset(self):
        return KnowledgeBase.objects.filter(is_deleted=False)

    def perform_destroy(self, instance):
        # 软删除
        instance.is_deleted = True
        instance.deleted_at = timezone.now()
        instance.save()

    def update(self, request, *args, **kwargs):
        # 只允许 PATCH，不允许 PUT
        if request.method == "PUT":
            return Response(
                {"detail": "不支持 PUT 请求，请使用 PATCH"},
                status=status.HTTP_405_METHOD_NOT_ALLOWED,
            )
        return super().update(request, *args, **kwargs)