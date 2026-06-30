# 批量生成并发 + 字数不足扩写设计（P2-2 + P2-3，借鉴 OpenBidKit）

## Context

本项目批量正文生成走 `batch_section_generation_task`，while 循环串行处理每个章节，10 万字标书 60 章节要 30+ 分钟。且生成后无字数兜底，章节字数不足就接受。

OpenBidKit 的 `runContentGenerationTask` 用 `runWorkerPool` 并发处理章节（并发数可配，3-5 倍提速），生成后用 `expandOneSection` 对字数不足的章节做局部 insert/replace 扩写，多轮直到达标。

本设计合并实现：P2-2 Celery group/chord 并发 + P2-3 批量生成后统一扩写。

## 需求（已确认）

1. **并发实现**：Celery group/chord（非线程池）
2. **扩写触发**：批量生成完成后统一检查（非单章实时）
3. **扩写操作**：局部 insert/replace，不重写整章
4. **扩写多轮**：直到达标或 MAX_EXPAND_ROUNDS

## 架构

### P2-2 并发

批量生成从"while 串行"改为 Celery group/chord：

```
batch_section_generation_task
  ├─ 1. 收集所有 pending 章节 ID
  ├─ 2. group(generate_single_section_for_batch.s(sid, task_id) for sid in ids)  ← 并发
  ├─ 3. chord(group, on_batch_complete.s(task_id))  ← 全部完成后回调
  └─ 4. on_batch_complete: _finalize_batch_task + 触发一致性审计 + 触发扩写
```

并发数由 Celery worker 的 `--concurrency` 控制（docker-compose 已配置），group 自动派发。

### P2-3 扩写

批量生成完成后（chord 回调），统计不足字数的章节，统一扩写：

```
on_batch_complete (chord 回调)
  ├─ 1. _finalize_batch_task（现有）
  ├─ 2. 触发一致性审计（现有）
  └─ 3. 【新增】触发 expand_sections_task.delay(outline_id, minimum_words)
        ├─ 统计字数 < minimum_words 的章节
        ├─ 逐章调 expand scenario（insert/replace 局部操作）
        ├─ 多轮直到达标或达到最大轮次
        └─ 更新 Section.content
```

## 数据模型

无新增表。新增：
- `PromptScenario.SECTION_EXPAND = "section_expand"`（扩写 prompt）
- settings 配置：
  - `CONTENT_CONCURRENCY = 3`（并发数，参考用，实际由 worker --concurrency 决定）
  - `MIN_SECTION_WORDS = 500`（单章最低字数）
  - `MAX_EXPAND_ROUNDS = 2`（最大扩写轮次）

## Prompt（P2-3 扩写，移植 OpenBidKit buildContentExpansionMessages）

**`section_expand.default`**：
- **system**：`你是投标技术方案正文扩写助手。请只针对指定章节进行扩写，避免与其他章节重复。要求：1.只返回JSON。2.只返回一次局部扩写操作。3.operation 只能 insert/replace。4.insert 的 anchor 填插入位置或 end。5.replace 的 anchor 必须填要替换的原段落关键摘录。6.content 只写新增/替换片段，不含标题。7.禁止图片/Mermaid/代码块。8.严禁 Markdown 标题语法。9.扩写优先使用全局事实变量值，不得新增前后不一致承诺。返回 {"operation":"","anchor":"","content":""}`
- **user**：绑定 `{{ project_overview }}`、`{{ outline_structure }}`、`{{ selected_facts }}`、`{{ chapter_path }}`、`{{ chapter_description }}`、`{{ sibling_chapters }}`、`{{ current_content }}`、`{{ current_words }}`、`{{ target_words }}`
- **output_schema**：`{operation: enum[insert,replace], anchor: string, content: string}`

## 服务层

### P2-2 并发

- `batch_section_generation_task` 重构：收集 pending IDs → 构建 group → chord 回调 `on_batch_complete`
- 新增 `generate_single_section_for_batch` task：单个章节生成（复用 `_execute_single_section_generation`），更新 BatchGenerationTaskItem 状态
- 新增 `on_batch_complete` task（chord 回调）：调 `_finalize_batch_task` + 触发一致性审计 + 触发扩写

