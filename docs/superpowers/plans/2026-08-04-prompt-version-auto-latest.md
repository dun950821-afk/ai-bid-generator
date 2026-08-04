# 提示词版本自动取最新 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `AiTaskExecutionService._get_prompt_version` 未指定版本时自动选用最新发布的 PromptVersion（按 `-updated_at, -created_at`），不再按模板 key 后缀硬优先级选版。

**Architecture:** 只改一处选版查询：`select_related("template").filter(scenario/system/is_active/PUBLISHED).order_by("-updated_at", "-created_at").first()`。`prompt_version_id` 覆盖参数与 `publish()` 的每模板单 published 约束保持不变。

**Tech Stack:** Django ORM, pytest

## Global Constraints

- 选版规则：同场景 published 版本一律取**最新发布**者（`updated_at` 约等于发布时间，因 published 版本前端不可编辑）
- 保留 `prompt_version_id` 可选覆盖：传了按 pk 精确查找，未传走自动最新
- 不改 `publish()`、模型字段、版本号生成（`1.0-copyN`）、前端版本列表
- 旧变体下线靠前端归档版本或停用模板（`is_active`）

---

### Task 1: 更新 `_get_prompt_version` 选版测试（先写失败测试）

**Files:**
- Modify: `backend/apps/generation/tests/test_ai_task_execution_service.py:131-190`（`TestGetPromptVersion` 类）

**Interfaces:**
- Consumes: 现有 `AiTaskExecutionService._get_prompt_version(scenario, prompt_version_id)`、`PromptTemplate`/`PromptVersion` 模型、`PromptScenario.CONTENT_MATRIX_GENERATION_V2` 常量
- Produces: 新测试断言「最新发布胜 / 停用模板排除 / 归档排除 / 无 published 报错」

- [ ] **Step 1: 重写 `TestGetPromptVersion` 的自动选版测试为真实 DB 测试**

把 `test_use_published_version_by_scenario`（Mock `filter` 返回 list，新实现链 `order_by` 会崩）替换为真实 DB 版本，并新增 4 个测试。文件顶部需加 `from datetime import timedelta`。

