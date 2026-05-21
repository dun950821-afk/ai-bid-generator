"""登录流程收尾服务（spec §5.2）。

Provider 换出 User 之后，complete_login 统一负责：
is_active 校验 → 签发 JWT → 更新 last_login → 收集全局权限与菜单 → 写审计日志。
"""
from django.contrib.auth.models import update_last_login
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.auth.exceptions import AccountDisabled
from apps.accounts.serializers import UserSerializer
from apps.accounts.services import menu_service, permission_service
from apps.audit.services import audit_service


def complete_login(user, request=None):
    """完成登录并返回登录响应数据 dict。

    停用账号会写一条 login_failed 审计并抛 AccountDisabled。
    返回 dict 含 access / refresh / user / global_permissions / menu_tree /
    must_change_password；refresh 由调用方（LoginView）写入 httpOnly Cookie，
    不进响应体。
    """
    if not user.is_active:
        audit_service.log_operation(
            actor=None,
            action="login_failed",
            request=request,
            summary="账号已停用",
            extra={"username": user.username, "reason": "disabled"},
        )
        raise AccountDisabled

    refresh = RefreshToken.for_user(user)
    update_last_login(None, user)

    global_permissions = sorted(permission_service.get_global_permissions(user))
    menu_tree = menu_service.build_menu_tree(global_permissions)

    audit_service.log_operation(
        actor=user, action="login_success", request=request, summary="登录成功"
    )

    return {
        "access": str(refresh.access_token),
        "refresh": str(refresh),
        "user": UserSerializer(user).data,
        "global_permissions": global_permissions,
        "menu_tree": menu_tree,
        "must_change_password": user.must_change_password,
    }
