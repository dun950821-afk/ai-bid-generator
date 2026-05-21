"""角色权限维护服务（spec §4.2.3、附录 A #11）。"""
from apps.accounts.permissions_registry import PROJECT
from apps.accounts.services.permission_service import SYSTEM_ADMIN_ROLE_CODE
from apps.common.exceptions import ValidationError


def assert_global_only(permissions):
    """校验 permissions 全部为 global scope；含项目级权限即抛 ValidationError。"""
    project_scoped = [p for p in permissions if p.scope == PROJECT]
    if project_scoped:
        codes = "、".join(p.code for p in project_scoped)
        raise ValidationError(message=f"角色不能绑定项目级权限：{codes}")


def set_role_permissions(role, permissions):
    """设置角色的全局权限集合。

    system_admin 的"全部权限"由 permission_service 直通，不允许显式绑定。
    permissions 须全部为 global scope。
    """
    if role.code == SYSTEM_ADMIN_ROLE_CODE:
        raise ValidationError(message="system_admin 的权限由系统直通，不可手动设置")
    permissions = list(permissions)
    assert_global_only(permissions)
    role.permissions.set(permissions)
    return role
