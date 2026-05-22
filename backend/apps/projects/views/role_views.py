"""角色视图。"""
from rest_framework import status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import MustChangePasswordPermission
from apps.accounts.services import permission_service
from apps.accounts.services.permission_service import invalidate_project_role_cache
from apps.common.exceptions import BadRequest, NotFound, PermissionDenied
from apps.projects.models import Project, ProjectRole
from apps.projects.serializers import ProjectRoleSerializer, ProjectRoleUpdateSerializer
from apps.projects.services.role_service import RoleService


class ProjectRoleViewSet(viewsets.ModelViewSet):
    """项目角色视图集。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission]
    serializer_class = ProjectRoleSerializer

    def get_queryset(self):
        """返回项目的角色列表。"""
        project_id = self.kwargs.get("project_pk")
        return ProjectRole.objects.filter(project_id=project_id).order_by("code")

    def get_serializer_class(self):
        if self.action in ["update", "partial_update"]:
            return ProjectRoleUpdateSerializer
        return ProjectRoleSerializer

    def perform_create(self, serializer):
        """创建自定义角色。"""
        project_id = self.kwargs.get("project_pk")
        project = Project.objects.get(pk=project_id)

        if not permission_service.has_project_permission(
            self.request.user, project, "project.role.manage"
        ):
            raise PermissionDenied(message="无管理角色权限")

        serializer.save(project=project, created_by=self.request.user)

    def update(self, request, *args, **kwargs):
        """更新角色权限。"""
        role = self.get_object()

        if not permission_service.has_project_permission(
            request.user, role.project, "project.role.manage"
        ):
            raise PermissionDenied(message="无管理角色权限")

        serializer = self.get_serializer(role, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        # 失效缓存
        invalidate_project_role_cache(role.project_id, role.id)

        return Response(ProjectRoleSerializer(role).data)

    def destroy(self, request, *args, **kwargs):
        """删除自定义角色。"""
        role = self.get_object()

        if not permission_service.has_project_permission(
            request.user, role.project, "project.role.manage"
        ):
            raise PermissionDenied(message="无管理角色权限")

        if not RoleService.can_delete_role(role):
            raise BadRequest(message="该角色不可删除（内置角色或有成员关联）")

        return super().destroy(request, *args, **kwargs)