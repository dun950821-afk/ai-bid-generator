# backend/apps/generation/serializers/prompt_serializer.py
"""提示词序列化器。"""

import jsonschema

from rest_framework import serializers
from rest_framework.exceptions import ValidationError

from apps.generation.models import PromptTemplate, PromptVersion
from apps.generation.constants import PromptVersionStatus


def _validate_json_schema(value, field_name):
    """公共 JSON Schema 校验方法。"""
    if value:
        try:
            jsonschema.Draft7Validator.check_schema(value)
        except jsonschema.exceptions.SchemaError as e:
            raise ValidationError(f"{field_name} 不是合法的 JSON Schema: {e}")
    return value


class PromptVersionSerializer(serializers.ModelSerializer):
    """提示词版本序列化器。"""

    status_display = serializers.CharField(source="get_status_display", read_only=True)
    created_by_name = serializers.SerializerMethodField()
    template_scenario = serializers.CharField(source="template.scenario", read_only=True)
    template_name = serializers.CharField(source="template.name", read_only=True)

    class Meta:
        model = PromptVersion
        fields = [
            "id", "version", "status", "status_display",
            "system_prompt", "user_prompt",
            "output_schema", "variable_schema",
            "changelog", "created_by_name", "created_at",
            "template_scenario", "template_name",
        ]
        read_only_fields = ["status", "created_by", "created_at"]

    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.real_name or obj.created_by.username
        return ""

    def validate_output_schema(self, value):
        """校验 output_schema 是否为合法 JSON Schema。"""
        return _validate_json_schema(value, "output_schema")

    def validate_variable_schema(self, value):
        """校验 variable_schema 是否为合法 JSON Schema。"""
        return _validate_json_schema(value, "variable_schema")


class PromptVersionCreateSerializer(serializers.ModelSerializer):
    """创建新版本的序列化器。"""

    class Meta:
        model = PromptVersion
        fields = [
            "version", "system_prompt", "user_prompt",
            "output_schema", "variable_schema", "changelog",
        ]

    def validate_output_schema(self, value):
        """校验 output_schema 是否为合法 JSON Schema。"""
        return _validate_json_schema(value, "output_schema")

    def validate_variable_schema(self, value):
        """校验 variable_schema 是否为合法 JSON Schema。"""
        return _validate_json_schema(value, "variable_schema")


class PromptTemplateSerializer(serializers.ModelSerializer):
    """提示词模板列表序列化器。"""

    scenario_display = serializers.CharField(source="get_scenario_display", read_only=True)
    scope_display = serializers.CharField(source="get_scope_display", read_only=True)
    published_version = serializers.SerializerMethodField()
    version_count = serializers.SerializerMethodField()

    class Meta:
        model = PromptTemplate
        fields = [
            "id", "key", "name", "scenario", "scenario_display",
            "description", "scope", "scope_display",
            "is_active", "published_version", "version_count",
            "created_at", "updated_at",
        ]
        read_only_fields = ["scope", "created_at", "updated_at"]

    def get_published_version(self, obj):
        published = obj.versions.filter(status=PromptVersionStatus.PUBLISHED).first()
        if published:
            return PromptVersionSerializer(published).data
        return None

    def get_version_count(self, obj):
        return obj.versions.count()


class PromptTemplateDetailSerializer(PromptTemplateSerializer):
    """提示词模板详情序列化器。"""

    versions = PromptVersionSerializer(many=True, read_only=True)

    class Meta(PromptTemplateSerializer.Meta):
        fields = PromptTemplateSerializer.Meta.fields + ["versions"]
