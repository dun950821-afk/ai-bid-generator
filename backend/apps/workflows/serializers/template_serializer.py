# backend/apps/workflows/serializers/template_serializer.py
"""模板序列化器。"""

from rest_framework import serializers

from apps.workflows.models import WorkflowTemplate, WorkflowNodeTemplate
from apps.workflows.constants import NodeVisualType


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
            "approver_type",
            "approver_role",
            "estimated_hours",
            "description",
            "visual_type",
        ]

    def get_visual_type(self, obj):
        """获取视觉类型。"""
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
    node_count = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = WorkflowTemplate
        fields = [
            "id",
            "name",
            "description",
            "scope",
            "is_builtin",
            "is_active",
            "node_count",
            "created_by_name",
            "created_at",
            "nodes",
        ]
        read_only_fields = ["scope", "is_builtin", "created_by", "created_at"]

    def get_node_count(self, obj):
        return obj.node_templates.count()

    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.real_name or obj.created_by.username
        return ""


class WorkflowTemplateDetailSerializer(WorkflowTemplateSerializer):
    """流程模板详情序列化器。"""

    node_templates = WorkflowNodeTemplateSerializer(many=True, read_only=True)

    class Meta:
        model = WorkflowTemplate
        fields = [
            "id",
            "name",
            "description",
            "scope",
            "is_builtin",
            "is_active",
            "node_count",
            "created_by_name",
            "created_at",
            "node_templates",
        ]


class WorkflowNodeTemplateCreateSerializer(serializers.ModelSerializer):
    """节点模板创建序列化器。"""

    class Meta:
        model = WorkflowNodeTemplate
        fields = [
            "name",
            "order",
            "default_assignee_type",
            "default_assignee_role",
            "requires_approval",
            "approver_type",
            "approver_role",
            "estimated_hours",
            "description",
        ]