# backend/apps/outline/urls.py
"""大纲模块 URL 路由。"""

from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.outline.views import (
    GenerationTaskViewSet,
    OutlineViewSet,
    PresetOutlineTemplateViewSet,
    SectionViewSet,
)
from apps.outline.views_bid_document import BidDocumentViewSet
from apps.outline.views_onlyoffice_callback import onlyoffice_callback

router = DefaultRouter()
router.register(r"preset-templates", PresetOutlineTemplateViewSet, basename="preset-template")
router.register(r"outlines", OutlineViewSet, basename="outline")
router.register(r"sections", SectionViewSet, basename="section")
router.register(r"generation-tasks", GenerationTaskViewSet, basename="generation-task")
router.register(r"bid-documents", BidDocumentViewSet, basename="bid-document")

urlpatterns = router.urls + [
    # ONLYOFFICE callback（不需要认证）
    path("onlyoffice/callback/<int:document_id>/", onlyoffice_callback, name="onlyoffice-callback"),
]