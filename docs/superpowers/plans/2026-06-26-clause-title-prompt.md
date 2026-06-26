# 条款抽取提示词标题规则强化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修改 7 个条款抽取提示词模板，要求 LLM 为每条条款生成 ≤10 字简短标题（优先原文小节标题），加固 schema required/title description，加固服务层 fallback，并提供迁移命令更新现有部署。

**Architecture:** 三处改动：(1) `seed_prompts.py` 同步更新 7 个模板的 system_prompt + output_schema，让代码仓库与运行环境一致；(2) `requirement_extract_service.py` 服务层 fallback 加固，LLM 违反时用 `content[:10] + "…"` 兜底；(3) 新建 `update_requirement_extraction_prompts.py` 迁移命令，按 `update_outline_prompt.py` 模式为现有部署的 7 个模板创建 v2.0 版本并 publish。

**Tech Stack:** Django 4.x + DRF + PostgreSQL + pytest-django

## Global Constraints

- 7 个模板的「标题规则」段措辞必须**完全一致**（见 Task 1 的常量定义）
- title 字段 description 统一为 `"条款标题（≤10字，优先原文小节标题，原文无标题时概括生成）"`
- 服务层 fallback：LLM 返回空 title 时用 `content[:10] + "…"`（当 `len(content) > 10`）；否则用 `content[:10]`（不加省略号）
- 迁移命令版本号固定 `2.0`，必须幂等
- 旧数据不迁移
- 所有测试必须在 `backend/` 目录用 `python -m pytest --tb=short -q` 运行通过

---

## File Structure

| 文件 | 责任 | 类型 |
|------|------|------|
| `backend/apps/generation/management/commands/seed_prompts.py` | 初始种子数据，包含 7 个条款抽取模板的 system_prompt / user_prompt / output_schema | 修改 |
| `backend/apps/generation/management/commands/update_requirement_extraction_prompts.py` | 迁移命令，把现有部署的 7 个模板升到 v2.0 并 publish | 新建 |
| `backend/apps/requirements/services/requirement_extract_service.py` | 服务层 fallback 加固（`_create_requirement` 第 314 行） | 修改 |
| `backend/apps/generation/tests/test_seed_prompts.py` | 扩展 seed_prompts 测试，验证标题规则段和 schema | 修改 |
| `backend/apps/generation/tests/test_update_requirement_extraction_prompts.py` | 新建 update 命令测试 | 新建 |
| `backend/apps/requirements/tests/test_requirement_extraction.py` | 扩展 `TestRequirementExtractServiceV2` 类，加 fallback 测试 | 修改 |

---

### Task 1: 修改 seed_prompts.py — 加标题规则段 + schema 加固

**Files:**
- Modify: `backend/apps/generation/management/commands/seed_prompts.py:189-682`（7 个条款抽取模板定义）

**Interfaces:**
- Consumes: 无
- Produces: 7 个模板的 system_prompt 末尾都包含「条款标题规则」段；`requirement_extraction.default` 的 required 包含 `title`；7 个模板的 title description 统一

- [ ] **Step 1: 在文件顶部定义标题规则常量**

打开 `backend/apps/generation/management/commands/seed_prompts.py`，在 imports 之后（约第 15 行附近，`PROMPT_TEMPLATES` 列表定义之前）添加常量：

```python
# 条款标题规则段 —— 7 个条款抽取模板共用，措辞必须一致
CLAUSE_TITLE_RULES = """**条款标题规则**：
1. title 必须有值，不得为空字符串
2. 优先使用原文中的小节/段落标题（如「资格要求」「付款方式」「投标截止时间」）
3. 原文无明确标题时，由你基于 content 概括生成不超过 10 个字的简短标题
4. 不得直接复制 content 全文作为 title
5. title 应能让评审人快速识别该条款要点，避免「其他」「相关要求」等模糊表述"""
```

- [ ] **Step 2: 修改 `requirement_extraction.default` 模板（约第 189 行）**

把 `system_prompt` 字符串的末尾从：

```
- clarification: 澄清补遗（答疑、更正通知等）
- other: 其他"""
```

改为：

```
- clarification: 澄清补遗（答疑、更正通知等）
- other: 其他

""" + CLAUSE_TITLE_RULES
```

把 `output_schema` 中 `title` 字段（约第 249 行）从：

```python
"title": {"type": "string", "description": "条款标题"},
```

改为：

```python
"title": {"type": "string", "description": "条款标题（≤10字，优先原文小节标题，原文无标题时概括生成）"},
```

把同一 schema 的 `required`（约第 291 行）从：

```python
"required": ["requirement_type", "content", "mandatory_level", "risk_level"],
```

改为：

```python
"required": ["requirement_type", "title", "content", "mandatory_level", "risk_level"],
```

