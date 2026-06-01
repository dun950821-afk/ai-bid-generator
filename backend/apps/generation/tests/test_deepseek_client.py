# backend/apps/generation/tests/test_deepseek_client.py
"""DeepSeek 客户端测试。"""

import json
from unittest.mock import Mock, patch, MagicMock
import pytest

from openai import AuthenticationError, RateLimitError, APITimeoutError, BadRequestError, APIError

from apps.generation.providers.deepseek_client import DeepSeekClient
from apps.generation.providers.base import LLMResponse


@pytest.fixture
def mock_provider():
    """Mock Provider."""
    provider = Mock()
    provider.name = "DeepSeek"
    provider.provider_type = "deepseek"
    provider.base_url = ""
    provider.encrypted_api_key = "encrypted_key"
    provider.api_key_env = ""
    provider.get_api_key = Mock(return_value="test-api-key")
    return provider


@pytest.fixture
def mock_model_config(mock_provider):
    """Mock ModelConfig."""
    config = Mock()
    config.provider = mock_provider
    config.model_name = "deepseek-v4-flash"
    config.temperature = 0.7
    config.max_tokens = 4096
    config.top_p = 0.9
    config.timeout_seconds = 60
    config.enable_thinking = False
    config.reasoning_effort = ""
    return config


@pytest.fixture
def mock_openai_response():
    """Mock OpenAI Response."""
    response = Mock()
    response.choices = [Mock()]
    response.choices[0].message = Mock()
    response.choices[0].message.content = "Hello"
    response.usage = Mock()
    response.usage.prompt_tokens = 10
    response.usage.completion_tokens = 5
    response.usage.total_tokens = 15
    return response


class TestDeepSeekClientAPIKey:
    """API Key 读取测试。"""

    def test_missing_api_key(self, mock_model_config):
        """测试缺少 API Key 时抛出 ValueError。"""
        mock_model_config.provider.encrypted_api_key = ""
        mock_model_config.provider.api_key_env = ""
        mock_model_config.provider.get_api_key = Mock(return_value="")

        client = DeepSeekClient()
        with pytest.raises(ValueError, match="API Key 未配置"):
            client.chat(
                model_config=mock_model_config,
                system_prompt="test",
                user_prompt="test",
            )

    def test_api_key_from_encrypted(self, mock_model_config, mock_openai_response):
        """测试从 encrypted_api_key 读取 API Key。"""
        mock_model_config.provider.get_api_key = Mock(return_value="sk-encrypted-key")

        with patch("apps.generation.providers.deepseek_client.OpenAI") as mock_openai_class:
            mock_client = Mock()
            mock_client.chat.completions.create.return_value = mock_openai_response
            mock_openai_class.return_value = mock_client

            client = DeepSeekClient()
            result = client.chat(
                model_config=mock_model_config,
                system_prompt="test",
                user_prompt="test",
            )

            assert result.text == "Hello"
            # 验证 OpenAI 客户端初始化使用了正确的 API Key
            mock_openai_class.assert_called_once()
            call_kwargs = mock_openai_class.call_args.kwargs
            assert call_kwargs["api_key"] == "sk-encrypted-key"

    def test_api_key_from_env(self, mock_model_config, mock_openai_response):
        """测试从环境变量读取 API Key。"""
        mock_model_config.provider.encrypted_api_key = ""
        mock_model_config.provider.api_key_env = "DEEPSEEK_API_KEY"
        mock_model_config.provider.get_api_key = Mock(return_value="")

        with patch("os.environ.get") as mock_env:
            mock_env.return_value = "sk-env-key"

            with patch("apps.generation.providers.deepseek_client.OpenAI") as mock_openai_class:
                mock_client = Mock()
                mock_client.chat.completions.create.return_value = mock_openai_response
                mock_openai_class.return_value = mock_client

                client = DeepSeekClient()
                result = client.chat(
                    model_config=mock_model_config,
                    system_prompt="test",
                    user_prompt="test",
                )

                # 验证 OpenAI 客户端初始化使用了从环境变量读取的 API Key
                mock_openai_class.assert_called_once()
                call_kwargs = mock_openai_class.call_args.kwargs
                assert call_kwargs["api_key"] == "sk-env-key"
                assert result.text == "Hello"


