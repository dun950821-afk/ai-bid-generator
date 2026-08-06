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
    PromptVersionCopyDraftView,
    PromptVersionByScenarioListView,
    ModelProviderListView,
    ModelProviderDetailView,
    ModelConfigListView,
    ModelConfigDetailView,
    ModelConfigSetDefaultView,
    ModelConfigTestConnectionView,
    PlaygroundRenderView,
    PlaygroundRunView,
    PlaygroundParseDocumentView,
    PromptRunListView,
    PromptRunDetailView,
)

urlpatterns = [
    # 提示词模板
    path("prompt-templates/", PromptTemplateListView.as_view(), name="prompt-template-list"),
    path("prompt-templates/<int:pk>/", PromptTemplateDetailView.as_view(), name="prompt-template-detail"),
    path("prompt-templates/<int:template_id>/versions/", PromptVersionListView.as_view(), name="prompt-version-list"),
    path("prompt-templates/<int:template_id>/versions/<int:version_id>/", PromptVersionDetailView.as_view(), name="prompt-version-detail"),
    path("prompt-templates/<int:template_id>/versions/<int:version_id>/publish/", PromptVersionPublishView.as_view(), name="prompt-version-publish"),
    path("prompt-templates/<int:template_id>/versions/<int:version_id>/copy/", PromptVersionCopyView.as_view(), name="prompt-version-copy"),
    path("prompt-templates/<int:template_id>/versions/<int:version_id>/copy-draft/", PromptVersionCopyDraftView.as_view(), name="prompt-version-copy-draft"),

    # 按场景获取版本（轻量接口）
    path("prompt-versions/", PromptVersionByScenarioListView.as_view(), name="prompt-version-by-scenario"),

    # 模型供应商和配置
    path("model-providers/", ModelProviderListView.as_view(), name="model-provider-list"),
    path("model-providers/<int:pk>/", ModelProviderDetailView.as_view(), name="model-provider-detail"),
    path("model-configs/", ModelConfigListView.as_view(), name="model-config-list"),
    path("model-configs/<int:pk>/", ModelConfigDetailView.as_view(), name="model-config-detail"),
    path("model-configs/<int:pk>/set-default/", ModelConfigSetDefaultView.as_view(), name="model-config-set-default"),
    path("model-configs/<int:pk>/test-connection/", ModelConfigTestConnectionView.as_view(), name="model-config-test-connection"),

    # Playground
    path("playground/parse-document/", PlaygroundParseDocumentView.as_view(), name="playground-parse-document"),
    path("playground/render/", PlaygroundRenderView.as_view(), name="playground-render"),
    path("playground/run/", PlaygroundRunView.as_view(), name="playground-run"),
    path("prompt-runs/", PromptRunListView.as_view(), name="prompt-run-list"),
    path("prompt-runs/<int:pk>/", PromptRunDetailView.as_view(), name="prompt-run-detail"),
]