- [ ] **Step 3: 修改 `requirement_extraction_scoring.default` 模板（约第 318 行）**

把 `system_prompt` 末尾从：

```
4. 如果找不到评分项，返回空数组 {"items": []}"""
```

改为：

```
4. 如果找不到评分项，返回空数组 {"items": []}

""" + CLAUSE_TITLE_RULES
```

把 `title` 字段 description（约第 350 行）从：

```python
"title": {"type": "string", "description": "条款标题"},
```

改为：

```python
"title": {"type": "string", "description": "条款标题（≤10字，优先原文小节标题，原文无标题时概括生成）"},
```

- [ ] **Step 4: 修改 `requirement_extraction_mandatory.default` 模板（约第 378 行）**

把 `system_prompt` 末尾从：

```
4. 如果找不到强制条款，返回空数组 {"items": []}"""
```

改为：

```
4. 如果找不到强制条款，返回空数组 {"items": []}

""" + CLAUSE_TITLE_RULES
```

把 `title` 字段（约第 411 行）从：

```python
"title": {"type": "string"},
```

改为：

```python
"title": {"type": "string", "description": "条款标题（≤10字，优先原文小节标题，原文无标题时概括生成）"},
```

- [ ] **Step 5: 修改 `requirement_extraction_qualification.default` 模板（约第 438 行）**

把 `system_prompt` 末尾从：

```
4. 如果找不到资格要求，返回空数组 {"items": []}"""
```

改为：

```
4. 如果找不到资格要求，返回空数组 {"items": []}

""" + CLAUSE_TITLE_RULES
```

把 `title` 字段（约第 472 行）从：

```python
"title": {"type": "string"},
```

改为：

```python
"title": {"type": "string", "description": "条款标题（≤10字，优先原文小节标题，原文无标题时概括生成）"},
```

- [ ] **Step 6: 修改 `requirement_extraction_commercial.default` 模板（约第 498 行）**

把 `system_prompt` 末尾从：

```
4. 如果找不到商务条款，返回空数组 {"items": []}"""
```

改为：

```
4. 如果找不到商务条款，返回空数组 {"items": []}

""" + CLAUSE_TITLE_RULES
```

把 `title` 字段（约第 532 行）从：

```python
"title": {"type": "string"},
```

改为：

```python
"title": {"type": "string", "description": "条款标题（≤10字，优先原文小节标题，原文无标题时概括生成）"},
```

- [ ] **Step 7: 修改 `requirement_extraction_technical.default` 模板（约第 559 行）**

把 `system_prompt` 末尾从：

```
4. 如果找不到技术要求，返回空数组 {"items": []}"""
```

改为：

```
4. 如果找不到技术要求，返回空数组 {"items": []}

""" + CLAUSE_TITLE_RULES
```

把 `title` 字段（约第 593 行）从：

```python
"title": {"type": "string"},
```

改为：

```python
"title": {"type": "string", "description": "条款标题（≤10字，优先原文小节标题，原文无标题时概括生成）"},
```

- [ ] **Step 8: 修改 `requirement_extraction_submission.default` 模板（约第 620 行）**

把 `system_prompt` 末尾从：

```
4. 如果找不到递交要求，返回空数组 {"items": []}"""
```

改为：

```
4. 如果找不到递交要求，返回空数组 {"items": []}

""" + CLAUSE_TITLE_RULES
```

把 `title` 字段（约第 658 行）从：

```python
"title": {"type": "string"},
```

改为：

```python
"title": {"type": "string", "description": "条款标题（≤10字，优先原文小节标题，原文无标题时概括生成）"},
```

- [ ] **Step 9: 提交**

```bash
git add backend/apps/generation/management/commands/seed_prompts.py
git commit -m "feat: 条款抽取提示词模板加标题规则段 + schema 加固"
```

---

### Task 2: 修改服务层 fallback 加固

**Files:**
- Modify: `backend/apps/requirements/services/requirement_extract_service.py:303-323`

**Interfaces:**
- Consumes: 无
- Produces: `_create_requirement` 方法对空 title 的 fallback 行为变为 `content[:10] + "…"`（当 content > 10 字）

- [ ] **Step 1: 修改 `_create_requirement` 方法的 title 处理逻辑**

打开 `backend/apps/requirements/services/requirement_extract_service.py`，找到 `_create_requirement` 方法（约第 303 行）。

把第 313-323 行：

```python
        """创建单条条款。"""
        # 生成唯一键
        title = item.get("title", "")[:255]
        content = item.get("content", "")
        if not content:
            return None

        requirement_key = generate_requirement_key(
            tender_file.id,
            extraction_type,
            title or content[:100],
        )
```

改为：

