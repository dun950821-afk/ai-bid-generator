# backend/apps/generation/serializers/playground_serializer.py
"""Prompt Playground 序列化器。"""

import json

from rest_framework import serializers

from apps.generation.models import PromptRun, PromptVersion, ModelConfig


class RagOptionsSerializer(serializers.Serializer):
    """RAG 选项序列化器。"""

    enabled = serializers.BooleanField(default=False)
    knowledge_base_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        allow_empty=True,
    )
    query = serializers.CharField(required=False, allow_blank=True)
    top_k = serializers.IntegerField(default=5, min_value=1, max_value=20)
    max_context_tokens = serializers.IntegerField(default=4000, min_value=500, max_value=16000)
    filters = serializers.DictField(required=False, default=dict)


class PlaygroundRenderRequestSerializer(serializers.Serializer):
    """渲染请求序列化器。"""

    prompt_version_id = serializers.IntegerField()
    variables = serializers.DictField(default=dict)
    rag_options = RagOptionsSerializer(required=False)

    def validate_variables(self, value):
        """校验变量必须是 dict。"""
        if not isinstance(value, dict):
            raise serializers.ValidationError("变量必须是 JSON 对象")
        return value


class PlaygroundRenderResponseSerializer(serializers.Serializer):
    """渲染响应序列化器。"""

    system_prompt = serializers.CharField()
    user_prompt = serializers.CharField()
    missing_variables = serializers.ListField(child=serializers.CharField())
    token_estimate = serializers.IntegerField()
    rag = serializers.DictField()


class PlaygroundRunRequestSerializer(serializers.Serializer):
    """运行请求序列化器。"""

    prompt_version_id = serializers.IntegerField()
    model_config_id = serializers.IntegerField(required=False, allow_null=True)
    variables = serializers.DictField(default=dict)
    rag_options = RagOptionsSerializer(required=False)

    def validate_variables(self, value):
        """校验变量必须是 dict。"""
        if not isinstance(value, dict):
            raise serializers.ValidationError("变量必须是 JSON 对象")
        return value

    def validate_prompt_version_id(self, value):
        """校验版本存在。"""
        try:
            PromptVersion.objects.get(pk=value)
        except PromptVersion.DoesNotExist:
            raise serializers.ValidationError("提示词版本不存在")
        return value


class RenderedPromptSerializer(serializers.Serializer):
    """渲染后的提示词。"""

    system_prompt = serializers.CharField()
    user_prompt = serializers.CharField()


class OutputResultSerializer(serializers.Serializer):
    """输出结果。"""

    raw_text = serializers.CharField()
    parsed_json = serializers.DictField()
    schema_valid = serializers.BooleanField()
    schema_errors = serializers.ListField(child=serializers.CharField())


class UsageInfoSerializer(serializers.Serializer):
    """Token 使用信息。"""

    prompt_tokens = serializers.IntegerField()
    completion_tokens = serializers.IntegerField()
    total_tokens = serializers.IntegerField()
    latency_ms = serializers.IntegerField()


class RagResultSerializer(serializers.Serializer):
    """RAG 结果。"""

    enabled = serializers.BooleanField()
    retrieval_log_id = serializers.IntegerField(allow_null=True)
    sources = serializers.ListField(child=serializers.DictField())


class PlaygroundRunResponseSerializer(serializers.Serializer):
    """运行响应序列化器。"""

    run_id = serializers.IntegerField()
    status = serializers.CharField()
    rendered_prompt = RenderedPromptSerializer()
    output = OutputResultSerializer()
    usage = UsageInfoSerializer()
    rag = RagResultSerializer()
    error_message = serializers.CharField(allow_blank=True)


class PromptRunListSerializer(serializers.ModelSerializer):
    """运行记录列表序列化器。"""

    template_name = serializers.CharField(source="prompt_template.name", read_only=True)
    version_number = serializers.CharField(source="prompt_version.version", read_only=True)
    model_name = serializers.CharField(source="model_config.display_name", read_only=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = PromptRun
        fields = [
            "id",
            "template_name",
            "version_number",
            "model_name",
            "scenario",
            "status",
            "prompt_tokens",
            "completion_tokens",
            "total_tokens",
            "latency_ms",
            "created_at",
            "created_by_name",
        ]

    def get_created_by_name(self, obj):
        return obj.created_by.username if obj.created_by else None


class PromptRunDetailSerializer(serializers.ModelSerializer):
    """运行记录详情序列化器。"""

    template_name = serializers.CharField(source="prompt_template.name", read_only=True)
    template_key = serializers.CharField(source="prompt_template.key", read_only=True)
    version_number = serializers.CharField(source="prompt_version.version", read_only=True)
    model_name = serializers.CharField(source="model_config.display_name", read_only=True)
    model_provider = serializers.CharField(source="model_config.provider.name", read_only=True)
    created_by_name = serializers.SerializerMethodField()
    schema_valid = serializers.SerializerMethodField()
    schema_errors = serializers.SerializerMethodField()
    rag_info = serializers.SerializerMethodField()

    class Meta:
        model = PromptRun
        fields = [
            "id",
            "template_name",
            "template_key",
            "version_number",
            "model_name",
            "model_provider",
            "scenario",
            "input_variables",
            "rendered_system_prompt",
            "rendered_user_prompt",
            "output_text",
            "output_json",
            "status",
            "error_message",
            "prompt_tokens",
            "completion_tokens",
            "total_tokens",
            "latency_ms",
            "schema_valid",
            "schema_errors",
            "rag_info",
            "created_at",
            "created_by_name",
        ]

    def get_created_by_name(self, obj):
        return obj.created_by.username if obj.created_by else None

    def get_schema_valid(self, obj):
        metadata = obj.metadata or {}
        return metadata.get("schema_valid", True)

    def get_schema_errors(self, obj):
        metadata = obj.metadata or {}
        return metadata.get("schema_errors", [])

    def get_rag_info(self, obj):
        metadata = obj.metadata or {}
        if not metadata.get("rag_enabled"):
            return {"enabled": False}
        return {
            "enabled": True,
            "retrieval_log_id": metadata.get("retrieval_log_id"),
            "sources": metadata.get("retrieval_sources", []),
            "context_preview": metadata.get("rag_context_preview", ""),
        }
