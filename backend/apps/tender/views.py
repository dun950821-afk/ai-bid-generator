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


class DirectUploadView(APIView):
    """直接上传招标文件（后端代理上传）。

    用于不支持 crypto.subtle 的非安全上下文环境。
    接收 multipart/form-data，后端计算 SHA256，上传 MinIO，触发解析。
    """

    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "tender.upload"
    required_scope = "project"

    def post(self, request):
        uploaded_file = request.FILES.get("file")
        if not uploaded_file:
            return Response({"message": "未提供文件"}, status=status.HTTP_400_BAD_REQUEST)

        project_id = request.data.get("project_id")
        if not project_id:
            return Response({"message": "缺少 project_id"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            project = Project.objects.get(pk=project_id)
        except Project.DoesNotExist:
            return Response({"message": "项目不存在"}, status=status.HTTP_404_NOT_FOUND)

        lot_id = request.data.get("lot_id")
        lot = None
        if lot_id:
            try:
                from apps.projects.models import Lot
                lot = Lot.objects.get(pk=lot_id, project=project)
            except Lot.DoesNotExist:
                return Response({"message": "标段不存在"}, status=status.HTTP_404_NOT_FOUND)

        file_category = request.data.get("file_category", "tender_file")
        if file_category not in ["tender_file", "attachment", "clarification"]:
            file_category = "tender_file"

        # 权限检查
        from apps.accounts.permissions import check_project_permission
        if not check_project_permission(request.user, "tender.upload", project):
            return Response({"message": "无权限上传文件"}, status=status.HTTP_403_FORBIDDEN)

        result = TenderUploadService().direct_upload(
            project=project,
            lot=lot,
            file_obj=uploaded_file,
            file_name=uploaded_file.name,
            file_size=uploaded_file.size,
            content_type=uploaded_file.content_type or "",
            file_category=file_category,
            user=request.user,
        )

        return Response(result, status=status.HTTP_201_CREATED)


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

        queryset = TenderFile.objects.filter(project_id=project_id).select_related("lot")

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


class TenderFileLinkLotView(APIView):
    """关联/取消关联标段。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "tender.upload"
    required_scope = "project"

    def get_permission_project(self, request):
        tender_file = TenderFile.objects.select_related("project").filter(pk=self.kwargs.get("file_id")).first()
        return tender_file.project if tender_file else None

    def post(self, request, file_id):
        """关联标段。"""
        try:
            tender_file = TenderFile.objects.get(pk=file_id)
        except TenderFile.DoesNotExist as exc:
            raise NotFound(message="文件不存在") from exc

        lot_id = request.data.get("lot_id")
        if lot_id:
            from apps.projects.models import Lot
            try:
                lot = Lot.objects.get(pk=lot_id, project=tender_file.project)
                tender_file.lot = lot
            except Lot.DoesNotExist:
                raise NotFound(message="标段不存在或不属于该项目")
        else:
            # lot_id 为 null 表示取消关联
            tender_file.lot = None

        tender_file.save(update_fields=["lot", "updated_at"])
        return Response(TenderFileSerializer(tender_file).data)


class TenderFileRetryParseView(APIView):
    """重试解析。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "tender.upload"
    required_scope = "project"

    def get_permission_project(self, request):
        tender_file = TenderFile.objects.select_related("project").filter(pk=self.kwargs.get("file_id")).first()
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
            related_object_type="TenderFile",
            related_object_id=str(tender_file.id),
            created_by=request.user,
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
        tender_file = TenderFile.objects.select_related("project").filter(pk=self.kwargs.get("file_id")).first()
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
        parsed_doc = ParsedDocument.objects.select_related(
            "tender_file__project"
        ).filter(pk=self.kwargs.get("parsed_document_id")).first()
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
        chunk = TenderChunk.objects.select_related(
            "parsed_document__tender_file__project"
        ).filter(pk=self.kwargs.get("pk")).first()
        if chunk and chunk.parsed_document and chunk.parsed_document.tender_file:
            return chunk.parsed_document.tender_file.project
        return None

    def get_queryset(self):
        return TenderChunk.objects.select_related("parsed_document")


class ChunkStatsView(APIView):
    """分块统计。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "tender.view"
    required_scope = "project"

    def get_permission_project(self, request):
        parsed_doc = ParsedDocument.objects.select_related(
            "tender_file__project"
        ).filter(pk=self.kwargs.get("parsed_document_id")).first()
        return parsed_doc.tender_file.project if parsed_doc and parsed_doc.tender_file else None

    def get(self, request, parsed_document_id):
        from django.db.models import Q

        # 单次聚合查询获取所有统计
        stats = TenderChunk.objects.filter(parsed_document_id=parsed_document_id).aggregate(
            total_count=Count("id"),
            type_dist=Count("id", filter=Q(chunk_type="text")),
            mandatory_count=Count("id", filter=Q(is_mandatory=True)),
            deadline_count=Count("id", filter=Q(has_deadline=True)),
            amount_count=Count("id", filter=Q(has_amount=True)),
            score_count=Count("id", filter=Q(has_score=True)),
            penalty_count=Count("id", filter=Q(has_penalty=True)),
            timeline_count=Count("id", filter=Q(has_timeline=True)),
        )

        # 类型分布需要单独查询
        chunks = TenderChunk.objects.filter(parsed_document_id=parsed_document_id)
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

        feature_stats = {
            "mandatory": stats["mandatory_count"],
            "deadline": stats["deadline_count"],
            "amount": stats["amount_count"],
            "score": stats["score_count"],
            "penalty": stats["penalty_count"],
            "timeline": stats["timeline_count"],
        }

        data = {
            "total_count": stats["total_count"],
            "type_distribution": type_dist,
            "level_distribution": level_dist,
            "mandatory_count": stats["mandatory_count"],
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
        tender_file = TenderFile.objects.select_related("project").filter(pk=self.kwargs.get("file_id")).first()
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
        parsed_doc = ParsedDocument.objects.select_related(
            "tender_file__project"
        ).filter(pk=self.kwargs.get("parsed_document_id")).first()
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
        parsed_doc = ParsedDocument.objects.select_related(
            "tender_file__project"
        ).filter(pk=self.kwargs.get("parsed_document_id")).first()
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


class TenderFileReparseView(APIView):
    """重新解析文件。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "tender.upload"
    required_scope = "project"

    # 允许重新解析的状态
    ALLOWED_STATUSES = [
        TenderFile.STATUS_PARSED,
        TenderFile.STATUS_CHUNKED,
        TenderFile.STATUS_READY,
        TenderFile.STATUS_PARSE_FAILED,
        TenderFile.STATUS_REQUIREMENT_EXTRACTED,
        TenderFile.STATUS_INDEXED,
    ]

    # 禁止重复触发的状态
    RUNNING_STATUSES = [
        TenderFile.STATUS_PARSING,
        "chunking",
        "processing",
    ]

    def get_permission_project(self, request):
        tender_file = TenderFile.objects.select_related("project").filter(pk=self.kwargs.get("file_id")).first()
        return tender_file.project if tender_file else None

    def post(self, request, file_id):
        from django.db import transaction
        from apps.audit.models import OperationLog

        with transaction.atomic():
            # 锁定记录防并发
            try:
                tender_file = TenderFile.objects.select_for_update().get(pk=file_id)
            except TenderFile.DoesNotExist as exc:
                raise NotFound(message="文件不存在") from exc

            # 禁止处理中的文件重复触发
            if tender_file.status in self.RUNNING_STATUSES:
                return Response(
                    {"message": "文件正在处理中，请勿重复触发重新解析"},
                    status=400,
                )

            # 仅允许已解析过的文件
            if tender_file.status not in self.ALLOWED_STATUSES:
                return Response(
                    {"message": "该文件状态不支持重新解析"},
                    status=400,
                )

            # 记录旧版本 ID
            old_doc = ParsedDocument.objects.filter(
                tender_file=tender_file, is_active=True
            ).first()
            old_doc_id = old_doc.id if old_doc else None

            # 记录变更前状态
            file_status_before = tender_file.status

            # 更新状态为解析中
            tender_file.status = TenderFile.STATUS_PARSING
            tender_file.error_message = ""
            tender_file.save(update_fields=["status", "error_message", "updated_at"])

            # 创建解析任务
            from apps.common.models import AsyncTask
            from apps.tender.tasks import parse_tender_file

            task = AsyncTask.objects.create(
                task_type="tender_parse",
                status=AsyncTask.STATUS_PENDING,
                related_object_type="TenderFile",
                related_object_id=str(tender_file.id),
                created_by=request.user,
            )
            tender_file.parse_task = task
            tender_file.save(update_fields=["parse_task", "updated_at"])

            # 记录审计日志
            OperationLog.objects.create(
                actor=request.user,
                action="tender.reparse",
                target_type="TenderFile",
                target_id=str(tender_file.id),
                summary=f"重新解析文件: {tender_file.original_name}",
                extra={
                    "old_active_parsed_document_id": old_doc_id,
                    "job_id": task.id,
                    "file_status_before": file_status_before,
                },
            )

        # 触发 Celery 任务（事务外）
        parse_tender_file.delay(task.id, tender_file.id)

        return Response({
            "message": "已提交重新解析任务",
            "file_id": tender_file.id,
            "status": "parsing",
            "task_id": task.id,
        })


class TenderFileParseVersionsView(APIView):
    """获取文件的解析版本列表。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "tender.view"
    required_scope = "project"

    def get_permission_project(self, request):
        tender_file = TenderFile.objects.select_related("project").filter(pk=self.kwargs.get("file_id")).first()
        return tender_file.project if tender_file else None

    def get(self, request, file_id):
        try:
            tender_file = TenderFile.objects.get(pk=file_id)
        except TenderFile.DoesNotExist as exc:
            raise NotFound(message="文件不存在") from exc

        versions = (
            ParsedDocument.objects.filter(tender_file=tender_file)
            .annotate(chunk_count=Count("chunks"))
            .order_by("-created_at")
            .values(
                "id",
                "parser_version",
                "parse_engine",
                "parse_quality",
                "page_count",
                "chunk_count",
                "is_active",
                "created_at",
            )
        )

        return Response({"results": list(versions)})


class TenderFileActivateVersionView(APIView):
    """激活历史解析版本。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "tender.upload"
    required_scope = "project"

    # 禁止切换的状态（使用常量）
    RUNNING_STATUSES = [
        TenderFile.STATUS_PARSING,
        TenderFile.STATUS_PARSE_PENDING,
        "chunking",
        "processing",
    ]

    def get_permission_project(self, request):
        tender_file = TenderFile.objects.select_related("project").filter(pk=self.kwargs.get("file_id")).first()
        return tender_file.project if tender_file else None

    def post(self, request, file_id, version_id):
        from django.db import transaction
        from apps.audit.models import OperationLog

        with transaction.atomic():
            # 锁定记录
            try:
                tender_file = TenderFile.objects.select_for_update().get(pk=file_id)
            except TenderFile.DoesNotExist as exc:
                raise NotFound(message="文件不存在") from exc

            # 禁止处理中的文件切换版本
            if tender_file.status in self.RUNNING_STATUSES:
                return Response(
                    {"message": "文件正在处理中，不能切换解析版本"},
                    status=400,
                )

            # 获取当前活跃版本 ID
            old_active_doc = ParsedDocument.objects.filter(
                tender_file=tender_file, is_active=True
            ).first()
            old_active_doc_id = old_active_doc.id if old_active_doc else None

            # 验证目标版本
            try:
                target_doc = ParsedDocument.objects.get(
                    id=version_id,
                    tender_file=tender_file,
                )
            except ParsedDocument.DoesNotExist as exc:
                raise NotFound(message="版本不存在") from exc

            # 切换活跃版本
            ParsedDocument.objects.filter(tender_file=tender_file).update(is_active=False)
            target_doc.is_active = True
            target_doc.save(update_fields=["is_active"])

            # 更新文件状态（不设为 requirement_extracted）
            tender_file.status = TenderFile.STATUS_CHUNKED
            tender_file.save(update_fields=["status", "updated_at"])

            # 记录审计日志
            OperationLog.objects.create(
                actor=request.user,
                action="tender.activate_version",
                target_type="ParsedDocument",
                target_id=str(target_doc.id),
                summary=f"切换解析版本: {tender_file.original_name}",
                extra={
                    "old_active_parsed_document_id": old_active_doc_id,
                    "new_active_parsed_document_id": target_doc.id,
                },
            )

        return Response({"message": "已切换到该版本"})
