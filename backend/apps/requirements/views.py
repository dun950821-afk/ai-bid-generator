# backend/apps/requirements/views.py
"""requirements 视图。"""

from rest_framework import status, viewsets
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404

from apps.accounts.permissions import RequirePermission
from apps.tender.models import TenderFile
from apps.requirements.models import TenderRequirement
from apps.requirements.serializers import (
    RequirementExtractSerializer,
    RequirementListSerializer,
    RequirementDetailSerializer,
    RequirementUpdateSerializer,
    RequirementExtractResultSerializer,
)
from apps.requirements.services import (
    RequirementExtractService,
    RequirementExtractionError,
)


class RequirementExtractView(APIView):
    """条款抽取视图。"""

    permission_classes = [IsAuthenticated, RequirePermission]
    required_permission = "tender.manage"

    def post(self, request, file_id: int):
        """执行条款抽取。

        POST /api/requirements/files/{file_id}/extract/
        """
        serializer = RequirementExtractSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        service = RequirementExtractService()

        try:
            result = service.extract_requirements(
                tender_file_id=file_id,
                created_by=request.user,
                mode=serializer.validated_data.get("mode", "hybrid"),
                prompt_version_id=serializer.validated_data.get("prompt_version_id"),
                model_config_id=serializer.validated_data.get("model_config_id"),
                rag_options=serializer.validated_data.get("rag_options"),
                force=serializer.validated_data.get("force", False),
            )

            return Response({
                "success": True,
                "message": "条款抽取完成",
                "data": result,
            })

        except TenderFile.DoesNotExist:
            return Response(
                {"success": False, "message": "招标文件不存在"},
                status=status.HTTP_404_NOT_FOUND,
            )
        except RequirementExtractionError as e:
            return Response(
                {"success": False, "message": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )


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
        parsed_document_id = request.query_params.get("parsed_document_id")
        if parsed_document_id:
            queryset = queryset.filter(parsed_document_id=parsed_document_id)

        requirement_type = request.query_params.get("requirement_type")
        if requirement_type:
            queryset = queryset.filter(requirement_type=requirement_type)

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