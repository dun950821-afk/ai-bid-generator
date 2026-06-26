# backend/apps/generation/tests/test_model_config_context_length.py
"""ModelConfig context_length 字段测试。"""

import pytest
from apps.generation.models import ModelConfig, ModelProvider


@pytest.mark.django_db
class TestModelConfigContextLength:
    """context_length 字段测试。"""

    def test_context_length_nullable(self):
        """context_length 可为 null。"""
        provider = ModelProvider.objects.create(
            key="test-provider",
            name="Test Provider",
            base_url="http://test",
        )
        config = ModelConfig.objects.create(
            provider=provider,
            model_name="test-model",
            model_type="chat",
            context_length=None,
        )
        config.refresh_from_db()
        assert config.context_length is None

    def test_context_length_can_be_set(self):
        """context_length 可设置为具体值。"""
        provider = ModelProvider.objects.create(
            key="test-provider-2",
            name="Test Provider 2",
            base_url="http://test",
        )
        config = ModelConfig.objects.create(
            provider=provider,
            model_name="test-model",
            model_type="chat",
            context_length=128000,
        )
        config.refresh_from_db()
        assert config.context_length == 128000
