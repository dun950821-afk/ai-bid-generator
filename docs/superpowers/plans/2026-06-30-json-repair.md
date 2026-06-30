# JSON 修复器 Implementation Plan（P2-4）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现统一 JSON 修复器，所有 AI 调用解析失败时自动调修复 prompt 重试，仍失败重调原文 LLM，减少任务失败。

**Architecture:** 改造 `AiTaskExecutionService.execute`，在现有"调 LLM → 解析 JSON → 校验 schema"流程后加容错层：解析或校验失败 → 调 `json_repair` scenario 修复 → 再解析+校验 → 仍失败重调一次原文 → 都失败抛 AiTaskExecutionError。成功路径零开销。

**Tech Stack:** Django + DRF + Celery + PostgreSQL。Prompt 走 Jinja2 入库（PromptTemplate+PromptVersion），AI 调用走 `AiTaskExecutionService.execute`。

## Global Constraints

- 所有 prompt 写入 PromptTemplate+PromptVersion（Jinja2 `{{ var }}` 语法），禁止代码内联 prompt
- AI 调用走 `AiTaskExecutionService.execute(scenario, variables, created_by, business_context={"project_id": ...})`
- `business_context` 只能传 `{"project_id": ...}`（PromptRun 限制，传 outline_id 等会触发 TypeError）
- 后端测试用 pytest：`cd backend && python -m pytest apps/generation/tests/test_json_repair.py -v`
- Docker 部署：`docker compose build web worker && docker compose up -d web worker && docker exec ai-bid-generator-web-1 python manage.py migrate && docker compose restart nginx`
- `LLMResponse` 结构：`text: str, json: dict, prompt_tokens: int, completion_tokens: int, total_tokens: int, latency_ms: int`
- `_validate_output(output_json, schema)` 返回 `(is_valid: bool, errors: list[str])`

---

## File Structure

新建：
- `backend/apps/generation/management/commands/_json_repair_prompts.py` — json_repair prompt 模板
- `backend/apps/generation/tests/test_json_repair.py` — 单元测试

修改：
- `backend/apps/generation/constants.py` — 新增 `JSON_REPAIR` scenario
- `backend/apps/generation/management/commands/seed_prompts.py` — 注册 json_repair prompt
- `backend/apps/generation/services/ai_task_execution_service.py` — execute 重构 + 3 个私有方法

无新增迁移（无新模型字段）。

---

## Task 1: json_repair scenario 与 prompt 模板

**Files:**
- Modify: `backend/apps/generation/constants.py`
- Create: `backend/apps/generation/management/commands/_json_repair_prompts.py`
- Modify: `backend/apps/generation/management/commands/seed_prompts.py`

**Interfaces:**
- Produces: `PromptScenario.JSON_REPAIR` 常量；`JSON_REPAIR_TEMPLATES` 列表（key: `json_repair.default`）

- [ ] **Step 1: 在 PromptScenario 加 JSON_REPAIR 常量**

修改 `backend/apps/generation/constants.py`，在 `CONSISTENCY_REPAIR = "consistency_repair"` 后追加：

```python
    # JSON 修复器（借鉴 OpenBidKit jsonRepairPrompts）
    JSON_REPAIR = "json_repair"
```

在 `CHOICES` 列表末尾（`(CONSISTENCY_REPAIR, "一致性修复")` 后）追加：

```python
        (JSON_REPAIR, "JSON修复"),
```

- [ ] **Step 2: 创建 json_repair prompt 模板文件**

创建 `backend/apps/generation/management/commands/_json_repair_prompts.py`：

