# P3 正文增强四件套设计（表格清理 + 字数补目录 + Mermaid 配图 + AI 生图）

## Context

P0/P1/P2 已完成（全局事实、目录审核、正文反 AI 味、废标检查、一致性审计、JSON 修复器、批量并发、字数扩写）。P3 补齐正文增强能力：表格清理、字数补目录、Mermaid 配图、AI 生图。

**借鉴说明**：OpenBidKit 当前仓库版本（截至 2026-06-30）只实现了 P0/P1/P2 的能力，P3 这 4 项在仓库中不存在源码（README 提到的"Mermaid 预览、正文配图"可能是规划中或已移除）。因此 P3 无法"严格学习 OpenBidKit 代码实现"，需自主设计，但遵循本项目既有体系锚点（PromptTemplate Jinja2 入库、AiTaskExecutionService.execute、AsyncTask 跟踪、StorageService MinIO）。

## 需求（已确认）

1. **表格清理**：用户手动触发单章，AI 逐表判断"保留/转文字"，转文字的用 AI 生成的文字描述替换
2. **字数补目录**：用户手动触发大纲级，输入目标总字数，AI 补充二三四级子目录扩展生成空间，不删现有目录，不自动生成正文
3. **Mermaid 配图**：批量生成完成后自动触发，扫描 `content_plan.mermaid.needed=true` 章节统一生成 Mermaid 代码，调 mermaid.ink 外部渲染校验，失败修复 1 次
4. **AI 生图**：批量生成完成后自动触发，扫描 `content_plan.image.needed=true` 章节统一处理；配置了生图模型（`settings.IMAGE_GEN_MODEL`）则调模型生图存 MinIO 嵌入正文，未配置则只生成 image_prompt 存字段统一提示手动生图

## 架构

### 统一模式

4 项共享统一架构：
- 每项 1 个 `PromptScenario` 常量 + 1 个 prompt 模板（Jinja2 入库）
- 每项 1 个服务类 + 1 个 Celery task + AsyncTask 跟踪
- AI 调用统一走 `AiTaskExecutionService.execute`（含 P2-4 JSON 修复器）
- 图片存储统一走 `StorageService` MinIO

### 触发模式

- **表格清理**：用户手动触发单章（章节编辑器按钮）
- **字数补目录**：用户手动触发大纲级（大纲页按钮 + 输入目标字数）
- **Mermaid 配图**：批量生成完成后自动触发（`on_batch_complete` 链），也支持单章手动重新触发
- **AI 生图**：批量生成完成后自动触发（`on_batch_complete` 链，在 Mermaid 之后），也支持单章手动重新触发

### 批量后完整阶段链

```
on_batch_complete (chord 回调)
  ├─ 1. _finalize_batch_task（含一致性审计触发，现有）
  ├─ 2. expand_sections_task（字数不足扩写，P2-3 现有）
  ├─ 3. mermaid_illustration_task（Mermaid 配图，P3 新增）
  └─ 4. image_generation_task（AI 生图，P3 新增）
```

4 个阶段串行触发（非并行），每阶段独立 AsyncTask，前一阶段失败不阻断后一阶段（try/except 包裹）。

## 数据模型

### Section 模型扩展（`apps/outline/models/section.py`）

新增 5 个字段：

```python
mermaid_code = models.TextField("Mermaid 代码", blank=True, default="",
    help_text="Mermaid 配图代码，渲染成功后存入")
mermaid_object_key = models.CharField("Mermaid 图片对象键", max_length=500, blank=True, default="",
    help_text="MinIO 中渲染后的 PNG 对象键")
image_prompt = models.TextField("生图提示词", blank=True, default="",
    help_text="AI 生图 prompt，未配置生图模型时存此字段供手动生图")
image_object_key = models.CharField("生图对象键", max_length=500, blank=True, default="",
    help_text="MinIO 中生成的图片对象键")
```

新增迁移 `0015_section_mermaid_image_fields.py`。

### settings 配置（`config/settings/base.py`）

