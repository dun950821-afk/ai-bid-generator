# 一致性审计设计（借鉴 OpenBidKit contentGenerationTask.cjs）

## Context

本项目正文生成已移植 OpenBidKit 的反 AI 味约束与全局事实强制引用（`section_content_generation.antiai` prompt），但缺少**事后审计兜底**——正文生成时只在 prompt 里约束"不得前后矛盾"，没有独立的审计阶段检测正文与全局事实的实际冲突。

OpenBidKit 在正文生成后有独立 `auditing` 阶段：按一级目录分组，AI 审计正文与事实变量的冲突，输出 `{conflicts:[{section_id, fact_title, evidence, reason, severity}]}`，再触发修复。

本设计实现一致性审计 + 修复能力，作为正文生成的质量兜底。

## 需求（已确认）

1. **触发时机**：批量生成全部完成后自动触发（在 `_finalize_batch_task` 里 `delay()`）
2. **冲突处理**：报告 + 批量修复 + 手动修复（两者都要）
3. **审计范围**：按一级目录分组，每组二三级叶子章节正文一起送 AI
4. **架构**：独立 Celery 任务，与批量生成解耦，审计失败不影响已生成正文

## 架构

```
batch_section_generation_task
  └─ _finalize_batch_task（状态置 COMPLETED 后）
      └─ consistency_audit_task.delay(outline_id)   ← 自动触发
            └─ ConsistencyAuditService.run_audit()
                  ├─ 按一级目录分组（每组二三级叶子章节正文）
                  ├─ 每组调 AiTaskExecutionService.execute(scenario="consistency_audit")
                  ├─ 冲突写入各 Section.generation_meta.consistency_conflicts
                  └─ 汇总写入 AsyncTask.result_payload

手动重跑：POST /api/outlines/{id}/consistency-audit/   → 同 task
批量修复：POST /api/outlines/{id}/consistency-repair/  → consistency_repair_task
单章修复：POST /api/sections/{id}/consistency-repair/  → 同步调 service
```

关键设计：
- 审计是独立 AsyncTask（task_type=`consistency_audit`），related_object_type=Outline
- `_finalize_batch_task` 用 `delay()` 触发，失败不影响批量任务已置的 COMPLETED 状态
- 修复是独立 AsyncTask（task_type=`consistency_repair`）

## 数据模型

不新增表，复用现有 `Section.generation_meta` JSONField，增加 `consistency_conflicts` 键：

```python
section.generation_meta = {
    # ...现有 retrieval/generation_mode 等...
    "consistency_conflicts": [
        {
            "fact_title": "交货期",
            "evidence": "本项目工期为60天...",
            "reason": "与交货期事实(90天)矛盾",
            "severity": "high",  # high/medium/low
            "audited_at": "2026-06-29T...",
            "resolved": false,
        }
    ]
}
```

冲突直接写在 Section 上：冲突与章节强绑定，`generation_meta` 本就是给前端展示的 JSON 容器，避免新增模型 + 多一次 JOIN。

## Prompt

新增 PromptScenario：
```python
CONSISTENCY_AUDIT = "consistency_audit"
CONSISTENCY_REPAIR = "consistency_repair"
```

### `consistency_audit.default`

严格移植 OpenBidKit `buildConsistencyAuditMessages`：

- **system**：`你是投标技术方案全文一致性审计助手。请审计本组正文是否与给定事实冲突。要求：1.只返回JSON。2.只找正文已明确写出且与事实违背的内容。3.正文未涉及某事实不要报告缺失。4.不报告文风/质量/重复。5.section_id必须来自允许清单。6.只筛选冲突，不重写正文。返回 {"conflicts":[{"section_id":"","fact_title":"","evidence":"","reason":"","severity":""}]}`
- **user**：绑定 `{{ global_facts_text }}`、`{{ bid_key_info }}`、`{{ allowed_section_ids }}`、`{{ group_content }}`
- **output_schema**：conflicts 数组，每项含 section_id/fact_title/evidence/reason/severity

### `consistency_repair.default`

- **system**：`你是投标技术方案正文修复助手。请根据冲突清单，用全局事实值纠正指定章节正文。要求：1.只返回JSON {"content":"","fixed_conflicts":[]}。2.只改与冲突相关的表述，不重写整章。3.必须用全局事实值替换冲突内容。4.保留原文结构、表格、列表。5.不得新增人员/周期/品牌等编造内容。`
- **user**：绑定 `{{ section_content }}`、`{{ conflicts_json }}`、`{{ global_facts_text }}`
- **output_schema**：`{content: string, fixed_conflicts: array}`

## 服务层

`apps/outline/services/consistency_audit_service.py`：

```python
class ConsistencyAuditService:
    def run_audit(self, outline_id, user, async_task=None) -> dict:
        """按一级目录分组审计。返回 {total_groups, total_conflicts, by_severity}"""
        # 1. 加载全局事实 + 招标关键信息
        # 2. 按一级目录分组叶子章节（含正文）
        # 3. 逐组调 AI 审计，更新 progress
        # 4. 冲突写入各 Section.generation_meta.consistency_conflicts
        # 5. 跑前先批量清空旧冲突，避免累积

    def repair_section(self, section_id, user) -> dict:
        """单章同步修复：读该章 conflicts，调 consistency_repair，覆盖 content"""
        # 返回 {section_id, fixed_count, new_content}

    def run_batch_repair(self, outline_id, user, async_task) -> None:
        """批量异步修复：遍历所有有未解决冲突的章节，逐个 repair_section"""
```

