# backend/apps/workflows/urls.py
"""工作流 URL 路由。"""

from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.workflows.views import (
    SystemTemplateListView,
    WorkflowTemplateListView,
    WorkflowTemplateDetailView,
    WorkflowTemplateCopyView,
    WorkflowNodeTemplateListView,
    WorkflowNodeTemplateDetailView,
    WorkflowNodeReorderView,
    LotWorkflowDetailView,
    LotWorkflowStatusView,
    LotWorkflowInitializeView,
    LotWorkflowStartView,
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


urlpatterns = [
    # 系统模板（旧接口，兼容）
    path(
        "workflows/templates/system/",
        SystemTemplateListView.as_view(),
        name="workflow-templates-system",
    ),

    # 流程模板管理（新接口）
    path(
        "workflow-templates/",
        WorkflowTemplateListView.as_view(),
        name="workflow-template-list",
    ),
    path(
        "workflow-templates/<int:pk>/",
        WorkflowTemplateDetailView.as_view(),
        name="workflow-template-detail",
    ),
    path(
        "workflow-templates/<int:pk>/copy/",
        WorkflowTemplateCopyView.as_view(),
        name="workflow-template-copy",
    ),
    path(
        "workflow-templates/<int:template_id>/nodes/",
        WorkflowNodeTemplateListView.as_view(),
        name="workflow-node-template-list",
    ),
    path(
        "workflow-templates/<int:template_id>/nodes/<int:pk>/",
        WorkflowNodeTemplateDetailView.as_view(),
        name="workflow-node-template-detail",
    ),
    path(
        "workflow-templates/<int:template_id>/nodes/reorder/",
        WorkflowNodeReorderView.as_view(),
        name="workflow-node-reorder",
    ),

    # 工作流实例
    path(
        "workflows/instances/<int:lot_id>/",
        LotWorkflowDetailView.as_view(),
        name="workflow-instance-detail",
    ),
    path(
        "workflows/instances/<int:lot_id>/status/",
        LotWorkflowStatusView.as_view(),
        name="workflow-instance-status",
    ),
    path(
        "workflows/instances/<int:lot_id>/initialize/",
        LotWorkflowInitializeView.as_view(),
        name="workflow-instance-initialize",
    ),
    path(
        "workflows/instances/<int:lot_id>/start/",
        LotWorkflowStartView.as_view(),
        name="workflow-instance-start",
    ),

    # 节点
    path(
        "workflows/nodes/<int:pk>/",
        NodeDetailView.as_view(),
        name="workflow-node-detail",
    ),
    path(
        "workflows/nodes/<int:node_id>/start/",
        NodeStartView.as_view(),
        name="workflow-node-start",
    ),
    path(
        "workflows/nodes/<int:node_id>/complete/",
        NodeCompleteView.as_view(),
        name="workflow-node-complete",
    ),
    path(
        "workflows/nodes/<int:node_id>/fail/",
        NodeFailView.as_view(),
        name="workflow-node-fail",
    ),
    path(
        "workflows/nodes/<int:node_id>/retry/",
        NodeRetryView.as_view(),
        name="workflow-node-retry",
    ),
    path(
        "workflows/nodes/<int:node_id>/approve/",
        NodeApproveView.as_view(),
        name="workflow-node-approve",
    ),
    path(
        "workflows/nodes/<int:node_id>/reject/",
        NodeRejectView.as_view(),
        name="workflow-node-reject",
    ),
    path(
        "workflows/nodes/<int:node_id>/artifacts/",
        NodeArtifactsView.as_view(),
        name="workflow-node-artifacts",
    ),
    path(
        "workflows/nodes/<int:node_id>/logs/",
        NodeLogsView.as_view(),
        name="workflow-node-logs",
    ),
]
