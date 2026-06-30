# P3 正文增强四件套 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现表格清理（手动单章）、字数补目录（手动大纲级）、Mermaid 配图（批量后自动 + mermaid.ink 渲染校验）、AI 生图（批量后自动 + 有模型生图/无模型出 prompt）四项正文增强能力。

**Architecture:** 4 项共享统一架构：每项 1 个 PromptScenario + 1 个 prompt 模板（Jinja2 入库）+ 1 个服务类 + 1 个 Celery task + AsyncTask 跟踪。AI 调用统一走 `AiTaskExecutionService.execute`（含 P2-4 JSON 修复器），图片存储统一走 `StorageService` MinIO。表格清理与字数补目录用户手动触发；Mermaid 配图与 AI 生图在 `on_batch_complete` 链中串行自动触发（扩写之后），每阶段失败不阻断。

**Tech Stack:** Django + DRF + Celery + PostgreSQL + MinIO + mermaid.ink（外部渲染）+ OpenAI 兼容生图 API。

## Global Constraints

- 所有 prompt 写入 PromptTemplate+PromptVersion（Jinja2 `{{ var }}` 语法），禁止代码内联 prompt
- AI 调用走 `AiTaskExecutionService.execute(scenario, variables, created_by, business_context={"project_id": ...})`
- `business_context` 只能传 `{"project_id": ...}`（PromptRun 限制）
- 异步任务建 `AsyncTask`，更新 progress/current_step，禁止裸 Celery 任务无跟踪
- 图片存储走 `StorageService.upload_fileobj(file_obj, object_key, content_type)` / `put_object(object_key, data_bytes, content_type)`
- 迁移基线：现有最新迁移 `0014_outline_review_overridden.py`，本计划新增 `0015`
- 后端测试用 pytest：`cd backend && DATABASE_URL="postgres://bid:bid@localhost:5432/bid_test" python -m pytest apps/outline/tests/test_xxx.py -v`
- Docker 部署：`docker compose build web worker && docker compose up -d web worker && docker exec ai-bid-generator-web-1 python manage.py migrate && docker compose restart nginx`
- `ProviderClient` 抽象基类在 `apps/generation/providers/base.py`，各 client（DeepSeekClient/BailianClient/MockClient）实现 `chat`
- `LLMService`（`apps/generation/services/llm_service.py`）封装 provider 调用，AiTaskExecutionService 通过 `self.llm_service.chat` 调用
- `Section.content_word_count` 是正文字数字段（已有）
- 现有 `content_plan` JSONField 含 `table/mermaid/image` 子结构（P0-3 已加）

---

## File Structure

新建：
- `backend/apps/generation/management/commands/_table_cleanup_prompts.py` — table_cleanup prompt
- `backend/apps/generation/management/commands/_outline_expand_prompts.py` — outline_expand prompt
- `backend/apps/generation/management/commands/_mermaid_illustration_prompts.py` — mermaid_illustration prompt
- `backend/apps/generation/management/commands/_image_generation_prompts.py` — image_generation prompt
- `backend/apps/outline/services/table_cleanup_service.py` — 表格清理服务
- `backend/apps/outline/services/outline_expand_service.py` — 字数补目录服务
- `backend/apps/outline/services/mermaid_illustration_service.py` — Mermaid 配图服务
- `backend/apps/outline/services/image_generation_service.py` — AI 生图服务
- `backend/apps/outline/migrations/0015_section_mermaid_image_fields.py` — Section 5 字段迁移
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
- `backend/apps/generation/providers/base.py` — `generate_image` 抽象方法
- `backend/apps/generation/providers/deepseek_client.py` — `generate_image` 实现（OpenAI 兼容 images.generate）
- `backend/apps/generation/services/llm_service.py` — `generate_image` 代理方法
- `backend/config/settings/base.py` — 3 个 settings

无新增模型表（仅 Section 加字段），1 个迁移。

---

## Task 1: 数据模型 + 4 scenario + 4 prompt + settings

**Files:**
- Modify: `backend/apps/generation/constants.py`
- Modify: `backend/config/settings/base.py`
- Modify: `backend/apps/outline/models/section.py`
- Create: `backend/apps/outline/migrations/0015_section_mermaid_image_fields.py`
- Create: `backend/apps/generation/management/commands/_table_cleanup_prompts.py`
- Create: `backend/apps/generation/management/commands/_outline_expand_prompts.py`
- Create: `backend/apps/generation/management/commands/_mermaid_illustration_prompts.py`
- Create: `backend/apps/generation/management/commands/_image_generation_prompts.py`
- Modify: `backend/apps/generation/management/commands/seed_prompts.py`

**Interfaces:**
- Produces: `PromptScenario.TABLE_CLEANUP/OUTLINE_EXPAND/MERMAID_ILLUSTRATION/IMAGE_GENERATION`；Section 5 字段；4 个 prompt 模板列表；settings `MERMAID_RENDER_URL/MERMAID_RENDER_TIMEOUT/IMAGE_GEN_MODEL`

- [ ] **Step 1: 在 PromptScenario 加 4 个常量**

修改 `backend/apps/generation/constants.py`，在 `SECTION_EXPAND = "section_expand"` 后追加：

```python
    # P3 正文增强
    TABLE_CLEANUP = "table_cleanup"
    OUTLINE_EXPAND = "outline_expand"
    MERMAID_ILLUSTRATION = "mermaid_illustration"
    IMAGE_GENERATION = "image_generation"
```

在 CHOICES 列表末尾（`(SECTION_EXPAND, "字数不足扩写")` 后）追加：

```python
        (TABLE_CLEANUP, "表格清理"),
        (OUTLINE_EXPAND, "字数补目录"),
        (MERMAID_ILLUSTRATION, "Mermaid 配图"),
        (IMAGE_GENERATION, "AI 生图"),
```

- [ ] **Step 2: 在 settings 加 P3 配置**

修改 `backend/config/settings/base.py`，在 `MAX_EXPAND_ROUNDS` 配置后追加：

```python

# ========== P3 正文增强配置 ==========
MERMAID_RENDER_URL = env("MERMAID_RENDER_URL", default="https://mermaid.ink")
MERMAID_RENDER_TIMEOUT = env.int("MERMAID_RENDER_TIMEOUT", default=30)
IMAGE_GEN_MODEL = env("IMAGE_GEN_MODEL", default="")  # 生图模型名，空则只生成 prompt
```

- [ ] **Step 3: Section 模型加 5 字段**

修改 `backend/apps/outline/models/section.py`，在 `content_plan_updated_at` 字段后（class Meta 前）追加：

```python
    # ========== P3 Mermaid 配图与 AI 生图字段 ==========
    mermaid_code = models.TextField("Mermaid 代码", blank=True, default="",
        help_text="Mermaid 配图代码，渲染成功后存入")
    mermaid_object_key = models.CharField("Mermaid 图片对象键", max_length=500, blank=True, default="",
        help_text="MinIO 中渲染后的 PNG 对象键")
    image_prompt = models.TextField("生图提示词", blank=True, default="",
        help_text="AI 生图 prompt，未配置生图模型时存此字段供手动生图")
    image_object_key = models.CharField("生图对象键", max_length=500, blank=True, default="",
        help_text="MinIO 中生成的图片对象键")
```

- [ ] **Step 4: 生成迁移文件**

Run: `cd backend && python manage.py makemigrations outline --name section_mermaid_image_fields 2>&1 | tail -5`
Expected: 输出 `Migrations for 'outline': 0015_section_mermaid_image_fields.py - Create model fields ...`

- [ ] **Step 5: 创建 table_cleanup prompt 模板**

创建 `backend/apps/generation/management/commands/_table_cleanup_prompts.py`：

```python
# backend/apps/generation/management/commands/_table_cleanup_prompts.py
"""表格清理 prompt 模板（P3，AI 逐表判断保留/转文字）。"""

TABLE_CLEANUP_TEMPLATES = [
    {
        "key": "table_cleanup.default",
        "name": "表格清理模板",
        "scenario": "table_cleanup",
        "description": "逐表判断是否保留，不合理的转纯文字描述",
        "system_prompt": """你是投标技术方案表格清理助手。判断每个表格是否适合用表格表达。

要求：
1. 参数表/报价表/规格表/对比表保留。
2. 只有 1-2 行数据的表格转文字。
3. 表头为空或单元格是长句的表格转文字。
4. 单列表格转文字。
5. keep=true 时 text替代留空字符串。
6. keep=false 时 text替代 写纯文字描述，不含 Markdown 表格语法。
7. 严禁 Markdown 标题语法。
8. 只返回 JSON {"keep": bool, "reason": "", "text替代": ""}。""",
        "user_prompt": """章节标题：{{ chapter_title }}
写作范围：{{ write_scope }}

待判断表格：
{{ table_markdown }}""",
        "output_schema": {
            "type": "object",
            "properties": {
                "keep": {"type": "boolean"},
                "reason": {"type": "string"},
                "text替代": {"type": "string"},
            },
            "required": ["keep"],
        },
        "variable_schema": {
            "type": "object",
            "properties": {
                "chapter_title": {"type": "string"},
                "write_scope": {"type": "string"},
                "table_markdown": {"type": "string"},
            },
            "required": ["table_markdown"],
        },
    },
]
```

- [ ] **Step 6: 创建 outline_expand prompt 模板**

创建 `backend/apps/generation/management/commands/_outline_expand_prompts.py`：

