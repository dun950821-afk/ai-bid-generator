# backend/apps/accounts/views/__init__.py
"""accounts 应用视图层。"""

from .auth_views import (
    CaptchaView,
    ChangePasswordView,
    LoginView,
    LogoutView,
    MeView,
    RefreshView,
)
from .user_views import (
    UserListView,
    UserDetailView,
    ResetPasswordView,
    EnableUserView,
)
from .role_views import (
    RoleListView,
    RoleDetailView,
    PermissionListView,
    PermissionTreeView,
)

__all__ = [
    "CaptchaView",
    "ChangePasswordView",
    "LoginView",
    "LogoutView",
    "MeView",
    "RefreshView",
    "UserListView",
    "UserDetailView",
    "ResetPasswordView",
    "EnableUserView",
    "RoleListView",
    "RoleDetailView",
    "PermissionListView",
    "PermissionTreeView",
]
