# 一致性审计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现正文一致性审计 + 修复能力，作为正文生成的质量兜底（借鉴 OpenBidKit contentGenerationTask.cjs 的 auditing 阶段）。

**Architecture:** 独立 Celery 任务（`consistency_audit_task`）在批量生成完成后自动触发，按一级目录分组调 AI 审计正文与全局事实的冲突，冲突写入 `Section.content_generation_meta.consistency_conflicts`。修复走独立任务（批量）或同步调用（单章），均复用 `AiTaskExecutionService` + `PromptTemplate` 体系。

**Tech Stack:** Django + DRF + Celery + PostgreSQL + Vue3 + Element Plus。Prompt 走 Jinja2 入库，AI 调用走 `AiTaskExecutionService.execute(scenario, variables, created_by)`。

## Global Constraints

- 所有 prompt 必须写入 `PromptTemplate`+`PromptVersion`（Jinja2 `{{ var }}` 语法），禁止代码内联 prompt 字符串
- 所有 AI 调用必须走 `AiTaskExecutionService.execute(scenario, variables, created_by, business_context=...)`
- `business_context` 只能传 PromptRun 认可的字段：`{"project_id": outline.project_id}`（参考已修复的 bug：传 outline_id 等会触发 TypeError）
- 异步任务必须建 `AsyncTask` 跟踪 progress/current_step，related_object_type 用 "Outline"
- 审计/修复失败不阻断已生成正文，单点失败跳过记 warning
- Section 的 JSONField 名为 `content_generation_meta`（不是 `generation_meta`）
- 后端测试用 pytest：`cd backend && python -m pytest apps/outline/tests/test_consistency_audit.py -v`
- 前端构建：`cd frontend && npm run build`
- Docker 部署：`docker compose build web worker && docker compose up -d web worker && docker exec ai-bid-generator-web-1 python manage.py migrate && docker compose restart nginx`

---

## File Structure

新建：
- `backend/apps/generation/management/commands/_consistency_audit_prompts.py` — 2 个 prompt 模板定义
- `backend/apps/outline/services/consistency_audit_service.py` — 审计+修复服务
- `backend/apps/outline/tests/test_consistency_audit.py` — 单元测试
- `frontend/src/api/consistencyAudit.ts` — 前端 API
- `frontend/src/views/outline/components/ConsistencyAuditPanel.vue` — 审计抽屉组件

修改：
- `backend/apps/generation/constants.py` — 新增 2 个 PromptScenario
- `backend/apps/generation/management/commands/seed_prompts.py` — 注册新 prompt
- `backend/apps/outline/tasks.py` — 新增 2 个 Celery task + `_finalize_batch_task` 触发
- `backend/apps/outline/views.py` — OutlineViewSet 加 3 个 action + SectionViewSet 加 1 个 action
- `frontend/src/views/outline/OutlineDetailView.vue` — 工具栏按钮 + 抽屉

无新增迁移（复用 `Section.content_generation_meta` JSONField）。

---

## Task 1: Prompt scenario 常量与模板定义

**Files:**
- Modify: `backend/apps/generation/constants.py`
- Create: `backend/apps/generation/management/commands/_consistency_audit_prompts.py`
- Modify: `backend/apps/generation/management/commands/seed_prompts.py`

**Interfaces:**
- Produces: `PromptScenario.CONSISTENCY_AUDIT`、`PromptScenario.CONSISTENCY_REPAIR` 常量；`CONSISTENCY_AUDIT_TEMPLATES` 列表（key: `consistency_audit.default`、`consistency_repair.default`）

- [ ] **Step 1: 在 PromptScenario 加 2 个常量**

修改 `backend/apps/generation/constants.py`，在 `BID_CHECK_FINAL = "bid_check_final"` 后追加：

```python
    # 一致性审计（借鉴 OpenBidKit contentGenerationTask auditing 阶段）
    CONSISTENCY_AUDIT = "consistency_audit"
    CONSISTENCY_REPAIR = "consistency_repair"
```

在 `CHOICES` 列表末尾（`(BID_CHECK_FINAL, "废标检查定稿")` 后）追加：

```python
        (CONSISTENCY_AUDIT, "一致性审计"),
        (CONSISTENCY_REPAIR, "一致性修复"),
```

- [ ] **Step 2: 创建 prompt 模板文件**

创建 `backend/apps/generation/management/commands/_consistency_audit_prompts.py`：

