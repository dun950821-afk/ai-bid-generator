"""通知序列化器。"""

from rest_framework import serializers

from apps.notifications.models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = [
            "id",
            "kind",
            "title",
            "message",
            "task_type",
            "related_object_type",
            "related_object_id",
            "is_read",
            "created_at",
        ]
