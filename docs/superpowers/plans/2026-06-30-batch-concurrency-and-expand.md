# 批量生成并发 + 字数不足扩写 Implementation Plan（P2-2 + P2-3）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 批量正文生成从 while 串行改为 Celery group/chord 并发（3-5 倍提速），生成完成后统一对字数不足的章节做局部 insert/replace 扩写，多轮直到达标或达 MAX_EXPAND_ROUNDS。

**Architecture:** 重构 `batch_section_generation_task`：收集 pending IDs → `group(generate_single_section_for_batch.s(sid, task_id) for sid in ids)` → `chord(group)(on_batch_complete.s(task_id))`。chord 回调调 `_finalize_batch_task`（保留现有审计触发），再触发 `expand_sections_task`。扩写服务 `SectionExpandService` 移植 OpenBidKit `expandOneSection`/`applyContentExpansionPatch`：调 `section_expand` scenario 返回 `{operation, anchor, content}`，应用局部 patch，多轮直到达标。

**Tech Stack:** Django + DRF + Celery（group/chord）+ PostgreSQL。Prompt 走 Jinja2 入库（PromptTemplate+PromptVersion），AI 调用走 `AiTaskExecutionService.execute`。

## Global Constraints

- 所有 prompt 写入 PromptTemplate+PromptVersion（Jinja2 `{{ var }}` 语法），禁止代码内联 prompt
- AI 调用走 `AiTaskExecutionService.execute(scenario, variables, created_by, business_context={"project_id": ...})`
- `business_context` 只能传 `{"project_id": ...}`（PromptRun 限制，传 outline_id 等会触发 TypeError）
- 后端测试用 pytest：`cd backend && python -m pytest apps/outline/tests/test_batch_concurrency.py apps/outline/tests/test_section_expand.py -v`
- Docker 部署：`docker compose build web worker && docker compose up -d web worker && docker exec ai-bid-generator-web-1 python manage.py migrate && docker compose restart nginx`
- Celery worker `--concurrency` 由 docker-compose 控制，group 自动派发；本计划不修改 docker-compose
- `Section.content_word_count` 是正文字数字段（已有），扩写前后用它判断是否达标
- `BatchGenerationTaskItem` 状态枚举：pending/running/success/failed/skipped/cancelled（已有，不新增）
- 现有 `_finalize_batch_task` 已在末尾触发一致性审计，chord 回调复用它，**不重复触发审计**
- 扩写失败不阻断主流程，仅记录日志；扩写后的内容覆盖 `Section.content` 并创建 `SectionVersion`

---

## File Structure

新建：
- `backend/apps/generation/management/commands/_section_expand_prompts.py` — section_expand prompt 模板
- `backend/apps/outline/services/section_expand_service.py` — 扩写服务（run_expand/expand_section/_apply_patch）
- `backend/apps/outline/tests/test_batch_concurrency.py` — 并发测试
- `backend/apps/outline/tests/test_section_expand.py` — 扩写测试

修改：
- `backend/apps/generation/constants.py` — 新增 `SECTION_EXPAND` scenario
- `backend/apps/generation/management/commands/seed_prompts.py` — 注册 section_expand prompt
- `backend/apps/outline/tasks.py` — 重构 `batch_section_generation_task` 为 group/chord + 新增 `generate_single_section_for_batch`/`on_batch_complete`/`expand_sections_task`
- `backend/config/settings/base.py` — 新增 `MIN_SECTION_WORDS`/`MAX_EXPAND_ROUNDS`/`CONTENT_CONCURRENCY`

无新增迁移（无新模型字段）。

---

## Task 1: section_expand scenario + prompt 模板 + settings

**Files:**
- Modify: `backend/apps/generation/constants.py`
- Modify: `backend/config/settings/base.py`
- Create: `backend/apps/generation/management/commands/_section_expand_prompts.py`
- Modify: `backend/apps/generation/management/commands/seed_prompts.py`

**Interfaces:**
- Produces: `PromptScenario.SECTION_EXPAND` 常量；`SECTION_EXPAND_TEMPLATES` 列表（key: `section_expand.default`）；settings `MIN_SECTION_WORDS`/`MAX_EXPAND_ROUNDS`/`CONTENT_CONCURRENCY`

- [ ] **Step 1: 在 PromptScenario 加 SECTION_EXPAND 常量**

修改 `backend/apps/generation/constants.py`，在 `CONSISTENCY_REPAIR = "consistency_repair"` 后追加：

```python
    # 字数不足扩写（借鉴 OpenBidKit expandOneSection）
    SECTION_EXPAND = "section_expand"
```

在 `CHOICES` 列表末尾（`(CONSISTENCY_REPAIR, "一致性修复")` 后）追加：

```python
        (SECTION_EXPAND, "字数不足扩写"),
```

- [ ] **Step 2: 在 settings 加扩写配置**

修改 `backend/config/settings/base.py`，在 `CONTENT_MATRIX_SCENARIO_V2` 配置后追加：