class TestDeepSeekClientErrors:
    """错误处理测试。"""

    def test_authentication_failed(self, mock_model_config):
        """测试认证失败（401）。"""
        with patch("apps.generation.providers.deepseek_client.OpenAI") as mock_openai_class:
            mock_client = Mock()
            mock_client.chat.completions.create.side_effect = AuthenticationError(
                "Invalid API key", response=Mock(status_code=401), body={}
            )
            mock_openai_class.return_value = mock_client

            client = DeepSeekClient()
            with pytest.raises(RuntimeError, match="认证失败"):
                client.chat(
                    model_config=mock_model_config,
                    system_prompt="test",
                    user_prompt="test",
                )

    def test_rate_limit(self, mock_model_config):
        """测试限流（429）。"""
        with patch("apps.generation.providers.deepseek_client.OpenAI") as mock_openai_class:
            mock_client = Mock()
            mock_client.chat.completions.create.side_effect = RateLimitError(
                "Rate limit exceeded", response=Mock(status_code=429), body={}
            )
            mock_openai_class.return_value = mock_client

            client = DeepSeekClient()
            with pytest.raises(RuntimeError, match="限流"):
                client.chat(
                    model_config=mock_model_config,
                    system_prompt="test",
                    user_prompt="test",
                )

    def test_bad_request(self, mock_model_config):
        """测试请求参数错误（400）。"""
        with patch("apps.generation.providers.deepseek_client.OpenAI") as mock_openai_class:
            mock_client = Mock()
            mock_client.chat.completions.create.side_effect = BadRequestError(
                "Invalid model", response=Mock(status_code=400), body={}
            )
            mock_openai_class.return_value = mock_client

            client = DeepSeekClient()
            with pytest.raises(RuntimeError, match="请求参数错误"):
                client.chat(
                    model_config=mock_model_config,
                    system_prompt="test",
                    user_prompt="test",
                )

    def test_timeout(self, mock_model_config):
        """测试超时。"""
        with patch("apps.generation.providers.deepseek_client.OpenAI") as mock_openai_class:
            mock_client = Mock()
            mock_client.chat.completions.create.side_effect = APITimeoutError("Timeout")
            mock_openai_class.return_value = mock_client

            client = DeepSeekClient()
            with pytest.raises(RuntimeError, match="超时"):
                client.chat(
                    model_config=mock_model_config,
                    system_prompt="test",
                    user_prompt="test",
                )

    def test_api_error(self, mock_model_config):
        """测试通用 API 错误。"""
        with patch("apps.generation.providers.deepseek_client.OpenAI") as mock_openai_class:
            mock_client = Mock()
            mock_request = Mock()
            mock_client.chat.completions.create.side_effect = APIError(
                "Internal error", request=mock_request, body={}
            )
            mock_openai_class.return_value = mock_client

            client = DeepSeekClient()
            with pytest.raises(RuntimeError, match="API 错误"):
                client.chat(
                    model_config=mock_model_config,
                    system_prompt="test",
                    user_prompt="test",
                )


class TestDeepSeekClientJSON:
    """JSON 输出测试。"""

    def test_json_output(self, mock_model_config):
        """测试 JSON 输出模式。"""
        mock_response = Mock()
        mock_response.choices = [Mock()]
        mock_response.choices[0].message = Mock()
        mock_response.choices[0].message.content = '{"result": "success", "count": 42}'
        mock_response.usage = Mock()
        mock_response.usage.prompt_tokens = 10
        mock_response.usage.completion_tokens = 20
        mock_response.usage.total_tokens = 30

        with patch("apps.generation.providers.deepseek_client.OpenAI") as mock_openai_class:
            mock_client = Mock()
            mock_client.chat.completions.create.return_value = mock_response
            mock_openai_class.return_value = mock_client

            client = DeepSeekClient()
            result = client.chat(
                model_config=mock_model_config,
                system_prompt="test",
                user_prompt="test",
                response_format={"type": "json_object"},
            )

            assert result.json == {"result": "success", "count": 42}
            assert result.prompt_tokens == 10
            assert result.completion_tokens == 20
            assert result.total_tokens == 30

            # 验证请求参数包含 response_format
            call_kwargs = mock_client.chat.completions.create.call_args.kwargs
            assert call_kwargs["response_format"] == {"type": "json_object"}

    def test_invalid_json_falls_back_to_text(self, mock_model_config):
        """测试无效 JSON 回退到纯文本。"""
        mock_response = Mock()
        mock_response.choices = [Mock()]
        mock_response.choices[0].message = Mock()
        mock_response.choices[0].message.content = "This is not valid JSON"
        mock_response.usage = Mock()
        mock_response.usage.prompt_tokens = 10
        mock_response.usage.completion_tokens = 5
        mock_response.usage.total_tokens = 15

        with patch("apps.generation.providers.deepseek_client.OpenAI") as mock_openai_class:
            mock_client = Mock()
            mock_client.chat.completions.create.return_value = mock_response
            mock_openai_class.return_value = mock_client

            client = DeepSeekClient()
            result = client.chat(
                model_config=mock_model_config,
                system_prompt="test",
                user_prompt="test",
            )

            assert result.text == "This is not valid JSON"
            assert result.json == {}


