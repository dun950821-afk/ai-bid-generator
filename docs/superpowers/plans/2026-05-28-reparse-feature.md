# 重新解析功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为项目详情页添加重新解析功能，支持已解析文件的重新解析、版本管理和版本切换。

**Architecture:** 扩展现有 `TenderFileRetryParseView` 为通用的 `reparse` API，新增 `parse_versions` 和 `activate_version` API，前端在文件列表和解析详情页添加相应按钮和版本选择功能。

**Tech Stack:** Django DRF, Vue 3, Element Plus, TypeScript

---

## 文件清单

### 后端文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/apps/tender/views.py` | 修改 | 添加 reparse、parse_versions、activate_version 接口 |
| `backend/apps/tender/urls.py` | 修改 | 添加新路由 |
| `backend/apps/tender/tests/test_reparse_api.py` | 创建 | 接口测试 |

### 前端文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/api/tender.ts` | 修改 | 添加 reparseTenderFile、getParseVersions、activateParseVersion 函数 |
| `frontend/src/views/projects/ProjectFiles.vue` | 修改 | 扩展按钮显示逻辑、添加确认弹窗 |
| `frontend/src/views/tender/ParsedDocumentView.vue` | 修改 | 添加工具栏、版本选择、重新解析按钮 |

---

## Task 1: 后端 - 添加 reparse API

**Files:**
- Modify: `backend/apps/tender/views.py:128-166`
- Test: `backend/apps/tender/tests/test_reparse_api.py`

- [ ] **Step 1: 编写 reparse API 测试**

```python
# backend/apps/tender/tests/test_reparse_api.py
"""重新解析 API 测试。"""

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from apps.projects.models import Project, ProjectRole
from apps.tender.models import TenderFile, ParsedDocument
from apps.accounts.services.role_service import RoleService

User = get_user_model()


@pytest.fixture
def setup_data(db):
    """测试数据准备。"""
    user = User.objects.create_user(username="testuser", password="testpass")
    project = Project.objects.create(name="测试项目", created_by=user)
    roles = RoleService.initialize_builtin_roles(project)
    editor_role = next(r for r in roles if r.code == "editor")

    from apps.projects.models import ProjectMember
    ProjectMember.objects.create(project=project, user=user, project_role=editor_role)

    return {"user": user, "project": project}


@pytest.fixture
def client(setup_data):
    """认证客户端。"""
    c = APIClient()
    c.force_authenticate(user=setup_data["user"])
    return c


@pytest.mark.django_db
def test_reparse_allowed_for_parsed_status(client, setup_data):
    """已解析状态允许重新解析。"""
    project = setup_data["project"]

    tender_file = TenderFile.objects.create(
        project=project,
        original_name="test.pdf",
        file_size=1024,
        object_key="test/test.pdf",
        status="parsed",
        created_by=setup_data["user"],
    )

    ParsedDocument.objects.create(
        tender_file=tender_file,
        is_active=True,
        page_count=10,
        parse_engine="mock",
        parser_version="v1",
    )

    response = client.post(f"/api/tender/files/{tender_file.id}/reparse/")

    assert response.status_code == 200
    assert response.data["status"] == "parsing"

    tender_file.refresh_from_db()
    assert tender_file.status == "parsing"


@pytest.mark.django_db
def test_reparse_blocked_for_parsing_status(client, setup_data):
    """解析中状态禁止重新解析。"""
    project = setup_data["project"]

    tender_file = TenderFile.objects.create(
        project=project,
        original_name="test.pdf",
        file_size=1024,
        object_key="test/test.pdf",
        status="parsing",
        created_by=setup_data["user"],
    )

    response = client.post(f"/api/tender/files/{tender_file.id}/reparse/")

    assert response.status_code == 400
    assert "正在处理中" in response.data["message"]


@pytest.mark.django_db
def test_reparse_blocked_for_uploading_status(client, setup_data):
    """上传中状态禁止重新解析。"""
    project = setup_data["project"]

    tender_file = TenderFile.objects.create(
        project=project,
        original_name="test.pdf",
        file_size=1024,
        object_key="test/test.pdf",
        status="uploading",
        created_by=setup_data["user"],
    )

    response = client.post(f"/api/tender/files/{tender_file.id}/reparse/")

    assert response.status_code == 400
    assert "不支持重新解析" in response.data["message"]
```

