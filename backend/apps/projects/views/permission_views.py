"""项目权限视图。"""
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import MustChangePasswordPermission
from apps.accounts.services import permission_service
from apps.common.exceptions import NotFound
from apps.projects.models import Project


class MyProjectPermissionsView(APIView):
    """GET /api/projects/<project_id>/my-permissions —— 当前用户在该项目的权限集合。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission]

    def get(self, request, project_id):
        try:
            project = Project.objects.get(pk=project_id)
        except Project.DoesNotExist:
            raise NotFound(message="项目不存在")
        permissions = sorted(
            permission_service.get_project_permissions(request.user, project)
        )
        return Response({"project_id": project.id, "permissions": permissions})
