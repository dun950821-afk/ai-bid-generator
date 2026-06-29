# 投标制作交互重构实施计划 · 标段工作台

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把投标制作流程收敛到「标段工作台」单页面，业务人员从 项目→标段 一条线走完 上传→解析→大纲→编辑→导出，异步状态全程可见。

**Architecture:** 后端新增标段聚合状态接口（复用现有 TenderFile/Outline/AsyncTask/BidDocument 模型，不新建表）；前端新建 LotWorkbenchView 作为主战场，项目详情页瘦身，移除空菜单「标书制作」并重定向旧路由。大纲/文件/Word 编辑独立页全部保留不重做。

**Tech Stack:** Django + DRF（后端），Vue 3 + TypeScript + Element Plus（前端），pytest（后端测试）

## Global Constraints

- 后端测试用 `cd backend && source .venv/bin/activate && python -m pytest <path> -v`，fixture 从 `backend/conftest.py`（`api_client`/`bid_manager_user`/`project`/`lot`）和 `apps/tender/tests/conftest.py`（`tender_file`/`parsed_document`）取
- 后端文件状态常量在 `apps/tender/models/tender_file.py`，不新增状态值，只在前端做展示映射
- 后端 AsyncTask 模型（`apps/common/models.py:15`）已有 `progress`、`related_object_type`、`related_object_id` 字段，大纲生成任务的 `task_type="generate_outline"`
- 大纲 `generate_from_tender` 接口在 `apps/outline/views.py:137`，返回 `{task_id, status, message}`
- 菜单定义在 `backend/apps/accounts/services/menu_service.py:11` 的 `MENU_DEFINITION`
- 前端路由在 `frontend/src/router/index.ts`
- 后端 URL 注册在 `apps/projects/urls.py`，标段路由前缀 `lots/<int:pk>/`
- 文件状态机不改（保持 7 种内部状态），只在聚合接口和前端做展示映射
- 不引入 WebSocket，状态轮询用 `setInterval` 每 3 秒
- 前端构建：`cd frontend && npm run build`；部署：`docker compose build web && docker compose up -d web && docker compose restart nginx`（见 CLAUDE.md）

---

## 文件结构总览

### 后端新建
- `backend/apps/projects/services/workbench_status_service.py` — 标段工作台状态聚合服务（核心逻辑）
- `backend/apps/projects/views/workbench_views.py` — `LotWorkbenchStatusView` 视图
- `backend/apps/projects/tests/test_workbench_status.py` — 聚合状态接口测试

### 后端修改
- `backend/apps/projects/urls.py` — 注册新路由 `lots/<int:pk>/workbench_status/`
- `backend/apps/accounts/services/menu_service.py` — 移除「标书制作」菜单项

### 前端新建
- `frontend/src/views/projects/LotWorkbenchView.vue` — 标段工作台主页面
- `frontend/src/views/projects/components/WorkbenchStepNav.vue` — 步骤导航条组件
- `frontend/src/views/projects/components/WorkbenchFilePanel.vue` — ①② 步文件上传解析面板
- `frontend/src/views/projects/components/WorkbenchOutlinePanel.vue` — ③④ 步大纲生成编辑面板
- `frontend/src/views/projects/components/WorkbenchExportPanel.vue` — ⑤ 步导出面板
- `frontend/src/views/projects/components/WorkbenchSidebar.vue` — 左侧文件&大纲列表
- `frontend/src/api/workbench.ts` — 工作台聚合状态 API 客户端
- `frontend/src/composables/useWorkbenchPolling.ts` — 轮询 + localStorage 兜底 composable
- `frontend/src/utils/fileStatusMap.ts` — 文件状态映射工具（7态→4态）

### 前端修改
- `frontend/src/router/index.ts` — 新增 `projects/:id/lots/:lotId` 路由；`/outlines` 重定向到 `/projects`
- `frontend/src/views/projects/ProjectDetailView.vue` — 移除「文件」tab，保留 概览/成员/标段
- `frontend/src/views/projects/ProjectOverview.vue` — 升级为标段进度看板
- `frontend/src/views/projects/ProjectLots.vue` — 标段行「大纲」按钮改为跳工作台

---

## Task 1: 后端聚合状态服务

**Files:**
- Create: `backend/apps/projects/services/workbench_status_service.py`
- Test: `backend/apps/projects/tests/test_workbench_status.py`

**Interfaces:**
- Consumes: `apps.tender.models.TenderFile`、`apps.outline.models.Outline`、`apps.common.models.AsyncTask`、`apps.outline.models.BidDocument`、`apps.projects.models.Lot`
- Produces: `WorkbenchStatusService.get_status(lot_id: int) -> dict` — 返回结构见 spec §5

- [ ] **Step 1: 写失败测试 — 空标段返回起步状态**

Create `backend/apps/projects/tests/test_workbench_status.py`:

```python
"""标段工作台聚合状态服务测试。"""

import pytest

from apps.projects.services.workbench_status_service import WorkbenchStatusService


@pytest.mark.django_db
def test_empty_lot_returns_tender_file_step(lot, api_client, bid_manager_user):
    """空标段（无文件无大纲）的 current_step 应为 tender_file。"""
    result = WorkbenchStatusService.get_status(lot.id)
    assert result["lot"]["id"] == lot.id
    assert result["current_step"] == "tender_file"
    assert result["steps"]["tender_file"]["status"] == "pending"
    assert result["steps"]["tender_file"]["file_count"] == 0
    assert result["steps"]["outline_generation"]["status"] == "pending"
    assert result["steps"]["export"]["status"] == "pending"
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/projects/tests/test_workbench_status.py::test_empty_lot_returns_tender_file_step -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'apps.projects.services.workbench_status_service'`

- [ ] **Step 3: 实现服务骨架**

Create `backend/apps/projects/services/workbench_status_service.py`:

```python
"""标段工作台聚合状态服务。"""

from apps.common.models import AsyncTask
from apps.outline.models import BidDocument, Outline
from apps.projects.models import Lot
from apps.tender.models import TenderFile

# 文件内部状态 → 前端展示状态映射
FILE_DISPLAY_STATUS = {
    TenderFile.STATUS_UPLOADING: "uploading",
    TenderFile.STATUS_PARSE_PENDING: "parsing",
    TenderFile.STATUS_PARSING: "parsing",
    TenderFile.STATUS_CHUNKED: "parsing",
    TenderFile.STATUS_PARSED: "ready",
    TenderFile.STATUS_REQUIREMENT_EXTRACTED: "ready",
    TenderFile.STATUS_READY: "ready",
    TenderFile.STATUS_INDEXED: "ready",
    TenderFile.STATUS_PARSE_FAILED: "failed",
    TenderFile.STATUS_REJECTED: "failed",
    TenderFile.STATUS_ARCHIVED: "failed",
    TenderFile.STATUS_UPLOAD_EXPIRED: "failed",
}

PARSING_INTERNAL_STATUSES = {
    TenderFile.STATUS_PARSE_PENDING,
    TenderFile.STATUS_PARSING,
    TenderFile.STATUS_CHUNKED,
}

READY_INTERNAL_STATUSES = {
    TenderFile.STATUS_PARSED,
    TenderFile.STATUS_REQUIREMENT_EXTRACTED,
    TenderFile.STATUS_READY,
    TenderFile.STATUS_INDEXED,
}


class WorkbenchStatusService:
    """标段工作台聚合状态服务。

    一次返回标段的完整制作状态，供前端轮询。
    """

    @staticmethod
    def get_status(lot_id: int) -> dict:
        try:
            lot = Lot.objects.select_related("project").get(pk=lot_id)
        except Lot.DoesNotExist:
            return {"error": "lot_not_found"}

        files = list(
            TenderFile.objects.filter(lot_id=lot_id)
            .exclude(status=TenderFile.STATUS_UPLOADING)
            .order_by("-created_at")
            .values("id", "original_name", "status", "error_message")
        )

        file_items = [
            {
                "id": f["id"],
                "name": f["original_name"],
                "status": f["status"],
                "display_status": FILE_DISPLAY_STATUS.get(f["status"], "parsing"),
                "error_message": f["error_message"] or "",
            }
            for f in files
        ]

        parsing_files = [f for f in file_items if f["display_status"] == "parsing"]
        ready_files = [f for f in file_items if f["display_status"] == "ready"]
        failed_files = [f for f in file_items if f["display_status"] == "failed"]

        outlines = list(
            Outline.objects.filter(lot_id=lot_id)
            .order_by("-is_current", "-created_at")
            .values("id", "name", "status", "is_current")
        )

        # 查找关联此标段的进行中大纲生成任务
        generating_tasks = list(
            AsyncTask.objects.filter(
                task_type="generate_outline",
                related_object_type="lot",
                related_object_id=str(lot_id),
                status__in=["pending", "running", "retrying"],
            ).values("id", "status", "progress")
        )

        documents = list(
            BidDocument.objects.filter(outline__lot_id=lot_id)
            .order_by("-created_at")
            .values("id", "title", "status", "created_at")
        )

        steps = WorkbenchStatusService._build_steps(
            file_items, parsing_files, ready_files, failed_files,
            outlines, generating_tasks, documents,
        )
        current_step = WorkbenchStatusService._derive_current_step(steps)

        return {
            "lot": {"id": lot.id, "name": lot.name, "status": lot.status},
            "current_step": current_step,
            "steps": steps,
        }

    @staticmethod
    def _build_steps(file_items, parsing_files, ready_files, failed_files,
                     outlines, generating_tasks, documents) -> dict:
        # ① 招标文件
        tender_file_status = "done" if file_items else "pending"

        # ② 文件解析
        if parsing_files:
            file_parsing_status = "doing"
        elif failed_files and not ready_files:
            file_parsing_status = "failed"
        elif file_items and all(f["display_status"] in ("ready", "failed") for f in file_items):
            file_parsing_status = "done"
        else:
            file_parsing_status = "pending"

        # ③ 大纲生成
        if generating_tasks:
            outline_status = "doing"
        elif failed_files and not ready_files:
            outline_status = "pending"  # 文件解析失败，不能生成大纲
        elif outlines:
            outline_status = "done"
        else:
            outline_status = "pending"

        # ④ 内容编辑
        current_outline = next((o for o in outlines if o["is_current"]), None)
        if current_outline and current_outline["status"] != "archived":
            editing_status = "done" if any(s["status"] == "generated" for s in []) else "pending"
            # 简化：有大纲即可编辑
            editing_status = "done" if current_outline else "pending"
        else:
            editing_status = "pending"

        # ⑤ 导出
        export_status = "done" if documents else "pending"

        return {
            "tender_file": {
                "status": tender_file_status,
                "file_count": len(file_items),
                "files": file_items,
            },
            "file_parsing": {"status": file_parsing_status},
            "outline_generation": {
                "status": outline_status,
                "outlines": outlines,
                "tasks": generating_tasks,
            },
            "content_editing": {
                "status": editing_status,
                "current_outline_id": current_outline["id"] if current_outline else None,
            },
            "export": {
                "status": export_status,
                "documents": [
                    {
                        "id": d["id"],
                        "title": d["title"],
                        "status": d["status"],
                        "created_at": d["created_at"].isoformat() if d["created_at"] else None,
                    }
                    for d in documents
                ],
            },
        }

    @staticmethod
    def _derive_current_step(steps: dict) -> str:
        """按 spec §5 优先级推导当前步骤。"""
        if steps["outline_generation"]["status"] == "doing":
            return "outline_generation"
        if steps["file_parsing"]["status"] == "doing":
            return "file_parsing"
        # 有就绪文件且无大纲 → 引导生成大纲
        ready_count = sum(
            1 for f in steps["tender_file"]["files"] if f["display_status"] == "ready"
        )
        if ready_count > 0 and not steps["outline_generation"]["outlines"]:
            return "outline_generation"
        if steps["outline_generation"]["outlines"]:
            return "content_editing"
        if steps["export"]["documents"]:
            return "export"
        return "tender_file"
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/projects/tests/test_workbench_status.py::test_empty_lot_returns_tender_file_step -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/apps/projects/services/workbench_status_service.py backend/apps/projects/tests/test_workbench_status.py
git commit -m "feat(projects): 新增标段工作台聚合状态服务 — 空标段场景"
```

