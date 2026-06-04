"""项目视图。"""
from django.db.models import Count
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import MustChangePasswordPermission
from apps.accounts.services import permission_service
from apps.common.exceptions import NotFound, PermissionDenied
from apps.common.pagination import DefaultPagination
from apps.projects.models import Project, ProjectMember, Lot
from apps.projects.serializers import (
    LotSerializer,
    ProjectCreateSerializer,
    ProjectListSerializer,
    ProjectSerializer,
)
from apps.projects.services.project_service import ProjectService


class ProjectViewSet(viewsets.ModelViewSet):
    """项目视图集。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission]
    pagination_class = DefaultPagination

    def get_queryset(self):
        """只返回用户参与的项目。"""
        queryset = Project.objects.filter(
            members__user=self.request.user
        ).select_related("created_by").prefetch_related("members", "lots")

        # 状态筛选
        status_filter = self.request.query_params.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        # 关键词搜索
        keyword = self.request.query_params.get("keyword")
        if keyword:
            queryset = queryset.filter(name__icontains=keyword)

        # 聚合统计
        queryset = queryset.annotate(
            lot_count=Count("lots", distinct=True),
        )

        return queryset.order_by("-created_at")

    def get_serializer_class(self):
        if self.action == "create":
            return ProjectCreateSerializer
        if self.action == "list":
            return ProjectListSerializer
        return ProjectSerializer

    def create(self, request, *args, **kwargs):
        """创建项目。"""
        if not permission_service.has_permission(request.user, "project.create"):
            raise PermissionDenied(message="无创建项目权限")

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        project = ProjectService.create_project(
            name=serializer.validated_data["name"],
            description=serializer.validated_data.get("description", ""),
            created_by=request.user,
            workflow_template_id=serializer.validated_data.get("workflow_template_id"),
            initial_members=serializer.validated_data.get("initial_members", []),
        )

        return Response(
            ProjectSerializer(project).data,
            status=status.HTTP_201_CREATED,
        )

    def update(self, request, *args, **kwargs):
        """更新项目。"""
        project = self.get_object()
        if not permission_service.has_project_permission(
            request.user, project, "project.update"
        ):
            raise PermissionDenied(message="无更新项目权限")

        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        """删除项目及其所有关联数据。"""
        project = self.get_object()
        if not permission_service.has_project_permission(
            request.user, project, "project.delete"
        ):
            raise PermissionDenied(message="无删除项目权限")

        # 先删除 ProjectRole，因为 ProjectMember.project_role 有 PROTECT
        from apps.projects.models import ProjectRole, ProjectMember, Lot

        # 删除成员（会级联删除 ProjectMember，但因为有 PROTECT 需要先处理）
        project.members.all().delete()

        # 删除角色
        project.roles.all().delete()

        # 删除标段
        project.lots.all().delete()

        # 最后删除项目本身
        project.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        """归档项目。"""
        project = self.get_object()
        if not permission_service.has_project_permission(
            request.user, project, "project.update"
        ):
            raise PermissionDenied(message="无归档项目权限")

        project.status = "archived"
        project.save()
        return Response({"status": "archived", "message": "项目已归档"})

    @action(detail=True, methods=["get"])
    def my_permissions(self, request, pk=None):
        """获取当前用户在项目的权限列表。"""
        project = self.get_object()
        permissions = sorted(
            permission_service.get_project_permissions(request.user, project)
        )
        return Response({"project_id": project.id, "permissions": permissions})

    @action(detail=True, methods=["get"])
    def lots(self, request, pk=None):
        """获取项目的标段列表。"""
        project = self.get_object()
        lots = Lot.objects.filter(project=project).order_by("id")
        serializer = LotSerializer(lots, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def create_lot(self, request, pk=None):
        """创建标段。"""
        project = self.get_object()
        if not permission_service.has_project_permission(
            request.user, project, "lot.create"
        ):
            raise PermissionDenied(message="无创建标段权限")

        serializer = LotSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        lot = Lot.objects.create(
            project=project,
            name=serializer.validated_data["name"],
            code=serializer.validated_data.get("code", ""),
        )

        return Response(
            LotSerializer(lot).data,
            status=status.HTTP_201_CREATED,
        )
