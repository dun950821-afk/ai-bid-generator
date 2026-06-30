# backend/apps/bid_check/views.py
"""废标检查视图集。"""

from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.permissions import RequirePermission
from apps.bid_check.models import BidCheckFinding, BidCheckTask
from apps.bid_check.serializers import (
    BidCheckFindingSerializer,
    BidCheckTaskCreateSerializer,
    BidCheckTaskSerializer,
)
from apps.bid_check.services.bid_check_service import BidCheckService


class BidCheckTaskViewSet(viewsets.ReadOnlyModelViewSet):
    """废标检查任务视图集。

    借鉴 OpenBidKit rejectionCheckTask：启动检查、查看任务状态与发现项。
    """

    queryset = BidCheckTask.objects.select_related("outline", "bid_document", "created_by")
    serializer_class = BidCheckTaskSerializer
    permission_classes = [RequirePermission]

    def get_queryset(self):
        queryset = super().get_queryset()
        outline_id = self.request.query_params.get("outline_id")
        bid_document_id = self.request.query_params.get("bid_document_id")
        if outline_id:
            queryset = queryset.filter(outline_id=outline_id)
        if bid_document_id:
            queryset = queryset.filter(bid_document_id=bid_document_id)
        return queryset

    @action(detail=False, methods=["post"])
    def start(self, request):
        """启动废标检查（异步三轮流程）。"""
        serializer = BidCheckTaskCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        async_task = BidCheckService().start_check(
            outline_id=serializer.validated_data["outline"],
            bid_document_id=serializer.validated_data["bid_document"],
            custom_check_items=serializer.validated_data.get("custom_check_items", ""),
            user=request.user,
        )
        return Response(
            {
                "task_id": async_task.id,
                "status": async_task.status,
                "progress": async_task.progress,
                "current_step": async_task.current_step,
                "message": "废标检查任务已提交",
            },
            status=status.HTTP_202_ACCEPTED,
        )

    @action(detail=True, methods=["get"])
    def findings(self, request, pk=None):
        """查看任务的发现项列表（支持 severity/type 过滤）。"""
        task = self.get_object()
        qs = BidCheckFinding.objects.filter(task=task)
        severity = request.query_params.get("severity")
        type_ = request.query_params.get("type")
        if severity:
            qs = qs.filter(severity=severity)
        if type_:
            qs = qs.filter(type=type_)
        serializer = BidCheckFindingSerializer(qs, many=True)
        return Response({"results": serializer.data, "count": qs.count()})


class BidCheckFindingViewSet(viewsets.GenericViewSet):
    """废标检查发现项视图集（仅支持标记已处理）。"""

    queryset = BidCheckFinding.objects.select_related("task")
    serializer_class = BidCheckFindingSerializer
    permission_classes = [RequirePermission]

    @action(detail=True, methods=["patch"], url_path="resolve")
    def resolve(self, request, pk=None):
        """标记发现项已处理。"""
        finding = self.get_object()
        finding.resolved = True
        finding.resolved_at = timezone.now()
        finding.save(update_fields=["resolved", "resolved_at"])
        return Response(BidCheckFindingSerializer(finding).data)

    @action(detail=True, methods=["patch"], url_path="unresolve")
    def unresolve(self, request, pk=None):
        """取消标记已处理。"""
        finding = self.get_object()
        finding.resolved = False
        finding.resolved_at = None
        finding.save(update_fields=["resolved", "resolved_at"])
        return Response(BidCheckFindingSerializer(finding).data)
