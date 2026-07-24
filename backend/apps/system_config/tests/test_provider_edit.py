"""Provider 编辑与 Mock 限制测试。"""

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.generation.models import ModelProvider, ModelConfig
from apps.generation.constants import ProviderType


@pytest.mark.django_db
class TestMockDefaultRejection:
    def setup_method(self):
        self.user = User.objects.create_user(
            username="admin",
            password="admin123",
            email="admin@test.com",
            is_superuser=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_set_default_mock_returns_400(self):
        """Mock ModelConfig 不可设为默认。"""
        provider = ModelProvider.objects.create(
            key="mock",
            name="Mock",
            provider_type=ProviderType.MOCK,
            is_active=True,
        )
        config = ModelConfig.objects.create(
            provider=provider,
            model_name="mock-chat",
            model_type="chat",
            is_active=True,
        )

        resp = self.client.post(f"/api/generation/model-configs/{config.id}/set-default/")

        assert resp.status_code == 400
        data = resp.json()
        assert data["error_code"] == "mock_not_allowed_as_default"
        # 数据库中仍未设为默认
        config.refresh_from_db()
        assert config.is_default is False


@pytest.mark.django_db
class TestProviderTypeEdit:
    def setup_method(self):
        self.user = User.objects.create_user(
            username="admin",
            password="admin123",
            email="admin@test.com",
            is_superuser=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_cannot_change_provider_type_with_existing_models(self):
        """Provider 下有 ModelConfig → 切换 provider_type 失败。"""
        provider = ModelProvider.objects.create(
            key="mock",
            name="Mock",
            provider_type=ProviderType.MOCK,
            is_active=True,
        )
        ModelConfig.objects.create(
            provider=provider,
            model_name="mock-chat",
            model_type="chat",
        )

        resp = self.client.patch(
            f"/api/generation/model-providers/{provider.id}/",
            {"provider_type": "deepseek"},
            format="json",
        )

        assert resp.status_code == 400
        provider.refresh_from_db()
        assert provider.provider_type == ProviderType.MOCK

    def test_can_change_provider_type_when_no_models(self):
        """Provider 无 ModelConfig → 允许切换。"""
        provider = ModelProvider.objects.create(
            key="mock",
            name="Mock",
            provider_type=ProviderType.MOCK,
            is_active=True,
        )

        resp = self.client.patch(
            f"/api/generation/model-providers/{provider.id}/",
            {"provider_type": "deepseek"},
            format="json",
        )

        assert resp.status_code == 200
        provider.refresh_from_db()
        assert provider.provider_type == ProviderType.DEEPSEEK
