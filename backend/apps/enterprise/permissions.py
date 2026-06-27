# backend/apps/enterprise/permissions.py
"""企业资料中心权限定义。"""

from rest_framework import permissions


class CanManageCompany(permissions.BasePermission):
    """管理公司权限。"""

    message = "您没有管理公司的权限"

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        return request.user.has_perm("enterprise.manage_company")


class CanManageMaterial(permissions.BasePermission):
    """管理材料权限。"""

    message = "您没有管理材料的权限"

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        return request.user.has_perm("enterprise.manage_material")


class CanDownloadSensitiveMaterial(permissions.BasePermission):
    """下载敏感材料权限。"""

    message = "您没有下载敏感材料的权限"

    def has_permission(self, request, view):
        return request.user.has_perm("enterprise.download_sensitive_material")


class CanManageMaterialPackage(permissions.BasePermission):
    """管理材料包权限。"""

    message = "您没有管理材料包的权限"

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        return request.user.has_perm("enterprise.manage_material_package")


# 权限码注册
PERMISSIONS = [
    ("enterprise.manage_company", "管理公司"),
    ("enterprise.manage_material", "管理材料"),
    ("enterprise.download_sensitive_material", "下载敏感材料"),
    ("enterprise.manage_material_package", "管理材料包"),
]
