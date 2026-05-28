"""accounts 应用 API 路由。"""
from django.urls import path

from apps.accounts.views import (
    CaptchaView,
    ChangePasswordView,
    LoginView,
    LogoutView,
    MeView,
    RefreshView,
    UserListView,
    UserDetailView,
    ResetPasswordView,
    EnableUserView,
    RoleListView,
    RoleDetailView,
    PermissionListView,
    PermissionTreeView,
)

app_name = "accounts"

urlpatterns = [
    # 认证
    path("auth/login", LoginView.as_view(), name="login"),
    path("auth/refresh", RefreshView.as_view(), name="refresh"),
    path("auth/logout", LogoutView.as_view(), name="logout"),
    path("auth/me", MeView.as_view(), name="me"),
    path("auth/captcha", CaptchaView.as_view(), name="captcha"),
    path("auth/change-password", ChangePasswordView.as_view(), name="change-password"),

    # 用户管理
    path("users/", UserListView.as_view(), name="user-list"),
    path("users/<int:pk>/", UserDetailView.as_view(), name="user-detail"),
    path("users/<int:user_id>/reset-password", ResetPasswordView.as_view(), name="reset-password"),
    path("users/<int:user_id>/enable", EnableUserView.as_view(), name="user-enable"),

    # 角色管理
    path("roles/", RoleListView.as_view(), name="role-list"),
    path("roles/<int:pk>/", RoleDetailView.as_view(), name="role-detail"),

    # 权限
    path("permissions/", PermissionListView.as_view(), name="permission-list"),
    path("permissions/tree/", PermissionTreeView.as_view(), name="permission-tree"),
]