```python

# ========== 批量生成并发与扩写配置（P2-2 + P2-3）==========
# 批量生成并发数（参考用，实际由 Celery worker --concurrency 决定）
CONTENT_CONCURRENCY = env.int("CONTENT_CONCURRENCY", default=3)
# 单章最低正文字数，不足时触发扩写
MIN_SECTION_WORDS = env.int("MIN_SECTION_WORDS", default=500)
# 扩写最大轮次，达此轮次仍未达标则停止
MAX_EXPAND_ROUNDS = env.int("MAX_EXPAND_ROUNDS", default=2)
```

- [ ] **Step 3: 创建 section_expand prompt 模板文件**

创建 `backend/apps/generation/management/commands/_section_expand_prompts.py`：

```python
# backend/apps/generation/management/commands/_section_expand_prompts.py
"""字数不足扩写 prompt 模板（借鉴 OpenBidKit buildContentExpansionMessages）。

严格学习 OpenBidKit 的扩写约束：局部 insert/replace 操作，不重写整章。
"""

SECTION_EXPAND_TEMPLATES = [
    {
        "key": "section_expand.default",
        "name": "字数不足扩写模板",
        "scenario": "section_expand",
        "description": "对字数不足的章节做局部 insert/replace 扩写",
        "system_prompt": """你是投标技术方案正文扩写助手。请只针对指定章节进行扩写，避免与其他章节重复。

要求：
1. 只返回 JSON，不要输出解释或 Markdown 代码块。
2. 只返回一次局部扩写操作。
3. operation 只能 insert 或 replace。
4. insert 的 anchor 填插入位置或 end。
5. replace 的 anchor 必须填要替换的原段落关键摘录。
6. content 只写新增/替换片段，不含标题。
7. 禁止图片/Mermaid/代码块。
8. 严禁 Markdown 标题语法（#、## 等）。
9. 扩写优先使用全局事实变量值，不得新增前后不一致的承诺。

返回格式：
{"operation": "", "anchor": "", "content": ""}""",
        "user_prompt": """## 项目概述
{{ project_overview }}

## 完整目录结构
{{ outline_structure }}

## 全局事实变量（必须优先使用，保持前后一致）
{{ selected_facts }}

## 当前章节路径
{{ chapter_path }}

## 当前章节描述
{{ chapter_description }}

## 同级章节（避免重复）
{{ sibling_chapters }}

## 当前正文（字数 {{ current_words }}，目标 {{ target_words }}）
{{ current_content }}

请返回一次局部扩写操作 JSON。""",
        "output_schema": {
            "type": "object",
            "properties": {
                "operation": {"type": "string", "enum": ["insert", "replace"]},
                "anchor": {"type": "string", "description": "insert: end 或段落摘录；replace: 必填要替换的段落摘录"},
                "content": {"type": "string", "description": "新增/替换片段正文，不含标题"},
            },
            "required": ["operation", "anchor", "content"],
        },
        "variable_schema": {
            "type": "object",
            "properties": {
                "project_overview": {"type": "string"},
                "outline_structure": {"type": "string"},
                "selected_facts": {"type": "string"},
                "chapter_path": {"type": "string"},
                "chapter_description": {"type": "string"},
                "sibling_chapters": {"type": "string"},
                "current_content": {"type": "string"},
                "current_words": {"type": "integer"},
                "target_words": {"type": "integer"},
            },
            "required": ["current_content", "current_words", "target_words"],
        },
    },
]
```

- [ ] **Step 4: 在 seed_prompts.py 注册**

修改 `backend/apps/generation/management/commands/seed_prompts.py` 的 `_get_builtin_templates` 方法。在现有 import 块（line 97-102 附近）追加：

```python
        from ._section_expand_prompts import SECTION_EXPAND_TEMPLATES
```

在 return 的拼接链中，于 `+ CONSISTENCY_AUDIT_TEMPLATES` 后追加 `+ SECTION_EXPAND_TEMPLATES`，完整 return 头部应为：

```python
        return (
            GLOBAL_FACT_TEMPLATES
            + OUTLINE_REVIEW_TEMPLATES
            + SECTION_PLAN_TEMPLATES
            + SECTION_CONTENT_ANTIAI_TEMPLATES  # noqa
            + BID_CHECK_TEMPLATES
            + CONSISTENCY_AUDIT_TEMPLATES
            + SECTION_EXPAND_TEMPLATES
            + [
                # ... 现有内置模板 ...
            ]
        )
```

- [ ] **Step 5: 语法检查**

Run: `cd backend && python3 -m py_compile apps/generation/constants.py apps/generation/management/commands/_section_expand_prompts.py apps/generation/management/commands/seed_prompts.py config/settings/base.py`
Expected: 无输出（成功）

- [ ] **Step 6: Commit**

```bash
git add backend/apps/generation/constants.py backend/config/settings/base.py backend/apps/generation/management/commands/_section_expand_prompts.py backend/apps/generation/management/commands/seed_prompts.py
git commit -m "feat(section-expand): 新增 section_expand scenario、prompt 模板与 settings 配置"
```

---

## Task 2: SectionExpandService 容错层（TDD）

**Files:**
- Create: `backend/apps/outline/services/section_expand_service.py`
- Create: `backend/apps/outline/tests/test_section_expand.py`