```python
@pytest.mark.django_db
class TestGetPromptVersion:
    """测试 _get_prompt_version 方法。"""

    @pytest.mark.django_db
    def test_with_specified_prompt_version_id(self, mock_prompt_version):
        """指定 prompt_version_id 时使用该版本。"""
        service = AiTaskExecutionService()

        with patch.object(
            PromptVersion.objects,
            "select_related",
            return_value=Mock(get=Mock(return_value=mock_prompt_version))
        ):
            result = service._get_prompt_version("any_scenario", prompt_version_id=1)

        assert result.id == 1

    @pytest.mark.django_db
    def test_prompt_version_id_not_found(self):
        """指定的 prompt_version_id 不存在时报错。"""
        service = AiTaskExecutionService()

        with patch.object(
            PromptVersion.objects,
            "select_related",
            return_value=Mock(get=Mock(side_effect=PromptVersion.DoesNotExist))
        ):
            with pytest.raises(PromptVersionNotFoundError) as exc:
                service._get_prompt_version("any_scenario", prompt_version_id=999)

        assert "PromptVersion#999" in str(exc.value)

    @pytest.mark.django_db
    def test_single_published_version_selected(self):
        """未指定版本时选中该场景唯一 published 版本。"""
        template = PromptTemplate.objects.create(
            key="req_analysis.default",
            name="T",
            scenario=PromptScenario.REQUIREMENT_ANALYSIS,
            scope=PromptScope.SYSTEM,
            is_active=True,
        )
        version = PromptVersion.objects.create(
            template=template, version="1.0", user_prompt="p",
            status=PromptVersionStatus.PUBLISHED,
        )

        service = AiTaskExecutionService()
        result = service._get_prompt_version(
            PromptScenario.REQUIREMENT_ANALYSIS, prompt_version_id=None
        )
        assert result.pk == version.pk

    @pytest.mark.django_db
    def test_latest_published_version_wins_over_key_priority(self):
        """同场景多模板共存时取最新发布者，而不是 .antiai 后缀优先。"""
        template_default = PromptTemplate.objects.create(
            key="content_matrix_generation_v2.default",
            name="default 变体",
            scenario=PromptScenario.CONTENT_MATRIX_GENERATION_V2,
            scope=PromptScope.SYSTEM,
            is_active=True,
        )
        template_antiai = PromptTemplate.objects.create(
            key="content_matrix_generation_v2.antiai",
            name="antiai 变体",
            scenario=PromptScenario.CONTENT_MATRIX_GENERATION_V2,
            scope=PromptScope.SYSTEM,
            is_active=True,
        )
        v_default = PromptVersion.objects.create(
            template=template_default, version="1.0", user_prompt="default",
            status=PromptVersionStatus.PUBLISHED,
        )
        v_antiai = PromptVersion.objects.create(
            template=template_antiai, version="1.0", user_prompt="antiai",
            status=PromptVersionStatus.PUBLISHED,
        )
        # antiai 更早发布：人为把它的 updated_at 拨早，验证排序键是时间而非创建顺序
        PromptVersion.objects.filter(pk=v_antiai.pk).update(
            updated_at=v_default.updated_at - timedelta(days=3)
        )

        service = AiTaskExecutionService()
        result = service._get_prompt_version(
            PromptScenario.CONTENT_MATRIX_GENERATION_V2, prompt_version_id=None
        )
        assert result.pk == v_default.pk

    @pytest.mark.django_db
    def test_inactive_template_published_version_excluded(self):
        """模板停用（is_active=False）的 published 版本不参与选版。"""
        active_tpl = PromptTemplate.objects.create(
            key="m.default", name="A", scenario="scene_x",
            scope=PromptScope.SYSTEM, is_active=True,
        )
        inactive_tpl = PromptTemplate.objects.create(
            key="m.antiai", name="B", scenario="scene_x",
            scope=PromptScope.SYSTEM, is_active=False,
        )
        v_active = PromptVersion.objects.create(
            template=active_tpl, version="1.0", user_prompt="active",
            status=PromptVersionStatus.PUBLISHED,
        )
        v_inactive = PromptVersion.objects.create(
            template=inactive_tpl, version="1.0", user_prompt="inactive",
            status=PromptVersionStatus.PUBLISHED,
        )
        PromptVersion.objects.filter(pk=v_inactive.pk).update(
            updated_at=v_active.updated_at + timedelta(days=1)
        )

        service = AiTaskExecutionService()
        result = service._get_prompt_version("scene_x", prompt_version_id=None)
        assert result.pk == v_active.pk

    @pytest.mark.django_db
    def test_archived_version_excluded(self):
        """archived 版本不参与选版；仅剩 archived 时报错。"""
        template = PromptTemplate.objects.create(
            key="m.default", name="T", scenario="scene_y",
            scope=PromptScope.SYSTEM, is_active=True,
        )
        archived = PromptVersion.objects.create(
            template=template, version="1.0", user_prompt="old",
            status=PromptVersionStatus.ARCHIVED,
        )

        service = AiTaskExecutionService()
        with pytest.raises(PromptVersionNotFoundError) as exc:
            service._get_prompt_version("scene_y", prompt_version_id=None)
        assert "未找到已发布的 PromptVersion" in str(exc.value)

        # 补一个 published 后选中它
        published = PromptVersion.objects.create(
            template=template, version="1.1", user_prompt="new",
            status=PromptVersionStatus.PUBLISHED,
        )
        result = service._get_prompt_version("scene_y", prompt_version_id=None)
        assert result.pk == published.pk
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/generation/tests/test_ai_task_execution_service.py::TestGetPromptVersion -q --tb=short`
Expected: FAIL —— 旧逻辑按 key 优先级选 `.antiai`/`.default` 且 Mock 测试 `test_single_published_version_selected` 因 list 无 `order_by` 报 AttributeError

