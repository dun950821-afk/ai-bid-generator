# 条款抽取分块上下文重构 + overwrite 清理 + RAG 移除

**日期**：2026-06-26
**主题**：修复条款抽取三个问题——(1) 重新抽取旧数据堆积；(2) RAG 死代码 + 改用解析分块作为辅助参考；(3) 评分项等抽取失败（document_text 不完整导致）
**方案**：方案 A（分块驱动的抽取 + overwrite 全删 + RAG 清理）

## 背景与根因

### 问题 1：重新抽取旧数据堆积
`backend/apps/requirements/services/requirement_extract_service.py` 的 `extract_requirements(overwrite=...)` 接收 `overwrite` 参数，但完全没读这个字段去删除旧条款。参数只存到 `RequirementExtractionRun.overwrite` 字段。`_create_requirement` 的 `existing` 检查基于 `requirement_key` 唯一性，但重新抽取用新 prompt 后 title 变了 → `requirement_key` 也变了 → 全部 insert 新条款，旧条款保留 → 堆积。

### 问题 2：RAG 死代码
`rag_options` 在 view → task → service 之间传递，但 service 完全没用。当前 V2 抽取只用 `DocumentTextService.get_document_text()` 提取的纯文本（python-docx 段落+表格），漏了 TenderChunk 的结构化分块信息（chunk_type/section_path/page_start/page_end）。

### 问题 3：评分项抽取失败
- 早期 v1.0 run #120：`document_text` = 83203 字符（旧版分块拼接，含元数据），抽到 18 条 scoring
- 最近 v2.0 run #935：`document_text` = 22203 字符（python-docx 提取，只段落+表格），抽到 0 条 scoring，LLM 返回 `{"items": []}`

v2.0 改用 `DocumentTextService` 后，document_text 比旧版少 61000 字符（73%）。LLM 看到的全文不完整，找不到评分项。

## 目标

- **问题 1**：overwrite=True 时全删该文件所有旧条款后重抽
- **问题 2**：删除前后端 RAG 死代码；service 改为用 TenderChunk 作为辅助参考上下文
- **问题 3**：作为问题 2 的副产物——给 LLM 喂「全文 + 结构化分块」双上下文，评分项不再被淹没

## 非目标

- 不改 `DocumentTextService`（保留全文提取，仍是主要依据）
- 不改 `_create_requirement` 的 `existing` 去重逻辑（同抽取内的重复 item 去重仍需要）
- 不动 playground 的 RAG 功能（独立模块）
- 不写迁移自动填充 `context_length`（由管理员手动配）

## 涉及范围

| 文件 | 改动 |
|------|------|
| `backend/apps/generation/models/model_config.py` | 新增 `context_length` 字段 |
| `backend/apps/generation/migrations/000X_add_context_length.py` | 新建迁移 |
| `backend/apps/generation/admin.py` | `ModelConfigAdmin` 注册 `context_length` |
| `backend/apps/requirements/services/requirement_extract_service.py` | (1) overwrite 删除逻辑；(2) 新增 `_build_chunk_context`；(3) variables 加 `chunk_context` |
| `backend/apps/generation/management/commands/seed_prompts.py` | 7 个模板 user_prompt 加分块段、variable_schema 加 `chunk_context` |
| `backend/apps/generation/management/commands/update_requirement_extraction_prompts.py` | 同步更新 user_prompt 和 variable_schema |
| `backend/apps/requirements/serializers.py` | 删除 `rag_options` 字段 |
| `backend/apps/requirements/views.py` | 删除 `rag_options` 透传 |
| `backend/apps/requirements/tasks.py` | 删除 `rag_options` 透传和 docstring |
| `frontend/src/components/requirements/RequirementExtractToolbar.vue` | 删除 RAG UI 和相关 ref/函数 |
| `frontend/src/components/requirements/RequirementTab.vue` | 删除 `ragOptions` 传参 |
| `frontend/src/api/requirements.ts` | 删除 `rag_options` 字段 |

## 详细设计

### 1. overwrite 全删后重抽

**触发**：`RequirementExtractionRun.overwrite=True`（前端"强制重新抽取" → `force=true` → task 转 `overwrite=true`）。

**位置**：`requirement_extract_service.py:84-100` 的 `extract_requirements` 方法开头，校验文件之后、创建 run 之前。

