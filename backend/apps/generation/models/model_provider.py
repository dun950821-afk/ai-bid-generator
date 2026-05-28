# backend/apps/generation/models/model_provider.py
"""模型供应商模型。"""

from django.db import models

from apps.common.models import TimeStampedModel


def get_provider_api_key(provider) -> str:
    """获取 Provider 的 API Key。

    优先级：
    1. provider.encrypted_api_key
    2. provider.api_key_env 对应环境变量
    3. 空字符串
    """
    # 优先使用加密存储的 API Key
    if provider.encrypted_api_key:
        return provider.get_api_key()

    # 其次使用环境变量
    if provider.api_key_env:
        import os
        return os.environ.get(provider.api_key_env, "")

    return ""


class ModelProvider(TimeStampedModel):
    """模型供应商。"""

    key = models.CharField(
        "供应商键",
        max_length=64,
        unique=True,
    )
    name = models.CharField(
        "供应商名称",
        max_length=100,
    )
    provider_type = models.CharField(
        "供应商类型",
        max_length=64,
        help_text="mock / dashscope / deepseek / openai_compatible",
    )
    base_url = models.CharField(
        "Base URL",
        max_length=255,
        blank=True,
    )
    api_key_env = models.CharField(
        "API Key 环境变量名",
        max_length=64,
        blank=True,
        default="",
    )
    encrypted_api_key = models.TextField(
        "加密 API Key",
        blank=True,
        help_text="加密存储的 API Key",
    )
    is_active = models.BooleanField(
        "是否启用",
        default=True,
    )
    config_defaults = models.JSONField(
        "默认配置",
        default=dict,
        blank=True,
    )

    class Meta:
        db_table = "generation_model_provider"
        verbose_name = "模型供应商"
        verbose_name_plural = "模型供应商"

    def __str__(self):
        return self.name

    def set_api_key(self, value: str) -> None:
        """加密存储 API Key。"""
        from apps.system_config.models import encrypt_value
        self.encrypted_api_key = encrypt_value(value)

    def get_api_key(self) -> str:
        """解密获取 API Key。"""
        from apps.system_config.models import decrypt_value
        return decrypt_value(self.encrypted_api_key)

    def to_dict_safe(self) -> dict:
        """返回安全版本（密钥遮蔽）。"""
        from apps.system_config.models import mask_value
        return {
            "id": self.id,
            "key": self.key,
            "name": self.name,
            "provider_type": self.provider_type,
            "base_url": self.base_url,
            "api_key_env": self.api_key_env,
            "is_active": self.is_active,
            "has_api_key": bool(self.encrypted_api_key),
            "api_key_masked": mask_value(self.get_api_key()),
            "config_defaults": self.config_defaults,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }
