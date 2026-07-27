"""生产环境配置。"""
import os
import sys
from django.conf import settings  # noqa: F401

# 继承 base 后再做生产专属配置
from .base import *  # noqa: F401,F403

DEBUG = False
SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True

# 生产环境认证 Cookie 必须带 Secure
AUTH_COOKIE_SECURE = True


def validate_production_secrets():
    """启动时校验生产密钥不可为占位值。

    防止部署时漏改占位 SECRET_KEY 导致 JWT 可伪造。
    """
    insecure_keys = {"dev-insecure-change-me", "changeme", "insecure", ""}
    if settings.SECRET_KEY in insecure_keys:
        raise SystemExit(
            f"[FATAL] SECRET_KEY 不可为占位值（当前={settings.SECRET_KEY!r}），"
            "请在 .env 设置 DJANGO_SECRET_KEY（>=50 字符强随机）。"
        )
    if len(settings.SECRET_KEY) < 32:
        raise SystemExit(
            f"[FATAL] SECRET_KEY 长度不足（当前 {len(settings.SECRET_KEY)} 字符，"
            "要求 >=32 字符）。"
        )
    if not getattr(settings, "SECRET_KEY_ENCRYPTION", None):
        raise SystemExit(
            "[FATAL] 生产环境必须设置 SECRET_KEY_ENCRYPTION（Fernet 强密钥，"
            "用于加密 ModelProvider API Key）。请运行 "
            "python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
            " 生成后写入 .env。"
        )


# 仅在实际加载 prod 配置（gunicorn 启动）时执行校验
# 测试时（pytest）跳过，避免 import 副作用导致测试环境崩溃
if "pytest" not in sys.modules and os.environ.get("DJANGO_SETTINGS_MODULE") == "config.settings.prod":
    validate_production_secrets()
