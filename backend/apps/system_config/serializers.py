"""系统配置序列化器。"""

from rest_framework import serializers

from apps.system_config.models import SystemSetting, StorageConfig, EmbeddingConfig, RagSettings


class SystemSettingSerializer(serializers.ModelSerializer):
    """系统设置序列化器。"""

    class Meta:
        model = SystemSetting
        fields = [
            # RAG 设置
            "retrieval_mode",
            "top_k",
            "max_context_tokens",
            "enable_vector_search",
            "enable_rerank",
            "embedding_model_config_id",
            "rerank_model_config_id",
            "chat_model_config_id",
            # 上传策略
            "upload_mode",
            "max_upload_size_mb",
            # 安全与审计
            "enable_audit_log",
            "enable_prompt_log",
            "enable_rag_log",
            "mask_secrets",
            "login_fail_lock_count",
        ]


class StorageConfigCreateSerializer(serializers.Serializer):
    """创建存储配置序列化器。"""

    name = serializers.CharField(max_length=128)
    is_default = serializers.BooleanField(default=False)
    provider = serializers.ChoiceField(choices=["minio", "s3", "oss"], default="minio")
    endpoint = serializers.CharField(max_length=256)
    public_endpoint = serializers.CharField(max_length=256, required=False, allow_blank=True)
    access_key = serializers.CharField(max_length=256)
    secret_key = serializers.CharField(max_length=256)
    bucket = serializers.CharField(max_length=128)
    region = serializers.CharField(max_length=64, required=False, allow_blank=True, default="")
    secure = serializers.BooleanField(default=False)
    proxy_enabled = serializers.BooleanField(default=False)
    presign_expire_seconds = serializers.IntegerField(default=3600)
    max_upload_size_mb = serializers.IntegerField(default=100)


class StorageConfigUpdateSerializer(serializers.Serializer):
    """更新存储配置序列化器（密钥可选）。"""

    name = serializers.CharField(max_length=128, required=False)
    is_default = serializers.BooleanField(required=False)
    provider = serializers.ChoiceField(choices=["minio", "s3", "oss"], required=False)
    endpoint = serializers.CharField(max_length=256, required=False)
    public_endpoint = serializers.CharField(max_length=256, required=False, allow_blank=True)
    access_key = serializers.CharField(max_length=256, required=False, allow_blank=True)
    secret_key = serializers.CharField(max_length=256, required=False, allow_blank=True)
    bucket = serializers.CharField(max_length=128, required=False)
    region = serializers.CharField(max_length=64, required=False, allow_blank=True)
    secure = serializers.BooleanField(required=False)
    proxy_enabled = serializers.BooleanField(required=False)
    presign_expire_seconds = serializers.IntegerField(required=False)


class CorsConfigSerializer(serializers.Serializer):
    """CORS 配置序列化器。"""

    allowed_origins = serializers.ListField(child=serializers.CharField())
    allowed_methods = serializers.ListField(child=serializers.CharField())
    allowed_headers = serializers.ListField(child=serializers.CharField())
    expose_headers = serializers.ListField(child=serializers.CharField())
    max_age_seconds = serializers.IntegerField(default=3600)


class EmbeddingConfigSerializer(serializers.ModelSerializer):
    """Embedding 配置序列化器。"""

    has_api_key = serializers.BooleanField(read_only=True)
    api_key_masked = serializers.CharField(read_only=True)

    class Meta:
        model = EmbeddingConfig
        fields = [
            "id",
            "name",
            "provider",
            "api_mode",
            "model_name",
            "dimension",
            "base_url",
            "batch_size",
            "max_tokens_per_text",
            "timeout_seconds",
            "is_active",
            "is_default",
            "has_api_key",
            "api_key_masked",
            "metadata",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class EmbeddingConfigCreateSerializer(serializers.Serializer):
    """创建 Embedding 配置序列化器。"""

    name = serializers.CharField(max_length=128)
    provider = serializers.ChoiceField(choices=["bailian", "openai"], default="bailian")
    api_mode = serializers.ChoiceField(choices=["openai_compatible", "dashscope_native"], default="openai_compatible")
    model_name = serializers.CharField(max_length=100, default="text-embedding-v4")
    dimension = serializers.IntegerField(default=1024)
    base_url = serializers.CharField(max_length=256, required=False, allow_blank=True)
    api_key = serializers.CharField(max_length=512)
    api_key_env = serializers.CharField(max_length=64, required=False, allow_blank=True, default="")
    batch_size = serializers.IntegerField(default=10)
    max_tokens_per_text = serializers.IntegerField(default=8192)
    timeout_seconds = serializers.IntegerField(default=60)
    is_active = serializers.BooleanField(default=True)
    is_default = serializers.BooleanField(default=False)
    metadata = serializers.DictField(required=False, default=dict)


class EmbeddingConfigUpdateSerializer(serializers.Serializer):
    """更新 Embedding 配置序列化器（API Key 可选）。"""

    name = serializers.CharField(max_length=128, required=False)
    provider = serializers.ChoiceField(choices=["bailian", "openai"], required=False)
    api_mode = serializers.ChoiceField(choices=["openai_compatible", "dashscope_native"], required=False)
    model_name = serializers.CharField(max_length=100, required=False)
    dimension = serializers.IntegerField(required=False)
    base_url = serializers.CharField(max_length=256, required=False, allow_blank=True)
    api_key = serializers.CharField(max_length=512, required=False, allow_blank=True)
    api_key_env = serializers.CharField(max_length=64, required=False, allow_blank=True)
    batch_size = serializers.IntegerField(required=False)
    max_tokens_per_text = serializers.IntegerField(required=False)
    timeout_seconds = serializers.IntegerField(required=False)
    is_active = serializers.BooleanField(required=False)
    is_default = serializers.BooleanField(required=False)
    metadata = serializers.DictField(required=False)


class EmbeddingTestSerializer(serializers.Serializer):
    """测试 Embedding 序列化器。"""

    texts = serializers.ListField(
        child=serializers.CharField(),
        min_length=1,
        max_length=10,
        help_text="测试文本列表（最多 10 条）",
    )


class RagSettingsSerializer(serializers.ModelSerializer):
    """RAG 设置序列化器。"""

    class Meta:
        model = RagSettings
        fields = [
            "retrieval_mode",
            "embedding_config",
            "top_k",
            "max_context_tokens",
            "enable_vector_search",
            "enable_rerank",
        ]