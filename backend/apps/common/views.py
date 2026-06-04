from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import MustChangePasswordPermission
from apps.accounts.services import permission_service
from apps.common.exceptions import NotFound, PermissionDenied
from apps.common.models import AsyncTask
from apps.common.serializers import AsyncTaskSerializer


class TaskDetailView(APIView):
    """任务详情视图。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission]

    def get(self, request, task_id):
        """获取任务详情。"""
        try:
            task = AsyncTask.objects.get(pk=task_id)
        except AsyncTask.DoesNotExist as exc:
            raise NotFound(message="任务不存在") from exc

        if task.created_by_id != request.user.id and not permission_service.is_system_admin(request.user):
            raise PermissionDenied(message="无权查看该任务")

        return Response(AsyncTaskSerializer(task).data)


class CurrentTaskView(APIView):
    """获取当前执行中的任务。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission]

    def get(self, request):
        """获取指定对象当前正在执行的任务。

        Query params:
            related_object_type: 关联对象类型
            related_object_id: 关联对象 ID
            task_type: 任务类型（可选）

        Returns:
            AsyncTask | null
        """
        related_object_type = request.query_params.get("related_object_type")
        related_object_id = request.query_params.get("related_object_id")
        task_type = request.query_params.get("task_type")

        if not related_object_type or not related_object_id:
            return Response(None)

        queryset = AsyncTask.objects.filter(
            related_object_type=related_object_type,
            related_object_id=related_object_id,
            status__in=[AsyncTask.STATUS_PENDING, AsyncTask.STATUS_RUNNING],
        )

        if task_type:
            queryset = queryset.filter(task_type=task_type)

        task = queryset.order_by("-created_at").first()

        if task:
            return Response(AsyncTaskSerializer(task).data)

        return Response(None)