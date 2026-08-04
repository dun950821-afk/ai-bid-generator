# 提示词版本自动取最新 — 设计

日期：2026-08-04
状态：已批准

## 背景

`AiTaskExecutionService._get_prompt_version` 在未指定 `prompt_version_id` 时，
按模板 key 后缀硬优先级（`.antiai` > `.v2` > `.default`）选取 published 版本。
这意味着即使业务人员在前端发布了更新版本的 `.default` 模板，只要存在旧的
`.antiai` / `.v2` published 版本，系统仍会用旧版本，与「前端维护、所见即所得」策略相悖。

## 决策

1. **选版规则**：同一场景下 published 版本一律取**最新发布**者，去掉 key 后缀硬优先级。
   - 排序键 `-updated_at, -created_at`：`publish()` 保存时会刷新 `updated_at`，
     且 published 版本在前端不可编辑，因此 published 版本的 `updated_at` ≈ 发布时间。
   - 旧变体下线方式：前端归档版本或停用模板（`is_active` 机制已有）。
2. **覆盖参数保留**：`prompt_version_id` 作为可选覆盖保留（条款抽取 API/task、playground），
   默认走自动最新。

## 改动范围

仅 `_get_prompt_version`（`backend/apps/generation/services/ai_task_execution_service.py`）：

- 未传 `prompt_version_id`：`filter(scenario, system scope, is_active, PUBLISHED)`
  → `order_by("-updated_at", "-created_at")` → `.first()`
- 已传 `prompt_version_id`：维持现有按 pk + 模板启用精确查找

不需要动：`publish()`（每模板 ≤1 个 published 已由它保证）、模型、
`get_published_version` 序列化器（无歧义）。

## 测试

更新 `test_ai_task_execution_service.py` 的选版测试：

1. 同场景两个模板均 published：旧的 `.antiai` vs 新的 `.default` → 取新发布的 `.default`
2. 模板 `is_active=False` 的 published 版本被排除
3. archived 版本被排除
4. `prompt_version_id` 覆盖仍优先于自动选版

## 非目标

- 不改版本号生成（`1.0-copyN` 保持现状）
- 不加 published_at 字段
- 不改前端版本列表排序