```python
# backend/apps/generation/management/commands/_outline_expand_prompts.py
"""字数补目录 prompt 模板（P3，AI 补二三四级子目录）。"""

OUTLINE_EXPAND_TEMPLATES = [
    {
        "key": "outline_expand.default",
        "name": "字数补目录模板",
        "scenario": "outline_expand",
        "description": "正文总字数不达标时补充二三四级子目录扩展生成空间",
        "system_prompt": """你是投标技术方案目录扩展助手。当前正文总字数不达标，请补充子目录扩展生成空间。

要求：
1. 只补充二三四级子目录，不删现有目录。
2. 新增子目录须挂在现有叶子章节下，level 递增。
3. 不得修改一级目录标题与顺序。
4. 每个新增子目录 write_scope 须明确写作范围，避免与兄弟章节重复。
5. 围绕招标评分大类与细项展开，不越界。
6. 只返回 JSON {"added_sections": [{"parent_section_id": 0, "title": "", "level": 0, "write_scope": ""}]}。
7. 无需补充时返回空数组。""",
        "user_prompt": """项目概述：
{{ project_overview }}

完整目录结构：
{{ outline_structure }}

各章字数统计：
{{ current_word_stats }}

目标总字数：{{ target_total_words }}

评分大类：
{{ requirement_groups }}""",
        "output_schema": {
            "type": "object",
            "properties": {
                "added_sections": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "parent_section_id": {"type": "integer"},
                            "title": {"type": "string"},
                            "level": {"type": "integer"},
                            "write_scope": {"type": "string"},
                        },
                        "required": ["parent_section_id", "title", "level", "write_scope"],
                    },
                },
            },
            "required": ["added_sections"],
        },
        "variable_schema": {
            "type": "object",
            "properties": {
                "project_overview": {"type": "string"},
                "outline_structure": {"type": "string"},
                "current_word_stats": {"type": "string"},
                "target_total_words": {"type": "integer"},
                "requirement_groups": {"type": "string"},
            },
            "required": ["outline_structure", "current_word_stats", "target_total_words"],
        },
    },
]
```

- [ ] **Step 7: 创建 mermaid_illustration prompt 模板**

创建 `backend/apps/generation/management/commands/_mermaid_illustration_prompts.py`：

```python
# backend/apps/generation/management/commands/_mermaid_illustration_prompts.py
"""Mermaid 配图 prompt 模板（P3，生成 Mermaid 代码 + 渲染校验）。"""

MERMAID_ILLUSTRATION_TEMPLATES = [
    {
        "key": "mermaid_illustration.default",
        "name": "Mermaid 配图模板",
        "scenario": "mermaid_illustration",
        "description": "为章节生成 Mermaid 图表代码，渲染失败可带错误修复",
        "system_prompt": """你是投标技术方案 Mermaid 配图助手。请为指定章节生成 Mermaid 图表代码。

要求：
1. 只返回 JSON {"mermaid_code": "", "diagram_type": ""}。
2. mermaid_code 必须是合法 Mermaid 语法（flowchart/sequenceDiagram/classDiagram 等）。
3. 围绕章节核心流程/架构/关系展开。
4. 节点文字用中文，简洁。
5. 禁止 Markdown 代码块包裹。
6. 禁止外部图片链接。
7. diagram_type 填图表类型。""",
        "user_prompt": """章节标题：{{ chapter_title }}
写作范围：{{ write_scope }}
章节摘要：{{ chapter_summary }}

{% if render_error %}上一次生成的代码渲染失败：{{ render_error }}
请修复后重新生成。
{% endif %}请返回 Mermaid 图表代码 JSON。""",
        "output_schema": {
            "type": "object",
            "properties": {
                "mermaid_code": {"type": "string"},
                "diagram_type": {"type": "string"},
            },
            "required": ["mermaid_code", "diagram_type"],
        },
        "variable_schema": {
            "type": "object",
            "properties": {
                "chapter_title": {"type": "string"},
                "write_scope": {"type": "string"},
                "chapter_summary": {"type": "string"},
                "render_error": {"type": "string"},
            },
            "required": ["chapter_title"],
        },
    },
]
```

- [ ] **Step 8: 创建 image_generation prompt 模板**

创建 `backend/apps/generation/management/commands/_image_generation_prompts.py`：

```python
# backend/apps/generation/management/commands/_image_generation_prompts.py
"""AI 生图 prompt 模板（P3，生成图片提示词）。"""

IMAGE_GENERATION_TEMPLATES = [
    {
        "key": "image_generation.default",
        "name": "AI 生图模板",
        "scenario": "image_generation",
        "description": "为章节生成 AI 生图提示词（image_prompt/style/negative_prompt）",
        "system_prompt": """你是投标技术方案配图提示词助手。请为指定章节生成 AI 生图提示词。

要求：
1. 只返回 JSON {"image_prompt": "", "style": "", "negative_prompt": ""}。
2. image_prompt 用英文描述图片内容，详细具体（主体/场景/视角/光线）。
3. style 填画风（如 flat illustration / technical diagram / isometric）。
4. negative_prompt 填要避免的元素。
5. 围绕章节核心内容展开，不出现真实人物/品牌/Logo。
6. 适合技术方案配图风格。""",
        "user_prompt": """章节标题：{{ chapter_title }}
写作范围：{{ write_scope }}
章节摘要：{{ chapter_summary }}
配图用途：{{ image_purpose }}

请返回 AI 生图提示词 JSON。""",
        "output_schema": {
            "type": "object",
            "properties": {
                "image_prompt": {"type": "string"},
                "style": {"type": "string"},
                "negative_prompt": {"type": "string"},
            },
            "required": ["image_prompt", "style", "negative_prompt"],
        },
        "variable_schema": {
            "type": "object",
            "properties": {
                "chapter_title": {"type": "string"},
                "write_scope": {"type": "string"},
                "chapter_summary": {"type": "string"},
                "image_purpose": {"type": "string"},
            },
            "required": ["chapter_title"],
        },
    },
]
```

- [ ] **Step 9: 在 seed_prompts.py 注册 4 个 prompt**

修改 `backend/apps/generation/management/commands/seed_prompts.py` 的 `_get_builtin_templates` 方法。在现有 import 块（`from ._section_expand_prompts import SECTION_EXPAND_TEMPLATES` 后）追加：

```python
        from ._table_cleanup_prompts import TABLE_CLEANUP_TEMPLATES
        from ._outline_expand_prompts import OUTLINE_EXPAND_TEMPLATES
        from ._mermaid_illustration_prompts import MERMAID_ILLUSTRATION_TEMPLATES
        from ._image_generation_prompts import IMAGE_GENERATION_TEMPLATES
```

在 return 的拼接链中，于 `+ SECTION_EXPAND_TEMPLATES` 后追加：

```python
            + TABLE_CLEANUP_TEMPLATES
            + OUTLINE_EXPAND_TEMPLATES
            + MERMAID_ILLUSTRATION_TEMPLATES
            + IMAGE_GENERATION_TEMPLATES
```

- [ ] **Step 10: 语法检查**

Run: `cd backend && python3 -m py_compile apps/generation/constants.py config/settings/base.py apps/outline/models/section.py apps/generation/management/commands/_table_cleanup_prompts.py apps/generation/management/commands/_outline_expand_prompts.py apps/generation/management/commands/_mermaid_illustration_prompts.py apps/generation/management/commands/_image_generation_prompts.py apps/generation/management/commands/seed_prompts.py && echo OK`
Expected: `OK`

- [ ] **Step 11: Commit**

```bash
git add backend/apps/generation/constants.py backend/config/settings/base.py backend/apps/outline/models/section.py backend/apps/outline/migrations/0015_section_mermaid_image_fields.py backend/apps/generation/management/commands/_table_cleanup_prompts.py backend/apps/generation/management/commands/_outline_expand_prompts.py backend/apps/generation/management/commands/_mermaid_illustration_prompts.py backend/apps/generation/management/commands/_image_generation_prompts.py backend/apps/generation/management/commands/seed_prompts.py
git commit -m "feat(p3-base): Section 5 字段 + 4 scenario + 4 prompt + settings"
```

---

## Task 2: 表格清理服务（TDD，手动单章）

**Files:**
- Create: `backend/apps/outline/services/table_cleanup_service.py`
- Create: `backend/apps/outline/tests/test_table_cleanup.py`

**Interfaces:**
- Consumes: `AiTaskExecutionService.execute(scenario="table_cleanup")`、`Section`、`SectionVersion`
- Produces: `TableCleanupService.cleanup_section(section_id, user, async_task=None) -> dict`，返回 `{"total_tables": N, "kept": M, "converted": K, "failed": L}`

- [ ] **Step 1: 写失败测试 — 表格保留**

创建 `backend/apps/outline/tests/test_table_cleanup.py`：

```python
# backend/apps/outline/tests/test_table_cleanup.py
"""表格清理测试。"""
from unittest.mock import patch, MagicMock
from django.test import TestCase
from django.contrib.auth import get_user_model

from apps.outline.models import Outline, Section
from apps.outline.services.table_cleanup_service import TableCleanupService

User = get_user_model()


class TableCleanupTest(TestCase):
    def setUp(self):
        from apps.projects.models import Project, Lot
        self.user, _ = User.objects.get_or_create(username="test_table_cleanup_user")
        self.project = Project.objects.create(name="测试项目", created_by=self.user)
        self.lot = Lot.objects.create(project=self.project, name="测试标段")
        self.outline = Outline.objects.create(
            project=self.project, lot=self.lot, name="测试大纲", created_by=self.user,
        )

    def _make_section(self, content):
        return Section.objects.create(
            outline=self.outline, title="1.1 测试章节", level=1, sort_order=1,
            content=content, content_word_count=50, word_count=50,
        )

    def _mock_prompt_run(self, output_json):
        run = MagicMock()
        run.status = "succeeded"
        run.output_json = output_json
        return run

    def test_table_keep(self):
        """AI 返回 keep=true，表格保留不动。"""
        content = "| 参数 | 值 |\n|---|---|\n| CPU | 8核 |\n"
        section = self._make_section(content)
        svc = TableCleanupService()
        with patch("apps.outline.services.table_cleanup_service.AiTaskExecutionService") as mock_ai:
            mock_ai.return_value.execute.return_value = self._mock_prompt_run(
                {"keep": True, "reason": "参数表", "text替代": ""}
            )
            result = svc.cleanup_section(section.id, self.user)
        section.refresh_from_db()
        self.assertIn("| CPU | 8核 |", section.content)
        self.assertEqual(result["kept"], 1)
        self.assertEqual(result["converted"], 0)
```