```python
# backend/apps/generation/management/commands/_json_repair_prompts.py
"""JSON 修复器 prompt 模板（借鉴 OpenBidKit buildJsonRepairMessages）。

修复器自身无 output_schema，避免修复器输出又触发修复的无限循环。
"""

JSON_REPAIR_TEMPLATES = [
    {
        "key": "json_repair.default",
        "name": "JSON修复模板",
        "scenario": "json_repair",
        "description": "修复非法 JSON 字符串，例如非法反斜杠转义",
        "system_prompt": """你是一个严格的 JSON 修复助手。必须修复 JSON 字符串中的非法反斜杠转义，例如将 1\\. 改为 1.，或将必须保留的反斜杠写成 \\\\。只返回修复后的完整 JSON，不要输出任何解释。""",
        "user_prompt": """目标结果类型：
{{ target_description }}

当前校验问题：
{{ issues }}

待修复内容：
```json
{{ invalid_content }}
```""",
        "output_schema": {},
        "variable_schema": {
            "type": "object",
            "properties": {
                "target_description": {"type": "string"},
                "issues": {"type": "string"},
                "invalid_content": {"type": "string"},
            },
            "required": [],
        },
    },
]
```

- [ ] **Step 3: 在 seed_prompts.py 注册**

修改 `backend/apps/generation/management/commands/seed_prompts.py` 的 `_get_builtin_templates` 方法，在现有 import 后加：

```python
        from ._json_repair_prompts import JSON_REPAIR_TEMPLATES
```

在 return 的拼接链末尾加 `+ JSON_REPAIR_TEMPLATES`，完整 return 应为：

```python
        return (
            GLOBAL_FACT_TEMPLATES
            + OUTLINE_REVIEW_TEMPLATES
            + SECTION_PLAN_TEMPLATES
            + SECTION_CONTENT_ANTIAI_TEMPLATES  # noqa
            + BID_CHECK_TEMPLATES
            + CONSISTENCY_AUDIT_TEMPLATES
            + JSON_REPAIR_TEMPLATES
            + [
                # ... 现有内置模板 ...
            ]
        )
```

- [ ] **Step 4: 语法检查**

Run: `cd backend && python3 -m py_compile apps/generation/constants.py apps/generation/management/commands/_json_repair_prompts.py apps/generation/management/commands/seed_prompts.py`
Expected: 无输出（成功）

- [ ] **Step 5: Commit**

```bash
git add backend/apps/generation/constants.py backend/apps/generation/management/commands/_json_repair_prompts.py backend/apps/generation/management/commands/seed_prompts.py
git commit -m "feat(json-repair): 新增 json_repair scenario 与 prompt 模板"
```

---

## Task 2: AiTaskExecutionService 容错层（TDD）

**Files:**
- Modify: `backend/apps/generation/services/ai_task_execution_service.py`
- Create: `backend/apps/generation/tests/test_json_repair.py`

**Interfaces:**
- Consumes: `LLMService.chat`、`_validate_output`、`PromptVersion`、`PromptRun`
- Produces: `AiTaskExecutionService._try_parse_and_validate(text, schema) -> (dict|None, list[str])`、`AiTaskExecutionService._call_json_repair(invalid_content, issues, target_desc, user, business_context) -> str|None`、`AiTaskExecutionService._execute_with_repair(prompt_version, rendered, model_config, user, business_context, metadata) -> (LLMResponse, dict)`

- [ ] **Step 1: 写失败测试 — 解析成功不调修复**

创建 `backend/apps/generation/tests/test_json_repair.py`：

