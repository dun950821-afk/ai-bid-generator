"""配置向导端点测试。"""

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.generation.models import ModelProvider, ModelConfig


@pytest.mark.django_db
class TestSetupWizard:
    def setup_method(self):
        self.user = User.objects.create_user(
            username="admin",
            password="admin123",
            email="admin@test.com",
            is_superuser=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_skip_step_does_not_modify_db(self):
        """chat_model 步骤缺失 → 不创建 Provider，原默认保持。"""
        # 原状态：无任何配置
        resp = self.client.post(
            "/api/settings/setup-wizard/",
            {"steps": {"chat_model": None, "embedding_model": None, "rag_search": None, "file_storage": None}},
            format="json",
        )

        assert resp.status_code == 200
        assert not ModelProvider.objects.exists()
        assert not ModelConfig.objects.exists()

    def test_chat_step_creates_provider_and_sets_default(self):
        """Chat 步骤创建 Provider + ModelConfig + 设为默认。"""
        resp = self.client.post(
            "/api/settings/setup-wizard/",
            {
                "steps": {
                    "chat_model": {
                        "provider_type": "deepseek",
                        "base_url": "https://api.deepseek.com",
                        "api_key": "sk-test",
                        "model_name": "deepseek-chat",
                    },
                    "embedding_model": None,
                    "rag_search": None,
                    "file_storage": None,
                }
            },
            format="json",
        )

        assert resp.status_code == 200
        provider = ModelProvider.objects.get(provider_type="deepseek")
        assert provider.base_url == "https://api.deepseek.com"
        config = ModelConfig.objects.get(provider=provider)
        assert config.model_name == "deepseek-chat"
        assert config.is_default is True
        assert config.model_type == "chat"

    def test_mock_provider_rejected_in_wizard(self):
        """provider_type='mock' → 400 + error_code='mock_not_allowed'。"""
        resp = self.client.post(
            "/api/settings/setup-wizard/",
            {
                "steps": {
                    "chat_model": {
                        "provider_type": "mock",
                        "base_url": "",
                        "api_key": "",
                        "model_name": "",
                    },
                    "embedding_model": None,
                    "rag_search": None,
                    "file_storage": None,
                }
            },
            format="json",
        )

        assert resp.status_code == 400
        data = resp.json()
        assert data["error_code"] == "mock_not_allowed"

    def test_partial_wizard_only_configures_provided_steps(self):
        """只提供 chat_model + file_storage，其他两个保持原状。"""
        # 先创建原 embedding 配置
        from apps.system_config.models import EmbeddingConfig, RagSettings
        original_embedding = EmbeddingConfig.objects.create(
            name="Original",
            provider="bailian",
            model_name="text-embedding-v3",
            base_url="https://dashscope.aliyuncs.com",
            is_active=True,
            is_default=True,
        )
        rag = RagSettings.get_singleton()
        rag.retrieval_mode = "hybrid"
        rag.embedding_config = original_embedding
        rag.save()

        resp = self.client.post(
            "/api/settings/setup-wizard/",
            {
                "steps": {
                    "chat_model": {
                        "provider_type": "deepseek",
                        "base_url": "https://api.deepseek.com",
                        "api_key": "sk-test",
                        "model_name": "deepseek-chat",
                    },
                    "embedding_model": None,
                    "rag_search": None,
                    "file_storage": {
                        "endpoint": "minio:9000",
                        "public_endpoint": "163.7.6.60:9000",
                        "access_key": "minioadmin",
                        "secret_key": "minioadmin",
                        "bucket": "bid-files",
                        "upload_mode": "backend_proxy",
                    },
                }
            },
            format="json",
        )

        assert resp.status_code == 200
        # 原 embedding 配置保留
        assert EmbeddingConfig.objects.filter(name="Original").exists()
        # Chat 模型已配置
        assert ModelConfig.objects.filter(model_name="deepseek-chat", is_default=True).exists()
        # Storage 已配置
        from apps.system_config.models import StorageConfig
        assert StorageConfig.objects.filter(bucket="bid-files", is_default=True).exists()
