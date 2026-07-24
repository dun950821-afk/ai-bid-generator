# 系统设置页全面重设计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 全面重设计 `/admin/settings` 页面，引入健康度仪表盘、配置向导、真实探针，并修复 Mock Provider 误报、provider_type 编辑限制等关键 bug。

**Architecture:** 后端新增 `system_config/services/health_service.py` 与 `system_config/services/probe_service.py`，提供聚合健康状态与真实探针；新增 3 个端点（`/health/`、`/health/diagnose/`、`/test-connection/`、`/setup-wizard/`）；前端重写 `SystemSettingsView.vue` 为 Hero 状态条 + 健康度评分 + 4 Tab 布局，新增 `HealthHeroBar`、`HealthScorePanel`、`SetupWizardDialog` 三个组件；修复 `ProviderConfigDialog.vue` 的 `v-if="!isEdit"` bug。

**Tech Stack:** Django + DRF（后端）、Vue 3 + TypeScript + Element Plus（前端）、pytest + responses（后端测试）、vitest + @vue/test-utils（前端测试）、Redis（健康状态缓存）。

## Global Constraints

- 后端代码必须遵循 `backend/apps/system_config/` 现有目录结构
- 前端组件必须放在 `frontend/src/components/settings/` 目录下
- 后端测试用 `pytest` + `responses` 库（已在 requirements 中）
- 前端测试用 `vitest` + `@vue/test-utils` + `jsdom`
- 后端权限码统一为 `system_settings.manage`
- 前端 API 调用统一通过 `@/api/http` 的 `http` 实例
- Redis 缓存 key 前缀为 `settings:health:`
- Mock provider 不可设为默认模型（前后端双重校验）
- 现有数据库中的 mock 配置不删除，仅前端警告
- 探针单次请求超时 10 秒，不重试

## File Structure

**后端新增：**

| 文件 | 职责 |
|------|------|
| `backend/apps/system_config/services/__init__.py` | services 包初始化 |
| `backend/apps/system_config/services/probe_service.py` | 各 provider 真实探针实现 |
| `backend/apps/system_config/services/health_service.py` | 健康检查聚合 + 评分 + 缓存 |
| `backend/apps/system_config/services/wizard_service.py` | 向导保存逻辑 |
| `backend/apps/system_config/views/health_views.py` | HealthCheckView + DiagnoseView + TestConnectionView + SetupWizardView |
| `backend/apps/system_config/views/__init__.py` | views 包初始化（导出新视图） |
| `backend/apps/system_config/serializers/health_serializers.py` | 健康检查响应序列化器 |
| `backend/apps/system_config/serializers/__init__.py` | serializers 包初始化 |
| `backend/apps/system_config/tests/test_health_service.py` | HealthCheckService 测试 |
| `backend/apps/system_config/tests/test_probe_service.py` | 探针服务测试 |
| `backend/apps/system_config/tests/test_health_views.py` | 健康检查 API 测试 |
| `backend/apps/system_config/tests/test_setup_wizard.py` | 向导端点测试 |
| `backend/apps/system_config/tests/test_provider_edit.py` | provider_type 编辑测试 |

**后端修改：**

| 文件 | 修改要点 |
|------|---------|
| `backend/apps/system_config/views.py` | 现有视图保持，新视图放到 views/ 子目录 |
| `backend/apps/system_config/urls.py` | 新增 4 个端点路由 |
| `backend/apps/generation/views/model_views.py` | `ModelConfigSetDefaultView` 新增 Mock 校验 |
| `backend/apps/generation/serializers.py` | `ModelProviderUpdateSerializer` 放开 provider_type 编辑 + 切换前校验 |

**前端新增：**

| 文件 | 职责 |
|------|------|
| `frontend/src/api/settings.ts` | 健康检查 + 测试连接 + 向导 API 封装 |
| `frontend/src/components/settings/HealthHeroBar.vue` | 顶部 5 状态徽章 + Mock 告警横幅 |
| `frontend/src/components/settings/HealthScorePanel.vue` | 健康度评分面板（5 项进度条 + 影响说明） |
| `frontend/src/components/settings/SetupWizardDialog.vue` | 4 步配置向导对话框 |
| `frontend/src/components/settings/ProviderModelList.vue` | Tab 1 内 Provider + 嵌套 ModelConfig 列表 |
| `frontend/src/components/settings/__tests__/HealthHeroBar.spec.ts` | HealthHeroBar 测试 |
| `frontend/src/components/settings/__tests__/HealthScorePanel.spec.ts` | HealthScorePanel 测试 |
| `frontend/src/components/settings/__tests__/SetupWizardDialog.spec.ts` | SetupWizardDialog 测试 |
| `frontend/src/components/settings/__tests__/ProviderConfigDialog.spec.ts` | 编辑模式回归测试 |
| `frontend/src/components/settings/__tests__/ModelCard.spec.ts` | Mock 模型按钮置灰测试 |
| `frontend/src/views/admin/__tests__/SystemSettingsView.spec.ts` | 整页组装测试 |

**前端修改：**

| 文件 | 修改要点 |
|------|---------|
| `frontend/src/views/admin/SystemSettingsView.vue` | 整体重组为 Hero + 评分 + 4 Tab |
| `frontend/src/components/settings/ProviderConfigDialog.vue` | 移除 `v-if="!isEdit"`，允许编辑 provider_type |
| `frontend/src/components/settings/ModelCard.vue` | 新增「设为默认」按钮，mock 时置灰 |
| `frontend/src/components/settings/ModelSettingsPanel.vue` | 简化为承载 ProviderModelList |
| `frontend/src/components/settings/EmbeddingSettingsPanel.vue` | 与 RagSettingsPanel 合并到「知识库」Tab |

---

## Task 1: 创建后端 services 与 probe_service 骨架

**Files:**
- Create: `backend/apps/system_config/services/__init__.py`
- Create: `backend/apps/system_config/services/probe_service.py`
- Test: `backend/apps/system_config/tests/test_probe_service.py`
- Test: `backend/apps/system_config/tests/__init__.py`（如不存在）

**Interfaces:**
- Consumes: 无（首个任务）
- Produces: `ProbeService` 类，方法签名 `probe_chat(provider_type: str, base_url: str, api_key: str, model_name: str) -> ProbeResult` 与 `probe_embedding(provider_type: str, base_url: str, api_key: str, model_name: str) -> ProbeResult`，返回 `ProbeResult(ok: bool, latency_ms: int, detail: str, error_code: str | None, models_sample: list[str] | None)`

- [ ] **Step 1: 创建 services 包与 __init__.py**

```python
# backend/apps/system_config/services/__init__.py
"""系统配置服务层。"""
```

- [ ] **Step 2: 创建 tests/__init__.py（若不存在）**

```python
# backend/apps/system_config/tests/__init__.py
```

- [ ] **Step 3: 写第一个失败测试 - DeepSeek chat 探针成功**

```python
# backend/apps/system_config/tests/test_probe_service.py
"""探针服务测试。"""

import pytest
import responses

from apps.system_config.services.probe_service import ProbeService, ProbeResult


@pytest.mark.django_db
class TestProbeService:
    @responses.activate
    def test_deepseek_probe_success_returns_models(self):
        """DeepSeek 探针成功时返回模型列表。"""
        responses.add(
            responses.GET,
            "https://api.deepseek.com/models",
            json={
                "object": "list",
                "data": [
                    {"id": "deepseek-chat", "object": "model"},
                    {"id": "deepseek-coder", "object": "model"},
                ],
            },
            status=200,
        )

        service = ProbeService()
        result = service.probe_chat(
            provider_type="deepseek",
            base_url="https://api.deepseek.com",
            api_key="sk-test",
            model_name="deepseek-chat",
        )

        assert result.ok is True
        assert result.error_code is None
        assert "deepseek-chat" in (result.models_sample or [])
        assert result.latency_ms >= 0
        assert "成功" in result.detail
```

- [ ] **Step 4: 运行测试验证失败**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/system_config/tests/test_probe_service.py::TestProbeService::test_deepseek_probe_success_returns_models -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'apps.system_config.services.probe_service'`

- [ ] **Step 5: 创建 ProbeResult dataclass 与 ProbeService 骨架**

```python
# backend/apps/system_config/services/probe_service.py
"""LLM Provider 真实探针服务。

用于测试连接端点，对每个 provider 类型发起一次轻量级 API 调用验证可用性。
Mock provider 不可探针，直接返回错误。
"""

import time
from dataclasses import dataclass, field
from typing import Optional

import requests


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
```

- [ ] **Step 6: 运行测试验证通过**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/system_config/tests/test_probe_service.py::TestProbeService::test_deepseek_probe_success_returns_models -v`
Expected: PASS

- [ ] **Step 7: 写第二个测试 - DeepSeek 401 探针失败**

```python
# 追加到 backend/apps/system_config/tests/test_probe_service.py

    @responses.activate
    def test_deepseek_probe_401_returns_auth_failed(self):
        """DeepSeek 探针 401 时返回 auth_failed。"""
        responses.add(
            responses.GET,
            "https://api.deepseek.com/models",
            json={"error": {"message": "Invalid API key"}},
            status=401,
        )

        service = ProbeService()
        result = service.probe_chat(
            provider_type="deepseek",
            base_url="https://api.deepseek.com",
            api_key="sk-invalid",
            model_name="deepseek-chat",
        )

        assert result.ok is False
        assert result.error_code == "auth_failed"
        assert "401" in result.detail
```

- [ ] **Step 8: 运行测试验证通过**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/system_config/tests/test_probe_service.py::TestProbeService::test_deepseek_probe_401_returns_auth_failed -v`
Expected: PASS

- [ ] **Step 9: 写第三个测试 - Mock 探针被拒绝**

```python
# 追加到 backend/apps/system_config/tests/test_probe_service.py

    def test_mock_probe_rejected_without_network(self):
        """Mock provider 探针直接返回 mock_not_allowed，不发请求。"""
        service = ProbeService()
        result = service.probe_chat(
            provider_type="mock",
            base_url="",
            api_key="",
            model_name="",
        )

        assert result.ok is False
        assert result.error_code == "mock_not_allowed"
        assert "Mock" in result.detail
```

- [ ] **Step 10: 运行测试验证通过**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/system_config/tests/test_probe_service.py::TestProbeService::test_mock_probe_rejected_without_network -v`
Expected: PASS

- [ ] **Step 11: 写第四个测试 - Bailian embedding 探针成功**

```python
# 追加到 backend/apps/system_config/tests/test_probe_service.py

    @responses.activate
    def test_bailian_embedding_probe_success(self):
        """Bailian embedding 探针成功。"""
        responses.add(
            responses.POST,
            "https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding",
            json={
                "output": {"embeddings": [{"embedding": [0.1, 0.2]}]},
                "usage": {"total_tokens": 1},
            },
            status=200,
        )

        service = ProbeService()
        result = service.probe_embedding(
            provider_type="bailian",
            base_url="https://dashscope.aliyuncs.com",
            api_key="sk-test",
            model_name="text-embedding-v3",
        )

        assert result.ok is True
        assert result.error_code is None
        assert "text-embedding-v3" in result.detail
```

- [ ] **Step 12: 运行测试验证通过**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/system_config/tests/test_probe_service.py::TestProbeService::test_bailian_embedding_probe_success -v`
Expected: PASS

- [ ] **Step 13: 提交**

```bash
cd /home/newaibook/ai-bid-generator
git add backend/apps/system_config/services/ backend/apps/system_config/tests/
git commit -m "feat(settings): 新增 ProbeService 真实探针服务

- DeepSeek/Bailian/OpenAI chat 与 embedding 探针实现
- Mock provider 探针直接拒绝，不发网络请求
- 单次请求 10 秒超时，不重试
- 错误码：auth_failed / model_not_found / provider_error / timeout / mock_not_allowed"
```

---

## Task 2: 创建 HealthCheckService 与评分逻辑

**Files:**
- Create: `backend/apps/system_config/services/health_service.py`
- Test: `backend/apps/system_config/tests/test_health_service.py`

**Interfaces:**
- Consumes: `ProbeService`（Task 1）
- Produces: `HealthCheckService` 类，方法 `get_health_status(use_cache: bool = True) -> dict` 与 `diagnose() -> dict`，返回符合 spec §7.1 的健康状态字典

- [ ] **Step 1: 写第一个失败测试 - 全部配置成功得 100 分**

```python
# backend/apps/system_config/tests/test_health_service.py
"""HealthCheckService 测试。"""

import pytest
from django.utils import timezone

from apps.generation.models import ModelProvider, ModelConfig
from apps.system_config.models import StorageConfig, EmbeddingConfig, RagSettings, SystemSetting
from apps.system_config.services.health_service import HealthCheckService


@pytest.mark.django_db
class TestHealthScoring:
    def test_total_score_100_when_all_ok(self, db_setup_all_ok):
        """全部配置 + 探针成功 → 100 分。"""
        service = HealthCheckService()
        # 使用 mock 探针，避免真实网络调用
        status = service.get_health_status(use_cache=False, probe_fn=lambda *a, **kw: True)

        assert status["total_score"] == 100
        assert status["total_max"] == 100
        assert status["pending_count"] == 0
        assert status["chat_model"]["status"] == "ok"
        assert status["embedding_model"]["status"] == "ok"
        assert status["rag_search"]["status"] == "ok"
        assert status["file_storage"]["status"] == "ok"
        assert status["security_audit"]["status"] == "ok"

    @pytest.fixture
    def db_setup_all_ok(self):
        """初始化全部 OK 的数据库状态。"""
        # Chat 模型
        provider = ModelProvider.objects.create(
            key="deepseek",
            name="DeepSeek",
            provider_type="deepseek",
            base_url="https://api.deepseek.com",
            is_active=True,
        )
        provider.set_api_key("sk-test")
        provider.save()
        ModelConfig.objects.create(
            provider=provider,
            model_name="deepseek-chat",
            model_type="chat",
            is_default=True,
            is_active=True,
        )

        # Embedding 模型
        embedding = EmbeddingConfig.objects.create(
            name="百炼 Embedding",
            provider="bailian",
            model_name="text-embedding-v3",
            base_url="https://dashscope.aliyuncs.com",
            is_active=True,
            is_default=True,
        )

        # RAG 设置：启用 + 有 embedding
        rag = RagSettings.get_singleton()
        rag.retrieval_mode = "hybrid"
        rag.embedding_config = embedding
        rag.enable_vector_search = True
        rag.save()

        # 文件存储
        storage = StorageConfig.objects.create(
            name="MinIO",
            provider="minio",
            endpoint="minio:9000",
            public_endpoint="163.7.6.60:9000",
            bucket="bid-files",
            is_default=True,
        )
        storage.set_access_key("minioadmin")
        storage.set_secret_key("minioadmin")
        storage.save()

        # 安全审计启用
        setting = SystemSetting.get_singleton()
        setting.enable_audit_log = True
        setting.save()

        yield