```python
# backend/apps/generation/tests/test_json_repair.py
"""JSON 修复器测试。"""
from unittest.mock import patch, MagicMock
from django.test import TestCase
from django.contrib.auth import get_user_model

from apps.generation.services.ai_task_execution_service import AiTaskExecutionService, AiTaskExecutionError
from apps.generation.providers.base import LLMResponse

User = get_user_model()


class _FakePromptVersion:
    """轻量 PromptVersion 替身，避免依赖数据库。"""
    def __init__(self, output_schema=None, scenario="test"):
        self.output_schema = output_schema
        self.template = MagicMock(scenario=scenario, key=f"{scenario}.default")
        self.system_prompt = "sys"
        self.user_prompt = "user"
        self.variable_schema = {}


class JsonRepairTest(TestCase):
    def setUp(self):
        self.user, _ = User.objects.get_or_create(username="test_json_repair_user")

    def _make_service(self):
        svc = AiTaskExecutionService()
        svc.render_service = MagicMock()
        svc.render_service.render.return_value = MagicMock(system_prompt="sys", user_prompt="user")
        return svc

    def test_parse_success_no_repair(self):
        """正常解析成功，不调修复器。"""
        svc = self._make_service()
        with patch.object(svc.llm_service, "chat") as mock_chat, \
             patch.object(svc, "_call_json_repair") as mock_repair:
            mock_chat.return_value = LLMResponse(
                text='{"k": "v"}', json={"k": "v"},
                prompt_tokens=10, completion_tokens=5, total_tokens=15, latency_ms=100,
            )
            response, output = svc._execute_with_repair(
                _FakePromptVersion(), MagicMock(system_prompt="sys", user_prompt="user"),
                MagicMock(), self.user, {}, {},
            )
        self.assertEqual(output, {"k": "v"})
        mock_repair.assert_not_called()
```

- [ ] **Step 2: 运行测试验证失败**

Run: `cd backend && python -m pytest apps/generation/tests/test_json_repair.py::JsonRepairTest::test_parse_success_no_repair -v`
Expected: FAIL with `AttributeError: 'AiTaskExecutionService' object has no attribute '_execute_with_repair'`

- [ ] **Step 3: 写最小实现 — _try_parse_and_validate + _execute_with_repair（仅成功路径）**

在 `backend/apps/generation/services/ai_task_execution_service.py` 的 `AiTaskExecutionService` 类里，`_validate_output` 方法之后追加：

```python
    def _try_parse_and_validate(self, text: str, output_schema: dict | None) -> tuple:
        """尝试解析 JSON + 校验 schema。

        Returns:
            (output_json, errors) — 成功时 errors 为空列表；失败时 output_json 为 None
        """
        output_json = None
        try:
            output_json = json.loads(text)
        except (json.JSONDecodeError, TypeError):
            return None, ["json.loads 解析失败"]

        if not output_schema:
            return output_json, []

        try:
            jsonschema.validate(output_json, output_schema)
            return output_json, []
        except jsonschema.ValidationError as exc:
            return output_json, [str(exc)]
        except jsonschema.SchemaError as exc:
            return output_json, [f"Schema 错误: {exc}"]

    def _call_json_repair(self, invalid_content: str, issues: list, target_desc: str, user, business_context: dict) -> str | None:
        """调 json_repair scenario 修复 JSON，返回修复后的文本。失败返回 None。"""
        try:
            repair_run = AiTaskExecutionService().execute(
                scenario="json_repair",
                variables={
                    "target_description": target_desc,
                    "issues": "\n".join(f"{i+1}. {msg}" for i, msg in enumerate(issues)),
                    "invalid_content": invalid_content,
                },
                created_by=user,
                business_context=business_context,
            )
            if repair_run.status == "succeeded" and repair_run.output_text:
                return repair_run.output_text.strip()
        except Exception as e:
            logger.warning(f"json_repair 调用失败：{e}")
        return None

    def _execute_with_repair(self, prompt_version, rendered, model_config, user, business_context, metadata) -> tuple:
        """调 LLM + 解析 + 校验，失败时调 json_repair 重试，仍失败重调原文。

        Returns:
            (LLMResponse, output_json)
        Raises:
            AiTaskExecutionError: 都失败时
        """
        schema = prompt_version.output_schema or None
        target_desc = f"场景 {prompt_version.template.scenario} 的 JSON 输出"

        # 第1次：正常调用
        response = self.llm_service.chat(
            model_config=model_config,
            system_prompt=rendered.system_prompt,
            user_prompt=rendered.user_prompt,
            response_format=schema,
        )
        output_json, issues = self._try_parse_and_validate(response.text, schema)
        if not issues:
            return response, output_json

        logger.info(f"首次解析/校验失败，尝试修复：{issues[:1]}")

        # 第2次：调 json_repair 修复
        repaired_text = self._call_json_repair(response.text, issues, target_desc, user, business_context)
        issues2 = ["未修复"]
        if repaired_text:
            output_json, issues2 = self._try_parse_and_validate(repaired_text, schema)
            if not issues2:
                # 合并 token 用量到原 response
                merged = LLMResponse(
                    text=repaired_text,
                    json=output_json,
                    prompt_tokens=response.prompt_tokens,
                    completion_tokens=response.completion_tokens,
                    total_tokens=response.total_tokens,
                    latency_ms=response.latency_ms,
                )
                return merged, output_json

        # 第3次：重调一次原文 LLM
        logger.info("修复仍失败，重调一次原文 LLM")
        response2 = self.llm_service.chat(
            model_config=model_config,
            system_prompt=rendered.system_prompt,
            user_prompt=rendered.user_prompt,
            response_format=schema,
        )
        output_json, issues3 = self._try_parse_and_validate(response2.text, schema)
        if not issues3:
            return response2, output_json

        raise AiTaskExecutionError(
            f"JSON 解析与修复均失败：首次={issues[:1]}；修复后={issues2[:1]}；重试={issues3[:1]}"
        )
```

