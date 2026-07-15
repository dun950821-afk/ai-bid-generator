# backend/dashboard/urls.py
"""工作台大屏 URL 路由。"""

from django.urls import path

from .views import DashboardOverviewView

urlpatterns = [
    path("dashboard/overview/", DashboardOverviewView.as_view(), name="dashboard-overview"),
]
