# backend/apps/knowledge/views/document_views.py
"""文档视图。"""

import hashlib

from django.db import transaction
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import RequirePermission
from apps.audit.services.audit_service import log_operation
from apps.common.pagination import DefaultPagination
from apps.common.services.storage import ObjectNotFound, StorageService
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

        log_operation(
            actor=request.user,
            request=request,
            action="knowledge.document.init_upload",
            target_type="KnowledgeDocument",
            target_id=str(document.id),
            summary=f"初始化上传文档: {document.file_name}",
            extra={"knowledge_base_id": kb.id, "file_size": document.file_size},
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

        log_operation(
            actor=request.user,
            request=request,
            action="knowledge.document.direct_upload",
            target_type="KnowledgeDocument",
            target_id=str(document.id),
            summary=f"直接上传文档: {document.file_name}",
            extra={"knowledge_base_id": kb.id, "file_size": document.file_size, "task_id": task.id},
        )

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
        return KnowledgeDocument.objects.filter(
            is_deleted=False,
            knowledge_base__is_deleted=False,
        )

    def perform_destroy(self, instance):
        DocumentService().delete_document(instance)
        log_operation(
            actor=self.request.user,
            request=self.request,
            action="knowledge.document.delete",
            target_type="KnowledgeDocument",
            target_id=str(instance.id),
            summary=f"删除文档: {instance.file_name}",
            extra={"knowledge_base_id": instance.knowledge_base_id},
        )


class DocumentCompleteUploadView(APIView):
    """完成文档上传。"""

    permission_classes = [IsAuthenticated, RequirePermission]
    required_permission = "knowledge.manage"

    def post(self, request, id):
        document = get_object_or_404(KnowledgeDocument, id=id, is_deleted=False)
        task = DocumentService().complete_upload(document)

        log_operation(
            actor=request.user,
            request=request,
            action="knowledge.document.complete_upload",
            target_type="KnowledgeDocument",
            target_id=str(document.id),
            summary=f"完成上传文档: {document.file_name}",
            extra={"task_id": task.id},
        )

        return Response({
            "document_id": document.id,
            "status": document.status,
            "task_id": task.id,
        })


class DocumentReprocessView(APIView):
    """重新处理文档（重跑解析 → 分块 → 嵌入 → 索引）。

    用于文档状态 failed 或内容变化后重试。会先清理旧 chunks。
    """

    permission_classes = [IsAuthenticated, RequirePermission]
    required_permission = "knowledge.manage"

    def post(self, request, id):
        from apps.common.models import AsyncTask
        from apps.knowledge.constants import DocumentStatus, ParseStatus, ChunkStatus
        from apps.knowledge.models import KnowledgeChunk
        from apps.knowledge.tasks import process_knowledge_document

        document = get_object_or_404(
            KnowledgeDocument,
            id=id,
            is_deleted=False,
            knowledge_base__is_deleted=False,
        )

        task = AsyncTask.objects.create(
            task_type="knowledge.process_document",
            related_object_type="knowledge.KnowledgeDocument",
            related_object_id=str(document.id),
            created_by=request.user,
        )

        with transaction.atomic():
            KnowledgeChunk.objects.filter(document=document).delete()
            document.status = DocumentStatus.PROCESSING
            document.parse_status = ParseStatus.PENDING
            document.chunk_status = ChunkStatus.PENDING
            document.error_message = ""
            document.parse_task = task
            document.save(update_fields=[
                "status", "parse_status", "chunk_status",
                "error_message", "parse_task",
            ])

        from apps.common.tasks_utils import enqueue_after_commit
        enqueue_after_commit(process_knowledge_document, document.id, task.id)

        log_operation(
            actor=request.user,
            request=request,
            action="knowledge.document.reprocess",
            target_type="KnowledgeDocument",
            target_id=str(document.id),
            summary=f"重新处理文档: {document.file_name}",
            extra={"task_id": task.id},
        )

        return Response({
            "document_id": document.id,
            "status": document.status,
            "task_id": task.id,
        })


class KnowledgeBaseRebuildIndexView(APIView):
    """重建知识库全文索引（search_vector）。

    不重跑解析/分块/嵌入，仅刷新 search_vector 字段。
    """

    permission_classes = [IsAuthenticated, RequirePermission]
    required_permission = "knowledge.manage"

    def post(self, request, kb_id):
        from apps.knowledge.tasks import rebuild_knowledge_base_index

        kb = get_object_or_404(KnowledgeBase, id=kb_id, is_deleted=False)
        rebuild_knowledge_base_index.delay(kb.id)

        log_operation(
            actor=request.user,
            request=request,
            action="knowledge.rebuild_index",
            target_type="KnowledgeBase",
            target_id=str(kb.id),
            summary=f"重建索引: {kb.name}",
        )

        return Response({
            "knowledge_base_id": kb.id,
            "message": "重建索引任务已提交",
        })

class KnowledgeImageListView(generics.ListAPIView):
    """跨知识库的图片文档列表（供编辑器"从知识库插图"选择）。

    只读接口，登录即可访问（与编辑器使用场景匹配，不要求 knowledge.manage）。
    """

    serializer_class = KnowledgeDocumentSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = DefaultPagination

    def get_queryset(self):
        queryset = KnowledgeDocument.objects.filter(
            is_deleted=False,
            knowledge_base__is_deleted=False,
            mime_type__startswith="image/",
        ).exclude(file_uri="").select_related("knowledge_base").order_by("-created_at")

        search = self.request.query_params.get("search")
        if search:
            queryset = queryset.filter(file_name__icontains=search)
        return queryset


class DocumentFileView(APIView):
    """同源代理文档文件内容（编辑器插图缩略图等场景）。

    知识库文件在 MinIO 私有前缀，浏览器直接访问不到；由后端代理输出。
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, id):
        document = get_object_or_404(
            KnowledgeDocument, id=id, is_deleted=False,
        )
        if not document.file_uri:
            return Response({"detail": "文件不存在"}, status=status.HTTP_404_NOT_FOUND)
        try:
            data = StorageService().get_object(document.file_uri)
        except ObjectNotFound:
            return Response({"detail": "文件不存在"}, status=status.HTTP_404_NOT_FOUND)
        return HttpResponse(
            data,
            content_type=document.mime_type or "application/octet-stream",
        )


class DocumentCopyToEditorView(APIView):
    """把知识库图片复制到编辑器公开图床，返回可持久引用的 URL。"""

    permission_classes = [IsAuthenticated]

    def post(self, request, id):
        document = get_object_or_404(
            KnowledgeDocument, id=id, is_deleted=False,
        )
        if not document.file_uri:
            return Response({"detail": "文件不存在"}, status=status.HTTP_404_NOT_FOUND)
        if not (document.mime_type or "").startswith("image/"):
            return Response(
                {"detail": "仅图片文档支持插入编辑器"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        url = StorageService().copy_to_editor_images(document.file_uri, document.mime_type)

        log_operation(
            actor=request.user,
            request=request,
            action="knowledge.document.copy_to_editor",
            target_type="KnowledgeDocument",
            target_id=str(document.id),
            summary=f"知识库图片插入编辑器: {document.file_name}",
            extra={"knowledge_base_id": document.knowledge_base_id},
        )
        return Response({"url": url})