```python
# ========== P3 正文增强配置 ==========
MERMAID_RENDER_URL = env("MERMAID_RENDER_URL", default="https://mermaid.ink")
MERMAID_RENDER_TIMEOUT = env.int("MERMAID_RENDER_TIMEOUT", default=30)
IMAGE_GEN_MODEL = env("IMAGE_GEN_MODEL", default="")  # 生图模型名，空则只生成 prompt
```

### PromptScenario 新增（`apps/generation/constants.py`）

```python
TABLE_CLEANUP = "table_cleanup"              # 表格清理
OUTLINE_EXPAND = "outline_expand"            # 字数补目录
MERMAID_ILLUSTRATION = "mermaid_illustration"  # Mermaid 配图
IMAGE_GENERATION = "image_generation"        # AI 生图 prompt
```

## Prompt 设计（4 个新 scenario，Jinja2 入库）

### table_cleanup.default

- **system**：`你是投标技术方案表格清理助手。判断每个表格是否适合用表格表达。要求：1.参数表/报价表/规格表/对比表保留。2.只有 1-2 行数据的表格转文字。3.表头为空或单元格是长句的表格转文字。4.单列表格转文字。5.keep=true 时 text替代留空。6.keep=false 时 text替代 写纯文字描述，不含 Markdown 表格语法。7.严禁 Markdown 标题语法。8.只返回 JSON。`
- **user**：`{{ chapter_title }}\n{{ write_scope }}\n待判断表格：\n{{ table_markdown }}`
- **output_schema**：`{keep: boolean, reason: string, text替代: string}`

### outline_expand.default

- **system**：`你是投标技术方案目录扩展助手。当前正文总字数不达标，请补充子目录扩展生成空间。要求：1.只补充二三四级子目录，不删现有目录。2.新增子目录须挂在现有叶子章节下，level 递增。3.不得修改一级目录标题与顺序。4.每个新增子目录 write_scope 须明确写作范围，避免与兄弟章节重复。5.围绕招标评分大类与细项展开，不越界。6.只返回 JSON {"added_sections":[...]}。`
- **user**：`{{ project_overview }}\n{{ outline_structure }}\n{{ current_word_stats }}\n目标总字数：{{ target_total_words }}\n评分大类：{{ requirement_groups }}`
- **output_schema**：`{added_sections: [{parent_section_id: int, title: str, level: int, write_scope: str}]}`

### mermaid_illustration.default

- **system**：`你是投标技术方案 Mermaid 配图助手。请为指定章节生成 Mermaid 图表代码。要求：1.只返回 JSON {"mermaid_code":"","diagram_type":""}。2.mermaid_code 必须是合法 Mermaid 语法（flowchart/sequenceDiagram/classDiagram 等）。3.围绕章节核心流程/架构/关系展开。4.节点文字用中文，简洁。5.禁止 Markdown 代码块包裹。6.禁止外部图片链接。7.diagram_type 填图表类型。`
- **user**：`{{ chapter_title }}\n{{ write_scope }}\n章节摘要：{{ chapter_summary }}`
- **修复时 user 追加**：`上一次生成的代码渲染失败：{{ render_error }}\n请修复后重新生成。`
- **output_schema**：`{mermaid_code: str, diagram_type: str}`

### image_generation.default

- **system**：`你是投标技术方案配图提示词助手。请为指定章节生成 AI 生图提示词。要求：1.只返回 JSON {"image_prompt":"","style":"","negative_prompt":""}。2.image_prompt 用英文描述图片内容，详细具体（主体/场景/视角/光线）。3.style 填画风（如 flat illustration / technical diagram / isometric）。4.negative_prompt 填要避免的元素。5.围绕章节核心内容展开，不出现真实人物/品牌/Logo。6.适合技术方案配图风格。`
- **user**：`{{ chapter_title }}\n{{ write_scope }}\n章节摘要：{{ chapter_summary }}\n配图用途：{{ image_purpose }}`
- **output_schema**：`{image_prompt: str, style: str, negative_prompt: str}`

## 服务层