- [ ] **Step 2: 运行测试验证失败**

```bash
cd /home/newaibook/ai-bid-generator/backend && docker exec -w /app ai-bid-generator-web-1 python -m pytest apps/tender/tests/test_reparse_api.py -v 2>&1 | head -30
```

Expected: 测试失败，提示 404 或路由不存在

- [ ] **Step 3: 在 views.py 中添加 TenderFileReparseView**

在 `backend/apps/tender/views.py` 文件末尾添加：

```python
class TenderFileReparseView(APIView):
    """重新解析文件。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "tender.upload"
    required_scope = "project"

    # 允许重新解析的状态
    ALLOWED_STATUSES = [
        TenderFile.STATUS_PARSED,
        TenderFile.STATUS_CHUNKED,
        TenderFile.STATUS_READY,
        TenderFile.STATUS_PARSE_FAILED,
    ]

    # 禁止重复触发的状态
    RUNNING_STATUSES = [
        TenderFile.STATUS_PARSING,
        "chunking",
        "processing",
    ]

    def get_permission_project(self, request):
        tender_file = TenderFile.objects.filter(pk=self.kwargs.get("file_id")).first()
        return tender_file.project if tender_file else None

    def post(self, request, file_id):
        from django.db import transaction
        from apps.audit.models import OperationLog

        with transaction.atomic():
            # 锁定记录防并发
            try:
                tender_file = TenderFile.objects.select_for_update().get(pk=file_id)
            except TenderFile.DoesNotExist as exc:
                raise NotFound(message="文件不存在") from exc

            # 禁止处理中的文件重复触发
            if tender_file.status in self.RUNNING_STATUSES:
                return Response(
                    {"message": "文件正在处理中，请勿重复触发重新解析"},
                    status=400,
                )

            # 仅允许已解析过的文件
            if tender_file.status not in self.ALLOWED_STATUSES:
                return Response(
                    {"message": "该文件状态不支持重新解析"},
                    status=400,
                )

            # 记录旧版本 ID
            old_doc = ParsedDocument.objects.filter(
                tender_file=tender_file, is_active=True
            ).first()
            old_doc_id = old_doc.id if old_doc else None

            # 更新状态为解析中
            tender_file.status = TenderFile.STATUS_PARSING
            tender_file.error_message = ""
            tender_file.save(update_fields=["status", "error_message", "updated_at"])

            # 创建解析任务
            from apps.common.models import AsyncTask
            from apps.tender.tasks import parse_tender_file

            task = AsyncTask.objects.create(
                task_type="tender_parse",
                status=AsyncTask.STATUS_PENDING,
            )
            tender_file.parse_task = task
            tender_file.save(update_fields=["parse_task", "updated_at"])

            # 记录审计日志
            OperationLog.objects.create(
                actor=request.user,
                action="tender.reparse",
                target_type="TenderFile",
                target_id=str(tender_file.id),
                summary=f"重新解析文件: {tender_file.original_name}",
                extra={"old_active_parsed_document_id": old_doc_id},
            )

        # 触发 Celery 任务（事务外）
        parse_tender_file.delay(task.id, tender_file.id)

        return Response({
            "message": "已提交重新解析任务",
            "file_id": tender_file.id,
            "status": "parsing",
            "task_id": task.id,
        })
```

- [ ] **Step 4: 在 urls.py 中添加路由**

修改 `backend/apps/tender/urls.py`：

```python
# 在 imports 中添加
from apps.tender.views import (
    # ... 现有 imports ...
    TenderFileReparseView,
)

# 在 urlpatterns 中添加（替换原有的 retry-parse 路由）
    # 文件管理
    path("tender/files", TenderFileListView.as_view(), name="tender-file-list"),
    path("tender/files/<int:pk>", TenderFileDetailView.as_view(), name="tender-file-detail"),
    path("tender/files/<int:file_id>/reparse", TenderFileReparseView.as_view(), name="tender-reparse"),
```

同时删除原有的 `TenderFileRetryParseView` 路由和视图引用。

- [ ] **Step 5: 运行测试验证通过**

```bash
cd /home/newaibook/ai-bid-generator/backend && docker exec -w /app ai-bid-generator-web-1 python -m pytest apps/tender/tests/test_reparse_api.py -v
```

Expected: 所有测试通过

- [ ] **Step 6: 提交代码**

