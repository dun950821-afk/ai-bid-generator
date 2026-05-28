# backend/apps/generation/services/llm_service.py
"""LLM 调用服务。"""

from apps.generation.providers import MockLLMClient, BailianClient, DeepSeekClient


class ProviderNotFoundError(Exception):
    """Provider 未找到。"""
    pass


class LLMService:
    """LLM 调用服务。

    统一封装模型调用，支持 Provider 路由。
    """

    def __init__(self):
        self._providers = {
            "mock": MockLLMClient(),
            "dashscope": BailianClient(),
            "deepseek": DeepSeekClient(),
        }

    def chat(
        self,
        model_config,
        system_prompt: str,
        user_prompt: str,
        response_format: dict | None = None,
    ):
        """执行对话调用。

        Args:
            model_config: 模型配置
            system_prompt: 系统提示词
            user_prompt: 用户提示词
            response_format: 响应格式（JSON Schema）

        Returns:
            LLMResponse
        """
        provider_type = model_config.provider.provider_type
        provider = self._providers.get(provider_type)
        if not provider:
            raise ProviderNotFoundError(f"未找到 Provider 类型: {provider_type}")

        return provider.chat(
            model_config=model_config,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            response_format=response_format,
        )

    def register_provider(self, provider_type: str, client) -> None:
        """注册 Provider。"""
        self._providers[provider_type] = client