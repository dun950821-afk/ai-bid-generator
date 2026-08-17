"""系统配置模型。"""

import json
from cryptography.fernet import Fernet, MultiFernet
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.db import models
from django.utils.timezone import now

from apps.common.models import TimeStampedModel


def get_fernet_key():
    """获取 Fernet 加密密钥。

    生产环境必须显式配置 SECRET_KEY_ENCRYPTION（Fernet.format key，
    `Fernet.generate_key()` 产出）。

    不再回退到 SECRET_KEY 派生——SECRET_KEY 长度不足会零填充导致熵不足，
    所有 ModelProvider 的 API Key 等于明文。
    """
    key = getattr(settings, "SECRET_KEY_ENCRYPTION", None)
    if not key:
        raise ImproperlyConfigured(
            "SECRET_KEY_ENCRYPTION 未配置。请运行 "
            "python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
            " 生成 Fernet 密钥后写入 .env 的 SECRET_KEY_ENCRYPTION。"
        )
    return key


def _get_decrypt_fernet():
    """解密用 Fernet：配置了上一代密钥时用 MultiFernet 兼容旧密文。

    轮换流程：新密钥写入 SECRET_KEY_ENCRYPTION，旧密钥临时放到
    SECRET_KEY_ENCRYPTION_PREVIOUS；存量密文重加密完成后移除 PREVIOUS。
    """
    fernets = [Fernet(get_fernet_key())]
    previous = getattr(settings, "SECRET_KEY_ENCRYPTION_PREVIOUS", None)
    if previous:
        fernets.append(Fernet(previous))
    return MultiFernet(fernets) if len(fernets) > 1 else fernets[0]


def encrypt_value(value: str) -> str:
    """加密敏感值（始终使用当前密钥）。"""
    if not value:
        return ""
    f = Fernet(get_fernet_key())
    return f.encrypt(value.encode()).decode()


def decrypt_value(value: str) -> str:
    """解密敏感值（兼容上一代密钥加密的存量密文）。"""
    if not value:
        return ""
    try:
        return _get_decrypt_fernet().decrypt(value.encode()).decode()
    except Exception:
        return ""


def mask_value(value: str, show_last: int = 4) -> str:
    """遮蔽敏感值，只显示最后几位。"""
    if not value:
        return ""
    if len(value) <= show_last:
        return "****"
    return "****" + value[-show_last:]


class SystemSetting(TimeStampedModel):
    """系统全局设置（单例模式）。"""

    SETTING_KEY = "default"

    key = models.CharField(max_length=64, unique=True, default=SETTING_KEY)

    # RAG 默认参数
    retrieval_mode = models.CharField(
        max_length=32,
        default="hybrid",
        choices=[("keyword", "关键词检索"), ("semantic", "语义检索"), ("hybrid", "混合检索")],
    )
    top_k = models.IntegerField(default=10, help_text="检索返回数量")
    max_context_tokens = models.IntegerField(default=4000, help_text="上下文最大 Token 数")
    enable_vector_search = models.BooleanField(default=True)
    enable_rerank = models.BooleanField(default=False)

    # 关联模型配置（通过 ID）
    embedding_model_config_id = models.IntegerField(null=True, blank=True)
    rerank_model_config_id = models.IntegerField(null=True, blank=True)
    chat_model_config_id = models.IntegerField(null=True, blank=True)

    # 上传策略
    upload_mode = models.CharField(
        max_length=32,
        default="backend_proxy",
        choices=[
            ("backend_proxy", "后端代理上传（推荐）"),
            ("presigned_direct", "MinIO 直传（高级）"),
        ],
        help_text="文件上传模式",
    )
    max_upload_size_mb = models.IntegerField(default=100, help_text="最大上传文件大小 MB")

    # 安全与审计
    enable_audit_log = models.BooleanField(default=True, help_text="是否记录操作审计")
    enable_prompt_log = models.BooleanField(default=False, help_text="是否记录 Prompt 输入输出")
    enable_rag_log = models.BooleanField(default=False, help_text="是否记录 RAG 检索日志")
    mask_secrets = models.BooleanField(default=True, help_text="是否脱敏显示密钥")
    login_fail_lock_count = models.IntegerField(default=5, help_text="登录失败锁定次数")

    class Meta:
        db_table = "system_setting"
        verbose_name = "系统设置"

    @classmethod
    def get_singleton(cls):
        """获取唯一的系统设置实例。"""
        obj, _ = cls.objects.get_or_create(key=cls.SETTING_KEY)
        return obj

    def to_dict(self):
        return {
            "retrieval_mode": self.retrieval_mode,
            "top_k": self.top_k,
            "max_context_tokens": self.max_context_tokens,
            "enable_vector_search": self.enable_vector_search,
            "enable_rerank": self.enable_rerank,
            "embedding_model_config_id": self.embedding_model_config_id,
            "rerank_model_config_id": self.rerank_model_config_id,
            "chat_model_config_id": self.chat_model_config_id,
            "upload_mode": self.upload_mode,
            "max_upload_size_mb": self.max_upload_size_mb,
            "enable_audit_log": self.enable_audit_log,
            "enable_prompt_log": self.enable_prompt_log,
            "enable_rag_log": self.enable_rag_log,
            "mask_secrets": self.mask_secrets,
            "login_fail_lock_count": self.login_fail_lock_count,
        }