```bash
git add backend/apps/tender/views.py backend/apps/tender/urls.py backend/apps/tender/tests/test_reparse_api.py
git commit -m "feat(tender): add reparse API with status validation and concurrency control

- Add TenderFileReparseView to replace TenderFileRetryParseView
- Support reparse for parsed, chunked, ready, parse_failed statuses
- Block reparse for parsing, chunking, processing statuses
- Use select_for_update for concurrency control
- Record operation log for audit trail

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: 后端 - 添加 parse_versions API

**Files:**
- Modify: `backend/apps/tender/views.py`
- Modify: `backend/apps/tender/urls.py`
- Test: `backend/apps/tender/tests/test_reparse_api.py`

- [ ] **Step 1: 添加 parse_versions 测试**

在 `backend/apps/tender/tests/test_reparse_api.py` 末尾添加：

```python
@pytest.mark.django_db
def test_parse_versions_list(client, setup_data):
    """获取解析版本列表。"""
    project = setup_data["project"]

    tender_file = TenderFile.objects.create(
        project=project,
        original_name="test.pdf",
        file_size=1024,
        object_key="test/test.pdf",
        status="parsed",
        created_by=setup_data["user"],
    )

    # 创建两个版本
    ParsedDocument.objects.create(
        tender_file=tender_file,
        is_active=False,
        page_count=10,
        parse_engine="mock",
        parser_version="v1",
    )

    ParsedDocument.objects.create(
        tender_file=tender_file,
        is_active=True,
        page_count=12,
        parse_engine="mock",
        parser_version="v1",
    )

    response = client.get(f"/api/tender/files/{tender_file.id}/parse-versions/")

    assert response.status_code == 200
    assert len(response.data["results"]) == 2
    # 最新版本在前
    assert response.data["results"][0]["is_active"] is True
    assert response.data["results"][0]["page_count"] == 12
