# backend/apps/outline/views.py
"""大纲模块 API 视图。"""

from django.db import models
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.common.models import AsyncTask
from apps.outline.models import (
    Outline,
    Section,
    SectionVersion,
    PresetOutlineTemplate,
)
from apps.outline.serializers import (
    GenerationStatusSerializer,
    OutlineCreateFromAiSerializer,
    OutlineCreateFromPresetSerializer,
    OutlineDetailSerializer,
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
        """AI解析创建大纲。"""
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


class SectionViewSet(viewsets.ModelViewSet):
    """章节视图集。"""

    queryset = Section.objects.select_related("outline")
    serializer_class = SectionSerializer

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
        section = self.get_object()
        serializer = SectionRollbackSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        version_no = serializer.validated_data["version_no"]
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
