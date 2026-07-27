"""生产配置校验测试。"""
import pytest
from django.test import override_settings


@pytest.mark.django_db
def test_prod_settings_reject_insecure_secret_key():
    """prod.py 加载时 SECRET_KEY 为占位值应抛 SystemExit。"""
    from config.settings import prod

    # 模拟占位 SECRET_KEY
    with override_settings(SECRET_KEY="dev-insecure-change-me"):
        with pytest.raises(SystemExit, match="SECRET_KEY.*不可.*dev-insecure"):
            prod.validate_production_secrets()


def test_prod_settings_reject_short_secret_key():
    """SECRET_KEY 长度不足 32 应抛 SystemExit。"""
    from config.settings import prod

    with override_settings(SECRET_KEY="short-but-not-placeholder-key"):
        with pytest.raises(SystemExit, match="长度不足"):
            prod.validate_production_secrets()


def test_prod_settings_reject_missing_encryption_key():
    """未配置 SECRET_KEY_ENCRYPTION 应抛 SystemExit。"""
    from config.settings import prod

    strong_key = "x" * 50  # 长度足够但非占位
    with override_settings(SECRET_KEY=strong_key, SECRET_KEY_ENCRYPTION=None):
        with pytest.raises(SystemExit, match="SECRET_KEY_ENCRYPTION"):
            prod.validate_production_secrets()


def test_prod_settings_accept_strong_keys():
    """强 SECRET_KEY + 合法 SECRET_KEY_ENCRYPTION 不应抛异常。"""
    from config.settings import prod

    # Fernet.generate_key() 产出的合法 key
    strong_secret = "x" * 50
    valid_fernet = "YQKx9s8l7v6t5r4e3w2q1a0z9x8c7v6b5n4m3l2k1j0h9g8f7e6d5c4b3a2="
    with override_settings(
        SECRET_KEY=strong_secret,
        SECRET_KEY_ENCRYPTION=valid_fernet,
    ):
        # 不应抛异常
        prod.validate_production_secrets()