```python
# backend/apps/generation/management/commands/_consistency_audit_prompts.py
"""一致性审计 prompt 模板（借鉴 OpenBidKit buildConsistencyAuditMessages）。

严格学习 OpenBidKit 的审计与修复 prompt 约束。
"""

CONSISTENCY_AUDIT_TEMPLATES = [
    {
        "key": "consistency_audit.default",
        "name": "一致性审计模板",
        "scenario": "consistency_audit",
        "description": "按一级目录分组审计正文与全局事实的冲突",
        "system_prompt": """你是投标技术方案全文一致性审计助手。请审计本组正文是否与给定事实冲突。

要求：
1. 只返回 JSON，不要输出解释、总结或 Markdown 代码块。
2. 只找正文中已经明确写出、且与事实相违背的内容。
3. 正文没有涉及某条事实时，不要报告缺失，不要建议补充。
4. 不报告文风、质量、重复、篇幅、表达优化等问题。
5. section_id 必须来自允许的目录编号清单，禁止编造编号。
6. 只筛选冲突目录编号和冲突证据，不要重写正文。

返回格式：
{
  "conflicts": [
    {
      "section_id": "1.2.3",
      "fact_title": "相关事实变量标题",
      "evidence": "正文中的冲突原文摘录",
      "reason": "为什么与事实冲突",
      "severity": "high"
    }
  ]
}""",
        "user_prompt": """Step04 全局事实变量：
{{ global_facts_text }}

招标文件关键信息（项目信息、甲方信息、交货和服务要求）：
{{ bid_key_info }}

允许返回的目录编号清单：
{{ allowed_section_ids }}

待审计正文分组：
{{ group_content }}""",
        "output_schema": {
            "type": "object",
            "properties": {
                "conflicts": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "section_id": {"type": "string"},
                            "fact_title": {"type": "string"},
                            "evidence": {"type": "string"},
                            "reason": {"type": "string"},
                            "severity": {"type": "string", "enum": ["high", "medium", "low"]},
                        },
                        "required": ["section_id", "fact_title", "evidence", "reason", "severity"],
                    },
                },
            },
            "required": ["conflicts"],
        },
        "variable_schema": {
            "type": "object",
            "properties": {
                "global_facts_text": {"type": "string"},
                "bid_key_info": {"type": "string"},
                "allowed_section_ids": {"type": "string"},
                "group_content": {"type": "string"},
            },
            "required": ["global_facts_text", "allowed_section_ids", "group_content"],
        },
    },
    {
        "key": "consistency_repair.default",
        "name": "一致性修复模板",
        "scenario": "consistency_repair",
        "description": "根据冲突清单用全局事实值纠正章节正文",
        "system_prompt": """你是投标技术方案正文修复助手。请根据冲突清单，用全局事实值纠正指定章节正文。

要求：
1. 只返回 JSON，格式为 {"content": "", "fixed_conflicts": []}，不要输出解释或 Markdown 代码块。
2. 只改与冲突相关的表述，不重写整章。
3. 必须用全局事实值替换冲突内容，使正文与事实一致。
4. 保留原文结构、表格、列表、加粗引导语。
5. 不得新增人员、周期、质保、品牌、型号等编造内容。
6. fixed_conflicts 填本次修复的 conflict fact_title 列表。

返回格式：
{
  "content": "修复后的完整章节正文",
  "fixed_conflicts": ["交货期", "质保期"]
}""",
        "user_prompt": """当前章节正文：
{{ section_content }}

本章节的冲突清单 JSON：
{{ conflicts_json }}

全局事实变量（必须用这些值纠正冲突）：
{{ global_facts_text }}

请返回修复后的章节正文。""",
        "output_schema": {
            "type": "object",
            "properties": {
                "content": {"type": "string"},
                "fixed_conflicts": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["content"],
        },
        "variable_schema": {
            "type": "object",
            "properties": {
                "section_content": {"type": "string"},
                "conflicts_json": {"type": "string"},
                "global_facts_text": {"type": "string"},
            },
            "required": ["section_content", "conflicts_json", "global_facts_text"],
        },
    },
]
```

- [ ] **Step 3: 在 seed_prompts.py 注册**

修改 `backend/apps/generation/management/commands/seed_prompts.py` 的 `_get_builtin_templates` 方法，在现有 import 后加：

```python
        from ._consistency_audit_prompts import CONSISTENCY_AUDIT_TEMPLATES
```

在 return 的拼接链里加 `+ CONSISTENCY_AUDIT_TEMPLATES`，完整 return 应为：

```python
        return (
            GLOBAL_FACT_TEMPLATES
            + OUTLINE_REVIEW_TEMPLATES
            + SECTION_PLAN_TEMPLATES
            + SECTION_CONTENT_ANTIAI_TEMPLATES  # noqa
            + BID_CHECK_TEMPLATES
            + CONSISTENCY_AUDIT_TEMPLATES
            + [
                # ... 现有内置模板 ...
            ]
        )
```

- [ ] **Step 4: 语法检查**

Run: `cd backend && python3 -m py_compile apps/generation/constants.py apps/generation/management/commands/_consistency_audit_prompts.py apps/generation/management/commands/seed_prompts.py`
Expected: 无输出（成功）

- [ ] **Step 5: Commit**

```bash
git add backend/apps/generation/constants.py backend/apps/generation/management/commands/_consistency_audit_prompts.py backend/apps/generation/management/commands/seed_prompts.py
git commit -m "feat(consistency-audit): 新增一致性审计与修复 prompt 模板"
```

---

## Task 2: ConsistencyAuditService 服务层（TDD）

**Files:**
- Create: `backend/apps/outline/services/consistency_audit_service.py`
- Create: `backend/apps/outline/tests/test_consistency_audit.py`

**Interfaces:**
- Consumes: `AiTaskExecutionService.execute(scenario, variables, created_by, business_context)`、`GlobalFactGroup`、`Section`（字段：content/content_generation_meta/level/parent/section_number）
- Produces: `ConsistencyAuditService.run_audit(outline_id, user, async_task=None) -> dict`、`ConsistencyAuditService.repair_section(section_id, user) -> dict`、`ConsistencyAuditService.run_batch_repair(outline_id, user, async_task) -> None`

- [ ] **Step 1: 写失败测试 — 无全局事实变量正常跑完**

创建 `backend/apps/outline/tests/test_consistency_audit.py`：

```python
# backend/apps/outline/tests/test_consistency_audit.py
"""一致性审计服务测试。"""
from unittest.mock import patch, MagicMock
from django.test import TestCase
from django.contrib.auth import get_user_model

from apps.outline.models import Outline, Section
from apps.projects.models import Project, Lot
from apps.outline.services.consistency_audit_service import ConsistencyAuditService

User = get_user_model()


def _make_outline_with_sections():
    """造一个 outline + 1 个一级目录 + 2 个叶子章节。"""
    project = Project.objects.create(name="测试项目")
    lot = Lot.objects.create(project=project, name="测试标段")
    outline = Outline.objects.create(project=project, lot=lot, name="测试大纲", created_by=User.objects.first())
    top = Section.objects.create(outline=outline, parent=None, title="技术方案", level=1, sort_order=0)
    Section.objects.create(outline=outline, parent=top, title="项目实施方案", level=2, sort_order=0, content="本项目工期60天。")
    Section.objects.create(outline=outline, parent=top, title="售后方案", level=2, sort_order=1, content="质保期1年。")
    return outline, top


class ConsistencyAuditServiceTest(TestCase):
    def setUp(self):
        self.user = User.objects.first()

    def test_no_global_facts_runs_clean(self):
        """无全局事实变量时审计正常跑完，不报错。"""
        outline, _ = _make_outline_with_sections()
        with patch("apps.generation.services.ai_task_execution_service.AiTaskExecutionService.execute") as mock_exec:
            mock_exec.return_value = MagicMock(status="succeeded", output_json={"conflicts": []})
            result = ConsistencyAuditService().run_audit(outline.id, self.user)
        self.assertEqual(result["total_groups"], 1)
        self.assertEqual(result["total_conflicts"], 0)
```

- [ ] **Step 2: 运行测试验证失败**