**逻辑**：
```python
# 1. 校验文件
tender_file = self._validate_tender_file(tender_file_id)
if progress_callback:
    progress_callback(5, "验证文件状态")

# 2. 校验抽取类型
valid_types = self._validate_extraction_types(extraction_types)

# 2.5 overwrite=True 时全删旧条款
if overwrite:
    deleted_count, _ = TenderRequirement.objects.filter(
        tender_file=tender_file
    ).delete()
    logger.info(
        "Overwrite mode: deleted %s existing requirements for tender_file=%s",
        deleted_count, tender_file_id,
    )
    if progress_callback:
        progress_callback(8, f"已清理 {deleted_count} 条旧条款")

# 3. 创建抽取运行记录
extraction_run = RequirementExtractionRun.objects.create(...)
```

**边界**：
- 文件从未抽取过：`delete()` 返回 0，正常继续
- 部分类型曾失败、部分有数据：全删，重抽后所有类型都是新数据
- 并发抽取：由前端 `existing_task` 检查（`RequirementExtractView` 第 62-74 行）拦截

**不破坏**：
- `_create_requirement` 的 `existing` 检查保留（同抽取内 LLM 返回重复 item 的去重）
- `RequirementExtractionRun` 历史记录保留（不删 run，只删 requirement）

### 2. 解析分块作为辅助参考

#### 2.1 数据来源

```python
from apps.tender.models import TenderChunk

chunks = (
    TenderChunk.objects
    .filter(
        parsed_document__tender_file=tender_file,
        parsed_document__is_active=True,
    )
    .exclude(content="")
    .order_by("page_start", "section_path", "id")
)
```

按页码排序让 LLM 看到文档自然阅读顺序。`page_start` 为 None 时用 `id` 兜底排序。

#### 2.2 分块拼接格式（全元数据）

每个分块拼接为：
```
=== 分块 #1 ===
类型: scoring
章节路径: 第三章 评标办法
页码: 24-25
内容:
[分块 content 全文]

=== 分块 #2 ===
类型: general
章节路径: 第二章 投标人须知
页码: 7-8
内容:
[分块 content 全文]

...
```

#### 2.3 新增 `_build_chunk_context` 方法

放在 `requirement_extract_service.py` 中：

```python
def _build_chunk_context(self, tender_file: TenderFile, max_context_length: int) -> str:
    """构建解析分块上下文字符串。

    Args:
        tender_file: 招标文件实例
        max_context_length: 最大字符数上限

    Returns:
        拼接好的分块上下文字符串；无分块时返回空字符串
    """
    chunks = (
        TenderChunk.objects
        .filter(
            parsed_document__tender_file=tender_file,
            parsed_document__is_active=True,
        )
        .exclude(content="")
        .order_by("page_start", "section_path", "id")
    )

    if not chunks.exists():
        return ""

    parts = []
    current_length = 0
    total_count = chunks.count()
    for idx, chunk in enumerate(chunks, 1):
        page_info = ""
        if chunk.page_start is not None and chunk.page_end is not None:
            page_info = f"{chunk.page_start}-{chunk.page_end}"
        elif chunk.page_start is not None:
            page_info = str(chunk.page_start)

        block = (
            f"=== 分块 #{idx} ===\n"
            f"类型: {chunk.chunk_type}\n"
            f"章节路径: {chunk.section_path or '(无)'}\n"
            f"页码: {page_info or '(无)'}\n"
            f"内容:\n{chunk.content}\n"
        )
        if current_length + len(block) > max_context_length:
            parts.append(f"\n[注: 已截断，剩余 {total_count - idx + 1} 个分块未显示]")
            break
        parts.append(block)
        current_length += len(block)

    return "\n".join(parts)
```

#### 2.4 max_context_length 来源

从 `ModelConfig.context_length` 读取（§3 加这个字段）。换算关系：

```python
# context_length 是 token 数，中文约 1 字符 = 0.6 token
# 用字符数的 1.5 倍估算 token，留 30% 余量给 system_prompt + completion
max_context_chars = int(model_config.context_length * 0.5) if model_config.context_length else 64000
```

`context_length` 为 null 时 fallback 到 64000 字符（约 128K token 上下文的 50%）。

#### 2.5 传给 LLM 的 variables 变化

`_extract_single_type` 方法中，variables 新增 `chunk_context`：

```python
# 获取 model_config（用于 context_length）
model_config = self._get_model_config(model_config_id)

# 构建分块上下文
max_context_chars = int(model_config.context_length * 0.5) if model_config and model_config.context_length else 64000
chunk_context = self._build_chunk_context(tender_file, max_context_chars)

variables = {
    "document_text": document_text,  # 全文（主要依据）
    "chunk_context": chunk_context,  # 分块（辅助参考，新增）
    "extraction_type": extraction_type,
    "extraction_type_name": EXTRACTION_TYPE_NAMES.get(extraction_type, extraction_type),
}
```