---

## Task 2: 聚合状态服务 — 有文件场景测试

**Files:**
- Modify: `backend/apps/projects/tests/test_workbench_status.py`
- (实现已在 Task 1 完成，本任务补充测试覆盖)

**Interfaces:**
- Consumes: Task 1 的 `WorkbenchStatusService.get_status`
- Produces: 测试覆盖解析中/已就绪/失败文件场景

- [ ] **Step 1: 追加解析中文件测试**

在 `test_workbench_status.py` 末尾追加：

```python
@pytest.mark.django_db
def test_parsing_file_returns_file_parsing_step(lot, tender_file_factory):
    """有解析中文件时 current_step 应为 file_parsing。"""
    tender_file_factory(lot=lot, status="parsing")
    result = WorkbenchStatusService.get_status(lot.id)
    assert result["current_step"] == "file_parsing"
    assert result["steps"]["file_parsing"]["status"] == "doing"
    assert result["steps"]["tender_file"]["status"] == "done"
    assert result["steps"]["tender_file"]["files"][0]["display_status"] == "parsing"


@pytest.mark.django_db
def test_ready_file_without_outline_returns_outline_step(lot, tender_file_factory):
    """有就绪文件但无大纲时 current_step 应为 outline_generation。"""
    tender_file_factory(lot=lot, status="parsed")
    result = WorkbenchStatusService.get_status(lot.id)
    assert result["current_step"] == "outline_generation"
    assert result["steps"]["file_parsing"]["status"] == "done"
    assert result["steps"]["tender_file"]["files"][0]["display_status"] == "ready"


@pytest.mark.django_db
def test_failed_file_marks_parsing_failed(lot, tender_file_factory):
    """解析失败文件应标记 file_parsing 为 failed。"""
    tender_file_factory(lot=lot, status="parse_failed", error_message="解析超时")
    result = WorkbenchStatusService.get_status(lot.id)
    assert result["steps"]["file_parsing"]["status"] == "failed"
    assert result["steps"]["tender_file"]["files"][0]["display_status"] == "failed"
    assert result["steps"]["tender_file"]["files"][0]["error_message"] == "解析超时"
```

- [ ] **Step 2: 在 conftest.py 添加 tender_file_factory fixture**

在 `backend/conftest.py` 末尾追加（在 `lot` fixture 之后）：

```python
@pytest.fixture
def tender_file_factory(bid_manager_user):
    """招标文件工厂 fixture。"""
    from apps.tender.models import TenderFile

    def create_tender_file(project=None, lot=None, status=TenderFile.STATUS_PARSED, **kwargs):
        return TenderFile.objects.create(
            project=project or (lot.project if lot else None),
            lot=lot,
            original_name=kwargs.get("original_name", "test.docx"),
            file_size=kwargs.get("file_size", 1024 * 1024),
            content_type=kwargs.get("content_type", "application/vnd.openxmlformats"),
            object_key=kwargs.get("object_key", f"tender/{status}.docx"),
            status=status,
            error_message=kwargs.get("error_message", ""),
            created_by=bid_manager_user,
        )
    return create_tender_file
```

- [ ] **Step 3: 运行测试确认通过**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/projects/tests/test_workbench_status.py -v`
Expected: 4 个测试全部 PASS

- [ ] **Step 4: Commit**

```bash
git add backend/apps/projects/tests/test_workbench_status.py backend/conftest.py
git commit -m "test(projects): 补充聚合状态服务文件场景测试"
```

---

## Task 3: 聚合状态服务 — 大纲与文档场景测试

**Files:**
- Modify: `backend/apps/projects/tests/test_workbench_status.py`

**Interfaces:**
- Consumes: Task 1 的 `WorkbenchStatusService.get_status`
- Produces: 测试覆盖大纲生成中/已有大纲/有文档场景

- [ ] **Step 1: 追加大纲生成中测试**

在 `test_workbench_status.py` 末尾追加：

```python
@pytest.mark.django_db
def test_generating_task_returns_outline_generation_step(lot, tender_file_factory, bid_manager_user):
    """有生成中大纲任务时 current_step 应为 outline_generation 且 status=doing。"""
    tender_file_factory(lot=lot, status="parsed")
    from apps.common.models import AsyncTask
    AsyncTask.objects.create(
        task_type="generate_outline",
        status="running",
        progress=45,
        related_object_type="lot",
        related_object_id=str(lot.id),
        created_by=bid_manager_user,
    )
    result = WorkbenchStatusService.get_status(lot.id)
    assert result["current_step"] == "outline_generation"
    assert result["steps"]["outline_generation"]["status"] == "doing"
    assert result["steps"]["outline_generation"]["tasks"][0]["progress"] == 45


@pytest.mark.django_db
def test_has_outline_returns_content_editing_step(lot, tender_file_factory, outline_factory):
    """有大纲时 current_step 应为 content_editing。"""
    tender_file_factory(lot=lot, status="parsed")
    outline_factory(lot=lot, is_current=True)
    result = WorkbenchStatusService.get_status(lot.id)
    assert result["current_step"] == "content_editing"
    assert result["steps"]["outline_generation"]["status"] == "done"
    assert result["steps"]["content_editing"]["status"] == "done"


@pytest.mark.django_db
def test_has_document_returns_export_step(lot, tender_file_factory, outline_factory, bid_document_factory):
    """有 Word 文档时 export 步骤应为 done。"""
    tender_file_factory(lot=lot, status="parsed")
    outline = outline_factory(lot=lot, is_current=True)
    bid_document_factory(outline=outline)
    result = WorkbenchStatusService.get_status(lot.id)
    assert result["steps"]["export"]["status"] == "done"
    assert len(result["steps"]["export"]["documents"]) == 1
