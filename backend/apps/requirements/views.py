# backend/apps/requirements/views.py
"""requirements 视图。"""

import uuid

from rest_framework import status, viewsets
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from django.db import transaction

from apps.accounts.permissions import RequirePermission
from apps.common.models import AsyncTask
from apps.tender.models import TenderFile
from apps.requirements.models import TenderRequirement, RequirementExtractionRun
from apps.requirements.serializers import (
    RequirementExtractSerializer,
    RequirementExtractV2Serializer,
    RequirementExtractV2ResultSerializer,
    RequirementListSerializer,
    RequirementDetailSerializer,
    RequirementUpdateSerializer,
    RequirementExtractResultSerializer,
)
from apps.requirements.services import RequirementExtractionError
from apps.requirements.tasks import extract_requirements_task, extract_requirements_v2
from apps.requirements.constants import ExtractionRunStatus


class RequirementExtractView(APIView):
    """条款抽取视图（旧版，向后兼容）。"""

    permission_classes = [IsAuthenticated, RequirePermission]
    required_permission = "tender.manage"

    def post(self, request, file_id: int):
        """创建条款抽取任务。

        POST /api/requirements/files/{file_id}/extract/

        Returns:
            {
                "success": True,
                "message": "条款抽取任务已创建",
                "task_id": int
            }
        """
        serializer = RequirementExtractSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # 校验文件存在
        try:
            tender_file = TenderFile.objects.get(pk=file_id)
        except TenderFile.DoesNotExist:
            return Response(
                {"success": False, "message": "招标文件不存在"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # 检查是否已有进行中的任务（去重）
        existing_task = AsyncTask.objects.filter(
            task_type="requirement_extraction",
            related_object_type="TenderFile",
            related_object_id=str(file_id),
            status__in=[AsyncTask.STATUS_PENDING, AsyncTask.STATUS_RUNNING],
        ).first()

        if existing_task:
            return Response({
                "success": True,
                "message": "已有进行中的抽取任务",
                "task_id": existing_task.id,
            })

        # 创建 AsyncTask 记录
        task = AsyncTask.objects.create(
            task_type="requirement_extraction",
            status=AsyncTask.STATUS_PENDING,
            progress=0,
            current_step="等待执行",
            total_steps=1,
            related_object_type="TenderFile",
            related_object_id=str(file_id),
            input_payload={
                "mode": serializer.validated_data.get("mode", "hybrid"),
                "force": serializer.validated_data.get("force", False),
                "model_config_id": serializer.validated_data.get("model_config_id"),
                "prompt_version_id": serializer.validated_data.get("prompt_version_id"),
            },
            created_by=request.user,
        )

        # 触发异步任务（显式指定队列）
        extract_requirements_task.apply_async(
            args=[task.id, file_id, {
                "mode": serializer.validated_data.get("mode", "hybrid"),
                "force": serializer.validated_data.get("force", False),
                "model_config_id": serializer.validated_data.get("model_config_id"),
                "prompt_version_id": serializer.validated_data.get("prompt_version_id"),
            }],
            queue="parse_queue",
        )

        return Response({
            "success": True,
            "message": "条款抽取任务已创建",
            "task_id": task.id,
        })


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
        transaction.on_commit(
            lambda: extract_requirements_v2.apply_async(
                args=[task.id, file_id, {
                    "extraction_types": extraction_run.extraction_types,
                    "overwrite": extraction_run.overwrite,
                    "model_config_id": serializer.validated_data.get("model_config_id"),
                    "prompt_version_id": serializer.validated_data.get("prompt_version_id"),
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
        # 校验文件存在
        tender_file = get_object_or_404(TenderFile, pk=file_id)

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
        if extraction_run_id:
            queryset = queryset.filter(extraction_run_id=extraction_run_id)

        # 排序
        queryset = queryset.order_by("sort_order", "id")

        serializer = RequirementListSerializer(queryset, many=True)
        return Response({
            "count": queryset.count(),
            "results": serializer.data,
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