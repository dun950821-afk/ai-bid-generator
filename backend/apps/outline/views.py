# backend/apps/outline/views.py
"""大纲模块 API 视图。"""

from django.db import models
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.permissions import RequirePermission
from apps.common.models import AsyncTask
from apps.outline.models import (
    GenerationTask,
    Outline,
    Section,
    SectionVersion,
    PresetOutlineTemplate,
)
from apps.outline.serializers import (
    GenerationStatusSerializer,
    GenerationTaskSerializer,
    OutlineCreateFromAiSerializer,
    OutlineCreateFromPresetSerializer,
    OutlineDetailSerializer,
    OutlineGenerateFromTenderSerializer,
    OutlineSerializer,
    PresetOutlineTemplateSerializer,
    SectionAnalyzeSerializer,
    SectionGenerateSerializer,
    SectionMoveSerializer,
    SectionRollbackSerializer,
    SectionSerializer,
    SectionTreeSerializer,
    SectionVersionDetailSerializer,
    SectionVersionSerializer,
)
from apps.outline.services.outline_service import OutlineService
from apps.outline.services.section_generation_service import SectionGenerationService
from apps.outline.services.section_tree_service import SectionTreeService


class PresetOutlineTemplateViewSet(viewsets.ReadOnlyModelViewSet):
    """预设大纲模板视图集。"""

    queryset = PresetOutlineTemplate.objects.filter(is_active=True).prefetch_related(
        "sections"
    )
    serializer_class = PresetOutlineTemplateSerializer


