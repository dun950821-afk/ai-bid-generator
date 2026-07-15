# backend/apps/knowledge/views/knowledge_base_views.py
"""知识库视图。"""

from django.utils import timezone
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import RequirePermission
from apps.audit.services.audit_service import log_operation
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
        kb = serializer.save(created_by=self.request.user)
        log_operation(
            actor=self.request.user,
            request=self.request,
            action="knowledge.create",
            target_type="KnowledgeBase",
            target_id=str(kb.id),
            summary=f"创建知识库: {kb.name}",
            extra={"kb_type": kb.kb_type, "visibility": kb.visibility},
        )


class KnowledgeBaseDetailView(generics.RetrieveUpdateDestroyAPIView):
    """知识库详情。"""

    serializer_class = KnowledgeBaseSerializer
    permission_classes = [IsAuthenticated, RequirePermission]
    required_permission = "knowledge.manage"
    lookup_field = "id"

    def get_queryset(self):
        return KnowledgeBase.objects.filter(is_deleted=False)

    def perform_update(self, serializer):
        before = {
            "name": serializer.instance.name,
            "description": serializer.instance.description,
            "is_active": serializer.instance.is_active,
        }
        kb = serializer.save()
        log_operation(
            actor=self.request.user,
            request=self.request,
            action="knowledge.update",
            target_type="KnowledgeBase",
            target_id=str(kb.id),
            summary=f"更新知识库: {kb.name}",
            extra={"before": before, "after": {"name": kb.name, "description": kb.description, "is_active": kb.is_active}},
        )

    def perform_destroy(self, instance):
        # 软删除
        instance.is_deleted = True
        instance.deleted_at = timezone.now()
        instance.save(update_fields=["is_deleted", "deleted_at"])
        log_operation(
            actor=self.request.user,
            request=self.request,
            action="knowledge.delete",
            target_type="KnowledgeBase",
            target_id=str(instance.id),
            summary=f"删除知识库: {instance.name}",
        )

    def update(self, request, *args, **kwargs):
        # 只允许 PATCH，不允许 PUT
        if request.method == "PUT":
            return Response(
                {"detail": "不支持 PUT 请求，请使用 PATCH"},
                status=status.HTTP_405_METHOD_NOT_ALLOWED,
            )
        return super().update(request, *args, **kwargs)