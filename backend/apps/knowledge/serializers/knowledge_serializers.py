# backend/apps/knowledge/serializers/knowledge_serializers.py
"""知识库序列化器。"""

from rest_framework import serializers

from apps.knowledge.constants import KnowledgeBaseVisibility, RetrievalMode
from apps.knowledge.models import KnowledgeBase, KnowledgeDocument, KnowledgeChunk


class KnowledgeBaseSerializer(serializers.ModelSerializer):
    """知识库序列化器。"""

    kb_type_display = serializers.CharField(source="get_kb_type_display", read_only=True)
    visibility_display = serializers.CharField(source="get_visibility_display", read_only=True)
    created_by_name = serializers.CharField(source="created_by.username", read_only=True)

    class Meta:
        model = KnowledgeBase
        fields = [
            "id", "name", "description", "kb_type", "kb_type_display",
            "visibility", "visibility_display", "is_active",
            "document_count", "chunk_count",
            "created_at", "updated_at", "created_by", "created_by_name",
        ]
        read_only_fields = [
            "id", "created_at", "updated_at", "created_by",
            "document_count", "chunk_count",
        ]

    def validate_visibility(self, value):
        """P0 阶段仅允许 private / system。"""
        if value not in KnowledgeBaseVisibility.P0_ALLOWED:
            raise serializers.ValidationError(
                f"P0 阶段仅支持可见范围：{KnowledgeBaseVisibility.P0_ALLOWED}，当前值：{value}"
            )
        return value

    def validate(self, attrs):
        """kb_type / visibility 创建后不可改：更新请求中若出现这两个字段，必须与原值一致。"""
        if self.instance is not None:
            for field in ("kb_type", "visibility"):
                if field in attrs and attrs[field] != getattr(self.instance, field):
                    raise serializers.ValidationError(
                        {field: f"{field} 创建后不可修改，需重建知识库"}
                    )
        return attrs


class KnowledgeDocumentSerializer(serializers.ModelSerializer):
    """知识文档序列化器。"""

    status_display = serializers.CharField(source="get_status_display", read_only=True)
    parse_status_display = serializers.CharField(source="get_parse_status_display", read_only=True)
    chunk_status_display = serializers.CharField(source="get_chunk_status_display", read_only=True)
    embedding_status_display = serializers.CharField(source="get_embedding_status_display", read_only=True)
    index_status_display = serializers.CharField(source="get_index_status_display", read_only=True)
    knowledge_base_name = serializers.CharField(source="knowledge_base.name", read_only=True)
    created_by_name = serializers.CharField(source="created_by.username", read_only=True)

    class Meta:
        model = KnowledgeDocument
        fields = [
            "id", "knowledge_base", "knowledge_base_name",
            "file_name", "file_size", "mime_type",
            "status", "status_display",
            "parse_status", "parse_status_display",
            "chunk_status", "chunk_status_display",
            "embedding_status", "embedding_status_display",
            "index_status", "index_status_display",
            "chunk_count", "error_message",
            "created_at", "updated_at", "created_by", "created_by_name",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "created_by"]


class KnowledgeChunkSerializer(serializers.ModelSerializer):
    """知识分块序列化器。"""

    document_title = serializers.CharField(source="document.file_name", read_only=True)
    chunk_type_display = serializers.CharField(source="get_chunk_type_display", read_only=True)

    class Meta:
        model = KnowledgeChunk
        fields = [
            "id", "document", "document_title",
            "chunk_index", "title", "section_path",
            "content", "chunk_type", "chunk_type_display",
            "page_start", "page_end", "token_count",
            "created_at", "updated_at",
        ]


class DocumentInitUploadSerializer(serializers.Serializer):
    """文档初始化上传请求。"""

    file_name = serializers.CharField(max_length=255)
    file_size = serializers.IntegerField(min_value=1)
    file_hash = serializers.CharField(max_length=64)
    mime_type = serializers.CharField(max_length=128, required=False, default="application/octet-stream")


class RetrievalTestSerializer(serializers.Serializer):
    """检索测试请求。"""

    query = serializers.CharField(max_length=1000)
    knowledge_base_ids = serializers.ListField(
        child=serializers.IntegerField(),
        allow_empty=False,
    )
    top_k = serializers.IntegerField(min_value=1, max_value=50, default=10)
    filters = serializers.DictField(required=False, allow_null=True)
    retrieval_mode = serializers.ChoiceField(
        choices=RetrievalMode.CHOICES,
        default=RetrievalMode.HYBRID,
        required=False,
    )

    def validate_knowledge_base_ids(self, value):
        """校验知识库是否存在且可用。"""
        existing_count = KnowledgeBase.objects.filter(
            id__in=value,
            is_deleted=False,
            is_active=True,
        ).count()
        if existing_count != len(set(value)):
            raise serializers.ValidationError("存在不可用或不存在的知识库")
        return value