`_get_model_config` 是新增的辅助方法，封装 model_config 查找逻辑（优先用传入的 `model_config_id`，fallback 到默认 chat 模型）：

```python
def _get_model_config(self, model_config_id: int | None):
    """获取模型配置。优先用指定 ID，否则用默认 chat 模型。"""
    from apps.generation.models import ModelConfig
    if model_config_id:
        mc = ModelConfig.objects.filter(pk=model_config_id, is_active=True).first()
        if mc:
            return mc
    return ModelConfig.objects.filter(is_active=True, is_default=True, model_type="chat").first()
```

### 3. ModelConfig 新增 context_length 字段

#### 3.1 字段定义

```python
context_length = models.IntegerField(
    "上下文长度（token）",
    null=True,
    blank=True,
    help_text="模型最大上下文 token 数（如 DeepSeek 128000 或 1000000）。留空使用默认 128000。",
)
```

- `null=True`：数据库允许 NULL
- `blank=True`：admin 表单允许空
- 不设 default
- 代码读取时 fallback 到 128000

#### 3.2 迁移

用 `python manage.py makemigrations generation` 自动生成，依赖最新迁移。

#### 3.3 admin 注册

`backend/apps/generation/admin.py` 的 `ModelConfigAdmin.list_display` 和 `fieldsets` 加入 `context_length`。

#### 3.4 现有模型配置补数据

Docker 部署后，管理员在 admin 页面（http://163.7.6.60/admin/generation/modelconfig/）为 DeepSeek 模型填入：
- DeepSeek Chat（标准）：128000
- DeepSeek V4（如果支持 1M）：1000000

### 4. prompt 模板改动

#### 4.1 user_prompt 加「解析分块参考」段

7 个条款抽取模板的 user_prompt 都加一段。以 `requirement_extraction_scoring.default` 为例：

从：
```
请从以下招标文件中抽取所有评分项：

**文档内容**：
{{ document_text }}

**抽取类型**：{{ extraction_type_name }}

请抽取所有评分相关条款，以 JSON 格式输出。
```

改为：
```
请从以下招标文件中抽取所有评分项：

**文档内容**（主要依据，完整全文）：
{{ document_text }}

**解析分块参考**（带章节路径和页码的结构化分块，辅助定位）：
{{ chunk_context }}

**抽取类型**：{{ extraction_type_name }}

请抽取所有评分相关条款，以 JSON 格式输出。
```

7 个模板都加同样的 `**解析分块参考**` 段，位置在 `document_text` 之后、`抽取类型` 之前。

#### 4.2 variable_schema 加 chunk_context

7 个模板的 `variable_schema.properties` 都加：
```python
"chunk_context": {"type": "string", "description": "解析分块参考（带章节路径和页码的结构化分块）"},
```

`required` 不加 `chunk_context`（某些文件可能没有分块，此时为空字符串仍能抽取）。

#### 4.3 system_prompt 不动

system_prompt 保留上一轮的「条款标题规则」段，本轮只动 user_prompt 和 variable_schema。

#### 4.4 scoring 模板额外加强

`requirement_extraction_scoring.default` 的 system_prompt 加一句评分项定位提示：

```
6. 评分项通常出现在「评标办法」「评分标准」章节，重点关注含分值、评分标准、得分率的分块
```

其他 6 个模板不加类型特定提示。

#### 4.5 seed_prompts.py 和 update 命令同步

两处都改：
- `seed_prompts.py`：7 个模板的 `user_prompt` 加分块段、`variable_schema` 加 `chunk_context` 变量
- `update_requirement_extraction_prompts.py`：
  - 检查 user_prompt 是否已含 `chunk_context` 标记，没有则在 `{{ document_text }}` 之后插入分块段
  - 检查 variable_schema 是否已含 `chunk_context`，没有则添加

### 5. RAG 死代码清理

#### 5.1 后端清理

**`backend/apps/requirements/serializers.py`**：
- `RequirementExtractSerializer` 删除 `rag_options` 字段（第 41-45 行）

**`backend/apps/requirements/views.py`**：
- `RequirementExtractView.post`：
  - 删除 `input_payload` 中的 `rag_options`（第 90 行）
  - 删除 `extract_requirements_task.apply_async` args 中的 `rag_options`（第 102 行）

**`backend/apps/requirements/tasks.py`**：
- `extract_requirements_task`：删除 docstring 中 `rag_options` 说明
- `extract_requirements_v2`：删除 docstring 中 `rag_options`（如有）

#### 5.2 前端清理

