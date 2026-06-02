# backend/apps/accounts/views/role_views.py
"""角色管理视图。"""
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import PermissionDenied

from apps.accounts.models import Role, Permission
from apps.accounts.serializers import (
    RoleSerializer,
    RoleCreateSerializer,
    RoleUpdateSerializer,
    PermissionSerializer,
)
from apps.accounts.permissions import RequirePermission
from apps.accounts.permissions_registry import GLOBAL
from apps.audit.services import audit_service


class RoleListView(generics.ListCreateAPIView):
    """角色列表 / 新增角色。"""

    permission_classes = [IsAuthenticated, RequirePermission]
    required_permission = "role.manage"
    required_scope = GLOBAL

    def get_queryset(self):
        return Role.objects.all().prefetch_related("permissions").order_by("code")

    def get_serializer_class(self):
        if self.request.method == "POST":
            return RoleCreateSerializer
        return RoleSerializer

    def perform_create(self, serializer):
        role = serializer.save()
        audit_service.log_operation(
            actor=self.request.user,
            action="role_create",
            request=self.request,
            target_type="role",
            target_id=role.pk,
            summary=f"创建角色 {role.code}",
        )


class RoleDetailView(generics.RetrieveUpdateDestroyAPIView):
    """角色详情 / 编辑 / 删除。"""

    permission_classes = [IsAuthenticated, RequirePermission]
    required_permission = "role.manage"
    required_scope = GLOBAL

    def get_queryset(self):
        return Role.objects.all().prefetch_related("permissions")

    def get_serializer_class(self):
        if self.request.method in ["PUT", "PATCH"]:
            return RoleUpdateSerializer
        return RoleSerializer

    def perform_update(self, serializer):
        role = serializer.save()
        audit_service.log_operation(
            actor=self.request.user,
            action="role_update",
            request=self.request,
            target_type="role",
            target_id=role.pk,
            summary=f"更新角色 {role.code}",
        )

    def destroy(self, request, *args, **kwargs):
        role = self.get_object()
        if role.is_system:
            raise PermissionDenied("系统内置角色不可删除")
        if role.users.exists():
            raise PermissionDenied("角色下存在用户，不可删除")
        role.delete()
        audit_service.log_operation(
            actor=request.user,
            action="role_delete",
            request=request,
            target_type="role",
            target_id=role.pk,
            summary=f"删除角色 {role.code}",
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class PermissionListView(generics.ListAPIView):
    """权限列表。"""

    permission_classes = [IsAuthenticated, RequirePermission]
    required_permission = "role.manage"
    required_scope = GLOBAL

    serializer_class = PermissionSerializer

    def get_queryset(self):
        return Permission.objects.filter(is_active=True).order_by("module", "code")


class PermissionTreeView(APIView):
    """权限树（按模块分组）。"""

    permission_classes = [IsAuthenticated, RequirePermission]
    required_permission = "role.manage"
    required_scope = GLOBAL

    def get(self, request):
        permissions = Permission.objects.filter(is_active=True).order_by("module", "code")

        # 按模块分组
        modules = {}
        module_names = {
            "project": "项目管理",
            "lot": "标段管理",
            "workflow": "工作流",
            "tender": "招标文件",
            "outline": "大纲",
            "section": "章节",
            "export": "导出",
            "user": "用户管理",
            "role": "角色管理",
            "audit": "审计日志",
        }

        for perm in permissions:
            if perm.module not in modules:
                modules[perm.module] = {
                    "module": perm.module,
                    "name": module_names.get(perm.module, perm.module),
                    "permissions": [],
                }
            modules[perm.module]["permissions"].append(PermissionSerializer(perm).data)

        return Response(list(modules.values()))