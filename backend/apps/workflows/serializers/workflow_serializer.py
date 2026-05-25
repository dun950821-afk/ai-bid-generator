# backend/apps/workflows/serializers/workflow_serializer.py
"""工作流序列化器。"""

from rest_framework import serializers

from apps.workflows.models import (
    LotWorkflow,
    WorkflowNodeInstance,
    WorkflowAuditLog,
)
from apps.workflows.constants import NodeVisualType


class WorkflowNodeInstanceSerializer(serializers.ModelSerializer):
    """节点实例序列化器。"""

    visual_type = serializers.SerializerMethodField()
    progress = serializers.SerializerMethodField()

    class Meta:
        model = WorkflowNodeInstance
        fields = [
            "id",
            "name",
            "order",
            "status",
            "visual_type",
            "progress",
            "assignee_type",
            "assignee_role",
            "requires_approval",
            "approval_status",
            "started_at",
            "completed_at",
            "failed_at",
            "failure_reason",
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

    def get_progress(self, obj):
        """获取进度百分比。"""
        if obj.status == "completed":
            return 100
        if obj.status == "pending":
            return 0
        # TODO: 从节点 metrics 获取实际进度
        return 50


class LotWorkflowSerializer(serializers.ModelSerializer):
    """工作流实例序列化器。"""

    nodes = WorkflowNodeInstanceSerializer(
        source="nodes.all",
        many=True,
        read_only=True,
    )
    progress_percentage = serializers.ReadOnlyField()

    class Meta:
        model = LotWorkflow
        fields = [
            "id",
            "lot",
            "workflow_template",
            "status",
            "progress_percentage",
            "started_at",
            "completed_at",
            "nodes",
        ]


class WorkflowNodeStatusSerializer(serializers.Serializer):
    """节点状态（轻量）。"""

    id = serializers.IntegerField()
    status = serializers.CharField()
    progress = serializers.IntegerField()
    updated_at = serializers.DateTimeField()


class WorkflowStatusSerializer(serializers.Serializer):
    """工作流状态（轻量轮询）。"""

    instance_id = serializers.IntegerField()
    revision = serializers.IntegerField()
    status = serializers.CharField()
    progress = serializers.IntegerField()
    current_node_id = serializers.IntegerField(allow_null=True)
    updated_at = serializers.DateTimeField()
    nodes = WorkflowNodeStatusSerializer(many=True)


class WorkflowAuditLogSerializer(serializers.ModelSerializer):
    """审计日志序列化器。"""

    operator_name = serializers.SerializerMethodField()

    class Meta:
        model = WorkflowAuditLog
        fields = [
            "id",
            "action",
            "previous_status",
            "new_status",
            "operator_name",
            "reason",
            "error_message",
            "created_at",
        ]

    def get_operator_name(self, obj):
        """获取操作人名称。"""
        if obj.operator:
            return obj.operator.username
        return None