```python
        """创建单条条款。"""
        # 生成唯一键
        title = (item.get("title", "") or "").strip()[:255]
        content = item.get("content", "")
        if not content:
            return None

        # fallback 加固：LLM 未返回 title 时，用 content 前 10 字 + "…" 兜底
        if not title:
            title = content[:10].strip()
            if len(content) > 10:
                title = title + "…"

        requirement_key = generate_requirement_key(
            tender_file.id,
            extraction_type,
            title,
        )
```

- [ ] **Step 2: 提交**

```bash
git add backend/apps/requirements/services/requirement_extract_service.py
git commit -m "feat: 条款抽取服务层 title fallback 加固为 content[:10] + …"
```

---

### Task 3: 服务层 fallback 测试

**Files:**
- Modify: `backend/apps/requirements/tests/test_requirement_extraction.py`（扩展 `TestRequirementExtractServiceV2` 类）

**Interfaces:**
- Consumes: Task 2 修改后的 `_create_requirement` 方法签名不变
- Produces: 3 个新测试方法验证 fallback 行为

- [ ] **Step 1: 在 `TestRequirementExtractServiceV2` 类末尾添加第一个失败测试**

打开 `backend/apps/requirements/tests/test_requirement_extraction.py`，找到 `TestRequirementExtractServiceV2` 类（约第 203 行），在 `test_validate_extraction_types` 方法之后（约第 228 行，class 结束之前）添加：

```python
    def test_create_requirement_fallback_title_long_content(self):
        """LLM 返回空 title 且 content > 10 字时，title 为 content[:10] + …。"""
        service = RequirementExtractService()
        item = {
            "title": "",
            "content": "本条款要求投标人具备建筑工程施工总承包三级及以上资质",
            "requirement_type": "qualification",
            "is_mandatory": True,
            "is_rejection_clause": True,
        }
        # 用 Mock 构造依赖
        from unittest.mock import MagicMock
        tender_file = MagicMock(id=1)
        extraction_run = MagicMock(id=1)
        prompt_run = MagicMock()
        prompt_run.prompt_version = MagicMock(version="2.0", id=1)
        prompt_run.prompt_template_id = 1
        prompt_run.model_config = MagicMock()
        prompt_run.model_config.display_name = "mock-model"

        with patch.object(TenderRequirement.objects, "filter") as mock_filter:
            mock_filter.return_value.first.return_value = None
            with patch.object(TenderRequirement.objects, "create") as mock_create:
                mock_create.return_value = MagicMock(id=1)
                service._create_requirement(
                    item=item,
                    tender_file=tender_file,
                    extraction_run=extraction_run,
                    prompt_run=prompt_run,
                    extraction_type="qualification",
                    created_by=None,
                )
                # 验证 create 被调用时的 title 参数
                call_kwargs = mock_create.call_args.kwargs
                assert call_kwargs["title"] == "本条款要求投标人具备建筑工…"
```

- [ ] **Step 2: 运行测试验证失败**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/requirements/tests/test_requirement_extraction.py::TestRequirementExtractServiceV2::test_create_requirement_fallback_title_long_content -v`
Expected: FAIL（测试可能因为 `create` 调用方式不匹配而失败，需要调整断言）

- [ ] **Step 3: 调整断言以匹配实际 `_create_requirement` 实现**

查看 `requirement_extract_service.py:344-380` 完整的 `_create_requirement` 实现。它用 `requirement_data` dict 构造，`if existing` 走更新路径，否则用 `TenderRequirement.objects.create(**requirement_data)`。

把测试中最后的断言改为更鲁棒的形式（同时支持 `create` 和 `update` 路径）。用 `patch.object(TenderRequirement.objects, "create")` 配合 `filter().first()=None` 让代码走 create 路径：

```python
    def test_create_requirement_fallback_title_long_content(self):
        """LLM 返回空 title 且 content > 10 字时，title 为 content[:10] + …。"""
        service = RequirementExtractService()
        item = {
            "title": "",
            "content": "本条款要求投标人具备建筑工程施工总承包三级及以上资质",
            "requirement_type": "qualification",
            "is_mandatory": True,
            "is_rejection_clause": True,
        }
        from unittest.mock import MagicMock
        tender_file = MagicMock(id=1)
        extraction_run = MagicMock(id=1)
        prompt_run = MagicMock()
        prompt_run.prompt_version = MagicMock(version="2.0", id=1)
        prompt_run.prompt_template_id = 1
        prompt_run.model_config = MagicMock()
        prompt_run.model_config.display_name = "mock-model"

        with patch.object(TenderRequirement.objects, "filter") as mock_filter:
            mock_filter.return_value.first.return_value = None
            with patch.object(TenderRequirement.objects, "create") as mock_create:
                mock_create.return_value = MagicMock(id=1)
                service._create_requirement(
                    item=item,
                    tender_file=tender_file,
                    extraction_run=extraction_run,
                    prompt_run=prompt_run,
                    extraction_type="qualification",
                    created_by=None,
                )
                call_kwargs = mock_create.call_args.kwargs
                assert call_kwargs["title"] == "本条款要求投标人具备建筑工…"
