# backend/apps/generation/views/__init__.py
"""提示词管理视图。"""

from .template_views import (
    PromptTemplateListView,
    PromptTemplateDetailView,
    PromptVersionListView,
    PromptVersionDetailView,
    PromptVersionPublishView,
    PromptVersionCopyView,
    PromptVersionCopyDraftView,
    PromptVersionByScenarioListView,
)
from .model_views import (
    ModelProviderListView,
    ModelProviderDetailView,
    ModelConfigListView,
    ModelConfigDetailView,
    ModelConfigSetDefaultView,
    ModelConfigTestConnectionView,
)
from .playground_views import (
    PlaygroundRenderView,
    PlaygroundRunView,
    PlaygroundParseDocumentView,
    PromptRunListView,
    PromptRunDetailView,
)

__all__ = [
    "PromptTemplateListView",
    "PromptTemplateDetailView",
    "PromptVersionListView",
    "PromptVersionDetailView",
    "PromptVersionPublishView",
    "PromptVersionCopyView",
    "PromptVersionCopyDraftView",
    "PromptVersionByScenarioListView",
    "ModelProviderListView",
    "ModelProviderDetailView",
    "ModelConfigListView",
    "ModelConfigDetailView",
    "ModelConfigSetDefaultView",
    "ModelConfigTestConnectionView",
    "PlaygroundRenderView",
    "PlaygroundRunView",
    "PlaygroundParseDocumentView",
    "PromptRunListView",
    "PromptRunDetailView",
]