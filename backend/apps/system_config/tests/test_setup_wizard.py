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

    def test_file_storage_step_writes_upload_mode(self):
        """file_storage 步骤 upload_mode= presigned_direct 应同步到 SystemSetting。"""
        from apps.system_config.models import StorageConfig, SystemSetting

        # 确保起始 upload_mode 是默认值
        assert SystemSetting.get_singleton().upload_mode == "backend_proxy"

        resp = self.client.post(
            "/api/settings/setup-wizard/",
            {
                "steps": {
                    "chat_model": None,
                    "embedding_model": None,
                    "rag_search": None,
                    "file_storage": {
                        "endpoint": "minio:9000",
                        "public_endpoint": "163.7.6.60:9000",
                        "access_key": "minioadmin",
                        "secret_key": "minioadmin",
                        "bucket": "bid-files",
                        "upload_mode": "presigned_direct",
                    },
                }
            },
            format="json",
        )

        assert resp.status_code == 200, resp.json()
        # StorageConfig 已写入
        assert StorageConfig.objects.filter(bucket="bid-files", is_default=True).exists()
        # SystemSetting.upload_mode 已同步
        setting = SystemSetting.get_singleton()
        assert setting.upload_mode == "presigned_direct"

    def test_chat_step_overrides_old_default(self):
        """新 chat 步骤应翻转旧默认为 is_default=False，新配置为 is_default=True。"""
        # 先建一个旧默认 chat ModelConfig（deepseek / deepseek-chat）
        old_provider, _ = ModelProvider.objects.get_or_create(
            provider_type="deepseek",
            defaults={
                "key": "deepseek",
                "name": "Deepseek",
                "base_url": "https://api.deepseek.com",
                "is_active": True,
            },
        )
        old_config = ModelConfig.objects.create(
            provider=old_provider,
            model_name="deepseek-chat",
            model_type="chat",
            is_default=True,
            is_active=True,
        )

        # 向导配置另一个 chat（仍 deepseek 但不同 model_name）
        # update_or_create 同 provider+model_name 不会创建新配置，所以这里
        # 用一个不同的 model_name 验证「旧默认被翻转、新配置为默认」语义
        resp = self.client.post(
            "/api/settings/setup-wizard/",
            {
                "steps": {
                    "chat_model": {
                        "provider_type": "deepseek",
                        "base_url": "https://api.deepseek.com",
                        "api_key": "sk-test",
                        "model_name": "deepseek-reasoner",
                    },
                    "embedding_model": None,
                    "rag_search": None,
                    "file_storage": None,
                }
            },
            format="json",
        )

        assert resp.status_code == 200, resp.json()
        old_config.refresh_from_db()
        assert old_config.is_default is False
        new_config = ModelConfig.objects.get(
            provider=old_provider, model_name="deepseek-reasoner", model_type="chat"
        )
        assert new_config.is_default is True

    def test_mock_embedding_rejected_in_wizard(self):
        """embedding_model 步骤 provider_type=mock → 400 + error_code='mock_not_allowed'。"""
        from apps.system_config.models import EmbeddingConfig

        resp = self.client.post(
            "/api/settings/setup-wizard/",
            {
                "steps": {
                    "chat_model": None,
                    "embedding_model": {
                        "provider_type": "mock",
                        "base_url": "",
                        "api_key": "",
                        "model_name": "mock-embedding",
                    },
                    "rag_search": None,
                    "file_storage": None,
                }
            },
            format="json",
        )

        assert resp.status_code == 400
        data = resp.json()
        assert data["error_code"] == "mock_not_allowed"
        # 拒绝后不写库
        assert not EmbeddingConfig.objects.filter(model_name="mock-embedding").exists()