```

- [ ] **Step 4: 运行测试验证通过**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/requirements/tests/test_requirement_extraction.py::TestRequirementExtractServiceV2::test_create_requirement_fallback_title_long_content -v`
Expected: PASS

- [ ] **Step 5: 添加第二个测试 — content ≤ 10 字不加省略号**

在同一个类中再加：

```python
    def test_create_requirement_fallback_title_short_content(self):
        """LLM 返回空 title 且 content ≤ 10 字时，title 为 content 本身（不加省略号）。"""
        service = RequirementExtractService()
        item = {
            "title": "",
            "content": "资质要求",
            "requirement_type": "qualification",
            "is_mandatory": False,
            "is_rejection_clause": False,
        }
        from unittest.mock import MagicMock
        tender_file = MagicMock(id=1)
        extraction_run = MagicMock(id=1)
        prompt_run = MagicMock()
        prompt_run.prompt_version = MagicMock(version="2.0", id=1)
        prompt_run.prompt_template_id = 1
        prompt_run.model_config = MagicMock()
        prompt_run.model_config.display_name = "mock-model"

        with patch.object(TenderRequirement.objects, "filter") as mock_filter:
            mock_filter.return_value.first.return_value = None
            with patch.object(TenderRequirement.objects, "create") as mock_create:
                mock_create.return_value = MagicMock(id=1)
                service._create_requirement(
                    item=item,
                    tender_file=tender_file,
                    extraction_run=extraction_run,
                    prompt_run=prompt_run,
                    extraction_type="qualification",
                    created_by=None,
                )
                call_kwargs = mock_create.call_args.kwargs
                assert call_kwargs["title"] == "资质要求"
```

- [ ] **Step 6: 运行第二个测试验证通过**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/requirements/tests/test_requirement_extraction.py::TestRequirementExtractServiceV2::test_create_requirement_fallback_title_short_content -v`
Expected: PASS

- [ ] **Step 7: 添加第三个测试 — LLM 正常返回 title 时不加工**

```python
    def test_create_requirement_preserves_llm_title(self):
        """LLM 返回非空 title 时，落库的 title 为 LLM 返回值（不加工）。"""
        service = RequirementExtractService()
        item = {
            "title": "资质等级要求",
            "content": "投标人须具备建筑工程施工总承包三级及以上资质",
            "requirement_type": "qualification",
            "is_mandatory": True,
            "is_rejection_clause": True,
        }
        from unittest.mock import MagicMock
        tender_file = MagicMock(id=1)
        extraction_run = MagicMock(id=1)
        prompt_run = MagicMock()
        prompt_run.prompt_version = MagicMock(version="2.0", id=1)
        prompt_run.prompt_template_id = 1
        prompt_run.model_config = MagicMock()
        prompt_run.model_config.display_name = "mock-model"

        with patch.object(TenderRequirement.objects, "filter") as mock_filter:
            mock_filter.return_value.first.return_value = None
            with patch.object(TenderRequirement.objects, "create") as mock_create:
                mock_create.return_value = MagicMock(id=1)
                service._create_requirement(
                    item=item,
                    tender_file=tender_file,
                    extraction_run=extraction_run,
                    prompt_run=prompt_run,
                    extraction_type="qualification",
                    created_by=None,
                )
                call_kwargs = mock_create.call_args.kwargs
                assert call_kwargs["title"] == "资质等级要求"
```

- [ ] **Step 8: 运行第三个测试验证通过**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/requirements/tests/test_requirement_extraction.py::TestRequirementExtractServiceV2::test_create_requirement_preserves_llm_title -v`
Expected: PASS

- [ ] **Step 9: 提交**

```bash
git add backend/apps/requirements/tests/test_requirement_extraction.py
git commit -m "test: 添加条款抽取 title fallback 测试"
```

---

### Task 4: 新建 update_requirement_extraction_prompts 迁移命令

**Files:**
- Create: `backend/apps/generation/management/commands/update_requirement_extraction_prompts.py`

**Interfaces:**
- Consumes: Task 1 修改后的 seed_prompts.py 中的 7 个模板定义（用于参考措辞，但命令内部自带模板数据，避免依赖 seed_prompts）
- Produces: 管理命令 `python manage.py update_requirement_extraction_prompts`，把现有部署的 7 个模板升到 v2.0 并 publish

- [ ] **Step 1: 创建命令文件**