- [ ] **Step 2: 运行测试验证失败**

Run: `cd backend && DATABASE_URL="postgres://bid:bid@localhost:5432/bid_test" python -m pytest apps/outline/tests/test_table_cleanup.py::TableCleanupTest::test_table_keep -v 2>&1 | tail -5`
Expected: FAIL with `ModuleNotFoundError: No module named 'apps.outline.services.table_cleanup_service'`

- [ ] **Step 3: 写最小实现 — cleanup_section**

创建 `backend/apps/outline/services/table_cleanup_service.py`：

```python
# backend/apps/outline/services/table_cleanup_service.py
"""表格清理服务（P3，AI 逐表判断保留/转文字）。

用户手动触发单章，逐表调 AI 判断，转文字的用 AI 生成的文字描述替换。
"""
import logging
import re
from typing import List

from django.db.models import Max
from django.utils import timezone

from apps.generation.services.ai_task_execution_service import AiTaskExecutionService
from apps.outline.models import Section, SectionVersion
from apps.outline.constants import SectionVersionSource

logger = logging.getLogger(__name__)

# Markdown 表格正则：| ... | 行 + 分隔行 + 数据行
TABLE_PATTERN = re.compile(
    r"(\|[^\n]+\|\n\|[-:| ]+\|\n(?:\|[^\n]+\|\n)+)"
)


class TableCleanupService:
    """表格清理服务。"""

    def cleanup_section(self, section_id: int, user, async_task=None) -> dict:
        """单章表格清理：逐表调 AI 判断，转文字的替换。

        Returns:
            {"total_tables": N, "kept": M, "converted": K, "failed": L}
        """
        section = Section.objects.get(pk=section_id)
        content = section.content or ""

        tables = TABLE_PATTERN.findall(content)
        if not tables:
            return {"total_tables": 0, "kept": 0, "converted": 0, "failed": 0}

        total = len(tables)
        kept = 0
        converted = 0
        failed = 0
        new_content = content

        for idx, table in enumerate(tables):
            if async_task:
                async_task.progress = int((idx / total) * 100)
                async_task.current_step = f"表格清理：{idx+1}/{total}"
                async_task.save(update_fields=["progress", "current_step"])

            try:
                run = AiTaskExecutionService().execute(
                    scenario="table_cleanup",
                    variables={
                        "chapter_title": section.title,
                        "write_scope": (section.content_matrix or {}).get("write_scope", ""),
                        "table_markdown": table,
                    },
                    created_by=user,
                    business_context={"project_id": section.outline.project_id},
                )
                if run.status != "succeeded":
                    failed += 1
                    continue

                result = run.output_json or {}
                if result.get("keep"):
                    kept += 1
                else:
                    text_alt = (result.get("text替代") or "").strip()
                    if text_alt:
                        new_content = new_content.replace(table, text_alt, 1)
                        converted += 1
                    else:
                        failed += 1
            except Exception as e:
                logger.warning(f"Table cleanup failed for table {idx} in section {section_id}: {e}")
                failed += 1

        # 保存
        if converted > 0:
            section.content = new_content
            section.content_word_count = self._count_words(new_content)
            section.word_count = section.content_word_count
            section.save(update_fields=["content", "content_word_count", "word_count", "updated_at"])

            max_version = (
                SectionVersion.objects.filter(section=section)
                .aggregate(max_version=Max("version_no"))["max_version"]
                or 0
            )
            SectionVersion.objects.create(
                section=section,
                content=new_content,
                version_no=max_version + 1,
                source=SectionVersionSource.AI,
                word_count=section.content_word_count,
                created_by=user,
            )

        return {"total_tables": total, "kept": kept, "converted": converted, "failed": failed}

    def _count_words(self, text: str) -> int:
        if not text:
            return 0
        clean = re.sub(r"[#*`\-|>]", "", text)
        clean = re.sub(r"\s+", "", clean)
        return len(clean)
```

- [ ] **Step 4: 运行测试验证通过**

Run: `cd backend && DATABASE_URL="postgres://bid:bid@localhost:5432/bid_test" python -m pytest apps/outline/tests/test_table_cleanup.py::TableCleanupTest::test_table_keep -v 2>&1 | tail -5`
Expected: PASS

- [ ] **Step 5: 写测试 — 表格转文字**

在 `test_table_cleanup.py` 类里追加：

```python
    def test_table_convert_to_text(self):
        """AI 返回 keep=false，表格替换为文字。"""
        content = "| 项目 |\n|---|\n| 这是一段很长的描述文字内容 |\n"
        section = self._make_section(content)
        svc = TableCleanupService()
        with patch("apps.outline.services.table_cleanup_service.AiTaskExecutionService") as mock_ai:
            mock_ai.return_value.execute.return_value = self._mock_prompt_run(
                {"keep": False, "reason": "单列长句", "text替代": "项目：这是一段很长的描述文字内容。"}
            )
            result = svc.cleanup_section(section.id, self.user)
        section.refresh_from_db()
        self.assertNotIn("|---|", section.content)
        self.assertIn("这是一段很长的描述文字内容。", section.content)
        self.assertEqual(result["converted"], 1)

    def test_single_table_failure_isolated(self):
        """单表失败跳过，其他表继续。"""
        content = "| 参数 | 值 |\n|---|---|\n| CPU | 8核 |\n\n| 项目 |\n|---|\n| 长描述 |\n"
        section = self._make_section(content)
        svc = TableCleanupService()
        call_count = {"n": 0}

        def mock_execute(scenario, variables, created_by, business_context=None):
            call_count["n"] += 1
            if call_count["n"] == 1:
                raise Exception("模拟失败")
            return self._mock_prompt_run({"keep": False, "reason": "", "text替代": "转文字内容。"})

        with patch("apps.outline.services.table_cleanup_service.AiTaskExecutionService") as mock_ai:
            mock_ai.return_value.execute.side_effect = mock_execute
            result = svc.cleanup_section(section.id, self.user)
        self.assertEqual(result["failed"], 1)
        self.assertEqual(result["converted"], 1)

    def test_no_tables_skip(self):
        """无表格直接返回 0。"""
        section = self._make_section("纯文字内容，没有表格。")
        svc = TableCleanupService()
        result = svc.cleanup_section(section.id, self.user)
        self.assertEqual(result["total_tables"], 0)
```

- [ ] **Step 6: 运行全部测试**

Run: `cd backend && DATABASE_URL="postgres://bid:bid@localhost:5432/bid_test" python -m pytest apps/outline/tests/test_table_cleanup.py -v 2>&1 | tail -10`
Expected: 4 PASSED

- [ ] **Step 7: Commit**

```bash
git add backend/apps/outline/services/table_cleanup_service.py backend/apps/outline/tests/test_table_cleanup.py
git commit -m "feat(table-cleanup): 表格清理服务（AI 逐表判断保留/转文字）"
```

---

## Task 3: 字数补目录服务（TDD，手动大纲级）

**Files:**
- Create: `backend/apps/outline/services/outline_expand_service.py`
- Create: `backend/apps/outline/tests/test_outline_expand.py`

**Interfaces:**
- Consumes: `AiTaskExecutionService.execute(scenario="outline_expand")`、`Section`、`Outline`
- Produces: `OutlineExpandService.expand_outline(outline_id, target_total_words, user, async_task=None) -> dict`，返回 `{"added": [...], "new_total_estimated": N, "current_total": M}`

- [ ] **Step 1: 写失败测试 — 补子目录挂在叶子下**

创建 `backend/apps/outline/tests/test_outline_expand.py`：

```python
# backend/apps/outline/tests/test_outline_expand.py
"""字数补目录测试。"""
from unittest.mock import patch, MagicMock
from django.test import TestCase
from django.contrib.auth import get_user_model

from apps.outline.models import Outline, Section
from apps.outline.services.outline_expand_service import OutlineExpandService

User = get_user_model()


