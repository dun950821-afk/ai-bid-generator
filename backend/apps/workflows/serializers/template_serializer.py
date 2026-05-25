# backend/apps/workflows/serializers/template_serializer.py
"""模板序列化器。"""

from rest_framework import serializers

from apps.workflows.models import WorkflowTemplate, WorkflowNodeTemplate
from apps.workflows.constants import NODE_TYPE_TO_VISUAL, NodeVisualType


class WorkflowNodeTemplateSerializer(serializers.ModelSerializer):
    """节点模板序列化器。"""

    visual_type = serializers.SerializerMethodField()

    class Meta:
        model = WorkflowNodeTemplate
        fields = [
            "id",
            "name",
            "order",
            "default_assignee_type",
            "default_assignee_role",
            "requires_approval",
            "visual_type",
        ]

    def get_visual_type(self, obj):
        """获取视觉类型。"""
        # 根据节点名称推断类型
        name_lower = obj.name.lower()
        if "解析" in name_lower or "分块" in name_lower or "抽取" in name_lower:
            return NodeVisualType.DATA
        if "ai" in name_lower or "生成" in name_lower or "分析" in name_lower:
            return NodeVisualType.AI
        if "审批" in name_lower or "审核" in name_lower or "确认" in name_lower:
            return NodeVisualType.APPROVAL
        if "上传" in name_lower or "补充" in name_lower:
            return NodeVisualType.MANUAL
        if "导出" in name_lower or "校验" in name_lower:
            return NodeVisualType.SYSTEM
        return NodeVisualType.DATA


class WorkflowTemplateSerializer(serializers.ModelSerializer):
    """流程模板序列化器。"""

    nodes = WorkflowNodeTemplateSerializer(
        source="node_templates",
        many=True,
        read_only=True,
    )

    class Meta:
        model = WorkflowTemplate
        fields = [
            "id",
            "name",
            "description",
            "scope",
            "is_builtin",
            "is_active",
            "nodes",
        ]