创建 `backend/apps/generation/management/commands/update_requirement_extraction_prompts.py`：

```python
# backend/apps/generation/management/commands/update_requirement_extraction_prompts.py
"""更新条款抽取提示词模板（7 个模板统一加标题规则）。

参考 update_outline_prompt.py 的模式：为现有部署的 7 个条款抽取模板创建 v2.0 版本并 publish。
命令幂等，可重复执行。
"""

import copy

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.generation.constants import PromptVersionStatus
from apps.generation.models import PromptTemplate, PromptVersion


# 标题规则段 —— 与 seed_prompts.py 中的 CLAUSE_TITLE_RULES 保持一致
CLAUSE_TITLE_RULES = """**条款标题规则**：
1. title 必须有值，不得为空字符串
2. 优先使用原文中的小节/段落标题（如「资格要求」「付款方式」「投标截止时间」）
3. 原文无明确标题时，由你基于 content 概括生成不超过 10 个字的简短标题
4. 不得直接复制 content 全文作为 title
5. title 应能让评审人快速识别该条款要点，避免「其他」「相关要求」等模糊表述"""

TITLE_DESC = "条款标题（≤10字，优先原文小节标题，原文无标题时概括生成）"

# 7 个模板的更新数据
# 每项是 (template_key, system_prompt_suffix, title_required_in_schema)
# 这里只列出需要更新的字段；其他字段保留原样
TEMPLATES_TO_UPDATE = [
    {
        "key": "requirement_extraction.default",
        "system_prompt_append": CLAUSE_TITLE_RULES,
        "title_description": TITLE_DESC,
        "title_in_required": True,  # 该模板原本 required 缺 title
    },
    {
        "key": "requirement_extraction_scoring.default",
        "system_prompt_append": CLAUSE_TITLE_RULES,
        "title_description": TITLE_DESC,
        "title_in_required": False,  # V2 模板 required 已含 title
    },
    {
        "key": "requirement_extraction_mandatory.default",
        "system_prompt_append": CLAUSE_TITLE_RULES,
        "title_description": TITLE_DESC,
        "title_in_required": False,
    },
    {
        "key": "requirement_extraction_qualification.default",
        "system_prompt_append": CLAUSE_TITLE_RULES,
        "title_description": TITLE_DESC,
        "title_in_required": False,
    },
    {
        "key": "requirement_extraction_commercial.default",
        "system_prompt_append": CLAUSE_TITLE_RULES,
        "title_description": TITLE_DESC,
        "title_in_required": False,
    },
    {
        "key": "requirement_extraction_technical.default",
        "system_prompt_append": CLAUSE_TITLE_RULES,
        "title_description": TITLE_DESC,
        "title_in_required": False,
    },
    {
        "key": "requirement_extraction_submission.default",
        "system_prompt_append": CLAUSE_TITLE_RULES,
        "title_description": TITLE_DESC,
        "title_in_required": False,
    },
]


class Command(BaseCommand):
    help = "更新条款抽取提示词模板（7 个模板统一加标题规则）"

    @transaction.atomic
    def handle(self, *args, **options):
        updated_count = 0
        skipped_count = 0

        for tmpl_data in TEMPLATES_TO_UPDATE:
            template = PromptTemplate.objects.filter(key=tmpl_data["key"]).first()
            if not template:
                self.stdout.write(self.style.WARNING(
                    f"未找到模板 {tmpl_data['key']}，跳过"
                ))
                skipped_count += 1
                continue

            # 获取当前 published 版本作为基础
            current_published = PromptVersion.objects.filter(
                template=template,
                status=PromptVersionStatus.PUBLISHED,
            ).first()

            if current_published:
                base_system_prompt = current_published.system_prompt
                base_user_prompt = current_published.user_prompt
                base_output_schema = current_published.output_schema or {}
            else:
                # 没有 published 版本，跳过
                self.stdout.write(self.style.WARNING(
                    f"模板 {tmpl_data['key']} 无 published 版本，跳过"
                ))
                skipped_count += 1
                continue

            # 在 system_prompt 末尾追加标题规则段（如果尚未追加）
            if "条款标题规则" not in base_system_prompt:
                new_system_prompt = base_system_prompt.rstrip() + "\n\n" + tmpl_data["system_prompt_append"]
            else:
                new_system_prompt = base_system_prompt

            # 更新 output_schema 中 title 字段的 description，并加入 required
            new_output_schema = self._update_schema(
                base_output_schema,
                tmpl_data["title_description"],
                tmpl_data["title_in_required"],
            )

            # 创建或更新版本 2.0
            existing_v2 = PromptVersion.objects.filter(
                template=template, version="2.0"
            ).first()

            if existing_v2:
                existing_v2.system_prompt = new_system_prompt
                existing_v2.user_prompt = base_user_prompt
                existing_v2.output_schema = new_output_schema
                existing_v2.changelog = "增加条款标题规则，title 加入 required，title description 统一"
                existing_v2.save()
                version = existing_v2
                self.stdout.write(f"更新版本 2.0 (ID={version.id}) for {tmpl_data['key']}")
            else:
                version = PromptVersion.objects.create(
                    template=template,
                    version="2.0",
                    system_prompt=new_system_prompt,
                    user_prompt=base_user_prompt,
                    output_schema=new_output_schema,
                    changelog="增加条款标题规则，title 加入 required，title description 统一",
                    status=PromptVersionStatus.DRAFT,
                )
                self.stdout.write(f"创建版本 2.0 (ID={version.id}) for {tmpl_data['key']}")

            # 发布新版本
            version.publish()
            self.stdout.write(self.style.SUCCESS(
                f"已发布 {tmpl_data['key']} v2.0"
            ))
            updated_count += 1

        self.stdout.write(self.style.SUCCESS(
            f"\n完成：更新 {updated_count} 个模板，跳过 {skipped_count} 个"
        ))

    def _update_schema(
        self,
        schema: dict,
        title_description: str,
        title_in_required: bool,
    ) -> dict:
        """更新 output_schema：title 字段加 description，必要时加入 required。"""
        new_schema = copy.deepcopy(schema)

        # output_schema 形如 {"type": "object", "properties": {"requirements": {...}}}
        # 或 {"type": "object", "properties": {"items": {...}}}
        properties = new_schema.get("properties", {})
        for array_key in ("requirements", "items"):
            if array_key not in properties:
                continue
            array_def = properties[array_key]
            items_def = array_def.get("items", {})
            item_props = items_def.get("properties", {})

            # 更新 title description
            if "title" in item_props:
                if isinstance(item_props["title"], dict):
                    item_props["title"]["description"] = title_description
                else:
                    item_props["title"] = {"type": "string", "description": title_description}

            # 加入 required
            if title_in_required:
                required = items_def.get("required", [])
                if "title" not in required:
                    required.append("title")
                    items_def["required"] = required

        return new_schema
```