Run: `cd backend && python -m pytest apps/outline/tests/test_consistency_audit.py::ConsistencyAuditServiceTest::test_no_global_facts_runs_clean -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'apps.outline.services.consistency_audit_service'`

- [ ] **Step 3: 写最小实现 — run_audit**

创建 `backend/apps/outline/services/consistency_audit_service.py`：

```python
# backend/apps/outline/services/consistency_audit_service.py
"""一致性审计与修复服务（借鉴 OpenBidKit contentGenerationTask.cjs auditing 阶段）。

按一级目录分组，AI 审计正文与全局事实的冲突，冲突写入 Section.content_generation_meta。
"""

import json
import logging
from django.utils import timezone

from apps.outline.models import GlobalFactGroup, Outline, Section

logger = logging.getLogger(__name__)


class ConsistencyAuditService:
    """一致性审计与修复服务。"""

    def run_audit(self, outline_id: int, user, async_task=None) -> dict:
        """按一级目录分组审计。

        Returns:
            {"total_groups": int, "total_conflicts": int, "by_severity": {high,medium,low}}
        """
        from apps.generation.services.ai_task_execution_service import AiTaskExecutionService

        outline = Outline.objects.get(pk=outline_id)
        ai = AiTaskExecutionService()

        global_facts_text = self._load_global_facts_text(outline)
        bid_key_info = self._load_bid_key_info(outline)

        # 跑前清空旧冲突
        self._clear_old_conflicts(outline)

        groups = self._group_by_top_level(outline)
        total = len(groups)
        all_conflicts = []
        by_severity = {"high": 0, "medium": 0, "low": 0}

        for idx, group in enumerate(groups):
            if async_task:
                async_task.progress = int(10 + 85 * (idx + 1) / total)
                async_task.current_step = f"审计分组 {idx + 1}/{total}"
                async_task.save(update_fields=["progress", "current_step"])

            try:
                run = ai.execute(
                    scenario="consistency_audit",
                    variables={
                        "global_facts_text": global_facts_text,
                        "bid_key_info": bid_key_info,
                        "allowed_section_ids": json.dumps(group["allowed_ids"], ensure_ascii=False),
                        "group_content": group["content"],
                    },
                    created_by=user,
                    business_context={"project_id": outline.project_id} if outline.project_id else {},
                )
                if run.status == "succeeded":
                    conflicts = (run.output_json or {}).get("conflicts", [])
                else:
                    logger.warning(f"审计分组 {idx + 1} 失败：{run.error_message}")
                    conflicts = []
            except Exception as e:
                logger.warning(f"审计分组 {idx + 1} 异常：{e}")
                conflicts = []

            self._write_conflicts_to_sections(group, conflicts)
            all_conflicts.extend(conflicts)
            for c in conflicts:
                sev = c.get("severity", "medium")
                by_severity[sev] = by_severity.get(sev, 0) + 1

        return {
            "total_groups": total,
            "total_conflicts": len(all_conflicts),
            "by_severity": by_severity,
        }

    def repair_section(self, section_id: int, user) -> dict:
        """单章同步修复：读该章 conflicts，调 consistency_repair，覆盖 content。"""
        from apps.generation.services.ai_task_execution_service import AiTaskExecutionService

        section = Section.objects.get(pk=section_id)
        meta = section.content_generation_meta or {}
        conflicts = meta.get("consistency_conflicts", [])
        unresolved = [c for c in conflicts if not c.get("resolved")]
        if not unresolved:
            return {"section_id": section_id, "fixed_count": 0, "message": "无未解决冲突"}

        outline = section.outline
        global_facts_text = self._load_global_facts_text(outline)

        try:
            run = AiTaskExecutionService().execute(
                scenario="consistency_repair",
                variables={
                    "section_content": section.content or "",
                    "conflicts_json": json.dumps(unresolved, ensure_ascii=False),
                    "global_facts_text": global_facts_text,
                },
                created_by=user,
                business_context={"project_id": outline.project_id} if outline.project_id else {},
            )
            if run.status != "succeeded":
                raise Exception(run.error_message or "修复调用失败")
            new_content = (run.output_json or {}).get("content", "")
            if not new_content:
                raise ValueError("修复返回空正文")
            fixed_titles = (run.output_json or {}).get("fixed_conflicts", [])

            section.content = new_content
            for c in conflicts:
                if c.get("fact_title") in fixed_titles or c in unresolved:
                    c["resolved"] = True
            section.content_generation_meta = meta
            section.save(update_fields=["content", "content_generation_meta", "updated_at"])
            return {"section_id": section_id, "fixed_count": len(fixed_titles), "new_content": new_content}
        except Exception as e:
            logger.warning(f"章节 {section_id} 修复失败：{e}")
            raise

    def run_batch_repair(self, outline_id: int, user, async_task=None) -> None:
        """批量异步修复：遍历所有有未解决冲突的章节。"""
        outline = Outline.objects.get(pk=outline_id)
        sections = list(
            Section.objects.filter(outline=outline).exclude(content="").iterator()
        )
        to_repair = [
            s for s in sections
            if any(not c.get("resolved") for c in (s.content_generation_meta or {}).get("consistency_conflicts", []))
        ]
        total = len(to_repair)
        fixed = 0
        for idx, section in enumerate(to_repair):
            if async_task:
                async_task.progress = int(10 + 85 * (idx + 1) / total) if total else 100
                async_task.current_step = f"修复章节 {idx + 1}/{total}"
                async_task.save(update_fields=["progress", "current_step"])
            try:
                self.repair_section(section.id, user)
                fixed += 1
            except Exception as e:
                logger.warning(f"章节 {section.id} 批量修复失败：{e}")
        if async_task:
            async_task.result_payload = {"outline_id": outline_id, "total": total, "fixed": fixed}

    # ------------------------------------------------------------------
    # 辅助
    # ------------------------------------------------------------------

    def _load_global_facts_text(self, outline) -> str:
        facts = GlobalFactGroup.objects.filter(outline=outline).order_by("sort_order", "id")
        if not facts:
            return ""
        lines = [f"【{f.title}】\n{f.content}" for f in facts]
        return "\n\n".join(lines)

    def _load_bid_key_info(self, outline) -> str:
        parts = [f"项目名称：{outline.project.name}"]
        tf = getattr(outline, "source_tender_file", None)
        if tf:
            parts.append(f"招标文件：{tf.original_name}")
        return "\n".join(parts)

    def _group_by_top_level(self, outline) -> list[dict]:
        """按一级目录分组叶子章节。"""
        top_sections = Section.objects.filter(
            outline=outline, parent=None, level=1,
        ).order_by("sort_order", "id")
        groups = []
        for top in top_sections:
            leaves = self._collect_leaves(top)
            if not leaves:
                continue
            allowed_ids = [s.section_number for s in leaves if s.section_number]
            content_parts = [
                f"<section id=\"{s.section_number or s.id}\" title=\"{s.title}\">\n{s.content or ''}\n</section>"
                for s in leaves
            ]
            groups.append({
                "top_id": top.id,
                "top_title": top.title,
                "leaves": leaves,
                "allowed_ids": allowed_ids,
                "content": "\n\n".join(content_parts),
            })
        return groups

    def _collect_leaves(self, section) -> list:
        """递归收集叶子章节（无 children）。"""
        children = list(Section.objects.filter(parent=section).order_by("sort_order", "id"))
        if not children:
            return [section] if section.content else []
        result = []
        for c in children:
            result.extend(self._collect_leaves(c))
        return result

    def _clear_old_conflicts(self, outline):
        """跑前清空旧冲突，避免累积。"""
        sections = Section.objects.filter(outline=outline)
        for s in sections:
            meta = s.content_generation_meta or {}
            if "consistency_conflicts" in meta:
                meta.pop("consistency_conflicts", None)
                s.content_generation_meta = meta
                s.save(update_fields=["content_generation_meta"])

    def _write_conflicts_to_sections(self, group: dict, conflicts: list[dict]):
        """把冲突按 section_id 分发到对应 Section。"""
        if not conflicts:
            return
        leaves_by_number = {s.section_number: s for s in group["leaves"] if s.section_number}
        leaves_by_id = {str(s.id): s for s in group["leaves"]}
        now = timezone.now().isoformat()

        by_section = {}
        for c in conflicts:
            sid = c.get("section_id", "")
            section = leaves_by_number.get(sid) or leaves_by_id.get(sid)
            if not section:
                continue
            by_section.setdefault(section.id, []).append({
                "fact_title": c.get("fact_title", ""),
                "evidence": c.get("evidence", ""),
                "reason": c.get("reason", ""),
                "severity": c.get("severity", "medium"),
                "audited_at": now,
                "resolved": False,
            })

        for section_id, section_conflicts in by_section.items():
            section = Section.objects.get(pk=section_id)
            meta = section.content_generation_meta or {}
            meta["consistency_conflicts"] = section_conflicts
            section.content_generation_meta = meta
            section.save(update_fields=["content_generation_meta"])
```

