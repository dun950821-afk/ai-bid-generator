# backend/apps/requirements/urls.py
"""requirements URL 配置。"""

from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    RequirementExtractV2View,
    RequirementListView,
    RequirementViewSet,
    ExtractionRunListView,
    ExtractionRunActivateView,
    LotRequirementDedupView,
    LotDedupRunLatestView,
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
    # 文件抽取运行历史列表
    path(
        "requirements/files/<int:file_id>/runs/",
        ExtractionRunListView.as_view(),
        name="extraction-run-list",
    ),
    # 手动切换当前抽取版本
    path(
        "requirements/runs/<int:run_id>/activate/",
        ExtractionRunActivateView.as_view(),
        name="extraction-run-activate",
    ),
    # 标段级条款去重触发
    path(
        "requirements/lots/<int:lot_id>/dedup/",
        LotRequirementDedupView.as_view(),
        name="lot-requirement-dedup",
    ),
    # 标段最新一次去重运行
    path(
        "requirements/lots/<int:lot_id>/dedup-runs/latest/",
        LotDedupRunLatestView.as_view(),
        name="lot-dedup-run-latest",
    ),
] + router.urls