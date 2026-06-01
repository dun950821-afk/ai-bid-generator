# backend/apps/generation/providers/deepseek_client.py
"""DeepSeek LLM 客户端。

DeepSeek 走 OpenAI 兼容协议，使用 openai SDK。
支持 response_format={"type":"json_object"} 和思考模式。
"""

import json
import time
from typing import Any

from openai import OpenAI, APIError, AuthenticationError, RateLimitError, APITimeoutError, BadRequestError

from apps.generation.models.model_provider import get_provider_api_key
from apps.generation.providers.base import ProviderClient, LLMResponse


class DeepSeekClient(ProviderClient):
    """DeepSeek LLM 客户端。"""

    def chat(
        self,
        model_config,
        system_prompt: str,
        user_prompt: str,
        response_format: dict | None = None,
    ) -> LLMResponse:
        """执行 DeepSeek 调用。

        Args:
            model_config: 模型配置
            system_prompt: 系统提示词
            user_prompt: 用户提示词
            response_format: 响应格式（JSON Schema）

        Returns:
            LLMResponse
        """
        start_time = time.time()
        provider = model_config.provider

        # 获取 API Key（优先级：encrypted_api_key > env > fallback）
        api_key = get_provider_api_key(provider)
        if not api_key:
            raise ValueError(f"DeepSeek API Key 未配置，请在系统设置中配置 {provider.name} 的 API Key")

        # 获取 base_url，默认 https://api.deepseek.com
        base_url = provider.base_url or "https://api.deepseek.com"

        # 初始化 OpenAI 客户端
        client = OpenAI(
            api_key=api_key,
            base_url=base_url,
        )

        # 构建消息
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": user_prompt})

        # 构建请求参数
        model_name = model_config.model_name or "deepseek-v4-flash"
        params: dict[str, Any] = {
            "model": model_name,
            "messages": messages,
            "temperature": model_config.temperature,
            "max_tokens": model_config.max_tokens,
            "top_p": model_config.top_p,
            "stream": False,
        }

        # DeepSeek V4 思考模式
        enable_thinking = getattr(model_config, "enable_thinking", False)
        reasoning_effort = getattr(model_config, "reasoning_effort", None)

        if enable_thinking:
            # 思考模式通过 extra_body 传入
            params["extra_body"] = {"thinking": {"type": "enabled"}}

        if reasoning_effort:
            # reasoning_effort 是顶层参数
            params["reasoning_effort"] = reasoning_effort

        # JSON 模式（DeepSeek 支持 response_format）
        if response_format:
            params["response_format"] = {"type": "json_object"}

        # 发送请求
        try:
            response = client.chat.completions.create(**params)
        except AuthenticationError as e:
            raise RuntimeError(f"DeepSeek API 认证失败：API Key 无效或已过期") from e
        except RateLimitError as e:
            raise RuntimeError(f"DeepSeek API 限流：请求过于频繁，请稍后重试") from e
        except APITimeoutError as e:
            timeout = model_config.timeout_seconds or 60
            raise RuntimeError(f"DeepSeek API 超时 ({timeout}s)") from e
        except BadRequestError as e:
            raise RuntimeError(f"DeepSeek API 请求参数错误：{e}") from e
        except APIError as e:
            raise RuntimeError(f"DeepSeek API 错误：{e}") from e
        except Exception as e:
            raise RuntimeError(f"DeepSeek API 调用失败: {e}") from e

        # 解析响应
        content = response.choices[0].message.content or ""

        usage = response.usage or {}
        prompt_tokens = usage.prompt_tokens or 0
        completion_tokens = usage.completion_tokens or 0
        total_tokens = usage.total_tokens or 0

        # 解析 JSON
        output_json = {}
        if content:
            try:
                output_json = json.loads(content)
            except json.JSONDecodeError:
                pass

        latency_ms = int((time.time() - start_time) * 1000)

        return LLMResponse(
            text=content,
            json=output_json,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
            latency_ms=latency_ms,
        )
