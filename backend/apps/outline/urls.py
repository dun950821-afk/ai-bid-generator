# backend/apps/outline/urls.py
"""大纲模块 URL 路由。"""

from rest_framework.routers import DefaultRouter

from apps.outline.views import (
    OutlineViewSet,
    PresetOutlineTemplateViewSet,
    SectionViewSet,
)

router = DefaultRouter()
router.register(r"preset-templates", PresetOutlineTemplateViewSet, basename="preset-template")
router.register(r"outlines", OutlineViewSet, basename="outline")
router.register(r"sections", SectionViewSet, basename="section")

urlpatterns = router.urls