注意：文件顶部需确保 `import json`、`import jsonschema`、`import logging` 已存在（若无需补）。`LLMResponse` 需在文件顶部 import：`from apps.generation.providers.base import LLMResponse`。

- [ ] **Step 4: 运行测试验证通过**

Run: `cd backend && python -m pytest apps/generation/tests/test_json_repair.py::JsonRepairTest::test_parse_success_no_repair -v`
Expected: PASS

- [ ] **Step 5: 写测试 — 解析失败调修复成功**

在 test_json_repair.py 的类里加：

```python
    def test_parse_fail_repair_success(self):
        """json.loads 失败 → 调修复 → 修复后解析成功。"""
        svc = self._make_service()
        with patch.object(svc.llm_service, "chat") as mock_chat, \
             patch.object(svc, "_call_json_repair") as mock_repair:
            # 第1次返回非法 JSON，修复后返回合法
            mock_chat.return_value = LLMResponse(
                text='{"k": "v"\\}', json=None,
                prompt_tokens=10, completion_tokens=5, total_tokens=15, latency_ms=100,
            )
            mock_repair.return_value = '{"k": "v"}'
            response, output = svc._execute_with_repair(
                _FakePromptVersion(), MagicMock(system_prompt="sys", user_prompt="user"),
                MagicMock(), self.user, {}, {},
            )
        mock_repair.assert_called_once()
        self.assertEqual(output, {"k": "v"})
```

- [ ] **Step 6: 运行测试**

Run: `cd backend && python -m pytest apps/generation/tests/test_json_repair.py::JsonRepairTest::test_parse_fail_repair_success -v`
Expected: PASS

- [ ] **Step 7: 写测试 — 修复失败重调原文成功**

```python
    def test_repair_fail_retry_original(self):
        """修复失败 → 重调一次原文 LLM 成功。"""
        svc = self._make_service()
        with patch.object(svc.llm_service, "chat") as mock_chat, \
             patch.object(svc, "_call_json_repair") as mock_repair:
            # 第1次非法，修复返回 None（失败），第2次（重调原文）成功
            mock_chat.side_effect = [
                LLMResponse(text='bad', json=None, prompt_tokens=10, completion_tokens=5, total_tokens=15, latency_ms=100),
                LLMResponse(text='{"k": "v"}', json={"k": "v"}, prompt_tokens=10, completion_tokens=5, total_tokens=15, latency_ms=100),
            ]
            mock_repair.return_value = None
            response, output = svc._execute_with_repair(
                _FakePromptVersion(), MagicMock(system_prompt="sys", user_prompt="user"),
                MagicMock(), self.user, {}, {},
            )
        self.assertEqual(mock_chat.call_count, 2)
        self.assertEqual(output, {"k": "v"})
```