**Interfaces:**
- Consumes: `AiTaskExecutionService.execute(scenario="section_expand", ...)`、`Section`、`GlobalFactGroup`、`settings.MIN_SECTION_WORDS`/`MAX_EXPAND_ROUNDS`、`SectionGenerationService.resolve_selected_facts`
- Produces: `SectionExpandService.run_expand(outline_id, minimum_words, user, async_task=None) -> dict`、`SectionExpandService.expand_section(section_id, user) -> dict`、`SectionExpandService._apply_patch(content, patch) -> str`

- [ ] **Step 1: 写失败测试 — insert anchor=end 追加**

创建 `backend/apps/outline/tests/test_section_expand.py`：

```python
# backend/apps/outline/tests/test_section_expand.py
"""字数不足扩写测试。"""
from unittest.mock import patch, MagicMock
from django.test import TestCase
from django.contrib.auth import get_user_model

from apps.outline.models import Outline, Section
from apps.outline.services.section_expand_service import SectionExpandService

User = get_user_model()


class SectionExpandTest(TestCase):
    def setUp(self):
        from apps.tender.models import Project, Lot
        self.user, _ = User.objects.get_or_create(username="test_expand_user")
        self.project = Project.objects.create(name="测试项目", created_by=self.user)
        self.lot = Lot.objects.create(project=self.project, name="测试标段", created_by=self.user)
        self.outline = Outline.objects.create(
            project=self.project, lot=self.lot, name="测试大纲", created_by=self.user,
        )

    def _make_leaf_section(self, content="初始正文较短。", word_count=5):
        return Section.objects.create(
            outline=self.outline, title="1.1 测试章节", level=1, sort_order=1,
            content=content, content_word_count=word_count, word_count=word_count,
        )

    def test_apply_patch_insert_anchor_end(self):
        """insert anchor=end 追加到末尾。"""
        svc = SectionExpandService()
        result = svc._apply_patch("段落一。", {"operation": "insert", "anchor": "end", "content": "新增段落。"})
        self.assertEqual(result, "段落一。\n\n新增段落。")

    def test_apply_patch_insert_after_anchor(self):
        """insert 在指定段落后插入。"""
        svc = SectionExpandService()
        result = svc._apply_patch("段落一。\n\n段落二。", {
            "operation": "insert", "anchor": "段落一", "content": "插入段落。",
        })
        self.assertIn("插入段落。", result)
        self.assertLess(result.index("插入段落。"), result.index("段落二。"))

    def test_apply_patch_replace_anchor(self):
        """replace 替换指定段落。"""
        svc = SectionExpandService()
        result = svc._apply_patch("旧段落内容。\n\n保留段落。", {
            "operation": "replace", "anchor": "旧段落内容", "content": "新段落内容。",
        })
        self.assertIn("新段落内容。", result)
        self.assertNotIn("旧段落内容", result)
        self.assertIn("保留段落。", result)
```

- [ ] **Step 2: 运行测试验证失败**

Run: `cd backend && python -m pytest apps/outline/tests/test_section_expand.py::SectionExpandTest::test_apply_patch_insert_anchor_end -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'apps.outline.services.section_expand_service'`

- [ ] **Step 3: 写最小实现 — _apply_patch**

创建 `backend/apps/outline/services/section_expand_service.py`：