```

- [ ] **Step 2: 运行测试验证失败**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/system_config/tests/test_health_service.py::TestHealthScoring::test_total_score_100_when_all_ok -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'apps.system_config.services.health_service'`

- [ ] **Step 3: 创建 HealthCheckService 实现**

```python
# backend/apps/system_config/services/health_service.py
"""健康检查聚合服务。

返回 Chat 模型 / Embedding 模型 / 向量检索 / 文件存储 / 安全审计 5 项状态
+ 总分 + Mock 告警。
"""

from typing import Callable, Optional

from django.core.cache import cache
from django.utils import timezone

from apps.generation.models import ModelConfig
from apps.system_config.models import (
    EmbeddingConfig,
    RagSettings,
    StorageConfig,
    SystemSetting,
)


CHAT_MODEL_IMPACT = (
    "投标文件大纲生成、条款抽取、废标检查、一致性修复等所有 LLM 调用将无法执行；"
    "招标文件解析流水线中「条款抽取」阶段会一直返回空结果"
)
EMBEDDING_MODEL_IMPACT = (
    "知识库 RAG 检索不可用；招标文件解析流水线中「向量嵌入」阶段被跳过；"
    "知识库管理中无法对文档建立向量索引"
)
RAG_SEARCH_IMPACT = (
    "投标内容生成时无法引用历史投标库/企业知识库，生成质量依赖单一 LLM 上下文；"
    "可通过启用 RAG 检索增强生成"
)
FILE_STORAGE_IMPACT = "所有文件上传（招标文件、附件、生成文档）将失败；预览/下载不可用"
SECURITY_AUDIT_IMPACT = "用户登录、模型调用、文件操作等关键行为无日志记录；安全事件无法追溯"


class HealthCheckService:
    """系统配置健康检查服务。"""

    CACHE_TIMEOUT = 30  # 30 秒缓存

    def get_health_status(
        self,
        use_cache: bool = True,
        probe_fn: Optional[Callable] = None,
    ) -> dict:
        """获取健康状态。

        Args:
            use_cache: 是否使用 Redis 缓存（True 时若缓存命中则不重探）
            probe_fn: 自定义探针函数（测试用），签名 (provider_type, base_url,
                      api_key, model_name) -> bool。None 时不做真实探针，
                      只读数据库状态。
        """
        if use_cache and probe_fn is None:
            cached = cache.get("settings:health:status")
            if cached:
                return cached

        chat_status = self._compute_chat_model_status(probe_fn)
        embedding_status = self._compute_embedding_model_status(probe_fn)
        rag_status = self._compute_rag_status(embedding_status)
        storage_status = self._compute_storage_status(probe_fn)
        audit_status = self._compute_security_audit_status()

        mock_warning = self._compute_mock_warning(chat_status, embedding_status)

        total_score = (
            chat_status["score"]
            + embedding_status["score"]
            + rag_status["score"]
            + storage_status["score"]
            + audit_status["score"]
        )
        pending_count = sum(
            1
            for s in [chat_status, embedding_status, rag_status, storage_status, audit_status]
            if s["status"] in ("warning", "error", "mock")
        )

        result = {
            "chat_model": chat_status,
            "embedding_model": embedding_status,
            "rag_search": rag_status,
            "file_storage": storage_status,
            "security_audit": audit_status,
            "mock_warning": mock_warning,
            "total_score": total_score,
            "total_max": 100,
            "pending_count": pending_count,
        }

        if use_cache and probe_fn is None:
            cache.set("settings:health:status", result, self.CACHE_TIMEOUT)

        return result

    def diagnose(self) -> dict:
        """一键诊断：对所有已配置项做真实探针，不走缓存。"""
        from apps.system_config.services.probe_service import ProbeService

        probe = ProbeService()

        def probe_fn(provider_type, base_url, api_key, model_name, test_kind="chat"):
            if test_kind == "chat":
                result = probe.probe_chat(provider_type, base_url, api_key, model_name)
            else:
                result = probe.probe_embedding(provider_type, base_url, api_key, model_name)
            return result.ok

        # 清缓存后重新计算
        cache.delete("settings:health:status")
        return self.get_health_status(use_cache=False, probe_fn=probe_fn)

    def _compute_chat_model_status(self, probe_fn: Optional[Callable]) -> dict:
        """计算 Chat 模型状态。"""
        default_chat = ModelConfig.objects.filter(
            is_default=True, is_active=True, model_type="chat"
        ).select_related("provider").first()

        if not default_chat:
            return {
                "status": "error",
                "label": "未配置",
                "sublabel": "",
                "provider_type": None,
                "is_default": False,
                "is_mock": False,
                "last_probe_at": None,
                "last_probe_ok": None,
                "impact_hint": CHAT_MODEL_IMPACT,
                "score": 0,
                "score_max": 30,
            }

        provider = default_chat.provider
        is_mock = provider.provider_type == "mock"

        if is_mock:
            return {
                "status": "mock",
                "label": default_chat.model_name,
                "sublabel": f"{provider.name} · Mock Provider",
                "provider_type": "mock",
                "is_default": True,
                "is_mock": True,
                "last_probe_at": None,
                "last_probe_ok": None,
                "impact_hint": CHAT_MODEL_IMPACT,
                "score": 0,
                "score_max": 30,
            }

        probe_ok = None
        if probe_fn is not None:
            probe_ok = probe_fn(
                provider.provider_type,
                provider.base_url,
                provider.get_api_key(),
                default_chat.model_name,
                "chat",
            )

        if probe_ok is None:
            # 未做真实探针，仅根据配置存在判定
            return {
                "status": "ok",
                "label": default_chat.model_name,
                "sublabel": f"{provider.name} · 已配置",
                "provider_type": provider.provider_type,
                "is_default": True,
                "is_mock": False,
                "last_probe_at": None,
                "last_probe_ok": None,
                "impact_hint": CHAT_MODEL_IMPACT,
                "score": 30,
                "score_max": 30,
            }

        if probe_ok:
            return {
                "status": "ok",
                "label": default_chat.model_name,
                "sublabel": f"{provider.name} · 真实可用",
                "provider_type": provider.provider_type,
                "is_default": True,
                "is_mock": False,
                "last_probe_at": timezone.now().isoformat(),
                "last_probe_ok": True,
                "impact_hint": CHAT_MODEL_IMPACT,
                "score": 30,
                "score_max": 30,
            }

        return {
            "status": "warning",
            "label": default_chat.model_name,
            "sublabel": f"{provider.name} · 探针失败",
            "provider_type": provider.provider_type,
            "is_default": True,
            "is_mock": False,
            "last_probe_at": timezone.now().isoformat(),
            "last_probe_ok": False,
            "impact_hint": CHAT_MODEL_IMPACT,
            "score": 15,
            "score_max": 30,
        }

    def _compute_embedding_model_status(self, probe_fn: Optional[Callable]) -> dict:
        """计算 Embedding 模型状态。"""
        default_embedding = EmbeddingConfig.objects.filter(
            is_default=True, is_active=True
        ).first()

        if not default_embedding:
            return {
                "status": "error",
                "label": "未配置",
                "sublabel": "",
                "provider_type": None,
                "is_default": False,
                "last_probe_at": None,
                "last_probe_ok": None,
                "impact_hint": EMBEDDING_MODEL_IMPACT,
                "score": 0,
                "score_max": 20,
            }

        probe_ok = None
        if probe_fn is not None:
            probe_ok = probe_fn(
                default_embedding.provider,
                default_embedding.base_url,
                default_embedding.get_api_key(),
                default_embedding.model_name,
                "embedding",
            )

        if probe_ok is None:
            return {
                "status": "ok",
                "label": default_embedding.model_name,
                "sublabel": f"{default_embedding.name} · 已配置",
                "provider_type": default_embedding.provider,
                "is_default": True,
                "last_probe_at": None,
                "last_probe_ok": None,
                "impact_hint": EMBEDDING_MODEL_IMPACT,
                "score": 20,
                "score_max": 20,
            }

        if probe_ok:
            return {
                "status": "ok",
                "label": default_embedding.model_name,
                "sublabel": f"{default_embedding.name} · 真实可用",
                "provider_type": default_embedding.provider,
                "is_default": True,
                "last_probe_at": timezone.now().isoformat(),
                "last_probe_ok": True,
                "impact_hint": EMBEDDING_MODEL_IMPACT,
                "score": 20,
                "score_max": 20,
            }

        return {
            "status": "warning",
            "label": default_embedding.model_name,
            "sublabel": f"{default_embedding.name} · 探针失败",
            "provider_type": default_embedding.provider,
            "is_default": True,
            "last_probe_at": timezone.now().isoformat(),
            "last_probe_ok": False,
            "impact_hint": EMBEDDING_MODEL_IMPACT,
            "score": 10,
            "score_max": 20,
        }

    def _compute_rag_status(self, embedding_status: dict) -> dict:
        """计算 RAG 状态。"""
        rag = RagSettings.get_singleton()
        retrieval_mode = rag.retrieval_mode

        has_embedding = embedding_status["status"] in ("ok", "warning")

        if retrieval_mode == "postgres_fulltext":
            return {
                "status": "ok" if has_embedding else "warning",
                "label": "PostgreSQL 全文检索",
                "sublabel": "已启用" if has_embedding else "已启用但无可用 embedding",
                "retrieval_mode": retrieval_mode,
                "impact_hint": RAG_SEARCH_IMPACT,
                "score": 20 if has_embedding else 10,
                "score_max": 20,
            }

        # vector / hybrid
        if has_embedding:
            return {
                "status": "ok",
                "label": {"vector": "向量检索", "hybrid": "混合检索"}.get(retrieval_mode, retrieval_mode),
                "sublabel": "已启用",
                "retrieval_mode": retrieval_mode,
                "impact_hint": RAG_SEARCH_IMPACT,
                "score": 20,
                "score_max": 20,
            }

        return {
            "status": "warning",
            "label": {"vector": "向量检索", "hybrid": "混合检索"}.get(retrieval_mode, retrieval_mode),
            "sublabel": "已启用但无可用 embedding",
            "retrieval_mode": retrieval_mode,
            "impact_hint": RAG_SEARCH_IMPACT,
            "score": 10,
            "score_max": 20,
        }

    def _compute_storage_status(self, probe_fn: Optional[Callable]) -> dict:
        """计算文件存储状态。"""
        storage = StorageConfig.objects.filter(is_default=True).first()

        if not storage:
            return {
                "status": "error",
                "label": "未配置",
                "sublabel": "",
                "last_probe_at": None,
                "last_probe_ok": None,
                "impact_hint": FILE_STORAGE_IMPACT,
                "score": 0,
                "score_max": 20,
            }

        if probe_fn is not None:
            probe_ok = self._probe_minio(storage)
            if probe_ok:
                return {
                    "status": "ok",
                    "label": "MinIO",
                    "sublabel": storage.public_endpoint or storage.endpoint,
                    "last_probe_at": timezone.now().isoformat(),
                    "last_probe_ok": True,
                    "impact_hint": FILE_STORAGE_IMPACT,
                    "score": 20,
                    "score_max": 20,
                }
            return {
                "status": "warning",
                "label": "MinIO",
                "sublabel": f"{storage.endpoint} · 探针失败",
                "last_probe_at": timezone.now().isoformat(),
                "last_probe_ok": False,
                "impact_hint": FILE_STORAGE_IMPACT,
                "score": 10,
                "score_max": 20,
            }

        return {
            "status": "ok",
            "label": "MinIO",
            "sublabel": storage.public_endpoint or storage.endpoint,
            "last_probe_at": None,
            "last_probe_ok": None,
            "impact_hint": FILE_STORAGE_IMPACT,
            "score": 20,
            "score_max": 20,
        }

    def _probe_minio(self, storage) -> bool:
        """探测 MinIO 连通性。"""
        try:
            from minio import Minio

            client = Minio(
                storage.endpoint,
                access_key=storage.get_access_key(),
                secret_key=storage.get_secret_key(),
                secure=storage.secure,
            )
            client.bucket_exists(storage.bucket)
            return True
        except Exception:
            return False

    def _compute_security_audit_status(self) -> dict:
        """计算安全审计状态。"""
        setting = SystemSetting.get_singleton()
        enabled = setting.enable_audit_log

        return {
            "status": "ok" if enabled else "warning",
            "label": "已启用" if enabled else "审计日志未启用",
            "audit_log_enabled": enabled,
            "impact_hint": SECURITY_AUDIT_IMPACT,
            "score": 10 if enabled else 5,
            "score_max": 10,
        }

    def _compute_mock_warning(self, chat_status: dict, embedding_status: dict) -> dict | None:
        """检测默认模型是否指向 Mock Provider。"""
        if chat_status.get("is_mock"):
            return {
                "show": True,
                "level": "chat",
                "message": "当前默认 Chat 模型指向 Mock Provider，LLM 调用将返回空结果",
                "model_config_id": None,
                "provider_id": None,
            }
        return None
```

- [ ] **Step 4: 运行测试验证通过**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/system_config/tests/test_health_service.py::TestHealthScoring::test_total_score_100_when_all_ok -v`
Expected: PASS

- [ ] **Step 5: 写第二个测试 - Chat 模型 mock 返回 mock 状态**

```python
# 追加到 backend/apps/system_config/tests/test_health_service.py

    def test_chat_model_mock_returns_mock_status(self, db_setup_chat_mock):
        """默认 chat 指向 mock → status='mock', mock_warning.show=true。"""
        service = HealthCheckService()
        status = service.get_health_status(use_cache=False)

        assert status["chat_model"]["status"] == "mock"
        assert status["chat_model"]["is_mock"] is True
        assert status["mock_warning"] is not None
        assert status["mock_warning"]["show"] is True
        assert status["mock_warning"]["level"] == "chat"
        assert status["chat_model"]["score"] == 0

    @pytest.fixture
    def db_setup_chat_mock(self):
        """Chat 模型指向 mock provider。"""
        from apps.generation.constants import ProviderType

        provider = ModelProvider.objects.create(
            key="mock",
            name="Mock Provider",
            provider_type=ProviderType.MOCK,
            base_url="",
            is_active=True,
        )
        ModelConfig.objects.create(
            provider=provider,
            model_name="mock-chat",
            model_type="chat",
            is_default=True,
            is_active=True,
        )
        yield