```

- [ ] **Step 2: 运行测试验证失败**

```bash
cd /home/newaibook/ai-bid-generator/backend && docker exec -w /app ai-bid-generator-web-1 python -m pytest apps/tender/tests/test_reparse_api.py::test_parse_versions_list -v
```

Expected: 测试失败，提示 404

- [ ] **Step 3: 在 views.py 中添加 TenderFileParseVersionsView**

在 `backend/apps/tender/views.py` 末尾添加：

```python
class TenderFileParseVersionsView(APIView):
    """获取文件的解析版本列表。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "tender.view"
    required_scope = "project"

    def get_permission_project(self, request):
        tender_file = TenderFile.objects.filter(pk=self.kwargs.get("file_id")).first()
        return tender_file.project if tender_file else None

    def get(self, request, file_id):
        try:
            tender_file = TenderFile.objects.get(pk=file_id)
        except TenderFile.DoesNotExist as exc:
            raise NotFound(message="文件不存在") from exc

        versions = (
            ParsedDocument.objects.filter(tender_file=tender_file)
            .annotate(chunk_count=Count("chunks"))
            .order_by("-created_at")
            .values(
                "id",
                "parser_version",
                "parse_engine",
                "parse_quality",
                "page_count",
                "chunk_count",
                "is_active",
                "created_at",
                "error_message",
            )
        )

        return Response({"results": list(versions)})
```

- [ ] **Step 4: 在 urls.py 中添加路由**

在 `backend/apps/tender/urls.py` 的 urlpatterns 中添加：

```python
    # 解析版本
    path("tender/files/<int:file_id>/parse-versions", TenderFileParseVersionsView.as_view(), name="tender-parse-versions"),
```

并在 imports 中添加 `TenderFileParseVersionsView`。

- [ ] **Step 5: 运行测试验证通过**

```bash
cd /home/newaibook/ai-bid-generator/backend && docker exec -w /app ai-bid-generator-web-1 python -m pytest apps/tender/tests/test_reparse_api.py::test_parse_versions_list -v
```

Expected: 测试通过

- [ ] **Step 6: 提交代码**

```bash
git add backend/apps/tender/views.py backend/apps/tender/urls.py backend/apps/tender/tests/test_reparse_api.py
git commit -m "feat(tender): add parse_versions API for version history

- Add TenderFileParseVersionsView to list all parsed document versions
- Return chunk_count via annotation
- Order by created_at descending

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: 后端 - 添加 activate_version API

**Files:**
- Modify: `backend/apps/tender/views.py`
- Modify: `backend/apps/tender/urls.py`
- Test: `backend/apps/tender/tests/test_reparse_api.py`

- [ ] **Step 1: 添加 activate_version 测试**

在 `backend/apps/tender/tests/test_reparse_api.py` 末尾添加：

```python
@pytest.mark.django_db
def test_activate_version_success(client, setup_data):
    """激活历史版本成功。"""
    project = setup_data["project"]

    tender_file = TenderFile.objects.create(
        project=project,
        original_name="test.pdf",
        file_size=1024,
        object_key="test/test.pdf",
        status="chunked",
        created_by=setup_data["user"],
    )

    old_doc = ParsedDocument.objects.create(
        tender_file=tender_file,
        is_active=False,
        page_count=10,
        parse_engine="mock",
        parser_version="v1",
    )

    ParsedDocument.objects.create(
        tender_file=tender_file,
        is_active=True,
        page_count=12,
        parse_engine="mock",
        parser_version="v1",
    )

    response = client.post(
        f"/api/tender/files/{tender_file.id}/parse-versions/{old_doc.id}/activate/"
    )

    assert response.status_code == 200
    assert "已切换" in response.data["message"]

    # 验证版本切换
    old_doc.refresh_from_db()
    assert old_doc.is_active is True

    new_active_count = ParsedDocument.objects.filter(
        tender_file=tender_file, is_active=True
    ).count()
    assert new_active_count == 1


@pytest.mark.django_db
def test_activate_version_blocked_for_parsing(client, setup_data):
    """解析中禁止切换版本。"""
    project = setup_data["project"]

    tender_file = TenderFile.objects.create(
        project=project,
        original_name="test.pdf",
        file_size=1024,
        object_key="test/test.pdf",
        status="parsing",
        created_by=setup_data["user"],
    )

    old_doc = ParsedDocument.objects.create(
        tender_file=tender_file,
        is_active=False,
        page_count=10,
        parse_engine="mock",
        parser_version="v1",
    )

    response = client.post(
        f"/api/tender/files/{tender_file.id}/parse-versions/{old_doc.id}/activate/"
    )

    assert response.status_code == 400
    assert "正在处理中" in response.data["message"]
```

- [ ] **Step 2: 运行测试验证失败**

```bash
cd /home/newaibook/ai-bid-generator/backend && docker exec -w /app ai-bid-generator-web-1 python -m pytest apps/tender/tests/test_reparse_api.py::test_activate_version_success -v
```

Expected: 测试失败，提示 404

- [ ] **Step 3: 在 views.py 中添加 TenderFileActivateVersionView**

在 `backend/apps/tender/views.py` 末尾添加：

```python
class TenderFileActivateVersionView(APIView):
    """激活历史解析版本。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "tender.upload"
    required_scope = "project"

    # 禁止切换的状态
    RUNNING_STATUSES = [
        TenderFile.STATUS_PARSING,
        "chunking",
        "processing",
    ]

    def get_permission_project(self, request):
        tender_file = TenderFile.objects.filter(pk=self.kwargs.get("file_id")).first()
        return tender_file.project if tender_file else None

    def post(self, request, file_id, version_id):
        from django.db import transaction
        from apps.audit.models import OperationLog

        with transaction.atomic():
            # 锁定记录
            try:
                tender_file = TenderFile.objects.select_for_update().get(pk=file_id)
            except TenderFile.DoesNotExist as exc:
                raise NotFound(message="文件不存在") from exc

            # 禁止处理中的文件切换版本
            if tender_file.status in self.RUNNING_STATUSES:
                return Response(
                    {"message": "文件正在处理中，不能切换解析版本"},
                    status=400,
                )

            # 验证目标版本
            try:
                target_doc = ParsedDocument.objects.get(
                    id=version_id,
                    tender_file=tender_file,
                )
            except ParsedDocument.DoesNotExist as exc:
                raise NotFound(message="版本不存在") from exc

            # 切换活跃版本
            ParsedDocument.objects.filter(tender_file=tender_file).update(is_active=False)
            target_doc.is_active = True
            target_doc.save(update_fields=["is_active"])

            # 更新文件状态（不设为 requirement_extracted）
            tender_file.status = TenderFile.STATUS_CHUNKED
            tender_file.save(update_fields=["status", "updated_at"])

            # 记录审计日志
            OperationLog.objects.create(
                actor=request.user,
                action="tender.activate_version",
                target_type="ParsedDocument",
                target_id=str(target_doc.id),
                summary=f"切换解析版本: {tender_file.original_name}",
            )

        return Response({"message": "已切换到该版本"})