```python
# backend/apps/outline/services/section_expand_service.py
"""字数不足扩写服务（借鉴 OpenBidKit expandOneSection + applyContentExpansionPatch）。

批量生成完成后统一检查字数不足的章节，逐章调 section_expand scenario 返回局部 patch，
应用 insert/replace 操作，多轮直到达标或 MAX_EXPAND_ROUNDS。
"""
import logging
from typing import Optional

from django.conf import settings
from django.utils import timezone

from apps.outline.models import Outline, Section, SectionVersion
from apps.outline.constants import SectionVersionSource

logger = logging.getLogger(__name__)


class SectionExpandService:
    """字数不足扩写服务。"""

    def run_expand(
        self,
        outline_id: int,
        minimum_words: int,
        user,
        async_task=None,
    ) -> dict:
        """统计字数不足章节，逐章扩写，多轮直到达标或 MAX_EXPAND_ROUNDS。

        Returns:
            {"total": N, "expanded": M, "skipped": K, "rounds": R, "details": [...]}
        """
        minimum_words = minimum_words or getattr(settings, "MIN_SECTION_WORDS", 500)
        max_rounds = getattr(settings, "MAX_EXPAND_ROUNDS", 2)

        # 收集字数 < minimum_words 的叶子章节
        short_sections = list(
            Section.objects.filter(
                outline_id=outline_id,
                content_word_count__lt=minimum_words,
                content_word_count__gt=0,  # 跳过未生成章节
            ).order_by("sort_order")
        )

        if not short_sections:
            return {"total": 0, "expanded": 0, "skipped": 0, "rounds": 0, "details": []}

        total = len(short_sections)
        expanded = 0
        details = []
        rounds_done = 0

        for round_idx in range(1, max_rounds + 1):
            rounds_done = round_idx
            still_short = []

            for section in short_sections:
                # 达标则跳过
                section.refresh_from_db()
                if section.content_word_count >= minimum_words:
                    continue

                try:
                    result = self.expand_section(section.id, user, minimum_words=minimum_words)
                    if result.get("expanded"):
                        expanded += 1
                        details.append({
                            "section_id": section.id,
                            "before": result["before_words"],
                            "after": result["after_words"],
                            "round": round_idx,
                        })
                    # 扩写后重新检查
                    section.refresh_from_db()
                    if section.content_word_count < minimum_words:
                        still_short.append(section)
                except Exception as e:
                    logger.warning(f"Expand section {section.id} failed (round {round_idx}): {e}")
                    still_short.append(section)

            if not still_short:
                break
            short_sections = still_short

            if async_task:
                async_task.progress = min(90, 10 + round_idx * 30)
                async_task.current_step = f"扩写第 {round_idx}/{max_rounds} 轮"
                async_task.save(update_fields=["progress", "current_step"])

        return {
            "total": total,
            "expanded": expanded,
            "skipped": total - expanded,
            "rounds": rounds_done,
            "details": details,
        }

    def expand_section(self, section_id: int, user, minimum_words: int = None) -> dict:
        """单章扩写：调 AI 返回 patch，应用 insert/replace。

        Returns:
            {"expanded": bool, "before_words": N, "after_words": M, "operation": "..."}
        """
        from apps.generation.services.ai_task_execution_service import AiTaskExecutionService

        minimum_words = minimum_words or getattr(settings, "MIN_SECTION_WORDS", 500)

        section = Section.objects.get(pk=section_id)
        before_words = section.content_word_count or 0

        if before_words >= minimum_words:
            return {"expanded": False, "before_words": before_words, "after_words": before_words, "operation": "skip"}

        # 构建扩写 prompt 变量
        variables = self._build_expand_variables(section, before_words, minimum_words)

        prompt_run = AiTaskExecutionService().execute(
            scenario="section_expand",
            variables=variables,
            created_by=user,
            business_context={"project_id": section.outline.project_id},
        )

        if prompt_run.status != "succeeded":
            logger.warning(f"section_expand failed for section {section_id}: {prompt_run.error_message}")
            return {"expanded": False, "before_words": before_words, "after_words": before_words, "operation": "failed"}

        patch = prompt_run.output_json or {}
        if not patch.get("operation") or not patch.get("content"):
            logger.warning(f"section_expand returned invalid patch for section {section_id}: {patch}")
            return {"expanded": False, "before_words": before_words, "after_words": before_words, "operation": "invalid"}

        new_content = self._apply_patch(section.content or "", patch)
        after_words = self._count_words(new_content)

        # 保存
        section.content = new_content
        section.content_word_count = after_words
        section.word_count = after_words
        section.save(update_fields=["content", "content_word_count", "word_count", "updated_at"])

        # 创建版本
        from django.db.models import Max
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
            word_count=after_words,
            created_by=user,
        )

        return {
            "expanded": True,
            "before_words": before_words,
            "after_words": after_words,
            "operation": patch["operation"],
        }

    def _apply_patch(self, content: str, patch: dict) -> str:
        """应用 insert/replace 局部操作（移植 OpenBidKit applyContentExpansionPatch）。

        - insert anchor=end: 追加到末尾
        - insert anchor=段落摘录: 在该段落后插入
        - replace anchor=段落摘录: 替换该段落
        """
        operation = patch.get("operation")
        anchor = (patch.get("anchor") or "").strip()
        patch_content = (patch.get("content") or "").strip()

        if not patch_content:
            return content

        if operation == "insert":
            if not anchor or anchor.lower() == "end":
                # 追加到末尾
                if not content:
                    return patch_content
                return content.rstrip() + "\n\n" + patch_content
            # 在指定段落后插入
            if anchor in content:
                idx = content.index(anchor) + len(anchor)
                return content[:idx] + "\n\n" + patch_content + content[idx:]
            # anchor 未匹配则追加到末尾
            return content.rstrip() + "\n\n" + patch_content

        if operation == "replace":
            if not anchor:
                # 无 anchor 无法 replace，跳过
                return content
            if anchor in content:
                return content.replace(anchor, patch_content, 1)
            # anchor 未匹配，跳过替换
            logger.warning(f"replace anchor not found in content, skip: {anchor[:50]}")
            return content

        # 未知 operation，跳过
        return content

    def _build_expand_variables(self, section: Section, current_words: int, minimum_words: int) -> dict:
        """构建扩写 prompt 变量。"""
        from apps.outline.services.section_generation_service import SectionGenerationService

        target_words = max(current_words * 2, current_words + 200, minimum_words)

        # 复用编排决策的事实解析
        try:
            selected_facts = SectionGenerationService().resolve_selected_facts(section)
        except Exception:
            selected_facts = ""

        # 章节路径
        path_parts = []
        node = section
        while node:
            path_parts.insert(0, node.title)
            node = node.parent
        chapter_path = " > ".join(path_parts)

        # 同级章节
        siblings_qs = Section.objects.filter(
            outline=section.outline, parent=section.parent, level=section.level
        ).exclude(pk=section.pk).order_by("sort_order")[:5]
        sibling_lines = [f"- {s.title}" for s in siblings_qs]
        sibling_chapters = "\n".join(sibling_lines) if sibling_lines else "无"

        # 项目概述
        project = section.outline.project
        project_overview = f"项目名称：{project.name}\n标段：{section.outline.lot.name if section.outline.lot else ''}"

        # 目录结构（简化）
        outline_structure = self._build_outline_structure(section.outline)

        return {
            "project_overview": project_overview,
            "outline_structure": outline_structure,
            "selected_facts": selected_facts or "无",
            "chapter_path": chapter_path,
            "chapter_description": section.content_matrix.get("write_scope", "") if section.content_matrix else "",
            "sibling_chapters": sibling_chapters,
            "current_content": section.content or "",
            "current_words": current_words,
            "target_words": target_words,
        }

    def _build_outline_structure(self, outline: Outline) -> str:
        """构建简化目录结构文本。"""
        sections = Section.objects.filter(outline=outline).order_by("sort_order")
        lines = []
        for s in sections:
            indent = "  " * (s.level - 1)
            lines.append(f"{indent}- {s.title}")
        return "\n".join(lines)

    def _count_words(self, text: str) -> int:
        """统计字数（中文按字符，英文按单词）。"""
        if not text:
            return 0
        # 简化：去 Markdown 符号后按字符数统计
        import re
        clean = re.sub(r"[#*`\-|>]", "", text)
        clean = re.sub(r"\s+", "", clean)
        return len(clean)