分组逻辑：取 outline 所有一级 Section（level=1, parent=None），每个一级下递归收集叶子章节（无 children）。叶子章节 content 拼成 `group_content`，allowed_section_ids 用章节编号清单。

冲突写入：审计某组后，把 conflicts 按 section_id 分发到对应 Section，更新 `generation_meta.consistency_conflicts`。重审前先批量清空旧冲突。

## Celery 任务

`apps/outline/tasks.py`：

```python
@shared_task(bind=True)
def consistency_audit_task(self, outline_id, async_task_id, user_id):
    """审计任务：分组调 AI，写冲突，进度 0-100"""

@shared_task(bind=True)
def consistency_repair_task(self, outline_id, async_task_id, user_id):
    """批量修复任务：遍历有冲突的章节逐个修复，进度按章节数"""
```

触发点 `_finalize_batch_task` 末尾：

```python
from apps.outline.tasks import consistency_audit_task
from apps.common.models import AsyncTask
audit_task = AsyncTask.objects.create(
    task_type="consistency_audit",
    related_object_type="Outline",
    related_object_id=str(task.outline_id),
    created_by=task.created_by,
)
consistency_audit_task.delay(task.outline_id, audit_task.id, task.created_by_id)
```

## API

挂在 OutlineViewSet + SectionViewSet：

| 方法 | 路径 | 作用 |
|------|------|------|
| POST | `/api/outlines/{id}/consistency-audit/` | 触发审计（异步，返回 task_id） |
| GET | `/api/outlines/{id}/consistency-audit/result/` | 查询审计结果（冲突清单+统计） |
| POST | `/api/outlines/{id}/consistency-repair/` | 批量修复（异步，返回 task_id） |
| POST | `/api/sections/{id}/consistency-repair/` | 单章修复（同步，返回新正文） |

审计结果接口返回：
```json
{
  "task_status": "running|success|failed",
  "progress": 60,
  "total_conflicts": 12,
  "by_severity": {"high": 3, "medium": 6, "low": 3},
  "conflicts": [
    {"section_id": 440, "section_title": "项目实施方案", "section_number": "1.2",
     "conflicts": [{...}], "conflict_count": 2}
  ]
}
```

## 前端

**OutlineDetailView 工具栏**：在"废标检查"按钮旁加"一致性审计"按钮 + 徽标（冲突数）。

**审计抽屉**（`ConsistencyAuditPanel.vue`）：
- 顶部：审计状态徽标 + "重新审计"按钮 + 进度条（轮询 AsyncTask）
- 摘要卡片：高/中/低冲突数
- 冲突列表：按章节分组，每条冲突显示 事实标题/正文证据/冲突原因/severity 标签
- 每条冲突"按事实修复本章"按钮（调单章修复）+ "批量修复全部"按钮（调批量修复，进度轮询）
- 修复后该条标记已解决（绿色），刷新列表

**章节编辑区**：章节有未解决冲突时，标题旁显示橙色"⚠ N处冲突"角标，点击展开冲突清单 + 单章修复入口。

## 错误处理

| 场景 | 处理 |
|------|------|
| 某组 AI 审计调用失败 | 该组跳过，记 warning，不影响其他组；该组章节冲突留空 |
| 全部组都失败 | AsyncTask 标 failed，error_message 记首条错误；已生成正文不受影响 |
| 无全局事实变量 | 审计照常跑（global_facts_text 为空），prompt 约束"正文未涉及不报告" |
| 修复时正文为空 | 跳过该章节，记 warning |
| 修复 AI 返回非法 JSON | 该章修复失败，标记该冲突 resolved=false，继续下一章 |
| 重审时旧冲突 | 跑前先批量清空 `consistency_conflicts`，避免累积 |

核心原则：审计和修复都是"尽力而为"，任何单点失败不阻断整体流程，已生成正文永远不被破坏。

## 测试

`apps/outline/tests/test_consistency_audit.py`：

```python
class ConsistencyAuditServiceTest(TestCase):
    def test_no_global_facts_runs_clean()        # 无事实变量正常跑完
    def test_group_by_top_level()                # 按一级目录正确分组
    def test_conflict_written_to_section_meta()   # 冲突写入 generation_meta
    def test_reaudit_clears_old_conflicts()       # 重审清空旧冲突
    def test_single_section_failure_skipped()      # 单组失败不阻断
    def test_repair_section_overwrites_content()   # 单章修复覆盖正文
    def test_repair_invalid_json_skipped()          # 修复非法JSON跳过
    def test_audit_task_progress_monotonic()        # 进度单调递增
```

mock 策略：mock `AiTaskExecutionService.execute`，按 scenario 返回预设 output_json/output_text，验证调用顺序、冲突分发、进度更新。

## 文件清单

新建：
- `backend/apps/outline/services/consistency_audit_service.py`
- `backend/apps/outline/tests/test_consistency_audit.py`
- `backend/apps/generation/management/commands/_consistency_audit_prompts.py`
- `frontend/src/views/outline/components/ConsistencyAuditPanel.vue`
- `frontend/src/api/consistencyAudit.ts`

修改：
- `backend/apps/outline/tasks.py`（新增 2 个 task + _finalize_batch_task 触发）
- `backend/apps/outline/views.py`（新增 4 个 action）
- `backend/apps/outline/urls.py`（如需）
- `backend/apps/generation/constants.py`（2 个 scenario）
- `backend/apps/generation/management/commands/seed_prompts.py`（2 个 prompt）
- `frontend/src/views/outline/OutlineDetailView.vue`（工具栏按钮 + 抽屉）
- `frontend/src/api/outline.ts`（如需补 section-repair 路由）

无新增迁移（复用 generation_meta JSONField）。