```

- [ ] **Step 4: 在 urls.py 中添加路由**

在 `backend/apps/tender/urls.py` 的 urlpatterns 中添加：

```python
    # 解析版本
    path("tender/files/<int:file_id>/parse-versions", TenderFileParseVersionsView.as_view(), name="tender-parse-versions"),
    path("tender/files/<int:file_id>/parse-versions/<int:version_id>/activate", TenderFileActivateVersionView.as_view(), name="tender-activate-version"),
```

并在 imports 中添加 `TenderFileActivateVersionView`。

- [ ] **Step 5: 运行测试验证通过**

```bash
cd /home/newaibook/ai-bid-generator/backend && docker exec -w /app ai-bid-generator-web-1 python -m pytest apps/tender/tests/test_reparse_api.py -v
```

Expected: 所有测试通过

- [ ] **Step 6: 提交代码**

```bash
git add backend/apps/tender/views.py backend/apps/tender/urls.py backend/apps/tender/tests/test_reparse_api.py
git commit -m "feat(tender): add activate_version API for version switching

- Add TenderFileActivateVersionView to switch active parsed document
- Block switching during parsing, chunking, processing
- Use select_for_update for concurrency control
- Update file status to chunked after switch
- Record operation log for audit trail

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: 前端 - 添加 API 函数

**Files:**
- Modify: `frontend/src/api/tender.ts`

- [ ] **Step 1: 添加类型定义和 API 函数**

在 `frontend/src/api/tender.ts` 文件末尾添加：

```typescript
// ============================================================================
// 解析版本管理
// ============================================================================

export interface ParseVersion {
  id: number
  parser_version: string
  parse_engine: string
  parse_quality: string
  page_count: number
  chunk_count: number
  is_active: boolean
  created_at: string
  error_message: string
}

export interface ReparseResponse {
  message: string
  file_id: number
  status: string
  task_id: number
}

/**
 * 重新解析文件
 */
export function reparseTenderFile(fileId: number) {
  return http.post<ReparseResponse>(`/api/tender/files/${fileId}/reparse/`)
}

/**
 * 获取解析版本列表
 */
export function getParseVersions(fileId: number) {
  return http.get<{ results: ParseVersion[] }>(`/api/tender/files/${fileId}/parse-versions/`)
}

/**
 * 激活历史解析版本
 */
export function activateParseVersion(fileId: number, versionId: number) {
  return http.post<{ message: string }>(
    `/api/tender/files/${fileId}/parse-versions/${versionId}/activate/`
  )
}
```

- [ ] **Step 2: 删除旧的 retryParse 函数**

删除原有的 `retryParse` 函数（第 171-175 行）：

```typescript
// 删除以下代码
export function retryParse(fileId: number) {
  return http.post<{ task_id: number; status: string }>(
    `/api/tender/files/${fileId}/retry-parse`
  )
}
```

- [ ] **Step 3: 更新 ProjectFiles.vue 中的导入**

后续在 Task 5 中更新。

- [ ] **Step 4: 验证 TypeScript 编译**

```bash
cd /home/newaibook/ai-bid-generator/frontend && npm run build 2>&1 | tail -10
```

Expected: 编译成功

- [ ] **Step 5: 提交代码**