```

- [ ] **Step 4: 运行测试验证通过**

Run: `cd backend && python -m pytest apps/outline/tests/test_section_expand.py::SectionExpandTest::test_apply_patch_insert_anchor_end apps/outline/tests/test_section_expand.py::SectionExpandTest::test_apply_patch_insert_after_anchor apps/outline/tests/test_section_expand.py::SectionExpandTest::test_apply_patch_replace_anchor -v`
Expected: 3 PASSED

- [ ] **Step 5: 写测试 — 扩写多轮直到达标**

在 `backend/apps/outline/tests/test_section_expand.py` 的类里追加：

```python
    def test_expand_multi_round_until_target(self):
        """多轮扩写直到达标。"""
        section = self._make_leaf_section(content="短正文。", word_count=3)
        svc = SectionExpandService()

        # mock expand_section 每轮让字数翻倍
        call_count = {"n": 0}
        original_expand = svc.expand_section

        def mock_expand(section_id, user, minimum_words=500):
            call_count["n"] += 1
            section = Section.objects.get(pk=section_id)
            before = section.content_word_count or 3
            after = before * 4  # 翻倍到 12, 48
            section.content_word_count = after
            section.content = section.content + " 扩写内容。"
            section.save(update_fields=["content", "content_word_count"])
            return {"expanded": True, "before_words": before, "after_words": after, "operation": "insert"}

        with patch.object(svc, "expand_section", side_effect=mock_expand):
            result = svc.run_expand(self.outline.id, minimum_words=10, user=self.user)

        self.assertEqual(result["total"], 1)
        self.assertGreaterEqual(call_count["n"], 1)
        # 最终字数应达标
        section.refresh_from_db()
        self.assertGreaterEqual(section.content_word_count, 10)

    def test_expand_skip_already_long(self):
        """字数足够跳过。"""
        section = self._make_leaf_section(content="这是一段足够长的正文内容用于测试跳过扩写逻辑。", word_count=100)
        svc = SectionExpandService()
        result = svc.run_expand(self.outline.id, minimum_words=50, user=self.user)
        self.assertEqual(result["total"], 0)
        self.assertEqual(result["expanded"], 0)
```

- [ ] **Step 6: 运行全部扩写测试**

Run: `cd backend && python -m pytest apps/outline/tests/test_section_expand.py -v`
Expected: 5 PASSED

- [ ] **Step 7: Commit**

```bash
git add backend/apps/outline/services/section_expand_service.py backend/apps/outline/tests/test_section_expand.py
git commit -m "feat(section-expand): SectionExpandService 容错层（局部 insert/replace + 多轮扩写）"
```

---

## Task 3: 批量生成 group/chord 并发（TDD）

**Files:**
- Modify: `backend/apps/outline/tasks.py`
- Create: `backend/apps/outline/tests/test_batch_concurrency.py`

**Interfaces:**
- Consumes: 现有 `_execute_single_section_generation`、`_finalize_batch_task`、`BatchGenerationTaskItem`、`GenerationTask`
- Produces: `generate_single_section_for_batch(section_id, task_id, user_id)` Celery task、`on_batch_complete(results, task_id)` Celery task（chord 回调）；重构后的 `batch_section_generation_task`

- [ ] **Step 1: 写失败测试 — group 派发所有 pending**

创建 `backend/apps/outline/tests/test_batch_concurrency.py`：

```python
# backend/apps/outline/tests/test_batch_concurrency.py
"""批量生成并发测试。"""
from unittest.mock import patch, MagicMock
from django.test import TestCase
from django.contrib.auth import get_user_model

from apps.outline.models import Outline, Section, GenerationTask, BatchGenerationTaskItem
from apps.outline.constants import GenerationTaskStatus

User = get_user_model()


