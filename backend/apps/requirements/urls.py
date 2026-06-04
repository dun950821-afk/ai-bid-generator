# backend/apps/requirements/urls.py
"""requirements URL 配置。"""

from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    RequirementExtractView,
    RequirementExtractV2View,
    RequirementListView,
    RequirementViewSet,
)

router = DefaultRouter()
router.register(r"requirements", RequirementViewSet, basename="requirement")

urlpatterns = [
    # 条款抽取（V2，独立于 TenderChunk）
    path(
        "requirements/files/<int:file_id>/extract-v2/",
        RequirementExtractV2View.as_view(),
        name="requirement-extract-v2",
    ),
    # 条款抽取（旧版，向后兼容）
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