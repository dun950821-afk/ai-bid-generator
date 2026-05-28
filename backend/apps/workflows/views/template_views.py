# backend/apps/workflows/views/template_views.py
"""模板视图。"""

from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db import transaction

from apps.workflows.models import WorkflowTemplate, WorkflowNodeTemplate
from apps.workflows.serializers import (
    WorkflowTemplateSerializer,
    WorkflowNodeTemplateSerializer,
)


class SystemTemplateListView(generics.ListAPIView):
    """系统模板列表。"""

    serializer_class = WorkflowTemplateSerializer

    def get_queryset(self):
        return WorkflowTemplate.objects.filter(
            scope="system",
            is_active=True,
        ).prefetch_related("node_templates")


class WorkflowTemplateListView(generics.ListCreateAPIView):
    """流程模板列表/新建。"""

    serializer_class = WorkflowTemplateSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = WorkflowTemplate.objects.all().prefetch_related("node_templates")
        scope = self.request.query_params.get("scope")
        if scope:
            queryset = queryset.filter(scope=scope)
        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == "true")
        return queryset.order_by("-created_at")

    def perform_create(self, serializer):
        # 前端可指定 scope，默认为 custom（自定义模板）
        scope = self.request.data.get("scope", "custom")
        serializer.save(scope=scope, is_builtin=False, created_by=self.request.user)


class WorkflowTemplateDetailView(generics.RetrieveUpdateDestroyAPIView):
    """流程模板详情/更新/删除。"""

    serializer_class = WorkflowTemplateSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return WorkflowTemplate.objects.filter(scope="system").prefetch_related("node_templates")

    def perform_destroy(self, instance):
        if instance.is_builtin:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("内置模板不可删除")
        instance.delete()


class WorkflowTemplateCopyView(APIView):
    """复制模板。"""

    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, pk):
        try:
            source = WorkflowTemplate.objects.get(pk=pk, scope="system")
        except WorkflowTemplate.DoesNotExist:
            return Response({"detail": "模板不存在"}, status=status.HTTP_404_NOT_FOUND)

        new_template = WorkflowTemplate.objects.create(
            name=f"{source.name} (副本)",
            description=source.description,
            scope="system",
            is_builtin=False,
            is_active=True,
            created_by=request.user,
        )

        for node in source.node_templates.all():
            WorkflowNodeTemplate.objects.create(
                workflow_template=new_template,
                name=node.name,
                order=node.order,
                default_assignee_type=node.default_assignee_type,
                default_assignee_role=node.default_assignee_role,
                requires_approval=node.requires_approval,
            )

        return Response(WorkflowTemplateSerializer(new_template).data, status=status.HTTP_201_CREATED)


class WorkflowNodeTemplateListView(generics.ListCreateAPIView):
    """节点模板列表/新建。"""

    serializer_class = WorkflowNodeTemplateSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        template_id = self.kwargs["template_id"]
        return WorkflowNodeTemplate.objects.filter(workflow_template_id=template_id)

    def perform_create(self, serializer):
        template_id = self.kwargs["template_id"]
        template = WorkflowTemplate.objects.get(pk=template_id)
        serializer.save(workflow_template=template)


class WorkflowNodeTemplateDetailView(generics.RetrieveUpdateDestroyAPIView):
    """节点模板详情/更新/删除。"""

    serializer_class = WorkflowNodeTemplateSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        template_id = self.kwargs["template_id"]
        return WorkflowNodeTemplate.objects.filter(workflow_template_id=template_id)


class WorkflowNodeReorderView(APIView):
    """节点排序。"""

    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, template_id):
        nodes = request.data.get("nodes", [])
        updated = 0
        for item in nodes:
            node_id = item.get("id")
            order = item.get("order")
            if node_id is not None and order is not None:
                updated += WorkflowNodeTemplate.objects.filter(
                    pk=node_id,
                    workflow_template_id=template_id,
                ).update(order=order)
        return Response({"updated": updated})