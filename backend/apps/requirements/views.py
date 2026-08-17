# backend/apps/requirements/views.py
"""requirements 视图。"""

import uuid

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from django.db import transaction
from django.db.models import Count

from apps.accounts.permissions import RequirePermission
from apps.common.models import AsyncTask
from apps.projects.models import Lot
from apps.tender.models import TenderFile
from apps.requirements.models import (
    TenderRequirement,
    RequirementExtractionRun,
    RequirementDedupRun,
)
from apps.requirements.serializers import (
    RequirementExtractV2Serializer,
    RequirementListSerializer,
    RequirementDetailSerializer,
    RequirementUpdateSerializer,
    MergedDuplicateSerializer,
)
from apps.requirements.services import RequirementExtractionError
from apps.requirements.services.dedup_service import (
    get_active_dedup_run,
    trigger_lot_dedup,
)
from apps.requirements.tasks import extract_requirements_v2
from apps.requirements.constants import DedupRunStatus, ExtractionRunStatus


class RequirementExtractV2View(APIView):
    """条款抽取视图（V2，独立于 TenderChunk）。"""

    permission_classes = [IsAuthenticated, RequirePermission]
    required_permission = "tender.manage"

    def post(self, request, file_id: int):
        """创建条款抽取任务（V2）。

        POST /api/requirements/files/{file_id}/extract-v2/

        Request:
            {
                "extraction_types": ["scoring", "mandatory", "qualification"],
                "overwrite": false,
                "prompt_version_id": null,
                "model_config_id": null
            }

        Returns:
            {
                "run_id": int,
                "task_id": int,
                "status": "pending"
            }
        """
        serializer = RequirementExtractV2Serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # 校验文件存在
        try:
            tender_file = TenderFile.objects.get(pk=file_id)
        except TenderFile.DoesNotExist:
            return Response(
                {"success": False, "message": "招标文件不存在"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # 检查文件状态（只需要文件已上传完成）
        invalid_statuses = [
            TenderFile.STATUS_UPLOADING,
            TenderFile.STATUS_REJECTED,
            TenderFile.STATUS_UPLOAD_EXPIRED,
        ]
        if tender_file.status in invalid_statuses:
            return Response(
                {
                    "success": False,
                    "message": f"文件状态为 {tender_file.get_status_display()}，请先完成上传",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 检查是否已有进行中的任务（去重）
        existing_task = AsyncTask.objects.filter(
            task_type="requirement_extraction_v2",
            related_object_type="TenderFile",
            related_object_id=str(file_id),
            status__in=[AsyncTask.STATUS_PENDING, AsyncTask.STATUS_RUNNING],
        ).first()

        if existing_task:
            # 查找对应的运行记录
            existing_run = RequirementExtractionRun.objects.filter(
                async_task=existing_task,
            ).first()
            return Response({
                "run_id": existing_run.id if existing_run else None,
                "task_id": existing_task.id,
                "status": existing_task.status,
                "message": "已有进行中的抽取任务",
            })

        # 预生成 Celery task ID
        celery_task_id = str(uuid.uuid4())

        # 创建 RequirementExtractionRun 和 AsyncTask（原子事务）
        with transaction.atomic():
            extraction_run = RequirementExtractionRun.objects.create(
                tender_file=tender_file,
                project=tender_file.project,
                status=ExtractionRunStatus.PENDING,
                extraction_types=serializer.validated_data.get(
                    "extraction_types",
                    ["scoring", "mandatory", "qualification"],
                ),
                overwrite=serializer.validated_data.get("overwrite", False),
                created_by=request.user,
            )

            task = AsyncTask.objects.create(
                task_type="requirement_extraction_v2",
                celery_task_id=celery_task_id,
                status=AsyncTask.STATUS_PENDING,
                progress=0,
                current_step="等待执行",
                total_steps=len(extraction_run.extraction_types),
                related_object_type="TenderFile",
                related_object_id=str(file_id),
                input_payload={
                    "extraction_types": extraction_run.extraction_types,
                    "overwrite": extraction_run.overwrite,
                    "model_config_id": serializer.validated_data.get("model_config_id"),
                    "prompt_version_id": serializer.validated_data.get("prompt_version_id"),
                },
                created_by=request.user,
            )

            extraction_run.async_task = task
            extraction_run.save(update_fields=["async_task"])

        # 事务提交后触发异步任务
        # extraction_run_id 传给任务，编排器复用该记录（避免 service 内再建一个 Run）
        transaction.on_commit(
            lambda: extract_requirements_v2.apply_async(
                args=[task.id, file_id, {
                    "extraction_types": extraction_run.extraction_types,
                    "overwrite": extraction_run.overwrite,
                    "model_config_id": serializer.validated_data.get("model_config_id"),
                    "prompt_version_id": serializer.validated_data.get("prompt_version_id"),
                    "extraction_run_id": extraction_run.id,
                }],
                task_id=celery_task_id,
                queue="parse_queue",
            )
        )

        return Response({
            "run_id": extraction_run.id,
            "task_id": task.id,
            "status": "pending",
        })


class RequirementListView(APIView):
    """条款列表视图。"""

    permission_classes = [IsAuthenticated]

    def get(self, request, file_id: int):
        """获取条款列表。

        GET /api/requirements/files/{file_id}/
        """
        # 校验文件存在且当前用户是项目成员(越权一律 404, 与 outline 同一口径)
        tender_file = get_object_or_404(
            TenderFile, pk=file_id, project__members__user=request.user
        )

        # 过滤条件
        queryset = TenderRequirement.objects.filter(
            tender_file=tender_file,
            is_active=True,
        )

        # 支持的过滤参数
        # 注意：parsed_document_id 过滤已弃用，新版抽取独立于解析文档
        # 保留参数兼容性，但不再按此过滤
        # parsed_document_id = request.query_params.get("parsed_document_id")
        # if parsed_document_id:
        #     queryset = queryset.filter(parsed_document_id=parsed_document_id)

        requirement_type = request.query_params.get("requirement_type")
        if requirement_type:
            queryset = queryset.filter(requirement_type=requirement_type)

        extraction_type = request.query_params.get("extraction_type")
        if extraction_type:
            queryset = queryset.filter(extraction_type=extraction_type)

        mandatory_level = request.query_params.get("mandatory_level")
        if mandatory_level:
            queryset = queryset.filter(mandatory_level=mandatory_level)

        risk_level = request.query_params.get("risk_level")
        if risk_level:
            queryset = queryset.filter(risk_level=risk_level)

        owner_role = request.query_params.get("owner_role")
        if owner_role:
            queryset = queryset.filter(owner_role=owner_role)

        response_strategy = request.query_params.get("response_strategy")
        if response_strategy:
            queryset = queryset.filter(response_strategy=response_strategy)

        evidence_needed = request.query_params.get("evidence_needed")
        if evidence_needed is not None:
            queryset = queryset.filter(
                evidence_needed=(evidence_needed.lower() == "true")
            )

        review_status = request.query_params.get("review_status")
        if review_status:
            queryset = queryset.filter(review_status=review_status)

        extraction_run_id = request.query_params.get("extraction_run_id")

        # 当前版本：文件存在 active run 时默认只展示其条款
        active_run = RequirementExtractionRun.objects.filter(
            tender_file=tender_file,
            is_active=True,
        ).first()

        if extraction_run_id:
            # 查看指定历史版本（不叠加 active 过滤）
            queryset = queryset.filter(extraction_run_id=extraction_run_id)
        elif active_run is not None:
            queryset = queryset.filter(extraction_run=active_run)
        # 无 active run 时回退现状（全部 is_active 条款）

        # 去重过滤：默认隐藏已合并条目；include_duplicates=true 时全量
        include_duplicates = (
            request.query_params.get("include_duplicates", "").lower() == "true"
        )
        if not include_duplicates:
            queryset = queryset.filter(dedup_status__in=["none", "kept"])

        # 排序 + merged_count 注解（避免序列化逐条查库）
        queryset = queryset.order_by("sort_order", "id").annotate(
            merged_count=Count("merged_duplicates")
        )

        serializer = RequirementListSerializer(queryset, many=True)
        return Response({
            "count": queryset.count(),
            "active_run_id": active_run.id if active_run else None,
            "results": serializer.data,
        })


class ExtractionRunListView(APIView):
    """文件抽取运行历史列表视图。"""

    permission_classes = [IsAuthenticated]

    def get(self, request, file_id: int):
        """获取文件的全部抽取运行记录。

        GET /api/requirements/files/{file_id}/runs/
        """
        tender_file = get_object_or_404(TenderFile, pk=file_id)

        runs = (
            RequirementExtractionRun.objects.filter(tender_file=tender_file)
            .order_by("-created_at", "-id")
            .values(
                "id",
                "status",
                "extraction_types",
                "total_count",
                "success_count",
                "failed_types",
                "prompt_versions",
                "overwrite",
                "is_active",
                "created_at",
                "finished_at",
            )
        )

        return Response({"results": list(runs)})


class ExtractionRunActivateView(APIView):
    """手动切换当前抽取版本。"""

    permission_classes = [IsAuthenticated, RequirePermission]
    required_permission = "tender.manage"

    def post(self, request, run_id: int):
        """激活指定的抽取运行记录为当前版本。

        POST /api/requirements/runs/{run_id}/activate/
        """
        extraction_run = get_object_or_404(RequirementExtractionRun, pk=run_id)

        # 只能激活成功/部分成功的 run
        if extraction_run.status not in (
            ExtractionRunStatus.SUCCESS,
            ExtractionRunStatus.PARTIAL_SUCCESS,
        ):
            return Response(
                {
                    "success": False,
                    "message": f"只能激活成功/部分成功的运行记录，当前状态为 {extraction_run.get_status_display()}",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        extraction_run.activate()

        return Response({
            "success": True,
            "run_id": extraction_run.id,
            "is_active": True,
        })


class RequirementViewSet(viewsets.ModelViewSet):
    """条款视图集。"""

    permission_classes = [IsAuthenticated]
    lookup_field = "pk"

    def get_queryset(self):
        return TenderRequirement.objects.all()

    def get_serializer_class(self):
        if self.action == "retrieve":
            return RequirementDetailSerializer
        elif self.action in ["update", "partial_update"]:
            return RequirementUpdateSerializer
        return RequirementListSerializer

    def retrieve(self, request, *args, **kwargs):
        """获取条款详情。

        GET /api/requirements/{id}/
        """
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    def partial_update(self, request, *args, **kwargs):
        """更新条款。

        PATCH /api/requirements/{id}/
        """
        instance = self.get_object()
        serializer = self.get_serializer(
            instance,
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        serializer.save(updated_by=request.user)
        return Response(serializer.data)

    @action(detail=True, methods=["get"], url_path="duplicates")
    def duplicates(self, request, pk=None):
        """获取已合并到本条款的重复条目列表（含来源文件/页码，便于溯源）。

        GET /api/requirements/{id}/duplicates/
        """
        instance = self.get_object()
        duplicates = (
            instance.merged_duplicates.filter(
                dedup_status="duplicate",
            )
            .select_related("tender_file")
            .order_by("id")
        )
        serializer = MergedDuplicateSerializer(duplicates, many=True)
        return Response({
            "count": duplicates.count(),
            "results": serializer.data,
        })


class LotRequirementDedupView(APIView):
    """标段级条款去重触发视图。"""

    permission_classes = [IsAuthenticated, RequirePermission]
    required_permission = "tender.manage"

    def post(self, request, lot_id: int):
        """触发标段级条款三层去重。

        POST /api/requirements/lots/{lot_id}/dedup/

        Returns:
            {
                "task_id": int,
                "dedup_run_id": int,
                "status": "pending"
            }
        """
        lot = get_object_or_404(Lot, pk=lot_id)

        # 防重入：已有 pending/running 的去重运行时返回 409
        running_run = get_active_dedup_run(lot)
        if running_run:
            return Response(
                {
                    "success": False,
                    "message": "该标段已有进行中的去重任务",
                    "dedup_run_id": running_run.id,
                    "task_id": running_run.async_task_id,
                },
                status=status.HTTP_409_CONFLICT,
            )

        result = trigger_lot_dedup(lot, request.user, source="manual")
        if result is None:
            # 并发下在检查与创建之间出现了新的进行中任务
            return Response(
                {
                    "success": False,
                    "message": "该标段已有进行中的去重任务",
                },
                status=status.HTTP_409_CONFLICT,
            )

        return Response({
            "task_id": result["task"].id,
            "dedup_run_id": result["dedup_run"].id,
            "status": "pending",
        })


class LotDedupRunLatestView(APIView):
    """标段最新一次去重运行查询视图。"""

    permission_classes = [IsAuthenticated]

    def get(self, request, lot_id: int):
        """获取标段最新一条去重运行记录。

        GET /api/requirements/lots/{lot_id}/dedup-runs/latest/

        Returns:
            {"result": {id, status, total_count, cluster_count, duplicate_count,
                        async_task_id, created_at, finished_at} | null}
        """
        lot = get_object_or_404(Lot, pk=lot_id)
        run = (
            RequirementDedupRun.objects.filter(lot=lot)
            .order_by("-created_at")
            .first()
        )
        if run is None:
            return Response({"result": None})
        return Response({
            "result": {
                "id": run.id,
                "status": run.status,
                "total_count": run.total_count,
                "cluster_count": run.cluster_count,
                "duplicate_count": run.duplicate_count,
                "async_task_id": run.async_task_id,
                "created_at": run.created_at,
                "finished_at": run.finished_at,
            },
        })