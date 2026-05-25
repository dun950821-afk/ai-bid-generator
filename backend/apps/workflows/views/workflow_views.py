# backend/apps/workflows/views/workflow_views.py
"""工作流视图。"""

from django.utils import timezone
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import generics

from apps.projects.models import Lot
from apps.workflows.models import LotWorkflow, WorkflowNodeInstance
from apps.workflows.services import WorkflowService, TemplateService
from apps.workflows.serializers import (
    LotWorkflowSerializer,
    WorkflowStatusSerializer,
)


class LotWorkflowDetailView(generics.RetrieveAPIView):
    """工作流详情。"""

    serializer_class = LotWorkflowSerializer
    lookup_field = "lot_id"
    lookup_url_kwarg = "lot_id"

    def get_queryset(self):
        return LotWorkflow.objects.select_related(
            "lot",
            "workflow_template",
        ).prefetch_related("nodes")


class LotWorkflowStatusView(APIView):
    """工作流状态（轻量轮询）。"""

    def get(self, request, lot_id):
        try:
            workflow = LotWorkflow.objects.select_related("lot").get(lot_id=lot_id)
        except LotWorkflow.DoesNotExist:
            return Response(
                {"error": "workflow_not_found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        nodes = workflow.nodes.all().order_by("order")
        current_node = nodes.filter(status="in_progress").first()

        # 计算进度
        total = nodes.count()
        completed = nodes.filter(status="completed").count()
        progress = round(completed / total * 100, 1) if total > 0 else 0

        # revision 基于 updated_at 时间戳
        revision = int(workflow.updated_at.timestamp() * 1000)

        nodes_data = [
            {
                "id": n.id,
                "status": n.status,
                "progress": 100 if n.status == "completed" else (0 if n.status == "pending" else 50),
                "updated_at": n.updated_at if hasattr(n, 'updated_at') else workflow.updated_at,
            }
            for n in nodes
        ]

        return Response({
            "instance_id": workflow.id,
            "revision": revision,
            "status": workflow.status,
            "progress": progress,
            "current_node_id": current_node.id if current_node else None,
            "updated_at": workflow.updated_at,
            "nodes": nodes_data,
        })


class LotWorkflowInitializeView(APIView):
    """初始化工作流。"""

    def post(self, request, lot_id):
        try:
            lot = Lot.objects.select_related("project").get(pk=lot_id)
        except Lot.DoesNotExist:
            return Response(
                {"error": "lot_not_found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if lot.has_workflow:
            return Response(
                {"error": "workflow_already_exists"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        template_id = request.data.get("template_id")
        if template_id:
            from apps.workflows.models import WorkflowTemplate
            try:
                template = WorkflowTemplate.objects.get(pk=template_id, is_active=True)
            except WorkflowTemplate.DoesNotExist:
                return Response(
                    {"error": "template_not_found"},
                    status=status.HTTP_404_NOT_FOUND,
                )
        else:
            template = None

        try:
            workflow = WorkflowService.initialize_workflow(lot, template)
        except Exception as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {"id": workflow.id, "status": workflow.status},
            status=status.HTTP_201_CREATED,
        )


class LotWorkflowStartView(APIView):
    """启动工作流。"""

    def post(self, request, lot_id):
        try:
            workflow = LotWorkflow.objects.select_related("lot").get(lot_id=lot_id)
        except LotWorkflow.DoesNotExist:
            return Response(
                {"error": "workflow_not_found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            WorkflowService.start_workflow(workflow, request.user)
        except Exception as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response({
            "id": workflow.id,
            "status": workflow.status,
        })