### 1. TableCleanupService（`apps/outline/services/table_cleanup_service.py`）

```python
class TableCleanupService:
    def cleanup_section(self, section_id, user, async_task=None) -> dict:
        """单章表格清理：逐表调 AI 判断，转文字的替换。"""
        # 1. 正则提取 Section.content 中所有 Markdown 表格
        # 2. 逐表调 AiTaskExecutionService.execute(scenario="table_cleanup")
        #    - keep=true：保留原表格
        #    - keep=false：用 text替代 替换该表格（content.replace(原表格, text替代, 1)）
        # 3. 拼装新 content，覆盖 Section.content
        # 4. 创建 SectionVersion，更新 word_count
        # 5. 单表失败跳过不阻断其他表
        # 进度：(已处理表数 / 总表数) * 100
```

### 2. OutlineExpandService（`apps/outline/services/outline_expand_service.py`）

```python
class OutlineExpandService:
    def expand_outline(self, outline_id, target_total_words, user, async_task=None) -> dict:
        """大纲级字数补目录：AI 补二三四级子目录。"""
        # 1. 统计当前总字数 + 目录结构
        # 2. 调 AiTaskExecutionService.execute(scenario="outline_expand")
        # 3. 逐条创建 Section（挂到 parent_section_id 下，level=parent.level+1，不超过 5 级）
        #    sort_order 排在 parent 现有 children 末尾
        # 4. 返回 diff：{added: [...], new_total_estimated: N}
        # 5. 不自动生成正文，提示用户对新章节生成
        # 失败兜底：AI 返回空 added_sections 则提示"无需补充"
```

### 3. MermaidIllustrationService（`apps/outline/services/mermaid_illustration_service.py`）

```python
class MermaidIllustrationService:
    def run_illustration(self, outline_id, user, async_task=None) -> dict:
        """批量扫描 mermaid.needed=true 章节统一生成 Mermaid 配图。"""
        # 1. 收集 content_plan.mermaid.needed=true 且 mermaid_code 为空的章节
        # 2. 逐章 _generate_for_section
        # 3. 单章失败跳过不阻断

    def _generate_for_section(self, section, user) -> dict:
        """单章：调 AI 生成 mermaid_code → 渲染校验 → 失败修复 1 次 → 存 MinIO + 嵌入正文。"""
        # 1. 调 AiTaskExecutionService.execute(scenario="mermaid_illustration")
        # 2. _render_mermaid(code) 调 mermaid.ink 渲染
        # 3. 失败：带 render_error 调 AI 修复 1 次，再渲染
        # 4. 成功：mermaid_code 存 Section.mermaid_code
        #    PNG 存 MinIO（object_key=mermaid/{outline_id}/{section_id}.png），mermaid_object_key 存字段
        #    正文末尾追加 ```mermaid\n{code}\n``` 代码块
        # 5. 2 次都失败：记 mermaid_code 但不嵌入正文，记警告

    def _render_mermaid(self, code: str) -> bytes | None:
        """调 mermaid.ink 渲染 Mermaid 代码为 PNG。失败返回 None。"""
        # GET {MERMAID_RENDER_URL}/img/{base64(code)}
        # 成功（HTTP 200 + image/png）返回 PNG bytes
```

### 4. ImageGenerationService（`apps/outline/services/image_generation_service.py`）

```python
class ImageGenerationService:
    def run_generation(self, outline_id, user, async_task=None) -> dict:
        """批量扫描 image.needed=true 章节统一处理。"""
        # 1. 收集 content_plan.image.needed=true 且 image_object_key 为空的章节
        # 2. 逐章 _generate_for_section
        # 3. 单章失败跳过不阻断

    def _generate_for_section(self, section, user) -> dict:
        """单章：调 AI 生成 image_prompt → 若配置模型则生图存 MinIO+嵌入，否则只存 prompt。"""
        # 1. 调 AiTaskExecutionService.execute(scenario="image_generation") 生成 prompt
        # 2. image_prompt 存 Section.image_prompt
        # 3. 分支：
        #    - settings.IMAGE_GEN_MODEL 非空：调 LLMService.generate_image 生图
        #      成功：存 MinIO（images/{outline_id}/{section_id}.png），image_object_key 存字段
        #            正文插入 ![章节标题](图片URL)
        #      失败：只存 prompt，标记 image_object_key 为空
        #    - settings.IMAGE_GEN_MODEL 为空：只存 prompt，async_task 记"未配置生图模型"

    def _call_image_model(self, prompt, negative_prompt) -> bytes | None:
        """调生图模型，返回图片 bytes。失败返回 None。"""
        # LLMService().generate_image(model=settings.IMAGE_GEN_MODEL, prompt, negative_prompt)
```