class OutlineExpandTest(TestCase):
    def setUp(self):
        from apps.projects.models import Project, Lot
        self.user, _ = User.objects.get_or_create(username="test_outline_expand_user")
        self.project = Project.objects.create(name="测试项目", created_by=self.user)
        self.lot = Lot.objects.create(project=self.project, name="测试标段")
        self.outline = Outline.objects.create(
            project=self.project, lot=self.lot, name="测试大纲", created_by=self.user,
        )
        # 造一个叶子章节
        self.leaf = Section.objects.create(
            outline=self.outline, title="1.1 测试章节", level=2, sort_order=0,
            content="正文", content_word_count=100, word_count=100,
        )

    def _mock_prompt_run(self, output_json):
        run = MagicMock()
        run.status = "succeeded"
        run.output_json = output_json
        return run

    def test_add_sections_under_leaf(self):
        """新增子目录挂在叶子下，level 递增。"""
        svc = OutlineExpandService()
        added_json = [
            {"parent_section_id": self.leaf.id, "title": "1.1.1 子项", "level": 3, "write_scope": "子项范围"},
            {"parent_section_id": self.leaf.id, "title": "1.1.2 子项", "level": 3, "write_scope": "子项范围2"},
        ]
        with patch("apps.outline.services.outline_expand_service.AiTaskExecutionService") as mock_ai:
            mock_ai.return_value.execute.return_value = self._mock_prompt_run({"added_sections": added_json})
            result = svc.expand_outline(self.outline.id, target_total_words=1000, user=self.user)
        self.assertEqual(len(result["added"]), 2)
        new_sections = Section.objects.filter(parent=self.leaf)
        self.assertEqual(new_sections.count(), 2)
        for s in new_sections:
            self.assertEqual(s.level, 3)

    def test_empty_added_returns(self):
        """AI 返回空，提示无需补充。"""
        svc = OutlineExpandService()
        with patch("apps.outline.services.outline_expand_service.AiTaskExecutionService") as mock_ai:
            mock_ai.return_value.execute.return_value = self._mock_prompt_run({"added_sections": []})
            result = svc.expand_outline(self.outline.id, target_total_words=1000, user=self.user)
        self.assertEqual(result["added"], [])
        self.assertEqual(Section.objects.filter(outline=self.outline).count(), 1)
```

- [ ] **Step 2: 运行测试验证失败**

Run: `cd backend && DATABASE_URL="postgres://bid:bid@localhost:5432/bid_test" python -m pytest apps/outline/tests/test_outline_expand.py::OutlineExpandTest::test_add_sections_under_leaf -v 2>&1 | tail -5`
Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: 写最小实现 — expand_outline**

创建 `backend/apps/outline/services/outline_expand_service.py`：

```python
# backend/apps/outline/services/outline_expand_service.py
"""字数补目录服务（P3，AI 补二三四级子目录）。

用户手动触发大纲级，输入目标总字数，AI 补充子目录扩展生成空间。
不删现有目录，不自动生成正文。
"""
import logging

from django.db.models import Max

from apps.generation.services.ai_task_execution_service import AiTaskExecutionService
from apps.outline.models import Outline, Section

logger = logging.getLogger(__name__)


class OutlineExpandService:
    """字数补目录服务。"""

    def expand_outline(self, outline_id: int, target_total_words: int, user, async_task=None) -> dict:
        """大纲级字数补目录：AI 补二三四级子目录。

        Returns:
            {"added": [...], "new_total_estimated": N, "current_total": M}
        """
        outline = Outline.objects.get(pk=outline_id)
        sections = Section.objects.filter(outline=outline).order_by("sort_order")

        current_total = sum(s.content_word_count or 0 for s in sections)

        if async_task:
            async_task.progress = 20
            async_task.current_step = "字数补目录：调用 AI"
            async_task.save(update_fields=["progress", "current_step"])

        run = AiTaskExecutionService().execute(
            scenario="outline_expand",
            variables=self._build_variables(outline, sections, current_total, target_total_words),
            created_by=user,
            business_context={"project_id": outline.project_id},
        )

        if run.status != "succeeded":
            return {"added": [], "new_total_estimated": current_total, "current_total": current_total}

        added_data = (run.output_json or {}).get("added_sections") or []
        added = []

        for idx, item in enumerate(added_data):
            if async_task:
                async_task.progress = 20 + int((idx / max(len(added_data), 1)) * 70)
                async_task.current_step = f"字数补目录：创建 {idx+1}/{len(added_data)}"
                async_task.save(update_fields=["progress", "current_step"])

            parent_id = item.get("parent_section_id")
            try:
                parent = Section.objects.get(pk=parent_id, outline=outline)
            except Section.DoesNotExist:
                logger.warning(f"Parent section {parent_id} not found, skip")
                continue

            level = item.get("level") or (parent.level + 1)
            if level > 5:
                level = 5
            if level != parent.level + 1:
                level = parent.level + 1

            max_sort = (
                Section.objects.filter(parent=parent).aggregate(m=Max("sort_order"))["m"] or -1
            )
            new_section = Section.objects.create(
                outline=outline,
                parent=parent,
                title=item.get("title", ""),
                level=level,
                sort_order=max_sort + 1,
                content_matrix={"write_scope": item.get("write_scope", "")},
            )
            added.append({
                "section_id": new_section.id,
                "parent_section_id": parent_id,
                "title": new_section.title,
                "level": level,
            })

        # 估算：当前总字数 + 新增章节数 * 平均单章字数
        avg_words = 500
        new_total_estimated = current_total + len(added) * avg_words

        if async_task:
            async_task.progress = 100
            async_task.current_step = "字数补目录：完成"
            async_task.save(update_fields=["progress", "current_step"])

        return {
            "added": added,
            "new_total_estimated": new_total_estimated,
            "current_total": current_total,
        }

    def _build_variables(self, outline, sections, current_total, target_total_words) -> dict:
        project = outline.project
        project_overview = f"项目名称：{project.name}\n标段：{outline.lot.name if outline.lot else ''}"

        lines = []
        for s in sections:
            indent = "  " * (s.level - 1)
            lines.append(f"{indent}- {s.title}（字数：{s.content_word_count or 0}）")
        outline_structure = "\n".join(lines)

        current_word_stats = f"当前总字数：{current_total}\n目标总字数：{target_total_words}"

        requirement_groups = ""
        if outline.requirement_groups:
            import json
            requirement_groups = json.dumps(outline.requirement_groups, ensure_ascii=False, indent=2)

        return {
            "project_overview": project_overview,
            "outline_structure": outline_structure,
            "current_word_stats": current_word_stats,
            "target_total_words": target_total_words,
            "requirement_groups": requirement_groups or "无",
        }
```

- [ ] **Step 4: 运行测试验证通过**

Run: `cd backend && DATABASE_URL="postgres://bid:bid@localhost:5432/bid_test" python -m pytest apps/outline/tests/test_outline_expand.py -v 2>&1 | tail -10`
Expected: 2 PASSED

- [ ] **Step 5: Commit**

```bash
git add backend/apps/outline/services/outline_expand_service.py backend/apps/outline/tests/test_outline_expand.py
git commit -m "feat(outline-expand): 字数补目录服务（AI 补二三四级子目录）"
```

---

## Task 4: Mermaid 配图服务（TDD，含 mermaid.ink 渲染）

**Files:**
- Create: `backend/apps/outline/services/mermaid_illustration_service.py`
- Create: `backend/apps/outline/tests/test_mermaid_illustration.py`

**Interfaces:**
- Consumes: `AiTaskExecutionService.execute(scenario="mermaid_illustration")`、`StorageService`、`requests.get`（mermaid.ink）、`settings.MERMAID_RENDER_URL`
- Produces: `MermaidIllustrationService.run_illustration(outline_id, user, async_task=None) -> dict`、`MermaidIllustrationService._render_mermaid(code) -> bytes | None`、`MermaidIllustrationService._generate_for_section(section, user) -> dict`

- [ ] **Step 1: 写失败测试 — 渲染成功嵌入**

创建 `backend/apps/outline/tests/test_mermaid_illustration.py`：

```python
# backend/apps/outline/tests/test_mermaid_illustration.py
"""Mermaid 配图测试。"""
from unittest.mock import patch, MagicMock
from django.test import TestCase
from django.contrib.auth import get_user_model

from apps.outline.models import Outline, Section
from apps.outline.services.mermaid_illustration_service import MermaidIllustrationService

User = get_user_model()


class MermaidIllustrationTest(TestCase):
    def setUp(self):
        from apps.projects.models import Project, Lot
        self.user, _ = User.objects.get_or_create(username="test_mermaid_user")
        self.project = Project.objects.create(name="测试项目", created_by=self.user)
        self.lot = Lot.objects.create(project=self.project, name="测试标段")
        self.outline = Outline.objects.create(
            project=self.project, lot=self.lot, name="测试大纲", created_by=self.user,
        )

    def _make_section_with_plan(self):
        return Section.objects.create(
            outline=self.outline, title="1.1 测试章节", level=1, sort_order=1,
            content="正文", content_word_count=100, word_count=100,
            content_plan={"mermaid": {"needed": True, "purpose": "流程图"}},
        )

    def _mock_prompt_run(self, output_json):
        run = MagicMock()
        run.status = "succeeded"
        run.output_json = output_json
        return run

    def _mock_png_response(self):
        resp = MagicMock()
        resp.status_code = 200
        resp.headers = {"content-type": "image/png"}
        resp.content = b"fake-png-bytes"
        return resp

    def test_render_success_embed(self):
        """渲染成功存 MinIO + 嵌入正文。"""
        section = self._make_section_with_plan()
        svc = MermaidIllustrationService()
        with patch("apps.outline.services.mermaid_illustration_service.AiTaskExecutionService") as mock_ai, \
             patch("apps.outline.services.mermaid_illustration_service.requests") as mock_req, \
             patch("apps.outline.services.mermaid_illustration_service.StorageService") as mock_storage:
            mock_ai.return_value.execute.return_value = self._mock_prompt_run(
                {"mermaid_code": "flowchart TD\n  A-->B", "diagram_type": "flowchart"}
            )
            mock_req.get.return_value = self._mock_png_response()
            mock_storage.return_value.upload_fileobj.return_value = "mermaid/1/1.png"
            result = svc._generate_for_section(section, self.user)
        section.refresh_from_db()
        self.assertTrue(result["success"])
        self.assertIn("```mermaid", section.content)
        self.assertEqual(section.mermaid_code, "flowchart TD\n  A-->B")
        self.assertTrue(section.mermaid_object_key)
