# backend/apps/requirements/urls.py
"""requirements URL 配置。"""

from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    RequirementExtractV2View,
    RequirementListView,
    RequirementViewSet,
)

router = DefaultRouter()
router.register(r"requirements", RequirementViewSet, basename="requirement")

urlpatterns = [
    # 条款抽取（V2，并行 6 场景）
    path(
        "requirements/files/<int:file_id>/extract-v2/",
        RequirementExtractV2View.as_view(),
        name="requirement-extract-v2",
    ),
    # 文件条款列表
    path(
        "requirements/files/<int:file_id>/",
        RequirementListView.as_view(),
        name="requirement-list",
    ),
] + router.urls