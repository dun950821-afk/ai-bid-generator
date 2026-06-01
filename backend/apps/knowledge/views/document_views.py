# backend/apps/knowledge/views/document_views.py
"""文档视图。"""

import hashlib

from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import RequirePermission
from apps.common.pagination import DefaultPagination
from apps.knowledge.models import KnowledgeBase, KnowledgeDocument
from apps.knowledge.serializers import (
    KnowledgeDocumentSerializer,
    DocumentInitUploadSerializer,
)
from apps.knowledge.services.document_service import DocumentService


class DocumentListView(generics.ListCreateAPIView):
    """文档列表。"""

    serializer_class = KnowledgeDocumentSerializer
    permission_classes = [IsAuthenticated, RequirePermission]
    required_permission = "knowledge.manage"
    pagination_class = DefaultPagination

    def get_queryset(self):
        kb_id = self.kwargs["kb_id"]
        return KnowledgeDocument.objects.filter(
            knowledge_base_id=kb_id,
            is_deleted=False,
        ).order_by("-created_at")

    def create(self, request, *args, **kwargs):
        """创建文档并返回上传 URL。"""
        kb_id = self.kwargs["kb_id"]
        kb = get_object_or_404(KnowledgeBase, id=kb_id, is_deleted=False)

        serializer = DocumentInitUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data

        document, upload_url, upload_fields = DocumentService().init_upload(
            knowledge_base=kb,
            file_name=data["file_name"],
            file_size=data["file_size"],
            file_hash=data["file_hash"],
            mime_type=data.get("mime_type", "application/octet-stream"),
            created_by=request.user,
        )

        return Response(
            {
                "document_id": document.id,
                "upload_url": upload_url,
                "upload_fields": upload_fields,
                "object_key": document.file_uri,
                "expires_in": 3600,
            },
            status=status.HTTP_201_CREATED,
        )


class DocumentDirectUploadView(APIView):
    """直接上传文档（代理上传，后端计算文件哈希）。

    用于不支持 crypto.subtle 的非安全上下文环境。
    """

    permission_classes = [IsAuthenticated, RequirePermission]
    required_permission = "knowledge.manage"

    def post(self, request, kb_id):
        kb = get_object_or_404(KnowledgeBase, id=kb_id, is_deleted=False)

        uploaded_file = request.FILES.get("file")
        if not uploaded_file:
            return Response({"detail": "未提供文件"}, status=status.HTTP_400_BAD_REQUEST)

        # 计算文件哈希
        file_hash = hashlib.sha256()
        for chunk in uploaded_file.chunks():
            file_hash.update(chunk)
        file_hash_str = file_hash.hexdigest()

        # 重置文件指针以便后续读取
        uploaded_file.seek(0)

        # 初始化上传
        document, upload_url, upload_fields = DocumentService().init_upload(
            knowledge_base=kb,
            file_name=uploaded_file.name,
            file_size=uploaded_file.size,
            file_hash=file_hash_str,
            mime_type=uploaded_file.content_type or "application/octet-stream",
            created_by=request.user,
        )

        # 直接上传到 MinIO
        from apps.common.services.storage import StorageService
        storage = StorageService()
        storage.upload_fileobj(uploaded_file, document.file_uri)

        # 完成上传
        task = DocumentService().complete_upload(document)

        return Response(
            {
                "document_id": document.id,
                "status": document.status,
                "task_id": task.id,
            },
            status=status.HTTP_201_CREATED,
        )


class DocumentDetailView(generics.RetrieveDestroyAPIView):
    """文档详情。"""

    serializer_class = KnowledgeDocumentSerializer
    permission_classes = [IsAuthenticated, RequirePermission]
    required_permission = "knowledge.manage"
    lookup_field = "id"

    def get_queryset(self):
        return KnowledgeDocument.objects.filter(is_deleted=False)

    def perform_destroy(self, instance):
        DocumentService().delete_document(instance)


class DocumentCompleteUploadView(APIView):
    """完成文档上传。"""

    permission_classes = [IsAuthenticated, RequirePermission]
    required_permission = "knowledge.manage"

    def post(self, request, id):
        document = get_object_or_404(KnowledgeDocument, id=id, is_deleted=False)
        task = DocumentService().complete_upload(document)

        return Response({
            "document_id": document.id,
            "status": document.status,
            "task_id": task.id,
        })