```

- [ ] **Step 2: 运行测试验证失败**

Run: `cd backend && DATABASE_URL="postgres://bid:bid@localhost:5432/bid_test" python -m pytest apps/outline/tests/test_mermaid_illustration.py::MermaidIllustrationTest::test_render_success_embed -v 2>&1 | tail -5`
Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: 写最小实现 — run_illustration + _generate_for_section + _render_mermaid**

创建 `backend/apps/outline/services/mermaid_illustration_service.py`：

```python
# backend/apps/outline/services/mermaid_illustration_service.py
"""Mermaid 配图服务（P3，生成代码 + mermaid.ink 渲染校验 + 失败修复）。

批量生成完成后自动触发，扫描 content_plan.mermaid.needed=true 章节统一生成。
"""
import base64
import logging

import requests
from django.conf import settings
from django.db.models import Max

from apps.common.services.storage import StorageService
from apps.generation.services.ai_task_execution_service import AiTaskExecutionService
from apps.outline.models import Outline, Section, SectionVersion
from apps.outline.constants import SectionVersionSource

logger = logging.getLogger(__name__)


class MermaidIllustrationService:
    """Mermaid 配图服务。"""

    def run_illustration(self, outline_id: int, user, async_task=None) -> dict:
        """批量扫描 mermaid.needed=true 章节统一生成。

        Returns:
            {"total": N, "succeeded": M, "failed": K}
        """
        sections = list(
            Section.objects.filter(
                outline_id=outline_id,
                content_plan__mermaid__needed=True,
                mermaid_code="",
            ).order_by("sort_order")
        )
        if not sections:
            return {"total": 0, "succeeded": 0, "failed": 0}

        total = len(sections)
        succeeded = 0
        failed = 0

        for idx, section in enumerate(sections):
            if async_task:
                async_task.progress = int((idx / total) * 100)
                async_task.current_step = f"Mermaid 配图：{idx+1}/{total}"
                async_task.save(update_fields=["progress", "current_step"])
            try:
                result = self._generate_for_section(section, user)
                if result.get("success"):
                    succeeded += 1
                else:
                    failed += 1
            except Exception as e:
                logger.warning(f"Mermaid illustration failed for section {section.id}: {e}")
                failed += 1

        return {"total": total, "succeeded": succeeded, "failed": failed}

    def _generate_for_section(self, section: Section, user) -> dict:
        """单章：调 AI 生成 → 渲染 → 失败修复 1 次 → 存 MinIO + 嵌入正文。"""
        variables = {
            "chapter_title": section.title,
            "write_scope": (section.content_matrix or {}).get("write_scope", ""),
            "chapter_summary": section.content_summary or "",
            "render_error": "",
        }

        # 第1次生成
        run = AiTaskExecutionService().execute(
            scenario="mermaid_illustration",
            variables=variables,
            created_by=user,
            business_context={"project_id": section.outline.project_id},
        )
        if run.status != "succeeded":
            return {"success": False, "reason": "AI 生成失败"}

        code = (run.output_json or {}).get("mermaid_code", "")
        if not code:
            return {"success": False, "reason": "空 mermaid_code"}

        # 第1次渲染
        png = self._render_mermaid(code)
        render_error = ""
        if not png:
            render_error = "渲染失败：mermaid.ink 未返回有效 PNG"

        # 第2次：带错误修复
        if not png:
            variables["render_error"] = render_error
            run2 = AiTaskExecutionService().execute(
                scenario="mermaid_illustration",
                variables=variables,
                created_by=user,
                business_context={"project_id": section.outline.project_id},
            )
            if run2.status == "succeeded":
                code = (run2.output_json or {}).get("mermaid_code", code)
                png = self._render_mermaid(code)

        # 2 次都失败：存 code 不嵌入
        section.mermaid_code = code
        if png:
            object_key = f"mermaid/{section.outline_id}/{section.id}.png"
            try:
                StorageService().upload_fileobj(
                    file_obj=__import__("io").BytesIO(png),
                    object_key=object_key,
                    content_type="image/png",
                )
                section.mermaid_object_key = object_key
            except Exception as e:
                logger.warning(f"Upload mermaid png failed for section {section.id}: {e}")

        section.save(update_fields=["mermaid_code", "mermaid_object_key", "updated_at"])

        if not png:
            return {"success": False, "reason": "2 次渲染都失败"}

        # 嵌入正文
        mermaid_block = f"\n\n```mermaid\n{code}\n```\n"
        new_content = (section.content or "").rstrip() + mermaid_block
        section.content = new_content
        section.save(update_fields=["content", "updated_at"])

        # 版本
        max_version = (
            SectionVersion.objects.filter(section=section)
            .aggregate(max_version=Max("version_no"))["max_version"]
            or 0
        )
        SectionVersion.objects.create(
            section=section,
            content=new_content,
            version_no=max_version + 1,
            source=SectionVersionSource.AI,
            word_count=section.content_word_count or 0,
            created_by=user,
        )

        return {"success": True, "mermaid_code": code}

    def _render_mermaid(self, code: str) -> bytes | None:
        """调 mermaid.ink 渲染 Mermaid 代码为 PNG。失败返回 None。"""
        if not code:
            return None
        try:
            encoded = base64.urlsafe_b64encode(code.encode("utf-8")).decode("ascii")
            url = f"{settings.MERMAID_RENDER_URL}/img/{encoded}"
            resp = requests.get(url, timeout=getattr(settings, "MERMAID_RENDER_TIMEOUT", 30))
            if resp.status_code == 200 and "image" in resp.headers.get("content-type", ""):
                return resp.content
            logger.warning(f"mermaid.ink render failed: status={resp.status_code}")
            return None
        except Exception as e:
            logger.warning(f"mermaid.ink render error: {e}")
            return None
```

- [ ] **Step 4: 运行测试验证通过**

Run: `cd backend && DATABASE_URL="postgres://bid:bid@localhost:5432/bid_test" python -m pytest apps/outline/tests/test_mermaid_illustration.py::MermaidIllustrationTest::test_render_success_embed -v 2>&1 | tail -5`
Expected: PASS

- [ ] **Step 5: 写测试 — 渲染失败修复成功 + 2 次都失败不嵌入**

在 `test_mermaid_illustration.py` 类里追加：

```python
    def test_render_fail_repair_success(self):
        """首次渲染失败，修复后渲染成功。"""
        section = self._make_section_with_plan()
        svc = MermaidIllustrationService()
        with patch("apps.outline.services.mermaid_illustration_service.AiTaskExecutionService") as mock_ai, \
             patch("apps.outline.services.mermaid_illustration_service.requests") as mock_req, \
             patch("apps.outline.services.mermaid_illustration_service.StorageService") as mock_storage:
            # 第1次 AI 成功，渲染失败；第2次 AI 修复，渲染成功
            mock_ai.return_value.execute.side_effect = [
                self._mock_prompt_run({"mermaid_code": "bad code", "diagram_type": "flowchart"}),
                self._mock_prompt_run({"mermaid_code": "flowchart TD\n  A-->B", "diagram_type": "flowchart"}),
            ]
            mock_req.get.side_effect = [
                MagicMock(status_code=400, headers={}, content=b""),  # 第1次渲染失败
                self._mock_png_response(),  # 第2次渲染成功
            ]
            mock_storage.return_value.upload_fileobj.return_value = "mermaid/1/1.png"
            result = svc._generate_for_section(section, self.user)
        self.assertTrue(result["success"])
        self.assertEqual(mock_ai.return_value.execute.call_count, 2)

    def test_render_fail_twice_no_embed(self):
        """2 次渲染都失败，不嵌入正文。"""
        section = self._make_section_with_plan()
        svc = MermaidIllustrationService()
        with patch("apps.outline.services.mermaid_illustration_service.AiTaskExecutionService") as mock_ai, \
             patch("apps.outline.services.mermaid_illustration_service.requests") as mock_req:
            mock_ai.return_value.execute.return_value = self._mock_prompt_run(
                {"mermaid_code": "bad code", "diagram_type": "flowchart"}
            )
            mock_req.get.return_value = MagicMock(status_code=400, headers={}, content=b"")
            result = svc._generate_for_section(section, self.user)
        section.refresh_from_db()
        self.assertFalse(result["success"])
        self.assertEqual(section.mermaid_code, "bad code")
        self.assertNotIn("```mermaid", section.content)
        self.assertEqual(section.mermaid_object_key, "")

    def test_skip_already_has_mermaid(self):
        """mermaid_code 非空跳过。"""
        section = Section.objects.create(
            outline=self.outline, title="1.1 已有", level=1, sort_order=1,
            content="正文", content_word_count=100, word_count=100,
            content_plan={"mermaid": {"needed": True}},
            mermaid_code="flowchart TD\n  A-->B",
        )
        svc = MermaidIllustrationService()
        result = svc.run_illustration(self.outline.id, self.user)
        self.assertEqual(result["total"], 0)