```

- [ ] **Step 6: 运行测试验证通过**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/system_config/tests/test_health_service.py::TestHealthScoring::test_chat_model_mock_returns_mock_status -v`
Expected: PASS

- [ ] **Step 7: 写第三个测试 - Chat 模型未配置**

```python
# 追加到 backend/apps/system_config/tests/test_health_service.py

    def test_chat_model_not_configured_returns_error(self):
        """无默认 chat → status='error', score=0。"""
        service = HealthCheckService()
        status = service.get_health_status(use_cache=False)

        assert status["chat_model"]["status"] == "error"
        assert status["chat_model"]["score"] == 0
        assert status["chat_model"]["label"] == "未配置"
```

- [ ] **Step 8: 运行测试验证通过**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/system_config/tests/test_health_service.py::TestHealthScoring::test_chat_model_not_configured_returns_error -v`
Expected: PASS

- [ ] **Step 9: 写第四个测试 - RAG 启用但无 embedding**

```python
# 追加到 backend/apps/system_config/tests/test_health_service.py

    def test_rag_enabled_but_no_embedding_returns_warning(self, db_setup_rag_no_embedding):
        """retrieval_mode='hybrid' 但无 embedding 配置 → score=10。"""
        service = HealthCheckService()
        status = service.get_health_status(use_cache=False)

        assert status["rag_search"]["status"] == "warning"
        assert status["rag_search"]["score"] == 10
        assert "无可用 embedding" in status["rag_search"]["sublabel"]

    @pytest.fixture
    def db_setup_rag_no_embedding(self):
        """RAG 启用但无 embedding 配置。"""
        rag = RagSettings.get_singleton()
        rag.retrieval_mode = "hybrid"
        rag.enable_vector_search = True
        rag.embedding_config = None
        rag.save()
        yield
```

- [ ] **Step 10: 运行测试验证通过**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/system_config/tests/test_health_service.py::TestHealthScoring::test_rag_enabled_but_no_embedding_returns_warning -v`
Expected: PASS

- [ ] **Step 11: 写第五个测试 - 缓存命中**

```python
# 追加到 backend/apps/system_config/tests/test_health_service.py

    def test_health_status_cached_in_redis(self, db_setup_all_ok):
        """30 秒内重复调用不重探（缓存命中）。"""
        from django.core.cache import cache

        cache.clear()

        service = HealthCheckService()
        call_count = [0]

        def counting_probe(*args, **kwargs):
            call_count[0] += 1
            return True

        # 第一次调用：写缓存
        service.get_health_status(use_cache=True, probe_fn=counting_probe)
        # 第二次调用：不传 probe_fn，应命中缓存，不调用 probe
        status = service.get_health_status(use_cache=True)

        # 缓存命中时不会调用 probe_fn
        assert call_count[0] == 1
        assert status["total_score"] == 100
```

- [ ] **Step 12: 运行测试验证通过**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/system_config/tests/test_health_service.py::TestHealthScoring::test_health_status_cached_in_redis -v`
Expected: PASS

- [ ] **Step 13: 提交**

```bash
cd /home/newaibook/ai-bid-generator
git add backend/apps/system_config/services/health_service.py backend/apps/system_config/tests/test_health_service.py
git commit -m "feat(settings): 新增 HealthCheckService 评分与缓存

- 5 项状态评分（Chat 30/Embedding 20/RAG 20/Storage 20/Security 10）
- Mock 检测与告警生成
- Redis 30 秒缓存，diagnose 接口绕过缓存
- 支持 probe_fn 注入，便于测试"
```

---

## Task 3: 创建健康检查 API 端点

**Files:**
- Create: `backend/apps/system_config/views/__init__.py`
- Create: `backend/apps/system_config/views/health_views.py`
- Modify: `backend/apps/system_config/urls.py`
- Test: `backend/apps/system_config/tests/test_health_views.py`

**Interfaces:**
- Consumes: `HealthCheckService`（Task 2）、`ProbeService`（Task 1）
- Produces: 4 个端点
  - `GET /api/settings/health/` → 健康状态聚合
  - `POST /api/settings/health/diagnose/` → 一键诊断（走真实探针）
  - `POST /api/settings/test-connection/` → 测试连接（独立探针）
  - `POST /api/settings/setup-wizard/`（在 Task 4 实现）

- [ ] **Step 1: 写第一个失败测试 - GET /api/settings/health/ 返回完整结构**

```python
# backend/apps/system_config/tests/test_health_views.py
"""健康检查 API 测试。"""

import pytest

from apps.accounts.models import User
from apps.accounts.permissions import initialize_builtin_roles
from apps.projects.models import ProjectRole
from rest_framework.test import APIClient


@pytest.mark.django_db
class TestHealthAPI:
    def setup_method(self):
        """初始化测试用户。"""
        self.user = User.objects.create_user(
            username="admin",
            password="admin123",
            email="admin@test.com",
            is_superuser=True,
            is_staff=True,
        )
        initialize_builtin_roles(None)  # 系统级角色
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_get_health_returns_full_structure(self):
        """GET /api/settings/health/ 返回完整结构。"""
        resp = self.client.get("/api/settings/health/")

        assert resp.status_code == 200
        data = resp.json()
        assert "chat_model" in data
        assert "embedding_model" in data
        assert "rag_search" in data
        assert "file_storage" in data
        assert "security_audit" in data
        assert "mock_warning" in data
        assert "total_score" in data
        assert "total_max" in data
        assert "pending_count" in data
        assert data["total_max"] == 100

    def test_get_health_returns_error_when_no_config(self):
        """未配置任何项时返回 error 状态。"""
        resp = self.client.get("/api/settings/health/")

        assert resp.status_code == 200
        data = resp.json()
        assert data["chat_model"]["status"] == "error"
        assert data["embedding_model"]["status"] == "error"
        assert data["total_score"] < 100
```

- [ ] **Step 2: 运行测试验证失败**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/system_config/tests/test_health_views.py::TestHealthAPI::test_get_health_returns_full_structure -v`
Expected: FAIL with 404 or类似（端点未注册）

- [ ] **Step 3: 创建 views 包 __init__.py 与 health_views.py**

```python
# backend/apps/system_config/views/__init__.py
"""系统配置视图包。"""

from .health_views import (
    HealthCheckView,
    HealthDiagnoseView,
    TestConnectionView,
)

__all__ = [
    "HealthCheckView",
    "HealthDiagnoseView",
    "TestConnectionView",
]
```

```python
# backend/apps/system_config/views/health_views.py
"""健康检查相关视图。"""

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import MustChangePasswordPermission, RequirePermission
from apps.system_config.services.health_service import HealthCheckService
from apps.system_config.services.probe_service import ProbeService


class HealthCheckView(APIView):
    """获取系统配置健康状态。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "system_settings.manage"

    def get(self, request):
        """返回 5 项配置状态 + 总分 + Mock 告警。"""
        service = HealthCheckService()
        result = service.get_health_status(use_cache=True)
        return Response(result)


class HealthDiagnoseView(APIView):
    """一键诊断：对所有已配置项做真实探针。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "system_settings.manage"

    def post(self, request):
        """触发完整探针，不走缓存。"""
        service = HealthCheckService()
        result = service.diagnose()
        return Response(result)


class TestConnectionView(APIView):
    """测试连接：对单个 provider 做真实探针。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "system_settings.manage"

    def post(self, request):
        """测试单个 provider + key + model 是否可用。

        Request body:
            provider_type: deepseek/bailian/openai（mock 拒绝）
            base_url: Provider base URL
            api_key: API key
            model_name: 模型名
            test_kind: chat / embedding
        """
        provider_type = request.data.get("provider_type")
        base_url = request.data.get("base_url", "")
        api_key = request.data.get("api_key", "")
        model_name = request.data.get("model_name", "")
        test_kind = request.data.get("test_kind", "chat")

        if not provider_type:
            return Response(
                {"detail": "provider_type 必填"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        service = ProbeService()
        if test_kind == "chat":
            result = service.probe_chat(provider_type, base_url, api_key, model_name)
        else:
            result = service.probe_embedding(provider_type, base_url, api_key, model_name)

        return Response({
            "ok": result.ok,
            "latency_ms": result.latency_ms,
            "detail": result.detail,
            "error_code": result.error_code,
            "models_sample": result.models_sample,
        })
```

- [ ] **Step 4: 修改 urls.py 注册新端点**

先读现有 urls.py：

```bash
cd backend && cat apps/system_config/urls.py
```

然后在文件末尾追加：

```python
# backend/apps/system_config/urls.py 末尾追加
from apps.system_config.views.health_views import (
    HealthCheckView,
    HealthDiagnoseView,
    TestConnectionView,
)

urlpatterns += [
    path("health/", HealthCheckView.as_view(), name="settings-health"),
    path("health/diagnose/", HealthDiagnoseView.as_view(), name="settings-health-diagnose"),
    path("test-connection/", TestConnectionView.as_view(), name="settings-test-connection"),
]
```

- [ ] **Step 5: 运行测试验证通过**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/system_config/tests/test_health_views.py::TestHealthAPI::test_get_health_returns_full_structure -v`
Expected: PASS

- [ ] **Step 6: 写第二个测试 - 测试连接端点 DeepSeek 成功**

```python
# 追加到 backend/apps/system_config/tests/test_health_views.py

import responses


