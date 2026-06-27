# backend/apps/outline/outline_kb_serializer.py
"""大纲-知识库绑定序列化器。"""

from rest_framework import serializers

from apps.outline.models import OutlineKnowledgeBase


class OutlineKnowledgeBaseSerializer(serializers.ModelSerializer):
    """大纲-知识库绑定序列化器。"""

    kb_name = serializers.CharField(source="knowledge_base.name", read_only=True)
    kb_type = serializers.CharField(source="knowledge_base.kb_type", read_only=True)
    rag_channel = serializers.CharField(source="knowledge_base.rag_channel", read_only=True)
    document_count = serializers.IntegerField(
        source="knowledge_base.document_count", read_only=True
    )

    class Meta:
        model = OutlineKnowledgeBase
        fields = [
            "id", "outline", "knowledge_base", "kb_name", "kb_type",
            "rag_channel", "document_count", "sort_order", "is_active",
            "created_at",
        ]
        read_only_fields = ["outline", "created_at"]


class OutlineKbBindingSerializer(serializers.Serializer):
    """批量绑定请求序列化器。"""

    kb_ids = serializers.ListField(
        child=serializers.IntegerField(), min_length=1, max_length=50
    )