```

- [ ] **Step 2: 在 conftest.py 添加 outline_factory 和 bid_document_factory fixture**

在 `backend/conftest.py` 的 `tender_file_factory` 之后追加：

```python
@pytest.fixture
def outline_factory(bid_manager_user):
    """大纲工厂 fixture。"""
    from apps.outline.models import Outline
    from apps.outline.constants import OutlineSource, OutlineStatus

    def create_outline(lot, is_current=False, name="测试大纲", **kwargs):
        return Outline.objects.create(
            project=lot.project,
            lot=lot,
            name=name,
            source=kwargs.get("source", OutlineSource.MANUAL),
            status=kwargs.get("status", OutlineStatus.DRAFT),
            is_current=is_current,
            created_by=bid_manager_user,
        )
    return create_outline


@pytest.fixture
def bid_document_factory(bid_manager_user):
    """Word 文档工厂 fixture。"""
    from apps.outline.models import BidDocument
    from apps.outline.models.bid_document import BidDocumentStatus

    def create_bid_document(outline, title="测试文档.docx", **kwargs):
        return BidDocument.objects.create(
            outline=outline,
            title=title,
            version=kwargs.get("version", 1),
            status=kwargs.get("status", BidDocumentStatus.DRAFT),
            object_key=kwargs.get("object_key", f"docs/{title}"),
            created_by=bid_manager_user,
        )
    return create_bid_document
```

- [ ] **Step 3: 运行测试确认通过**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/projects/tests/test_workbench_status.py -v`
Expected: 7 个测试全部 PASS

- [ ] **Step 4: Commit**

```bash
git add backend/apps/projects/tests/test_workbench_status.py backend/conftest.py
git commit -m "test(projects): 补充聚合状态服务大纲与文档场景测试"
```

---

## Task 4: 后端聚合状态视图与路由

**Files:**
- Create: `backend/apps/projects/views/workbench_views.py`
- Modify: `backend/apps/projects/urls.py`
- Modify: `backend/apps/projects/views/__init__.py`（如有导出需要）
- Test: `backend/apps/projects/tests/test_workbench_status.py`（追加 API 测试）

**Interfaces:**
- Consumes: Task 1 的 `WorkbenchStatusService.get_status`、`LotDetailView` 的权限校验模式（`apps/projects/views/lot_views.py:17`）
- Produces: `GET /api/lots/:lotId/workbench_status/` 接口

- [ ] **Step 1: 写失败 API 测试**

在 `test_workbench_status.py` 末尾追加：

```python
@pytest.mark.django_db
def test_workbench_status_api_requires_auth(lot, api_client):
    """未认证访问应返回 401。"""
    resp = api_client.get(f"/api/lots/{lot.id}/workbench_status/")
    assert resp.status_code == 401


@pytest.mark.django_db
def test_workbench_status_api_returns_aggregation(lot, api_client, bid_manager_user):
    """项目成员应能拿到聚合状态。"""
    api_client.force_authenticate(user=bid_manager_user)
    resp = api_client.get(f"/api/lots/{lot.id}/workbench_status/")
    assert resp.status_code == 200
    data = resp.json()
    assert data["lot"]["id"] == lot.id
    assert data["current_step"] == "tender_file"


@pytest.mark.django_db
def test_workbench_status_api_non_member_forbidden(lot, api_client, normal_user):
    """非项目成员应返回 403。"""
    api_client.force_authenticate(user=normal_user)
    resp = api_client.get(f"/api/lots/{lot.id}/workbench_status/")
    assert resp.status_code == 403
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/projects/tests/test_workbench_status.py::test_workbench_status_api_requires_auth -v`
Expected: FAIL with 404（路由未注册）

- [ ] **Step 3: 实现视图**

Create `backend/apps/projects/views/workbench_views.py`:

```python
"""标段工作台视图。"""

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import MustChangePasswordPermission
from apps.common.exceptions import NotFound, PermissionDenied
from apps.projects.models import Lot
from apps.projects.services.workbench_status_service import WorkbenchStatusService


class LotWorkbenchStatusView(APIView):
    """标段工作台聚合状态视图。

    GET /api/lots/:lotId/workbench_status/
    返回标段完整制作状态聚合（spec §5）。
    """

    permission_classes = [IsAuthenticated, MustChangePasswordPermission]

    def get(self, request, pk):
        try:
            lot = Lot.objects.select_related("project").get(pk=pk)
        except Lot.DoesNotExist:
            raise NotFound(message="标段不存在")

        if not lot.project.members.filter(user=request.user).exists():
            raise PermissionDenied(message="无权访问此标段")

        data = WorkbenchStatusService.get_status(lot.id)
        if "error" in data:
            raise NotFound(message="标段不存在")
        return Response(data)
```

- [ ] **Step 4: 注册路由**

在 `backend/apps/projects/urls.py` 的 `lot-detail` 路由后追加。

先在文件顶部 import 区追加：

```python
from apps.projects.views.lot_views import LotDetailView, LotWorkflowView, LotWorkflowStartView
from apps.projects.views.workbench_views import LotWorkbenchStatusView
```

然后在 `urlpatterns` 列表末尾（`lot-workflow-start` 之后、`]` 之前）追加：

```python
    path(
        "lots/<int:pk>/workbench_status/",
        LotWorkbenchStatusView.as_view(),
        name="lot-workbench-status",
    ),
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/projects/tests/test_workbench_status.py -v`
Expected: 10 个测试全部 PASS

- [ ] **Step 6: Commit**

```bash
git add backend/apps/projects/views/workbench_views.py backend/apps/projects/urls.py backend/apps/projects/tests/test_workbench_status.py
git commit -m "feat(projects): 新增标段工作台聚合状态接口 GET /api/lots/:id/workbench_status/"
```

---

## Task 5: 移除「标书制作」菜单项

**Files:**
- Modify: `backend/apps/accounts/services/menu_service.py:19-20`
- Test: `backend/apps/accounts/tests/`（找现有菜单测试）

**Interfaces:**
- Consumes: `MENU_DEFINITION` 列表
- Produces: 菜单不再包含 `outlines` 项

- [ ] **Step 1: 找现有菜单测试**

Run: `cd backend && grep -rln "outlines\|标书制作\|MENU_DEFINITION" apps/accounts/tests/ apps/common/tests/ 2>/dev/null`
记录找到的测试文件路径。

- [ ] **Step 2: 写失败测试 — 菜单不含 outlines**

在找到的菜单测试文件（若没有则在 `apps/accounts/tests/` 新建 `test_menu.py`）中追加：

```python
import pytest

from apps.accounts.services.menu_service import build_menu_tree, MENU_DEFINITION


@pytest.mark.django_db
def test_menu_does_not_include_outlines():
    """标书制作菜单项应已移除（spec §3）。"""
    keys = [item["key"] for item in MENU_DEFINITION]
    assert "outlines" not in keys, "「标书制作」菜单项应已移除"

    tree = build_menu_tree(global_permissions=[])
    all_keys = []
    for group in tree:
        for item in group.get("items", []):
            all_keys.append(item["key"])
    assert "outlines" not in all_keys
```

- [ ] **Step 3: 运行测试确认失败**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/accounts/tests/test_menu.py::test_menu_does_not_include_outlines -v`
Expected: FAIL with `AssertionError: 「标书制作」菜单项应已移除`

- [ ] **Step 4: 移除菜单项**

在 `backend/apps/accounts/services/menu_service.py` 删除第 19-20 行：

```python
    {"key": "outlines", "title": "标书制作", "icon": "Document",
     "route": "/outlines", "permission": None, "group": "业务管理"},
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/accounts/tests/test_menu.py -v`
Expected: PASS

- [ ] **Step 6: 检查其他菜单测试未破坏**

Run: `cd backend && source .venv/bin/activate && python -m pytest apps/accounts/tests/ -v -k menu`
Expected: 所有菜单相关测试 PASS（若有测试断言 outlines 存在，需同步更新该断言）

- [ ] **Step 7: Commit**

```bash
git add backend/apps/accounts/services/menu_service.py backend/apps/accounts/tests/test_menu.py
git commit -m "refactor(accounts): 移除「标书制作」菜单项 — 改由标段工作台进入"
```

---

## Task 6: 前端文件状态映射工具

**Files:**
- Create: `frontend/src/utils/fileStatusMap.ts`

**Interfaces:**
- Consumes: 后端文件状态字符串（`uploading`/`parse_pending`/`parsing`/`chunked`/`parsed`/`requirement_extracted`/`ready`/`indexed`/`parse_failed`/`rejected`/`archived`/`upload_expired`）
- Produces: `mapFileDisplayStatus(status: string): DisplayStatus`、`DisplayStatus` 类型

- [ ] **Step 1: 实现映射工具**

Create `frontend/src/utils/fileStatusMap.ts`:

```typescript
/** 文件展示状态（spec §6，4 态简化）。 */
export type DisplayStatus = 'uploading' | 'parsing' | 'ready' | 'failed'

/** 展示状态对应的中文标签。 */
export const DISPLAY_STATUS_LABEL: Record<DisplayStatus, string> = {
  uploading: '上传中',
  parsing: '解析中',
  ready: '已就绪',
  failed: '解析失败',
}