@pytest.mark.django_db
class TestTestConnectionAPI:
    def setup_method(self):
        self.user = User.objects.create_user(
            username="admin",
            password="admin123",
            email="admin@test.com",
            is_superuser=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    @responses.activate
    def test_deepseek_test_connection_success(self):
        """测试连接 DeepSeek 成功。"""
        responses.add(
            responses.GET,
            "https://api.deepseek.com/models",
            json={"data": [{"id": "deepseek-chat"}]},
            status=200,
        )

        resp = self.client.post(
            "/api/settings/test-connection/",
            {
                "provider_type": "deepseek",
                "base_url": "https://api.deepseek.com",
                "api_key": "sk-test",
                "model_name": "deepseek-chat",
                "test_kind": "chat",
            },
            format="json",
        )

        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        assert data["error_code"] is None
        assert "deepseek-chat" in (data["models_sample"] or [])

    def test_mock_test_connection_rejected(self):
        """测试连接 Mock provider 直接拒绝。"""
        resp = self.client.post(
            "/api/settings/test-connection/",
            {
                "provider_type": "mock",
                "base_url": "",
                "api_key": "",
                "model_name": "",
                "test_kind": "chat",
            },
            format="json",
        )

        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is False
        assert data["error_code"] == "mock_not_allowed"
```

- [ ] **Step 7: 运行测试验证通过**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/system_config/tests/test_health_views.py::TestTestConnectionAPI -v`
Expected: PASS

- [ ] **Step 8: 写第三个测试 - diagnose 端点绕过缓存**

```python
# 追加到 backend/apps/system_config/tests/test_health_views.py

@pytest.mark.django_db
class TestDiagnoseAPI:
    def setup_method(self):
        self.user = User.objects.create_user(
            username="admin",
            password="admin123",
            email="admin@test.com",
            is_superuser=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    @responses.activate
    def test_diagnose_calls_real_probe(self):
        """POST /health/diagnose/ 触发真实探针。"""
        from apps.generation.models import ModelProvider, ModelConfig
        from apps.generation.constants import ProviderType

        provider = ModelProvider.objects.create(
            key="deepseek",
            name="DeepSeek",
            provider_type=ProviderType.DEEPSEEK,
            base_url="https://api.deepseek.com",
            is_active=True,
        )
        provider.set_api_key("sk-test")
        provider.save()
        ModelConfig.objects.create(
            provider=provider,
            model_name="deepseek-chat",
            model_type="chat",
            is_default=True,
            is_active=True,
        )

        responses.add(
            responses.GET,
            "https://api.deepseek.com/models",
            json={"data": [{"id": "deepseek-chat"}]},
            status=200,
        )

        # 先 GET /health/ 写缓存
        self.client.get("/api/settings/health/")
        # POST /health/diagnose/ 应绕过缓存
        resp = self.client.post("/api/settings/health/diagnose/")

        assert resp.status_code == 200
        data = resp.json()
        assert data["chat_model"]["last_probe_ok"] is True
        assert data["chat_model"]["last_probe_at"] is not None
```

- [ ] **Step 9: 运行测试验证通过**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/system_config/tests/test_health_views.py::TestDiagnoseAPI -v`
Expected: PASS

- [ ] **Step 10: 提交**

```bash
cd /home/newaibook/ai-bid-generator
git add backend/apps/system_config/views/ backend/apps/system_config/urls.py backend/apps/system_config/tests/test_health_views.py
git commit -m "feat(settings): 新增健康检查与测试连接 API 端点

- GET /api/settings/health/ 返回聚合状态
- POST /api/settings/health/diagnose/ 一键诊断
- POST /api/settings/test-connection/ 单 provider 测试连接"
```

---

## Task 4: 创建向导服务与端点

**Files:**
- Create: `backend/apps/system_config/services/wizard_service.py`
- Modify: `backend/apps/system_config/views/health_views.py`（新增 SetupWizardView）
- Modify: `backend/apps/system_config/views/__init__.py`（导出 SetupWizardView）
- Modify: `backend/apps/system_config/urls.py`（新增路由）
- Test: `backend/apps/system_config/tests/test_setup_wizard.py`

**Interfaces:**
- Consumes: `HealthCheckService`（返回最新状态）
- Produces: `WizardService.apply_wizard(steps: dict) -> dict`，返回最新 health 状态；`SetupWizardView` 端点 `POST /api/settings/setup-wizard/`

- [ ] **Step 1: 写第一个失败测试 - 跳过步骤不写数据库**

```python
# backend/apps/system_config/tests/test_setup_wizard.py
"""配置向导端点测试。"""

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.generation.models import ModelProvider, ModelConfig


@pytest.mark.django_db
class TestSetupWizard:
    def setup_method(self):
        self.user = User.objects.create_user(
            username="admin",
            password="admin123",
            email="admin@test.com",
            is_superuser=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_skip_step_does_not_modify_db(self):
        """chat_model 步骤缺失 → 不创建 Provider，原默认保持。"""
        # 原状态：无任何配置
        resp = self.client.post(
            "/api/settings/setup-wizard/",
            {"steps": {"chat_model": None, "embedding_model": None, "rag_search": None, "file_storage": None}},
            format="json",
        )

        assert resp.status_code == 200
        assert not ModelProvider.objects.exists()
        assert not ModelConfig.objects.exists()

    def test_chat_step_creates_provider_and_sets_default(self):
        """Chat 步骤创建 Provider + ModelConfig + 设为默认。"""
        resp = self.client.post(
            "/api/settings/setup-wizard/",
            {
                "steps": {
                    "chat_model": {
                        "provider_type": "deepseek",
                        "base_url": "https://api.deepseek.com",
                        "api_key": "sk-test",
                        "model_name": "deepseek-chat",
                    },
                    "embedding_model": None,
                    "rag_search": None,
                    "file_storage": None,
                }
            },
            format="json",
        )

        assert resp.status_code == 200
        provider = ModelProvider.objects.get(provider_type="deepseek")
        assert provider.base_url == "https://api.deepseek.com"
        config = ModelConfig.objects.get(provider=provider)
        assert config.model_name == "deepseek-chat"
        assert config.is_default is True
        assert config.model_type == "chat"

    def test_mock_provider_rejected_in_wizard(self):
        """provider_type='mock' → 400 + error_code='mock_not_allowed'。"""
        resp = self.client.post(
            "/api/settings/setup-wizard/",
            {
                "steps": {
                    "chat_model": {
                        "provider_type": "mock",
                        "base_url": "",
                        "api_key": "",
                        "model_name": "",
                    },
                    "embedding_model": None,
                    "rag_search": None,
                    "file_storage": None,
                }
            },
            format="json",
        )

        assert resp.status_code == 400
        data = resp.json()
        assert data["error_code"] == "mock_not_allowed"
```

- [ ] **Step 2: 运行测试验证失败**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/system_config/tests/test_setup_wizard.py -v`
Expected: FAIL with 404（端点未注册）

- [ ] **Step 3: 创建 WizardService 实现**

```python
# backend/apps/system_config/services/wizard_service.py
"""配置向导服务。

向导 4 步：chat_model / embedding_model / rag_search / file_storage。
每步可跳过（值为 None），跳过的步骤不写数据库。
配置的步骤即设为默认（覆盖原默认指向）。
"""

from apps.generation.constants import ProviderType
from apps.generation.models import ModelProvider, ModelConfig
from apps.system_config.models import (
    EmbeddingConfig,
    RagSettings,
    StorageConfig,
)


MOCK_PROVIDER_TYPES = {ProviderType.MOCK}


class WizardService:
    """配置向导服务。"""

    def apply_wizard(self, steps: dict) -> dict:
        """应用向导配置。

        Args:
            steps: 4 个步骤的数据，None 表示跳过
                {
                    "chat_model": {provider_type, base_url, api_key, model_name} | None,
                    "embedding_model": {provider_type, base_url, api_key, model_name} | None,
                    "rag_search": {retrieval_mode, top_k, embedding_config_id} | None,
                    "file_storage": {endpoint, public_endpoint, access_key, secret_key,
                                    bucket, upload_mode} | None,
                }

        Returns:
            最新 health 状态字典
        """
        chat_data = steps.get("chat_model")
        embedding_data = steps.get("embedding_model")
        rag_data = steps.get("rag_search")
        storage_data = steps.get("file_storage")

        # 校验 mock
        if chat_data and chat_data.get("provider_type") in MOCK_PROVIDER_TYPES:
            return {
                "error_code": "mock_not_allowed",
                "detail": "Mock Provider 不可在向导中配置为默认",
            }
        if embedding_data and embedding_data.get("provider_type") in MOCK_PROVIDER_TYPES:
            return {
                "error_code": "mock_not_allowed",
                "detail": "Mock Provider 不可在向导中配置为默认",
            }

        if chat_data:
            self._apply_chat_model(chat_data)
        if embedding_data:
            self._apply_embedding_model(embedding_data)
        if rag_data:
            self._apply_rag_settings(rag_data)
        if storage_data:
            self._apply_file_storage(storage_data)

        # 清缓存，返回最新状态
        from django.core.cache import cache
        cache.delete("settings:health:status")

        from apps.system_config.services.health_service import HealthCheckService
        return HealthCheckService().get_health_status(use_cache=False)

    def _apply_chat_model(self, data: dict) -> None:
        """创建/更新 Chat Provider + ModelConfig + 设为默认。"""
        provider_type = data["provider_type"]
        base_url = data["base_url"]
        api_key = data["api_key"]
        model_name = data["model_name"]

        provider, _ = ModelProvider.objects.update_or_create(
            provider_type=provider_type,
            defaults={
                "key": provider_type,
                "name": provider_type.capitalize(),
                "base_url": base_url,
                "is_active": True,
            },
        )
        if api_key:
            provider.set_api_key(api_key)
            provider.save(update_fields=["api_key_encrypted"])

        # 清除其他默认 chat
        ModelConfig.objects.filter(model_type="chat").update(is_default=False)

        config, _ = ModelConfig.objects.update_or_create(
            provider=provider,
            model_name=model_name,
            model_type="chat",
            defaults={
                "is_default": True,
                "is_active": True,
            },
        )

    def _apply_embedding_model(self, data: dict) -> None:
        """创建/更新 Embedding 配置 + 设为默认。"""
        provider_type = data["provider_type"]
        base_url = data["base_url"]
        api_key = data["api_key"]
        model_name = data["model_name"]

        # 清除其他默认
        EmbeddingConfig.objects.update(is_default=False)

        config, _ = EmbeddingConfig.objects.update_or_create(
            provider=provider_type,
            model_name=model_name,
            defaults={
                "name": f"{provider_type}-{model_name}",
                "base_url": base_url,
                "is_active": True,
                "is_default": True,
            },
        )
        if api_key:
            config.set_api_key(api_key)
            config.save(update_fields=["encrypted_api_key"])

    def _apply_rag_settings(self, data: dict) -> None:
        """更新 RAG 设置。"""
        rag = RagSettings.get_singleton()
        if "retrieval_mode" in data:
            rag.retrieval_mode = data["retrieval_mode"]
        if "top_k" in data:
            rag.top_k = data["top_k"]
        if "embedding_config_id" in data and data["embedding_config_id"]:
            rag.embedding_config_id = data["embedding_config_id"]
        rag.save()

    def _apply_file_storage(self, data: dict) -> None:
        """创建/更新 StorageConfig + 设为默认。"""
        # 清除其他默认
        StorageConfig.objects.update(is_default=False)

        config, _ = StorageConfig.objects.update_or_create(
            bucket=data["bucket"],
            defaults={
                "name": f"MinIO-{data['bucket']}",
                "provider": "minio",
                "endpoint": data["endpoint"],
                "public_endpoint": data.get("public_endpoint", ""),
                "is_default": True,
            },
        )
        if data.get("access_key"):
            config.set_access_key(data["access_key"])
        if data.get("secret_key"):
            config.set_secret_key(data["secret_key"])
        config.save()
```

- [ ] **Step 4: 在 health_views.py 添加 SetupWizardView**

```python
# 追加到 backend/apps/system_config/views/health_views.py 末尾

from apps.system_config.services.wizard_service import WizardService


class SetupWizardView(APIView):
    """配置向导端点。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "system_settings.manage"

    def post(self, request):
        """应用向导配置。

        Request body:
            steps: {
                chat_model: {...} | null,
                embedding_model: {...} | null,
                rag_search: {...} | null,
                file_storage: {...} | null,
            }
        """
        steps = request.data.get("steps", {})

        service = WizardService()
        result = service.apply_wizard(steps)

        # 检查是否返回了错误
        if "error_code" in result:
            return Response(result, status=status.HTTP_400_BAD_REQUEST)

        return Response(result)
```

- [ ] **Step 5: 在 views/__init__.py 导出 SetupWizardView**

```python
# backend/apps/system_config/views/__init__.py
"""系统配置视图包。"""

from .health_views import (
    HealthCheckView,
    HealthDiagnoseView,
    TestConnectionView,
    SetupWizardView,
)

__all__ = [
    "HealthCheckView",
    "HealthDiagnoseView",
    "TestConnectionView",
    "SetupWizardView",
]
```

- [ ] **Step 6: 在 urls.py 注册向导端点**

```python
# 在 backend/apps/system_config/urls.py 中追加
from apps.system_config.views.health_views import (
    HealthCheckView,
    HealthDiagnoseView,
    TestConnectionView,
    SetupWizardView,
)

urlpatterns += [
    # ... 之前的 health 端点
    path("setup-wizard/", SetupWizardView.as_view(), name="settings-setup-wizard"),
]
```

- [ ] **Step 7: 运行测试验证通过**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/system_config/tests/test_setup_wizard.py -v`
Expected: PASS（所有 3 个测试）

- [ ] **Step 8: 写第四个测试 - 部分向导只配置提供的步骤**

```python
# 追加到 backend/apps/system_config/tests/test_setup_wizard.py

    def test_partial_wizard_only_configures_provided_steps(self):
        """只提供 chat_model + file_storage，其他两个保持原状。"""
        # 先创建原 embedding 配置
        from apps.system_config.models import EmbeddingConfig, RagSettings
        original_embedding = EmbeddingConfig.objects.create(
            name="Original",
            provider="bailian",
            model_name="text-embedding-v3",
            base_url="https://dashscope.aliyuncs.com",
            is_active=True,
            is_default=True,
        )
        rag = RagSettings.get_singleton()
        rag.retrieval_mode = "hybrid"
        rag.embedding_config = original_embedding
        rag.save()

        resp = self.client.post(
            "/api/settings/setup-wizard/",
            {
                "steps": {
                    "chat_model": {
                        "provider_type": "deepseek",
                        "base_url": "https://api.deepseek.com",
                        "api_key": "sk-test",
                        "model_name": "deepseek-chat",
                    },
                    "embedding_model": None,
                    "rag_search": None,
                    "file_storage": {
                        "endpoint": "minio:9000",
                        "public_endpoint": "163.7.6.60:9000",
                        "access_key": "minioadmin",
                        "secret_key": "minioadmin",
                        "bucket": "bid-files",
                        "upload_mode": "backend_proxy",
                    },
                }
            },
            format="json",
        )

        assert resp.status_code == 200
        # 原 embedding 配置保留
        assert EmbeddingConfig.objects.filter(name="Original").exists()
        # Chat 模型已配置
        assert ModelConfig.objects.filter(model_name="deepseek-chat", is_default=True).exists()
        # Storage 已配置
        from apps.system_config.models import StorageConfig
        assert StorageConfig.objects.filter(bucket="bid-files", is_default=True).exists()
```

- [ ] **Step 9: 运行测试验证通过**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/system_config/tests/test_setup_wizard.py::TestSetupWizard::test_partial_wizard_only_configures_provided_steps -v`
Expected: PASS

- [ ] **Step 10: 提交**

```bash
cd /home/newaibook/ai-bid-generator
git add backend/apps/system_config/services/wizard_service.py backend/apps/system_config/views/ backend/apps/system_config/urls.py backend/apps/system_config/tests/test_setup_wizard.py
git commit -m "feat(settings): 新增配置向导端点

- POST /api/settings/setup-wizard/ 4 步可跳过
- 跳过的步骤不写数据库
- 配置的步骤即设为默认
- Mock provider 在向导中被拒绝"
```

---

## Task 5: 后端 Mock 限制 + Provider 编辑放开

**Files:**
- Modify: `backend/apps/generation/views/model_views.py`（`ModelConfigSetDefaultView` 新增 Mock 校验）
- Modify: `backend/apps/generation/serializers.py`（`ModelProviderUpdateSerializer` 放开 provider_type）
- Test: `backend/apps/system_config/tests/test_provider_edit.py`

**Interfaces:**
- Consumes: 无
- Produces: `ModelConfigSetDefaultView` 拒绝 mock 默认；`ModelProviderUpdateSerializer` 允许编辑 provider_type 但切换前需清空 ModelConfig

- [ ] **Step 1: 写第一个失败测试 - 设置 mock 为默认返回 400**

```python
# backend/apps/system_config/tests/test_provider_edit.py
"""Provider 编辑与 Mock 限制测试。"""

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.generation.models import ModelProvider, ModelConfig
from apps.generation.constants import ProviderType


@pytest.mark.django_db
class TestMockDefaultRejection:
    def setup_method(self):
        self.user = User.objects.create_user(
            username="admin",
            password="admin123",
            email="admin@test.com",
            is_superuser=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_set_default_mock_returns_400(self):
        """Mock ModelConfig 不可设为默认。"""
        provider = ModelProvider.objects.create(
            key="mock",
            name="Mock",
            provider_type=ProviderType.MOCK,
            is_active=True,
        )
        config = ModelConfig.objects.create(
            provider=provider,
            model_name="mock-chat",
            model_type="chat",
            is_active=True,
        )

        resp = self.client.post(f"/api/generation/model-configs/{config.id}/set-default/")

        assert resp.status_code == 400
        data = resp.json()
        assert data["error_code"] == "mock_not_allowed_as_default"
        # 数据库中仍未设为默认
        config.refresh_from_db()
        assert config.is_default is False
```

- [ ] **Step 2: 运行测试验证失败**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/system_config/tests/test_provider_edit.py::TestMockDefaultRejection::test_set_default_mock_returns_400 -v`
Expected: FAIL with 200（当前未做 Mock 校验）

- [ ] **Step 3: 修改 ModelConfigSetDefaultView 添加 Mock 校验**

读现有 `backend/apps/generation/views/model_views.py:234-261`，在 `post` 方法开头加入 mock 校验：

```python
# 修改 backend/apps/generation/views/model_views.py 中 ModelConfigSetDefaultView.post
class ModelConfigSetDefaultView(APIView):
    """设置默认模型配置。"""

    permission_classes = [IsAuthenticated, RequirePermission]
    required_permission = "system_settings.manage"

    def post(self, request, pk):
        try:
            config = ModelConfig.objects.select_related("provider").get(pk=pk)
        except ModelConfig.DoesNotExist:
            return Response({"message": "配置不存在"}, status=status.HTTP_404_NOT_FOUND)

        # Mock Provider 不可设为默认
        if config.provider.provider_type == ProviderType.MOCK:
            return Response(
                {
                    "detail": "Mock Provider 仅供开发调试，不能设为默认模型",
                    "error_code": "mock_not_allowed_as_default",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 清除同类型的其他默认
        ModelConfig.objects.filter(model_type=config.model_type).update(is_default=False)
        config.is_default = True
        config.is_active = True
        config.save()

        _log_operation(
            request,
            action="model_config.set_default",
            target_type="ModelConfig",
            target_id=config.id,
            summary=f"设置默认模型: {config.display_name or config.model_name}",
            extra={"provider": config.provider.name, "model_name": config.model_name, "model_type": config.model_type},
        )

        return Response(ModelConfigSerializer(config).data)
```

需要在文件顶部导入 `ProviderType`：

```python
# 修改 backend/apps/generation/views/model_views.py 顶部 import
from apps.generation.constants import ProviderType
from apps.generation.models import ModelProvider, ModelConfig
```

- [ ] **Step 4: 运行测试验证通过**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/system_config/tests/test_provider_edit.py::TestMockDefaultRejection::test_set_default_mock_returns_400 -v`
Expected: PASS

- [ ] **Step 5: 写第二个测试 - 切换 provider_type 前需清空 model**

```python
# 追加到 backend/apps/system_config/tests/test_provider_edit.py

@pytest.mark.django_db
class TestProviderTypeEdit:
    def setup_method(self):
        self.user = User.objects.create_user(
            username="admin",
            password="admin123",
            email="admin@test.com",
            is_superuser=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_cannot_change_provider_type_with_existing_models(self):
        """Provider 下有 ModelConfig → 切换 provider_type 失败。"""
        provider = ModelProvider.objects.create(
            key="mock",
            name="Mock",
            provider_type=ProviderType.MOCK,
            is_active=True,
        )
        ModelConfig.objects.create(
            provider=provider,
            model_name="mock-chat",
            model_type="chat",
        )

        resp = self.client.patch(
            f"/api/generation/providers/{provider.id}/",
            {"provider_type": "deepseek"},
            format="json",
        )

        assert resp.status_code == 400
        provider.refresh_from_db()
        assert provider.provider_type == ProviderType.MOCK

    def test_can_change_provider_type_when_no_models(self):
        """Provider 无 ModelConfig → 允许切换。"""
        provider = ModelProvider.objects.create(
            key="mock",
            name="Mock",
            provider_type=ProviderType.MOCK,
            is_active=True,
        )

        resp = self.client.patch(
            f"/api/generation/providers/{provider.id}/",
            {"provider_type": "deepseek"},
            format="json",
        )

        assert resp.status_code == 200
        provider.refresh_from_db()
        assert provider.provider_type == ProviderType.DEEPSEEK
```

- [ ] **Step 6: 运行测试验证失败**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/system_config/tests/test_provider_edit.py::TestProviderTypeEdit -v`
Expected: FAIL（当前 ModelProviderUpdateSerializer 不允许编辑 provider_type，或允许但无校验）

- [ ] **Step 7: 修改 ModelProviderUpdateSerializer 放开 provider_type 编辑 + 校验**

读 `backend/apps/generation/serializers.py` 找到 `ModelProviderUpdateSerializer`，修改为：

```python
# 修改 backend/apps/generation/serializers.py 中 ModelProviderUpdateSerializer
class ModelProviderUpdateSerializer(serializers.ModelSerializer):
    """更新模型供应商。

    允许编辑 provider_type，但切换前需清空其下 ModelConfig。
    """

    provider_type = serializers.ChoiceField(
        choices=ProviderType.CHOICES,
        required=False,
    )
    api_key = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = ModelProvider
        fields = [
            "name",
            "provider_type",
            "base_url",
            "api_key_env",
            "api_key",
            "is_active",
        ]

    def validate(self, attrs):
        """切换 provider_type 前需清空其下 ModelConfig。"""
        if self.instance and "provider_type" in attrs:
            new_type = attrs["provider_type"]
            if new_type != self.instance.provider_type:
                if self.instance.models.exists():
                    raise serializers.ValidationError(
                        {
                            "provider_type": "请先删除该 Provider 下所有 ModelConfig，再切换 provider_type"
                        }
                    )
        return attrs
```

- [ ] **Step 8: 运行测试验证通过**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/system_config/tests/test_provider_edit.py::TestProviderTypeEdit -v`
Expected: PASS

- [ ] **Step 9: 运行全部后端测试确保未破坏现有功能**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/system_config/tests/ apps/generation/tests/ -v --tb=short -q 2>&1 | tail -50`
Expected: 仅有预期的 9 个 pre-existing 失败，新测试全部通过

- [ ] **Step 10: 提交**

```bash
cd /home/newaibook/ai-bid-generator
git add backend/apps/generation/views/model_views.py backend/apps/generation/serializers.py backend/apps/system_config/tests/test_provider_edit.py
git commit -m "feat(settings): Mock 限制 + Provider 编辑放开 provider_type

- ModelConfigSetDefaultView 拒绝 mock 设为默认
- ModelProviderUpdateSerializer 放开 provider_type 编辑
- 切换 provider_type 前需清空其下 ModelConfig"
```

---

## Task 6: 前端 API 封装与类型定义

**Files:**
- Create: `frontend/src/api/settings.ts`

**Interfaces:**
- Consumes: 后端 Task 3、4 的 4 个端点
- Produces: `HealthStatus`、`HealthItem`、`TestConnectionRequest`、`TestConnectionResponse`、`SetupWizardPayload` 类型；`getHealthStatus`、`diagnoseAll`、`testConnection`、`submitWizard` 函数

- [ ] **Step 1: 创建 settings.ts API 封装**

```typescript
// frontend/src/api/settings.ts
import { http } from '@/api/http'

export type HealthStatus = 'ok' | 'warning' | 'error' | 'mock'

export interface HealthItem {
  status: HealthStatus
  label: string
  sublabel?: string
  impact_hint: string
  score: number
  score_max: number
  last_probe_at?: string | null
  last_probe_ok?: boolean | null
  provider_type?: string | null
  is_default?: boolean
  is_mock?: boolean
  retrieval_mode?: string
  audit_log_enabled?: boolean
}

export interface MockWarning {
  show: boolean
  level: 'chat' | 'embedding'
  message: string
  model_config_id?: number | null
  provider_id?: number | null
}

export interface HealthStatusResponse {
  chat_model: HealthItem
  embedding_model: HealthItem
  rag_search: HealthItem
  file_storage: HealthItem
  security_audit: HealthItem
  mock_warning: MockWarning | null
  total_score: number
  total_max: number
  pending_count: number
}

export interface TestConnectionRequest {
  provider_type: string
  base_url: string
  api_key: string
  model_name: string
  test_kind: 'chat' | 'embedding'
}

export interface TestConnectionResponse {
  ok: boolean
  latency_ms: number
  detail: string
  error_code: string | null
  models_sample: string[] | null
}

export interface WizardChatStep {
  provider_type: string
  base_url: string
  api_key: string
  model_name: string
}

export interface WizardEmbeddingStep {
  provider_type: string
  base_url: string
  api_key: string
  model_name: string
}

export interface WizardRagStep {
  retrieval_mode: string
  top_k: number
  embedding_config_id?: number
}

export interface WizardStorageStep {
  endpoint: string
  public_endpoint: string
  access_key: string
  secret_key: string
  bucket: string
  upload_mode: 'backend_proxy' | 'presigned_direct'
}

export interface SetupWizardPayload {
  steps: {
    chat_model: WizardChatStep | null
    embedding_model: WizardEmbeddingStep | null
    rag_search: WizardRagStep | null
    file_storage: WizardStorageStep | null
  }
}

/** 获取系统配置健康状态。 */
export async function getHealthStatus(): Promise<HealthStatusResponse> {
  const res = await http.get<HealthStatusResponse>('/api/settings/health/')
  return res.data
}

/** 一键诊断：对所有已配置项做真实探针。 */
export async function diagnoseAll(): Promise<HealthStatusResponse> {
  const res = await http.post<HealthStatusResponse>('/api/settings/health/diagnose/')
  return res.data
}

/** 测试连接：对单个 provider 做真实探针。 */
export async function testConnection(payload: TestConnectionRequest): Promise<TestConnectionResponse> {
  const res = await http.post<TestConnectionResponse>('/api/settings/test-connection/', payload)
  return res.data
}

/** 提交配置向导。 */
export async function submitWizard(payload: SetupWizardPayload): Promise<HealthStatusResponse> {
  const res = await http.post<HealthStatusResponse>('/api/settings/setup-wizard/', payload)
  return res.data
}
```

- [ ] **Step 2: 验证 TypeScript 编译通过**

Run: `cd frontend && npx vue-tsc --noEmit`
Expected: 无报错

- [ ] **Step 3: 提交**

```bash
cd /home/newaibook/ai-bid-generator
git add frontend/src/api/settings.ts
git commit -m "feat(settings): 前端健康检查与向导 API 封装"
```

---

## Task 7: 前端 HealthHeroBar 与 HealthScorePanel 组件

**Files:**
- Create: `frontend/src/components/settings/HealthHeroBar.vue`
- Create: `frontend/src/components/settings/HealthScorePanel.vue`
- Test: `frontend/src/components/settings/__tests__/HealthHeroBar.spec.ts`
- Test: `frontend/src/components/settings/__tests__/HealthScorePanel.spec.ts`

**Interfaces:**
- Consumes: `HealthStatusResponse`（Task 6）
- Produces: HealthHeroBar 组件 props `{ status: HealthStatusResponse }`，emits `refresh`、`diagnose`、`navigate`；HealthScorePanel 组件 props `{ status: HealthStatusResponse }`，emits `navigate`

- [ ] **Step 1: 写第一个失败测试 - HealthHeroBar 渲染 5 徽章**

```typescript
// frontend/src/components/settings/__tests__/HealthHeroBar.spec.ts
import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import HealthHeroBar from '../HealthHeroBar.vue'
import type { HealthStatusResponse } from '@/api/settings'

const mockStatus: HealthStatusResponse = {
  chat_model: {
    status: 'ok',
    label: 'deepseek-chat',
    sublabel: 'DeepSeek · 真实可用',
    impact_hint: '影响说明 1',
    score: 30,
    score_max: 30,
    provider_type: 'deepseek',
    is_default: true,
    is_mock: false,
    last_probe_at: null,
    last_probe_ok: null,
  },
  embedding_model: {
    status: 'error',
    label: '未配置',
    impact_hint: '影响说明 2',
    score: 0,
    score_max: 20,
  },
  rag_search: {
    status: 'warning',
    label: '混合检索',
    sublabel: '已启用但无可用 embedding',
    impact_hint: '影响说明 3',
    score: 10,
    score_max: 20,
  },
  file_storage: {
    status: 'ok',
    label: 'MinIO',
    sublabel: '163.7.6.60:9000',
    impact_hint: '影响说明 4',
    score: 20,
    score_max: 20,
  },
  security_audit: {
    status: 'ok',
    label: '已启用',
    audit_log_enabled: true,
    impact_hint: '影响说明 5',
    score: 10,
    score_max: 10,
  },
  mock_warning: null,
  total_score: 70,
  total_max: 100,
  pending_count: 2,
}

describe('HealthHeroBar', () => {
  it('renders 5 status badges', () => {
    const wrapper = mount(HealthHeroBar, {
      props: { status: mockStatus },
    })
    const badges = wrapper.findAll('[data-testid="status-badge"]')
    expect(badges).toHaveLength(5)
  })

  it('shows red mock banner when mock_warning.show is true', () => {
    const wrapper = mount(HealthHeroBar, {
      props: {
        status: {
          ...mockStatus,
          mock_warning: {
            show: true,
            level: 'chat',
            message: '当前默认 Chat 模型指向 Mock Provider',
            model_config_id: 1,
            provider_id: 2,
          },
        },
      },
    })
    expect(wrapper.find('[data-testid="mock-warning-banner"]').exists()).toBe(true)
  })

  it('hides mock banner when show is false', () => {
    const wrapper = mount(HealthHeroBar, {
      props: { status: mockStatus },
    })
    expect(wrapper.find('[data-testid="mock-warning-banner"]').exists()).toBe(false)
  })

  it('emits refresh event on button click', async () => {
    const wrapper = mount(HealthHeroBar, {
      props: { status: mockStatus },
    })
    await wrapper.find('[data-testid="refresh-btn"]').trigger('click')
    expect(wrapper.emitted('refresh')).toBeTruthy()
  })

  it('emits diagnose event on button click', async () => {
    const wrapper = mount(HealthHeroBar, {
      props: { status: mockStatus },
    })
    await wrapper.find('[data-testid="diagnose-btn"]').trigger('click')
    expect(wrapper.emitted('diagnose')).toBeTruthy()
  })

  it('emits wizard event on button click', async () => {
    const wrapper = mount(HealthHeroBar, {
      props: { status: mockStatus },
    })
    await wrapper.find('[data-testid="wizard-btn"]').trigger('click')
    expect(wrapper.emitted('wizard')).toBeTruthy()
  })

  it('emits navigate with tab name on badge click', async () => {
    const wrapper = mount(HealthHeroBar, {
      props: { status: mockStatus },
    })
    const badges = wrapper.findAll('[data-testid="status-badge"]')
    await badges[0].trigger('click')  // chat_model
    expect(wrapper.emitted('navigate')).toBeTruthy()
    expect(wrapper.emitted('navigate')![0]).toEqual(['llm'])
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

Run: `cd frontend && npx vitest run src/components/settings/__tests__/HealthHeroBar.spec.ts`
Expected: FAIL（组件未创建）

- [ ] **Step 3: 创建 HealthHeroBar.vue**

```vue
<!-- frontend/src/components/settings/HealthHeroBar.vue -->
<template>
  <div class="hero-bar">
    <div class="hero-topline">
      <div class="hero-title">系统设置</div>
      <div class="hero-actions">
        <el-button type="primary" plain size="small" @click="emit('wizard')">
          <el-icon><MagicStick /></el-icon>
          <span>配置向导</span>
        </el-button>
        <el-button size="small" :loading="loading" @click="emit('refresh')">
          <el-icon><Refresh /></el-icon>
          <span>刷新</span>
        </el-button>
        <el-button size="small" :loading="diagnoseLoading" @click="emit('diagnose')">
          <el-icon><Monitor /></el-icon>
          <span>一键诊断</span>
        </el-button>
      </div>
    </div>

    <el-alert
      v-if="status.mock_warning?.show"
      data-testid="mock-warning-banner"
      :title="status.mock_warning.message"
      type="error"
      :closable="false"
      show-icon
    />

    <div class="badge-row">
      <div
        v-for="item in badges"
        :key="item.key"
        data-testid="status-badge"
        class="badge"
        :class="`is-${item.status}`"
        @click="emit('navigate', item.tab)"
      >
        <el-tooltip placement="bottom" :show-after="300">
          <template #content>
            <div class="tooltip-content">
              <div>{{ item.label }}</div>
              <div v-if="item.sublabel" class="tooltip-sub">{{ item.sublabel }}</div>
              <div class="tooltip-impact">未配置影响：{{ item.impact_hint }}</div>
            </div>
          </template>
          <div class="badge-inner">
            <div class="badge-icon">
              <el-icon v-if="item.status === 'ok'" color="#67C23A"><CircleCheckFilled /></el-icon>
              <el-icon v-else-if="item.status === 'warning'" color="#E6A23C"><WarningFilled /></el-icon>
              <el-icon v-else-if="item.status === 'error'" color="#F56C6C"><CircleCloseFilled /></el-icon>
              <el-icon v-else color="#909399"><QuestionFilled /></el-icon>
            </div>
            <div class="badge-text">
              <div class="badge-title">{{ item.title }}</div>
              <div class="badge-label">{{ item.label }}</div>
            </div>
          </div>
        </el-tooltip>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  Refresh,
  Monitor,
  MagicStick,
  CircleCheckFilled,
  CircleCloseFilled,
  WarningFilled,
  QuestionFilled,
} from '@element-plus/icons-vue'
import type { HealthStatusResponse, HealthItem } from '@/api/settings'

const props = defineProps<{
  status: HealthStatusResponse
  loading?: boolean
  diagnoseLoading?: boolean
}>()

const emit = defineEmits<{
  refresh: []
  diagnose: []
  wizard: []
  navigate: [tab: string]
}>()

const badges = computed(() => [
  { key: 'chat_model', title: 'Chat 模型', tab: 'llm', ...props.status.chat_model },
  { key: 'embedding_model', title: 'Embedding 模型', tab: 'knowledge', ...props.status.embedding_model },
  { key: 'rag_search', title: '向量检索', tab: 'knowledge', ...props.status.rag_search },
  { key: 'file_storage', title: '文件存储', tab: 'storage', ...props.status.file_storage },
  { key: 'security_audit', title: '安全审计', tab: 'security', ...props.status.security_audit },
])
</script>

<style scoped>
.hero-bar {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.hero-topline {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.hero-title {
  font-size: 18px;
  font-weight: 600;
}

.hero-actions {
  display: flex;
  gap: 8px;
}

.badge-row {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;
}

.badge {
  display: flex;
  flex-direction: column;
  padding: 12px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.badge:hover {
  border-color: var(--el-color-primary);
  transform: translateY(-1px);
}

.badge-inner {
  display: flex;
  align-items: center;
  gap: 8px;
}

.badge-icon {
  font-size: 24px;
}

.badge-title {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.badge-label {
  font-size: 14px;
  font-weight: 600;
  margin-top: 2px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.tooltip-content {
  max-width: 280px;
}

.tooltip-sub {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin-top: 4px;
}

.tooltip-impact {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.2);
}
</style>
```

- [ ] **Step 4: 运行测试验证通过**

Run: `cd frontend && npx vitest run src/components/settings/__tests__/HealthHeroBar.spec.ts`
Expected: PASS

- [ ] **Step 5: 写第二个测试 - HealthScorePanel 渲染评分进度条**

```typescript
// frontend/src/components/settings/__tests__/HealthScorePanel.spec.ts
import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import HealthScorePanel from '../HealthScorePanel.vue'
import type { HealthStatusResponse } from '@/api/settings'

const mockStatus: HealthStatusResponse = {
  chat_model: { status: 'ok', label: 'deepseek-chat', impact_hint: '说明 1', score: 30, score_max: 30 },
  embedding_model: { status: 'error', label: '未配置', impact_hint: '说明 2', score: 0, score_max: 20 },
  rag_search: { status: 'warning', label: '混合检索', impact_hint: '说明 3', score: 10, score_max: 20 },
  file_storage: { status: 'ok', label: 'MinIO', impact_hint: '说明 4', score: 20, score_max: 20 },
  security_audit: { status: 'ok', label: '已启用', audit_log_enabled: true, impact_hint: '说明 5', score: 10, score_max: 10 },
  mock_warning: null,
  total_score: 70,
  total_max: 100,
  pending_count: 2,
}

describe('HealthScorePanel', () => {
  it('renders total score', () => {
    const wrapper = mount(HealthScorePanel, {
      props: { status: mockStatus },
    })
    expect(wrapper.text()).toContain('70')
    expect(wrapper.text()).toContain('100')
  })

  it('renders 5 score items', () => {
    const wrapper = mount(HealthScorePanel, {
      props: { status: mockStatus },
    })
    const items = wrapper.findAll('[data-testid="score-item"]')
    expect(items).toHaveLength(5)
  })

  it('renders impact hint for each item', () => {
    const wrapper = mount(HealthScorePanel, {
      props: { status: mockStatus },
    })
    expect(wrapper.text()).toContain('说明 1')
    expect(wrapper.text()).toContain('说明 2')
  })

  it('emits navigate with tab name on item click', async () => {
    const wrapper = mount(HealthScorePanel, {
      props: { status: mockStatus },
    })
    const items = wrapper.findAll('[data-testid="score-item"]')
    await items[0].trigger('click')
    expect(wrapper.emitted('navigate')).toBeTruthy()
    expect(wrapper.emitted('navigate')![0]).toEqual(['llm'])
  })
})
```

- [ ] **Step 6: 运行测试验证失败**

Run: `cd frontend && npx vitest run src/components/settings/__tests__/HealthScorePanel.spec.ts`
Expected: FAIL（组件未创建）

- [ ] **Step 7: 创建 HealthScorePanel.vue**

```vue
<!-- frontend/src/components/settings/HealthScorePanel.vue -->
<template>
  <div class="score-panel">
    <div class="score-header">
      <span class="score-label">配置健康度评分</span>
      <span class="score-value">{{ status.total_score }}/{{ status.total_max }}</span>
      <el-tag v-if="status.pending_count > 0" type="warning" size="small">
        {{ status.pending_count }} 项待修复
      </el-tag>
    </div>
    <div class="score-items">
      <div
        v-for="item in scoreItems"
        :key="item.key"
        data-testid="score-item"
        class="score-item"
        @click="emit('navigate', item.tab)"
      >
        <div class="score-item-header">
          <span class="score-item-title">{{ item.title }}</span>
          <span class="score-item-value">{{ item.score }}/{{ item.score_max }}</span>
        </div>
        <el-progress
          :percentage="item.percentage"
          :status="item.status === 'ok' ? 'success' : item.status === 'warning' ? 'warning' : item.status === 'error' ? 'exception' : undefined"
          :show-text="false"
          :stroke-width="8"
        />
        <div class="score-item-impact">{{ item.impact_hint }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { HealthStatusResponse } from '@/api/settings'

const props = defineProps<{
  status: HealthStatusResponse
}>()

const emit = defineEmits<{
  navigate: [tab: string]
}>()

const scoreItems = computed(() => {
  const items = [
    { key: 'chat_model', title: 'Chat 模型', tab: 'llm', ...props.status.chat_model },
    { key: 'embedding_model', title: 'Embedding 模型', tab: 'knowledge', ...props.status.embedding_model },
    { key: 'rag_search', title: '向量检索', tab: 'knowledge', ...props.status.rag_search },
    { key: 'file_storage', title: '文件存储', tab: 'storage', ...props.status.file_storage },
    { key: 'security_audit', title: '安全审计', tab: 'security', ...props.status.security_audit },
  ]
  return items.map(item => ({
    ...item,
    percentage: item.score_max > 0 ? Math.round((item.score / item.score_max) * 100) : 0,
  }))
})
</script>

<style scoped>
.score-panel {
  padding: 16px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  background: var(--el-fill-color-blank);
}

.score-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.score-label {
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.score-value {
  font-size: 20px;
  font-weight: 600;
}

.score-items {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;
}

.score-item {
  cursor: pointer;
  padding: 8px;
  border-radius: 4px;
  transition: background 0.2s;
}

.score-item:hover {
  background: var(--el-fill-color-light);
}

.score-item-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
}

.score-item-title {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.score-item-value {
  font-size: 12px;
  font-weight: 600;
}

.score-item-impact {
  margin-top: 4px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  line-height: 1.4;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
</style>
```

- [ ] **Step 8: 运行测试验证通过**

Run: `cd frontend && npx vitest run src/components/settings/__tests__/HealthScorePanel.spec.ts`
Expected: PASS

- [ ] **Step 9: 提交**

```bash
cd /home/newaibook/ai-bid-generator
git add frontend/src/components/settings/HealthHeroBar.vue frontend/src/components/settings/HealthScorePanel.vue frontend/src/components/settings/__tests__/
git commit -m "feat(settings): 新增 HealthHeroBar 与 HealthScorePanel 组件"
```

---

## Task 8: 前端 SetupWizardDialog 组件

**Files:**
- Create: `frontend/src/components/settings/SetupWizardDialog.vue`
- Test: `frontend/src/components/settings/__tests__/SetupWizardDialog.spec.ts`

**Interfaces:**
- Consumes: `submitWizard`、`testConnection`（Task 6）
- Produces: SetupWizardDialog 组件 props `{ modelValue: boolean }`，emits `update:modelValue`、`submitted`

- [ ] **Step 1: 写第一个失败测试 - 渲染 4 步骤指示器**

```typescript
// frontend/src/components/settings/__tests__/SetupWizardDialog.spec.ts
import { mount } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'
import SetupWizardDialog from '../SetupWizardDialog.vue'

// Mock API
vi.mock('@/api/settings', () => ({
  submitWizard: vi.fn(),
  testConnection: vi.fn(),
}))

describe('SetupWizardDialog', () => {
  it('renders 4 step indicators', () => {
    const wrapper = mount(SetupWizardDialog, {
      props: { modelValue: true },
      global: {
        stubs: ['el-dialog', 'el-steps', 'el-step', 'el-form', 'el-form-item',
                'el-input', 'el-select', 'el-option', 'el-button', 'el-checkbox',
                'el-radio-group', 'el-radio', 'el-alert'],
      },
    })
    const steps = wrapper.findAll('[data-testid="step-indicator"]')
    expect(steps).toHaveLength(4)
  })

  it('step 1 form shows provider_type dropdown without mock option', async () => {
    const wrapper = mount(SetupWizardDialog, {
      props: { modelValue: true },
      global: {
        stubs: ['el-dialog', 'el-steps', 'el-step', 'el-form', 'el-form-item',
                'el-input', 'el-select', 'el-option', 'el-button', 'el-checkbox',
                'el-radio-group', 'el-radio', 'el-alert'],
      },
    })
    // 等待组件挂载
    await wrapper.vm.$nextTick()
    const select = wrapper.find('[data-testid="provider-type-select"]')
    expect(select.exists()).toBe(true)
    // 验证 mock 选项不存在
    const options = select.findAll('option')
    options.forEach(o => {
      expect(o.text().toLowerCase()).not.toContain('mock')
    })
  })

  it('skip button does not submit current step data', async () => {
    const { submitWizard } = await import('@/api/settings')
    const wrapper = mount(SetupWizardDialog, {
      props: { modelValue: true },
      global: {
        stubs: ['el-dialog', 'el-steps', 'el-step', 'el-form', 'el-form-item',
                'el-input', 'el-select', 'el-option', 'el-button', 'el-checkbox',
                'el-radio-group', 'el-radio', 'el-alert'],
      },
    })
    await wrapper.vm.$nextTick()
    const skipBtn = wrapper.find('[data-testid="skip-btn"]')
    await skipBtn.trigger('click')
    // 跳过应进入下一步而非提交
    expect(submitWizard).not.toHaveBeenCalled()
  })

  it('next button advances to next step', async () => {
    const wrapper = mount(SetupWizardDialog, {
      props: { modelValue: true },
      global: {
        stubs: ['el-dialog', 'el-steps', 'el-step', 'el-form', 'el-form-item',
                'el-input', 'el-select', 'el-option', 'el-button', 'el-checkbox',
                'el-radio-group', 'el-radio', 'el-alert'],
      },
    })
    await wrapper.vm.$nextTick()
    const nextBtn = wrapper.find('[data-testid="next-btn"]')
    await nextBtn.trigger('click')
    // 应进入下一步（步骤指示器激活项变化）
    expect(wrapper.find('[data-testid="step-indicator"].is-active').text()).toContain('Embedding')
  })

  it('emits update:modelValue false on cancel', async () => {
    const wrapper = mount(SetupWizardDialog, {
      props: { modelValue: true },
      global: {
        stubs: ['el-dialog', 'el-steps', 'el-step', 'el-form', 'el-form-item',
                'el-input', 'el-select', 'el-option', 'el-button', 'el-checkbox',
                'el-radio-group', 'el-radio', 'el-alert'],
      },
    })
    await wrapper.vm.$nextTick()
    const cancelBtn = wrapper.find('[data-testid="cancel-btn"]')
    await cancelBtn.trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')![0]).toEqual([false])
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

Run: `cd frontend && npx vitest run src/components/settings/__tests__/SetupWizardDialog.spec.ts`
Expected: FAIL（组件未创建）

- [ ] **Step 3: 创建 SetupWizardDialog.vue**

```vue
<!-- frontend/src/components/settings/SetupWizardDialog.vue -->
<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    title="配置向导"
    width="70%"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
  >
    <div class="wizard-body">
      <div class="wizard-steps">
        <div
          v-for="(step, idx) in steps"
          :key="step.key"
          data-testid="step-indicator"
          class="step"
          :class="{
            'is-active': currentStep === idx,
            'is-done': currentStep > idx,
            'is-skipped': skippedSteps.has(step.key),
          }"
        >
          <div class="step-index">{{ idx + 1 }}</div>
          <div class="step-title">{{ step.title }}</div>
        </div>
      </div>

      <div class="step-content">
        <!-- Step 1: Chat 模型 -->
        <div v-if="currentStep === 0">
          <el-alert
            type="info"
            :closable="false"
            show-icon
            title="为系统配置默认 Chat 大模型，用于大纲生成、条款抽取等核心 LLM 调用"
          />
          <el-form label-width="120px" class="step-form">
            <el-form-item label="Provider 类型" required>
              <el-select
                v-model="chatForm.provider_type"
                data-testid="provider-type-select"
                placeholder="选择 Provider"
              >
                <el-option label="DeepSeek" value="deepseek" />
                <el-option label="百炼" value="bailian" />
                <el-option label="OpenAI" value="openai" />
                <!-- 无 mock 选项 -->
              </el-select>
            </el-form-item>
            <el-form-item label="Base URL" required>
              <el-input v-model="chatForm.base_url" placeholder="https://api.deepseek.com" />
            </el-form-item>
            <el-form-item label="API Key" required>
              <el-input v-model="chatForm.api_key" type="password" show-password />
            </el-form-item>
            <el-form-item label="模型名" required>
              <el-input v-model="chatForm.model_name" placeholder="deepseek-chat" />
            </el-form-item>
            <el-form-item>
              <el-button :loading="testing" @click="handleTestChat">测试连接</el-button>
              <el-checkbox v-model="chatForm.set_default" disabled>设为默认 Chat 模型</el-checkbox>
            </el-form-item>
            <el-alert v-if="testResult" :type="testResult.ok ? 'success' : 'error'" :title="testResult.detail" :closable="false" show-icon />
          </el-form>
        </div>

        <!-- Step 2: Embedding 模型 -->
        <div v-else-if="currentStep === 1">
          <el-alert
            type="info"
            :closable="false"
            show-icon
            title="为系统配置默认 Embedding 模型，用于知识库向量化与 RAG 检索"
          />
          <el-form label-width="120px" class="step-form">
            <el-form-item label="Provider 类型" required>
              <el-select v-model="embeddingForm.provider_type" data-testid="embedding-provider-select">
                <el-option label="百炼" value="bailian" />
                <el-option label="OpenAI" value="openai" />
              </el-select>
            </el-form-item>
            <el-form-item label="Base URL" required>
              <el-input v-model="embeddingForm.base_url" placeholder="https://dashscope.aliyuncs.com" />
            </el-form-item>
            <el-form-item label="API Key" required>
              <el-input v-model="embeddingForm.api_key" type="password" show-password />
            </el-form-item>
            <el-form-item label="模型名" required>
              <el-input v-model="embeddingForm.model_name" placeholder="text-embedding-v3" />
            </el-form-item>
            <el-form-item>
              <el-button :loading="testing" @click="handleTestEmbedding">测试连接</el-button>
              <el-checkbox v-model="embeddingForm.set_default" disabled>设为默认 Embedding 模型</el-checkbox>
            </el-form-item>
            <el-alert v-if="testResult" :type="testResult.ok ? 'success' : 'error'" :title="testResult.detail" :closable="false" show-icon />
          </el-form>
        </div>

        <!-- Step 3: 向量检索 -->
        <div v-else-if="currentStep === 2">
          <el-alert
            type="info"
            :closable="false"
            show-icon
            title="启用 RAG 检索以在生成内容时引用知识库"
          />
          <el-form label-width="120px" class="step-form">
            <el-form-item label="检索模式">
              <el-radio-group v-model="ragForm.retrieval_mode">
                <el-radio value="postgres_fulltext">关闭</el-radio>
                <el-radio value="hybrid">混合检索</el-radio>
                <el-radio value="vector">仅向量</el-radio>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="Top K">
              <el-input v-model.number="ragForm.top_k" type="number" />
            </el-form-item>
          </el-form>
        </div>

        <!-- Step 4: 文件存储 -->
        <div v-else-if="currentStep === 3">
          <el-alert
            type="info"
            :closable="false"
            show-icon
            title="配置文件存储后端（当前仅支持 MinIO）"
          />
          <el-form label-width="120px" class="step-form">
            <el-form-item label="Endpoint" required>
              <el-input v-model="storageForm.endpoint" placeholder="minio:9000" />
            </el-form-item>
            <el-form-item label="Public Endpoint">
              <el-input v-model="storageForm.public_endpoint" placeholder="163.7.6.60:9000" />
            </el-form-item>
            <el-form-item label="Access Key" required>
              <el-input v-model="storageForm.access_key" />
            </el-form-item>
            <el-form-item label="Secret Key" required>
              <el-input v-model="storageForm.secret_key" type="password" show-password />
            </el-form-item>
            <el-form-item label="Bucket" required>
              <el-input v-model="storageForm.bucket" placeholder="bid-files" />
            </el-form-item>
            <el-form-item label="上传模式">
              <el-radio-group v-model="storageForm.upload_mode">
                <el-radio value="backend_proxy">后端代理上传</el-radio>
                <el-radio value="presigned_direct">浏览器直传 + CORS</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-form>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button data-testid="cancel-btn" @click="handleCancel">退出向导</el-button>
        <el-button v-if="currentStep > 0" @click="handlePrev">上一步</el-button>
        <el-button data-testid="skip-btn" @click="handleSkip">跳过此步</el-button>
        <el-button v-if="currentStep < 3" type="primary" data-testid="next-btn" @click="handleNext">下一步</el-button>
        <el-button v-else type="primary" :loading="submitting" data-testid="finish-btn" @click="handleSubmit">完成</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import {
  submitWizard,
  testConnection,
  type SetupWizardPayload,
  type TestConnectionResponse,
} from '@/api/settings'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  submitted: []
}>()

const steps = [
  { key: 'chat_model', title: 'Chat 模型' },
  { key: 'embedding_model', title: 'Embedding 模型' },
  { key: 'rag_search', title: '向量检索' },
  { key: 'file_storage', title: '文件存储' },
]

const currentStep = ref(0)
const testing = ref(false)
const submitting = ref(false)
const testResult = ref<TestConnectionResponse | null>(null)
const skippedSteps = reactive(new Set<string>())

const chatForm = reactive({
  provider_type: 'deepseek',
  base_url: 'https://api.deepseek.com',
  api_key: '',
  model_name: 'deepseek-chat',
  set_default: true,
})

const embeddingForm = reactive({
  provider_type: 'bailian',
  base_url: 'https://dashscope.aliyuncs.com',
  api_key: '',
  model_name: 'text-embedding-v3',
  set_default: true,
})

const ragForm = reactive({
  retrieval_mode: 'hybrid',
  top_k: 10,
})

const storageForm = reactive({
  endpoint: 'minio:9000',
  public_endpoint: '',
  access_key: '',
  secret_key: '',
  bucket: 'bid-files',
  upload_mode: 'backend_proxy' as 'backend_proxy' | 'presigned_direct',
})

async function handleTestChat() {
  testing.value = true
  testResult.value = null
  try {
    testResult.value = await testConnection({
      provider_type: chatForm.provider_type,
      base_url: chatForm.base_url,
      api_key: chatForm.api_key,
      model_name: chatForm.model_name,
      test_kind: 'chat',
    })
  } finally {
    testing.value = false
  }
}

async function handleTestEmbedding() {
  testing.value = true
  testResult.value = null
  try {
    testResult.value = await testConnection({
      provider_type: embeddingForm.provider_type,
      base_url: embeddingForm.base_url,
      api_key: embeddingForm.api_key,
      model_name: embeddingForm.model_name,
      test_kind: 'embedding',
    })
  } finally {
    testing.value = false
  }
}

function handlePrev() {
  if (currentStep.value > 0) {
    currentStep.value -= 1
    testResult.value = null
  }
}

function handleNext() {
  if (currentStep.value < 3) {
    skippedSteps.delete(steps[currentStep.value].key)
    currentStep.value += 1
    testResult.value = null
  }
}

function handleSkip() {
  if (currentStep.value < 3) {
    skippedSteps.add(steps[currentStep.value].key)
    currentStep.value += 1
    testResult.value = null
  } else {
    // 最后一步跳过 = 取消
    handleCancel()
  }
}

function handleCancel() {
  emit('update:modelValue', false)
}

async function handleSubmit() {
  submitting.value = true
  try {
    const payload: SetupWizardPayload = {
      steps: {
        chat_model: skippedSteps.has('chat_model') ? null : { ...chatForm },
        embedding_model: skippedSteps.has('embedding_model') ? null : { ...embeddingForm },
        rag_search: skippedSteps.has('rag_search') ? null : { ...ragForm },
        file_storage: skippedSteps.has('file_storage') ? null : { ...storageForm },
      },
    }
    await submitWizard(payload)
    ElMessage.success('配置已保存')
    emit('submitted')
    emit('update:modelValue', false)
  } catch (err: any) {
    ElMessage.error(err.response?.data?.detail || '保存失败')
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.wizard-body {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.wizard-steps {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
}

.step {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  padding: 8px;
  border-radius: 4px;
}

.step.is-active {
  background: var(--el-color-primary-light-9);
}

.step.is-done .step-index {
  background: var(--el-color-success);
  color: white;
}

.step.is-skipped .step-index {
  background: var(--el-text-color-placeholder);
}

.step-index {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--el-fill-color-light);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
}

.step.is-active .step-index {
  background: var(--el-color-primary);
  color: white;
}

.step-title {
  font-size: 14px;
}

.step-form {
  margin-top: 16px;
}
</style>
```

- [ ] **Step 4: 运行测试验证通过**

Run: `cd frontend && npx vitest run src/components/settings/__tests__/SetupWizardDialog.spec.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
cd /home/newaibook/ai-bid-generator
git add frontend/src/components/settings/SetupWizardDialog.vue frontend/src/components/settings/__tests__/SetupWizardDialog.spec.ts
git commit -m "feat(settings): 新增配置向导对话框组件

- 4 步流程：Chat/Embedding/RAG/Storage
- 每步可跳过，跳过不写数据库
- Provider 下拉不含 mock 选项
- 测试连接走真实探针"
```

---

## Task 9: 修复 ProviderConfigDialog 与 ModelCard Mock 限制

**Files:**
- Modify: `frontend/src/components/settings/ProviderConfigDialog.vue`（移除 v-if="!isEdit"）
- Modify: `frontend/src/components/settings/ModelCard.vue`（mock 时设为默认按钮置灰）
- Test: `frontend/src/components/settings/__tests__/ProviderConfigDialog.spec.ts`
- Test: `frontend/src/components/settings/__tests__/ModelCard.spec.ts`

**Interfaces:**
- Consumes: 无
- Produces: ProviderConfigDialog 编辑模式下 provider_type 下拉可见；ModelCard 在 provider_type='mock' 时「设为默认」按钮 disabled

- [ ] **Step 1: 写第一个失败测试 - 编辑模式下 provider_type 下拉可见**

```typescript
// frontend/src/components/settings/__tests__/ProviderConfigDialog.spec.ts
import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import ProviderConfigDialog from '../ProviderConfigDialog.vue'

describe('ProviderConfigDialog edit mode', () => {
  it('shows provider_type dropdown in edit mode', () => {
    // 修复 v-if="!isEdit" 后，编辑模式下也显示
    const wrapper = mount(ProviderConfigDialog, {
      props: {
        modelValue: true,
        isEdit: true,
        provider: {
          id: 1,
          name: 'DeepSeek',
          provider_type: 'deepseek',
          base_url: 'https://api.deepseek.com',
          api_key_env: '',
        },
      },
      global: {
        stubs: ['el-dialog', 'el-form', 'el-form-item', 'el-input', 'el-select', 'el-option', 'el-button'],
      },
    })
    const typeSelect = wrapper.find('[data-testid="provider-type-field"]')
    expect(typeSelect.exists()).toBe(true)
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

Run: `cd frontend && npx vitest run src/components/settings/__tests__/ProviderConfigDialog.spec.ts`
Expected: FAIL（v-if="!isEdit" 仍隐藏）

- [ ] **Step 3: 修改 ProviderConfigDialog.vue 移除 v-if="!isEdit"**

读现有 `frontend/src/components/settings/ProviderConfigDialog.vue:15`，找到：

```vue
<el-form-item v-if="!isEdit" label="类型" required>
```

修改为：

```vue
<el-form-item label="类型" required>
```

同时在 `el-select` 上添加 `data-testid="provider-type-field"`：

```vue
<el-select v-model="form.provider_type" data-testid="provider-type-field" placeholder="选择类型">
```

- [ ] **Step 4: 运行测试验证通过**

Run: `cd frontend && npx vitest run src/components/settings/__tests__/ProviderConfigDialog.spec.ts`
Expected: PASS

- [ ] **Step 5: 写第二个测试 - ModelCard 在 mock 时设为默认按钮置灰**

```typescript
// frontend/src/components/settings/__tests__/ModelCard.spec.ts
import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import ModelCard from '../ModelCard.vue'

describe('ModelCard mock restriction', () => {
  it('disables set-default button when provider is mock', () => {
    const wrapper = mount(ModelCard, {
      props: {
        model: {
          id: 1,
          model_name: 'mock-chat',
          model_type: 'chat',
          is_default: false,
          is_active: true,
          display_name: '',
        },
        providerType: 'mock',
      },
      global: {
        stubs: ['el-button', 'el-icon', 'el-tag'],
      },
    })
    const setDefaultBtn = wrapper.find('[data-testid="set-default-btn"]')
    expect(setDefaultBtn.attributes('disabled')).toBeDefined()
  })

  it('enables set-default button when provider is real', () => {
    const wrapper = mount(ModelCard, {
      props: {
        model: {
          id: 2,
          model_name: 'deepseek-chat',
          model_type: 'chat',
          is_default: false,
          is_active: true,
          display_name: '',
        },
        providerType: 'deepseek',
      },
      global: {
        stubs: ['el-button', 'el-icon', 'el-tag'],
      },
    })
    const setDefaultBtn = wrapper.find('[data-testid="set-default-btn"]')
    expect(setDefaultBtn.attributes('disabled')).toBeUndefined()
  })
})
```

- [ ] **Step 6: 运行测试验证失败**

Run: `cd frontend && npx vitest run src/components/settings/__tests__/ModelCard.spec.ts`
Expected: FAIL（按钮未添加 data-testid，或未禁用）

- [ ] **Step 7: 修改 ModelCard.vue 在「设为默认」按钮添加 disabled 与 data-testid**

读 `frontend/src/components/settings/ModelCard.vue` 找到「设为默认」按钮，修改为：

```vue
<el-button
  v-if="!model.is_default"
  size="small"
  type="primary"
  :disabled="isMock"
  data-testid="set-default-btn"
  @click="emit('set-default', model.id)"
>
  设为默认
</el-button>
```

确保 `isMock` computed 已存在（之前已有）：

```typescript
const isMock = computed(() => props.providerType === 'mock')
```

如果之前没有 `isMock`，添加到 `<script setup>` 中。

- [ ] **Step 8: 运行测试验证通过**

Run: `cd frontend && npx vitest run src/components/settings/__tests__/ModelCard.spec.ts`
Expected: PASS

- [ ] **Step 9: 提交**

```bash
cd /home/newaibook/ai-bid-generator
git add frontend/src/components/settings/ProviderConfigDialog.vue frontend/src/components/settings/ModelCard.vue frontend/src/components/settings/__tests__/ProviderConfigDialog.spec.ts frontend/src/components/settings/__tests__/ModelCard.spec.ts
git commit -m "fix(settings): 修复 Provider 编辑 bug 与 Mock 模型按钮置灰

- 移除 ProviderConfigDialog v-if=!isEdit，编辑模式可改 provider_type
- ModelCard 在 provider_type=mock 时设为默认按钮 disabled"
```

---

## Task 10: 重写 SystemSettingsView 整合所有组件

**Files:**
- Modify: `frontend/src/views/admin/SystemSettingsView.vue`
- Modify: `frontend/src/components/settings/EmbeddingSettingsPanel.vue`（与 RagSettingsPanel 合并到「知识库」Tab）
- Test: `frontend/src/views/admin/__tests__/SystemSettingsView.spec.ts`

**Interfaces:**
- Consumes: Task 6 API、Task 7-9 组件
- Produces: 重写后的 SystemSettingsView 包含 Hero + 评分面板 + 4 Tab + 向导对话框

- [ ] **Step 1: 写第一个失败测试 - 整页组装**

```typescript
// frontend/src/views/admin/__tests__/SystemSettingsView.spec.ts
import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMemoryRouter, createRouter } from 'vue-router'

// Mock API
vi.mock('@/api/settings', () => ({
  getHealthStatus: vi.fn().mockResolvedValue({
    chat_model: { status: 'error', label: '未配置', impact_hint: '说明', score: 0, score_max: 30 },
    embedding_model: { status: 'error', label: '未配置', impact_hint: '说明', score: 0, score_max: 20 },
    rag_search: { status: 'warning', label: '已启用', impact_hint: '说明', score: 10, score_max: 20 },
    file_storage: { status: 'error', label: '未配置', impact_hint: '说明', score: 0, score_max: 20 },
    security_audit: { status: 'ok', label: '已启用', audit_log_enabled: true, impact_hint: '说明', score: 10, score_max: 10 },
    mock_warning: null,
    total_score: 20,
    total_max: 100,
    pending_count: 3,
  }),
  diagnoseAll: vi.fn(),
  testConnection: vi.fn(),
  submitWizard: vi.fn(),
}))

// Mock 子组件避免复杂渲染
vi.mock('@/components/settings/HealthHeroBar.vue', () => ({
  default: { template: '<div data-testid="hero-bar"></div>' },
}))
vi.mock('@/components/settings/HealthScorePanel.vue', () => ({
  default: { template: '<div data-testid="score-panel"></div>' },
}))
vi.mock('@/components/settings/SetupWizardDialog.vue', () => ({
  default: { template: '<div data-testid="wizard-dialog"></div>' },
}))

import SystemSettingsView from '../SystemSettingsView.vue'

describe('SystemSettingsView', () => {
  it('renders hero bar, score panel, and 4 tabs', async () => {
    const wrapper = mount(SystemSettingsView, {
      global: {
        stubs: ['el-tabs', 'el-tab-pane', 'router-view'],
      },
    })
    await flushPromises()

    expect(wrapper.find('[data-testid="hero-bar"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="score-panel"]').exists()).toBe(true)
    const tabs = wrapper.findAll('[data-testid="main-tab"]')
    expect(tabs).toHaveLength(4)
  })

  it('loads health status on mount', async () => {
    const { getHealthStatus } = await import('@/api/settings')
    mount(SystemSettingsView, {
      global: {
        stubs: ['el-tabs', 'el-tab-pane', 'router-view'],
      },
    })
    await flushPromises()
    expect(getHealthStatus).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

Run: `cd frontend && npx vitest run src/views/admin/__tests__/SystemSettingsView.spec.ts`
Expected: FAIL（视图未重写）

- [ ] **Step 3: 重写 SystemSettingsView.vue**

读现有 `frontend/src/views/admin/SystemSettingsView.vue`，整体替换为：

```vue
<!-- frontend/src/views/admin/SystemSettingsView.vue -->
<template>
  <div class="system-settings-view">
    <HealthHeroBar
      :status="healthStatus"
      :loading="loading"
      :diagnose-loading="diagnoseLoading"
      @refresh="loadHealth"
      @diagnose="handleDiagnose"
      @wizard="wizardVisible = true"
      @navigate="handleNavigate"
    />

    <HealthScorePanel
      v-if="healthStatus"
      :status="healthStatus"
      @navigate="handleNavigate"
    />

    <el-tabs v-model="activeTab" class="settings-tabs">
      <el-tab-pane label="大模型" name="llm" data-testid="main-tab">
        <ModelSettingsPanel :lot-id="0" />
      </el-tab-pane>
      <el-tab-pane label="知识库" name="knowledge" data-testid="main-tab">
        <div class="knowledge-tab">
          <EmbeddingSettingsPanel />
          <RagSettingsPanel />
        </div>
      </el-tab-pane>
      <el-tab-pane label="文件存储" name="storage" data-testid="main-tab">
        <div class="storage-tab">
          <StorageSettingsPanel />
          <UploadCorsSettingsPanel />
        </div>
      </el-tab-pane>
      <el-tab-pane label="安全审计" name="security" data-testid="main-tab">
        <SecurityAuditSettingsPanel />
      </el-tab-pane>
    </el-tabs>

    <SetupWizardDialog
      v-model="wizardVisible"
      @submitted="loadHealth"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import HealthHeroBar from '@/components/settings/HealthHeroBar.vue'
import HealthScorePanel from '@/components/settings/HealthScorePanel.vue'
import SetupWizardDialog from '@/components/settings/SetupWizardDialog.vue'
import ModelSettingsPanel from '@/components/settings/ModelSettingsPanel.vue'
import EmbeddingSettingsPanel from '@/components/settings/EmbeddingSettingsPanel.vue'
import RagSettingsPanel from '@/components/settings/RagSettingsPanel.vue'
import StorageSettingsPanel from '@/components/settings/StorageSettingsPanel.vue'
import UploadCorsSettingsPanel from '@/components/settings/UploadCorsSettingsPanel.vue'
import SecurityAuditSettingsPanel from '@/components/settings/SecurityAuditSettingsPanel.vue'
import { getHealthStatus, diagnoseAll, type HealthStatusResponse } from '@/api/settings'

const healthStatus = ref<HealthStatusResponse | null>(null)
const loading = ref(false)
const diagnoseLoading = ref(false)
const activeTab = ref('llm')
const wizardVisible = ref(false)

async function loadHealth() {
  loading.value = true
  try {
    healthStatus.value = await getHealthStatus()
  } catch (err: any) {
    ElMessage.error('加载健康状态失败')
  } finally {
    loading.value = false
  }
}

async function handleDiagnose() {
  diagnoseLoading.value = true
  try {
    healthStatus.value = await diagnoseAll()
    ElMessage.success('诊断完成')
  } catch (err: any) {
    ElMessage.error('诊断失败')
  } finally {
    diagnoseLoading.value = false
  }
}

function handleNavigate(tab: string) {
  activeTab.value = tab
}

onMounted(loadHealth)
</script>

<style scoped>
.system-settings-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
}

.settings-tabs {
  margin-top: 8px;
}

.knowledge-tab,
.storage-tab {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
</style>
```

- [ ] **Step 4: 运行测试验证通过**

Run: `cd frontend && npx vitest run src/views/admin/__tests__/SystemSettingsView.spec.ts`
Expected: PASS

- [ ] **Step 5: 运行所有前端测试确保未破坏**

Run: `cd frontend && npx vitest run`
Expected: 新测试全部通过，预先存在的失败（bootstrap-auth）可忽略

- [ ] **Step 6: TypeScript 编译验证**

Run: `cd frontend && npx vue-tsc --noEmit`
Expected: 无报错

- [ ] **Step 7: 前端构建验证**

Run: `cd frontend && npm run build`
Expected: 构建成功

- [ ] **Step 8: 提交**

```bash
cd /home/newaibook/ai-bid-generator
git add frontend/src/views/admin/SystemSettingsView.vue frontend/src/views/admin/__tests__/
git commit -m "feat(settings): 重写 SystemSettingsView 整合健康检查与向导

- Hero 状态条 + 健康度评分面板 + 4 Tab 重组
- 进入页面拉取健康状态，支持手动刷新与一键诊断
- 配置向导对话框接入
- Tab 合并：大模型/知识库/文件存储/安全审计"
```

---

## Task 11: 端到端验收与部署

**Files:**
- 无新文件
- 部署到 http://163.7.6.60 验证

**Interfaces:**
- Consumes: 所有前述任务
- Produces: 部署的可用版本

- [ ] **Step 1: 构建前端**

Run: `cd /home/newaibook/ai-bid-generator/frontend && npm run build`
Expected: 构建成功，dist 目录生成

- [ ] **Step 2: 重建 Docker 镜像**

Run: `cd /home/newaibook/ai-bid-generator && docker compose build web worker beat`
Expected: 三个镜像构建成功

- [ ] **Step 3: 重启服务**

Run: `cd /home/newaibook/ai-bid-generator && docker compose up -d web worker beat`
Expected: 容器正常启动

- [ ] **Step 4: 重启 nginx（避免 502）**

Run: `cd /home/newaibook/ai-bid-generator && docker compose restart nginx`
Expected: nginx 重启成功

- [ ] **Step 5: 验证后端 API 可用**

Run: `curl -s http://localhost/api/auth/login -X POST -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}'`
Expected: 返回 JWT token

- [ ] **Step 6: 验证健康检查端点**

使用上一步获取的 token：

Run: `curl -s http://localhost/api/settings/health/ -H "Authorization: Bearer <token>"`
Expected: 返回 5 项状态 + total_score 结构

- [ ] **Step 7: 验证测试连接端点（mock 拒绝）**

Run: `curl -s -X POST http://localhost/api/settings/test-connection/ -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"provider_type":"mock","base_url":"","api_key":"","model_name":"","test_kind":"chat"}'`
Expected: `{"ok": false, "error_code": "mock_not_allowed", ...}`

- [ ] **Step 8: 验证前端页面渲染**

打开浏览器访问 http://163.7.6.60/admin/settings，检查：
1. Hero 状态条显示 5 个徽章（不再硬编码"连接正常"）
2. 健康度评分面板显示 5 项进度条 + 影响说明
3. 4 个 Tab（大模型/知识库/文件存储/安全审计）
4. 默认 chat 指向 mock 时顶部红色 Mock 告警横幅
5. 「配置向导」按钮可见可点击

- [ ] **Step 9: 验证配置向导流程**

1. 点击「配置向导」按钮
2. Step 1 选 DeepSeek，填 base_url + api_key + model_name
3. 点测试连接 → 应走真实探针
4. 跳过 Embedding 步骤
5. 跳过 RAG 步骤
6. Step 4 填 MinIO 配置
7. 点完成 → 健康度评分应刷新

- [ ] **Step 10: 验证 Provider 编辑可改 provider_type**

1. 进入「大模型」Tab
2. 编辑现有 mock Provider
3. 验证 provider_type 下拉可见（不再隐藏）
4. 尝试切换到 deepseek → 应提示"请先删除其下 ModelConfig"
5. 删除其下 ModelConfig 后切换 → 应成功

- [ ] **Step 11: 验证 Mock 模型不能设为默认**

1. 进入「大模型」Tab
2. 找到 mock Provider 下的 ModelConfig
3. 「设为默认」按钮应置灰，无法点击

- [ ] **Step 12: 验证一键诊断**

1. 点击「一键诊断」按钮
2. 等待探针完成
3. Hero 状态条应反映最新探针结果
4. `last_probe_at` 与 `last_probe_ok` 字段应有值

- [ ] **Step 13: 验证 Hero 徽章跳转**

1. 点击 Chat 模型徽章 → 跳转到「大模型」Tab
2. 点击 Embedding 模型徽章 → 跳转到「知识库」Tab
3. 点击文件存储徽章 → 跳转到「文件存储」Tab
4. 点击安全审计徽章 → 跳转到「安全审计」Tab

- [ ] **Step 14: 验证评分项跳转**

1. 点击健康度评分面板中任意项
2. 应跳转到对应 Tab

- [ ] **Step 15: 提交最终验收记录**

```bash
cd /home/newaibook/ai-bid-generator
git log --oneline -20
```

确认所有 commit 都已提交。如有遗漏，补充提交。

- [ ] **Step 16: 完成开发分支**

使用 `superpowers:finishing-a-development-branch` skill 完成开发分支。

---

## Self-Review Checklist

### Spec Coverage

| Spec 章节 | 实现任务 |
|----------|---------|
| §5.1 页面布局 | Task 10 |
| §5.2 Tab 合并映射 | Task 10 |
| §5.3 状态徽章语义 | Task 7 (HealthHeroBar) |
| §5.4 未配置影响说明 | Task 2 (HealthCheckService) + Task 7 (HealthScorePanel) |
| §6 配置向导 | Task 4 (WizardService) + Task 8 (SetupWizardDialog) |
| §7.1 健康检查端点 | Task 2 + Task 3 |
| §7.2 一键诊断端点 | Task 3 |
| §7.3 测试连接端点 | Task 1 + Task 3 |
| §7.4 探针实现策略 | Task 1 |
| §7.5 评分规则 | Task 2 |
| §7.6 向导端点 | Task 4 |
| §7.7 Provider 编辑放开 | Task 5 |
| §7.8 Mock 限制 | Task 5 |
| §8.1 新增组件 | Task 7、8 |
| §8.2 重写组件 | Task 9、10 |
| §9 测试策略 | 各 Task 内嵌测试 |
| §10 实施计划 | Task 1-11 |

### Placeholder Scan

无 TBD/TODO/FIXME/XXX，所有步骤均含完整代码。✓

### Type Consistency

- `HealthStatus` 类型在 Task 6 定义，Task 7、8、10 均使用同一类型 ✓
- `ProbeResult` 在 Task 1 定义，Task 2、3 使用同一类型 ✓
- `WizardService.apply_wizard(steps: dict)` 在 Task 4 定义，Task 3 SetupWizardView 调用 ✓
- 前端 `submitWizard`、`testConnection`、`getHealthStatus`、`diagnoseAll` 在 Task 6 定义，Task 7-10 使用 ✓

### 关键约束验证

- ✓ 后端代码遵循 `backend/apps/system_config/` 目录
- ✓ 前端组件放在 `frontend/src/components/settings/`
- ✓ 测试用 pytest + responses（后端）/ vitest + @vue/test-utils（前端）
- ✓ 权限码统一 `system_settings.manage`
- ✓ 前端 API 通过 `@/api/http`
- ✓ Redis 缓存 key `settings:health:status`（实现中用了此 key）
- ✓ Mock provider 不可设为默认（Task 5 后端 + Task 9 前端）
- ✓ 探针 10 秒超时（Task 1 TIMEOUT_SECONDS = 10）
