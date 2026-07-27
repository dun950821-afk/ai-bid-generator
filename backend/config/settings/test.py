"""测试环境配置：用本地内存缓存，使测试不依赖 Redis 服务。"""
from .dev import *  # noqa: F401,F403

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "bid-test-cache",
    },
}

# 测试环境固定 Fernet 密钥（不用于生产），避免 encrypt_value 抛 ImproperlyConfigured。
# 该密钥由 Fernet.generate_key() 生成，仅用于测试运行时加密 API Key 等敏感字段。
SECRET_KEY_ENCRYPTION = "Hf_0POIXJrxPFECSYbM39XC-qW-KjY6MrWISnz0UAGM="
