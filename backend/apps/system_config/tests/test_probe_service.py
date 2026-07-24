"""探针服务测试。"""

import pytest
import responses

from apps.system_config.services.probe_service import ProbeService, ProbeResult


@pytest.mark.django_db
class TestProbeService:
    @responses.activate
    def test_deepseek_probe_success_returns_models(self):
        """DeepSeek 探针成功时返回模型列表。"""
        responses.add(
            responses.GET,
            "https://api.deepseek.com/models",
            json={
                "object": "list",
                "data": [
                    {"id": "deepseek-chat", "object": "model"},
                    {"id": "deepseek-coder", "object": "model"},
                ],
            },
            status=200,
        )

        service = ProbeService()
        result = service.probe_chat(
            provider_type="deepseek",
            base_url="https://api.deepseek.com",
            api_key="sk-test",
            model_name="deepseek-chat",
        )

        assert result.ok is True
        assert result.error_code is None
        assert "deepseek-chat" in (result.models_sample or [])
        assert result.latency_ms >= 0
        assert "成功" in result.detail

    @responses.activate
    def test_deepseek_probe_401_returns_auth_failed(self):
        """DeepSeek 探针 401 时返回 auth_failed。"""
        responses.add(
            responses.GET,
            "https://api.deepseek.com/models",
            json={"error": {"message": "Invalid API key"}},
            status=401,
        )

        service = ProbeService()
        result = service.probe_chat(
            provider_type="deepseek",
            base_url="https://api.deepseek.com",
            api_key="sk-invalid",
            model_name="deepseek-chat",
        )

        assert result.ok is False
        assert result.error_code == "auth_failed"
        assert "401" in result.detail

    def test_mock_probe_rejected_without_network(self):
        """Mock provider 探针直接返回 mock_not_allowed，不发请求。"""
        service = ProbeService()
        result = service.probe_chat(
            provider_type="mock",
            base_url="",
            api_key="",
            model_name="",
        )

        assert result.ok is False
        assert result.error_code == "mock_not_allowed"
        assert "Mock" in result.detail

    @responses.activate
    def test_bailian_embedding_probe_success(self):
        """Bailian embedding 探针成功。"""
        responses.add(
            responses.POST,
            "https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding",
            json={
                "output": {"embeddings": [{"embedding": [0.1, 0.2]}]},
                "usage": {"total_tokens": 1},
            },
            status=200,
        )

        service = ProbeService()
        result = service.probe_embedding(
            provider_type="bailian",
            base_url="https://dashscope.aliyuncs.com",
            api_key="sk-test",
            model_name="text-embedding-v3",
        )

        assert result.ok is True
        assert result.error_code is None
        assert "text-embedding-v3" in result.detail
