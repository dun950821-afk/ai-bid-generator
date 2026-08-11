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
from apps.outline.views_bid_template import (
    BidWordTemplateVariableListView,
    BidWordTemplateViewSet,
)
from apps.outline.views_onlyoffice_callback import (
    onlyoffice_callback,
    onlyoffice_template_callback,
)
from apps.outline.views_sse import BatchGenerationSSEView, OutlineProgressSSEView
from apps.outline.outline_kb_views import (
    OutlineKnowledgeBaseViewSet,
    SectionRetrievalSearchView,
    SectionManualSourceViewSet,
    SectionLatestGenerationRecordView,
)

router = DefaultRouter()
router.register(r"preset-templates", PresetOutlineTemplateViewSet, basename="preset-template")
router.register(r"outlines", OutlineViewSet, basename="outline")
router.register(r"sections", SectionViewSet, basename="section")
router.register(r"generation-tasks", GenerationTaskViewSet, basename="generation-task")
router.register(r"bid-documents", BidDocumentViewSet, basename="bid-document")
router.register(r"bid-word-templates", BidWordTemplateViewSet, basename="bid-word-template")

urlpatterns = router.urls + [
    # ONLYOFFICE callback（不需要认证）
    path("onlyoffice/callback/<int:document_id>/", onlyoffice_callback, name="onlyoffice-callback"),
    path("onlyoffice/callback/template/<int:template_id>/", onlyoffice_template_callback, name="onlyoffice-template-callback"),
    # 模板变量注册表
    path("bid-word-template-variables/", BidWordTemplateVariableListView.as_view(), name="bid-word-template-variables"),
    # SSE 进度推送
    path("sse/generation-tasks/<int:task_id>/", BatchGenerationSSEView.as_view(), name="sse-generation-task"),
    path("sse/outlines/<int:outline_id>/", OutlineProgressSSEView.as_view(), name="sse-outline-progress"),
    # 大纲知识库绑定
    path("outlines/<int:outline_id>/knowledge-bases/",
         OutlineKnowledgeBaseViewSet.as_view({"get": "list", "post": "create"}),
         name="outline-kb-list"),
    path("outlines/<int:outline_id>/knowledge-bases/<int:pk>/",
         OutlineKnowledgeBaseViewSet.as_view({"delete": "destroy", "patch": "partial_update"}),
         name="outline-kb-detail"),
    # 章节手动检索
    path("sections/<int:section_id>/retrieval/search/",
         SectionRetrievalSearchView.as_view(), name="section-retrieval-search"),
    # 章节人工选源
    path("sections/<int:section_id>/manual-sources/",
         SectionManualSourceViewSet.as_view({"get": "list", "post": "create"}),
         name="section-manual-source-list"),
    path("sections/<int:section_id>/manual-sources/<int:pk>/",
         SectionManualSourceViewSet.as_view({"delete": "destroy"}),
         name="section-manual-source-detail"),
    # 章节最近生成记录
    path("sections/<int:section_id>/generation-records/latest/",
         SectionLatestGenerationRecordView.as_view(), name="section-latest-record"),
]