```

- [ ] **Step 6: 运行全部测试**

Run: `cd backend && DATABASE_URL="postgres://bid:bid@localhost:5432/bid_test" python -m pytest apps/outline/tests/test_mermaid_illustration.py -v 2>&1 | tail -10`
Expected: 4 PASSED

- [ ] **Step 7: Commit**

```bash
git add backend/apps/outline/services/mermaid_illustration_service.py backend/apps/outline/tests/test_mermaid_illustration.py
git commit -m "feat(mermaid-illustration): Mermaid 配图服务（mermaid.ink 渲染校验 + 失败修复）"
```

---

## Task 5: AI 生图服务 + LLMService.generate_image 扩展（TDD）

**Files:**
- Modify: `backend/apps/generation/providers/base.py`
- Modify: `backend/apps/generation/providers/deepseek_client.py`
- Modify: `backend/apps/generation/services/llm_service.py`
- Create: `backend/apps/outline/services/image_generation_service.py`
- Create: `backend/apps/outline/tests/test_image_generation.py`

**Interfaces:**
- Consumes: `AiTaskExecutionService.execute(scenario="image_generation")`、`LLMService.generate_image`、`StorageService`、`settings.IMAGE_GEN_MODEL`
- Produces: `ImageGenerationService.run_generation(outline_id, user, async_task=None) -> dict`、`ImageGenerationService._generate_for_section(section, user) -> dict`、`LLMService.generate_image(model, prompt, negative_prompt, size) -> bytes | None`

- [ ] **Step 1: 在 ProviderClient 加 generate_image 抽象方法**

修改 `backend/apps/generation/providers/base.py`，在 `chat` 方法后追加：

```python
    @abstractmethod
    def generate_image(
        self,
        model_config,
        prompt: str,
        negative_prompt: str = "",
        size: str = "1024x1024",
    ) -> bytes | None:
        """执行生图调用。

        Args:
            model_config: 模型配置
            prompt: 生图提示词
            negative_prompt: 反向提示词
            size: 图片尺寸

        Returns:
            图片 bytes，失败返回 None
        """
        pass
```

- [ ] **Step 2: 在 DeepSeekClient 实现 generate_image（OpenAI 兼容 images.generate）**

修改 `backend/apps/generation/providers/deepseek_client.py`，在 `chat` 方法后（class 末尾）追加：

```python
    def generate_image(
        self,
        model_config,
        prompt: str,
        negative_prompt: str = "",
        size: str = "1024x1024",
    ) -> bytes | None:
        """执行生图调用（OpenAI 兼容 images.generate）。失败返回 None。"""
        import io
        provider = model_config.provider
        api_key = get_provider_api_key(provider)
        if not api_key:
            raise ValueError(f"API Key 未配置，请在系统设置中配置 {provider.name} 的 API Key")

        base_url = provider.base_url or "https://api.deepseek.com"
        client = OpenAI(api_key=api_key, base_url=base_url)

        model_name = model_config.model_name or "dall-e-3"
        try:
            response = client.images.generate(
                model=model_name,
                prompt=prompt,
                n=1,
                size=size,
                response_format="b64_json",
            )
            import base64
            b64 = response.data[0].b64_json
            if b64:
                return base64.b64decode(b64)
            return None
        except Exception as e:
            logger.warning(f"DeepSeek image generation failed: {e}")
            return None
```

- [ ] **Step 3: 在 LLMService 加 generate_image 代理方法**

先读 `backend/apps/generation/services/llm_service.py` 确认结构，然后加方法。在 `LLMService` 类的 `chat` 方法后追加：

```python
    def generate_image(
        self,
        model_config,
        prompt: str,
        negative_prompt: str = "",
        size: str = "1024x1024",
    ) -> bytes | None:
        """调生图模型，返回图片 bytes。失败返回 None。"""
        client = self._get_client(model_config)
        return client.generate_image(model_config, prompt, negative_prompt, size)
```

注意：若 `LLMService._get_client` 方法名不同，先 grep `def.*client` 确认实际方法名，用实际名称。若 `chat` 方法内部用 `self.client_factory.get(model_config)` 之类，参照同样方式获取 client。

- [ ] **Step 4: 写失败测试 — 配置模型生图成功嵌入**

创建 `backend/apps/outline/tests/test_image_generation.py`：

```python
# backend/apps/outline/tests/test_image_generation.py
"""AI 生图测试。"""
from unittest.mock import patch, MagicMock
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.test import override_settings

from apps.outline.models import Outline, Section
from apps.outline.services.image_generation_service import ImageGenerationService

User = get_user_model()


class ImageGenerationTest(TestCase):
    def setUp(self):
        from apps.projects.models import Project, Lot
        self.user, _ = User.objects.get_or_create(username="test_image_gen_user")
        self.project = Project.objects.create(name="测试项目", created_by=self.user)
        self.lot = Lot.objects.create(project=self.project, name="测试标段")
        self.outline = Outline.objects.create(
            project=self.project, lot=self.lot, name="测试大纲", created_by=self.user,
        )

    def _make_section_with_plan(self):
        return Section.objects.create(
            outline=self.outline, title="1.1 测试章节", level=1, sort_order=1,
            content="正文", content_word_count=100, word_count=100,
            content_plan={"image": {"needed": True, "priority": 4, "purpose": "架构图"}},
        )

    def _mock_prompt_run(self, output_json):
        run = MagicMock()
        run.status = "succeeded"
        run.output_json = output_json
        return run

    @override_settings(IMAGE_GEN_MODEL="dall-e-3")
    def test_image_gen_success_embed(self):
        """配置模型 + 生图成功，存 MinIO + 嵌入正文。"""
        section = self._make_section_with_plan()
        svc = ImageGenerationService()
        with patch("apps.outline.services.image_generation_service.AiTaskExecutionService") as mock_ai, \
             patch("apps.outline.services.image_generation_service.LLMService") as mock_llm, \
             patch("apps.outline.services.image_generation_service.StorageService") as mock_storage:
            mock_ai.return_value.execute.return_value = self._mock_prompt_run(
                {"image_prompt": "a technical diagram", "style": "flat", "negative_prompt": "blurry"}
            )
            mock_llm.return_value.generate_image.return_value = b"fake-png"
            mock_storage.return_value.upload_fileobj.return_value = "images/1/1.png"
            result = svc._generate_for_section(section, self.user)
        section.refresh_from_db()
        self.assertTrue(result["success"])
        self.assertTrue(section.image_object_key)
        self.assertIn("![", section.content)

    @override_settings(IMAGE_GEN_MODEL="dall-e-3")
    def test_image_gen_fail_keep_prompt(self):
        """生图失败，只存 prompt。"""
        section = self._make_section_with_plan()
        svc = ImageGenerationService()
        with patch("apps.outline.services.image_generation_service.AiTaskExecutionService") as mock_ai, \
             patch("apps.outline.services.image_generation_service.LLMService") as mock_llm:
            mock_ai.return_value.execute.return_value = self._mock_prompt_run(
                {"image_prompt": "a diagram", "style": "flat", "negative_prompt": "blurry"}
            )
            mock_llm.return_value.generate_image.return_value = None
            result = svc._generate_for_section(section, self.user)
        section.refresh_from_db()
        self.assertFalse(result["success"])
        self.assertEqual(section.image_prompt, "a diagram")
        self.assertEqual(section.image_object_key, "")
        self.assertNotIn("![", section.content)

    @override_settings(IMAGE_GEN_MODEL="")
    def test_no_model_only_prompt(self):
        """未配置模型，只存 prompt。"""
        section = self._make_section_with_plan()
        svc = ImageGenerationService()
        with patch("apps.outline.services.image_generation_service.AiTaskExecutionService") as mock_ai, \
             patch("apps.outline.services.image_generation_service.LLMService") as mock_llm:
            mock_ai.return_value.execute.return_value = self._mock_prompt_run(
                {"image_prompt": "a diagram", "style": "flat", "negative_prompt": "blurry"}
            )
            result = svc._generate_for_section(section, self.user)
        section.refresh_from_db()
        self.assertFalse(result["success"])
        self.assertEqual(section.image_prompt, "a diagram")
        self.assertEqual(section.image_object_key, "")
        mock_llm.return_value.generate_image.assert_not_called()
```

- [ ] **Step 5: 运行测试验证失败**

Run: `cd backend && DATABASE_URL="postgres://bid:bid@localhost:5432/bid_test" python -m pytest apps/outline/tests/test_image_generation.py -v 2>&1 | tail -5`
Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 6: 写最小实现 — ImageGenerationService**

创建 `backend/apps/outline/services/image_generation_service.py`：

```python
# backend/apps/outline/services/image_generation_service.py
"""AI 生图服务（P3，有模型生图/无模型出 prompt）。

批量生成完成后自动触发，扫描 content_plan.image.needed=true 章节统一处理。
配置 settings.IMAGE_GEN_MODEL 则调模型生图存 MinIO 嵌入正文，未配置则只存 image_prompt。
"""
import io
import logging

from django.conf import settings
from django.db.models import Max

from apps.common.services.storage import StorageService
from apps.generation.services.ai_task_execution_service import AiTaskExecutionService
from apps.generation.services.llm_service import LLMService
from apps.outline.models import Outline, Section, SectionVersion
from apps.outline.constants import SectionVersionSource

logger = logging.getLogger(__name__)