- [ ] **Step 4: 运行测试验证通过**

Run: `cd backend && python -m pytest apps/outline/tests/test_consistency_audit.py::ConsistencyAuditServiceTest::test_no_global_facts_runs_clean -v`
Expected: PASS

- [ ] **Step 5: 写测试 — 冲突写入 content_generation_meta**

在 test_consistency_audit.py 的类里加：

```python
    def test_conflict_written_to_section_meta(self):
        """冲突写入 Section.content_generation_meta.consistency_conflicts。"""
        outline, _ = _make_outline_with_sections()
        with patch("apps.generation.services.ai_task_execution_service.AiTaskExecutionService.execute") as mock_exec:
            mock_exec.return_value = MagicMock(
                status="succeeded",
                output_json={"conflicts": [{
                    "section_id": "1.1",
                    "fact_title": "交货期",
                    "evidence": "工期60天",
                    "reason": "与事实90天矛盾",
                    "severity": "high",
                }]},
            )
            ConsistencyAuditService().run_audit(outline.id, self.user)
        leaves = list(Section.objects.filter(outline=outline, level=2))
        leaf = next(s for s in leaves if s.title == "项目实施方案")
        conflicts = (leaf.content_generation_meta or {}).get("consistency_conflicts", [])
        self.assertEqual(len(conflicts), 1)
        self.assertEqual(conflicts[0]["fact_title"], "交货期")
        self.assertFalse(conflicts[0]["resolved"])
```

- [ ] **Step 6: 运行测试**

Run: `cd backend && python -m pytest apps/outline/tests/test_consistency_audit.py::ConsistencyAuditServiceTest::test_conflict_written_to_section_meta -v`
Expected: PASS

- [ ] **Step 7: 写测试 — 重审清空旧冲突**

```python
    def test_reaudit_clears_old_conflicts(self):
        """重审前清空旧冲突，避免累积。"""
        outline, _ = _make_outline_with_sections()
        leaf = Section.objects.filter(outline=outline, title="项目实施方案").first()
        meta = leaf.content_generation_meta or {}
        meta["consistency_conflicts"] = [{"fact_title": "旧冲突", "resolved": False}]
        leaf.content_generation_meta = meta
        leaf.save()

        with patch("apps.generation.services.ai_task_execution_service.AiTaskExecutionService.execute") as mock_exec:
            mock_exec.return_value = MagicMock(status="succeeded", output_json={"conflicts": []})
            ConsistencyAuditService().run_audit(outline.id, self.user)

        leaf.refresh_from_db()
        conflicts = (leaf.content_generation_meta or {}).get("consistency_conflicts", [])
        self.assertEqual(conflicts, [])
```

- [ ] **Step 8: 运行测试**

Run: `cd backend && python -m pytest apps/outline/tests/test_consistency_audit.py::ConsistencyAuditServiceTest::test_reaudit_clears_old_conflicts -v`
Expected: PASS

- [ ] **Step 9: 写测试 — 单章修复覆盖正文**

