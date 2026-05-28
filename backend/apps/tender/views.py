"""招标文件相关视图。"""

from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from django.db.models import Count, Q

from apps.accounts.permissions import MustChangePasswordPermission, RequirePermission
from apps.common.exceptions import NotFound, ValidationError
from apps.projects.models import Project
from apps.tender.models import TenderFile, ParsedDocument, TenderChunk, PipelineJob
from apps.tender.serializers import (
    TenderFileSerializer,
    ParsedDocumentSerializer,
    TenderChunkSerializer,
    TenderChunkListSerializer,
    PipelineJobSerializer,
    ChunkStatsSerializer,
    ParseDebugSerializer,
    ChunkDebugSerializer,
)
from apps.tender.services.upload_service import TenderUploadService


class InitUploadView(APIView):
    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "tender.upload"
    required_scope = "project"

    def post(self, request):
        from apps.tender.serializers import InitUploadSerializer
        serializer = InitUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        result = TenderUploadService().init_upload(
            project=data["project"],
            lot=data["lot"],
            file_name=data["file_name"],
            file_size=data["file_size"],
            content_type=data.get("content_type", ""),
            file_category=data["file_category"],
            user=request.user,
        )
        return Response(result)


class CompleteUploadView(APIView):
    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "tender.upload"
    required_scope = "project"

    def get_permission_project(self, request):
        tender_file = (
            TenderFile.objects.select_related("project")
            .filter(pk=self.kwargs.get("file_id"))
            .first()
        )
        return tender_file.project if tender_file else None

    def post(self, request, file_id):
        try:
            tender_file = TenderFile.objects.select_related("project", "lot", "parse_task").get(pk=file_id)
        except TenderFile.DoesNotExist as exc:
            raise NotFound(message="文件不存在") from exc

        return Response(TenderUploadService().complete_upload(tender_file=tender_file, user=request.user))


class TenderFileListView(generics.ListAPIView):
    """项目招标文件列表。"""

    serializer_class = TenderFileSerializer
    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "tender.view"
    required_scope = "project"

    def get_permission_project(self, request):
        return Project.objects.filter(pk=request.query_params.get("project_id")).first()

    def get_queryset(self):
        project_id = self.request.query_params.get("project_id")
        if not project_id:
            raise ValidationError(message="缺少 project_id")

        queryset = TenderFile.objects.filter(project_id=project_id)

        lot_id = self.request.query_params.get("lot_id")
        if lot_id:
            queryset = queryset.filter(lot_id=lot_id)

        file_category = self.request.query_params.get("file_category")
        if file_category:
            queryset = queryset.filter(file_category=file_category)

        status = self.request.query_params.get("status")
        if status:
            queryset = queryset.filter(status=status)

        return queryset.order_by("-created_at")


class TenderFileDetailView(generics.RetrieveDestroyAPIView):
    """招标文件详情和删除。"""

    serializer_class = TenderFileSerializer
    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "tender.delete"
    required_scope = "project"

    def get_permission_project(self, request):
        tender_file = TenderFile.objects.filter(pk=self.kwargs.get("pk")).first()
        return tender_file.project if tender_file else None

    def get_queryset(self):
        return TenderFile.objects.all()

    def perform_destroy(self, instance):
        """删除文件时同时删除 MinIO 中的对象。"""
        from apps.common.services.storage import StorageService
        try:
            StorageService().remove_object(instance.object_key)
        except Exception:
            pass  # MinIO 对象不存在时忽略
        instance.delete()