class ImageGenerationService:
    """AI 生图服务。"""

    def run_generation(self, outline_id: int, user, async_task=None) -> dict:
        """批量扫描 image.needed=true 章节统一处理。

        Returns:
            {"total": N, "succeeded": M, "prompt_only": K, "failed": L}
        """
        sections = list(
            Section.objects.filter(
                outline_id=outline_id,
                content_plan__image__needed=True,
                image_object_key="",
            ).order_by("sort_order")
        )
        if not sections:
            return {"total": 0, "succeeded": 0, "prompt_only": 0, "failed": 0}

        total = len(sections)
        succeeded = 0
        prompt_only = 0
        failed = 0

        for idx, section in enumerate(sections):
            if async_task:
                async_task.progress = int((idx / total) * 100)
                async_task.current_step = f"AI 生图：{idx+1}/{total}"
                async_task.save(update_fields=["progress", "current_step"])
            try:
                result = self._generate_for_section(section, user)
                if result.get("success"):
                    succeeded += 1
                elif result.get("prompt_only"):
                    prompt_only += 1
                else:
                    failed += 1
            except Exception as e:
                logger.warning(f"Image generation failed for section {section.id}: {e}")
                failed += 1

        return {"total": total, "succeeded": succeeded, "prompt_only": prompt_only, "failed": failed}

    def _generate_for_section(self, section: Section, user) -> dict:
        """单章：调 AI 生成 prompt → 若配置模型则生图，否则只存 prompt。"""
        image_purpose = ""
        plan = section.content_plan or {}
        if isinstance(plan.get("image"), dict):
            image_purpose = plan["image"].get("purpose", "")

        run = AiTaskExecutionService().execute(
            scenario="image_generation",
            variables={
                "chapter_title": section.title,
                "write_scope": (section.content_matrix or {}).get("write_scope", ""),
                "chapter_summary": section.content_summary or "",
                "image_purpose": image_purpose,
            },
            created_by=user,
            business_context={"project_id": section.outline.project_id},
        )

        if run.status != "succeeded":
            return {"success": False, "prompt_only": False}

        output = run.output_json or {}
        image_prompt = output.get("image_prompt", "")
        style = output.get("style", "")
        negative_prompt = output.get("negative_prompt", "")

        # 存 prompt
        section.image_prompt = image_prompt
        section.save(update_fields=["image_prompt", "updated_at"])

        # 未配置模型：只存 prompt
        if not getattr(settings, "IMAGE_GEN_MODEL", ""):
            return {"success": False, "prompt_only": True}

        # 调生图模型
        try:
            from apps.generation.models import ModelConfig
            model_config = ModelConfig.objects.filter(
                model_name=settings.IMAGE_GEN_MODEL
            ).first()
            if not model_config:
                logger.warning(f"IMAGE_GEN_MODEL {settings.IMAGE_GEN_MODEL} not found in ModelConfig")
                return {"success": False, "prompt_only": True}

            full_prompt = f"{image_prompt}, style: {style}"
            image_bytes = LLMService().generate_image(
                model_config=model_config,
                prompt=full_prompt,
                negative_prompt=negative_prompt,
            )

            if not image_bytes:
                return {"success": False, "prompt_only": True}

            # 存 MinIO
            object_key = f"images/{section.outline_id}/{section.id}.png"
            StorageService().upload_fileobj(
                file_obj=io.BytesIO(image_bytes),
                object_key=object_key,
                content_type="image/png",
            )
            section.image_object_key = object_key
            section.save(update_fields=["image_object_key", "updated_at"])

            # 嵌入正文
            image_url = f"/minio/bid-files/{object_key}"
            image_md = f"\n\n![{section.title}]({image_url})\n"
            new_content = (section.content or "").rstrip() + image_md
            section.content = new_content
            section.save(update_fields=["content", "updated_at"])

            # 版本
            max_version = (
                SectionVersion.objects.filter(section=section)
                .aggregate(max_version=Max("version_no"))["max_version"]
                or 0
            )
            SectionVersion.objects.create(
                section=section,
                content=new_content,
                version_no=max_version + 1,
                source=SectionVersionSource.AI,
                word_count=section.content_word_count or 0,
                created_by=user,
            )

            return {"success": True}
        except Exception as e:
            logger.warning(f"Image generation call failed for section {section.id}: {e}")
            return {"success": False, "prompt_only": True}
```

- [ ] **Step 7: 运行测试验证通过**

Run: `cd backend && DATABASE_URL="postgres://bid:bid@localhost:5432/bid_test" python -m pytest apps/outline/tests/test_image_generation.py -v 2>&1 | tail -10`
Expected: 3 PASSED

- [ ] **Step 8: Commit**

```bash
git add backend/apps/generation/providers/base.py backend/apps/generation/providers/deepseek_client.py backend/apps/generation/services/llm_service.py backend/apps/outline/services/image_generation_service.py backend/apps/outline/tests/test_image_generation.py
git commit -m "feat(image-generation): AI 生图服务 + LLMService.generate_image 扩展"
```

---

## Task 6: Celery tasks + on_batch_complete 追加 + API + 部署验证

**Files:**
- Modify: `backend/apps/outline/tasks.py`
- Modify: `backend/apps/outline/views.py`
- Modify: `backend/apps/outline/serializers.py`

**Interfaces:**
- Consumes: Task 2-5 的 4 个服务类
- Produces: 4 个 Celery task + on_batch_complete 追加 Mermaid/生图触发 + 6 个 API action

- [ ] **Step 1: 在 tasks.py 加 4 个 task + on_batch_complete 追加触发**

修改 `backend/apps/outline/tasks.py`，在 `expand_sections_task` 后追加 4 个新 task：

```python
@shared_task(bind=True)
def table_cleanup_task(self, section_id: int, async_task_id: int, user_id: int):
    """单章表格清理（手动触发）。"""
    from apps.outline.services.table_cleanup_service import TableCleanupService

    async_task = AsyncTask.objects.get(pk=async_task_id)
    user = User.objects.get(pk=user_id)

    try:
        async_task.status = AsyncTask.STATUS_RUNNING
        async_task.current_step = "表格清理：启动"
        async_task.progress = 5
        async_task.started_at = timezone.now()
        async_task.save()

        result = TableCleanupService().cleanup_section(section_id, user, async_task=async_task)

        async_task.status = AsyncTask.STATUS_SUCCESS
        async_task.progress = 100
        async_task.current_step = "表格清理：完成"
        async_task.result_payload = {"section_id": section_id, **result}
        async_task.finished_at = timezone.now()
        async_task.save()
    except Exception as e:
        logger.exception("table_cleanup_task failed")
        async_task.status = AsyncTask.STATUS_FAILED
        async_task.error_message = str(e)[:2000]
        async_task.current_step = "失败"
        async_task.finished_at = timezone.now()
        async_task.save()
        raise


@shared_task(bind=True)
def outline_expand_task(self, outline_id: int, target_total_words: int, async_task_id: int, user_id: int):
    """大纲级字数补目录（手动触发）。"""
    from apps.outline.services.outline_expand_service import OutlineExpandService

    async_task = AsyncTask.objects.get(pk=async_task_id)
    user = User.objects.get(pk=user_id)

    try:
        async_task.status = AsyncTask.STATUS_RUNNING
        async_task.current_step = "字数补目录：启动"
        async_task.progress = 5
        async_task.started_at = timezone.now()
        async_task.save()

        result = OutlineExpandService().expand_outline(
            outline_id, target_total_words, user, async_task=async_task,
        )

        async_task.status = AsyncTask.STATUS_SUCCESS
        async_task.progress = 100
        async_task.current_step = "字数补目录：完成"
        async_task.result_payload = {"outline_id": outline_id, **result}
        async_task.finished_at = timezone.now()
        async_task.save()
    except Exception as e:
        logger.exception("outline_expand_task failed")
        async_task.status = AsyncTask.STATUS_FAILED
        async_task.error_message = str(e)[:2000]
        async_task.current_step = "失败"
        async_task.finished_at = timezone.now()
        async_task.save()
        raise


@shared_task(bind=True)
def mermaid_illustration_task(self, outline_id: int, async_task_id: int, user_id: int):
    """Mermaid 配图（批量后自动 + 手动重新触发）。"""
    from apps.outline.services.mermaid_illustration_service import MermaidIllustrationService

    async_task = AsyncTask.objects.get(pk=async_task_id)
    user = User.objects.get(pk=user_id)

    try:
        async_task.status = AsyncTask.STATUS_RUNNING
        async_task.current_step = "Mermaid 配图：启动"
        async_task.progress = 5
        async_task.started_at = timezone.now()
        async_task.save()

        result = MermaidIllustrationService().run_illustration(
            outline_id, user, async_task=async_task,
        )

        async_task.status = AsyncTask.STATUS_SUCCESS
        async_task.progress = 100
        async_task.current_step = "Mermaid 配图：完成"
        async_task.result_payload = {"outline_id": outline_id, **result}
        async_task.finished_at = timezone.now()
        async_task.save()
    except Exception as e:
        logger.exception("mermaid_illustration_task failed")
        async_task.status = AsyncTask.STATUS_FAILED
        async_task.error_message = str(e)[:2000]
        async_task.current_step = "失败"
        async_task.finished_at = timezone.now()
        async_task.save()
        raise


@shared_task(bind=True)
def image_generation_task(self, outline_id: int, async_task_id: int, user_id: int):
    """AI 生图（批量后自动 + 手动重新触发）。"""
    from apps.outline.services.image_generation_service import ImageGenerationService

    async_task = AsyncTask.objects.get(pk=async_task_id)
    user = User.objects.get(pk=user_id)

    try:
        async_task.status = AsyncTask.STATUS_RUNNING
        async_task.current_step = "AI 生图：启动"
        async_task.progress = 5
        async_task.started_at = timezone.now()
        async_task.save()

        result = ImageGenerationService().run_generation(
            outline_id, user, async_task=async_task,
        )

        async_task.status = AsyncTask.STATUS_SUCCESS
        async_task.progress = 100
        async_task.current_step = "AI 生图：完成"
        async_task.result_payload = {"outline_id": outline_id, **result}
        async_task.finished_at = timezone.now()
        async_task.save()
    except Exception as e:
        logger.exception("image_generation_task failed")
        async_task.status = AsyncTask.STATUS_FAILED
        async_task.error_message = str(e)[:2000]
        async_task.current_step = "失败"
        async_task.finished_at = timezone.now()
        async_task.save()
        raise
