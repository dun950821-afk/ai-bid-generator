# backend/apps/generation/serializers/model_serializer.py
"""模型供应商和配置序列化器。"""

from rest_framework import serializers

from apps.generation.constants import ProviderType
from apps.generation.models import ModelProvider, ModelConfig


class ModelProviderSerializer(serializers.ModelSerializer):
    """模型供应商序列化器。"""

    has_api_key = serializers.SerializerMethodField()
    api_key_masked = serializers.SerializerMethodField()

    class Meta:
        model = ModelProvider
        fields = [
            "id",
            "key",
            "name",
            "provider_type",
            "base_url",
            "api_key_env",
            "is_active",
            "has_api_key",
            "api_key_masked",
            "config_defaults",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_has_api_key(self, obj) -> bool:
        return bool(obj.encrypted_api_key)

    def get_api_key_masked(self, obj) -> str:
        from apps.system_config.models import mask_value
        if obj.encrypted_api_key:
            return mask_value(obj.get_api_key())
        return ""


class ModelProviderCreateSerializer(serializers.Serializer):
    """创建模型供应商序列化器。"""

    key = serializers.CharField(max_length=64)
    name = serializers.CharField(max_length=100)
    provider_type = serializers.CharField(max_length=64)
    base_url = serializers.CharField(max_length=255, required=False, allow_blank=True)
    api_key = serializers.CharField(max_length=512, required=False, allow_blank=True)
    api_key_env = serializers.CharField(max_length=64, required=False, allow_blank=True)
    is_active = serializers.BooleanField(default=True)


class ModelProviderUpdateSerializer(serializers.ModelSerializer):
    """更新模型供应商。

    允许编辑 provider_type，但切换前需清空其下 ModelConfig。
    """

    provider_type = serializers.ChoiceField(
        choices=ProviderType.CHOICES,
        required=False,
    )
    api_key = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = ModelProvider
        fields = [
            "name",
            "provider_type",
            "base_url",
            "api_key_env",
            "api_key",
            "is_active",
        ]

    def validate(self, attrs):
        """切换 provider_type 前需清空其下 ModelConfig。"""
        if self.instance and "provider_type" in attrs:
            new_type = attrs["provider_type"]
            if new_type != self.instance.provider_type:
                if self.instance.models.exists():
                    raise serializers.ValidationError(
                        {
                            "provider_type": "请先删除该 Provider 下所有 ModelConfig，再切换 provider_type"
                        }
                    )
        return attrs


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
            "top_p",
            "timeout_seconds",
            "retry_count",
            "is_default",
            "is_active",
            "enable_thinking",
            "reasoning_effort",
            "context_length",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class ModelConfigCreateSerializer(serializers.Serializer):
    """创建模型配置序列化器。"""

    provider = serializers.PrimaryKeyRelatedField(queryset=ModelProvider.objects.all())
    model_name = serializers.CharField(max_length=100)
    model_type = serializers.ChoiceField(choices=["chat", "embedding", "rerank"], default="chat")
    display_name = serializers.CharField(max_length=100, required=False, allow_blank=True)
    temperature = serializers.FloatField(default=0.2)
    max_tokens = serializers.IntegerField(default=4096)
    top_p = serializers.FloatField(default=0.8)
    timeout_seconds = serializers.IntegerField(default=60)
    retry_count = serializers.IntegerField(default=2)
    is_default = serializers.BooleanField(default=False)
    is_active = serializers.BooleanField(default=True)
    enable_thinking = serializers.BooleanField(default=False)
    reasoning_effort = serializers.CharField(max_length=16, required=False, allow_blank=True)
    context_length = serializers.IntegerField(required=False, allow_null=True)


class ModelConfigUpdateSerializer(serializers.Serializer):
    """更新模型配置序列化器。"""

    provider = serializers.PrimaryKeyRelatedField(
        queryset=ModelProvider.objects.all(),
        required=False
    )
    model_name = serializers.CharField(max_length=100, required=False)
    model_type = serializers.ChoiceField(choices=["chat", "embedding", "rerank"], required=False)
    display_name = serializers.CharField(max_length=100, required=False, allow_blank=True)
    temperature = serializers.FloatField(required=False)
    max_tokens = serializers.IntegerField(required=False)
    top_p = serializers.FloatField(required=False)
    timeout_seconds = serializers.IntegerField(required=False)
    retry_count = serializers.IntegerField(required=False)
    is_default = serializers.BooleanField(required=False)
    is_active = serializers.BooleanField(required=False)
    enable_thinking = serializers.BooleanField(required=False)
    reasoning_effort = serializers.CharField(max_length=16, required=False, allow_blank=True)
    context_length = serializers.IntegerField(required=False, allow_null=True)