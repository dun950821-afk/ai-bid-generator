# backend/apps/generation/providers/deepseek_client.py
"""DeepSeek LLM 客户端。

DeepSeek 走 OpenAI 兼容协议，支持 response_format={"type":"json_object"}。
"""

import json
import time
from typing import Any

import httpx

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

        # 获取 base_url
        base_url = provider.base_url or "https://api.deepseek.com"
        # 确保 base_url 不以 /v1 结尾，我们自己拼接
        base_url = base_url.rstrip("/v1").rstrip("/")

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

        # 构建消息
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": user_prompt})

        # 构建请求体
        payload: dict[str, Any] = {
            "model": model_config.model_name or "deepseek-chat",
            "messages": messages,
            "temperature": model_config.temperature,
            "max_tokens": model_config.max_tokens,
            "top_p": model_config.top_p,
        }

        # JSON 模式（DeepSeek 支持 response_format）
        if response_format:
            payload["response_format"] = {"type": "json_object"}

        # 发送请求
        timeout = model_config.timeout_seconds or 60
        try:
            with httpx.Client(timeout=timeout) as client:
                response = client.post(
                    f"{base_url}/v1/chat/completions",
                    headers=headers,
                    json=payload,
                )
                response.raise_for_status()
                data = response.json()
        except httpx.HTTPStatusError as e:
            error_body = ""
            try:
                error_body = e.response.text
            except Exception:
                pass
            raise RuntimeError(f"DeepSeek API 错误 [{e.response.status_code}]: {error_body}") from e
        except httpx.TimeoutException as e:
            raise RuntimeError(f"DeepSeek API 超时 ({timeout}s)") from e
        except Exception as e:
            raise RuntimeError(f"DeepSeek API 调用失败: {e}") from e

        # 解析响应
        try:
            content = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError) as e:
            raise RuntimeError(f"DeepSeek API 返回格式异常: {data}") from e

        usage = data.get("usage", {})

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
            prompt_tokens=usage.get("prompt_tokens", 0),
            completion_tokens=usage.get("completion_tokens", 0),
            total_tokens=usage.get("total_tokens", 0),
            latency_ms=latency_ms,
        )