class OutlineViewSet(viewsets.ModelViewSet):
    """大纲视图集。"""

    queryset = Outline.objects.select_related("project", "lot", "created_by")
    serializer_class = OutlineSerializer
    permission_classes = [RequirePermission]

    def get_queryset(self):
        queryset = super().get_queryset()
        project_id = self.request.query_params.get("project_id")
        lot_id = self.request.query_params.get("lot_id")
        is_current = self.request.query_params.get("is_current")

        if project_id:
            queryset = queryset.filter(project_id=project_id)
        if lot_id:
            queryset = queryset.filter(lot_id=lot_id)
        if is_current is not None:
            queryset = queryset.filter(is_current=is_current.lower() == "true")

        return queryset

    def get_serializer_class(self):
        if self.action == "retrieve":
            return OutlineDetailSerializer
        return OutlineSerializer

    @action(detail=False, methods=["post"])
    def from_preset(self, request):
        """从预设模板创建大纲。"""
        serializer = OutlineCreateFromPresetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        outline = OutlineService().create_from_preset(
            lot_id=serializer.validated_data["lot_id"],
            template_id=serializer.validated_data["template_id"],
            name=serializer.validated_data.get("name"),
            created_by=request.user,
        )

        return Response(
            OutlineDetailSerializer(outline).data, status=status.HTTP_201_CREATED
        )

    @action(detail=False, methods=["post"])
    def from_ai(self, request):
        """AI解析创建大纲（传入已解析的章节数据）。"""
        serializer = OutlineCreateFromAiSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        outline = OutlineService().create_from_ai(
            tender_file_id=serializer.validated_data["tender_file_id"],
            sections_data=serializer.validated_data["sections_data"],
            name=serializer.validated_data.get("name"),
            created_by=request.user,
        )

        return Response(
            OutlineDetailSerializer(outline).data, status=status.HTTP_201_CREATED
        )

    @action(detail=False, methods=["post"])
    def generate_from_tender(self, request):
        """从招标文件生成大纲（异步任务）。

        读取招标文件全文，调用 AI 生成投标文件目录结构。
        返回异步任务 ID，前端可轮询任务状态。
        """
        serializer = OutlineGenerateFromTenderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        tender_file_id = serializer.validated_data["tender_file_id"]

        # 验证招标文件状态
        from apps.tender.models import TenderFile, ParsedDocument

        tender_file = TenderFile.objects.select_related("project", "lot").get(
            pk=tender_file_id
        )

        if not tender_file.lot:
            return Response(
                {"error": "招标文件必须绑定标段"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 检查是否有解析结果
        parsed_doc = ParsedDocument.objects.filter(
            tender_file=tender_file,
            is_active=True,
        ).first()

        if not parsed_doc or not parsed_doc.markdown_uri:
            return Response(
                {"error": "招标文件未解析或解析结果不存在，请先解析文件"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 创建异步任务
        async_task = AsyncTask.objects.create(
            task_type="generate_outline",
            status="pending",
            created_by=request.user,
        )

        # 启动 Celery 任务
        from apps.outline.tasks import generate_outline_task

        generate_outline_task.delay(
            tender_file_id=tender_file_id,
            async_task_id=async_task.id,
            user_id=request.user.id,
        )

        return Response(
            {
                "task_id": async_task.id,
                "status": async_task.status,
                "message": "大纲生成任务已提交",
            },
            status=status.HTTP_202_ACCEPTED,
        )

    @action(detail=True, methods=["get"])
    def sections(self, request, pk=None):
        """获取章节树。"""
        outline = self.get_object()
        sections = Section.objects.filter(outline=outline).order_by("sort_order", "id")
        serializer = SectionTreeSerializer(sections, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def reorder_sections(self, request, pk=None):
        """重排章节。"""
        outline = self.get_object()
        section_orders = request.data.get("sections", [])

        for item in section_orders:
            Section.objects.filter(
                id=item["id"],
                outline=outline,
            ).update(sort_order=item["sort_order"])

        return Response({"message": "排序已更新"})

    @action(detail=True, methods=["post"])
    def generate_all(self, request, pk=None):
        """批量生成所有章节。"""
        outline = self.get_object()

        async_task = SectionGenerationService().generate_sections_batch(
            outline_id=outline.id,
            created_by=request.user,
        )

        return Response(
            {
                "task_id": async_task.id,
                "status": async_task.status,
                "message": "批量生成任务已提交",
            }
        )

    @action(detail=True, methods=["get"])
    def generation_status(self, request, pk=None):
        """获取批量生成进度。"""
        outline = self.get_object()
        result = SectionGenerationService().get_batch_generation_status(outline.id)
        serializer = GenerationStatusSerializer(result)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def set_current(self, request, pk=None):
        """设置为当前大纲。"""
        outline = self.get_object()
        OutlineService().set_current(outline.id)
        return Response({"message": "已设置为当前大纲"})

    @action(detail=True, methods=["get"])
    def matrix_status(self, request, pk=None):
        """获取矩阵整体状态。"""
        outline = self.get_object()
        from apps.outline.services.matrix_service import MatrixService

        result = MatrixService().get_matrix_status(outline.id)
        from apps.outline.serializers import MatrixStatusSerializer

        serializer = MatrixStatusSerializer(result)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def generate_matrix(self, request, pk=None):
        """批量生成矩阵。"""
        outline = self.get_object()
        from apps.outline.serializers import GenerateMatrixSerializer
        from apps.outline.services.matrix_service import MatrixService

        serializer = GenerateMatrixSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            task = MatrixService().start_matrix_generation(
                outline_id=outline.id,
                user=request.user,
                section_ids=serializer.validated_data.get("section_ids"),
                force_overwrite=serializer.validated_data.get("force", False),
            )

            return Response(
                {
                    "task_id": task.id,
                    "status": task.status,
                    "target_count": task.total_count,
                },
                status=status.HTTP_202_ACCEPTED,
            )
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["post"])
    def retry_matrix_failed(self, request, pk=None):
        """重试失败的矩阵。"""
        outline = self.get_object()
        from apps.outline.services.matrix_service import MatrixService

        # 获取失败的章节
        from apps.outline.constants import ContentMatrixStatus

        failed_sections = Section.objects.filter(
            outline=outline,
            content_matrix_status=ContentMatrixStatus.FAILED,
        )
        failed_ids = list(failed_sections.values_list("id", flat=True))

        if not failed_ids:
            return Response({"message": "没有失败的矩阵需要重试"})

        try:
            task = MatrixService().start_matrix_generation(
                outline_id=outline.id,
                user=request.user,
                section_ids=failed_ids,
                force_overwrite=False,
            )

            return Response(
                {
                    "task_id": task.id,
                    "retry_count": len(failed_ids),
                }
            )
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class SectionViewSet(viewsets.ModelViewSet):
    """章节视图集。"""

    queryset = Section.objects.select_related("outline")
    serializer_class = SectionSerializer
    permission_classes = [RequirePermission]

    def get_queryset(self):
        queryset = super().get_queryset()
        outline_id = self.request.query_params.get("outline_id")
        if outline_id:
            queryset = queryset.filter(outline_id=outline_id)
        return queryset

    def perform_create(self, serializer):
        """创建章节时自动计算 level 和 sort_order。"""
        outline_id = self.request.data.get("outline")
        parent_id = self.request.data.get("parent")
        title = self.request.data.get("title")

        section = SectionTreeService().add_section(
            outline_id=outline_id,
            parent_id=parent_id,
            title=title,
        )
        serializer.instance = section

    @action(detail=True, methods=["post"])
    def move(self, request, pk=None):
        """移动章节。"""
        section = self.get_object()
        serializer = SectionMoveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        updated_section = SectionTreeService().move_section(
            section_id=section.id,
            new_parent_id=serializer.validated_data["new_parent_id"],
            new_sort_order=serializer.validated_data["new_sort_order"],
        )

        return Response(SectionSerializer(updated_section).data)

    @action(detail=True, methods=["post"])
    def analyze(self, request, pk=None):
        """分析章节生成需求。"""
        section = self.get_object()
        result = SectionGenerationService().analyze_section_needs(section.id)
        serializer = SectionAnalyzeSerializer(result)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def generate(self, request, pk=None):
        """生成章节内容。"""
        section = self.get_object()
        serializer = SectionGenerateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # 获取分析结果
        analysis_result = serializer.validated_data.get("analysis_result")
        if not analysis_result:
            # 如果未传入分析结果，自动分析
            analysis_result = SectionGenerationService().analyze_section_needs(
                section.id
            )

        async_task = SectionGenerationService().generate_section(
            section_id=section.id,
            analysis_result=analysis_result,
            user_prompt=serializer.validated_data.get("user_prompt", ""),
            created_by=request.user,
            force=serializer.validated_data["force"],
        )

        return Response(
            {
                "task_id": async_task.id,
                "status": async_task.status,
                "message": "章节生成任务已提交",
            }
        )

    @action(detail=True, methods=["get"])
    def versions(self, request, pk=None):
        """获取版本历史。"""
        section = self.get_object()
        versions = SectionVersion.objects.filter(section=section).order_by("-version_no")
        serializer = SectionVersionSerializer(versions, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def rollback(self, request, pk=None):
        """回滚到指定版本。"""
        from django.db import transaction

        section = self.get_object()
        serializer = SectionRollbackSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        version_no = serializer.validated_data["version_no"]

        with transaction.atomic():
            # 锁定章节
            section = Section.objects.select_for_update().get(pk=section.id)

            try:
                version = SectionVersion.objects.get(section=section, version_no=version_no)
            except SectionVersion.DoesNotExist:
                return Response(
                    {"error": f"版本 {version_no} 不存在"},
                    status=status.HTTP_404_NOT_FOUND,
                )

            # 创建新版本（来源为手动）
            from apps.outline.constants import SectionVersionSource

            max_version = (
                SectionVersion.objects.filter(section=section)
                .aggregate(max_version=models.Max("version_no"))["max_version"]
                or 0
            )

            new_version = SectionVersion.objects.create(
                section=section,
                content=version.content,
                version_no=max_version + 1,
                source=SectionVersionSource.MANUAL,
                word_count=version.word_count,
                created_by=request.user,
            )

            # 更新章节内容
            section.content = version.content
            section.word_count = version.word_count
            section.save()

        return Response(
            {
                "message": f"已回滚到版本 {version_no}",
                "current_version": SectionVersionDetailSerializer(new_version).data,
            }
        )

    @action(detail=True, methods=["get", "put"])
    def matrix(self, request, pk=None):
        """获取或更新章节矩阵。"""
        section = self.get_object()

        if request.method == "GET":
            from apps.outline.serializers import SectionMatrixSerializer

            serializer = SectionMatrixSerializer(section)
            return Response(serializer.data)

        # PUT 方法
        from apps.outline.serializers import UpdateMatrixSerializer
        from apps.outline.services.matrix_service import MatrixService

        serializer = UpdateMatrixSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # 乐观锁检查
        if section.content_matrix_version != serializer.validated_data["content_matrix_version"]:
            return Response(
                {
                    "success": False,
                    "error_code": "VERSION_CONFLICT",
                    "message": "矩阵内容已被其他操作更新，请刷新后再编辑。",
                },
                status=status.HTTP_409_CONFLICT,
            )

        # 更新矩阵
        matrix_data = serializer.validated_data["content_matrix"]
        merged_matrix = section.content_matrix.copy() if section.content_matrix else {}
        merged_matrix.update(matrix_data)

        MatrixService().update_section_matrix(section, merged_matrix, is_user_edit=True)

        return Response(
            {
                "success": True,
                "content_matrix_version": section.content_matrix_version,
                "content_matrix_status": section.content_matrix_status,
            }
        )

    @action(detail=True, methods=["post"])
    def generate_matrix(self, request, pk=None):
        """生成单个章节矩阵。"""
        section = self.get_object()

        force = request.data.get("force", False)

        # 检查是否可以生成
        from apps.outline.constants import ContentMatrixStatus

        if section.content_matrix_status == ContentMatrixStatus.EDITED and not force:
            return Response(
                {"error": "章节矩阵已编辑，需要确认强制覆盖"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 启动矩阵生成
        from apps.outline.services.matrix_service import MatrixService

        try:
            task = MatrixService().start_matrix_generation(
                outline_id=section.outline_id,
                user=request.user,
                section_ids=[section.id],
                force_overwrite=force,
            )

            return Response(
                {
                    "task_id": task.id,
                    "status": task.status,
                },
                status=status.HTTP_202_ACCEPTED,
            )
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class GenerationTaskViewSet(viewsets.ReadOnlyModelViewSet):
    """生成任务视图集。"""

    queryset = GenerationTask.objects.select_related("outline", "created_by")
    serializer_class = GenerationTaskSerializer
    permission_classes = [RequirePermission]

    def get_queryset(self):
        queryset = super().get_queryset()
        outline_id = self.request.query_params.get("outline_id")
        if outline_id:
            queryset = queryset.filter(outline_id=outline_id)
        return queryset

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        """请求取消任务（软取消）。"""
        task = self.get_object()

        if task.status not in ["pending", "running"]:
            return Response(
                {"error": "任务已完成，无法取消"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from apps.outline.constants import GenerationTaskStatus

        task.status = GenerationTaskStatus.CANCEL_REQUESTED
        task.save()

        return Response(
            {
                "success": True,
                "status": task.status,
                "message": "系统将停止后续章节生成，当前正在生成的章节可能会继续完成。",
            }
        )
