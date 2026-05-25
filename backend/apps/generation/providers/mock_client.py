# backend/apps/generation/providers/mock_client.py
"""Mock LLM 客户端，用于测试。"""

import json

from apps.generation.providers.base import ProviderClient, LLMResponse


class MockLLMClient(ProviderClient):
    """Mock 客户端，用于测试。"""

    def chat(
        self,
        model_config,
        system_prompt: str,
        user_prompt: str,
        response_format: dict | None = None,
    ) -> LLMResponse:
        """执行 Mock 调用。"""
        if response_format:
            mock_json = self._mock_json_from_schema(response_format)
            return LLMResponse(
                text=json.dumps(mock_json, ensure_ascii=False),
                json=mock_json,
                prompt_tokens=len(system_prompt) // 4,
                completion_tokens=100,
                total_tokens=len(system_prompt) // 4 + 100,
                latency_ms=100,
            )

        return LLMResponse(
            text="[Mock] 这是一个模拟响应。",
            json={},
            prompt_tokens=len(system_prompt) // 4,
            completion_tokens=100,
            total_tokens=len(system_prompt) // 4 + 100,
            latency_ms=100,
        )

    def _mock_json_from_schema(self, schema: dict) -> dict:
        """根据 JSON Schema 生成兼容的 Mock JSON。"""
        properties = schema.get("properties", {})
        required = schema.get("required", list(properties.keys()))

        result = {}
        for key in required:
            if key not in properties:
                result[key] = "mock"
                continue

            field_type = properties[key].get("type", "string")
            if field_type == "string":
                result[key] = "mock"
            elif field_type == "boolean":
                result[key] = True
            elif field_type == "array":
                result[key] = []
            elif field_type == "object":
                result[key] = {}
            elif field_type in ["number", "integer"]:
                result[key] = 0
            else:
                result[key] = None

        return result