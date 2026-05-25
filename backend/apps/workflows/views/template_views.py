# backend/apps/workflows/views/template_views.py
"""模板视图。"""

from rest_framework import generics

from apps.workflows.models import WorkflowTemplate
from apps.workflows.serializers import WorkflowTemplateSerializer


class SystemTemplateListView(generics.ListAPIView):
    """系统模板列表。"""

    serializer_class = WorkflowTemplateSerializer

    def get_queryset(self):
        return WorkflowTemplate.objects.filter(
            scope="system",
            is_active=True,
        ).prefetch_related("node_templates")