```bash
git add frontend/src/api/tender.ts
git commit -m "feat(api): add reparse, parseVersions, activateVersion APIs

- Add ParseVersion and ReparseResponse types
- Add reparseTenderFile, getParseVersions, activateParseVersion functions
- Remove deprecated retryParse function

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5: 前端 - 更新 ProjectFiles.vue

**Files:**
- Modify: `frontend/src/views/projects/ProjectFiles.vue`

- [ ] **Step 1: 更新 imports**

修改 `frontend/src/views/projects/ProjectFiles.vue` 第 167-175 行：

```typescript
import {
  listTenderFiles,
  initUpload,
  postToPresignedForm,
  completeUpload,
  reparseTenderFile,
  deleteTenderFile,
  type TenderFile,
} from '@/api/tender'
```

- [ ] **Step 2: 更新按钮显示逻辑**

修改第 56-91 行的操作列：

```vue
<el-table-column label="操作" width="280" fixed="right">
  <template #default="{ row }">
    <!-- 正在处理中：禁用按钮 -->
    <el-button
      v-if="['parsing', 'chunking', 'processing'].includes(row.status)"
      type="primary"
      size="small"
      disabled
    >
      解析中...
    </el-button>

    <!-- 已解析：显示重新解析按钮 -->
    <el-button
      v-else-if="['parsed', 'chunked', 'ready', 'parse_failed', 'requirement_extracted'].includes(row.status)"
      type="primary"
      size="small"
      @click="handleReparse(row)"
    >
      {{ row.status === 'parse_failed' ? '重试解析' : '重新解析' }}
    </el-button>

    <!-- 查看解析 -->
    <el-button
      v-if="['parsed', 'chunked', 'ready'].includes(row.status)"
      type="primary"
      size="small"
      @click="viewParsedDocument(row)"
    >
      查看解析
    </el-button>

    <!-- 删除 -->
    <el-button
      type="danger"
      size="small"
      @click="handleDelete(row)"
    >
      删除
    </el-button>

    <!-- 查看错误 -->
    <el-button
      v-if="row.error_message"
      type="danger"
      size="small"
      link
      @click="showError(row)"
    >
      查看错误
    </el-button>
  </template>
</el-table-column>
```

- [ ] **Step 3: 添加 handleReparse 函数**

在第 298-307 行的 `handleRetryParse` 函数位置替换为：

```typescript
// 重新解析
async function handleReparse(file: TenderFile) {
  const message = '重新解析将生成新的解析版本，并设为当前版本。历史解析版本会保留。是否继续？'

  await ElMessageBox.confirm(message, '确认重新解析', { type: 'warning' })

  // 立即更新状态防止重复点击
  const originalStatus = file.status
  file.status = 'parsing'

  try {
    await reparseTenderFile(file.id)
    ElMessage.success('已提交重新解析任务')
    loadFiles()
  } catch (err: any) {
    // 恢复原状态
    file.status = originalStatus
    ElMessage.error(err.response?.data?.message || '操作失败')
  }
}
```

- [ ] **Step 4: 删除旧的 handleRetryParse 函数**

如果还存在旧的 `handleRetryParse` 函数，删除它。

- [ ] **Step 5: 验证编译**

```bash
cd /home/newaibook/ai-bid-generator/frontend && npm run build 2>&1 | tail -10
```

Expected: 编译成功

- [ ] **Step 6: 提交代码**

```bash
git add frontend/src/views/projects/ProjectFiles.vue
git commit -m "feat(ui): add reparse button for parsed files in ProjectFiles

- Show reparse button for parsed, chunked, ready, parse_failed statuses
- Disable button during parsing, chunking, processing
- Show confirmation dialog before reparse
- Update status immediately to prevent duplicate clicks

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6: 前端 - 更新 ParsedDocumentView.vue

**Files:**
- Modify: `frontend/src/views/tender/ParsedDocumentView.vue`

- [ ] **Step 1: 更新 imports**

修改第 189-205 行：

```typescript
import { ref, onMounted, watch, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Document, Refresh } from '@element-plus/icons-vue'
import {
  getParsedDocumentByFile,
  listChunks,
  getChunkStats,
  getParseDebug,
  getChunkDebug,
  getTenderFile,
  reparseTenderFile,
  getParseVersions,
  activateParseVersion,
  type ParsedDocument,
  type TenderChunk,
  type ChunkStats,
  type ParseDebug,
  type ChunkDebug,
  type ParseVersion,
  type TenderFile,
} from '@/api/tender'
```

- [ ] **Step 2: 添加新的响应式变量**

在第 209-228 行之间添加：

```typescript
const fileId = ref(Number(route.params.fileId))
const loading = ref(false)

const tenderFile = ref<TenderFile | null>(null)
const parsedDoc = ref<ParsedDocument | null>(null)
const chunks = ref<TenderChunk[]>([])
const chunkStats = ref<ChunkStats | null>(null)

// 版本管理
const versions = ref<ParseVersion[]>([])
const selectedVersionId = ref<number | null>(null)
const currentVersionId = computed(() => {
  const active = versions.value.find(v => v.is_active)
  return active?.id || null
})
const reparseLoading = ref(false)
```