class TestDeepSeekClientConfig:
    """配置测试。"""

    def test_custom_base_url(self, mock_model_config, mock_openai_response):
        """测试自定义 base_url。"""
        mock_model_config.provider.base_url = "https://custom.deepseek.com"

        with patch("apps.generation.providers.deepseek_client.OpenAI") as mock_openai_class:
            mock_client = Mock()
            mock_client.chat.completions.create.return_value = mock_openai_response
            mock_openai_class.return_value = mock_client

            client = DeepSeekClient()
            client.chat(
                model_config=mock_model_config,
                system_prompt="test",
                user_prompt="test",
            )

            # 验证 OpenAI 客户端初始化使用了自定义 base_url
            mock_openai_class.assert_called_once()
            call_kwargs = mock_openai_class.call_args.kwargs
            assert call_kwargs["base_url"] == "https://custom.deepseek.com"

    def test_default_base_url(self, mock_model_config, mock_openai_response):
        """测试默认 base_url。"""
        mock_model_config.provider.base_url = ""

        with patch("apps.generation.providers.deepseek_client.OpenAI") as mock_openai_class:
            mock_client = Mock()
            mock_client.chat.completions.create.return_value = mock_openai_response
            mock_openai_class.return_value = mock_client

            client = DeepSeekClient()
            client.chat(
                model_config=mock_model_config,
                system_prompt="test",
                user_prompt="test",
            )

            # 验证 OpenAI 客户端初始化使用了默认 base_url
            mock_openai_class.assert_called_once()
            call_kwargs = mock_openai_class.call_args.kwargs
            assert call_kwargs["base_url"] == "https://api.deepseek.com"

    def test_model_name_from_config(self, mock_model_config, mock_openai_response):
        """测试 model_name 从配置读取。"""
        mock_model_config.model_name = "deepseek-reasoner"

        with patch("apps.generation.providers.deepseek_client.OpenAI") as mock_openai_class:
            mock_client = Mock()
            mock_client.chat.completions.create.return_value = mock_openai_response
            mock_openai_class.return_value = mock_client

            client = DeepSeekClient()
            client.chat(
                model_config=mock_model_config,
                system_prompt="test",
                user_prompt="test",
            )

            # 验证请求参数使用了正确的 model
            call_kwargs = mock_client.chat.completions.create.call_args.kwargs
            assert call_kwargs["model"] == "deepseek-reasoner"

    def test_default_model_name(self, mock_model_config, mock_openai_response):
        """测试默认 model_name。"""
        mock_model_config.model_name = ""

        with patch("apps.generation.providers.deepseek_client.OpenAI") as mock_openai_class:
            mock_client = Mock()
            mock_client.chat.completions.create.return_value = mock_openai_response
            mock_openai_class.return_value = mock_client

            client = DeepSeekClient()
            client.chat(
                model_config=mock_model_config,
                system_prompt="test",
                user_prompt="test",
            )

            # 验证请求参数使用了默认 model
            call_kwargs = mock_client.chat.completions.create.call_args.kwargs
            assert call_kwargs["model"] == "deepseek-v4-flash"

    def test_thinking_mode(self, mock_model_config, mock_openai_response):
        """测试思考模式。"""
        mock_model_config.enable_thinking = True
        mock_model_config.reasoning_effort = "high"

        with patch("apps.generation.providers.deepseek_client.OpenAI") as mock_openai_class:
            mock_client = Mock()
            mock_client.chat.completions.create.return_value = mock_openai_response
            mock_openai_class.return_value = mock_client

            client = DeepSeekClient()
            client.chat(
                model_config=mock_model_config,
                system_prompt="test",
                user_prompt="test",
            )

            # 验证思考模式参数
            call_kwargs = mock_client.chat.completions.create.call_args.kwargs
            assert call_kwargs["extra_body"] == {"thinking": {"type": "enabled"}}
            assert call_kwargs["reasoning_effort"] == "high"

    def test_thinking_mode_without_reasoning_effort(self, mock_model_config, mock_openai_response):
        """测试思考模式不设置 reasoning_effort。"""
        mock_model_config.enable_thinking = True
        mock_model_config.reasoning_effort = ""

        with patch("apps.generation.providers.deepseek_client.OpenAI") as mock_openai_class:
            mock_client = Mock()
            mock_client.chat.completions.create.return_value = mock_openai_response
            mock_openai_class.return_value = mock_client

            client = DeepSeekClient()
            client.chat(
                model_config=mock_model_config,
                system_prompt="test",
                user_prompt="test",
            )

            # 验证思考模式参数（只有 extra_body，没有 reasoning_effort）
            call_kwargs = mock_client.chat.completions.create.call_args.kwargs
            assert call_kwargs["extra_body"] == {"thinking": {"type": "enabled"}}
            assert "reasoning_effort" not in call_kwargs
