"""用户管理视图（spec §5.7）。"""
import secrets

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.accounts.permissions import MustChangePasswordPermission, RequirePermission
from apps.accounts.permissions_registry import GLOBAL
from apps.audit.services import audit_service
from apps.common.exceptions import NotFound


class ResetPasswordView(APIView):
    """POST /api/users/<user_id>/reset-password —— 管理员重置用户密码。"""

    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
        RequirePermission,
    ]
    required_permission = "user.manage"
    required_scope = GLOBAL

    def post(self, request, user_id):
        try:
            target = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            raise NotFound(message="用户不存在")
        temp_password = secrets.token_urlsafe(9)
        target.set_password(temp_password)
        target.must_change_password = True
        target.save(update_fields=["password", "must_change_password"])
        audit_service.log_operation(
            actor=request.user,
            action="password_reset",
            request=request,
            target_type="user",
            target_id=target.pk,
            summary=f"重置用户 {target.username} 的密码",
        )
        return Response({"temporary_password": temp_password})