- [ ] **Step 3: 更新页面头部模板**

修改第 3-18 行的 page-header：

```vue
<!-- 页面头部 -->
<div class="page-header">
  <div class="header-left">
    <el-button link @click="router.back()">
      <el-icon><ArrowLeft /></el-icon>
      返回
    </el-button>
    <h2>{{ tenderFile?.original_name || parsedDoc?.tender_file_name }}</h2>
    <el-tag v-if="tenderFile" :type="getStatusType(tenderFile.status)" size="small">
      {{ tenderFile.status_display }}
    </el-tag>
  </div>
  <div class="header-right">
    <!-- 版本选择 -->
    <el-select
      v-if="versions.length > 1"
      v-model="selectedVersionId"
      placeholder="选择版本"
      style="width: 320px"
      @change="handleVersionChange"
    >
      <el-option
        v-for="v in versions"
        :key="v.id"
        :label="formatVersionLabel(v)"
        :value="v.id"
      />
    </el-select>
    <!-- 重新解析按钮 -->
    <el-button
      type="primary"
      :loading="reparseLoading"
      :disabled="isProcessing"
      @click="handleReparse"
    >
      <el-icon><Refresh /></el-icon>
      重新解析
    </el-button>
    <el-button @click="showDebugDialog = true">
      <el-icon><Document /></el-icon>
      调试信息
    </el-button>
  </div>
</div>
```

- [ ] **Step 4: 添加辅助函数和事件处理**

在 script 部分添加以下函数（在 `truncate` 函数后）：

```typescript
// 处理中状态
const isProcessing = computed(() => {
  return ['parsing', 'chunking', 'processing'].includes(tenderFile.value?.status || '')
})

// 状态标签类型
function getStatusType(status: string) {
  const map: Record<string, string> = {
    uploading: 'info',
    parse_pending: 'warning',
    parsing: 'warning',
    parsed: 'success',
    chunked: 'success',
    ready: 'success',
    parse_failed: 'danger',
  }
  return map[status] || 'info'
}

// 版本标签格式化
function formatVersionLabel(v: ParseVersion): string {
  const activeLabel = v.is_active ? '当前版本' : '历史版本'
  const date = new Date(v.created_at).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
  return `${activeLabel} · ${v.parser_version} · ${v.page_count}页 · ${v.chunk_count}个分块 · ${date}`
}

// 加载文件信息
async function loadTenderFile() {
  try {
    const res = await getTenderFile(fileId.value)
    tenderFile.value = res.data
  } catch (err: any) {
    console.error('加载文件信息失败:', err)
  }
}

// 加载版本列表
async function loadVersions() {
  try {
    const res = await getParseVersions(fileId.value)
    versions.value = res.data.results || []
    selectedVersionId.value = currentVersionId.value
  } catch (err: any) {
    console.error('加载版本列表失败:', err)
  }
}

// 版本切换
async function handleVersionChange(versionId: number) {
  if (versionId === currentVersionId.value) return

  try {
    await ElMessageBox.confirm(
      '切换解析版本只会改变当前展示的解析结果，不会自动同步已有条款抽取、响应矩阵或大纲。如需保持一致，请切换后重新执行条款抽取。',
      '切换解析版本',
      { type: 'warning', confirmButtonText: '确认切换', cancelButtonText: '取消' }
    )
  } catch {
    // 用户取消，恢复原选择
    selectedVersionId.value = currentVersionId.value
    return
  }

  try {
    await activateParseVersion(fileId.value, versionId)
    ElMessage.success('已切换到该版本')
    // 重新加载数据
    await loadParsedDocument()
    await loadVersions()
  } catch (err: any) {
    selectedVersionId.value = currentVersionId.value
    ElMessage.error(err.response?.data?.message || '切换失败')
  }
}

// 重新解析
async function handleReparse() {
  const message = '重新解析将生成新的解析版本，并设为当前版本。历史解析版本会保留。是否继续？'

  await ElMessageBox.confirm(message, '确认重新解析', { type: 'warning' })

  reparseLoading.value = true
  const originalStatus = tenderFile.value?.status

  try {
    await reparseTenderFile(fileId.value)
    ElMessage.success('已提交重新解析任务')

    // 更新状态
    if (tenderFile.value) {
      tenderFile.value.status = 'parsing'
    }

    // 延迟刷新
    setTimeout(() => {
      loadTenderFile()
      loadVersions()
    }, 2000)
  } catch (err: any) {
    if (tenderFile.value && originalStatus) {
      tenderFile.value.status = originalStatus
    }
    ElMessage.error(err.response?.data?.message || '操作失败')
  } finally {
    reparseLoading.value = false
  }
}
```

