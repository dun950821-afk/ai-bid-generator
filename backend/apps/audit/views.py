"""操作审计视图。"""

from django.db.models import Q
from rest_framework import generics
from rest_framework.permissions import IsAuthenticated

from apps.accounts.permissions import MustChangePasswordPermission, RequirePermission
from apps.audit.models import OperationLog
from apps.audit.serializers import OperationLogSerializer, OperationLogDetailSerializer


class OperationLogListView(generics.ListAPIView):
    """操作日志列表。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "audit.view"
    serializer_class = OperationLogSerializer

    def get_queryset(self):
        queryset = OperationLog.objects.all()

        # 筛选条件
        actor_id = self.request.query_params.get("actor_id")
        if actor_id:
            queryset = queryset.filter(actor_id=actor_id)

        action = self.request.query_params.get("action")
        if action:
            queryset = queryset.filter(action=action)

        target_type = self.request.query_params.get("target_type")
        if target_type:
            queryset = queryset.filter(target_type=target_type)

        search = self.request.query_params.get("search")
        if search:
            queryset = queryset.filter(
                Q(summary__icontains=search) | Q(extra__icontains=search)
            )

        # 时间范围
        start_date = self.request.query_params.get("start_date")
        if start_date:
            queryset = queryset.filter(created_at__date__gte=start_date)

        end_date = self.request.query_params.get("end_date")
        if end_date:
            queryset = queryset.filter(created_at__date__lte=end_date)

        return queryset


class OperationLogDetailView(generics.RetrieveAPIView):
    """操作日志详情。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "audit.view"
    serializer_class = OperationLogDetailSerializer
    queryset = OperationLog.objects.all()
