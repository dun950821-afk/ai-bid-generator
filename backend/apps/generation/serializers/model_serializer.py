# backend/apps/generation/serializers/model_serializer.py
"""模型供应商和配置序列化器。"""

from rest_framework import serializers

from apps.generation.models import ModelProvider, ModelConfig


class ModelProviderSerializer(serializers.ModelSerializer):
    """模型供应商序列化器。"""

    class Meta:
        model = ModelProvider
        fields = ["id", "key", "name", "provider_type", "base_url", "is_active"]
        read_only_fields = ["id"]


class ModelConfigSerializer(serializers.ModelSerializer):
    """模型配置序列化器。"""

    provider_name = serializers.CharField(source="provider.name", read_only=True)

    class Meta:
        model = ModelConfig
        fields = [
            "id",
            "provider",
            "provider_name",
            "model_name",
            "model_type",
            "display_name",
            "temperature",
            "max_tokens",
            "is_default",
            "is_active",
        ]
        read_only_fields = ["id"]