### LLMService 扩展（`apps/generation/providers/`）

- `base.py`：`LLMService` 加抽象方法 `generate_image(model, prompt, negative_prompt, size) -> bytes | None`
- `openai_compatible.py`：实现 `generate_image`，调 `/v1/images/generations` 接口

## Celery 任务（`apps/outline/tasks.py`）

新增 4 个 task：

```python
@shared_task(bind=True)
def table_cleanup_task(self, section_id, async_task_id, user_id):
    """单章表格清理（手动触发）。"""

@shared_task(bind=True)
def outline_expand_task(self, outline_id, target_total_words, async_task_id, user_id):
    """大纲级字数补目录（手动触发）。"""

@shared_task(bind=True)
def mermaid_illustration_task(self, outline_id, async_task_id, user_id):
    """Mermaid 配图（批量后自动 + 手动重新触发）。"""

@shared_task(bind=True)
def image_generation_task(self, outline_id, async_task_id, user_id):
    """AI 生图（批量后自动 + 手动重新触发）。"""
```

### on_batch_complete 追加触发

```python
@shared_task
def on_batch_complete(results, task_id):
    # 1. _finalize_batch_task（含一致性审计，现有）
    # 2. expand_sections_task（P2-3 现有）
    # 3. mermaid_illustration_task（P3 新增，try/except 不阻断）
    # 4. image_generation_task（P3 新增，try/except 不阻断）
```

## API/视图（`apps/outline/views.py`）

新增 6 个 action：

```python
# 表格清理（手动，单章）
POST /api/sections/{section_id}/table-cleanup/

# 字数补目录（手动，大纲级）
POST /api/outlines/{outline_id}/expand-outline/
    body: {"target_total_words": int}

# Mermaid 配图（手动重新触发，大纲级 + 单章）
POST /api/outlines/{outline_id}/mermaid-illustration/
POST /api/sections/{section_id}/mermaid-illustration/

# AI 生图（手动重新触发，大纲级 + 单章）
POST /api/outlines/{outline_id}/image-generation/
POST /api/sections/{section_id}/image-generation/
```

所有 action 返回 AsyncTask id，前端轮询进度。

## 前端

- 章节编辑器：新增"表格清理""Mermaid 配图""AI 生图"3 个按钮
- 大纲页工具栏：新增"字数补目录"按钮（弹窗输入目标总字数）+"Mermaid 配图""AI 生图"批量按钮
- 未配置生图模型时：章节编辑器展示 `image_prompt` + 提示条"未配置生图模型（IMAGE_GEN_MODEL），已生成 prompt 供手动生图"

## 关键设计