class BatchConcurrencyTest(TestCase):
    def setUp(self):
        from apps.tender.models import Project, Lot
        self.user, _ = User.objects.get_or_create(username="test_batch_concurrency_user")
        self.project = Project.objects.create(name="测试项目", created_by=self.user)
        self.lot = Lot.objects.create(project=self.project, name="测试标段", created_by=self.user)
        self.outline = Outline.objects.create(
            project=self.project, lot=self.lot, name="测试大纲", created_by=self.user,
        )
        # 造 3 个叶子章节
        self.sections = []
        for i in range(3):
            self.sections.append(Section.objects.create(
                outline=self.outline, title=f"1.{i+1} 章节", level=1, sort_order=i,
            ))

    def _create_batch_task(self):
        task = GenerationTask.objects.create(
            outline=self.outline, task_type="batch_section_generation",
            status=GenerationTaskStatus.RUNNING, created_by=self.user,
            params={"skip_on_failure": True},
        )
        for i, s in enumerate(self.sections):
            BatchGenerationTaskItem.objects.create(
                task=task, section=s, sort_index=i, status="pending",
            )
        return task

    @patch("apps.outline.tasks.generate_single_section_for_batch")
    @patch("apps.outline.tasks.on_batch_complete")
    def test_group_dispatch_all_pending(self, mock_on_complete, mock_single):
        """batch_section_generation_task 应为每个 pending 章节派发 generate_single_section_for_batch。"""
        from apps.outline.tasks import batch_section_generation_task
        task = self._create_batch_task()

        # mock chord 的行为：直接调用回调
        mock_single.s = MagicMock(return_value="sig")
        mock_on_complete.s = MagicMock(return_value="cb")

        with patch("apps.outline.tasks.chord") as mock_chord:
            batch_section_generation_task.apply(args=[task.id]).get()

        # 验证 chord 被调用，且 group 包含 3 个子任务签名
        mock_chord.assert_called_once()
        group_arg = mock_chord.call_args[0][0]
        # group_arg 是 group 对象，检查其内部 task 数量
        # 简化：验证 generate_single_section_for_batch.s 被调用 3 次
        self.assertEqual(mock_single.s.call_count, 3)
```

- [ ] **Step 2: 运行测试验证失败**

Run: `cd backend && python -m pytest apps/outline/tests/test_batch_concurrency.py::BatchConcurrencyTest::test_group_dispatch_all_pending -v`
Expected: FAIL with `AttributeError: module 'apps.outline.tasks' has no attribute 'generate_single_section_for_batch'`

- [ ] **Step 3: 重构 batch_section_generation_task + 新增 generate_single_section_for_batch + on_batch_complete**

修改 `backend/apps/outline/tasks.py`。在文件顶部 import 区追加（line 6 附近，`from celery import shared_task` 改为）：

```python
from celery import shared_task, group, chord
```

将现有 `batch_section_generation_task`（line 481-678）整体替换为：

```python
@shared_task(bind=True)
def batch_section_generation_task(self, task_id: int):
    """批量正文生成任务（group/chord 并发版）。

    流程：
    1. 收集所有 pending 章节 ID
    2. group(generate_single_section_for_batch.s(sid, task_id) for sid in ids) 并发
    3. chord(group)(on_batch_complete.s(task_id)) 全部完成后回调
    """
    from apps.outline.constants import GenerationTaskStatus
    from apps.outline.models import GenerationTask

    try:
        task = GenerationTask.objects.get(pk=task_id)
    except GenerationTask.DoesNotExist:
        logger.error(f"Batch task {task_id} not found")
        return

    # 检查取消请求
    task.refresh_from_db()
    if task.status == GenerationTaskStatus.CANCEL_REQUESTED:
        BatchGenerationTaskItem.objects.filter(
            task=task, status__in=["pending", "running"],
        ).update(status="cancelled")
        task.status = GenerationTaskStatus.CANCELLED
        task.finished_at = timezone.now()
        task.save()
        return

    if task.status != GenerationTaskStatus.RUNNING:
        logger.warning(f"Batch task {task_id} has unexpected status {task.status}")
        return

    # 收集 pending 章节 ID
    pending_items = list(
        BatchGenerationTaskItem.objects.filter(task=task, status="pending").order_by("sort_index")
    )
    if not pending_items:
        _finalize_batch_task(task)
        return

    section_ids = [item.section_id for item in pending_items]
    logger.info(f"Batch task {task_id} dispatching {len(section_ids)} sections via group/chord")

    # group/chord 并发派发
    header = group(
        generate_single_section_for_batch.s(sid, task_id) for sid in section_ids
    )
    callback = on_batch_complete.s(task_id)
    chord(header)(callback)