class TenderFileRetryParseView(APIView):
    """重试解析。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "tender.upload"
    required_scope = "project"

    def get_permission_project(self, request):
        tender_file = TenderFile.objects.filter(pk=self.kwargs.get("file_id")).first()
        return tender_file.project if tender_file else None

    def post(self, request, file_id):
        try:
            tender_file = TenderFile.objects.get(pk=file_id)
        except TenderFile.DoesNotExist as exc:
            raise NotFound(message="文件不存在") from exc

        if tender_file.status not in [TenderFile.STATUS_PARSE_FAILED, TenderFile.STATUS_PARSED]:
            raise ValidationError(message="当前状态不支持重新解析")

        # 重置状态
        tender_file.status = TenderFile.STATUS_PARSE_PENDING
        tender_file.error_message = ""
        tender_file.save(update_fields=["status", "error_message", "updated_at"])

        # 触发解析任务
        from apps.common.models import AsyncTask
        from apps.tender.tasks import parse_tender_file

        task = AsyncTask.objects.create(
            task_type="tender_parse",
            status=AsyncTask.STATUS_PENDING,
        )
        tender_file.parse_task = task
        tender_file.save(update_fields=["parse_task", "updated_at"])

        parse_tender_file.delay(task.id, tender_file.id)

        return Response({"task_id": task.id, "status": "pending"})


class ParsedDocumentDetailView(generics.RetrieveAPIView):
    """解析文档详情。"""

    serializer_class = ParsedDocumentSerializer
    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "tender.view"
    required_scope = "project"

    def get_permission_project(self, request):
        parsed_doc = ParsedDocument.objects.filter(pk=self.kwargs.get("pk")).first()
        return parsed_doc.tender_file.project if parsed_doc and parsed_doc.tender_file else None

    def get_queryset(self):
        return ParsedDocument.objects.all()


class ParsedDocumentByFileView(APIView):
    """根据文件ID获取解析文档。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "tender.view"
    required_scope = "project"

    def get_permission_project(self, request):
        tender_file = TenderFile.objects.filter(pk=self.kwargs.get("file_id")).first()
        return tender_file.project if tender_file else None

    def get(self, request, file_id):
        try:
            tender_file = TenderFile.objects.get(pk=file_id)
        except TenderFile.DoesNotExist as exc:
            raise NotFound(message="文件不存在") from exc

        parsed_doc = ParsedDocument.objects.filter(
            tender_file=tender_file,
            is_active=True,
        ).first()

        if not parsed_doc:
            return Response({"detail": "尚未解析"}, status=status.HTTP_404_NOT_FOUND)

        serializer = ParsedDocumentSerializer(parsed_doc)
        return Response(serializer.data)


class TenderChunkListView(generics.ListAPIView):
    """分块列表。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "tender.view"
    required_scope = "project"

    def get_permission_project(self, request):
        parsed_doc = ParsedDocument.objects.filter(pk=self.kwargs.get("parsed_document_id")).first()
        return parsed_doc.tender_file.project if parsed_doc and parsed_doc.tender_file else None

    def get_serializer_class(self):
        if self.request.query_params.get("with_content") == "true":
            return TenderChunkSerializer
        return TenderChunkListSerializer

    def get_queryset(self):
        parsed_document_id = self.kwargs.get("parsed_document_id")
        queryset = TenderChunk.objects.filter(parsed_document_id=parsed_document_id)

        chunk_type = self.request.query_params.get("chunk_type")
        if chunk_type:
            queryset = queryset.filter(chunk_type=chunk_type)

        chunk_level = self.request.query_params.get("chunk_level")
        if chunk_level:
            queryset = queryset.filter(chunk_level=chunk_level)

        is_mandatory = self.request.query_params.get("is_mandatory")
        if is_mandatory:
            queryset = queryset.filter(is_mandatory=is_mandatory.lower() == "true")

        search = self.request.query_params.get("search")
        if search:
            queryset = queryset.filter(content__icontains=search)

        return queryset.order_by("chunk_index")


class TenderChunkDetailView(generics.RetrieveAPIView):
    """分块详情。"""

    serializer_class = TenderChunkSerializer
    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "tender.view"
    required_scope = "project"

    def get_permission_project(self, request):
        chunk = TenderChunk.objects.filter(pk=self.kwargs.get("pk")).first()
        if chunk and chunk.parsed_document and chunk.parsed_document.tender_file:
            return chunk.parsed_document.tender_file.project
        return None

    def get_queryset(self):
        return TenderChunk.objects.all()


class ChunkStatsView(APIView):
    """分块统计。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "tender.view"
    required_scope = "project"

    def get_permission_project(self, request):
        parsed_doc = ParsedDocument.objects.filter(pk=self.kwargs.get("parsed_document_id")).first()
        return parsed_doc.tender_file.project if parsed_doc and parsed_doc.tender_file else None

    def get(self, request, parsed_document_id):
        chunks = TenderChunk.objects.filter(parsed_document_id=parsed_document_id)

        # 类型分布
        type_dist = dict(
            chunks.values_list("chunk_type")
            .annotate(count=Count("id"))
            .order_by("-count")
        )

        # 层级分布
        level_dist = dict(
            chunks.values_list("chunk_level")
            .annotate(count=Count("id"))
            .order_by("-count")
        )

        # 特征统计
        feature_stats = {
            "mandatory": chunks.filter(is_mandatory=True).count(),
            "deadline": chunks.filter(has_deadline=True).count(),
            "amount": chunks.filter(has_amount=True).count(),
            "score": chunks.filter(has_score=True).count(),
            "penalty": chunks.filter(has_penalty=True).count(),
            "timeline": chunks.filter(has_timeline=True).count(),
        }

        data = {
            "total_count": chunks.count(),
            "type_distribution": type_dist,
            "level_distribution": level_dist,
            "mandatory_count": feature_stats["mandatory"],
            "feature_stats": feature_stats,
        }

        serializer = ChunkStatsSerializer(data)
        return Response(serializer.data)


