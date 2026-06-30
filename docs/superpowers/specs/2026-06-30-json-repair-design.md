# JSON 修复器设计（P2-4，借鉴 OpenBidKit jsonRepairPrompts）

## Context

本项目所有 AI 调用走 `AiTaskExecutionService.execute`，调用 LLM 后用 `json.loads(response.text)` 解析 JSON，再用 `output_schema` 校验。当模型返回非法 JSON（反斜杠转义错误、结构错位、Markdown 代码围栏包裹等）时，解析或校验失败，整个任务标记 failed。

OpenBidKit 的 `collectJsonResponse` 模式在解析失败时调 `buildJsonRepairMessages` 让 AI 修复 JSON，再重新解析。本设计实现统一的 JSON 修复器，作为所有 AI 调用的容错兜底。

## 需求（已确认）

1. **覆盖范围**：所有 AI 调用统一走修复器（改造 `AiTaskExecutionService.execute` 内部）
2. **触发时机**：解析失败时才修复（成功路径零开销）
3. **失败处理**：修复重试后仍失败 → 重调一次原文 LLM → 再校验
4. **修复器自身无 schema**：避免修复器输出又触发修复的无限循环

## 架构

改造 `AiTaskExecutionService.execute`，在现有"调 LLM → 解析 JSON → 校验 schema"流程后加容错层：

```
execute(scenario, variables, ...)
  ├─ 1. 渲染 prompt + 调 LLM（现有）
  ├─ 2. 解析 JSON（现有：json.loads(response.text)）
  ├─ 3. output_schema 校验（现有）
  ├─ 4. 【新增】解析或校验失败 → 调 json_repair scenario 修复 → 再解析+校验
  ├─ 5. 【新增】修复仍失败 → 重新调一次原文 LLM → 再解析+校验
  └─ 6. 都失败 → AiTaskExecutionError（现有失败处理）
```

## 数据模型

无新增表。新增 `PromptScenario.JSON_REPAIR = "json_repair"`，prompt 模板 `json_repair.default`。

## Prompt（Jinja2 入库，移植 OpenBidKit）

**`json_repair.default`**：
- **system**：`你是一个严格的 JSON 修复助手。必须修复 JSON 字符串中的非法反斜杠转义，例如将 1\\. 改为 1.，或将必须保留的反斜杠写成 \\\\。只返回修复后的完整 JSON，不要输出任何解释。`
- **user**：绑定 `{{ target_description }}`（目标结果类型描述）、`{{ issues }}`（当前校验问题清单）、`{{ invalid_content }}`（待修复内容）
- **无 output_schema**：修复器返回纯文本 JSON，避免无限循环
- **无 variable_schema required**：target_description/issues/invalid_content 都可选（不同失败场景传不同子集）

## 服务层改造

`AiTaskExecutionService.execute` 重构解析+校验+容错流程。新增私有方法：

```python
def _try_parse_and_validate(self, text: str, output_schema: dict | None) -> tuple[dict | None, list[str]]:
    """尝试解析 JSON + 校验 schema。返回 (output_json, errors)，成功时 errors 为空。"""

def _call_json_repair(self, invalid_content: str, issues: list[str], target_desc: str, user, business_context) -> str | None:
    """调 json_repair scenario 修复，返回修复后的 JSON 文本。失败返回 None。"""

def _execute_with_repair(self, prompt_version, rendered, model_config, user, business_context) -> tuple[Response, dict]:
    """调 LLM + 解析 + 校验，失败时调 json_repair 重试，仍失败重调原文。
    Returns: (response, output_json)
    Raises: AiTaskExecutionError（都失败时）
    """
```

### `_execute_with_repair` 流程

```python
def _execute_with_repair(self, prompt_version, rendered, model_config, user, business_context):
    schema = prompt_version.output_schema or None
    target_desc = f"场景 {prompt_version.template.scenario} 的 JSON 输出"

    # 第1次：正常调用
    response = self.llm_service.chat(model_config, rendered.system_prompt, rendered.user_prompt, response_format=schema)
    output_json, issues = self._try_parse_and_validate(response.text, schema)
    if not issues:
        return response, output_json

    # 第2次：调 json_repair 修复
    repaired_text = self._call_json_repair(response.text, issues, target_desc, user, business_context)
    if repaired_text:
        output_json, issues2 = self._try_parse_and_validate(repaired_text, schema)
        if not issues2:
            # 包装一个伪 response 返回（token 用量累加）
            return self._merge_response(response, repaired_text), output_json

    # 第3次：重调一次原文 LLM
    response2 = self.llm_service.chat(model_config, rendered.system_prompt, rendered.user_prompt, response_format=schema)
    output_json, issues3 = self._try_parse_and_validate(response2.text, schema)
    if not issues3:
        return response2, output_json

    # 都失败
    raise AiTaskExecutionError(
        f"JSON 解析与修复均失败：首次={issues[:1]}；修复后={issues2[:1] if repaired_text else '未修复'}；重试={issues3[:1]}"
    )
```

### execute 调用点改造

现有 `execute` 方法第 8-10 步（调 LLM + 解析 + 校验）替换为调 `_execute_with_repair`，其余步骤（PromptRun 创建、token 记录、状态更新）保持不变。修复+重调的 token 用量累加到同一个 PromptRun。

## 关键设计

- **成功路径零开销**：解析+校验成功直接返回，不调修复器
- **无 output_schema 的 prompt**：只做 json.loads 解析，解析成功即通过（如废标检查的 markdown 输出、json_repair 自身）
- **修复器自身无 schema**：避免修复器输出又触发修复的无限循环
- **重试上限**：修复 1 次 + 原文重调 1 次，最多 3 次 LLM 调用
- **token 记录**：修复+重调的 token 用量累加到 PromptRun
- **business_context 透传**：修复器调用复用原 business_context（project_id 等）

## 测试

`apps/generation/tests/test_json_repair.py`：

```python
class JsonRepairTest(TestCase):
    def test_parse_success_no_repair()           # 正常解析成功，不调修复
    def test_parse_fail_repair_success()          # json.loads 失败 → 修复成功
    def test_schema_fail_repair_success()         # schema 校验失败 → 修复成功
    def test_repair_fail_retry_original()         # 修复失败 → 重调原文成功
    def test_all_fail_raises()                    # 都失败抛 AiTaskExecutionError
    def test_no_schema_parse_only()               # 无 schema 只解析
```

mock 策略：mock `LLMService.chat` 按调用次数返回不同响应（第1次非法JSON、第2次修复后合法JSON等），mock `AiTaskExecutionService._call_json_repair` 返回预设修复文本，验证调用次数与返回结果。

## 文件清单

新建：
- `backend/apps/generation/management/commands/_json_repair_prompts.py` — json_repair prompt 模板
- `backend/apps/generation/tests/test_json_repair.py` — 单元测试

修改：
- `backend/apps/generation/constants.py` — 新增 `JSON_REPAIR` scenario
- `backend/apps/generation/management/commands/seed_prompts.py` — 注册 json_repair prompt
- `backend/apps/generation/services/ai_task_execution_service.py` — execute 重构 + `_try_parse_and_validate`/`_call_json_repair`/`_execute_with_repair`

无新增迁移（无新模型字段）。
