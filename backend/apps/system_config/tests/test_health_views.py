"""健康检查 API 测试。"""

import pytest

from apps.accounts.models import User
from rest_framework.test import APIClient

import responses


@pytest.mark.django_db
class TestHealthAPI:
    def setup_method(self):
        """初始化测试用户。"""
        self.user = User.objects.create_user(
            username="admin",
            password="admin123",
            email="admin@test.com",
            is_superuser=True,
            is_staff=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_get_health_returns_full_structure(self):
        """GET /api/settings/health/ 返回完整结构。"""
        resp = self.client.get("/api/settings/health/")

        assert resp.status_code == 200
        data = resp.json()
        assert "chat_model" in data
        assert "embedding_model" in data
        assert "rag_search" in data
        assert "file_storage" in data
        assert "security_audit" in data
        assert "mock_warning" in data
        assert "total_score" in data
        assert "total_max" in data
        assert "pending_count" in data
        assert data["total_max"] == 100

    def test_get_health_returns_error_when_no_config(self):
        """未配置任何项时返回 error 状态。"""
        resp = self.client.get("/api/settings/health/")

        assert resp.status_code == 200
        data = resp.json()
        assert data["chat_model"]["status"] == "error"
        assert data["embedding_model"]["status"] == "error"
        assert data["total_score"] < 100


@pytest.mark.django_db
class TestTestConnectionAPI:
    def setup_method(self):
        self.user = User.objects.create_user(
            username="admin",
            password="admin123",
            email="admin@test.com",
            is_superuser=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    @responses.activate
    def test_deepseek_test_connection_success(self):
        """测试连接 DeepSeek 成功。"""
        responses.add(
            responses.GET,
            "https://api.deepseek.com/models",
            json={"data": [{"id": "deepseek-chat"}]},
            status=200,
        )

        resp = self.client.post(
            "/api/settings/test-connection/",
            {
                "provider_type": "deepseek",
                "base_url": "https://api.deepseek.com",
                "api_key": "sk-test",
                "model_name": "deepseek-chat",
                "test_kind": "chat",
            },
            format="json",
        )

        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        assert data["error_code"] is None
        assert "deepseek-chat" in (data["models_sample"] or [])

    def test_mock_test_connection_rejected(self):
        """测试连接 Mock provider 直接拒绝。"""
        resp = self.client.post(
            "/api/settings/test-connection/",
            {
                "provider_type": "mock",
                "base_url": "",
                "api_key": "",
                "model_name": "",
                "test_kind": "chat",
            },
            format="json",
        )

        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is False
        assert data["error_code"] == "mock_not_allowed"



@pytest.mark.django_db
class TestDiagnoseAPI:
    def setup_method(self):
        self.user = User.objects.create_user(
            username="admin",
            password="admin123",
            email="admin@test.com",
            is_superuser=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    @responses.activate
    def test_diagnose_calls_real_probe(self):
        """POST /health/diagnose/ 触发真实探针。"""
        from apps.generation.models import ModelProvider, ModelConfig
        from apps.generation.constants import ProviderType

        provider = ModelProvider.objects.create(
            key="deepseek",
            name="DeepSeek",
            provider_type=ProviderType.DEEPSEEK,
            base_url="https://api.deepseek.com",
            is_active=True,
        )
        provider.set_api_key("sk-test")
        provider.save()
        ModelConfig.objects.create(
            provider=provider,
            model_name="deepseek-chat",
            model_type="chat",
            is_default=True,
            is_active=True,
        )

        responses.add(
            responses.GET,
            "https://api.deepseek.com/models",
            json={"data": [{"id": "deepseek-chat"}]},
            status=200,
        )

        # 先 GET /health/ 写缓存
        self.client.get("/api/settings/health/")
        # POST /health/diagnose/ 应绕过缓存
        resp = self.client.post("/api/settings/health/diagnose/")

        assert resp.status_code == 200
        data = resp.json()
        assert data["chat_model"]["last_probe_ok"] is True
        assert data["chat_model"]["last_probe_at"] is not None