- **统一走 AiTaskExecutionService**：4 项的 AI 调用都走 `execute`，含 P2-4 JSON 修复器容错
- **统一走 StorageService**：Mermaid PNG 与 AI 生图都存 MinIO，DB 只存对象键
- **批量后串行链**：Mermaid/生图在扩写之后串行触发，每阶段独立 AsyncTask，失败不阻断
- **表格清理逐表调 AI**：非整章一次，避免 token 浪费，单表失败跳过
- **字数补目录不自动生成正文**：补目录后新章节 content 为空，用户在"批量生成"或"内容责任矩阵"里生成
- **Mermaid 渲染失败修复 1 次**：共最多 2 次渲染 + 1 次修复，都失败不嵌入正文
- **AI 生图降级**：未配置 `IMAGE_GEN_MODEL` 时只存 prompt，不阻断流程
- **正文嵌入**：Mermaid 用 ```mermaid 代码块（Markdown 预览兼容），AI 生图用 `![title](url)` 图片语法

## 测试

### test_table_cleanup.py

```python
def test_table_keep()                    # AI 返回 keep=true，表格保留
def test_table_convert_to_text()         # AI 返回 keep=false，表格替换为文字
def test_single_table_failure_isolated() # 单表失败跳过
def test_no_tables_skip()                # 无表格跳过
```

### test_outline_expand.py

```python
def test_add_sections_under_leaf()       # 新子目录挂在叶子下
def test_level_not_exceed_5()            # level 不超过 5
def test_empty_added_returns()           # AI 返回空，提示无需补充
def test_first_level_unchanged()         # 一级目录不被修改
```

### test_mermaid_illustration.py

```python
def test_render_success_embed()          # 渲染成功存 MinIO + 嵌入正文
def test_render_fail_repair_success()    # 首次失败，修复后渲染成功
def test_render_fail_twice_no_embed()    # 2 次都失败，不嵌入正文
def test_skip_already_has_mermaid()     # mermaid_code 非空跳过
```

### test_image_generation.py

```python
def test_image_gen_success_embed()       # 配置模型 + 生图成功，存 MinIO + 嵌入
def test_image_gen_fail_keep_prompt()    # 生图失败，只存 prompt
def test_no_model_only_prompt()         # 未配置模型，只存 prompt + 提示
def test_skip_already_has_image()       # image_object_key 非空跳过
```

mock 策略：mock `AiTaskExecutionService.execute` 返回预设 JSON，mock `requests.get`（mermaid.ink 渲染）返回预设 PNG/失败，mock `LLMService.generate_image` 返回预设图片 bytes/None。

## 文件清单

新建：
- `backend/apps/generation/management/commands/_table_cleanup_prompts.py`
- `backend/apps/generation/management/commands/_outline_expand_prompts.py`
- `backend/apps/generation/management/commands/_mermaid_illustration_prompts.py`
- `backend/apps/generation/management/commands/_image_generation_prompts.py`
- `backend/apps/outline/services/table_cleanup_service.py`
- `backend/apps/outline/services/outline_expand_service.py`
- `backend/apps/outline/services/mermaid_illustration_service.py`
- `backend/apps/outline/services/image_generation_service.py`
- `backend/apps/outline/migrations/0015_section_mermaid_image_fields.py`
- `backend/apps/outline/tests/test_table_cleanup.py`
- `backend/apps/outline/tests/test_outline_expand.py`
- `backend/apps/outline/tests/test_mermaid_illustration.py`
- `backend/apps/outline/tests/test_image_generation.py`

修改：
- `backend/apps/generation/constants.py` — 4 个 scenario
- `backend/apps/generation/management/commands/seed_prompts.py` — 注册 4 个 prompt
- `backend/apps/outline/models/section.py` — 5 个新字段
- `backend/apps/outline/tasks.py` — 4 个新 task + on_batch_complete 追加 Mermaid/生图触发
- `backend/apps/outline/views.py` — 6 个新 action
- `backend/apps/outline/serializers.py` — 暴露新字段
- `backend/apps/generation/providers/base.py` + `openai_compatible.py` — `generate_image` 方法
- `backend/config/settings/base.py` — 3 个 settings
- 前端：章节编辑器 3 按钮 + 大纲页 3 按钮 + API

## 实施顺序

```
Task 1: 数据模型 + 4 scenario + 4 prompt + settings（基础）
Task 2: 表格清理服务 + 测试（手动）
Task 3: 字数补目录服务 + 测试（手动）
Task 4: Mermaid 配图服务 + 测试（自动，含 mermaid.ink 渲染）
Task 5: AI 生图服务 + 测试（自动，含 LLMService.generate_image 扩展）
Task 6: on_batch_complete 追加触发 + 部署验证
```

无新增模型表（仅 Section 加字段），1 个迁移。
