# backend/apps/generation/services/llm_service.py
"""LLM 调用服务。"""

import logging
import time
from typing import Any

from apps.generation.providers import MockLLMClient, BailianClient, DeepSeekClient

logger = logging.getLogger(__name__)


class ProviderNotFoundError(Exception):
    """Provider 未找到。"""
    pass


class LLMRetryExhaustedError(Exception):
    """重试次数耗尽。"""
    pass


# 可重试的错误类型
RETRYABLE_ERRORS = [
    "RateLimitError",
    "APITimeoutError",
    "APIConnectionError",
    "ServiceUnavailableError",
]


class LLMService:
    """LLM 调用服务。

    统一封装模型调用，支持 Provider 路由和重试机制。
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
        retry_count: int | None = None,
        retry_delay_base: float = 1.0,
    ) -> Any:
        """执行对话调用（带重试）。

        Args:
            model_config: 模型配置
            system_prompt: 系统提示词
            user_prompt: 用户提示词
            response_format: 响应格式（JSON Schema）
            retry_count: 重试次数（默认使用 model_config.retry_count）
            retry_delay_base: 重试延迟基数（秒），实际延迟 = base * 2^attempt

        Returns:
            LLMResponse

        Raises:
            ProviderNotFoundError: Provider 未找到
            LLMRetryExhaustedError: 重试次数耗尽
        """
        provider_type = model_config.provider.provider_type
        provider = self._providers.get(provider_type)
        if not provider:
            raise ProviderNotFoundError(f"未找到 Provider 类型: {provider_type}")

        # 获取重试次数
        max_retries = retry_count if retry_count is not None else getattr(model_config, "retry_count", 2)
        last_error = None

        for attempt in range(max_retries + 1):
            try:
                return provider.chat(
                    model_config=model_config,
                    system_prompt=system_prompt,
                    user_prompt=user_prompt,
                    response_format=response_format,
                )
            except Exception as e:
                error_name = type(e).__name__
                error_message = str(e)

                # 判断是否可重试
                is_retryable = self._is_retryable_error(error_name, error_message)

                if not is_retryable or attempt == max_retries:
                    # 不可重试或已耗尽重试次数
                    logger.error(
                        "LLM call failed (no retry)",
                        extra={
                            "provider": provider_type,
                            "model": model_config.model_name,
                            "attempt": attempt,
                            "error_type": error_name,
                            "error_message": error_message[:200],
                        }
                    )
                    raise

                # 记录重试日志
                delay = retry_delay_base * (2 ** attempt)
                logger.warning(
                    "LLM call failed, retrying",
                    extra={
                        "provider": provider_type,
                        "model": model_config.model_name,
                        "attempt": attempt,
                        "max_retries": max_retries,
                        "delay_seconds": delay,
                        "error_type": error_name,
                        "error_message": error_message[:200],
                    }
                )

                last_error = e
                time.sleep(delay)

        # 理论上不会到这里
        raise LLMRetryExhaustedError(f"重试 {max_retries} 次后仍然失败: {last_error}")

    def _is_retryable_error(self, error_name: str, error_message: str) -> bool:
        """判断错误是否可重试。

        Args:
            error_name: 错误类型名
            error_message: 错误消息

        Returns:
            是否可重试
        """
        # 错误类型匹配
        for retryable in RETRYABLE_ERRORS:
            if retryable in error_name:
                return True

        # 错误消息匹配
        retryable_messages = [
            "限流",
            "rate limit",
            "timeout",
            "超时",
            "connection",
            "连接",
            "service unavailable",
            "服务不可用",
            "too many requests",
            "overloaded",
            "过载",
        ]

        error_lower = error_message.lower()
        for msg in retryable_messages:
            if msg in error_lower:
                return True

        return False

    def register_provider(self, provider_type: str, client) -> None:
        """注册 Provider。"""
        self._providers[provider_type] = client

    def generate_image(
        self,
        model_config,
        prompt: str,
        negative_prompt: str = "",
        size: str = "1024x1024",
    ) -> bytes | None:
        """执行生图调用（路由到 ProviderClient.generate_image）。

        Args:
            model_config: 模型配置（含 provider）
            prompt: 生图提示词（英文）
            negative_prompt: 反向提示词
            size: 图片尺寸

        Returns:
            图片 bytes，失败返回 None
        """
        provider_type = model_config.provider.provider_type
        provider = self._providers.get(provider_type)
        if not provider:
            raise ProviderNotFoundError(f"未找到 Provider 类型: {provider_type}")

        try:
            return provider.generate_image(
                model_config=model_config,
                prompt=prompt,
                negative_prompt=negative_prompt,
                size=size,
            )
        except NotImplementedError:
            logger.warning(f"Provider {provider_type} 不支持生图")
            return None
        except Exception as e:
            logger.warning(f"Image generation failed: {e}")
            return None
