# backend/apps/enterprise/urls.py
"""企业资料中心 URL 路由。"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.enterprise.views import (
    BidMaterialPackageTopLevelViewSet,
    BidMaterialPackageViewSet,
    CompanyCaseViewSet,
    CompanyMaterialViewSet,
    CompanyProfileViewSet,
)

router = DefaultRouter()
router.register(r"companies", CompanyProfileViewSet, basename="company")
router.register(r"materials", CompanyMaterialViewSet, basename="material")
router.register(r"cases", CompanyCaseViewSet, basename="case")
router.register(
    r"material-packages",
    BidMaterialPackageTopLevelViewSet,
    basename="material-package-top",
)

# 材料包使用嵌套路由
outline_router = DefaultRouter()
outline_router.register(
    r"material-package",
    BidMaterialPackageViewSet,
    basename="material-package",
)

urlpatterns = [
    path("", include(router.urls)),
    path("outlines/<int:outline_id>/", include(outline_router.urls)),
]
