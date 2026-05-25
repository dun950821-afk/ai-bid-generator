# backend/apps/generation/tests/test_llm_service.py
"""LLM 服务测试。"""

import pytest

from apps.generation.providers import MockLLMClient, BailianClient
from apps.generation.services.llm_service import LLMService, ProviderNotFoundError
from apps.generation.constants import ModelType, ProviderType


class TestMockLLMClient:
    """MockLLMClient 测试。"""

    def test_chat_without_schema(self):
        """测试无 Schema 调用。"""
        client = MockLLMClient()
        response = client.chat(
            model_config=None,
            system_prompt="你是一个助手",
            user_prompt="你好",
        )
        assert response.text == "[Mock] 这是一个模拟响应。"
        assert response.json == {}
        assert response.total_tokens > 0

    def test_chat_with_schema(self):
        """测试有 Schema 调用。"""
        client = MockLLMClient()
        schema = {
            "type": "object",
            "properties": {
                "summary": {"type": "string"},
                "risk_level": {"type": "string"},
                "is_mandatory": {"type": "boolean"},
            },
            "required": ["summary", "risk_level"],
        }
        response = client.chat(
            model_config=None,
            system_prompt="你是一个助手",
            user_prompt="分析条款",
            response_format=schema,
        )
        assert "summary" in response.json
        assert "risk_level" in response.json
        assert response.json["summary"] == "mock"

    def test_mock_json_from_schema_nested(self):
        """测试嵌套 Schema。"""
        client = MockLLMClient()
        schema = {
            "type": "object",
            "properties": {
                "items": {"type": "array"},
                "meta": {"type": "object"},
                "count": {"type": "integer"},
            },
            "required": ["items", "meta", "count"],
        }
        result = client._mock_json_from_schema(schema)
        assert result["items"] == []
        assert result["meta"] == {}
        assert result["count"] == 0


class TestBailianClient:
    """BailianClient 测试。"""

    def test_not_implemented(self):
        """测试 P1 占位。"""
        client = BailianClient()
        with pytest.raises(NotImplementedError):
            client.chat(
                model_config=None,
                system_prompt="test",
                user_prompt="test",
            )


@pytest.mark.django_db
class TestLLMService:
    """LLMService 测试。"""

    def test_chat_with_mock(self, model_config):
        """测试 Mock 调用。"""
        service = LLMService()
        model_config.provider.provider_type = ProviderType.MOCK
        model_config.provider.save()

        response = service.chat(
            model_config=model_config,
            system_prompt="系统提示",
            user_prompt="用户提示",
        )
        assert response.text == "[Mock] 这是一个模拟响应。"

    def test_chat_with_schema(self, model_config):
        """测试带 Schema 调用。"""
        service = LLMService()
        model_config.provider.provider_type = ProviderType.MOCK
        model_config.provider.save()

        schema = {
            "type": "object",
            "properties": {
                "result": {"type": "string"},
            },
            "required": ["result"],
        }
        response = service.chat(
            model_config=model_config,
            system_prompt="系统提示",
            user_prompt="用户提示",
            response_format=schema,
        )
        assert "result" in response.json

    def test_provider_not_found(self, model_config):
        """测试 Provider 未找到。"""
        service = LLMService()
        model_config.provider.provider_type = "unknown"
        model_config.provider.save()

        with pytest.raises(ProviderNotFoundError):
            service.chat(
                model_config=model_config,
                system_prompt="test",
                user_prompt="test",
            )

    def test_register_provider(self, model_config):
        """测试注册 Provider。"""
        service = LLMService()
        custom_client = MockLLMClient()
        service.register_provider("custom", custom_client)

        model_config.provider.provider_type = "custom"
        model_config.provider.save()

        response = service.chat(
            model_config=model_config,
            system_prompt="test",
            user_prompt="test",
        )
        assert response.text == "[Mock] 这是一个模拟响应。"