# backend/apps/generation/urls.py
"""提示词管理 URL 路由。"""

from django.urls import path
from .views import (
    PromptTemplateListView,
    PromptTemplateDetailView,
    PromptVersionListView,
    PromptVersionDetailView,
    PromptVersionPublishView,
    PromptVersionCopyView,
    ModelProviderListView,
    ModelConfigListView,
    PlaygroundRenderView,
    PlaygroundRunView,
    PromptRunListView,
    PromptRunDetailView,
)

urlpatterns = [
    path("prompt-templates/", PromptTemplateListView.as_view(), name="prompt-template-list"),
    path("prompt-templates/<int:pk>/", PromptTemplateDetailView.as_view(), name="prompt-template-detail"),
    path("prompt-templates/<int:template_id>/versions/", PromptVersionListView.as_view(), name="prompt-version-list"),
    path("prompt-templates/<int:template_id>/versions/<int:version_id>/", PromptVersionDetailView.as_view(), name="prompt-version-detail"),
    path("prompt-templates/<int:template_id>/versions/<int:version_id>/publish/", PromptVersionPublishView.as_view(), name="prompt-version-publish"),
    path("prompt-templates/<int:template_id>/versions/<int:version_id>/copy/", PromptVersionCopyView.as_view(), name="prompt-version-copy"),
    path("model-providers/", ModelProviderListView.as_view(), name="model-provider-list"),
    path("model-configs/", ModelConfigListView.as_view(), name="model-config-list"),
    # Playground endpoints
    path("playground/render/", PlaygroundRenderView.as_view(), name="playground-render"),
    path("playground/run/", PlaygroundRunView.as_view(), name="playground-run"),
    path("prompt-runs/", PromptRunListView.as_view(), name="prompt-run-list"),
    path("prompt-runs/<int:pk>/", PromptRunDetailView.as_view(), name="prompt-run-detail"),
]
