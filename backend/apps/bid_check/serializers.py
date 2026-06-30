# backend/apps/bid_check/serializers.py
"""废标检查序列化器。"""

from rest_framework import serializers

from apps.bid_check.models import BidCheckFinding, BidCheckTask


class BidCheckFindingSerializer(serializers.ModelSerializer):
    """发现项序列化器。"""

    type_display = serializers.CharField(source="get_type_display", read_only=True)
    severity_display = serializers.CharField(source="get_severity_display", read_only=True)

    class Meta:
        model = BidCheckFinding
        fields = [
            "id",
            "task",
            "type",
            "type_display",
            "severity",
            "severity_display",
            "title",
            "summary",
            "requirement",
            "bid_evidence",
            "risk_reason",
            "suggestion",
            "resolved",
            "resolved_at",
            "created_at",
        ]
        read_only_fields = ["id", "task", "created_at", "resolved_at"]


class BidCheckTaskSerializer(serializers.ModelSerializer):
    """废标检查任务序列化器。"""

    status_display = serializers.CharField(source="get_status_display", read_only=True)
    findings_count = serializers.SerializerMethodField()

    class Meta:
        model = BidCheckTask
        fields = [
            "id",
            "outline",
            "bid_document",
            "status",
            "status_display",
            "custom_check_items",
            "findings_summary",
            "findings_count",
            "error_message",
            "created_at",
            "updated_at",
            "finished_at",
        ]
        read_only_fields = [
            "id", "status", "findings_summary", "error_message",
            "created_at", "updated_at", "finished_at",
        ]

    def get_findings_count(self, obj) -> int:
        return obj.findings.count()


class BidCheckTaskCreateSerializer(serializers.Serializer):
    """启动废标检查入参。"""

    outline = serializers.IntegerField()
    bid_document = serializers.IntegerField()
    custom_check_items = serializers.CharField(required=False, allow_blank=True)