```python
    def test_repair_section_overwrites_content(self):
        """单章修复覆盖正文，冲突标记 resolved。"""
        outline, _ = _make_outline_with_sections()
        leaf = Section.objects.filter(outline=outline, title="项目实施方案").first()
        meta = leaf.content_generation_meta or {}
        meta["consistency_conflicts"] = [{
            "fact_title": "交货期", "evidence": "工期60天",
            "reason": "矛盾", "severity": "high", "resolved": False,
        }]
        leaf.content_generation_meta = meta
        leaf.save()

        with patch("apps.generation.services.ai_task_execution_service.AiTaskExecutionService.execute") as mock_exec:
            mock_exec.return_value = MagicMock(
                status="succeeded",
                output_json={"content": "修复后工期90天。", "fixed_conflicts": ["交货期"]},
            )
            result = ConsistencyAuditService().repair_section(leaf.id, self.user)

        leaf.refresh_from_db()
        self.assertIn("90天", leaf.content)
        conflicts = (leaf.content_generation_meta or {}).get("consistency_conflicts", [])
        self.assertTrue(conflicts[0]["resolved"])
```

- [ ] **Step 10: 运行测试**

Run: `cd backend && python -m pytest apps/outline/tests/test_consistency_audit.py::ConsistencyAuditServiceTest::test_repair_section_overwrites_content -v`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add backend/apps/outline/services/consistency_audit_service.py backend/apps/outline/tests/test_consistency_audit.py
git commit -m "feat(consistency-audit): ConsistencyAuditService 服务层 + 测试"
```

---

## Task 3: Celery 任务 + 批量生成触发

**Files:**
- Modify: `backend/apps/outline/tasks.py`

**Interfaces:**
- Consumes: `ConsistencyAuditService.run_audit`、`ConsistencyAuditService.run_batch_repair`、`AsyncTask`
- Produces: `consistency_audit_task(outline_id, async_task_id, user_id)`、`consistency_repair_task(outline_id, async_task_id, user_id)`

- [ ] **Step 1: 在 tasks.py 新增 2 个 Celery task**

在 `backend/apps/outline/tasks.py` 的 `refine_outline_task` 函数之后（`generate_section_task` 之前）插入：

```python
@shared_task(bind=True)
def consistency_audit_task(self, outline_id: int, async_task_id: int, user_id: int):
    """一致性审计任务（借鉴 OpenBidKit auditing 阶段）。

    按一级目录分组调 AI 审计正文与事实冲突，进度写入 AsyncTask。
    """
    from apps.outline.services.consistency_audit_service import ConsistencyAuditService

    async_task = AsyncTask.objects.get(pk=async_task_id)
    user = User.objects.get(pk=user_id)

    try:
        async_task.status = AsyncTask.STATUS_RUNNING
        async_task.current_step = "一致性审计：启动"
        async_task.progress = 5
        async_task.started_at = timezone.now()
        async_task.save()

        result = ConsistencyAuditService().run_audit(
            outline_id, user, async_task=async_task,
        )

        async_task.status = AsyncTask.STATUS_SUCCESS
        async_task.progress = 100
        async_task.current_step = "一致性审计：完成"
        async_task.result_payload = {
            "outline_id": outline_id,
            "total_groups": result["total_groups"],
            "total_conflicts": result["total_conflicts"],
            "by_severity": result["by_severity"],
        }
        async_task.finished_at = timezone.now()
        async_task.save()
    except Exception as e:
        logger.exception("consistency_audit failed")
        async_task.status = AsyncTask.STATUS_FAILED
        async_task.error_message = str(e)[:2000]
        async_task.current_step = "失败"
        async_task.finished_at = timezone.now()
        async_task.save()
        raise


@shared_task(bind=True)
def consistency_repair_task(self, outline_id: int, async_task_id: int, user_id: int):
    """一致性批量修复任务：遍历有未解决冲突的章节逐个修复。"""
    from apps.outline.services.consistency_audit_service import ConsistencyAuditService

    async_task = AsyncTask.objects.get(pk=async_task_id)
    user = User.objects.get(pk=user_id)

    try:
        async_task.status = AsyncTask.STATUS_RUNNING
        async_task.current_step = "一致性修复：启动"
        async_task.progress = 5
        async_task.started_at = timezone.now()
        async_task.save()

        ConsistencyAuditService().run_batch_repair(
            outline_id, user, async_task=async_task,
        )

        async_task.status = AsyncTask.STATUS_SUCCESS
        async_task.progress = 100
        async_task.current_step = "一致性修复：完成"
        async_task.finished_at = timezone.now()
        async_task.save()
    except Exception as e:
        logger.exception("consistency_repair failed")
        async_task.status = AsyncTask.STATUS_FAILED
        async_task.error_message = str(e)[:2000]
        async_task.current_step = "失败"
        async_task.finished_at = timezone.now()
        async_task.save()
        raise
```

- [ ] **Step 2: 在 _finalize_batch_task 末尾触发审计**

修改 `_finalize_batch_task`，在 `task.save()` 之后（函数末尾，return 前）追加：

```python
    # 批量生成完成后自动触发一致性审计（独立任务，失败不影响批量任务状态）
    try:
        from apps.outline.tasks import consistency_audit_task
        audit_task = AsyncTask.objects.create(
            task_type="consistency_audit",
            status=AsyncTask.STATUS_PENDING,
            related_object_type="Outline",
            related_object_id=str(task.outline_id),
            created_by=task.created_by,
        )
        consistency_audit_task.delay(task.outline_id, audit_task.id, task.created_by_id)
    except Exception as e:
        logger.warning(f"Failed to trigger consistency audit for outline {task.outline_id}: {e}")