**`frontend/src/components/requirements/RequirementExtractToolbar.vue`**：
- 删除整个 RAG 配置面板（`<div v-if="ragEnabled" class="rag-config">...</div>`）
- 删除 RAG 开关 checkbox
- 删除 `ragEnabled` ref、`ragConfig` ref、`knowledgeBases` ref、`loadKnowledgeBases` 函数
- 删除 `ExtractPayload.ragOptions` 字段
- 删除 `emit('extract', {...})` 中的 `ragOptions`

**`frontend/src/components/requirements/RequirementTab.vue`**：
- 删除 `handleExtract` 中传给 `extractRequirements` 的 `rag_options`
- 删除 `ExtractPayload` 接口中的 `ragOptions` 字段

**`frontend/src/api/requirements.ts`**：
- 删除 `RequirementExtractPayload.rag_options` 字段

#### 5.3 不动的部分

- `backend/apps/generation/views/playground_views.py`：playground 的 RAG 功能是独立的，不动
- `backend/apps/requirements/services/requirement_extract_service.py`：service 本来就没用 `rag_options`

#### 5.4 兼容性

旧版前端缓存可能仍发 `rag_options` 字段——后端 serializer 删字段后，DRF 会忽略未知字段（`Serializer.is_valid` 不会报错），兼容。新前端不再发该字段。

## 测试

### 服务层测试（扩展 `test_requirement_extraction.py`）
- `test_extract_requirements_overwrite_deletes_old`: overwrite=True 时删除该文件所有旧条款
- `test_extract_requirements_no_overwrite_keeps_old`: overwrite=False 时保留旧条款
- `test_build_chunk_context_with_chunks`: 有分块时返回带元数据的字符串
- `test_build_chunk_context_no_chunks`: 无分块时返回空字符串
- `test_build_chunk_context_truncates_at_limit`: 超限时截断并标注剩余数

### update 命令测试（扩展 `test_update_requirement_extraction_prompts.py`）
- `test_v2_user_prompt_contains_chunk_context`: v2.0 的 user_prompt 含 `{{ chunk_context }}`
- `test_v2_variable_schema_has_chunk_context`: v2.0 的 variable_schema 含 `chunk_context` 属性
- `test_v2_variable_schema_chunk_context_not_required`: `chunk_context` 不在 required 列表

### seed_prompts 测试（扩展 `test_seed_prompts.py`）
- `test_seed_prompts_clause_user_prompt_has_chunk_context`: 7 个模板的 user_prompt 含 `{{ chunk_context }}`
- `test_seed_prompts_clause_variable_schema_has_chunk_context`: 7 个模板的 variable_schema 含 `chunk_context`

### ModelConfig 测试
- `test_context_length_nullable`: context_length 可为 null
- `test_context_length_default_fallback`: 代码读取时 null fallback 到 128000（通过 `_build_chunk_context` 的 max_context_chars 验证）

### 开发完成后的验证
- 运行受影响测试 + 全量套件
- 重建镜像 → `docker exec ai-bid-generator-web-1 python manage.py migrate` → 运行 update 命令 → 重启 nginx → 在 admin 配置 DeepSeek 的 `context_length` → 重新抽取验证 scoring 不为 0

### 不做的测试
- 不测 LLM 是否真能用分块抽到 scoring（LLM 行为，端到端验证留给手动）
- 不测 RAG 删除后的兼容性（DRF 自动忽略未知字段）

## 风险与权衡

| 风险 | 缓解 |
|------|------|
| 分块拼接后 token 暴增超模型上下文 | 从 `ModelConfig.context_length` 读取上限，按 50% 换算字符数截断；DeepSeek 支持 128K/1M，足够 |
| 管理员忘记配 context_length | null 时 fallback 到 64000 字符（约 128K 上下文），仍能工作 |
| overwrite 全删误删 | 只在 `overwrite=True` 触发，前端"开始抽取"按钮传 false；并发由 existing_task 拦截 |
| 旧前端缓存仍发 rag_options | DRF 自动忽略未知字段，兼容 |
| scoring 模板 system_prompt 加提示后影响其他模板 | 只改 scoring 模板，其他 6 个不动 |

## 实施顺序

1. ModelConfig 加 context_length 字段 + 迁移 + admin
2. service 加 `_build_chunk_context` 和 overwrite 删除逻辑
3. seed_prompts.py 和 update 命令同步更新 user_prompt + variable_schema
4. 后端清理 RAG（serializer/views/tasks）
5. 前端清理 RAG UI 和 API 字段
6. 扩展测试
7. 全量测试 + Docker 部署验证
