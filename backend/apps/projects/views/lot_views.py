# backend/apps/projects/views/lot_views.py
"""标段视图。"""

from django.db import transaction
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import MustChangePasswordPermission
from apps.accounts.services import permission_service
from apps.common.exceptions import NotFound, PermissionDenied
from apps.projects.models import Lot
from apps.projects.serializers import LotSerializer


class LotDetailView(APIView):
    """标段详情视图。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission]

    def get(self, request, pk):
        """获取标段详情。"""
        try:
            lot = Lot.objects.select_related("project").get(pk=pk)
        except Lot.DoesNotExist:
            raise NotFound(message="标段不存在")

        # 检查用户是否是项目成员
        if not lot.project.members.filter(user=request.user).exists():
            raise PermissionDenied(message="无权访问此标段")

        return Response(LotSerializer(lot).data)

    def patch(self, request, pk):
        """更新标段（名称/编号/招标方信息）。"""
        try:
            lot = Lot.objects.select_related("project").get(pk=pk)
        except Lot.DoesNotExist:
            raise NotFound(message="标段不存在")

        if not permission_service.has_project_permission(
            request.user, lot.project, "lot.update"
        ):
            raise PermissionDenied(message="无编辑标段权限")

        serializer = LotSerializer(lot, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        for field in (
            "name", "code", "tenderer", "agent",
            "bid_deadline", "contact_name", "contact_phone",
        ):
            if field in serializer.validated_data:
                setattr(lot, field, serializer.validated_data[field])
        lot.save()
        return Response(LotSerializer(lot).data)

    def delete(self, request, pk):
        """删除标段。"""
        try:
            lot = Lot.objects.select_related("project").get(pk=pk)
        except Lot.DoesNotExist:
            raise NotFound(message="标段不存在")

        # 检查删除权限
        if not permission_service.has_project_permission(
            request.user, lot.project, "lot.delete"
        ):
            raise PermissionDenied(message="无删除标段权限")

        # 检查工作流状态
        if lot.workflow_status != "not_started":
            raise PermissionDenied(message="只能删除未开始工作流的标段")

        with transaction.atomic():
            # 删除关联的工作流实例
            from apps.workflows.models import LotWorkflow
            LotWorkflow.objects.filter(lot=lot).delete()
            # 删除标段
            lot.delete()

        return Response(status=status.HTTP_204_NO_CONTENT)


class LotWorkflowView(APIView):
    """标段工作流视图（兼容旧前端路由）。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission]

    def post(self, request, pk):
        """初始化工作流（兼容接口）。"""
        from apps.workflows.views import LotWorkflowInitializeView

        try:
            lot = Lot.objects.get(pk=pk)
        except Lot.DoesNotExist:
            raise NotFound(message="标段不存在")

        # 转发到工作流初始化视图
        view = LotWorkflowInitializeView()
        view.request = request
        view.format_kwarg = None
        return view.post(request, lot_id=pk)


class LotWorkflowStartView(APIView):
    """标段工作流启动视图（兼容旧前端路由）。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission]

    def post(self, request, pk):
        """启动工作流（兼容接口）。"""
        from apps.workflows.views import LotWorkflowStartView as WorkflowStartView

        try:
            lot = Lot.objects.get(pk=pk)
        except Lot.DoesNotExist:
            raise NotFound(message="标段不存在")

        # 转发到工作流启动视图
        view = WorkflowStartView()
        view.request = request
        view.format_kwarg = None
        return view.post(request, lot_id=pk)