```python
@shared_task
def generate_single_section_for_batch(section_id, task_id, user_id):
    """单个章节生成（并发子任务）。"""
    try:
        _execute_single_section_generation(section_id, ...)
        BatchGenerationTaskItem.objects.filter(task_id=task_id, section_id=section_id).update(status="success")
    except Exception as e:
        BatchGenerationTaskItem.objects.filter(task_id=task_id, section_id=section_id).update(status="failed", error_message=str(e)[:500])

@shared_task
def on_batch_complete(results, task_id):
    """chord 回调：全部子任务完成后收尾。"""
    _finalize_batch_task(GenerationTask.objects.get(pk=task_id))
    # 触发一致性审计（现有逻辑）
    # 触发扩写
    expand_sections_task.delay(outline_id, minimum_words, user_id)
```

### P2-3 扩写

新增 `SectionExpandService`（`apps/outline/services/section_expand_service.py`）：

```python
class SectionExpandService:
    def run_expand(self, outline_id, minimum_words, user, async_task=None) -> dict:
        """统计不足章节，逐章扩写，多轮直到达标或 MAX_EXPAND_ROUNDS。"""
        # 1. 收集字数 < minimum_words 的叶子章节
        # 2. 多轮：每轮逐章调 expand，应用 patch
        # 3. 统计扩写前后字数变化

    def expand_section(self, section_id, user) -> dict:
        """单章扩写：调 AI 返回 patch，应用 insert/replace。"""
        # 1. 构建 expand prompt 变量（current_content/current_words/target_words）
        # 2. 调 AiTaskExecutionService.execute(scenario="section_expand")
        # 3. _apply_patch 应用局部操作
        # 4. 更新 Section.content

    def _apply_patch(self, content: str, patch: dict) -> str:
        """应用 insert/replace 局部操作（移植 OpenBidKit applyContentExpansionPatch）。"""
        # insert anchor=end: 追加
        # insert anchor=段落摘录: 在该段落后插入
        # replace anchor=段落摘录: 替换该段落
```

新增 `expand_sections_task` Celery 任务，进度写入 AsyncTask。

## 关键设计

**并发**：
- 保留暂停/取消：group 派发前检查状态，chord 回调里检查取消
- 失败隔离：单章失败不阻断其他，BatchGenerationTaskItem 记 failed
- 并发数 = worker 的 `--concurrency`（docker-compose 配置），group 自动派发
- 状态聚合：chord 回调统一更新 GenerationTask 统计

**扩写**：
- 批量生成后独立阶段，不拖慢生成
- 局部 insert/replace 操作，不重写整章（保留已生成内容）
- 多轮直到达标或 MAX_EXPAND_ROUNDS
- 扩写也走 json_repair 容错（P2-4 已统一）
- target_words = max(current_words * 2, current_words + 200)

## 测试

`apps/outline/tests/test_batch_concurrency.py`：
```python
def test_group_dispatch_all_sections()      # group 派发所有 pending
def test_single_section_failure_isolated()   # 单章失败不阻断
def test_chord_callback_finalizes()          # chord 回调调 _finalize
```

`apps/outline/tests/test_section_expand.py`：
```python
def test_expand_insert_anchor_end()          # insert anchor=end 追加
def test_expand_insert_after_anchor()        # insert 在指定段落后
def test_expand_replace_anchor()             # replace 替换指定段落
def test_expand_multi_round()               # 多轮直到达标
def test_expand_skip_already_long()          # 字数足够跳过
```

mock 策略：mock `AiTaskExecutionService.execute` 返回预设 patch，mock `_execute_single_section_generation` 验证 group 派发。

## 文件清单

新建：
- `backend/apps/generation/management/commands/_section_expand_prompts.py` — 扩写 prompt
- `backend/apps/outline/services/section_expand_service.py` — 扩写服务
- `backend/apps/outline/tests/test_batch_concurrency.py` — 并发测试
- `backend/apps/outline/tests/test_section_expand.py` — 扩写测试

修改：
- `backend/apps/generation/constants.py` — 新增 `SECTION_EXPAND` scenario
- `backend/apps/generation/management/commands/seed_prompts.py` — 注册扩写 prompt
- `backend/apps/outline/tasks.py` — 重构 `batch_section_generation_task` 为 group/chord + 新增 `generate_single_section_for_batch`/`on_batch_complete`/`expand_sections_task`
- `backend/config/settings/base.py` — 新增 `CONTENT_CONCURRENCY`/`MIN_SECTION_WORDS`/`MAX_EXPAND_ROUNDS`

无新增迁移。