class PipelineJobListView(generics.ListAPIView):
    """流水线任务列表。"""

    serializer_class = PipelineJobSerializer
    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "tender.view"
    required_scope = "project"

    def get_permission_project(self, request):
        tender_file = TenderFile.objects.filter(pk=self.kwargs.get("file_id")).first()
        return tender_file.project if tender_file else None

    def get_queryset(self):
        file_id = self.kwargs.get("file_id")
        return PipelineJob.objects.filter(tender_file_id=file_id).order_by("-created_at")


class ParseDebugView(APIView):
    """解析调试输出。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "tender.view"
    required_scope = "project"

    def get_permission_project(self, request):
        parsed_doc = ParsedDocument.objects.filter(pk=self.kwargs.get("parsed_document_id")).first()
        return parsed_doc.tender_file.project if parsed_doc and parsed_doc.tender_file else None

    def get(self, request, parsed_document_id):
        try:
            parsed_doc = ParsedDocument.objects.get(pk=parsed_document_id)
        except ParsedDocument.DoesNotExist as exc:
            raise NotFound(message="解析文档不存在") from exc

        data = {
            "tender_file_id": parsed_doc.tender_file.id,
            "parsed_document_id": parsed_doc.id,
            "page_count": parsed_doc.page_count,
            "parse_engine": parsed_doc.parse_engine,
            "parser_version": parsed_doc.parser_version,
            "parse_quality": parsed_doc.parse_quality,
            "parse_duration_seconds": parsed_doc.parse_duration or 0,
            "quality_metrics": parsed_doc.quality_metrics,
        }

        return Response(data)


class ChunkDebugView(APIView):
    """分块调试输出。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "tender.view"
    required_scope = "project"

    def get_permission_project(self, request):
        parsed_doc = ParsedDocument.objects.filter(pk=self.kwargs.get("parsed_document_id")).first()
        return parsed_doc.tender_file.project if parsed_doc and parsed_doc.tender_file else None

    def get(self, request, parsed_document_id):
        try:
            parsed_doc = ParsedDocument.objects.get(pk=parsed_document_id)
        except ParsedDocument.DoesNotExist as exc:
            raise NotFound(message="解析文档不存在") from exc

        chunks = TenderChunk.objects.filter(parsed_document=parsed_doc)

        # 类型分布
        type_dist = dict(
            chunks.values_list("chunk_type")
            .annotate(count=Count("id"))
            .order_by("-count")
        )

        # 层级分布
        level_dist = dict(
            chunks.values_list("chunk_level")
            .annotate(count=Count("id"))
            .order_by("-count")
        )

        data = {
            "parsed_document_id": parsed_doc.id,
            "chunk_count": chunks.count(),
            "chunk_type_distribution": type_dist,
            "chunk_level_distribution": level_dist,
            "mandatory_chunk_count": chunks.filter(is_mandatory=True).count(),
            "table_chunk_count": chunks.filter(is_table=True).count(),
            "feature_stats": {
                "deadline": chunks.filter(has_deadline=True).count(),
                "amount": chunks.filter(has_amount=True).count(),
                "score": chunks.filter(has_score=True).count(),
                "penalty": chunks.filter(has_penalty=True).count(),
                "timeline": chunks.filter(has_timeline=True).count(),
            },
            "warnings": [],
        }

        return Response(data)
