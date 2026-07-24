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
        # 三路探针分别传 mock，避免真实网络调用
        status = service.get_health_status(
            use_cache=False,
            chat_probe_fn=lambda *a, **kw: True,
            embedding_probe_fn=lambda *a, **kw: True,
            storage_probe_fn_factory=lambda storage: lambda: True,
        )

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

    def test_mock_warning_includes_model_config_and_provider_id(self, db_setup_chat_mock):
        """mock_warning 必须包含真实的 model_config_id 与 provider_id（spec §7.1）。"""
        from apps.generation.constants import ProviderType

        # 取出 fixture 创建的默认 chat 与 provider
        default_chat = ModelConfig.objects.get(is_default=True, is_active=True, model_type="chat")
        provider = default_chat.provider

        service = HealthCheckService()
        status = service.get_health_status(use_cache=False)

        mock_warning = status["mock_warning"]
        assert mock_warning is not None
        assert mock_warning["model_config_id"] == default_chat.id
        assert mock_warning["provider_id"] == provider.id
        # 同时校验 chat_model 状态本身也回填了 id 字段
        assert status["chat_model"]["model_config_id"] == default_chat.id
        assert status["chat_model"]["provider_id"] == provider.id

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

        def counting_chat_probe(*args, **kwargs):
            call_count[0] += 1
            return True

        def counting_embedding_probe(*args, **kwargs):
            call_count[0] += 1
            return True

        def counting_storage_probe_factory(_storage):
            def _probe():
                call_count[0] += 1
                return True
            return _probe

        # 第一次调用：写缓存（三路探针各调用一次）
        service.get_health_status(
            use_cache=True,
            chat_probe_fn=counting_chat_probe,
            embedding_probe_fn=counting_embedding_probe,
            storage_probe_fn_factory=counting_storage_probe_factory,
        )
        count_after_first = call_count[0]
        assert count_after_first > 0  # 至少调用过一次 probe

        # 第二次调用：不传任何 probe_fn，应命中缓存，不调用 probe
        status = service.get_health_status(use_cache=True)

        # 缓存命中时不会调用 probe_fn（计数不增长）
        assert call_count[0] == count_after_first
        assert status["total_score"] == 100

    def test_storage_secure_preserved_through_factory(self, db_setup_all_ok):
        """storage_probe_fn_factory 收到的 storage 对象保留 secure=True（regression）。

        旧位置参数 hack 把 storage.secure 丢失，导致 HTTPS MinIO 被误判为 HTTP。
        本测试通过 factory 捕获 storage 对象，断言其 secure 字段被正确传递。
        """
        # 把默认 storage 改成 secure=True（模拟 HTTPS MinIO）
        storage = StorageConfig.objects.get(is_default=True)
        storage.secure = True
        storage.save()

        service = HealthCheckService()
        captured_storage = {}

        def storage_probe_factory(s):
            captured_storage["secure"] = s.secure
            captured_storage["endpoint"] = s.endpoint
            return lambda: True  # 探针成功

        status = service.get_health_status(
            use_cache=False,
            storage_probe_fn_factory=storage_probe_factory,
        )

        # factory 收到的 storage 对象 secure 字段被保留
        assert captured_storage["secure"] is True
        assert captured_storage["endpoint"] == "minio:9000"
        # storage 探针成功，状态 ok
        assert status["file_storage"]["status"] == "ok"
        assert status["file_storage"]["score"] == 20