- [ ] **Step 2: 在本地试运行命令（不提交）**

Run: `cd backend && source .venv/bin/activate && python manage.py update_requirement_extraction_prompts`
Expected: 输出 7 个「已发布 ... v2.0」成功消息，没有「未找到模板」或「无 published 版本」警告

如果命令报错或警告，先检查 seed_prompts 是否已运行（用 `python manage.py seed_prompts` 初始化）

- [ ] **Step 3: 提交**

```bash
git add backend/apps/generation/management/commands/update_requirement_extraction_prompts.py
git commit -m "feat: 添加 update_requirement_extraction_prompts 迁移命令"
```

---

### Task 5: update 命令单元测试

**Files:**
- Create: `backend/apps/generation/tests/test_update_requirement_extraction_prompts.py`

**Interfaces:**
- Consumes: Task 4 的命令；Task 1 的 seed_prompts（用于初始化测试数据）
- Produces: 5 个测试验证命令行为

- [ ] **Step 1: 创建测试文件**

创建 `backend/apps/generation/tests/test_update_requirement_extraction_prompts.py`：

```python
# backend/apps/generation/tests/test_update_requirement_extraction_prompts.py
"""update_requirement_extraction_prompts 命令测试。"""

import pytest
from django.core.management import call_command

from apps.generation.models import PromptTemplate, PromptVersion
from apps.generation.constants import PromptVersionStatus


# 7 个条款抽取模板的 key
TEMPLATE_KEYS = [
    "requirement_extraction.default",
    "requirement_extraction_scoring.default",
    "requirement_extraction_mandatory.default",
    "requirement_extraction_qualification.default",
    "requirement_extraction_commercial.default",
    "requirement_extraction_technical.default",
    "requirement_extraction_submission.default",
]


@pytest.mark.django_db
class TestUpdateRequirementExtractionPrompts:
    """update_requirement_extraction_prompts 命令测试。"""

    def setup_method(self):
        """每个测试前先 seed_prompts 初始化数据。"""
        call_command("seed_prompts")

    def test_command_creates_v2_for_all_seven_templates(self):
        """命令执行后，7 个模板都有 v2.0 published 版本。"""
        call_command("update_requirement_extraction_prompts")

        for key in TEMPLATE_KEYS:
            template = PromptTemplate.objects.get(key=key)
            v2 = PromptVersion.objects.filter(
                template=template, version="2.0"
            ).first()
            assert v2 is not None, f"模板 {key} 没有 v2.0 版本"
            assert v2.status == PromptVersionStatus.PUBLISHED, \
                f"模板 {key} 的 v2.0 未发布"

    def test_command_idempotent(self):
        """命令重复执行幂等，不报错也不产生多个 v2.0。"""
        call_command("update_requirement_extraction_prompts")
        call_command("update_requirement_extraction_prompts")

        for key in TEMPLATE_KEYS:
            template = PromptTemplate.objects.get(key=key)
            v2_count = PromptVersion.objects.filter(
                template=template, version="2.0"
            ).count()
            assert v2_count == 1, f"模板 {key} 有 {v2_count} 个 v2.0 版本（应为 1）"

    def test_v2_system_prompt_contains_title_rules(self):
        """v2.0 的 system_prompt 包含「条款标题规则」段。"""
        call_command("update_requirement_extraction_prompts")

        for key in TEMPLATE_KEYS:
            template = PromptTemplate.objects.get(key=key)
            v2 = PromptVersion.objects.get(template=template, version="2.0")
            assert "条款标题规则" in v2.system_prompt, \
                f"模板 {key} 的 v2.0 system_prompt 缺少标题规则段"
            assert "不超过 10 个字" in v2.system_prompt, \
                f"模板 {key} 的 v2.0 system_prompt 缺少字数约束"

    def test_v2_output_schema_title_in_required(self):
        """v2.0 的 output_schema 中 title 在 required 列表。"""
        call_command("update_requirement_extraction_prompts")

        for key in TEMPLATE_KEYS:
            template = PromptTemplate.objects.get(key=key)
            v2 = PromptVersion.objects.get(template=template, version="2.0")
            schema = v2.output_schema or {}
            properties = schema.get("properties", {})
            # 找到数组字段（requirements 或 items）
            array_def = properties.get("requirements") or properties.get("items")
            assert array_def is not None, f"模板 {key} 的 schema 缺少数组字段"
            items_def = array_def.get("items", {})
            required = items_def.get("required", [])
            assert "title" in required, \
                f"模板 {key} 的 v2.0 schema required 缺少 title"

    def test_v2_output_schema_title_has_description(self):
        """v2.0 的 output_schema 中 title 字段有 description。"""
        call_command("update_requirement_extraction_prompts")

        for key in TEMPLATE_KEYS:
            template = PromptTemplate.objects.get(key=key)
            v2 = PromptVersion.objects.get(template=template, version="2.0")
            schema = v2.output_schema or {}
            properties = schema.get("properties", {})
            array_def = properties.get("requirements") or properties.get("items")
            items_def = array_def.get("items", {})
            item_props = items_def.get("properties", {})
            title_def = item_props.get("title", {})
            assert isinstance(title_def, dict), f"模板 {key} 的 title 不是 dict"
            assert "description" in title_def, \
                f"模板 {key} 的 v2.0 title 字段缺少 description"
            assert "≤10字" in title_def["description"], \
                f"模板 {key} 的 v2.0 title description 不含字数约束"
```

