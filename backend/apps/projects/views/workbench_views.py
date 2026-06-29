"""标段工作台视图。"""

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import MustChangePasswordPermission
from apps.common.exceptions import NotFound, PermissionDenied
from apps.projects.models import Lot
from apps.projects.services.workbench_status_service import WorkbenchStatusService


class LotWorkbenchStatusView(APIView):
    """标段工作台聚合状态视图。

    GET /api/lots/:lotId/workbench_status/
    返回标段完整制作状态聚合（spec §5）。
    """

    permission_classes = [IsAuthenticated, MustChangePasswordPermission]

    def get(self, request, pk):
        try:
            lot = Lot.objects.select_related("project").get(pk=pk)
        except Lot.DoesNotExist:
            raise NotFound(message="标段不存在")

        if not lot.project.members.filter(user=request.user).exists():
            raise PermissionDenied(message="无权访问此标段")

        data = WorkbenchStatusService.get_status(lot.id)
        if "error" in data:
            raise NotFound(message="标段不存在")
        return Response(data)
