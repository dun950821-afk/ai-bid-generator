"""操作审计序列化器。"""

from rest_framework import serializers

from apps.audit.models import OperationLog


class OperationLogSerializer(serializers.ModelSerializer):
    """操作日志列表序列化器。"""

    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = OperationLog
        fields = [
            "id",
            "actor_id",
            "actor_name",
            "action",
            "target_type",
            "target_id",
            "summary",
            "ip",
            "created_at",
        ]

    def get_actor_name(self, obj):
        if obj.actor:
            return obj.actor.real_name or obj.actor.username
        return None


class OperationLogDetailSerializer(serializers.ModelSerializer):
    """操作日志详情序列化器。"""

    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = OperationLog
        fields = [
            "id",
            "actor_id",
            "actor_name",
            "action",
            "target_type",
            "target_id",
            "summary",
            "extra",
            "ip",
            "user_agent",
            "created_at",
        ]

    def get_actor_name(self, obj):
        if obj.actor:
            return obj.actor.real_name or obj.actor.username
        return None
