"""LLM Provider 真实探针服务。

用于测试连接端点，对每个 provider 类型发起一次轻量级 API 调用验证可用性。
Mock provider 不可探针，直接返回错误。
"""

import time
from dataclasses import dataclass, field
from typing import Optional

import requests

from apps.outline.services.url_safety import is_safe_external_url


@dataclass
class ProbeResult:
    """探针结果。"""

    ok: bool
    latency_ms: int
    detail: str
    error_code: Optional[str] = None
    models_sample: Optional[list] = field(default=None)


class ProbeService:
    """LLM Provider 探针服务。"""

    TIMEOUT_SECONDS = 10

    def _validate_base_url(self, base_url: str) -> Optional[ProbeResult]:
        """SSRF 校验：base_url 必须是公网 http/https URL。

        Returns:
            None 表示通过；ProbeResult 表示拒绝原因。
        """
        if not base_url:
            return ProbeResult(
                ok=False,
                latency_ms=0,
                detail="base_url 不能为空",
                error_code="invalid_base_url",
            )
        if not is_safe_external_url(base_url):
            return ProbeResult(
                ok=False,
                latency_ms=0,
                detail=f"base_url 未通过 SSRF 校验，禁止访问内网或非 http(s) 地址: {base_url}",
                error_code="ssrf_blocked",
            )
        return None

    def probe_chat(
        self,
        provider_type: str,
        base_url: str,
        api_key: str,
        model_name: str,
    ) -> ProbeResult:
        """测试 chat 模型连接。"""
        if provider_type == "mock":
            return ProbeResult(
                ok=False,
                latency_ms=0,
                detail="Mock Provider 仅供开发调试，无法用于真实探针",
                error_code="mock_not_allowed",
            )
        # SSRF 校验：所有真实 provider 在发请求前必须通过
        blocked = self._validate_base_url(base_url)
        if blocked is not None:
            return blocked
        if provider_type == "deepseek":
            return self._probe_deepseek_chat(base_url, api_key)
        if provider_type == "bailian":
            return self._probe_bailian_chat(base_url, api_key, model_name)
        if provider_type == "openai":
            return self._probe_openai_chat(base_url, api_key)
        return ProbeResult(
            ok=False,
            latency_ms=0,
            detail=f"不支持的 provider_type: {provider_type}",
            error_code="unsupported_provider",
        )

    def probe_embedding(
        self,
        provider_type: str,
        base_url: str,
        api_key: str,
        model_name: str,
    ) -> ProbeResult:
        """测试 embedding 模型连接。"""
        if provider_type == "mock":
            return ProbeResult(
                ok=False,
                latency_ms=0,
                detail="Mock Provider 仅供开发调试，无法用于真实探针",
                error_code="mock_not_allowed",
            )
        # SSRF 校验
        blocked = self._validate_base_url(base_url)
        if blocked is not None:
            return blocked
        if provider_type == "bailian":
            return self._probe_bailian_embedding(base_url, api_key, model_name)
        if provider_type == "openai":
            return self._probe_openai_embedding(base_url, api_key, model_name)
        if provider_type == "deepseek":
            return ProbeResult(
                ok=False,
                latency_ms=0,
                detail="DeepSeek 不支持 embedding 探针",
                error_code="unsupported_provider",
            )
        return ProbeResult(
            ok=False,
            latency_ms=0,
            detail=f"不支持的 provider_type: {provider_type}",
            error_code="unsupported_provider",
        )

    def _probe_deepseek_chat(self, base_url: str, api_key: str) -> ProbeResult:
        """DeepSeek chat 探针：GET /models。"""
        start = time.time()
        try:
            resp = requests.get(
                f"{base_url.rstrip('/')}/models",
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=self.TIMEOUT_SECONDS,
            )
            latency = int((time.time() - start) * 1000)
            if resp.status_code == 200:
                data = resp.json()
                models = [m.get("id", "") for m in data.get("data", []) if m.get("id")]
                return ProbeResult(
                    ok=True,
                    latency_ms=latency,
                    detail=f"成功调用 /models 接口，返回 {len(models)} 个模型",
                    models_sample=models[:10],
                )
            if resp.status_code == 401:
                return ProbeResult(
                    ok=False,
                    latency_ms=latency,
                    detail="API key 无效：401 Unauthorized",
                    error_code="auth_failed",
                )
            return ProbeResult(
                ok=False,
                latency_ms=latency,
                detail=f"Provider 返回错误：{resp.status_code} {resp.text[:200]}",
                error_code="provider_error",
            )
        except requests.Timeout:
            return ProbeResult(
                ok=False,
                latency_ms=int((time.time() - start) * 1000),
                detail="请求超时（10 秒）",
                error_code="timeout",
            )
        except requests.RequestException as e:
            return ProbeResult(
                ok=False,
                latency_ms=int((time.time() - start) * 1000),
                detail=f"网络错误：{type(e).__name__}: {e}",
                error_code="network_error",
            )

    def _probe_bailian_chat(
        self, base_url: str, api_key: str, model_name: str
    ) -> ProbeResult:
        """Bailian chat 探针：POST 一次 hello world 对话。"""
        start = time.time()
        try:
            resp = requests.post(
                f"{base_url.rstrip('/')}/api/v1/services/aigc/text-generation/generation",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model_name,
                    "input": {"messages": [{"role": "user", "content": "hi"}]},
                },
                timeout=self.TIMEOUT_SECONDS,
            )
            latency = int((time.time() - start) * 1000)
            if resp.status_code == 200:
                return ProbeResult(
                    ok=True,
                    latency_ms=latency,
                    detail=f"成功调用 Bailian chat 接口（model={model_name}）",
                )
            if resp.status_code == 401:
                return ProbeResult(
                    ok=False,
                    latency_ms=latency,
                    detail="API key 无效：401 Unauthorized",
                    error_code="auth_failed",
                )
            body = resp.text[:200]
            if "model not found" in body.lower() or "model_not_found" in body.lower():
                return ProbeResult(
                    ok=False,
                    latency_ms=latency,
                    detail=f"模型不存在：{model_name}",
                    error_code="model_not_found",
                )
            return ProbeResult(
                ok=False,
                latency_ms=latency,
                detail=f"Provider 返回错误：{resp.status_code} {body}",
                error_code="provider_error",
            )
        except requests.Timeout:
            return ProbeResult(
                ok=False,
                latency_ms=int((time.time() - start) * 1000),
                detail="请求超时（10 秒）",
                error_code="timeout",
            )
        except requests.RequestException as e:
            return ProbeResult(
                ok=False,
                latency_ms=int((time.time() - start) * 1000),
                detail=f"网络错误：{type(e).__name__}: {e}",
                error_code="network_error",
            )

    def _probe_openai_chat(self, base_url: str, api_key: str) -> ProbeResult:
        """OpenAI chat 探针：GET /models。"""
        start = time.time()
        try:
            resp = requests.get(
                f"{base_url.rstrip('/')}/models",
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=self.TIMEOUT_SECONDS,
            )
            latency = int((time.time() - start) * 1000)
            if resp.status_code == 200:
                data = resp.json()
                models = [m.get("id", "") for m in data.get("data", []) if m.get("id")]
                return ProbeResult(
                    ok=True,
                    latency_ms=latency,
                    detail=f"成功调用 /models 接口，返回 {len(models)} 个模型",
                    models_sample=models[:10],
                )
            if resp.status_code == 401:
                return ProbeResult(
                    ok=False,
                    latency_ms=latency,
                    detail="API key 无效：401 Unauthorized",
                    error_code="auth_failed",
                )
            return ProbeResult(
                ok=False,
                latency_ms=latency,
                detail=f"Provider 返回错误：{resp.status_code} {resp.text[:200]}",
                error_code="provider_error",
            )
        except requests.Timeout:
            return ProbeResult(
                ok=False,
                latency_ms=int((time.time() - start) * 1000),
                detail="请求超时（10 秒）",
                error_code="timeout",
            )
        except requests.RequestException as e:
            return ProbeResult(
                ok=False,
                latency_ms=int((time.time() - start) * 1000),
                detail=f"网络错误：{type(e).__name__}: {e}",
                error_code="network_error",
            )

    def _probe_bailian_embedding(
        self, base_url: str, api_key: str, model_name: str
    ) -> ProbeResult:
        """Bailian embedding 探针：POST 一次 embedding 测试。"""
        start = time.time()
        try:
            resp = requests.post(
                f"{base_url.rstrip('/')}/api/v1/services/embeddings/text-embedding/text-embedding",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={"model": model_name, "input": {"texts": ["test"]}},
                timeout=self.TIMEOUT_SECONDS,
            )
            latency = int((time.time() - start) * 1000)
            if resp.status_code == 200:
                return ProbeResult(
                    ok=True,
                    latency_ms=latency,
                    detail=f"成功调用 Bailian embedding 接口（model={model_name}）",
                )
            if resp.status_code == 401:
                return ProbeResult(
                    ok=False,
                    latency_ms=latency,
                    detail="API key 无效：401 Unauthorized",
                    error_code="auth_failed",
                )
            return ProbeResult(
                ok=False,
                latency_ms=latency,
                detail=f"Provider 返回错误：{resp.status_code} {resp.text[:200]}",
                error_code="provider_error",
            )
        except requests.Timeout:
            return ProbeResult(
                ok=False,
                latency_ms=int((time.time() - start) * 1000),
                detail="请求超时（10 秒）",
                error_code="timeout",
            )
        except requests.RequestException as e:
            return ProbeResult(
                ok=False,
                latency_ms=int((time.time() - start) * 1000),
                detail=f"网络错误：{type(e).__name__}: {e}",
                error_code="network_error",
            )

    def _probe_openai_embedding(
        self, base_url: str, api_key: str, model_name: str
    ) -> ProbeResult:
        """OpenAI embedding 探针：POST /embeddings。"""
        start = time.time()
        try:
            resp = requests.post(
                f"{base_url.rstrip('/')}/embeddings",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={"model": model_name, "input": "test"},
                timeout=self.TIMEOUT_SECONDS,
            )
            latency = int((time.time() - start) * 1000)
            if resp.status_code == 200:
                return ProbeResult(
                    ok=True,
                    latency_ms=latency,
                    detail=f"成功调用 OpenAI embedding 接口（model={model_name}）",
                )
            if resp.status_code == 401:
                return ProbeResult(
                    ok=False,
                    latency_ms=latency,
                    detail="API key 无效：401 Unauthorized",
                    error_code="auth_failed",
                )
            return ProbeResult(
                ok=False,
                latency_ms=latency,
                detail=f"Provider 返回错误：{resp.status_code} {resp.text[:200]}",
                error_code="provider_error",
            )
        except requests.Timeout:
            return ProbeResult(
                ok=False,
                latency_ms=int((time.time() - start) * 1000),
                detail="请求超时（10 秒）",
                error_code="timeout",
            )
        except requests.RequestException as e:
            return ProbeResult(
                ok=False,
                latency_ms=int((time.time() - start) * 1000),
                detail=f"网络错误：{type(e).__name__}: {e}",
                error_code="network_error",
            )
