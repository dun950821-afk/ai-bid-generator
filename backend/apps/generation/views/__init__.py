# backend/apps/generation/views/__init__.py
"""提示词管理视图。"""

from .template_views import (
    PromptTemplateListView,
    PromptTemplateDetailView,
    PromptVersionListView,
    PromptVersionDetailView,
    PromptVersionPublishView,
    PromptVersionCopyView,
    ModelProviderListView,
    ModelConfigListView,
)
from .playground_views import (
    PlaygroundRenderView,
    PlaygroundRunView,
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
    "ModelProviderListView",
    "ModelConfigListView",
    "PlaygroundRenderView",
    "PlaygroundRunView",
    "PromptRunListView",
    "PromptRunDetailView",
]