- [ ] **Step 3: 提交**

```bash
git add backend/apps/generation/tests/test_ai_task_execution_service.py
git commit -m "test(generation): 选版测试改为最新发布胜（真实 DB）+ 停用/归档排除用例"
```

---

### Task 2: 实现 `_get_prompt_version` 最新发布选版

**Files:**
- Modify: `backend/apps/generation/services/ai_task_execution_service.py:261-290`

**Interfaces:**
- Consumes: Task 1 的测试
- Produces: 新选版逻辑 —— 未传 `prompt_version_id` 时按 `-updated_at, -created_at` 取该场景 published 版本

- [ ] **Step 1: 替换自动选版代码**

把 `_get_prompt_version` 中 `# 未指定版本，查找 published 版本` 到 `return versions[0]` 的整段（含 `versions = list(...)`、`_priority` 内部函数、`versions.sort`）替换为：

```python
        # 未指定版本，取该场景最新发布的版本。
        # 同一模板 publish() 会归档旧版本（每模板最多一个 published）；
        # 跨模板（.default/.v2/.antiai）共存时一律取发布时间最新者，
        # 旧变体下线靠前端归档版本或停用模板（is_active）。
        version = (
            PromptVersion.objects.select_related("template")
            .filter(
                template__scenario=scenario,
                template__scope=PromptScope.SYSTEM,
                template__is_active=True,
                status=PromptVersionStatus.PUBLISHED,
            )
            .order_by("-updated_at", "-created_at")
            .first()
        )
        if not version:
            raise PromptVersionNotFoundError(
                f"场景 '{scenario}' 未找到已发布的 PromptVersion"
            )
        return version
```

- [ ] **Step 2: 运行测试确认通过**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/generation/tests/test_ai_task_execution_service.py -q --tb=short`
Expected: PASS（Task 1 的 6 个 `TestGetPromptVersion` 用例 + 其余 118 个用例不回归）

- [ ] **Step 3: 提交**

```bash
git add backend/apps/generation/services/ai_task_execution_service.py
git commit -m "fix(generation): 选版改为最新发布胜，去掉 .antiai/.v2/.default 硬优先级"
```

---

### Task 3: 全量回归 + 更新项目记忆

**Files:**
- Modify: `/root/.claude/projects/-home-newaibook-ai-bid-generator/memory/workflow_prompt_template_management.md`（最后一条 bullet）
- Modify: `/root/.claude/projects/-home-newaibook-ai-bid-generator/memory/MEMORY.md`（如索引文字涉及选版规则则同步）

**Interfaces:**
- Consumes: Task 2 的完成状态

- [ ] **Step 1: 全量回归**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/generation/tests/ -q --tb=short`
Expected: 全部 PASS（120 个：118 基线用例 + 2 净新增——`TestGetPromptVersion` 由 4 用例扩为 6 用例）

- [ ] **Step 2: 更新记忆条目**

把 `workflow_prompt_template_management.md` 最后一条 bullet 从：

```
- `AiTaskExecutionService._get_prompt_version` 按 key 后缀优先级 `.antiai > .v2 > .default` 取版本；同一模板多 published 版本时未按版本号排序（已知弱点）。
```

替换为：

```
- `AiTaskExecutionService._get_prompt_version` 未指定版本时一律取最新发布（`order_by("-updated_at", "-created_at")`），不再有 key 后缀优先级（2026-08-04 起）；模板停用 `is_active=False` 可排除变体，前端归档版本可下线旧版；`prompt_version_id` 保留为可选覆盖。
```

- [ ] **Step 3: 提交（记忆文件在 repo 外，仅提交计划文档）**

```bash
git add docs/superpowers/plans/2026-08-04-prompt-version-auto-latest.md
git commit -m "docs: 提示词版本自动取最新实现计划"
```
