"""通知序列化器。"""

from rest_framework import serializers

from apps.notifications.models import Announcement, Notification


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


class AnnouncementUserSerializer(serializers.ModelSerializer):
    """用户端公告（登录弹窗用）。"""

    class Meta:
        model = Announcement
        fields = ["id", "title", "content", "published_at", "updated_at"]


class AnnouncementManageSerializer(serializers.ModelSerializer):
    """管理端公告（含统计）。"""

    created_by_name = serializers.CharField(source="created_by.real_name", read_only=True, default="")
    ack_count = serializers.IntegerField(read_only=True)
    dismiss_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Announcement
        fields = [
            "id",
            "title",
            "content",
            "is_active",
            "auto_offline_at",
            "created_by",
            "created_by_name",
            "published_at",
            "offline_at",
            "created_at",
            "updated_at",
            "ack_count",
            "dismiss_count",
        ]
        read_only_fields = ["id", "created_by", "published_at", "offline_at", "created_at", "updated_at"]
