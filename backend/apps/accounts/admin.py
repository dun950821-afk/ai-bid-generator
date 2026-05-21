"""accounts 应用 Django Admin 注册（spec §4.2.3）。"""
from django import forms
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from apps.accounts.models import Permission, Role, User
from apps.accounts.services import role_service
from apps.accounts.services.permission_service import SYSTEM_ADMIN_ROLE_CODE
from apps.common.exceptions import ValidationError as APIValidationError


class RoleAdminForm(forms.ModelForm):
    """角色表单：复用 role_service 的 scope 校验。"""

    class Meta:
        model = Role
        fields = ["code", "name", "description", "is_system", "permissions"]

    def clean_permissions(self):
        permissions = self.cleaned_data.get("permissions")
        if permissions:
            try:
                role_service.assert_global_only(permissions)
            except APIValidationError as exc:
                raise forms.ValidationError(exc.message)
        return permissions


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    form = RoleAdminForm
    list_display = ("code", "name", "is_system")
    search_fields = ("code", "name")
    filter_horizontal = ("permissions",)

    def get_readonly_fields(self, request, obj=None):
        if obj and obj.is_system:
            fields = ["code", "is_system"]
            if obj.code == SYSTEM_ADMIN_ROLE_CODE:
                fields.append("permissions")  # system_admin 权限不可编辑
            return fields
        return []

    def has_delete_permission(self, request, obj=None):
        if obj and obj.is_system:
            return False  # 内置角色不可删除
        return super().has_delete_permission(request, obj)


@admin.register(Permission)
class PermissionAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "module", "scope", "is_active")
    list_filter = ("scope", "module", "is_active")
    search_fields = ("code", "name")

    def has_add_permission(self, request):
        return False  # 权限点由注册表 + 迁移管理

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    list_display = (
        "username", "real_name", "department", "is_active", "must_change_password",
    )
    search_fields = ("username", "real_name", "email")
    filter_horizontal = ("roles", "groups", "user_permissions")
    fieldsets = DjangoUserAdmin.fieldsets + (
        ("业务信息", {
            "fields": ("real_name", "phone", "department", "must_change_password", "roles"),
        }),
    )
    add_fieldsets = DjangoUserAdmin.add_fieldsets + (
        ("业务信息", {"fields": ("real_name", "phone", "department")}),
    )
