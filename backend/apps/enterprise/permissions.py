# backend/apps/enterprise/permissions.py
"""企业资料中心权限定义。"""

from rest_framework import permissions

from apps.accounts.services.permission_service import has_global_permission


def _is_authenticated(request) -> bool:
    """F-03：SAFE_METHODS 放行必须先排除匿名用户。"""
    return bool(request.user and request.user.is_authenticated)


class CanManageCompany(permissions.BasePermission):
    """管理公司权限。"""

    message = "您没有管理公司的权限"

    def has_permission(self, request, view):
        if not _is_authenticated(request):
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return has_global_permission(request.user, "enterprise.manage_company")


class CanManageMaterial(permissions.BasePermission):
    """管理材料权限。"""

    message = "您没有管理材料的权限"

    def has_permission(self, request, view):
        if not _is_authenticated(request):
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return has_global_permission(request.user, "enterprise.manage_material")


class CanDownloadSensitiveMaterial(permissions.BasePermission):
    """下载敏感材料权限。"""

    message = "您没有下载敏感材料的权限"

    def has_permission(self, request, view):
        if not _is_authenticated(request):
            return False
        return has_global_permission(
            request.user, "enterprise.download_sensitive_material"
        )


class CanManageMaterialPackage(permissions.BasePermission):
    """管理材料包权限。"""

    message = "您没有管理材料包的权限"

    def has_permission(self, request, view):
        if not _is_authenticated(request):
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return has_global_permission(
            request.user, "enterprise.manage_material_package"
        )


# 权限码注册
PERMISSIONS = [
    ("enterprise.manage_company", "管理公司"),
    ("enterprise.manage_material", "管理材料"),
    ("enterprise.download_sensitive_material", "下载敏感材料"),
    ("enterprise.manage_material_package", "管理材料包"),
]
