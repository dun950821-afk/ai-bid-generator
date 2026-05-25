# backend/apps/workflows/views/node_views.py
"""节点视图。"""

from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import generics
from django.shortcuts import get_object_or_404

from apps.workflows.models import WorkflowNodeInstance
from apps.workflows.services import WorkflowService
from apps.workflows.services.audit_service import AuditService
from apps.workflows.serializers import (
    WorkflowNodeInstanceSerializer,
    WorkflowAuditLogSerializer,
)
from apps.workflows.constants import STATE_TRANSITIONS
from apps.workflows.exceptions import StateTransitionError


class NodeDetailView(generics.RetrieveAPIView):
    """节点详情。"""

    serializer_class = WorkflowNodeInstanceSerializer
    queryset = WorkflowNodeInstance.objects.select_related("lot_workflow", "node_template")


class NodeActionMixin:
    """节点动作混入。"""

    def validate_state_transition(self, node, action):
        """校验状态迁移合法性。"""
        allowed = STATE_TRANSITIONS.get(node.status, [])
        if action not in allowed:
            raise StateTransitionError({
                "error": "invalid_state_transition",
                "message": f"节点状态为 {node.status}，无法执行 {action}",
                "current_status": node.status,
                "allowed_actions": allowed,
            })


class NodeStartView(NodeActionMixin, APIView):
    """开始执行节点。"""

    def post(self, request, node_id):
        node = get_object_or_404(WorkflowNodeInstance, pk=node_id)
        self.validate_state_transition(node, 'start')

        previous_status = node.status
        WorkflowService.start_node(node, request.user)
        node.refresh_from_db()
        AuditService.record(node, 'start', previous_status, node.status, request.user)

        return Response({
            "id": node.id,
            "status": node.status,
        })


class NodeCompleteView(NodeActionMixin, APIView):
    """完成节点。"""

    def post(self, request, node_id):
        node = get_object_or_404(WorkflowNodeInstance, pk=node_id)
        self.validate_state_transition(node, 'complete')

        previous_status = node.status
        WorkflowService.complete_node(node, request.user)
        node.refresh_from_db()
        AuditService.record(node, 'complete', previous_status, node.status, request.user)

        return Response({
            "id": node.id,
            "status": node.status,
        })


class NodeFailView(NodeActionMixin, APIView):
    """标记失败。"""

    def post(self, request, node_id):
        node = get_object_or_404(WorkflowNodeInstance, pk=node_id)
        self.validate_state_transition(node, 'fail')

        previous_status = node.status
        reason = request.data.get('reason', '')
        WorkflowService.fail_node(node, request.user, reason)
        node.refresh_from_db()
        AuditService.record(node, 'fail', previous_status, node.status, request.user, reason)

        return Response({
            "id": node.id,
            "status": node.status,
        })


class NodeRetryView(NodeActionMixin, APIView):
    """重试节点。"""

    def post(self, request, node_id):
        node = get_object_or_404(WorkflowNodeInstance, pk=node_id)
        self.validate_state_transition(node, 'retry')

        previous_status = node.status
        reason = request.data.get('reason', '')
        WorkflowService.start_node(node, request.user)
        node.refresh_from_db()
        AuditService.record(node, 'retry', previous_status, node.status, request.user, reason)

        return Response({
            "id": node.id,
            "status": node.status,
        })


class NodeApproveView(NodeActionMixin, APIView):
    """审批通过。"""

    def post(self, request, node_id):
        node = get_object_or_404(WorkflowNodeInstance, pk=node_id)
        self.validate_state_transition(node, 'approve')

        previous_status = node.status
        comment = request.data.get('comment', '')
        WorkflowService.approve_node(node, request.user, comment)
        node.refresh_from_db()
        AuditService.record(node, 'approve', previous_status, node.status, request.user, comment)

        return Response({
            "id": node.id,
            "status": node.status,
            "approval_status": node.approval_status,
        })


class NodeRejectView(NodeActionMixin, APIView):
    """审批驳回。"""

    def post(self, request, node_id):
        node = get_object_or_404(WorkflowNodeInstance, pk=node_id)
        self.validate_state_transition(node, 'reject')

        previous_status = node.status
        comment = request.data.get('comment', '')
        WorkflowService.reject_node(node, request.user, comment)
        node.refresh_from_db()
        AuditService.record(node, 'reject', previous_status, node.status, request.user, comment)

        return Response({
            "id": node.id,
            "status": node.status,
            "approval_status": node.approval_status,
        })


class NodeArtifactsView(APIView):
    """节点产物列表。"""

    def get(self, request, node_id):
        node = get_object_or_404(WorkflowNodeInstance, pk=node_id)

        # TODO: 从节点关联的产物（ParsedDocument、PromptRun 等）获取
        artifacts = []

        return Response({
            "results": artifacts,
            "count": len(artifacts),
        })


class NodeLogsView(APIView):
    """节点日志（分页）。"""

    def get(self, request, node_id):
        node = get_object_or_404(WorkflowNodeInstance, pk=node_id)

        page = int(request.query_params.get('page', 1))
        page_size = int(request.query_params.get('page_size', 50))

        logs, total = AuditService.get_node_logs(node, page, page_size)
        serializer = WorkflowAuditLogSerializer(logs, many=True)

        return Response({
            "results": serializer.data,
            "count": total,
            "page": page,
            "page_size": page_size,
        })