```

注意：放在 `if task.status in [PAUSE_REQUESTED, ...]: return` 判断之后，确保只有正常完成（非暂停/取消）才触发。

- [ ] **Step 3: 语法检查**

Run: `cd backend && python3 -m py_compile apps/outline/tasks.py`
Expected: 无输出

- [ ] **Step 4: Commit**

```bash
git add backend/apps/outline/tasks.py
git commit -m "feat(consistency-audit): Celery 任务 + 批量生成后自动触发"
```

---

## Task 4: API endpoint

**Files:**
- Modify: `backend/apps/outline/views.py`

**Interfaces:**
- Consumes: `ConsistencyAuditService.run_audit`、`repair_section`、`run_batch_repair`、`consistency_audit_task`、`consistency_repair_task`、`AsyncTask`
- Produces: 4 个 REST endpoint

- [ ] **Step 1: 在 OutlineViewSet 加 3 个 action**

在 `backend/apps/outline/views.py` 的 `OutlineViewSet` 类里，`review_apply` action 之后追加：

```python
    # ==================================================================
    # 一致性审计（借鉴 OpenBidKit auditing 阶段）
    # ==================================================================

    @action(detail=True, methods=["post"], url_path="consistency-audit")
    def consistency_audit(self, request, pk=None):
        """触发一致性审计（异步，返回 task_id）。"""
        from apps.outline.tasks import consistency_audit_task

        outline = self.get_object()
        async_task = AsyncTask.objects.create(
            task_type="consistency_audit",
            status=AsyncTask.STATUS_PENDING,
            related_object_type="Outline",
            related_object_id=str(outline.id),
            created_by=request.user,
        )
        consistency_audit_task.delay(outline.id, async_task.id, request.user.id)
        return Response(
            {
                "task_id": async_task.id,
                "status": async_task.status,
                "message": "一致性审计任务已提交",
            },
            status=status.HTTP_202_ACCEPTED,
        )

    @action(detail=True, methods=["get"], url_path="consistency-audit/result")
    def consistency_audit_result(self, request, pk=None):
        """查询审计结果（冲突清单 + 统计）。"""
        outline = self.get_object()
        sections = Section.objects.filter(outline=outline, content_generation_meta__has_key="consistency_conflicts")
        conflicts_by_section = []
        total = 0
        by_severity = {"high": 0, "medium": 0, "low": 0}
        for s in sections:
            conflicts = (s.content_generation_meta or {}).get("consistency_conflicts", [])
            if not conflicts:
                continue
            conflicts_by_section.append({
                "section_id": s.id,
                "section_title": s.title,
                "section_number": s.section_number,
                "conflicts": conflicts,
                "conflict_count": len(conflicts),
            })
            total += len(conflicts)
            for c in conflicts:
                if not c.get("resolved"):
                    by_severity[c.get("severity", "medium")] = by_severity.get(c.get("severity", "medium"), 0) + 1

        # 查询进行中的审计任务
        running = AsyncTask.objects.filter(
            task_type="consistency_audit",
            related_object_type="Outline",
            related_object_id=str(outline.id),
            status__in=[AsyncTask.STATUS_PENDING, AsyncTask.STATUS_RUNNING],
        ).order_by("-created_at").first()

        return Response({
            "task_status": running.status if running else "idle",
            "task_id": running.id if running else None,
            "progress": running.progress if running else 0,
            "total_conflicts": total,
            "by_severity": by_severity,
            "conflicts": conflicts_by_section,
        })

    @action(detail=True, methods=["post"], url_path="consistency-repair")
    def consistency_repair(self, request, pk=None):
        """批量修复（异步，返回 task_id）。"""
        from apps.outline.tasks import consistency_repair_task

        outline = self.get_object()
        async_task = AsyncTask.objects.create(
            task_type="consistency_repair",
            status=AsyncTask.STATUS_PENDING,
            related_object_type="Outline",
            related_object_id=str(outline.id),
            created_by=request.user,
        )
        consistency_repair_task.delay(outline.id, async_task.id, request.user.id)
        return Response(
            {
                "task_id": async_task.id,
                "status": async_task.status,
                "message": "一致性批量修复任务已提交",
            },
            status=status.HTTP_202_ACCEPTED,
        )
```

- [ ] **Step 2: 在 SectionViewSet 加单章修复 action**

在 `backend/apps/outline/views.py` 的 `SectionViewSet` 类里，`get_plan` action 之后追加：

```python
    @action(detail=True, methods=["post"], url_path="consistency-repair")
    def consistency_repair(self, request, pk=None):
        """单章同步修复：读该章 conflicts，调 AI 用全局事实纠正正文。"""
        from apps.outline.services.consistency_audit_service import ConsistencyAuditService

        section = self.get_object()
        try:
            result = ConsistencyAuditService().repair_section(section.id, request.user)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(result)
```

- [ ] **Step 3: 语法检查**

Run: `cd backend && python3 -m py_compile apps/outline/views.py`
Expected: 无输出

- [ ] **Step 4: Commit**

```bash
git add backend/apps/outline/views.py
git commit -m "feat(consistency-audit): API endpoint（审计/结果/批量修复/单章修复）"
```

---

## Task 5: 前端 API 与审计抽屉组件

**Files:**
- Create: `frontend/src/api/consistencyAudit.ts`
- Create: `frontend/src/views/outline/components/ConsistencyAuditPanel.vue`
- Modify: `frontend/src/views/outline/OutlineDetailView.vue`

**Interfaces:**
- Consumes: 4 个 REST endpoint
- Produces: `ConsistencyAuditPanel.vue` 组件（props: outlineId；emit: 无），OutlineDetailView 工具栏按钮 + 抽屉

- [ ] **Step 1: 创建前端 API**

创建 `frontend/src/api/consistencyAudit.ts`：

```typescript
// frontend/src/api/consistencyAudit.ts
// 一致性审计 API（借鉴 OpenBidKit auditing 阶段）

import { http } from './http'
import type { AsyncTask } from './task'

export interface ConsistencyConflict {
  fact_title: string
  evidence: string
  reason: string
  severity: 'high' | 'medium' | 'low'
  resolved: boolean
  audited_at?: string
}

export interface SectionConflicts {
  section_id: number
  section_title: string
  section_number: string
  conflicts: ConsistencyConflict[]
  conflict_count: number
}

export interface ConsistencyAuditResult {
  task_status: string
  task_id: number | null
  progress: number
  total_conflicts: number
  by_severity: { high: number; medium: number; low: number }
  conflicts: SectionConflicts[]
}

export interface TaskSubmitResponse {
  task_id: number
  status: string
  message: string
}

export interface RepairSectionResponse {
  section_id: number
  fixed_count: number
  new_content?: string
  message?: string
}

export function startConsistencyAudit(outlineId: number) {
  return http.post<TaskSubmitResponse>(`/api/outlines/${outlineId}/consistency-audit/`)
}

export function getConsistencyAuditResult(outlineId: number) {
  return http.get<ConsistencyAuditResult>(`/api/outlines/${outlineId}/consistency-audit/result/`)
}

export function startConsistencyRepair(outlineId: number) {
  return http.post<TaskSubmitResponse>(`/api/outlines/${outlineId}/consistency-repair/`)
}

export function repairSectionConsistency(sectionId: number) {
  return http.post<RepairSectionResponse>(`/api/sections/${sectionId}/consistency-repair/`)
}