@shared_task
def generate_single_section_for_batch(section_id: int, task_id: int):
    """单个章节生成（并发子任务）。

    复用 _execute_single_section_generation，更新 BatchGenerationTaskItem 状态。
    单章失败不阻断其他。
    """
    from apps.outline.constants import ContentGenerationStatus, GenerationTaskStatus
    from apps.outline.models import GenerationTask

    task = GenerationTask.objects.get(pk=task_id)
    params = task.params or {}
    skip_on_failure = params.get("skip_on_failure", True)

    try:
        item = BatchGenerationTaskItem.objects.filter(task=task, section_id=section_id).first()
        if not item:
            logger.warning(f"TaskItem not found: task={task_id}, section={section_id}")
            return

        item.status = "running"
        item.started_at = timezone.now()
        item.save(update_fields=["status", "started_at"])

        # 更新任务当前章节
        GenerationTask.objects.filter(pk=task_id).update(
            current_section_id=section_id,
            current_section_title=item.section.title,
        )

        section = Section.objects.get(pk=section_id)
        user = User.objects.get(pk=task.created_by_id)

        # 创建单章生成记录
        async_task = AsyncTask.objects.create(
            task_type="section_generate",
            related_object_type="Section",
            related_object_id=str(section_id),
            input_payload={"section_id": section_id, "batch_task_id": task_id},
            created_by=user,
        )
        record = SectionGenerationRecord.objects.create(
            section=section,
            async_task=async_task,
            input_summary={"batch_task_id": task_id, "sort_index": item.sort_index},
            status=GenerationRecordStatus.PENDING,
            created_by=user,
        )

        gen_result = _execute_single_section_generation(
            section_id=section_id,
            record_id=record.id,
            user_id=user.id,
            user_prompt=section.user_prompt or params.get("user_prompt_default", ""),
        )

        item.refresh_from_db()
        if gen_result.get("success"):
            item.status = "success"
            item.finished_at = timezone.now()
            item.word_count = gen_result.get("word_count", section.content_word_count or 0)
            item.save(update_fields=["status", "finished_at", "word_count"])
            GenerationTask.objects.filter(pk=task_id).update(
                success_count=BatchGenerationTaskItem.objects.filter(task=task, status="success").count(),
            )
        else:
            item.status = "failed"
            item.error_message = gen_result.get("error", "未知错误")[:2000]
            item.finished_at = timezone.now()
            item.save(update_fields=["status", "error_message", "finished_at"])
            GenerationTask.objects.filter(pk=task_id).update(
                failed_count=BatchGenerationTaskItem.objects.filter(task=task, status="failed").count(),
            )

    except Exception as e:
        logger.exception(f"generate_single_section_for_batch failed: section={section_id}")
        BatchGenerationTaskItem.objects.filter(task_id=task_id, section_id=section_id).update(
            status="failed", error_message=str(e)[:2000], finished_at=timezone.now(),
        )
        GenerationTask.objects.filter(pk=task_id).update(
            failed_count=BatchGenerationTaskItem.objects.filter(
                task_id=task_id, status="failed"
            ).count(),
        )


@shared_task
def on_batch_complete(results, task_id: int):
    """chord 回调：全部子任务完成后收尾。

    1. 调 _finalize_batch_task（已含一致性审计触发）
    2. 触发字数不足扩写
    """
    from apps.outline.constants import GenerationTaskStatus
    from apps.outline.services.section_expand_service import SectionExpandService

    try:
        task = GenerationTask.objects.get(pk=task_id)
    except GenerationTask.DoesNotExist:
        logger.error(f"on_batch_complete: task {task_id} not found")
        return

    # 1. 收尾批量任务状态 + 触发一致性审计
    _finalize_batch_task(task)

    # 2. 触发字数不足扩写（仅批量成功/部分成功时）
    task.refresh_from_db()
    if task.status in [GenerationTaskStatus.COMPLETED, GenerationTaskStatus.PARTIAL_SUCCESS]:
        try:
            from django.conf import settings
            minimum_words = getattr(settings, "MIN_SECTION_WORDS", 500)
            expand_async = AsyncTask.objects.create(
                task_type="section_expand",
                status=AsyncTask.STATUS_PENDING,
                related_object_type="Outline",
                related_object_id=str(task.outline_id),
                created_by=task.created_by,
            )
            expand_sections_task.delay(
                task.outline_id, minimum_words, expand_async.id, task.created_by_id,
            )
        except Exception as e:
            logger.warning(f"Failed to trigger section expand for outline {task.outline_id}: {e}")


@shared_task(bind=True)
def expand_sections_task(self, outline_id: int, minimum_words: int, async_task_id: int, user_id: int):
    """字数不足扩写任务。

    多轮扩写字数不足的章节，进度写入 AsyncTask。
    """
    from apps.outline.services.section_expand_service import SectionExpandService

    async_task = AsyncTask.objects.get(pk=async_task_id)
    user = User.objects.get(pk=user_id)

    try:
        async_task.status = AsyncTask.STATUS_RUNNING
        async_task.current_step = "字数不足扩写：启动"
        async_task.progress = 5
        async_task.started_at = timezone.now()
        async_task.save()

        result = SectionExpandService().run_expand(
            outline_id, minimum_words, user, async_task=async_task,
        )

        async_task.status = AsyncTask.STATUS_SUCCESS
        async_task.progress = 100
        async_task.current_step = "字数不足扩写：完成"
        async_task.result_payload = {
            "outline_id": outline_id,
            "total": result["total"],
            "expanded": result["expanded"],
            "skipped": result["skipped"],
            "rounds": result["rounds"],
            "details": result["details"],
        }
        async_task.finished_at = timezone.now()
        async_task.save()
    except Exception as e:
        logger.exception("expand_sections_task failed")
        async_task.status = AsyncTask.STATUS_FAILED
        async_task.error_message = str(e)[:2000]
        async_task.current_step = "失败"
        async_task.finished_at = timezone.now()
        async_task.save()
        raise
