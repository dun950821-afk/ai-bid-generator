# backend/apps/accounts/views/user_views.py
"""用户管理视图。"""
import secrets

from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.filters import SearchFilter

from apps.accounts.models import User
from apps.accounts.serializers import (
    UserListSerializer,
    UserCreateSerializer,
    UserUpdateSerializer,
)
from apps.accounts.permissions import MustChangePasswordPermission, RequirePermission
from apps.accounts.permissions_registry import GLOBAL
from apps.audit.services import audit_service
from apps.common.exceptions import NotFound


class UserListView(generics.ListCreateAPIView):
    """用户列表 / 新增用户。"""

    permission_classes = [IsAuthenticated, RequirePermission]
    required_permission = "user.manage"
    required_scope = GLOBAL

    filter_backends = [SearchFilter]
    search_fields = ["username", "real_name", "email", "phone"]

    def get_queryset(self):
        return User.objects.all().prefetch_related("roles").order_by("-created_at")

    def get_serializer_class(self):
        if self.request.method == "POST":
            return UserCreateSerializer
        return UserListSerializer

    def perform_create(self, serializer):
        user = serializer.save()
        audit_service.log_operation(
            actor=self.request.user,
            action="user_create",
            request=self.request,
            target_type="user",
            target_id=user.pk,
            summary=f"创建用户 {user.username}",
        )


class UserDetailView(generics.RetrieveUpdateDestroyAPIView):
    """用户详情 / 编辑 / 禁用。"""

    permission_classes = [IsAuthenticated, RequirePermission]
    required_permission = "user.manage"
    required_scope = GLOBAL

    def get_queryset(self):
        return User.objects.all().prefetch_related("roles")

    def get_serializer_class(self):
        return UserUpdateSerializer

    def perform_update(self, serializer):
        user = serializer.save()
        audit_service.log_operation(
            actor=self.request.user,
            action="user_update",
            request=self.request,
            target_type="user",
            target_id=user.pk,
            summary=f"更新用户 {user.username}",
        )

    def destroy(self, request, *args, **kwargs):
        """禁用用户而非删除。"""
        user = self.get_object()
        user.is_active = False
        user.save(update_fields=["is_active"])
        audit_service.log_operation(
            actor=request.user,
            action="user_disable",
            request=request,
            target_type="user",
            target_id=user.pk,
            summary=f"禁用用户 {user.username}",
        )
        return Response({"detail": "用户已禁用"}, status=status.HTTP_200_OK)


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


class EnableUserView(APIView):
    """启用用户。"""

    permission_classes = [IsAuthenticated, RequirePermission]
    required_permission = "user.manage"
    required_scope = GLOBAL

    def post(self, request, user_id):
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            raise NotFound(message="用户不存在")

        user.is_active = True
        user.save(update_fields=["is_active"])
        audit_service.log_operation(
            actor=request.user,
            action="user_enable",
            request=request,
            target_type="user",
            target_id=user.pk,
            summary=f"启用用户 {user.username}",
        )
        return Response({"detail": "用户已启用"})