# backend/apps/requirements/urls.py
"""requirements URL 配置。"""

from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    RequirementExtractView,
    RequirementListView,
    RequirementViewSet,
)

router = DefaultRouter()
router.register(r"requirements", RequirementViewSet, basename="requirement")

urlpatterns = [
    # 条款抽取
    path(
        "requirements/files/<int:file_id>/extract/",
        RequirementExtractView.as_view(),
        name="requirement-extract",
    ),
    # 文件条款列表
    path(
        "requirements/files/<int:file_id>/",
        RequirementListView.as_view(),
        name="requirement-list",
    ),
] + router.urls
