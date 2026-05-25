# backend/apps/generation/providers/bailian_client.py
"""阿里百炼客户端。"""

from apps.generation.providers.base import ProviderClient, LLMResponse


class BailianClient(ProviderClient):
    """阿里百炼客户端。"""

    def chat(
        self,
        model_config,
        system_prompt: str,
        user_prompt: str,
        response_format: dict | None = None,
    ) -> LLMResponse:
        """执行百炼调用（P1 实现）。"""
        raise NotImplementedError("BailianClient 在 P1 实现")