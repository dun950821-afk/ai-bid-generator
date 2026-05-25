# backend/apps/generation/providers/base.py
"""Provider 客户端抽象基类。"""

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class LLMResponse:
    """LLM 响应。"""

    text: str
    json: dict
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    latency_ms: int


class ProviderClient(ABC):
    """Provider 客户端抽象。"""

    @abstractmethod
    def chat(
        self,
        model_config,
        system_prompt: str,
        user_prompt: str,
        response_format: dict | None = None,
    ) -> LLMResponse:
        """执行对话调用。

        Args:
            model_config: 模型配置
            system_prompt: 系统提示词
            user_prompt: 用户提示词
            response_format: 响应格式（JSON Schema）

        Returns:
            LLMResponse
        """
        pass