export function getAsyncTask(taskId: number) {
  return http.get<AsyncTask>(`/api/tasks/${taskId}`)
}
```

- [ ] **Step 2: 创建审计抽屉组件**

创建 `frontend/src/views/outline/components/ConsistencyAuditPanel.vue`：

```vue
<!-- frontend/src/views/outline/components/ConsistencyAuditPanel.vue -->
<!-- 一致性审计抽屉（借鉴 OpenBidKit auditing 阶段） -->
<template>
  <div class="audit-panel">
    <!-- 顶部操作 -->
    <div class="panel-header">
      <div class="header-info">
        <span class="title">一致性审计</span>
        <el-tag v-if="taskStatus" size="small" :type="statusTagType">{{ taskStatusLabel }}</el-tag>
      </div>
      <el-button type="primary" :loading="auditing" @click="handleAudit">
        {{ result && result.total_conflicts >= 0 ? '重新审计' : '开始审计' }}
      </el-button>
    </div>

    <!-- 进度 -->
    <el-alert
      v-if="auditing || errorMsg"
      :title="errorMsg || `正在审计：${currentStep}（${progress}%）`"
      :type="errorMsg ? 'error' : 'info'"
      :closable="false"
      show-icon
      class="progress-alert"
    >
      <el-progress v-if="!errorMsg" :percentage="progress" :stroke-width="6" :show-text="false" />
    </el-alert>

    <!-- 摘要 -->
    <div v-if="result && !auditing" class="summary-cards">
      <el-card shadow="never" class="summary-card high">
        <div class="count">{{ result.by_severity.high }}</div>
        <div class="label">高风险冲突</div>
      </el-card>
      <el-card shadow="never" class="summary-card medium">
        <div class="count">{{ result.by_severity.medium }}</div>
        <div class="label">中风险冲突</div>
      </el-card>
      <el-card shadow="never" class="summary-card low">
        <div class="count">{{ result.by_severity.low }}</div>
        <div class="label">低风险冲突</div>
      </el-card>
    </div>

    <!-- 批量修复按钮 -->
    <div v-if="result && result.total_conflicts > 0 && !auditing" class="batch-repair-bar">
      <el-button type="warning" :loading="repairing" @click="handleBatchRepair">
        批量修复全部（{{ result.total_conflicts }} 处冲突）
      </el-button>
    </div>

    <!-- 冲突列表 -->
    <div v-loading="loading" class="conflicts-list">
      <el-empty v-if="!loading && (!result || result.conflicts.length === 0) && !auditing" description="暂无冲突，请先审计" />

      <el-card
        v-for="section in result?.conflicts || []"
        :key="section.section_id"
        shadow="never"
        class="section-card"
      >
        <template #header>
          <div class="section-header">
            <span class="section-title">{{ section.section_number }} {{ section.section_title }}</span>
            <el-tag size="small" type="danger">{{ section.conflict_count }} 处冲突</el-tag>
          </div>
        </template>

        <div
          v-for="(conflict, idx) in section.conflicts"
          :key="idx"
          :class="['conflict-item', `sev-${conflict.severity}`, { resolved: conflict.resolved }]"
        >
          <div class="conflict-header">
            <el-tag :type="severityTagType(conflict.severity)" size="small">
              {{ severityLabel(conflict.severity) }}
            </el-tag>
            <span class="fact-title">{{ conflict.fact_title }}</span>
            <el-tag v-if="conflict.resolved" size="small" type="success">已修复</el-tag>
          </div>
          <div class="conflict-detail">
            <div><b>正文证据：</b>{{ conflict.evidence }}</div>
            <div><b>冲突原因：</b>{{ conflict.reason }}</div>
          </div>
          <div class="conflict-action" v-if="!conflict.resolved">
            <el-button
              size="small"
              type="primary"
              :loading="repairingSectionId === section.section_id"
              @click="handleRepairSection(section.section_id)"
            >
              按事实修复本章
            </el-button>
          </div>
        </div>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import {
  startConsistencyAudit,
  getConsistencyAuditResult,
  startConsistencyRepair,
  repairSectionConsistency,
  getAsyncTask,
  type ConsistencyAuditResult,
} from '@/api/consistencyAudit'

const props = defineProps<{ outlineId: number }>()

const loading = ref(false)
const auditing = ref(false)
const repairing = ref(false)
const repairingSectionId = ref<number | null>(null)
const errorMsg = ref('')
const currentStep = ref('')
const progress = ref(0)
const result = ref<ConsistencyAuditResult | null>(null)
const auditTaskId = ref<number | null>(null)
let pollTimer: ReturnType<typeof setTimeout> | null = null

const taskStatus = computed(() => result.value?.task_status || '')
const taskStatusLabel = computed(() => {
  const map: Record<string, string> = {
    pending: '等待中', running: '审计中', success: '已完成', failed: '失败', idle: '空闲',
  }
  return map[taskStatus.value] || taskStatus.value
})
const statusTagType = computed(() => {
  if (taskStatus.value === 'running') return 'primary'
  if (taskStatus.value === 'failed') return 'danger'
  if (taskStatus.value === 'success') return 'success'
  return 'info'
})

async function loadResult() {
  loading.value = true
  try {
    const res = await getConsistencyAuditResult(props.outlineId)
    result.value = res.data
    if (res.data.task_status === 'running' || res.data.task_status === 'pending') {
      auditTaskId.value = res.data.task_id
      auditing.value = true
      pollTask(res.data.task_id)
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '加载审计结果失败')
  } finally {
    loading.value = false
  }
}

async function handleAudit() {
  auditing.value = true
  errorMsg.value = ''
  progress.value = 0
  currentStep.value = '提交中'
  try {
    const res = await startConsistencyAudit(props.outlineId)
    auditTaskId.value = res.data.task_id
    pollTask(res.data.task_id)
  } catch (e: any) {
    auditing.value = false
    errorMsg.value = e?.message || '提交审计失败'
  }
}

