"""Fernet 密钥派生测试。"""
import pytest
from django.test import override_settings


def test_get_fernet_key_uses_explicit_setting():
    """配置 SECRET_KEY_ENCRYPTION 时直接使用。"""
    from apps.system_config.models import get_fernet_key
    test_key = "YQKx9s8l7v6t5r4e3w2q1a0z9x8c7v6b5n4m3l2k1j0h9g8f7e6d5c4b3a2="
    with override_settings(SECRET_KEY_ENCRYPTION=test_key):
        result = get_fernet_key()
        assert result == test_key


def test_get_fernet_key_raises_when_missing():
    """未配置 SECRET_KEY_ENCRYPTION 时应抛 ImproperlyConfigured。"""
    from apps.system_config.models import get_fernet_key
    from django.core.exceptions import ImproperlyConfigured
    with override_settings(SECRET_KEY_ENCRYPTION=None):
        with pytest.raises(ImproperlyConfigured, match="SECRET_KEY_ENCRYPTION"):
            get_fernet_key()


def test_get_fernet_key_raises_when_empty():
    """空字符串也应抛 ImproperlyConfigured。"""
    from apps.system_config.models import get_fernet_key
    from django.core.exceptions import ImproperlyConfigured
    with override_settings(SECRET_KEY_ENCRYPTION=""):
        with pytest.raises(ImproperlyConfigured, match="SECRET_KEY_ENCRYPTION"):
            get_fernet_key()
