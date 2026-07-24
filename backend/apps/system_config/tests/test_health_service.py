"""HealthCheckService 测试。"""

import pytest
from django.utils import timezone

from apps.generation.models import ModelProvider, ModelConfig
from apps.system_config.models import StorageConfig, EmbeddingConfig, RagSettings, SystemSetting
from apps.system_config.services.health_service import HealthCheckService


@pytest.mark.django_db
class TestHealthScoring:
    def test_total_score_100_when_all_ok(self, db_setup_all_ok):
        """全部配置 + 探针成功 → 100 分。"""
        service = HealthCheckService()
        # 使用 mock 探针，避免真实网络调用
        status = service.get_health_status(use_cache=False, probe_fn=lambda *a, **kw: True)

        assert status["total_score"] == 100
        assert status["total_max"] == 100
        assert status["pending_count"] == 0
        assert status["chat_model"]["status"] == "ok"
        assert status["embedding_model"]["status"] == "ok"
        assert status["rag_search"]["status"] == "ok"
        assert status["file_storage"]["status"] == "ok"
        assert status["security_audit"]["status"] == "ok"

    @pytest.fixture
    def db_setup_all_ok(self):
        """初始化全部 OK 的数据库状态。"""
        # Chat 模型
        provider = ModelProvider.objects.create(
            key="deepseek",
            name="DeepSeek",
            provider_type="deepseek",
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

        # Embedding 模型
        embedding = EmbeddingConfig.objects.create(
            name="百炼 Embedding",
            provider="bailian",
            model_name="text-embedding-v3",
            base_url="https://dashscope.aliyuncs.com",
            is_active=True,
            is_default=True,
        )

        # RAG 设置：启用 + 有 embedding
        rag = RagSettings.get_singleton()
        rag.retrieval_mode = "hybrid"
        rag.embedding_config = embedding
        rag.enable_vector_search = True
        rag.save()

        # 文件存储
        storage = StorageConfig.objects.create(
            name="MinIO",
            provider="minio",
            endpoint="minio:9000",
            public_endpoint="163.7.6.60:9000",
            bucket="bid-files",
            is_default=True,
        )
        storage.set_access_key("minioadmin")
        storage.set_secret_key("minioadmin")
        storage.save()

        # 安全审计启用
        setting = SystemSetting.get_singleton()
        setting.enable_audit_log = True
        setting.save()

        yield

    def test_chat_model_mock_returns_mock_status(self, db_setup_chat_mock):
        """默认 chat 指向 mock → status='mock', mock_warning.show=true。"""
        service = HealthCheckService()
        status = service.get_health_status(use_cache=False)

        assert status["chat_model"]["status"] == "mock"
        assert status["chat_model"]["is_mock"] is True
        assert status["mock_warning"] is not None
        assert status["mock_warning"]["show"] is True
        assert status["mock_warning"]["level"] == "chat"
        assert status["chat_model"]["score"] == 0

    @pytest.fixture
    def db_setup_chat_mock(self):
        """Chat 模型指向 mock provider。"""
        from apps.generation.constants import ProviderType

        provider = ModelProvider.objects.create(
            key="mock",
            name="Mock Provider",
            provider_type=ProviderType.MOCK,
            base_url="",
            is_active=True,
        )
        ModelConfig.objects.create(
            provider=provider,
            model_name="mock-chat",
            model_type="chat",
            is_default=True,
            is_active=True,
        )
        yield

    def test_chat_model_not_configured_returns_error(self):
        """无默认 chat → status='error', score=0。"""
        service = HealthCheckService()
        status = service.get_health_status(use_cache=False)

        assert status["chat_model"]["status"] == "error"
        assert status["chat_model"]["score"] == 0
        assert status["chat_model"]["label"] == "未配置"

    def test_rag_enabled_but_no_embedding_returns_warning(self, db_setup_rag_no_embedding):
        """retrieval_mode='hybrid' 但无 embedding 配置 → score=10。"""
        service = HealthCheckService()
        status = service.get_health_status(use_cache=False)

        assert status["rag_search"]["status"] == "warning"
        assert status["rag_search"]["score"] == 10
        assert "无可用 embedding" in status["rag_search"]["sublabel"]

    @pytest.fixture
    def db_setup_rag_no_embedding(self):
        """RAG 启用但无 embedding 配置。"""
        rag = RagSettings.get_singleton()
        rag.retrieval_mode = "hybrid"
        rag.enable_vector_search = True
        rag.embedding_config = None
        rag.save()
        yield

    def test_health_status_cached_in_redis(self, db_setup_all_ok):
        """30 秒内重复调用不重探（缓存命中）。"""
        from django.core.cache import cache

        cache.clear()

        service = HealthCheckService()
        call_count = [0]

        def counting_probe(*args, **kwargs):
            call_count[0] += 1
            return True

        # 第一次调用：写缓存
        service.get_health_status(use_cache=True, probe_fn=counting_probe)
        # 第二次调用：不传 probe_fn，应命中缓存，不调用 probe
        status = service.get_health_status(use_cache=True)

        # 缓存命中时不会调用 probe_fn
        assert call_count[0] == 1
        assert status["total_score"] == 100
