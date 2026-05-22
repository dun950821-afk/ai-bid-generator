from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import MustChangePasswordPermission
from apps.accounts.services import permission_service
from apps.common.exceptions import NotFound, PermissionDenied
from apps.common.models import AsyncTask
from apps.common.serializers import AsyncTaskSerializer


class TaskDetailView(APIView):
    permission_classes = [IsAuthenticated, MustChangePasswordPermission]

    def get(self, request, task_id):
        try:
            task = AsyncTask.objects.get(pk=task_id)
        except AsyncTask.DoesNotExist as exc:
            raise NotFound(message="任务不存在") from exc

        if task.created_by_id != request.user.id and not permission_service.is_system_admin(request.user):
            raise PermissionDenied(message="无权查看该任务")

        return Response(AsyncTaskSerializer(task).data)