- [ ] **Step 2: 运行所有测试验证通过**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/generation/tests/test_update_requirement_extraction_prompts.py -v`
Expected: 5 个测试全部 PASS

如果 `test_v2_output_schema_title_in_required` 失败，检查 `_update_schema` 方法是否正确识别 `requirements` 或 `items` 字段。

- [ ] **Step 3: 提交**

```bash
git add backend/apps/generation/tests/test_update_requirement_extraction_prompts.py
git commit -m "test: 添加 update_requirement_extraction_prompts 命令测试"
```

---

### Task 6: 扩展 seed_prompts 测试 — 验证标题规则段和 schema

**Files:**
- Modify: `backend/apps/generation/tests/test_seed_prompts.py`

**Interfaces:**
- Consumes: Task 1 修改后的 seed_prompts.py
- Produces: 3 个新测试验证 seed 后的模板内容符合预期

- [ ] **Step 1: 在 `TestSeedPrompts` 类中添加第一个测试 — 标题规则段**

打开 `backend/apps/generation/tests/test_seed_prompts.py`，在 `test_seed_prompts_published_versions` 方法之后（class 结束之前）添加：

```python
    def test_seed_prompts_clause_title_rules_in_system_prompt(self):
        """7 个条款抽取模板的 system_prompt 都包含「条款标题规则」段。"""
        call_command("seed_prompts")

        clause_keys = [
            "requirement_extraction.default",
            "requirement_extraction_scoring.default",
            "requirement_extraction_mandatory.default",
            "requirement_extraction_qualification.default",
            "requirement_extraction_commercial.default",
            "requirement_extraction_technical.default",
            "requirement_extraction_submission.default",
        ]
        for key in clause_keys:
            template = PromptTemplate.objects.get(key=key)
            published = PromptVersion.objects.filter(
                template=template, status=PromptVersionStatus.PUBLISHED
            ).first()
            assert published is not None, f"模板 {key} 无 published 版本"
            assert "条款标题规则" in published.system_prompt, \
                f"模板 {key} 的 system_prompt 缺少标题规则段"
            assert "不超过 10 个字" in published.system_prompt, \
                f"模板 {key} 的 system_prompt 缺少字数约束"
