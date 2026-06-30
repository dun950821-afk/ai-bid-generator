# backend/apps/bid_check/urls.py
"""废标检查模块 URL 路由。"""

from rest_framework.routers import DefaultRouter

from apps.bid_check.views import BidCheckFindingViewSet, BidCheckTaskViewSet

router = DefaultRouter()
router.register(r"tasks", BidCheckTaskViewSet, basename="bid-check-task")
router.register(r"findings", BidCheckFindingViewSet, basename="bid-check-finding")

urlpatterns = router.urls