- [ ] **Step 8: 运行测试**

Run: `cd backend && python -m pytest apps/generation/tests/test_json_repair.py::JsonRepairTest::test_repair_fail_retry_original -v`
Expected: PASS

- [ ] **Step 9: 写测试 — 都失败抛异常**

```python
    def test_all_fail_raises(self):
        """修复+重调都失败 → 抛 AiTaskExecutionError。"""
        svc = self._make_service()
        with patch.object(svc.llm_service, "chat") as mock_chat, \
             patch.object(svc, "_call_json_repair") as mock_repair:
            mock_chat.return_value = LLMResponse(
                text='bad', json=None,
                prompt_tokens=10, completion_tokens=5, total_tokens=15, latency_ms=100,
            )
            mock_repair.return_value = None
            with self.assertRaises(AiTaskExecutionError):
                svc._execute_with_repair(
                    _FakePromptVersion(), MagicMock(system_prompt="sys", user_prompt="user"),
                    MagicMock(), self.user, {}, {},
                )
```

- [ ] **Step 10: 运行测试**

Run: `cd backend && python -m pytest apps/generation/tests/test_json_repair.py::JsonRepairTest::test_all_fail_raises -v`
Expected: PASS

- [ ] **Step 11: 写测试 — 无 schema 只解析**

```python
    def test_no_schema_parse_only(self):
        """无 output_schema 时只做 json.loads 解析，解析成功即通过。"""
        svc = self._make_service()
        pv = _FakePromptVersion(output_schema=None)
        with patch.object(svc.llm_service, "chat") as mock_chat, \
             patch.object(svc, "_call_json_repair") as mock_repair:
            mock_chat.return_value = LLMResponse(
                text='{"any": "thing"}', json={"any": "thing"},
                prompt_tokens=10, completion_tokens=5, total_tokens=15, latency_ms=100,
            )
            response, output = svc._execute_with_repair(
                pv, MagicMock(system_prompt="sys", user_prompt="user"),
                MagicMock(), self.user, {}, {},
            )
        mock_repair.assert_not_called()
        self.assertEqual(output, {"any": "thing"})
```

- [ ] **Step 12: 运行全部测试**

Run: `cd backend && python -m pytest apps/generation/tests/test_json_repair.py -v`
Expected: 5 PASSED

- [ ] **Step 13: Commit**

```bash
git add backend/apps/generation/services/ai_task_execution_service.py backend/apps/generation/tests/test_json_repair.py
git commit -m "feat(json-repair): AiTaskExecutionService 容错层（解析失败→修复→重调原文）"
```

---

## Task 3: execute 方法接入容错层

**Files:**
- Modify: `backend/apps/generation/services/ai_task_execution_service.py:151-189`（execute 的第 8-11 步）

**Interfaces:**
- Consumes: Task 2 的 `_execute_with_repair`
- Produces: execute 内部用 `_execute_with_repair` 替代原"调 LLM + 解析 + 校验"

- [ ] **Step 1: 改造 execute 第 8-11 步**

修改 `backend/apps/generation/services/ai_task_execution_service.py` 的 `execute` 方法，将第 8 步（调 LLM）到第 11 步（更新成功结果）替换为调 `_execute_with_repair`。

原代码（line 151-189）：

