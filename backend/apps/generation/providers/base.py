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

    def generate_image(
        self,
        model_config,
        prompt: str,
        negative_prompt: str = "",
        size: str = "1024x1024",
    ) -> bytes | None:
        """执行生图调用（OpenAI 兼容 /v1/images/generations）。

        默认实现抛出 NotImplementedError，子类按需覆盖。

        Args:
            model_config: 模型配置（含 provider/base_url/api_key）
            prompt: 生图提示词（英文）
            negative_prompt: 反向提示词
            size: 图片尺寸

        Returns:
            图片 bytes（PNG/JPEG），失败返回 None
        """
        raise NotImplementedError(f"{type(self).__name__} 不支持生图")