```

- [ ] **Step 2: 运行测试验证通过**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/generation/tests/test_seed_prompts.py::TestSeedPrompts::test_seed_prompts_clause_title_rules_in_system_prompt -v`
Expected: PASS

- [ ] **Step 3: 添加第二个测试 — requirement_extraction.default 的 required 含 title**

```python
    def test_seed_prompts_default_title_in_required(self):
        """requirement_extraction.default 的 output_schema required 包含 title。"""
        call_command("seed_prompts")

        template = PromptTemplate.objects.get(key="requirement_extraction.default")
        published = PromptVersion.objects.filter(
            template=template, status=PromptVersionStatus.PUBLISHED
        ).first()
        schema = published.output_schema or {}
        array_def = schema.get("properties", {}).get("requirements", {})
        items_def = array_def.get("items", {})
        required = items_def.get("required", [])
        assert "title" in required, "requirement_extraction.default 的 required 缺少 title"
```

- [ ] **Step 4: 运行测试验证通过**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/generation/tests/test_seed_prompts.py::TestSeedPrompts::test_seed_prompts_default_title_in_required -v`
Expected: PASS

- [ ] **Step 5: 添加第三个测试 — 7 个模板的 title 字段都有 description**

```python
    def test_seed_prompts_clause_title_has_description(self):
        """7 个条款抽取模板的 title 字段都有 description。"""
        call_command("seed_prompts")

        clause_keys = [
            "requirement_extraction.default",
            "requirement_extraction_scoring.default",
            "requirement_extraction_mandatory.default",
            "requirement_extraction_qualification.default",
            "requirement_extraction_commercial.default",
            "requirement_extraction_technical.default",
            "requirement_extraction_submission.default",
        ]
        for key in clause_keys:
            template = PromptTemplate.objects.get(key=key)
            published = PromptVersion.objects.filter(
                template=template, status=PromptVersionStatus.PUBLISHED
            ).first()
            schema = published.output_schema or {}
            properties = schema.get("properties", {})
            array_def = properties.get("requirements") or properties.get("items")
            assert array_def is not None, f"模板 {key} 缺少数组字段"
            items_def = array_def.get("items", {})
            item_props = items_def.get("properties", {})
            title_def = item_props.get("title", {})
            assert isinstance(title_def, dict), f"模板 {key} 的 title 不是 dict"
            assert "description" in title_def, f"模板 {key} 的 title 缺少 description"
            assert "≤10字" in title_def["description"], \
                f"模板 {key} 的 title description 不含字数约束"
```

- [ ] **Step 6: 运行测试验证通过**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/generation/tests/test_seed_prompts.py::TestSeedPrompts::test_seed_prompts_clause_title_has_description -v`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add backend/apps/generation/tests/test_seed_prompts.py
git commit -m "test: 扩展 seed_prompts 测试验证标题规则段和 schema"
```

---

### Task 7: 运行全部测试套件验证

**Files:**
- 无新建/修改，仅运行测试

- [ ] **Step 1: 运行受影响的测试文件**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/generation/tests/test_seed_prompts.py apps/generation/tests/test_update_requirement_extraction_prompts.py apps/requirements/tests/test_requirement_extraction.py --tb=short -q`
Expected: 所有测试 PASS

- [ ] **Step 2: 运行 backend 全量测试套件（确保无回归）**

Run: `cd backend && source .venv/bin/activate && python -m pytest --tb=short -q`
Expected: 所有测试 PASS（如有失败，分析是否与本改动相关；不相关的预存失败可记录但不阻塞）

- [ ] **Step 3: 验证迁移命令在本地实际运行成功**

Run: `cd backend && source .venv/bin/activate && python manage.py update_requirement_extraction_prompts`
Expected: 输出 7 个「已发布 ... v2.0」成功消息

- [ ] **Step 4: 最终提交（如果有未提交的修复）**

```bash
git status
# 如果有未提交的修复
git add -A
git commit -m "fix: 测试验证后的最终修复"
```

- [ ] **Step 5: 部署到 Docker 验证（按 CLAUDE.md 流程）**

```bash
docker compose build web worker beat
docker compose up -d web worker beat
docker exec ai-bid-generator-web-1 python manage.py update_requirement_extraction_prompts
docker compose restart nginx
docker logs --tail 20 ai-bid-generator-web-1
```
Expected: 命令成功执行，7 个模板升到 v2.0 published，服务正常运行
