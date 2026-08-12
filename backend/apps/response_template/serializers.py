# -*- coding: utf-8 -*-
"""响应模板 API 序列化器。"""

from rest_framework import serializers

from apps.response_template.constants import BlockType, TemplateStatus
from apps.response_template.models import (
    TenderResponseDocument,
    TenderResponseTemplate,
    TenderTemplateBlock,
)


class TenderTemplateBlockSerializer(serializers.ModelSerializer):
    """块序列化器(支持局部更新类型/绑定/确认)。"""

    type_display = serializers.CharField(source="get_block_type_display", read_only=True)
    fill_status_display = serializers.CharField(source="get_fill_status_display", read_only=True)
    confirm_status_display = serializers.CharField(source="get_confirm_status_display", read_only=True)

    class Meta:
        model = TenderTemplateBlock
        fields = [
            "id", "block_key", "title", "block_type", "type_display", "order",
            "is_separate_package", "anchor_text", "anchor_type", "confidence",
            "source_config", "binding_config", "ai_result",
            "confirm_status", "confirm_status_display",
            "fill_status", "fill_status_display", "fill_payload",
            "parent", "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "block_key", "order", "is_separate_package", "anchor_text",
            "anchor_type", "confidence", "ai_result", "fill_status",
            "fill_payload", "parent", "created_at", "updated_at",
        ]

    def validate_block_type(self, value):
        if value not in dict(BlockType.CHOICES):
            raise serializers.ValidationError(f"未知块类型: {value}")
        return value


class TenderResponseDocumentSerializer(serializers.ModelSerializer):
    """产物序列化器(含下载 URL)。"""

    url = serializers.SerializerMethodField()

    class Meta:
        model = TenderResponseDocument
        fields = [
            "id", "title", "kind", "status", "object_key",
            "file_name", "file_size", "error_message", "url", "created_at",
        ]
        read_only_fields = fields

    def get_url(self, obj) -> str:
        if not obj.object_key:
            return ""
        from apps.common.services.storage import StorageService

        try:
            return StorageService().presigned_get_object(obj.object_key)
        except Exception:
            return ""


class TenderResponseTemplateSerializer(serializers.ModelSerializer):
    """响应模板序列化器。"""

    blocks = TenderTemplateBlockSerializer(many=True, read_only=True)
    documents = TenderResponseDocumentSerializer(many=True, read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    source_file_name = serializers.CharField(source="source_file.original_name", read_only=True)

    class Meta:
        model = TenderResponseTemplate
        fields = [
            "id", "project", "lot", "source_file", "source_file_name",
            "parsed_document", "outline", "name", "source_section",
            "status", "status_display", "confidence", "schema_json",
            "summary_json", "error_message", "blocks", "documents",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "status", "status_display", "confidence", "schema_json",
            "summary_json", "error_message", "blocks", "documents",
            "created_at", "updated_at",
        ]