function pollTask(taskId: number) {
  const poll = async () => {
    try {
      const res = await getAsyncTask(taskId)
      const t = res.data
      progress.value = t.progress
      currentStep.value = t.current_step
      if (t.status === 'success') {
        auditing.value = false
        repairing.value = false
        ElMessage.success('任务完成')
        await loadResult()
        return
      }
      if (t.status === 'failed') {
        auditing.value = false
        repairing.value = false
        errorMsg.value = t.error_message || '任务失败'
        return
      }
      pollTimer = setTimeout(poll, 2000)
    } catch (e: any) {
      auditing.value = false
      errorMsg.value = e?.message || '查询任务状态失败'
    }
  }
  poll()
}

async function handleBatchRepair() {
  repairing.value = true
  errorMsg.value = ''
  progress.value = 0
  currentStep.value = '提交中'
  try {
    const res = await startConsistencyRepair(props.outlineId)
    pollTask(res.data.task_id)
  } catch (e: any) {
    repairing.value = false
    errorMsg.value = e?.message || '提交批量修复失败'
  }
}

async function handleRepairSection(sectionId: number) {
  repairingSectionId.value = sectionId
  try {
    await repairSectionConsistency(sectionId)
    ElMessage.success('章节已修复')
    await loadResult()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '修复失败')
  } finally {
    repairingSectionId.value = null
  }
}

function severityLabel(sev: string): string {
  return { high: '高', medium: '中', low: '低' }[sev] || sev
}
function severityTagType(sev: string): 'danger' | 'warning' | 'info' {
  return { high: 'danger', medium: 'warning', low: 'info' }[sev] as any || 'info'
}

onMounted(loadResult)
onUnmounted(() => { if (pollTimer) clearTimeout(pollTimer) })
</script>

<style scoped>
.audit-panel { padding: 12px 0; }
.panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.header-info { display: flex; align-items: center; gap: 8px; }
.header-info .title { font-weight: 600; font-size: 15px; }
.progress-alert { margin-bottom: 12px; }
.summary-cards { display: flex; gap: 12px; margin-bottom: 12px; }
.summary-card { flex: 1; text-align: center; }
.summary-card .count { font-size: 28px; font-weight: 700; }
.summary-card .label { color: var(--el-text-color-secondary); font-size: 13px; }
.summary-card.high .count { color: var(--el-color-danger); }
.summary-card.medium .count { color: var(--el-color-warning); }
.summary-card.low .count { color: var(--el-color-info); }
.batch-repair-bar { margin-bottom: 12px; }
.conflicts-list { display: flex; flex-direction: column; gap: 8px; }
.section-card { border-left: 3px solid var(--el-color-danger); }
.section-header { display: flex; justify-content: space-between; align-items: center; }
.section-title { font-weight: 600; }
.conflict-item { padding: 10px; border: 1px solid var(--el-border-color-lighter); border-radius: 6px; margin-bottom: 8px; }
.conflict-item.sev-high { background: var(--el-color-danger-light-9); }
.conflict-item.sev-medium { background: var(--el-color-warning-light-9); }
.conflict-item.sev-low { background: var(--el-color-info-light-9); }
.conflict-item.resolved { opacity: 0.6; }
.conflict-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.fact-title { font-weight: 600; }
.conflict-detail { font-size: 13px; color: var(--el-text-color-regular); line-height: 1.6; }
.conflict-detail div { margin-bottom: 4px; }
.conflict-action { margin-top: 8px; }
</style>
```

- [ ] **Step 3: 在 OutlineDetailView 工具栏加按钮 + 抽屉**

修改 `frontend/src/views/outline/OutlineDetailView.vue`：

在废标检查按钮所在分组后追加"一致性审计"按钮：

```html
          <el-button
            size="default"
            @click="consistencyAuditVisible = true"
            class="action-btn audit-btn"
          >
            <el-icon><Warning /></el-icon>
            一致性审计
          </el-button>
```

在 `<!-- 废标检查抽屉 -->` 之后追加：

```html
    <!-- 一致性审计抽屉 -->
    <el-drawer
      v-model="consistencyAuditVisible"
      title="一致性审计"
      direction="rtl"
      size="640px"
    >
      <ConsistencyAuditPanel :outline-id="outlineId" />
    </el-drawer>
```

在 script import 区加：

```typescript
import { Warning } from '@element-plus/icons-vue'
import ConsistencyAuditPanel from './components/ConsistencyAuditPanel.vue'
```

在 `bidCheckVisible` ref 附近加：

```typescript
const consistencyAuditVisible = ref(false)
```

- [ ] **Step 4: 前端构建验证**

Run: `cd frontend && npm run build`
Expected: `✓ built` 无 TS 错误

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/consistencyAudit.ts frontend/src/views/outline/components/ConsistencyAuditPanel.vue frontend/src/views/outline/OutlineDetailView.vue
git commit -m "feat(consistency-audit): 前端 API + 审计抽屉组件"
```

---

## Task 6: 部署与端到端验证

**Files:** 无（部署 + 验证）

- [ ] **Step 1: 重建镜像**

Run: `docker compose build web worker`
Expected: 两个镜像构建成功

- [ ] **Step 2: 启动容器并迁移**

Run: `docker compose up -d web worker && sleep 4 && docker exec ai-bid-generator-web-1 python manage.py migrate && docker compose restart nginx`
Expected: 无新增迁移（复用 JSONField），容器启动正常

- [ ] **Step 3: seed prompt**

Run: `docker exec ai-bid-generator-web-1 python manage.py seed_prompts`
Expected: 输出 `创建模板: consistency_audit.default`、`创建版本: consistency_audit.default@1.0`、`创建模板: consistency_repair.default`、`创建版本: consistency_repair.default@1.0`

- [ ] **Step 4: 验证 API 可达**

Run:
```bash
TOKEN=$(curl -s -X POST http://localhost/api/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['access'])")
curl -s -w "\nHTTP %{http_code}\n" "http://localhost/api/outlines/1/consistency-audit/result/" -H "Authorization: Bearer $TOKEN"
```
Expected: HTTP 200，返回 `{"task_status":"idle","progress":0,"total_conflicts":0,"by_severity":{"high":0,"medium":0,"low":0},"conflicts":[]}`

- [ ] **Step 5: 运行单元测试**

Run: `cd backend && python -m pytest apps/outline/tests/test_consistency_audit.py -v`
Expected: 全部 PASS

- [ ] **Step 6: Commit 验证记录**

```bash
git commit --allow-empty -m "chore(consistency-audit): 端到端验证通过"
```
