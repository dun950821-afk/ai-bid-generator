"""测试环境配置：用本地内存缓存，使测试不依赖 Redis 服务。"""
from .dev import *  # noqa: F401,F403

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "bid-test-cache",
    },
}
