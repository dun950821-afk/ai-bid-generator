"""成员视图。"""
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.models import User
from apps.accounts.permissions import MustChangePasswordPermission
from apps.accounts.services import permission_service
from apps.accounts.services.permission_service import invalidate_user_project_permission_cache
from apps.common.exceptions import BadRequest, NotFound, PermissionDenied
from apps.projects.models import Project, ProjectMember
from apps.projects.serializers import (
    ProjectMemberCreateSerializer,
    ProjectMemberSerializer,
    ProjectMemberUpdateSerializer,
)


class ProjectMemberViewSet(viewsets.ModelViewSet):
    """项目成员视图集。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission]
    serializer_class = ProjectMemberSerializer

    def get_queryset(self):
        """返回项目的成员列表。"""
        project_id = self.kwargs.get("project_pk")
        return ProjectMember.objects.filter(
            project_id=project_id
        ).select_related("user", "project_role").order_by("created_at")

    def get_serializer_class(self):
        if self.action == "create":
            return ProjectMemberCreateSerializer
        if self.action in ["update", "partial_update"]:
            return ProjectMemberUpdateSerializer
        return ProjectMemberSerializer

    def get_project(self):
        """获取项目实例。"""
        project_id = self.kwargs.get("project_pk")
        try:
            return Project.objects.get(pk=project_id)
        except Project.DoesNotExist:
            raise NotFound(message="项目不存在")

    def create(self, request, *args, **kwargs):
        """添加成员。"""
        project = self.get_project()

        if not permission_service.has_project_permission(
            request.user, project, "project.member.manage"
        ):
            raise PermissionDenied(message="无管理成员权限")

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user_id = serializer.validated_data["user_id"]
        role_id = serializer.validated_data["role_id"]

        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            raise NotFound(message="用户不存在")

        # 检查是否已是成员
        if ProjectMember.objects.filter(project=project, user=user).exists():
            raise BadRequest(message="该用户已是项目成员")

        member = ProjectMember.objects.create(
            project=project,
            user=user,
            project_role_id=role_id,
            added_by=request.user,
        )

        return Response(
            ProjectMemberSerializer(member).data,
            status=status.HTTP_201_CREATED,
        )

    def update(self, request, *args, **kwargs):
        """更新成员角色。"""
        member = self.get_object()
        project = member.project

        if not permission_service.has_project_permission(
            request.user, project, "project.member.manage"
        ):
            raise PermissionDenied(message="无管理成员权限")

        # 不能修改 owner 的角色（防止 owner lockout）
        if member.project_role.code == "owner":
            raise BadRequest(message="不能修改负责人的角色")

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        old_role_id = member.project_role_id
        member.project_role_id = serializer.validated_data["role_id"]
        member.save()

        # 失效缓存
        invalidate_user_project_permission_cache(project.id, member.user_id)

        return Response(ProjectMemberSerializer(member).data)

    def destroy(self, request, *args, **kwargs):
        """移除成员。"""
        member = self.get_object()
        project = member.project

        if not permission_service.has_project_permission(
            request.user, project, "project.member.manage"
        ):
            raise PermissionDenied(message="无管理成员权限")

        # 不能移除 owner
        if member.project_role.code == "owner":
            raise BadRequest(message="不能移除项目负责人")

        user_id = member.user_id
        member.delete()

        # 失效缓存
        invalidate_user_project_permission_cache(project.id, user_id)

        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=["post"])
    def batch(self, request, project_pk=None):
        """批量添加成员。"""
        project = self.get_project()

        if not permission_service.has_project_permission(
            request.user, project, "project.member.manage"
        ):
            raise PermissionDenied(message="无管理成员权限")

        members_data = request.data.get("members", [])
        success = 0
        failed = 0
        results = []

        for member_data in members_data:
            user_id = member_data.get("user_id")
            role_id = member_data.get("role_id")

            try:
                user = User.objects.get(pk=user_id)
                if ProjectMember.objects.filter(project=project, user=user).exists():
                    results.append({"user_id": user_id, "status": "already_member"})
                    failed += 1
                    continue

                ProjectMember.objects.create(
                    project=project,
                    user=user,
                    project_role_id=role_id,
                    added_by=request.user,
                )
                results.append({"user_id": user_id, "status": "success"})
                success += 1
            except Exception:
                results.append({"user_id": user_id, "status": "failed"})
                failed += 1

        return Response({
            "success": success,
            "failed": failed,
            "results": results,
        })