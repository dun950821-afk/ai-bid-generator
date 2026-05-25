# backend/apps/workflows/views/__init__.py
"""工作流视图。"""

from .template_views import SystemTemplateListView
from .workflow_views import (
    LotWorkflowDetailView,
    LotWorkflowStatusView,
    LotWorkflowInitializeView,
    LotWorkflowStartView,
)
from .node_views import (
    NodeDetailView,
    NodeStartView,
    NodeCompleteView,
    NodeFailView,
    NodeRetryView,
    NodeApproveView,
    NodeRejectView,
    NodeArtifactsView,
    NodeLogsView,
)

__all__ = [
    "SystemTemplateListView",
    "LotWorkflowDetailView",
    "LotWorkflowStatusView",
    "LotWorkflowInitializeView",
    "LotWorkflowStartView",
    "NodeDetailView",
    "NodeStartView",
    "NodeCompleteView",
    "NodeFailView",
    "NodeRetryView",
    "NodeApproveView",
    "NodeRejectView",
    "NodeArtifactsView",
    "NodeLogsView",
]