```

- [ ] **Step 2: on_batch_complete 追加 Mermaid + 生图触发**

修改 `backend/apps/outline/tasks.py` 的 `on_batch_complete` 函数，在 `expand_sections_task.delay(...)` 之后、函数结束前追加：

```python
        # 3. 触发 Mermaid 配图（扫描 mermaid.needed=true 章节）
        try:
            mermaid_async = AsyncTask.objects.create(
                task_type="mermaid_illustration",
                status=AsyncTask.STATUS_PENDING,
                related_object_type="Outline",
                related_object_id=str(task.outline_id),
                created_by=task.created_by,
            )
            mermaid_illustration_task.delay(task.outline_id, mermaid_async.id, task.created_by_id)
        except Exception as e:
            logger.warning(f"Failed to trigger mermaid illustration for outline {task.outline_id}: {e}")

        # 4. 触发 AI 生图（扫描 image.needed=true 章节）
        try:
            image_async = AsyncTask.objects.create(
                task_type="image_generation",
                status=AsyncTask.STATUS_PENDING,
                related_object_type="Outline",
                related_object_id=str(task.outline_id),
                created_by=task.created_by,
            )
            image_generation_task.delay(task.outline_id, image_async.id, task.created_by_id)
        except Exception as e:
            logger.warning(f"Failed to trigger image generation for outline {task.outline_id}: {e}")
```

注意：这段加在 `on_batch_complete` 函数末尾（原 expand 触发的 try/except 块之后）。

- [ ] **Step 3: 语法检查**

Run: `cd backend && python3 -m py_compile apps/outline/tasks.py && echo OK`
Expected: `OK`

- [ ] **Step 4: 在 views.py 加 6 个 action**

修改 `backend/apps/outline/views.py`。先 grep 确认 `OutlineViewSet` 和 `SectionViewSet` 的类名与现有 action 风格，然后在 `OutlineViewSet` 加 4 个 action，`SectionViewSet` 加 2 个 action。

在 `OutlineViewSet` 类里追加（参照现有 `consistency_audit` action 风格）：

```python
    @action(detail=True, methods=["post"])
    def expand_outline(self, request, pk=None):
        """字数补目录（手动，大纲级）。"""
        outline = self.get_object()
        target_total_words = request.data.get("target_total_words", 0)
        async_task = AsyncTask.objects.create(
            task_type="outline_expand",
            status=AsyncTask.STATUS_PENDING,
            related_object_type="Outline",
            related_object_id=str(outline.id),
            created_by=request.user,
        )
        from apps.outline.tasks import outline_expand_task
        outline_expand_task.delay(outline.id, int(target_total_words), async_task.id, request.user.id)
        return Response({"async_task_id": async_task.id, "status": async_task.status})

    @action(detail=True, methods=["post"])
    def mermaid_illustration(self, request, pk=None):
        """Mermaid 配图（手动重新触发，大纲级）。"""
        outline = self.get_object()
        async_task = AsyncTask.objects.create(
            task_type="mermaid_illustration",
            status=AsyncTask.STATUS_PENDING,
            related_object_type="Outline",
            related_object_id=str(outline.id),
            created_by=request.user,
        )
        from apps.outline.tasks import mermaid_illustration_task
        mermaid_illustration_task.delay(outline.id, async_task.id, request.user.id)
        return Response({"async_task_id": async_task.id, "status": async_task.status})

    @action(detail=True, methods=["post"])
    def image_generation(self, request, pk=None):
        """AI 生图（手动重新触发，大纲级）。"""
        outline = self.get_object()
        async_task = AsyncTask.objects.create(
            task_type="image_generation",
            status=AsyncTask.STATUS_PENDING,
            related_object_type="Outline",
            related_object_id=str(outline.id),
            created_by=request.user,
        )
        from apps.outline.tasks import image_generation_task
        image_generation_task.delay(outline.id, async_task.id, request.user.id)
        return Response({"async_task_id": async_task.id, "status": async_task.status})
```

在 `SectionViewSet` 类里追加：

```python
    @action(detail=True, methods=["post"])
    def table_cleanup(self, request, pk=None):
        """表格清理（手动，单章）。"""
        section = self.get_object()
        async_task = AsyncTask.objects.create(
            task_type="table_cleanup",
            status=AsyncTask.STATUS_PENDING,
            related_object_type="Section",
            related_object_id=str(section.id),
            created_by=request.user,
        )
        from apps.outline.tasks import table_cleanup_task
        table_cleanup_task.delay(section.id, async_task.id, request.user.id)
        return Response({"async_task_id": async_task.id, "status": async_task.status})

    @action(detail=True, methods=["post"])
    def mermaid_illustration(self, request, pk=None):
        """Mermaid 配图（手动，单章）。"""
        section = self.get_object()
        async_task = AsyncTask.objects.create(
            task_type="mermaid_illustration",
            status=AsyncTask.STATUS_PENDING,
            related_object_type="Section",
            related_object_id=str(section.id),
            created_by=request.user,
        )
        from apps.outline.tasks import mermaid_illustration_task
        # 单章触发：复用 task 但只处理该章（服务内 run_illustration 按 outline 扫描，
        # 单章场景改为直接调 _generate_for_section）
        from apps.outline.services.mermaid_illustration_service import MermaidIllustrationService
        async_task.status = AsyncTask.STATUS_RUNNING
        async_task.started_at = timezone.now()
        async_task.save()
        try:
            result = MermaidIllustrationService()._generate_for_section(section, request.user)
            async_task.status = AsyncTask.STATUS_SUCCESS
            async_task.progress = 100
            async_task.result_payload = {"section_id": section.id, **result}
            async_task.finished_at = timezone.now()
            async_task.save()
        except Exception as e:
            async_task.status = AsyncTask.STATUS_FAILED
            async_task.error_message = str(e)[:2000]
            async_task.finished_at = timezone.now()
            async_task.save()
        return Response({"async_task_id": async_task.id, "status": async_task.status})

    @action(detail=True, methods=["post"])
    def image_generation(self, request, pk=None):
        """AI 生图（手动，单章）。"""
        section = self.get_object()
        async_task = AsyncTask.objects.create(
            task_type="image_generation",
            status=AsyncTask.STATUS_PENDING,
            related_object_type="Section",
            related_object_id=str(section.id),
            created_by=request.user,
        )
        from apps.outline.services.image_generation_service import ImageGenerationService
        async_task.status = AsyncTask.STATUS_RUNNING
        async_task.started_at = timezone.now()
        async_task.save()
        try:
            result = ImageGenerationService()._generate_for_section(section, request.user)
            async_task.status = AsyncTask.STATUS_SUCCESS
            async_task.progress = 100
            async_task.result_payload = {"section_id": section.id, **result}
            async_task.finished_at = timezone.now()
            async_task.save()
        except Exception as e:
            async_task.status = AsyncTask.STATUS_FAILED
            async_task.error_message = str(e)[:2000]
            async_task.finished_at = timezone.now()
            async_task.save()
        return Response({"async_task_id": async_task.id, "status": async_task.status})
```

注意：需在 views.py 顶部 import `AsyncTask` 和 `timezone`（若未 import）。先 grep `from apps.common.models import` 和 `from django.utils import` 确认。

- [ ] **Step 5: 在 serializers.py 暴露新字段**

修改 `backend/apps/outline/serializers.py`，在 `SectionSerializer` 的 `fields` 列表（或 Meta.fields）中加入：

```python
    "mermaid_code", "mermaid_object_key", "image_prompt", "image_object_key",
```

先 grep `class SectionSerializer` 找到该类，确认 fields 是列表还是 `__all__`，按实际方式加。

- [ ] **Step 6: 语法检查**

Run: `cd backend && python3 -m py_compile apps/outline/views.py apps/outline/serializers.py && echo OK`
Expected: `OK`

- [ ] **Step 7: 重建镜像并迁移**

Run: `docker compose build web worker && docker compose up -d web worker && sleep 5 && docker exec ai-bid-generator-web-1 python manage.py migrate && docker compose restart nginx`
Expected: migrate 输出 `Applying outline.0015_section_mermaid_image_fields... OK`

- [ ] **Step 8: seed 4 个 prompt**

Run: `docker exec ai-bid-generator-web-1 python manage.py seed_prompts 2>&1 | grep -E "table_cleanup|outline_expand|mermaid_illustration|image_generation|初始化"`
Expected: 输出 4 个 `创建模板` + 4 个 `创建版本` + `初始化完成`

- [ ] **Step 9: 运行全部测试**

Run: `docker exec ai-bid-generator-web-1 python -m pytest apps/outline/tests/test_table_cleanup.py apps/outline/tests/test_outline_expand.py apps/outline/tests/test_mermaid_illustration.py apps/outline/tests/test_image_generation.py -v 2>&1 | tail -20`
Expected: 13 PASSED（4+2+4+3）

- [ ] **Step 10: API smoke test**

Run:
```bash
TOKEN=$(curl -s -X POST http://localhost/api/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['access'])")
curl -s -w "\nHTTP %{http_code}\n" "http://localhost/api/outlines/7/" -H "Authorization: Bearer $TOKEN" | tail -3
curl -s -w "\nHTTP %{http_code}\n" -X POST "http://localhost/api/sections/166/table-cleanup/" -H "Authorization: Bearer $TOKEN"
```
Expected: outline 接口 200；table-cleanup 接口 200 返回 async_task_id

- [ ] **Step 11: Commit**

```bash
git add backend/apps/outline/tasks.py backend/apps/outline/views.py backend/apps/outline/serializers.py
git commit -m "feat(p3-tasks-api): 4 个 Celery task + on_batch_complete 追加触发 + 6 个 API action"
git commit --allow-empty -m "chore(p3): 端到端验证通过（13测试+API smoke test）"
```
