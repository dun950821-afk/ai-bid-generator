"""accounts 应用 API 路由。"""
from django.urls import path

from apps.accounts.views.auth_views import (
    CaptchaView,
    ChangePasswordView,
    LoginView,
    LogoutView,
    MeView,
    RefreshView,
)
from apps.accounts.views.user_views import ResetPasswordView

app_name = "accounts"

urlpatterns = [
    path("auth/login", LoginView.as_view(), name="login"),
    path("auth/refresh", RefreshView.as_view(), name="refresh"),
    path("auth/logout", LogoutView.as_view(), name="logout"),
    path("auth/me", MeView.as_view(), name="me"),
    path("auth/captcha", CaptchaView.as_view(), name="captcha"),
    path("auth/change-password", ChangePasswordView.as_view(), name="change-password"),
    path(
        "users/<int:user_id>/reset-password",
        ResetPasswordView.as_view(),
        name="reset-password",
    ),
]