```

- [ ] **Step 4: 运行测试验证通过**

Run: `cd backend && python -m pytest apps/outline/tests/test_batch_concurrency.py::BatchConcurrencyTest::test_group_dispatch_all_pending -v`
Expected: PASS

- [ ] **Step 5: 写测试 — 单章失败隔离**

在 `backend/apps/outline/tests/test_batch_concurrency.py` 的类里追加：

```python
    def test_single_section_failure_isolated(self):
        """单章失败不阻断其他，BatchGenerationTaskItem 记 failed。"""
        from apps.outline.tasks import generate_single_section_for_batch
        task = self._create_batch_task()

        # mock _execute_single_section_generation 对第一个章节抛异常
        from apps.outline import tasks as tasks_module
        original = tasks_module._execute_single_section_generation
        call_log = {"n": 0}

        def mock_execute(section_id, record_id, user_id, user_prompt):
            call_log["n"] += 1
            if call_log["n"] == 1:
                raise Exception("模拟失败")
            return {"success": True, "word_count": 100}

        with patch.object(tasks_module, "_execute_single_section_generation", side_effect=mock_execute):
            # 串行调用每个章节（模拟 group 并发后的结果）
            for sid in [self.sections[0].id, self.sections[1].id, self.sections[2].id]:
                generate_single_section_for_batch.apply(args=[sid, task.id]).get()

        task.refresh_from_db()
        failed_count = BatchGenerationTaskItem.objects.filter(task=task, status="failed").count()
        success_count = BatchGenerationTaskItem.objects.filter(task=task, status="success").count()
        self.assertEqual(failed_count, 1)
        self.assertEqual(success_count, 2)

    def test_chord_callback_triggers_expand(self):
        """on_batch_complete 在批量完成后触发 expand_sections_task。"""
        from apps.outline.tasks import on_batch_complete
        task = self._create_batch_task()
        # 模拟所有子任务成功
        BatchGenerationTaskItem.objects.filter(task=task).update(status="success", finished_at=timezone.now())
        task.success_count = 3
        task.save()

        with patch("apps.outline.tasks.expand_sections_task") as mock_expand, \
             patch("apps.outline.tasks._finalize_batch_task") as mock_finalize:
            from apps.outline.constants import GenerationTaskStatus
            mock_finalize.side_effect = lambda t: setattr(t, "status", GenerationTaskStatus.COMPLETED)
            on_batch_complete.apply(args=[[], task.id]).get()

        mock_expand.delay.assert_called_once()
        call_kwargs = mock_expand.delay.call_args
        self.assertEqual(call_kwargs.args[0], self.outline.id)
```

- [ ] **Step 6: 运行全部并发测试**

Run: `cd backend && python -m pytest apps/outline/tests/test_batch_concurrency.py -v`
Expected: 3 PASSED

- [ ] **Step 7: 运行扩写测试确保不回归**

Run: `cd backend && python -m pytest apps/outline/tests/test_section_expand.py apps/outline/tests/test_batch_concurrency.py -v 2>&1 | tail -15`
Expected: 8 PASSED

- [ ] **Step 8: Commit**

```bash
git add backend/apps/outline/tasks.py backend/apps/outline/tests/test_batch_concurrency.py
git commit -m "feat(batch-concurrency): 批量生成改 group/chord 并发 + 字数不足扩写触发"
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

- [ ] **Step 3: seed section_expand prompt**

Run: `docker exec ai-bid-generator-web-1 python manage.py seed_prompts 2>&1 | grep -E "section_expand|初始化"`
Expected: 输出 `创建模板: section_expand.default`、`创建版本: section_expand.default@1.0`、`初始化完成`

- [ ] **Step 4: 运行单元测试**

Run: `docker exec ai-bid-generator-web-1 python -m pytest apps/outline/tests/test_section_expand.py apps/outline/tests/test_batch_concurrency.py -v`
Expected: 8 PASSED

- [ ] **Step 5: 验证现有批量生成流程不回归**

Run:
```bash
TOKEN=$(curl -s -X POST http://localhost/api/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['access'])")
# 查看现有大纲的批量生成任务状态（替换为实际 outline_id）
curl -s -w "\nHTTP %{http_code}\n" "http://localhost/api/outlines/7/generation-tasks/" -H "Authorization: Bearer $TOKEN"
```
Expected: HTTP 200，正常返回任务列表（证明现有流程未受影响）

- [ ] **Step 6: 端到端冒烟 — 触发一次批量生成验证 group/chord**

Run:
```bash
# 触发批量生成（需要真实 outline_id 和 section_ids，根据实际环境调整）
curl -s -w "\nHTTP %{http_code}\n" -X POST "http://localhost/api/outlines/7/generate-batch/" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"section_ids": [], "user_prompt_default": ""}'
# 等待 5 秒后查看任务状态
sleep 5
docker logs --tail 30 ai-bid-generator-worker-1 2>&1 | grep -E "group/chord|dispatching|on_batch_complete|expand"
```
Expected: worker 日志出现 `dispatching N sections via group/chord`，任务最终状态为 COMPLETED 或 PARTIAL_SUCCESS

- [ ] **Step 7: Commit 验证记录**

```bash
git commit --allow-empty -m "chore(batch-concurrency): 端到端验证通过（8测试+API smoke test）"
```