class StorageConfig(TimeStampedModel):
    """对象存储配置。"""

    name = models.CharField(max_length=128)
    is_default = models.BooleanField(default=False)

    # MinIO / S3 配置
    provider = models.CharField(
        max_length=32,
        default="minio",
        choices=[("minio", "MinIO"), ("s3", "AWS S3"), ("oss", "阿里云 OSS")],
    )
    endpoint = models.CharField(max_length=256, help_text="存储端点地址")
    public_endpoint = models.CharField(max_length=256, blank=True, help_text="公开访问端点")
    access_key = models.TextField(blank=True, help_text="加密存储的 Access Key")
    secret_key = models.TextField(blank=True, help_text="加密存储的 Secret Key")
    bucket = models.CharField(max_length=128)
    region = models.CharField(max_length=64, blank=True, default="")
    secure = models.BooleanField(default=False, help_text="是否使用 HTTPS")

    # 代理配置
    proxy_enabled = models.BooleanField(default=False, help_text="是否通过 nginx 代理")
    presign_expire_seconds = models.IntegerField(default=3600, help_text="预签名 URL 过期时间")
    max_upload_size_mb = models.IntegerField(default=100, help_text="最大上传文件大小 MB")

    # CORS 配置（JSON 存储）
    cors_config = models.JSONField(default=dict, blank=True, help_text="CORS 配置")

    class Meta:
        db_table = "storage_config"
        verbose_name = "存储配置"
        ordering = ["-is_default", "name"]

    def set_access_key(self, value: str):
        """加密存储 Access Key。"""
        self.access_key = encrypt_value(value)

    def get_access_key(self) -> str:
        """解密获取 Access Key。"""
        return decrypt_value(self.access_key)

    def set_secret_key(self, value: str):
        """加密存储 Secret Key。"""
        self.secret_key = encrypt_value(value)

    def get_secret_key(self) -> str:
        """解密获取 Secret Key。"""
        return decrypt_value(self.secret_key)

    def to_dict_safe(self):
        """返回安全版本（密钥遮蔽）。"""
        return {
            "id": self.id,
            "name": self.name,
            "is_default": self.is_default,
            "provider": self.provider,
            "endpoint": self.endpoint,
            "public_endpoint": self.public_endpoint,
            "bucket": self.bucket,
            "region": self.region,
            "secure": self.secure,
            "proxy_enabled": self.proxy_enabled,
            "presign_expire_seconds": self.presign_expire_seconds,
            "max_upload_size_mb": self.max_upload_size_mb,
            "has_access_key": bool(self.access_key),
            "access_key_masked": mask_value(self.get_access_key()),
            "has_secret_key": bool(self.secret_key),
            "secret_key_masked": mask_value(self.get_secret_key()),
            "cors_config": self.cors_config,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


class EmbeddingConfig(TimeStampedModel):
    """Embedding 向量模型配置。"""

    name = models.CharField("名称", max_length=128)
    provider = models.CharField(
        "供应商",
        max_length=32,
        choices=[
            ("bailian", "阿里百炼"),
            ("openai", "OpenAI"),
        ],
        default="bailian",
    )

    api_mode = models.CharField(
        "API 模式",
        max_length=32,
        choices=[
            ("openai_compatible", "OpenAI 兼容接口"),
            ("dashscope_native", "DashScope 原生接口"),
        ],
        default="openai_compatible",
    )

    model_name = models.CharField(
        "模型名称",
        max_length=100,
        default="text-embedding-v4",
    )
    dimension = models.IntegerField("向量维度", default=1024)

    base_url = models.CharField(
        "Base URL",
        max_length=256,
        default="https://dashscope.aliyuncs.com/compatible-mode/v1",
    )

    encrypted_api_key = models.TextField("加密 API Key", blank=True)
    api_key_env = models.CharField(
        "API Key 环境变量名",
        max_length=64,
        default="BAILIAN_API_KEY",
        blank=True,
    )

    batch_size = models.IntegerField("批次大小", default=10, help_text="单次请求最大文本数")
    max_tokens_per_text = models.IntegerField("单文本最大 Token", default=8192)
    timeout_seconds = models.IntegerField("超时秒数", default=60)

    is_active = models.BooleanField("是否启用", default=True)
    is_default = models.BooleanField("是否默认", default=False)

    metadata = models.JSONField("元数据", default=dict, blank=True)

    class Meta:
        db_table = "system_embedding_config"
        verbose_name = "Embedding 配置"
        verbose_name_plural = "Embedding 配置"
        ordering = ["-is_default", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["is_default"],
                condition=models.Q(is_default=True, is_active=True),
                name="uniq_default_embedding_config",
            ),
        ]

    def __str__(self):
        return f"{self.name} ({self.model_name})"

    def set_api_key(self, value: str) -> None:
        """加密存储 API Key。"""
        self.encrypted_api_key = encrypt_value(value)

    def get_api_key(self) -> str:
        """解密获取 API Key。"""
        return decrypt_value(self.encrypted_api_key)

    def to_dict_safe(self) -> dict:
        """返回安全版本。"""
        return {
            "id": self.id,
            "name": self.name,
            "provider": self.provider,
            "api_mode": self.api_mode,
            "model_name": self.model_name,
            "dimension": self.dimension,
            "base_url": self.base_url,
            "batch_size": self.batch_size,
            "max_tokens_per_text": self.max_tokens_per_text,
            "timeout_seconds": self.timeout_seconds,
            "is_active": self.is_active,
            "is_default": self.is_default,
            "has_api_key": bool(self.encrypted_api_key),
            "api_key_masked": mask_value(self.get_api_key()),
            "metadata": self.metadata,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


class RagSettings(TimeStampedModel):
    """RAG 设置（单例模式）。"""

    SETTING_KEY = "rag.defaults"

    key = models.CharField(max_length=64, unique=True, default=SETTING_KEY)

    retrieval_mode = models.CharField(
        "检索模式",
        max_length=32,
        default="postgres_fulltext",
        choices=[
            ("postgres_fulltext", "PostgreSQL 全文检索"),
            ("vector", "向量检索"),
            ("hybrid", "混合检索"),
        ],
    )

    embedding_config = models.ForeignKey(
        EmbeddingConfig,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="rag_settings",
        verbose_name="Embedding 配置",
    )

    top_k = models.IntegerField("Top K", default=10)
    max_context_tokens = models.IntegerField("最大上下文 Token", default=4000)
    enable_vector_search = models.BooleanField("启用向量检索", default=False)
    enable_rerank = models.BooleanField("启用 Rerank", default=False)

    class Meta:
        db_table = "system_rag_settings"
        verbose_name = "RAG 设置"

    @classmethod
    def get_singleton(cls):
        """获取唯一的 RAG 设置实例。"""
        obj, _ = cls.objects.get_or_create(key=cls.SETTING_KEY)
        return obj

    def to_dict(self):
        return {
            "retrieval_mode": self.retrieval_mode,
            "embedding_config_id": self.embedding_config_id,
            "top_k": self.top_k,
            "max_context_tokens": self.max_context_tokens,
            "enable_vector_search": self.enable_vector_search,
            "enable_rerank": self.enable_rerank,
        }