```python
        # 8. 执行 LLM 调用
        try:
            response = self.llm_service.chat(
                model_config=model_config,
                system_prompt=rendered.system_prompt,
                user_prompt=rendered.user_prompt,
                response_format=prompt_version.output_schema or None,
            )

            # 9. 解析输出
            output_json = response.json
            if not output_json and response.text:
                try:
                    output_json = json.loads(response.text)
                except json.JSONDecodeError:
                    output_json = {}

            # 10. Schema 校验（如果 output_schema 不为空）
            schema_valid = True
            schema_errors = []
            if prompt_version.output_schema:
                schema_valid, schema_errors = self._validate_output(
                    output_json, prompt_version.output_schema
                )
                metadata["schema_valid"] = schema_valid
                metadata["schema_errors"] = schema_errors
                if not schema_valid:
                    metadata["schema_failed"] = True

            # 11. 更新成功结果
            run.output_text = response.text
            run.output_json = output_json
            run.prompt_tokens = response.prompt_tokens
            run.completion_tokens = response.completion_tokens
            run.total_tokens = response.total_tokens
            run.latency_ms = int((time.time() - start_time) * 1000)
            run.status = PromptRunStatus.SUCCEEDED
            run.metadata = metadata
            run.save()

            # 12. 记录 Token 用量
            self._record_token_usage(run, business_context)
```

替换为：

```python
        # 8. 执行 LLM 调用 + 解析 + 校验 + 容错（修复/重试）
        try:
            response, output_json = self._execute_with_repair(
                prompt_version, rendered, model_config, created_by, business_context, metadata,
            )

            # 9. 更新成功结果
            run.output_text = response.text
            run.output_json = output_json
            run.prompt_tokens = response.prompt_tokens
            run.completion_tokens = response.completion_tokens
            run.total_tokens = response.total_tokens
            run.latency_ms = int((time.time() - start_time) * 1000)
            run.status = PromptRunStatus.SUCCEEDED
            run.metadata = metadata
            run.save()

            # 10. 记录 Token 用量
            self._record_token_usage(run, business_context)
```

- [ ] **Step 2: 语法检查**

Run: `cd backend && python3 -m py_compile apps/generation/services/ai_task_execution_service.py`
Expected: 无输出

- [ ] **Step 3: 运行现有测试确保不回归**

Run: `cd backend && python -m pytest apps/generation/tests/test_prompt_execution_service.py apps/generation/tests/test_json_repair.py -v 2>&1 | tail -15`
Expected: 全部 PASS（如 test_prompt_execution_service.py 不存在则只跑 test_json_repair.py）

- [ ] **Step 4: Commit**

```bash
git add backend/apps/generation/services/ai_task_execution_service.py
git commit -m "feat(json-repair): execute 接入容错层，统一走修复器"
```

---

## Task 4: 部署与端到端验证

**Files:** 无（部署 + 验证）

- [ ] **Step 1: 重建镜像**

Run: `docker compose build web worker`
Expected: 两个镜像构建成功

- [ ] **Step 2: 启动容器并迁移**

Run: `docker compose up -d web worker && sleep 4 && docker exec ai-bid-generator-web-1 python manage.py migrate && docker compose restart nginx`
Expected: 无新增迁移，容器启动正常

- [ ] **Step 3: seed json_repair prompt**

Run: `docker exec ai-bid-generator-web-1 python manage.py seed_prompts 2>&1 | grep -E "json_repair|初始化"`
Expected: 输出 `创建模板: json_repair.default`、`创建版本: json_repair.default@1.0`、`初始化完成`

- [ ] **Step 4: 运行单元测试**

Run: `docker exec ai-bid-generator-web-1 python -m pytest apps/generation/tests/test_json_repair.py -v`
Expected: 5 PASSED

- [ ] **Step 5: 验证现有 AI 调用不回归**

Run:
```bash
TOKEN=$(curl -s -X POST http://localhost/api/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['access'])")
curl -s -w "\nHTTP %{http_code}\n" "http://localhost/api/outlines/7/consistency-audit/result/" -H "Authorization: Bearer $TOKEN"
```
Expected: HTTP 200，正常返回审计结果（证明现有流程未受影响）

- [ ] **Step 6: Commit 验证记录**

```bash
git commit --allow-empty -m "chore(json-repair): 端到端验证通过（5测试+API smoke test）"
```