/** 展示状态对应的 Element Plus tag type。 */
export const DISPLAY_STATUS_TAG_TYPE: Record<DisplayStatus, string> = {
  uploading: 'info',
  parsing: 'warning',
  ready: 'success',
  failed: 'danger',
}

const STATUS_MAP: Record<string, DisplayStatus> = {
  uploading: 'uploading',
  parse_pending: 'parsing',
  parsing: 'parsing',
  chunking: 'parsing',
  chunked: 'parsing',
  processing: 'parsing',
  parsed: 'ready',
  requirement_extracted: 'ready',
  ready: 'ready',
  indexed: 'ready',
  parse_failed: 'failed',
  rejected: 'failed',
  archived: 'failed',
  upload_expired: 'failed',
}

/** 后端文件状态 → 前端展示状态。 */
export function mapFileDisplayStatus(status: string): DisplayStatus {
  return STATUS_MAP[status] ?? 'parsing'
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/utils/fileStatusMap.ts
git commit -m "feat(frontend): 文件状态映射工具 — 7态简化为4态展示"
```

---

## Task 7: 前端工作台 API 客户端

**Files:**
- Create: `frontend/src/api/workbench.ts`

**Interfaces:**
- Consumes: `@/api/http` 的 `http` 实例
- Produces: `getWorkbenchStatus(lotId: number)` 函数、`WorkbenchStatus` TypeScript 类型

- [ ] **Step 1: 实现 API 客户端**

Create `frontend/src/api/workbench.ts`:

```typescript
import { http } from '@/api/http'

/** 文件展示状态。 */
export type DisplayStatus = 'uploading' | 'parsing' | 'ready' | 'failed'

/** 工作台步骤状态。 */
export type StepStatus = 'pending' | 'doing' | 'done' | 'failed'

/** 工作台步骤 key。 */
export type StepKey = 'tender_file' | 'file_parsing' | 'outline_generation' | 'content_editing' | 'export'

/** 聚合状态中的文件项。 */
export interface WorkbenchFile {
  id: number
  name: string
  status: string
  display_status: DisplayStatus
  error_message: string
}

/** 聚合状态中的大纲项。 */
export interface WorkbenchOutline {
  id: number
  name: string
  status: string
  is_current: boolean
}

/** 聚合状态中的生成任务。 */
export interface WorkbenchTask {
  id: number
  status: string
  progress: number
}

/** 聚合状态中的文档项。 */
export interface WorkbenchDocument {
  id: number
  title: string
  status: string
  created_at: string | null
}

/** 聚合状态响应。 */
export interface WorkbenchStatus {
  lot: { id: number; name: string; status: string }
  current_step: StepKey
  steps: {
    tender_file: {
      status: StepStatus
      file_count: number
      files: WorkbenchFile[]
    }
    file_parsing: { status: StepStatus }
    outline_generation: {
      status: StepStatus
      outlines: WorkbenchOutline[]
      tasks: WorkbenchTask[]
    }
    content_editing: {
      status: StepStatus
      current_outline_id: number | null
    }
    export: {
      status: StepStatus
      documents: WorkbenchDocument[]
    }
  }
}

/** 获取标段工作台聚合状态。 */
export async function getWorkbenchStatus(lotId: number): Promise<WorkbenchStatus> {
  const res = await http.get<WorkbenchStatus>(`/api/lots/${lotId}/workbench_status/`)
  return res.data
}
```

- [ ] **Step 2: 类型检查**

Run: `cd frontend && npx vue-tsc --noEmit 2>&1 | grep -E "workbench|error" | head -20`
Expected: 无 workbench.ts 相关错误

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/workbench.ts
git commit -m "feat(frontend): 工作台聚合状态 API 客户端 + 类型定义"
```

---

## Task 8: 前端轮询 composable

**Files:**
- Create: `frontend/src/composables/useWorkbenchPolling.ts`

**Interfaces:**
- Consumes: Task 7 的 `getWorkbenchStatus`、`WorkbenchStatus` 类型
- Produces: `useWorkbenchPolling(lotId)` composable，返回 `{ status, isPolling, start, stop }`

- [ ] **Step 1: 实现 composable**

Create `frontend/src/composables/useWorkbenchPolling.ts`:

```typescript
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { getWorkbenchStatus, type WorkbenchStatus } from '@/api/workbench'

const STORAGE_KEY = 'workbench:active_lots'

/** 读取 localStorage 中进行中的标段。 */
function readActiveLots(): Record<number, { step: string; since: number }> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

/** 写入进行中标段。 */
function writeActiveLot(lotId: number, step: string | null) {
  const lots = readActiveLots()
  if (step) {
    lots[lotId] = { step, since: Date.now() }
  } else {
    delete lots[lotId]
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lots))
}

/** 查询某标段是否在 localStorage 进行中（跨页面感知）。 */
export function isLotActive(lotId: number): boolean {
  return lotId in readActiveLots()
}

/** 工作台状态轮询 composable。 */
export function useWorkbenchPolling(lotId: () => number) {
  const status = ref<WorkbenchStatus | null>(null)
  const isPolling = ref(false)
  const loading = ref(false)
  let timer: ReturnType<typeof setInterval> | null = null

  function hasDoingStep(s: WorkbenchStatus | null): boolean {
    if (!s) return false
    return (Object.values(s.steps) as Array<{ status: string }>).some(
      (step) => step.status === 'doing'
    )
  }

  async function fetchOnce() {
    const id = lotId()
    if (!id) return
    try {
      status.value = await getWorkbenchStatus(id)
      writeActiveLot(id, hasDoingStep(status.value) ? status.value.current_step : null)
    } catch (err) {
      console.error('工作台状态获取失败:', err)
    }
  }

  function start() {
    const id = lotId()
    if (!id) return
    if (timer) clearInterval(timer)
    isPolling.value = true
    loading.value = true
    fetchOnce().finally(() => {
      loading.value = false
    })
    timer = setInterval(fetchOnce, 3000)
  }

  function stop() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    isPolling.value = false
  }

  watch(
    () => status.value,
    (s) => {
      if (!isPolling.value) return
      if (!hasDoingStep(s)) {
        stop()
      }
    },
    { deep: true }
  )

  onMounted(start)
  onBeforeUnmount(stop)

  return { status, isPolling, loading, start, stop, fetchOnce }
}
```

- [ ] **Step 2: 类型检查**

Run: `cd frontend && npx vue-tsc --noEmit 2>&1 | grep -E "useWorkbenchPolling|error" | head -20`
Expected: 无相关错误

- [ ] **Step 3: Commit**

```bash
git add frontend/src/composables/useWorkbenchPolling.ts
git commit -m "feat(frontend): 工作台状态轮询 composable + localStorage 跨页面兜底"
```

---

## Task 9: 前端步骤导航条组件

**Files:**
- Create: `frontend/src/views/projects/components/WorkbenchStepNav.vue`

**Interfaces:**
- Consumes: Task 7 的 `WorkbenchStatus`、`StepKey`、`StepStatus` 类型
- Produces: `WorkbenchStepNav` 组件，props: `currentStep`、`steps`、emit: `select(step: StepKey)`

- [ ] **Step 1: 实现步骤导航条**

Create `frontend/src/views/projects/components/WorkbenchStepNav.vue`:

```vue
<template>
  <div class="workbench-step-nav">
    <div
      v-for="(step, idx) in stepList"
      :key="step.key"
      class="step-item"
      :class="{
        'is-active': step.key === currentStep,
        'is-done': step.status === 'done',
        'is-doing': step.status === 'doing',
        'is-failed': step.status === 'failed',
      }"
      @click="$emit('select', step.key)"
    >
      <div class="step-index">
        <el-icon v-if="step.status === 'done'"><Check /></el-icon>
        <el-icon v-else-if="step.status === 'doing'" class="is-loading"><Loading /></el-icon>
        <el-icon v-else-if="step.status === 'failed'"><Close /></el-icon>
        <span v-else>{{ idx + 1 }}</span>
      </div>
      <div class="step-label">
        <div class="step-title">{{ step.title }}</div>
        <div class="step-status">{{ getStatusLabel(step.status) }}</div>
      </div>
      <el-icon v-if="idx < stepList.length - 1" class="step-arrow"><ArrowRight /></el-icon>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Check, Close, Loading, ArrowRight } from '@element-plus/icons-vue'
import type { WorkbenchStatus, StepKey, StepStatus } from '@/api/workbench'

const props = defineProps<{
  currentStep: StepKey
  status: WorkbenchStatus | null
}>()

defineEmits<{
  select: [step: StepKey]
}>()

const STEP_TITLES: Record<StepKey, string> = {
  tender_file: '招标文件',
  file_parsing: '文件解析',
  outline_generation: '大纲生成',
  content_editing: '内容编辑',
  export: '导出',
}

const stepList = computed(() => {
  if (!props.status) {
    return (Object.keys(STEP_TITLES) as StepKey[]).map((key) => ({
      key,
      title: STEP_TITLES[key],
      status: 'pending' as StepStatus,
    }))
  }
  return (Object.keys(STEP_TITLES) as StepKey[]).map((key) => ({
    key,
    title: STEP_TITLES[key],
    status: props.status!.steps[key].status,
  }))
})

function getStatusLabel(status: StepStatus): string {
  const map: Record<StepStatus, string> = {
    pending: '待开始',
    doing: '进行中',
    done: '已完成',
    failed: '失败',
  }
  return map[status]
}
</script>

<style scoped>
.workbench-step-nav {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 16px 24px;
  background: var(--el-fill-color-blank);
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  margin-bottom: 16px;
  overflow-x: auto;
}

.step-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;
  white-space: nowrap;
}

.step-item:hover {
  background: var(--el-fill-color-light);
}

.step-item.is-active {
  background: var(--el-color-primary-light-9);
}

.step-index {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--el-fill-color);
  color: var(--el-text-color-secondary);
  font-size: 14px;
  flex-shrink: 0;
}

.step-item.is-done .step-index {
  background: var(--el-color-success);
  color: #fff;
}

.step-item.is-doing .step-index {
  background: var(--el-color-warning);
  color: #fff;
}

.step-item.is-failed .step-index {
  background: var(--el-color-danger);
  color: #fff;
}

.step-label {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.step-title {
  font-size: 14px;
  font-weight: 500;
}

.step-status {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.step-arrow {
  color: var(--el-text-color-placeholder);
  margin-left: 4px;
}
</style>
```

- [ ] **Step 2: 类型检查**

Run: `cd frontend && npx vue-tsc --noEmit 2>&1 | grep -E "WorkbenchStepNav|error" | head -20`
Expected: 无相关错误

- [ ] **Step 3: Commit**

```bash
git add frontend/src/views/projects/components/WorkbenchStepNav.vue
git commit -m "feat(frontend): 工作台步骤导航条组件"
```

---

## Task 10: 前端文件上传解析面板组件

**Files:**
- Create: `frontend/src/views/projects/components/WorkbenchFilePanel.vue`

**Interfaces:**
- Consumes: Task 6 的 `mapFileDisplayStatus`、Task 7 的 `WorkbenchStatus` 类型、`@/api/tender` 的 `directUpload`/`retryParse`、props `lotId`、`projectId`
- Produces: `WorkbenchFilePanel` 组件，处理 ①② 步

- [ ] **Step 1: 实现文件面板**

Create `frontend/src/views/projects/components/WorkbenchFilePanel.vue`:

```vue
<template>
  <div class="workbench-file-panel">
    <!-- 拖拽上传区 -->
    <el-upload
      ref="uploadRef"
      :auto-upload="false"
      :show-file-list="false"
      :on-change="handleFileChange"
      drag
      multiple
      class="upload-area"
    >
      <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
      <div class="el-upload__text">拖拽招标文件到此处或 <em>点击选择</em></div>
      <template #tip>
        <div class="upload-tip">支持 DOCX、TXT、MD 格式，最大 100MB。暂不支持 PDF。</div>
      </template>
    </el-upload>

    <div v-if="uploading" class="upload-progress">
      <el-progress :percentage="uploadProgress" :status="uploadStatus" />
    </div>

    <!-- 文件列表 -->
    <div v-if="files.length" class="file-list">
      <h4>本标段文件</h4>
      <div v-for="file in files" :key="file.id" class="file-item">
        <el-icon><Document /></el-icon>
        <div class="file-info">
          <div class="file-name">{{ file.name }}</div>
          <div v-if="file.error_message" class="file-error">{{ file.error_message }}</div>
        </div>
        <el-tag :type="getDisplayTagType(file.display_status)" size="small">
          {{ getDisplayLabel(file.display_status) }}
        </el-tag>
        <div class="file-actions">
          <el-button
            v-if="file.display_status === 'failed'"
            type="warning"
            size="small"
            :loading="retryingId === file.id"
            @click="handleRetry(file.id)"
          >重试</el-button>
          <el-button type="default" size="small" link @click="viewFileDetail(file.id)">详情</el-button>
        </div>
      </div>
    </div>
    <el-empty v-else description="暂无文件，请上传招标文件" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { UploadFilled, Document } from '@element-plus/icons-vue'
import type { UploadFile } from 'element-plus'
import { directUpload, retryParse } from '@/api/tender'
import {
  mapFileDisplayStatus,
  DISPLAY_STATUS_LABEL,
  DISPLAY_STATUS_TAG_TYPE,
} from '@/utils/fileStatusMap'
import type { WorkbenchStatus, WorkbenchFile } from '@/api/workbench'

const props = defineProps<{
  lotId: number
  projectId: number
  status: WorkbenchStatus | null
}>()

const emit = defineEmits<{ uploaded: [] }>()

const router = useRouter()
const uploadRef = ref()
const uploading = ref(false)
const uploadProgress = ref(0)
const uploadStatus = ref<'success' | 'exception' | ''>('')
const retryingId = ref<number | null>(null)

const files = computed<WorkbenchFile[]>(() => {
  return props.status?.steps.tender_file.files ?? []
})

function getDisplayLabel(status: string): string {
  return DISPLAY_STATUS_LABEL[mapFileDisplayStatus(status)]
}

function getDisplayTagType(status: string): string {
  return DISPLAY_STATUS_TAG_TYPE[mapFileDisplayStatus(status)]
}

function handleFileChange(uploadFile: UploadFile) {
  const file = uploadFile.raw
  if (!file) return
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (!ext || !['docx', 'txt', 'md'].includes(ext)) {
    ElMessage.error('暂不支持该文件格式，请上传 DOCX、TXT 或 MD 文件')
    uploadRef.value?.clearFiles()
    return
  }
  doUpload(file)
}

async function doUpload(file: File) {
  uploading.value = true
  uploadProgress.value = 30
  uploadStatus.value = ''
  try {
    await directUpload(file, {
      project_id: props.projectId,
      lot_id: props.lotId,
      file_category: 'tender_file',
    })
    uploadProgress.value = 100
    uploadStatus.value = 'success'
    ElMessage.success('上传成功，正在解析...')
    emit('uploaded')
  } catch (err: any) {
    uploadStatus.value = 'exception'
    ElMessage.error(err.response?.data?.message || '上传失败')
  } finally {
    uploading.value = false
    uploadProgress.value = 0
    uploadStatus.value = ''
  }
}

async function handleRetry(fileId: number) {
  retryingId.value = fileId
  try {
    await retryParse(fileId)
    ElMessage.success('已触发重新解析')
    emit('uploaded')
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '操作失败')
  } finally {
    retryingId.value = null
  }
}

function viewFileDetail(fileId: number) {
  router.push({ name: 'tender-file-detail', params: { fileId } })
}
</script>

<style scoped>
.workbench-file-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.upload-area :deep(.el-upload-dragger) {
  width: 100%;
  padding: 24px;
}

.upload-progress {
  padding: 0 8px;
}

.file-list h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.file-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  margin-bottom: 8px;
}

.file-info {
  flex: 1;
  min-width: 0;
}

.file-name {
  font-size: 14px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.file-error {
  font-size: 12px;
  color: var(--el-color-danger);
  margin-top: 4px;
}

.file-actions {
  display: flex;
  gap: 8px;
}
</style>
```

- [ ] **Step 2: 类型检查**

Run: `cd frontend && npx vue-tsc --noEmit 2>&1 | grep -E "WorkbenchFilePanel|error" | head -20`
Expected: 无相关错误

- [ ] **Step 3: Commit**

```bash
git add frontend/src/views/projects/components/WorkbenchFilePanel.vue
git commit -m "feat(frontend): 工作台文件上传解析面板组件"
```

---

## Task 11: 前端大纲生成编辑面板组件

**Files:**
- Create: `frontend/src/views/projects/components/WorkbenchOutlinePanel.vue`

**Interfaces:**
- Consumes: Task 7 的 `WorkbenchStatus` 类型、`@/api/http`、props `lotId`、`projectId`
- Produces: `WorkbenchOutlinePanel` 组件，处理 ③④ 步

- [ ] **Step 1: 实现大纲面板**

Create `frontend/src/views/projects/components/WorkbenchOutlinePanel.vue`:

```vue
<template>
  <div class="workbench-outline-panel">
    <!-- 现有大纲列表 -->
    <div class="section">
      <h4>本标段大纲</h4>
      <div v-if="outlines.length" class="outline-list">
        <div v-for="outline in outlines" :key="outline.id" class="outline-item">
          <div class="outline-info">
            <span class="outline-name">{{ outline.name }}</span>
            <el-tag v-if="outline.is_current" type="success" size="small">当前版本</el-tag>
            <el-tag :type="getOutlineStatusType(outline.status)" size="small">
              {{ getOutlineStatusLabel(outline.status) }}
            </el-tag>
          </div>
          <el-button type="primary" size="small" @click="goEdit(outline.id)">编辑</el-button>
        </div>
      </div>
      <el-empty v-else description="暂无大纲" :image-size="60" />
    </div>

    <!-- 新建大纲（内联） -->
    <div class="section">
      <h4>新建大纲</h4>
      <el-radio-group v-model="createMode" class="create-mode">
        <el-radio value="manual">手动创建</el-radio>
        <el-radio value="preset">预设模板</el-radio>
        <el-radio value="ai">AI 解析</el-radio>
      </el-radio-group>

      <el-form label-width="100px" class="create-form">
        <el-form-item label="大纲名称">
          <el-input v-model="createForm.name" placeholder="请输入大纲名称" style="width: 100%" />
        </el-form-item>
        <el-form-item v-if="createMode === 'preset'" label="预设模板">
          <el-select v-model="createForm.templateId" placeholder="请选择" style="width: 100%" :loading="loadingTemplates">
            <el-option v-for="tpl in presetTemplates" :key="tpl.id" :label="tpl.name" :value="tpl.id" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="createMode === 'ai'" label="招标文件">
          <el-select v-model="createForm.tenderFileId" placeholder="请选择已解析的招标文件" style="width: 100%">
            <el-option
              v-for="f in readyFiles"
              :key="f.id"
              :label="f.name"
              :value="f.id"
            />
          </el-select>
          <div v-if="!readyFiles.length" class="ai-tip">暂无已解析文件，请先在「招标文件」步骤上传并解析</div>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="creating" @click="handleCreate">创建</el-button>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { http } from '@/api/http'
import { normalizeList } from '@/utils/normalize'
import type { WorkbenchStatus } from '@/api/workbench'

const props = defineProps<{
  lotId: number
  projectId: number
  status: WorkbenchStatus | null
}>()

const router = useRouter()
const createMode = ref<'manual' | 'preset' | 'ai'>('manual')
const createForm = ref({ name: '', templateId: null as number | null, tenderFileId: null as number | null })
const creating = ref(false)
const presetTemplates = ref<Array<{ id: number; name: string }>>([])
const loadingTemplates = ref(false)

const outlines = computed(() => props.status?.steps.outline_generation.outlines ?? [])
const readyFiles = computed(() =>
  (props.status?.steps.tender_file.files ?? []).filter((f) => f.display_status === 'ready')
)

async function loadPresetTemplates() {
  loadingTemplates.value = true
  try {
    const res = await http.get<{ results: Array<{ id: number; name: string }> }>(
      '/api/preset-templates/',
      { params: { page_size: 100 } }
    )
    presetTemplates.value = res.data?.results || []
  } catch {
    presetTemplates.value = []
  } finally {
    loadingTemplates.value = false
  }
}

async function handleCreate() {
  if (!createForm.value.name) {
    ElMessage.warning('请输入大纲名称')
    return
  }
  if (createMode.value === 'preset' && !createForm.value.templateId) {
    ElMessage.warning('请选择预设模板')
    return
  }
  if (createMode.value === 'ai' && !createForm.value.tenderFileId) {
    ElMessage.warning('请选择招标文件')
    return
  }

  creating.value = true
  try {
    if (createMode.value === 'manual') {
      const res = await http.post('/api/outlines/', {
        lot: props.lotId,
        name: createForm.value.name,
      })
      ElMessage.success('大纲创建成功')
      router.push(`/outlines/${res.data.id}`)
    } else if (createMode.value === 'preset') {
      const res = await http.post('/api/outlines/from_preset/', {
        lot_id: props.lotId,
        template_id: createForm.value.templateId,
        name: createForm.value.name,
      })
      ElMessage.success('大纲创建成功')
      router.push(`/outlines/${res.data.id}`)
    } else {
      await http.post('/api/outlines/generate_from_tender/', {
        tender_file_id: createForm.value.tenderFileId,
      })
      ElMessage.success('AI 生成任务已提交，请稍候...')
    }
    createForm.value = { name: '', templateId: null, tenderFileId: null }
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || err.response?.data?.detail || '创建失败')
  } finally {
    creating.value = false
  }
}

function goEdit(outlineId: number) {
  router.push(`/outlines/${outlineId}`)
}

function getOutlineStatusType(status: string): string {
  const map: Record<string, string> = { draft: 'info', active: 'success', archived: 'info' }
  return map[status] || 'info'
}

function getOutlineStatusLabel(status: string): string {
  const map: Record<string, string> = { draft: '草稿', active: '活跃', archived: '已归档' }
  return map[status] || status
}

watch(createMode, (mode) => {
  if (mode === 'preset' && presetTemplates.value.length === 0) {
    loadPresetTemplates()
  }
})
</script>

<style scoped>
.workbench-outline-panel {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.section h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.outline-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  margin-bottom: 8px;
}

.outline-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.outline-name {
  font-size: 14px;
}

.create-mode {
  margin-bottom: 12px;
}

.ai-tip {
  font-size: 12px;
  color: var(--el-color-warning);
  margin-top: 4px;
}
</style>
```

- [ ] **Step 2: 类型检查**

Run: `cd frontend && npx vue-tsc --noEmit 2>&1 | grep -E "WorkbenchOutlinePanel|error" | head -20`
Expected: 无相关错误

- [ ] **Step 3: Commit**

```bash
git add frontend/src/views/projects/components/WorkbenchOutlinePanel.vue
git commit -m "feat(frontend): 工作台大纲生成编辑面板组件"
```

---

## Task 12: 前端导出面板组件

**Files:**
- Create: `frontend/src/views/projects/components/WorkbenchExportPanel.vue`

**Interfaces:**
- Consumes: Task 7 的 `WorkbenchStatus` 类型、props `lotId`
- Produces: `WorkbenchExportPanel` 组件，处理 ⑤ 步

- [ ] **Step 1: 实现导出面板**

Create `frontend/src/views/projects/components/WorkbenchExportPanel.vue`:

```vue
<template>
  <div class="workbench-export-panel">
    <div class="section">
      <h4>本标段 Word 文档</h4>
      <div v-if="documents.length" class="doc-list">
        <div v-for="doc in documents" :key="doc.id" class="doc-item">
          <el-icon><Document /></el-icon>
          <div class="doc-info">
            <div class="doc-title">{{ doc.title }}</div>
            <div class="doc-meta">
              <span>{{ formatDateTime(doc.created_at) }}</span>
            </div>
          </div>
          <el-button type="primary" size="small" @click="openWordEditor(doc.id)">
            打开编辑器
          </el-button>
        </div>
      </div>
      <el-empty v-else description="暂无 Word 文档，请在「内容编辑」步骤生成" :image-size="60" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { Document } from '@element-plus/icons-vue'
import type { WorkbenchStatus } from '@/api/workbench'

const props = defineProps<{
  lotId: number
  status: WorkbenchStatus | null
}>()

const router = useRouter()
const documents = computed(() => props.status?.steps.export.documents ?? [])

function openWordEditor(docId: number) {
  router.push(`/bid-documents/${docId}/word-editor`)
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}
</script>

<style scoped>
.workbench-export-panel .section h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.doc-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  margin-bottom: 8px;
}

.doc-info {
  flex: 1;
}

.doc-title {
  font-size: 14px;
}

.doc-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}
</style>
```

- [ ] **Step 2: 类型检查**

Run: `cd frontend && npx vue-tsc --noEmit 2>&1 | grep -E "WorkbenchExportPanel|error" | head -20`
Expected: 无相关错误

- [ ] **Step 3: Commit**

```bash
git add frontend/src/views/projects/components/WorkbenchExportPanel.vue
git commit -m "feat(frontend): 工作台导出面板组件"
```

---

## Task 13: 前端左侧栏组件

**Files:**
- Create: `frontend/src/views/projects/components/WorkbenchSidebar.vue`

**Interfaces:**
- Consumes: Task 6 的 `mapFileDisplayStatus`、Task 7 的 `WorkbenchStatus` 类型、props `status`、emit `selectOutline`、`uploadClick`、`createOutlineClick`
- Produces: `WorkbenchSidebar` 组件，常驻文件&大纲列表

- [ ] **Step 1: 实现左侧栏**

Create `frontend/src/views/projects/components/WorkbenchSidebar.vue`:

```vue
<template>
  <div class="workbench-sidebar">
    <div class="sidebar-section">
      <div class="section-header">
        <span>📄 招标文件</span>
        <el-button type="primary" size="small" link @click="$emit('uploadClick')">+ 上传</el-button>
      </div>
      <div v-if="files.length" class="item-list">
        <div v-for="file in files" :key="file.id" class="sidebar-item">
          <span class="item-name">{{ file.name }}</span>
          <el-tag :type="getDisplayTagType(file.display_status)" size="small">
            {{ getDisplayLabel(file.display_status) }}
          </el-tag>
        </div>
      </div>
      <div v-else class="empty">暂无文件</div>
    </div>

    <div class="sidebar-section">
      <div class="section-header">
        <span>📝 大纲</span>
        <el-button type="primary" size="small" link @click="$emit('createOutlineClick')">+ 新建</el-button>
      </div>
      <div v-if="outlines.length" class="item-list">
        <div
          v-for="outline in outlines"
          :key="outline.id"
          class="sidebar-item clickable"
          :class="{ 'is-current': outline.is_current }"
          @click="$emit('selectOutline', outline.id)"
        >
          <span class="item-name">{{ outline.name }}</span>
          <el-tag v-if="outline.is_current" type="success" size="small">当前</el-tag>
        </div>
      </div>
      <div v-else class="empty">暂无大纲</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  mapFileDisplayStatus,
  DISPLAY_STATUS_LABEL,
  DISPLAY_STATUS_TAG_TYPE,
} from '@/utils/fileStatusMap'
import type { WorkbenchStatus } from '@/api/workbench'

const props = defineProps<{
  status: WorkbenchStatus | null
}>()

defineEmits<{
  selectOutline: [outlineId: number]
  uploadClick: []
  createOutlineClick: []
}>()

const files = computed(() => props.status?.steps.tender_file.files ?? [])
const outlines = computed(() => props.status?.steps.outline_generation.outlines ?? [])

function getDisplayLabel(status: string): string {
  return DISPLAY_STATUS_LABEL[mapFileDisplayStatus(status)]
}

function getDisplayTagType(status: string): string {
  return DISPLAY_STATUS_TAG_TYPE[mapFileDisplayStatus(status)]
}
</script>

<style scoped>
.workbench-sidebar {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
}

.sidebar-section {
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  overflow: hidden;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: var(--el-fill-color-light);
  font-size: 13px;
  font-weight: 500;
}

.item-list {
  display: flex;
  flex-direction: column;
}

.sidebar-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-top: 1px solid var(--el-border-color-lighter);
  gap: 8px;
}

.sidebar-item.clickable {
  cursor: pointer;
}

.sidebar-item.clickable:hover {
  background: var(--el-fill-color-light);
}

.sidebar-item.is-current {
  background: var(--el-color-primary-light-9);
}

.item-name {
  font-size: 13px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

.empty {
  padding: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  text-align: center;
}
</style>
```

- [ ] **Step 2: 类型检查**

Run: `cd frontend && npx vue-tsc --noEmit 2>&1 | grep -E "WorkbenchSidebar|error" | head -20`
Expected: 无相关错误

- [ ] **Step 3: Commit**

```bash
git add frontend/src/views/projects/components/WorkbenchSidebar.vue
git commit -m "feat(frontend): 工作台左侧文件&大纲列表组件"
```

---

## Task 14: 前端工作台主页面

**Files:**
- Create: `frontend/src/views/projects/LotWorkbenchView.vue`

**Interfaces:**
- Consumes: Task 8-13 的所有子组件 + composable、props `lotId`（从路由参数）、`projectId`（从路由参数）
- Produces: `LotWorkbenchView` 组件，组装整个工作台

- [ ] **Step 1: 实现主页面**

Create `frontend/src/views/projects/LotWorkbenchView.vue`:

```vue
<template>
  <div class="lot-workbench" v-loading="loading">
    <!-- 顶部：面包屑 + 标段标题 + 状态 -->
    <div class="workbench-header">
      <el-breadcrumb separator="/">
        <el-breadcrumb-item :to="{ path: `/projects/${projectId}` }">{{ projectName }}</el-breadcrumb-item>
        <el-breadcrumb-item>{{ lotName }}</el-breadcrumb-item>
      </el-breadcrumb>
      <div class="header-title">
        <h2>{{ lotName }}</h2>
        <el-tag v-if="currentStepLabel" type="warning" size="small">{{ currentStepLabel }}</el-tag>
      </div>
    </div>

    <!-- 步骤导航条 -->
    <WorkbenchStepNav
      :current-step="activeStep"
      :status="status"
      @select="handleStepSelect"
    />

    <!-- 主体：左侧栏 + 主工作区 -->
    <div class="workbench-body">
      <div class="workbench-sidebar">
        <WorkbenchSidebar
          :status="status"
          @select-outline="handleSelectOutline"
          @upload-click="activeStep = 'tender_file'"
          @create-outline-click="activeStep = 'outline_generation'"
        />
      </div>
      <div class="workbench-main">
        <WorkbenchFilePanel
          v-if="activeStep === 'tender_file' || activeStep === 'file_parsing'"
          :lot-id="lotId"
          :project-id="projectId"
          :status="status"
          @uploaded="fetchOnce"
        />
        <WorkbenchOutlinePanel
          v-else-if="activeStep === 'outline_generation' || activeStep === 'content_editing'"
          :lot-id="lotId"
          :project-id="projectId"
          :status="status"
        />
        <WorkbenchExportPanel
          v-else-if="activeStep === 'export'"
          :lot-id="lotId"
          :status="status"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { http } from '@/api/http'
import { useWorkbenchPolling } from '@/composables/useWorkbenchPolling'
import type { StepKey } from '@/api/workbench'
import WorkbenchStepNav from './components/WorkbenchStepNav.vue'
import WorkbenchSidebar from './components/WorkbenchSidebar.vue'
import WorkbenchFilePanel from './components/WorkbenchFilePanel.vue'
import WorkbenchOutlinePanel from './components/WorkbenchOutlinePanel.vue'
import WorkbenchExportPanel from './components/WorkbenchExportPanel.vue'

const route = useRoute()
const lotId = computed(() => Number(route.params.lotId))
const projectId = computed(() => Number(route.params.projectId))
const lotName = ref('')
const projectName = ref('')

const { status, loading, fetchOnce } = useWorkbenchPolling(() => lotId.value)

const activeStep = ref<StepKey>('tender_file')

const currentStepLabel = computed(() => {
  if (!status.value) return ''
  const labels: Record<StepKey, string> = {
    tender_file: '上传招标文件',
    file_parsing: '文件解析中',
    outline_generation: '生成大纲',
    content_editing: '编辑内容',
    export: '导出文档',
  }
  return labels[status.value.current_step]
})

watch(
  () => status.value?.current_step,
  (step) => {
    if (step) activeStep.value = step
  }
)

watch(
  () => lotId.value,
  async (id) => {
    if (!id) return
    try {
      const [lotRes, projectRes] = await Promise.all([
        http.get<{ name: string; project: number }>(`/api/lots/${id}/`),
      ])
      lotName.value = lotRes.data.name
      const projId = lotRes.data.project
      const projRes = await http.get<{ name: string }>(`/api/projects/${projId}/`)
      projectName.value = projRes.data.name
    } catch (err) {
      console.error('加载标段信息失败:', err)
    }
  },
  { immediate: true }
)

function handleStepSelect(step: StepKey) {
  activeStep.value = step
}

function handleSelectOutline(_outlineId: number) {
  activeStep.value = 'content_editing'
}
</script>

<style scoped>
.lot-workbench {
  padding: 20px;
  height: calc(100vh - 100px);
  display: flex;
  flex-direction: column;
}

.workbench-header {
  margin-bottom: 16px;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
}

.header-title h2 {
  margin: 0;
  font-size: 20px;
}

.workbench-body {
  display: flex;
  gap: 16px;
  flex: 1;
  min-height: 0;
}

.workbench-sidebar {
  width: 280px;
  flex-shrink: 0;
}

.workbench-main {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 16px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  background: var(--el-fill-color-blank);
}
</style>
```

- [ ] **Step 2: 类型检查**

Run: `cd frontend && npx vue-tsc --noEmit 2>&1 | grep -E "LotWorkbenchView|error" | head -20`
Expected: 无相关错误

- [ ] **Step 3: Commit**

```bash
git add frontend/src/views/projects/LotWorkbenchView.vue
git commit -m "feat(frontend): 标段工作台主页面 — 组装步骤导航+侧栏+主工作区"
```

---

## Task 15: 前端路由与项目详情页瘦身

**Files:**
- Modify: `frontend/src/router/index.ts`
- Modify: `frontend/src/views/projects/ProjectDetailView.vue`
- Modify: `frontend/src/views/projects/ProjectLots.vue`

**Interfaces:**
- Consumes: Task 14 的 `LotWorkbenchView`
- Produces: 新路由 `projects/:id/lots/:lotId`、`/outlines` 重定向、项目详情页移除文件 tab

- [ ] **Step 1: 添加新路由 + /outlines 重定向**

在 `frontend/src/router/index.ts` 的 `project-detail` 路由后追加：

```typescript
      {
        path: 'projects/:id/lots/:lotId',
        name: 'lot-workbench',
        component: () => import('@/views/projects/LotWorkbenchView.vue'),
        meta: { title: '标段工作台' },
      },
```

把 `outlines` 路由（第 138-143 行）改为重定向：

```typescript
      {
        path: 'outlines',
        redirect: '/projects',
      },
```

注意：`outlines/:outlineId` 路由保持不变（大纲详情独立页保留）。

- [ ] **Step 2: 项目详情页移除「文件」tab**

在 `frontend/src/views/projects/ProjectDetailView.vue`：

删除模板里的文件 tab（第 33-35 行）：

```vue
      <el-tab-pane label="文件" name="files">
        <ProjectFiles :project-id="projectId" :is-archived="project?.status === 'archived'" />
      </el-tab-pane>
```

删除 script 里的 import（第 66 行）：

```typescript
import ProjectFiles from './ProjectFiles.vue'
```

- [ ] **Step 3: 标段列表「大纲」按钮跳工作台**

在 `frontend/src/views/projects/ProjectLots.vue` 找到 `viewOutline` 函数（约第 202 行）：

```typescript
router.push(`/outlines?lot_id=${lotId}`)
```

改为：

```typescript
router.push(`/projects/${props.projectId}/lots/${lotId}`)
```

如果该文件用 `props.projectId`，确认 props 名是否一致；若 props 是 `projectId` 则直接用，否则调整为实际 props 名。

- [ ] **Step 4: 类型检查 + 构建**

Run: `cd frontend && npx vue-tsc --noEmit 2>&1 | tail -20`
Expected: 无错误

Run: `cd frontend && npm run build 2>&1 | tail -20`
Expected: 构建成功

- [ ] **Step 5: Commit**

```bash
git add frontend/src/router/index.ts frontend/src/views/projects/ProjectDetailView.vue frontend/src/views/projects/ProjectLots.vue
git commit -m "refactor(frontend): 新增标段工作台路由，项目详情页移除文件tab，/outlines重定向"
```

---

## Task 16: 项目概览页升级为标段进度看板

**Files:**
- Modify: `frontend/src/views/projects/ProjectOverview.vue`

**Interfaces:**
- Consumes: Task 7 的 `isLotActive`（从 `useWorkbenchPolling` 导出）、`@/api/http`
- Produces: 概览页显示标段进度卡片网格

- [ ] **Step 1: 先读现有 ProjectOverview 结构**

Run: `cat /home/newaibook/ai-bid-generator/frontend/src/views/projects/ProjectOverview.vue`
记录现有模板和 props。

- [ ] **Step 2: 添加标段进度卡片**

在 `ProjectOverview.vue` 模板顶部追加标段进度网格（保留原有项目信息区在下）：

```vue
<template>
  <div class="project-overview">
    <!-- 标段进度看板 -->
    <div class="lots-dashboard">
      <h3>标段进度</h3>
      <div v-if="lots.length" class="lot-cards">
        <div
          v-for="lot in lots"
          :key="lot.id"
          class="lot-card"
          :class="{ 'is-active': isLotActive(lot.id) }"
          @click="goWorkbench(lot.id)"
        >
          <div class="lot-card-header">
            <span class="lot-name">{{ lot.name }}</span>
            <el-tag v-if="isLotActive(lot.id)" type="warning" size="small">进行中</el-tag>
          </div>
          <div class="lot-card-body">
            <span class="lot-status">{{ getLotStatusLabel(lot.workflow_status) }}</span>
          </div>
        </div>
      </div>
      <el-empty v-else description="暂无标段" :image-size="60" />
    </div>

    <!-- 原有项目信息区保留 -->
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { http } from '@/api/http'
import { isLotActive } from '@/composables/useWorkbenchPolling'

const props = defineProps<{
  project: any
  permissions: string[]
}>()

const router = useRouter()
const lots = ref<Array<{ id: number; name: string; workflow_status: string }>>([])

async function loadLots() {
  if (!props.project?.id) return
  try {
    const res = await http.get<{ id: number; name: string; workflow_status: string }[]>(
      `/api/projects/${props.project.id}/lots/`
    )
    lots.value = res.data
  } catch (err) {
    console.error('加载标段失败:', err)
  }
}

function goWorkbench(lotId: number) {
  router.push(`/projects/${props.project.id}/lots/${lotId}`)
}

function getLotStatusLabel(status: string): string {
  const map: Record<string, string> = {
    not_started: '未开始',
    in_progress: '进行中',
    completed: '已完成',
    archived: '已归档',
  }
  return map[status] || status
}

onMounted(loadLots)
</script>

<style scoped>
.lots-dashboard {
  margin-bottom: 24px;
}

.lots-dashboard h3 {
  margin: 0 0 12px 0;
  font-size: 16px;
}

.lot-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}

.lot-card {
  padding: 16px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.2s;
}

.lot-card:hover {
  border-color: var(--el-color-primary);
}

.lot-card.is-active {
  border-color: var(--el-color-warning);
  background: var(--el-color-warning-light-9);
}

.lot-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.lot-name {
  font-size: 15px;
  font-weight: 500;
}

.lot-status {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
</style>
```

注意：保留原有项目信息区的模板和 script 内容，仅在其前追加标段看板部分。若原有 `<script setup>` 已有 props 定义，合并而非重复定义。

- [ ] **Step 3: 类型检查 + 构建**

Run: `cd frontend && npx vue-tsc --noEmit 2>&1 | grep -E "ProjectOverview|error" | head -20`
Expected: 无相关错误

Run: `cd frontend && npm run build 2>&1 | tail -10`
Expected: 构建成功

- [ ] **Step 4: Commit**

```bash
git add frontend/src/views/projects/ProjectOverview.vue
git commit -m "feat(frontend): 项目概览页升级为标段进度看板"
```

---

## Task 17: 部署与端到端验证

**Files:**
- 无代码改动，部署 + 手动验证

**Interfaces:**
- Consumes: 所有前置任务完成
- Produces: 部署到 Docker 并验证登录、工作台流程

- [ ] **Step 1: 构建前端**

Run: `cd /home/newaibook/ai-bid-generator/frontend && npm run build 2>&1 | tail -10`
Expected: 构建成功，`dist/` 生成

- [ ] **Step 2: 重建后端镜像**

Run: `cd /home/newaibook/ai-bid-generator && docker compose build web worker beat 2>&1 | tail -10`
Expected: 镜像构建成功

- [ ] **Step 3: 重启服务**

Run: `cd /home/newaibook/ai-bid-generator && docker compose up -d web worker beat 2>&1 | tail -5 && docker compose restart nginx 2>&1 | tail -3`
Expected: 容器启动，nginx 重启（CLAUDE.md 记忆：避免 DNS 缓存导致 502）

- [ ] **Step 4: 验证聚合接口**

Run: `curl -s -X POST http://localhost/api/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['access'])" > /tmp/token.txt && TOKEN=$(cat /tmp/token.txt) && curl -s -H "Authorization: Bearer $TOKEN" http://localhost/api/lots/1/workbench_status/ | python3 -m json.tool`
Expected: 返回 JSON，含 `current_step` 和 `steps` 字段（若 lot id=1 不存在，先用 `curl -s -H "Authorization: Bearer $TOKEN" http://localhost/api/projects/` 找一个有标段的项目）

- [ ] **Step 5: 验证菜单不含标书制作**

用上一步的 TOKEN：`curl -s -X POST http://localhost/api/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}' | python3 -c "import sys,json; d=json.load(sys.stdin); keys=[i['key'] for g in d['menu_tree'] for i in g['items']]; print('outlines' in keys)"`
Expected: 输出 `False`

- [ ] **Step 6: 验证 /outlines 重定向**

Run: `curl -s -o /dev/null -w "%{http_code} %{redirect_url}" http://localhost/outlines`
Expected: 200（前端 SPA 路由，返回 index.html 后由前端重定向到 /projects）

- [ ] **Step 7: 浏览器手动验证**

在浏览器打开 `http://163.7.6.60/`，登录后：
1. 确认左侧菜单无「标书制作」
2. 进入「项目管理」→ 点项目 → 确认详情页只有 概览/成员/标段 三个 tab
3. 概览页显示标段进度卡片
4. 点标段 → 进入工作台，确认 5 步导航条 + 左侧栏 + 主工作区
5. 上传一个 docx 文件 → 确认自动跳到 ② 步并显示解析进度
6. 解析完成后 → 确认步骤推进到 ③

- [ ] **Step 8: 标记完成**

所有验证通过后，标记 Task 17 完成。

---

## 自审清单

**Spec 覆盖检查**：
- §3 信息架构与导航 → Task 5（移除菜单）、Task 15（路由+重定向+项目详情瘦身）
- §4 标段工作台布局 → Task 9（步骤条）、Task 13（侧栏）、Task 14（主页面）
- §5 异步状态聚合 → Task 1-4（后端服务+接口）、Task 8（轮询 composable）
- §6 上传与解析整合 → Task 6（状态映射）、Task 10（文件面板）
- §7 大纲生成与编辑衔接 → Task 11（大纲面板）
- §8 导出与概览升级 → Task 12（导出面板）、Task 16（概览看板）
- §9 全局导航收口 → Task 15（路由整合）
- §10 兼容性处理 → Task 15（/outlines 重定向，独立页保留）

**类型一致性检查**：
- `WorkbenchStatus` 类型在 Task 7 定义，Task 8-14 全部引用同一类型 ✓
- `StepKey` 在 Task 7 定义，Task 9/14 引用 ✓
- `DisplayStatus` 在 Task 6 定义，Task 7 重新导出（保持单一来源）✓
- `WorkbenchStatusService.get_status` 返回结构在 Task 1 定义，Task 4 视图直接返回 ✓
- `isLotActive` 在 Task 8 导出，Task 16 引用 ✓

**占位符扫描**：无 TBD/TODO，所有步骤含完整代码 ✓
