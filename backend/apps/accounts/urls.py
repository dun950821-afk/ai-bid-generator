"""accounts 应用 API 路由。"""
from django.urls import path

from apps.accounts.views.auth_views import LoginView

app_name = "accounts"

urlpatterns = [
    path("auth/login", LoginView.as_view(), name="login"),
]
