"""accounts 应用 API 路由。"""
from django.urls import path

from apps.accounts.views.auth_views import LoginView, LogoutView, RefreshView

app_name = "accounts"

urlpatterns = [
    path("auth/login", LoginView.as_view(), name="login"),
    path("auth/refresh", RefreshView.as_view(), name="refresh"),
    path("auth/logout", LogoutView.as_view(), name="logout"),
]