- [ ] **Step 5: 更新 loadParsedDocument 函数**

修改 `loadParsedDocument` 函数，在开头添加文件信息和版本的加载：

```typescript
// 加载解析文档
async function loadParsedDocument() {
  loading.value = true
  try {
    // 并行加载文件信息、版本列表、解析文档
    const [fileRes, versionsRes, docRes] = await Promise.all([
      getTenderFile(fileId.value),
      getParseVersions(fileId.value),
      getParsedDocumentByFile(fileId.value),
    ])

    tenderFile.value = fileRes.data
    versions.value = versionsRes.data.results || []
    selectedVersionId.value = currentVersionId.value

    if (!docRes.data) {
      ElMessage.error('文档不存在或未解析')
      router.back()
      return
    }
    parsedDoc.value = docRes.data

    // 并行加载分块和统计
    await Promise.all([
      loadChunks(),
      loadChunkStats(),
    ])

    // 加载调试信息
    loadDebugInfo()
  } catch (err: any) {
    ElMessage.error(err.response?.data?.detail || '加载失败')
    router.back()
  } finally {
    loading.value = false
  }
}
```

- [ ] **Step 6: 更新样式**

在 `<style scoped>` 部分添加：

```css
.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
```

- [ ] **Step 7: 验证编译**

```bash
cd /home/newaibook/ai-bid-generator/frontend && npm run build 2>&1 | tail -10
```

Expected: 编译成功

- [ ] **Step 8: 提交代码**

```bash
git add frontend/src/views/tender/ParsedDocumentView.vue
git commit -m "feat(ui): add version selector and reparse button to ParsedDocumentView

- Add version dropdown selector for files with multiple versions
- Add reparse button with confirmation dialog
- Block actions during parsing/chunking/processing
- Show file status in header
- Load tender file info and versions on mount

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 7: 重建 Docker 镜像并验证

**Files:**
- None

- [ ] **Step 1: 重建后端 Docker 镜像**

```bash
cd /home/newaibook/ai-bid-generator && docker compose build web
```

- [ ] **Step 2: 重启服务**

```bash
docker compose up -d web
```

- [ ] **Step 3: 运行后端测试**

```bash
docker exec ai-bid-generator-web-1 python -m pytest apps/tender/tests/test_reparse_api.py -v
```

Expected: 所有测试通过

- [ ] **Step 4: 手动验证 API**

```bash
# 获取 token
TOKEN=$(curl -s http://localhost/api/auth/login -X POST -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}' | jq -r '.access')

# 测试 reparse API
curl -s -X POST "http://localhost/api/tender/files/1/reparse/" -H "Authorization: Bearer $TOKEN" | jq .
```

- [ ] **Step 5: 验证前端编译**

```bash
cd /home/newaibook/ai-bid-generator/frontend && npm run build
```

Expected: 编译成功

---

## 自检清单

### 1. Spec 覆盖检查

| 需求 | 任务 | 状态 |
|------|------|------|
| POST `/api/tender/files/{id}/reparse/` | Task 1 | ✓ |
| GET `/api/tender/files/{id}/parse-versions/` | Task 2 | ✓ |
| POST `/api/tender/files/{id}/parse-versions/{version_id}/activate/` | Task 3 | ✓ |
| 文件列表重新解析按钮 | Task 5 | ✓ |
| 解析详情页版本选择 | Task 6 | ✓ |
| 解析详情页重新解析按钮 | Task 6 | ✓ |
| 处理中状态禁止操作 | Task 1, 3 | ✓ |
| select_for_update 并发控制 | Task 1, 3 | ✓ |
| 操作日志记录 | Task 1, 3 | ✓ |

### 2. Placeholder 扫描

- 无 TBD/TODO
- 无"类似 Task N"引用
- 所有代码步骤都有完整代码

### 3. 类型一致性

- `ParseVersion` 接口在 Task 4 定义，Task 5/6 使用
- `reparseTenderFile` 函数在 Task 4 定义，Task 5/6 使用
- 后端返回字段与前端类型定义一致
