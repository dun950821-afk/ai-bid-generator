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


class TestProbeServiceSSRF:
    """SSRF 校验测试：禁止 base_url 指向内网。"""

    def test_chat_blocks_internal_ip(self):
        service = ProbeService()
        result = service.probe_chat(
            provider_type="deepseek",
            base_url="http://127.0.0.1:8000",
            api_key="sk-test",
            model_name="deepseek-chat",
        )
        assert result.ok is False
        assert result.error_code == "ssrf_blocked"
        assert "SSRF" in result.detail

    def test_chat_blocks_localhost(self):
        service = ProbeService()
        result = service.probe_chat(
            provider_type="openai",
            base_url="http://localhost:9000",
            api_key="sk-test",
            model_name="gpt-4",
        )
        assert result.ok is False
        assert result.error_code == "ssrf_blocked"

    def test_chat_blocks_metadata_endpoint(self):
        """AWS/云 metadata IP 必须拒绝。"""
        service = ProbeService()
        result = service.probe_chat(
            provider_type="deepseek",
            base_url="http://169.254.169.254/latest/meta-data/",
            api_key="sk-test",
            model_name="deepseek-chat",
        )
        assert result.ok is False
        assert result.error_code == "ssrf_blocked"

    def test_chat_blocks_file_scheme(self):
        service = ProbeService()
        result = service.probe_chat(
            provider_type="openai",
            base_url="file:///etc/passwd",
            api_key="sk-test",
            model_name="gpt-4",
        )
        assert result.ok is False
        assert result.error_code == "ssrf_blocked"

    def test_chat_blocks_empty_base_url(self):
        service = ProbeService()
        result = service.probe_chat(
            provider_type="deepseek",
            base_url="",
            api_key="sk-test",
            model_name="deepseek-chat",
        )
        assert result.ok is False
        assert result.error_code == "invalid_base_url"

    def test_embedding_blocks_internal_ip(self):
        service = ProbeService()
        result = service.probe_embedding(
            provider_type="bailian",
            base_url="http://10.0.0.5",
            api_key="sk-test",
            model_name="text-embedding-v3",
        )
        assert result.ok is False
        assert result.error_code == "ssrf_blocked"

    def test_mock_skips_ssrf_check(self):
        """mock provider 不发请求，不应被 SSRF 校验拦截。"""
        service = ProbeService()
        result = service.probe_chat(
            provider_type="mock",
            base_url="http://127.0.0.1/",
            api_key="",
            model_name="",
        )
        assert result.ok is False
        assert result.error_code == "mock_not_allowed"

