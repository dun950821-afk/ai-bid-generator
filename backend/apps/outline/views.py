# backend/apps/outline/views.py
"""大纲模块 API 视图。"""

from django.db.models import Count, Max
from django.db.models.functions import Now
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
    BatchGenerationPrecheckSerializer,
    BatchGenerationProgressSerializer,
    BatchGenerationRequestSerializer,
    GenerationOrderSerializer,
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
from apps.outline.constants import OutlineSource
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
        # 越权过滤：只返回当前用户参与的项目下的大纲
        queryset = queryset.filter(project__members__user=self.request.user)
        project_id = self.request.query_params.get("project_id")
        lot_id = self.request.query_params.get("lot_id")
        is_current = self.request.query_params.get("is_current")

        if project_id:
            queryset = queryset.filter(project_id=project_id)
        if lot_id:
            queryset = queryset.filter(lot_id=lot_id)
        if is_current is not None:
            queryset = queryset.filter(is_current=is_current.lower() == "true")

        return queryset.distinct()

    def get_serializer_class(self):
        if self.action == "retrieve":
            return OutlineDetailSerializer
        return OutlineSerializer

    def perform_create(self, serializer):
        """创建大纲时自动设置 project（从 lot 反查）、source 和 created_by。

        同 lot 下若已有 is_current=True 的大纲，先置为 False，
        以满足 uniq_current_outline_per_lot 约束。
        """
        from django.db import transaction

        lot = serializer.validated_data.get("lot")
        extra = {"created_by": self.request.user}
        if lot and not serializer.validated_data.get("project"):
            extra["project"] = lot.project
        if not serializer.validated_data.get("source"):
            extra["source"] = OutlineSource.MANUAL
        with transaction.atomic():
            if lot:
                Outline.objects.filter(lot=lot, is_current=True).update(is_current=False)
            serializer.save(**extra)

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
        custom_name = (serializer.validated_data.get("name") or "").strip()

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

        # 创建异步任务（关联 Lot，前端按 lot 维度查进行中任务）
        async_task = AsyncTask.objects.create(
            task_type="generate_outline",
            status="pending",
            related_object_type="lot",
            related_object_id=str(tender_file.lot_id),
            created_by=request.user,
        )

        # 启动 Celery 任务
        from apps.outline.tasks import generate_outline_task

        generate_outline_task.delay(
            tender_file_id=tender_file_id,
            async_task_id=async_task.id,
            user_id=request.user.id,
            custom_name=custom_name,
        )

        return Response(
            {
                "task_id": async_task.id,
                "status": async_task.status,
                "message": "大纲生成任务已提交",
            },
            status=status.HTTP_202_ACCEPTED,
        )

    @action(detail=False, methods=["get"], url_path="generating-task")
    def generating_task(self, request):
        """查询标段下进行中的大纲生成任务。

        Query params:
            lot_id: 标段 ID

        Returns:
            AsyncTask | null（包含 task_id/status/progress/current_step）
        """
        from apps.common.models import AsyncTask

        lot_id = request.query_params.get("lot_id")
        if not lot_id:
            return Response(None)

        task = AsyncTask.objects.filter(
            task_type="generate_outline",
            related_object_type="lot",
            related_object_id=str(lot_id),
            status__in=[AsyncTask.STATUS_PENDING, AsyncTask.STATUS_RUNNING],
        ).order_by("-created_at").first()

        if task:
            return Response({
                "task_id": task.id,
                "status": task.status,
                "progress": task.progress,
                "current_step": task.current_step,
                "error_message": task.error_message,
            })
        return Response(None)

    @action(detail=True, methods=["get"])
    def sections(self, request, pk=None):
        """获取章节树。"""
        from apps.outline.services.section_numbering_service import SectionNumberingService

        outline = self.get_object()
        sections = Section.objects.filter(outline=outline).annotate(
            _children_count=Count("children")
        ).order_by("sort_order", "id")

        # 使用统一编号服务计算 section_number_display
        number_map = SectionNumberingService().build_number_map(sections)

        serializer = SectionTreeSerializer(
            sections,
            many=True,
            context={"section_number_map": number_map},
        )
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
        """批量生成所有章节。

        使用 BatchGenerationService 进行批量生成，复用单章节生成的完整流程。
        """
        outline = self.get_object()
        from apps.outline.services.batch_generation_service import BatchGenerationService

        try:
            batch_service = BatchGenerationService()
            task = batch_service.create_batch_task(
                outline_id=outline.id,
                created_by=request.user,
                skip_on_failure=True,
            )
            batch_service.start_batch_generation(task.id)

            return Response(
                {
                    "task_id": task.id,
                    "status": task.status,
                    "total_count": task.total_count,
                    "message": "批量生成任务已提交",
                },
                status=status.HTTP_202_ACCEPTED,
            )
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

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

    # ========== 批量正文生成相关 ==========

    @action(detail=True, methods=["get"])
    def batch_precheck(self, request, pk=None):
        """批量生成预检查。"""
        outline = self.get_object()
        from apps.outline.services.batch_generation_service import BatchGenerationService

        result = BatchGenerationService().precheck(outline.id)
        serializer = BatchGenerationPrecheckSerializer(result)
        return Response(serializer.data)

    @action(detail=True, methods=["get"])
    def batch_order(self, request, pk=None):
        """计算批量生成顺序。"""
        outline = self.get_object()
        from apps.outline.services.batch_generation_service import BatchGenerationService

        section_ids = request.query_params.getlist("section_ids")
        section_ids = [int(sid) for sid in section_ids if sid.isdigit()]

        order_list = BatchGenerationService().calculate_generation_order(
            outline_id=outline.id,
            section_ids=section_ids if section_ids else None,
        )
        serializer = GenerationOrderSerializer(order_list, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def batch_generate(self, request, pk=None):
        """创建批量生成任务。"""
        outline = self.get_object()
        serializer = BatchGenerationRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        from apps.outline.services.batch_generation_service import BatchGenerationService

        try:
            task = BatchGenerationService().create_batch_task(
                outline_id=outline.id,
                created_by=request.user,
                section_ids=serializer.validated_data.get("section_ids"),
                include_success=serializer.validated_data.get("include_success", False),
                parallel=serializer.validated_data.get("parallel", False),
                max_parallel=serializer.validated_data.get("max_parallel", 3),
                skip_on_failure=serializer.validated_data.get("skip_on_failure", True),
                user_prompt_default=serializer.validated_data.get("user_prompt_default", ""),
            )

            # 启动任务
            BatchGenerationService().start_batch_generation(task.id)

            return Response(
                {
                    "task_id": task.id,
                    "status": task.status,
                    "total_count": task.total_count,
                    "message": "批量生成任务已提交",
                },
                status=status.HTTP_202_ACCEPTED,
            )
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["get"])
    def active_batch_task(self, request, pk=None):
        """获取当前大纲活跃的批量生成任务进度。"""
        outline = self.get_object()
        from apps.outline.constants import GenerationTaskStatus, GenerationTaskType
        from apps.outline.services.batch_generation_service import BatchGenerationService

        # 查找正在运行、暂停或待处理的批量生成任务
        active_task = GenerationTask.objects.filter(
            outline=outline,
            task_type=GenerationTaskType.SECTION_BATCH_GENERATION,
            status__in=[
                GenerationTaskStatus.PENDING,
                GenerationTaskStatus.RUNNING,
                GenerationTaskStatus.PAUSE_REQUESTED,
                GenerationTaskStatus.PAUSED,
            ],
        ).order_by("-created_at").first()

        if not active_task:
            return Response(None)

        # 获取详细进度
        result = BatchGenerationService().get_batch_progress(active_task.id)
        serializer = BatchGenerationProgressSerializer(result)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def build_docx(self, request, pk=None):
        """生成 Word 草稿。

        将当前大纲下所有章节内容组装为 docx 文件。
        """
        import time

        from apps.outline.models import BidDocument
        from apps.outline.services.bid_docx_builder import BidDocxBuilder

        outline = self.get_object()

        # 获取所有章节
        sections = Section.objects.filter(outline=outline).order_by("sort_order", "id")

        if not sections.exists():
            return Response(
                {"error": "大纲没有任何章节，无法生成 Word 文档"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 生成 docx
        builder = BidDocxBuilder()
        docx_file, warnings = builder.build(outline, list(sections))

        # 计算版本号
        latest = outline.bid_documents.order_by("-version").first()
        version = (latest.version + 1) if latest else 1

        # 生成文件名
        filename = f"{outline.name}_v{version}.docx"

        # 创建 BidDocument
        document = BidDocument.objects.create(
            outline=outline,
            title=filename,
            version=version,
            file_key=f"outline-{outline.id}-v{version}-{int(time.time() * 1000)}",
            status="draft",
            created_by=request.user if request.user.is_authenticated else None,
        )

        # 保存文件到 MinIO
        docx_content = docx_file.read()
        document.save_file(docx_content, filename)
        document.save()

        # 构建文件 URL（presigned URL for ONLYOFFICE）
        file_url = document.get_file_url()

        return Response(
            {
                "document_id": document.id,
                "title": document.title,
                "version": document.version,
                "file_key": document.file_key,
                "file_url": file_url,
                "warnings": warnings,
            }
        )

    @action(detail=True, methods=["get"])
    def latest_bid_document(self, request, pk=None):
        """获取最新 Word 文档状态。"""
        from apps.outline.models import BidDocument

        outline = self.get_object()

        latest = (
            outline.bid_documents.select_related("created_by")
            .order_by("-version")
            .first()
        )

        if not latest:
            return Response({"exists": False})

        return Response(
            {
                "exists": True,
                "document_id": latest.id,
                "title": latest.title,
                "version": latest.version,
                "status": latest.status,
                "updated_at": latest.updated_at.isoformat() if latest.updated_at else None,
            }
        )

    # ==================================================================
    # 全局事实变量（借鉴 OpenBidKit globalFactsTask）
    # ==================================================================

    @action(detail=True, methods=["get"])
    def global_facts(self, request, pk=None):
        """列出大纲下所有全局事实变量。"""
        from apps.outline.services.global_fact_service import GlobalFactService

        outline = self.get_object()
        facts = GlobalFactService().list_facts(outline.id)
        return Response({"results": facts, "count": len(facts)})

    @action(detail=True, methods=["post"], url_path="global-facts/extract")
    def extract_global_facts(self, request, pk=None):
        """触发全局事实变量提取（异步五轮流程）。"""
        from apps.outline.services.global_fact_service import GlobalFactService

        outline = self.get_object()
        async_task = GlobalFactService().extract_global_facts(
            outline_id=outline.id,
            created_by=request.user,
        )
        return Response(
            {
                "task_id": async_task.id,
                "status": async_task.status,
                "progress": async_task.progress,
                "current_step": async_task.current_step,
                "message": "全局事实提取任务已提交",
            },
            status=status.HTTP_202_ACCEPTED,
        )

    @action(detail=True, methods=["patch"], url_path="global-facts/(?P<fact_id>[0-9]+)")
    def update_global_fact(self, request, pk=None, fact_id=None):
        """人工修正单条全局事实变量。"""
        from apps.outline.services.global_fact_service import GlobalFactService

        self.get_object()  # 权限校验 + 确保大纲存在
        try:
            fact = GlobalFactService().update_fact(int(fact_id), request.data)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_404_NOT_FOUND)
        return Response(fact)

    @action(detail=True, methods=["post"], url_path="global-facts/(?P<fact_id>[0-9]+)/regenerate")
    def regenerate_global_fact(self, request, pk=None, fact_id=None):
        """单条全局事实变量重新提取。"""
        from apps.outline.services.global_fact_service import GlobalFactService

        self.get_object()
        try:
            fact = GlobalFactService().regenerate_single_fact(int(fact_id), request.user)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(fact)

    # ==================================================================
    # 目录审核闭环（借鉴 OpenBidKit outlineWorkflow）
    # ==================================================================

    @action(detail=True, methods=["post"], url_path="review")
    def review_outline(self, request, pk=None):
        """对已存在大纲触发审核（不重新生成）。

        校验一级目录与评分大类一一对应，结果写入 review_status/review_suggestions。
        """
        from apps.outline.services.outline_review_service import OutlineReviewService

        outline = self.get_object()
        try:
            result = OutlineReviewService().review_outline(outline, request.user)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(result)

    @action(detail=True, methods=["get"], url_path="review-result")
    def review_result(self, request, pk=None):
        """查看大纲审核状态与建议。"""
        outline = self.get_object()
        return Response({
            "review_status": outline.review_status,
            "review_suggestions": outline.review_suggestions,
            "requirement_groups": outline.requirement_groups,
            "review_overridden": outline.review_overridden,
        })

    @action(detail=True, methods=["post"], url_path="review/ignore")
    def review_ignore(self, request, pk=None):
        """忽略 AI 建议，强制审核通过。"""
        from apps.outline.services.outline_review_service import OutlineReviewService

        outline = self.get_object()
        result = OutlineReviewService().force_pass(outline, request.user)
        return Response(result)

    @action(detail=True, methods=["post"], url_path="review/refine")
    def review_refine(self, request, pk=None):
        """按审核建议完善目录（异步，返回 task_id）。

        用 outline.review_suggestions 重跑生成+审核，生成新旧目录 diff。
        前端轮询 AsyncTask 拿 diff 后预览确认，再调 review/apply 应用。
        """
        from apps.outline.tasks import refine_outline_task

        outline = self.get_object()
        if not outline.review_suggestions:
            return Response(
                {"detail": "当前大纲没有审核建议，无法按建议完善"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        async_task = AsyncTask.objects.create(
            task_type="refine_outline",
            status=AsyncTask.STATUS_PENDING,
            related_object_type="Outline",
            related_object_id=str(outline.id),
            created_by=request.user,
        )
        refine_outline_task.delay(outline.id, async_task.id, request.user.id)
        return Response(
            {
                "task_id": async_task.id,
                "status": async_task.status,
                "message": "目录完善任务已提交",
            },
            status=status.HTTP_202_ACCEPTED,
        )

    @action(detail=True, methods=["post"], url_path="review/apply")
    def review_apply(self, request, pk=None):
        """确认应用 refine 生成的新目录（覆盖现有章节树）。

        请求体：{"new_tree": [...]}（来自 refine 任务结果）
        """
        from apps.outline.services.outline_review_service import OutlineReviewService

        outline = self.get_object()
        new_tree = request.data.get("new_tree")
        if not new_tree:
            return Response(
                {"detail": "缺少 new_tree"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            result = OutlineReviewService().apply_refine(outline, new_tree, request.user)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(result)

    # ==================================================================
    # 一致性审计（借鉴 OpenBidKit auditing 阶段）
    # ==================================================================

    @action(detail=True, methods=["post"], url_path="consistency-audit")
    def consistency_audit(self, request, pk=None):
        """触发一致性审计（异步，返回 task_id）。"""
        from apps.outline.tasks import consistency_audit_task

        outline = self.get_object()
        async_task = AsyncTask.objects.create(
            task_type="consistency_audit",
            status=AsyncTask.STATUS_PENDING,
            related_object_type="Outline",
            related_object_id=str(outline.id),
            created_by=request.user,
        )
        consistency_audit_task.delay(outline.id, async_task.id, request.user.id)
        return Response(
            {
                "task_id": async_task.id,
                "status": async_task.status,
                "message": "一致性审计任务已提交",
            },
            status=status.HTTP_202_ACCEPTED,
        )

    @action(detail=True, methods=["get"], url_path="consistency-audit/result")
    def consistency_audit_result(self, request, pk=None):
        """查询审计结果（冲突清单 + 统计，区分已修复/未修复）。"""
        from apps.outline.services.section_numbering_service import SectionNumberingService

        outline = self.get_object()
        sections = Section.objects.filter(
            outline=outline,
            content_generation_meta__has_key="consistency_conflicts",
        )
        # 用统一编号服务生成编号，避免「三.2.1」这种中阿混合格式
        # 必须用大纲全部章节构建父子关系，否则父节点不在 sections 中会导致编号为 None
        all_sections = Section.objects.filter(outline=outline)
        number_map = SectionNumberingService().build_number_map(all_sections)
        conflicts_by_section = []
        total_unresolved = 0
        total_resolved = 0
        by_severity = {"high": 0, "medium": 0, "low": 0}
        for s in sections:
            conflicts = (s.content_generation_meta or {}).get("consistency_conflicts", [])
            if not conflicts:
                continue

            unresolved_count = 0
            resolved_count = 0
            for c in conflicts:
                if c.get("resolved"):
                    resolved_count += 1
                else:
                    unresolved_count += 1
                    sev = c.get("severity", "medium")
                    by_severity[sev] = by_severity.get(sev, 0) + 1

            conflicts_by_section.append({
                "section_id": s.id,
                "section_title": s.title,
                "section_number": number_map.get(s.id) or s.section_number,
                "conflicts": conflicts,
                "conflict_count": len(conflicts),
                "unresolved_count": unresolved_count,
                "resolved_count": resolved_count,
            })
            total_unresolved += unresolved_count
            total_resolved += resolved_count

        running = AsyncTask.objects.filter(
            task_type="consistency_audit",
            related_object_type="Outline",
            related_object_id=str(outline.id),
            status__in=[AsyncTask.STATUS_PENDING, AsyncTask.STATUS_RUNNING],
        ).order_by("-created_at").first()

        # 最近一次已结束的审计任务（区分"从未审计"与"审计完成无冲突"）
        last_finished = AsyncTask.objects.filter(
            task_type="consistency_audit",
            related_object_type="Outline",
            related_object_id=str(outline.id),
            status__in=[AsyncTask.STATUS_SUCCESS, AsyncTask.STATUS_FAILED],
        ).order_by("-finished_at").first()

        return Response({
            "task_status": running.status if running else "idle",
            "task_id": running.id if running else None,
            "progress": running.progress if running else 0,
            "last_audit_status": last_finished.status if last_finished else None,
            "last_audit_at": last_finished.finished_at.isoformat() if last_finished and last_finished.finished_at else None,
            "total_conflicts": total_unresolved,
            "total_unresolved": total_unresolved,
            "total_resolved": total_resolved,
            "by_severity": by_severity,
            "conflicts": conflicts_by_section,
        })

    @action(detail=True, methods=["post"], url_path="consistency-repair")
    def consistency_repair(self, request, pk=None):
        """批量修复（异步，返回 task_id）。"""
        from apps.outline.tasks import consistency_repair_task

        outline = self.get_object()
        async_task = AsyncTask.objects.create(
            task_type="consistency_repair",
            status=AsyncTask.STATUS_PENDING,
            related_object_type="Outline",
            related_object_id=str(outline.id),
            created_by=request.user,
        )
        consistency_repair_task.delay(outline.id, async_task.id, request.user.id)
        return Response(
            {
                "task_id": async_task.id,
                "status": async_task.status,
                "message": "一致性批量修复任务已提交",
            },
            status=status.HTTP_202_ACCEPTED,
        )

    @action(detail=True, methods=["post"], url_path="expand-outline")
    def expand_outline(self, request, pk=None):
        """大纲级字数补目录（异步，返回 task_id）。

        body: {"target_total_words": int}
        """
        from apps.outline.tasks import outline_expand_task

        outline = self.get_object()
        target_total_words = int(request.data.get("target_total_words", 0))
        if target_total_words <= 0:
            return Response(
                {"detail": "target_total_words 必须为正整数"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        async_task = AsyncTask.objects.create(
            task_type="outline_expand",
            status=AsyncTask.STATUS_PENDING,
            related_object_type="Outline",
            related_object_id=str(outline.id),
            created_by=request.user,
        )
        outline_expand_task.delay(
            outline.id, target_total_words, async_task.id, request.user.id,
        )
        return Response(
            {
                "task_id": async_task.id,
                "status": async_task.status,
                "message": "字数补目录任务已提交",
            },
            status=status.HTTP_202_ACCEPTED,
        )

    @action(detail=True, methods=["post"], url_path="mermaid-illustration")
    def mermaid_illustration(self, request, pk=None):
        """批量 Mermaid 配图（异步，返回 task_id）。"""
        from apps.outline.tasks import mermaid_illustration_task

        outline = self.get_object()
        async_task = AsyncTask.objects.create(
            task_type="mermaid_illustration",
            status=AsyncTask.STATUS_PENDING,
            related_object_type="Outline",
            related_object_id=str(outline.id),
            created_by=request.user,
        )
        mermaid_illustration_task.delay(outline.id, async_task.id, request.user.id)
        return Response(
            {
                "task_id": async_task.id,
                "status": async_task.status,
                "message": "Mermaid 配图任务已提交",
            },
            status=status.HTTP_202_ACCEPTED,
        )

    @action(detail=True, methods=["post"], url_path="image-generation")
    def image_generation(self, request, pk=None):
        """批量 AI 生图（异步，返回 task_id）。"""
        from apps.outline.tasks import image_generation_task

        outline = self.get_object()
        async_task = AsyncTask.objects.create(
            task_type="image_generation",
            status=AsyncTask.STATUS_PENDING,
            related_object_type="Outline",
            related_object_id=str(outline.id),
            created_by=request.user,
        )
        image_generation_task.delay(outline.id, async_task.id, request.user.id)
        return Response(
            {
                "task_id": async_task.id,
                "status": async_task.status,
                "message": "AI 生图任务已提交",
            },
            status=status.HTTP_202_ACCEPTED,
        )


class SectionViewSet(viewsets.ModelViewSet):
    """章节视图集。"""

    queryset = Section.objects.select_related("outline")
    serializer_class = SectionSerializer
    permission_classes = [RequirePermission]

    def get_queryset(self):
        queryset = super().get_queryset()
        # 越权过滤：只返回当前用户参与的项目下的章节
        queryset = queryset.filter(
            outline__project__members__user=self.request.user
        )
        outline_id = self.request.query_params.get("outline_id")
        if outline_id:
            queryset = queryset.filter(outline_id=outline_id)
        return queryset.distinct()

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

    @action(detail=True, methods=["post"], url_path="plan")
    def plan_content(self, request, pk=None):
        """生成章节正文编排决策（借鉴 OpenBidKit buildChapterContentPlanMessages）。

        正文生成前先做编排决策：表格/Mermaid/配图/知识引用/事实引用。
        结果持久化到 section.content_plan。
        """
        section = self.get_object()
        plan = SectionGenerationService().plan_section_content(section.id, request.user)
        return Response(plan)

    @action(detail=True, methods=["get"], url_path="plan")
    def get_plan(self, request, pk=None):
        """查看章节正文编排决策。"""
        section = self.get_object()
        return Response({
            "content_plan": section.content_plan or {},
            "content_plan_updated_at": section.content_plan_updated_at.isoformat() if section.content_plan_updated_at else None,
        })

    @action(detail=True, methods=["post"], url_path="consistency-repair")
    def consistency_repair(self, request, pk=None):
        """单章同步修复：读该章 conflicts，调 AI 用全局事实纠正正文。"""
        from apps.outline.services.consistency_audit_service import ConsistencyAuditService

        section = self.get_object()
        try:
            result = ConsistencyAuditService().repair_section(section.id, request.user)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(result)

    @action(detail=True, methods=["post"], url_path="table-cleanup")
    def table_cleanup(self, request, pk=None):
        """单章表格清理（异步，返回 task_id）。"""
        from apps.outline.tasks import table_cleanup_task

        section = self.get_object()
        async_task = AsyncTask.objects.create(
            task_type="table_cleanup",
            status=AsyncTask.STATUS_PENDING,
            related_object_type="Section",
            related_object_id=str(section.id),
            created_by=request.user,
        )
        table_cleanup_task.delay(section.id, async_task.id, request.user.id)
        return Response(
            {
                "task_id": async_task.id,
                "status": async_task.status,
                "message": "表格清理任务已提交",
            },
            status=status.HTTP_202_ACCEPTED,
        )

    @action(detail=True, methods=["post"], url_path="mermaid-illustration")
    def mermaid_illustration(self, request, pk=None):
        """单章 Mermaid 配图（异步，返回 task_id）。"""
        from apps.outline.tasks import mermaid_illustration_task

        section = self.get_object()
        async_task = AsyncTask.objects.create(
            task_type="mermaid_illustration",
            status=AsyncTask.STATUS_PENDING,
            related_object_type="Section",
            related_object_id=str(section.id),
            created_by=request.user,
        )
        # 单章触发：mermaid_illustration_task 接收 outline_id，单章重置 mermaid_code 后批量扫描即可命中
        section.mermaid_code = ""
        section.mermaid_object_key = ""
        section.save(update_fields=["mermaid_code", "mermaid_object_key", "updated_at"])
        mermaid_illustration_task.delay(section.outline_id, async_task.id, request.user.id)
        return Response(
            {
                "task_id": async_task.id,
                "status": async_task.status,
                "message": "单章 Mermaid 配图任务已提交",
            },
            status=status.HTTP_202_ACCEPTED,
        )

    @action(detail=True, methods=["post"], url_path="image-generation")
    def image_generation(self, request, pk=None):
        """单章 AI 生图（异步，返回 task_id）。"""
        from apps.outline.tasks import image_generation_task

        section = self.get_object()
        async_task = AsyncTask.objects.create(
            task_type="image_generation",
            status=AsyncTask.STATUS_PENDING,
            related_object_type="Section",
            related_object_id=str(section.id),
            created_by=request.user,
        )
        # 单章触发：清空 image_object_key 让批量扫描命中
        section.image_object_key = ""
        section.save(update_fields=["image_object_key", "updated_at"])
        image_generation_task.delay(section.outline_id, async_task.id, request.user.id)
        return Response(
            {
                "task_id": async_task.id,
                "status": async_task.status,
                "message": "单章 AI 生图任务已提交",
            },
            status=status.HTTP_202_ACCEPTED,
        )

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
                .aggregate(max_version=Max("version_no"))["max_version"]
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

    @action(detail=True, methods=["put"])
    def content(self, request, pk=None):
        """更新章节内容（人工编辑）。

        请求体：
        {
            "content": "Markdown 正文",
            "content_html": "<h1>...</h1>"  // 可选
        }

        处理：
        1. 保存 Section.content
        2. 记录版本历史
        3. 更新字数统计
        4. 不改变 content_generation_status
        """
        from django.db import transaction
        from apps.outline.constants import ContentGenerationStatus, SectionVersionSource

        section = self.get_object()

        content = request.data.get("content", "")
        content_html = request.data.get("content_html", "")

        # 计算字数
        word_count = len(content.replace(" ", "").replace("\n", ""))

        with transaction.atomic():
            # 锁定章节
            section = Section.objects.select_for_update().get(pk=section.id)

            # 创建新版本
            max_version = (
                SectionVersion.objects.filter(section=section)
                .aggregate(max_version=Max("version_no"))["max_version"]
                or 0
            )

            SectionVersion.objects.create(
                section=section,
                content=content,
                version_no=max_version + 1,
                source=SectionVersionSource.MANUAL,
                word_count=word_count,
                created_by=request.user,
            )

            # 更新章节
            section.content = content
            section.content_word_count = word_count
            section.content_generated_at = Now()
            section.content_generation_status = ContentGenerationStatus.SUCCESS
            section.save(update_fields=[
                "content",
                "content_word_count",
                "content_generated_at",
                "content_generation_status",
                "updated_at",
            ])

        return Response({
            "success": True,
            "content": section.content,
            "content_word_count": section.content_word_count,
            "content_generation_status": section.content_generation_status,
            "version": max_version + 1,
        })

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

    @action(detail=True, methods=["get"])
    def generation_context(self, request, pk=None):
        """获取正文生成上下文预览（调试用）。"""
        section = self.get_object()

        from apps.outline.services.generation_context_service import (
            GenerationContextService,
        )
        from apps.outline.services.rag_service import RagService

        context_service = GenerationContextService()

        # RAG 素材检索
        rag_service = RagService()
        rag_materials = rag_service.retrieve_for_section(
            section=section,
            user=request.user,
            top_k_per_channel=5,
        )

        # 构建上下文（包含模板）
        context = context_service.build_generation_context(
            section=section,
            rag_materials=rag_materials,
            include_template=True,
        )

        # 生成提示词格式的上下文
        prompt_context = context_service.build_prompt_context(context)

        # 统计信息
        stats = self._build_context_stats(context)

        # 警告信息
        warnings = self._build_context_warnings(context)

        return Response({
            "context": context,
            "prompt_context": prompt_context,
            "stats": stats,
            "warnings": warnings,
        })

    def _build_context_stats(self, context: dict) -> dict:
        """构建上下文统计信息。"""
        analysis_points = context.get("analysis_points", {})
        rag_materials = context.get("rag_materials", {})
        context_sections = context.get("context_sections", {})

        return {
            "must_respond_count": len(analysis_points.get("must_respond", [])),
            "score_point_count": len(analysis_points.get("score_points", [])),
            "format_requirement_count": len(
                analysis_points.get("format_requirements", [])
            ),
            "rag_channels": {
                channel: len(items)
                for channel, items in rag_materials.items()
            },
            "rag_total_count": sum(len(items) for items in rag_materials.values()),
            "context_sections": {
                "reference_sections": len(context_sections.get("reference_sections", [])),
                "no_duplicate_sections": len(
                    context_sections.get("no_duplicate_sections", [])
                ),
                "preceding_siblings": len(context_sections.get("preceding_siblings", [])),
                "child_sections": len(context_sections.get("child_sections", [])),
            },
            "has_writing_template": context.get("writing_template") is not None,
        }

    def _build_context_warnings(self, context: dict) -> list[dict]:
        """构建上下文警告信息。"""
        warnings = []

        # 检查 RAG 素材
        rag_materials = context.get("rag_materials", {})
        analysis_points = context.get("analysis_points", {})
        content_matrix = context.get("content_matrix", {})
        title = context.get("current_section", {}).get("title", "")

        # 人员相关但无人员素材
        if (
            "人员" in title
            or "团队" in title
            or content_matrix.get("section_role") == "team_intro"
        ):
            if not rag_materials.get("personnel"):
                warnings.append({
                    "type": "no_personnel_material",
                    "message": "当前章节涉及人员要求，但未检索到人员资料。",
                })

        # 业绩相关但无业绩素材
        if "业绩" in title or "案例" in title:
            if not rag_materials.get("project_case"):
                warnings.append({
                    "type": "no_project_case_material",
                    "message": "当前章节涉及业绩要求，但未检索到项目业绩素材。",
                })

        # 资质相关但无证书素材
        if "资质" in title or "证书" in title:
            if not rag_materials.get("certificate"):
                warnings.append({
                    "type": "no_certificate_material",
                    "message": "当前章节涉及资质证书，但未检索到相关素材。",
                })

        # 必须响应条款过多
        must_respond_count = len(analysis_points.get("must_respond", []))
        if must_respond_count > 10:
            warnings.append({
                "type": "too_many_must_respond",
                "message": f"必须响应条款过多（{must_respond_count} 条），可能影响生成质量。",
            })

        # 禁止重复章节过多
        no_dup_count = len(
            context.get("context_sections", {}).get("no_duplicate_sections", [])
        )
        if no_dup_count > 5:
            warnings.append({
                "type": "too_many_no_duplicate",
                "message": f"禁止重复章节过多（{no_dup_count} 条），需特别注意避免重复。",
            })

        return warnings


class GenerationTaskViewSet(viewsets.ReadOnlyModelViewSet):
    """生成任务视图集。"""

    queryset = GenerationTask.objects.select_related("outline", "created_by")
    serializer_class = GenerationTaskSerializer
    permission_classes = [RequirePermission]

    def get_queryset(self):
        queryset = super().get_queryset()
        # 越权过滤：只返回当前用户参与的项目下的生成任务
        queryset = queryset.filter(
            outline__project__members__user=self.request.user
        )
        outline_id = self.request.query_params.get("outline_id")
        if outline_id:
            queryset = queryset.filter(outline_id=outline_id)
        return queryset.distinct()

    @action(detail=True, methods=["get"])
    def progress(self, request, pk=None):
        """获取批量生成进度（详细版本）。"""
        task = self.get_object()

        if task.task_type != "section_batch_generation":
            return Response(
                {"error": "此接口仅用于批量正文生成任务"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from apps.outline.services.batch_generation_service import BatchGenerationService

        result = BatchGenerationService().get_batch_progress(task.id)
        serializer = BatchGenerationProgressSerializer(result)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def pause(self, request, pk=None):
        """请求暂停任务。"""
        task = self.get_object()
        from apps.outline.services.batch_generation_service import BatchGenerationService
        from apps.outline.serializers import BatchTaskActionSerializer

        result = BatchGenerationService().pause_task(task.id)
        serializer = BatchTaskActionSerializer(result)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def resume(self, request, pk=None):
        """恢复暂停的任务。"""
        task = self.get_object()
        from apps.outline.services.batch_generation_service import BatchGenerationService
        from apps.outline.serializers import BatchTaskActionSerializer

        result = BatchGenerationService().resume_task(task.id)
        serializer = BatchTaskActionSerializer(result)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        """取消任务。"""
        task = self.get_object()
        from apps.outline.services.batch_generation_service import BatchGenerationService
        from apps.outline.serializers import BatchTaskActionSerializer

        result = BatchGenerationService().cancel_task(task.id)
        serializer = BatchTaskActionSerializer(result)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def retry_failed(self, request, pk=None):
        """重试失败的章节。"""
        task = self.get_object()
        from apps.outline.services.batch_generation_service import BatchGenerationService
        from apps.outline.serializers import RetryFailedSerializer

        result = BatchGenerationService().retry_failed(task.id)
        serializer = RetryFailedSerializer(result)
        return Response(serializer.data)
