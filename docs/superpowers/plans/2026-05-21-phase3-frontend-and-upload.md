# Phase 3：前端基础、MinIO 预签名上传与联调 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Phase 1/Phase 2 已完成的 Django 模型、权限、认证 API 基础上，落地前端 Vue3 工程、现代浅色登录页、JWT/refresh Cookie 前端闭环、布局/路由/权限菜单、任务轮询、MinIO 预签名直传招标文件上传流程，并把 `nginx` 加入 Docker Compose 形成 7 服务部署拓扑。

**Architecture:** 后端继续保持模块化单体。Phase 3 只补齐「文件上传闭环 + 前端基础闭环」：`tender` 提供 `TenderFile` 上传初始化/完成确认/列表查询/占位解析任务，`common.storage` 封装 MinIO，`common.AsyncTask` 统一任务轮询；前端使用 Vue3 + Vite + Element Plus + Pinia + Vue Router + Axios。access token 仅存内存，refresh token 由后端 httpOnly Cookie 管理；Axios 实现 refresh single-flight，避免 refresh rotation 并发失效。

**Tech Stack:** Vue 3、Vite、TypeScript、Element Plus、Pinia、Vue Router、Axios、Django 5.2、DRF、MinIO Python SDK、Celery、pytest-django、Vitest、Docker Compose、Nginx。

**对应 spec：** `docs/superpowers/specs/2026-05-21-architecture-auth-design.md` §3.1、§3.4、§3.5、§3.6、§3.7、§5.3、§5.5、§5.9、§7.1、附录 A。

**前置条件：**
- Phase 1 全部 Task 已完成：14 个 app、分层 settings、`accounts`/`projects`/`audit`/`common`/`tender` 相关基础模型与迁移已落库。
- Phase 2 全部 Task 已完成：权限注册表、`permission_service`、JWT 登录/刷新/注销/改密、`RequirePermission`、`MustChangePasswordPermission`、`my-permissions`、审计、异常响应均可用。
- `docker compose up -d postgres redis minio` 可启动基础服务。
- `/api/auth/login`、`/api/auth/refresh`、`/api/auth/logout`、`/api/auth/me` 可用；refresh token 走 httpOnly Cookie，CSRF 走 double-submit Cookie。

**关键约定（沿用 Phase 1/2，勿改）：**
- 后端命令默认工作目录为 `backend/`，除非显式标注 `frontend/` 或仓库根。
- 每个含 Python 命令的步骤前假定已 `source .venv/bin/activate`。
- 前端命令默认工作目录为 `frontend/`，除非显式标注仓库根。
- 应用以 `apps.<name>` 形式注册；模型 `app_label` 取末段。
- 测试用真实 PostgreSQL；缓存测试环境用 LocMemCache；不要 mock 数据库。
- access token 只存在 Pinia 内存，不写 localStorage/sessionStorage；refresh token 前端 JS 不可读写。
- `object_key` 只能由后端生成；`complete-upload` 必须幂等；`AsyncTask.result_payload` 不存大正文。
- 新增受控 API 必须走 `RequirePermission` 或在服务层显式调用 `permission_service`，禁止在视图里散写鉴权逻辑。
- 统一异常用 `apps.common.exceptions` 已有子类（`NotFound`/`PermissionDenied`/`ValidationError` 等），**不要再向 `APIError(...)` 传 `status_code`**；需要自定义 `code` 时用 `ValidationError(message="...", code="...")`。
- MinIO 预签名 URL 的 SigV4 签名覆盖 host，**URL 生成后不允许改写 host**；签名用浏览器可达地址的 client。
- 每个 Task 结束应有一次干净的 `git commit`。

---

## 文件结构

| 文件 | 职责 |
| --- | --- |
| `backend/apps/common/services/storage.py` | MinIO 封装：bucket 初始化、预签名 PUT、stat、range 读取文件头、删除对象 |
| `backend/apps/common/services/file_magic.py` | 文件扩展名 + magic bytes 校验 |
| `backend/apps/common/views.py` / `urls.py` | `GET /api/tasks/{id}` 任务轮询 |
| `backend/apps/tender/models.py` | `TenderFile` 模型与状态机（若 Phase 1 已建则本阶段补字段/索引/状态） |
| `backend/apps/tender/serializers.py` | init-upload / complete-upload / list 序列化器 |
| `backend/apps/tender/services/upload_service.py` | 上传初始化、完成确认、幂等任务创建、对象校验 |
| `backend/apps/tender/tasks.py` | `parse_tender_file` 占位任务、`cleanup_stale_uploads` |
| `backend/apps/tender/views.py` / `urls.py` | 上传 3 个业务端点 |
| `backend/apps/projects/permissions.py` | 项目角色 → 权限集合静态映射（补 owner 的 `tender.view`） |
| `backend/config/urls.py` | 挂载 `/api/tasks/`、`/api/tender/` |
| `backend/config/celery.py` | 追加 `cleanup-stale-uploads` Beat 条目 |
| `frontend/` | Vue3 + Vite + TypeScript 前端工程 |
| `frontend/src/api/http.ts` | Axios 实例、Authorization 注入、CSRF 注入、refresh single-flight |
| `frontend/src/api/auth.ts` | login/refresh/logout/me/change-password |
| `frontend/src/api/tender.ts` | init-upload/complete-upload/list |
| `frontend/src/api/tasks.ts` | task polling |
| `frontend/src/stores/auth.ts` | access/user/global_permissions/menu_tree/must_change_password |
| `frontend/src/stores/project.ts` | 当前项目、项目级权限 |
| `frontend/src/router/index.ts` | 路由、守卫与「刷新页面恢复会话」bootstrap |
| `frontend/src/layout/MainLayout.vue` | 主布局：浅色侧边栏、顶栏、面包屑 |
| `frontend/src/views/login/LoginView.vue` | 登录页，参考 CareerCompass 视觉风格重新实现为 Vue |
| `frontend/src/views/dashboard/DashboardView.vue` | 登录后工作台 |
| `frontend/src/views/projects/ProjectListView.vue` | 项目列表占位页 |
| `frontend/src/views/tender/TenderUploadView.vue` | 招标文件上传页 |
| `frontend/src/views/auth/ChangePasswordView.vue` | 强制改密页 |
| `frontend/src/components/upload/PresignedFileUploader.vue` | 预签名直传上传组件 |
| `frontend/src/components/task/TaskProgress.vue` | 异步任务进度展示 |
| `frontend/src/styles/tokens.css` | 浅色 SaaS 风格设计变量 |
| `nginx/nginx.conf` | 前端静态资源 + `/api` 反代 + MinIO 入口 |
| `docker-compose.yml` | 加入第 7 个服务 `nginx` |
| `THIRD_PARTY_NOTICES.md` | CareerCompass 视觉参考许可说明 |

---

## Task 1：后端环境变量与 MinIO StorageService

**Files:**
- Modify: `.env.example`
- Modify: `backend/config/settings/base.py`
- Create: `backend/apps/common/services/__init__.py`
- Create: `backend/apps/common/services/storage.py`
- Create: `backend/apps/common/tests/test_storage_service.py`

- [ ] **Step 1：补充 `.env.example` 的 MinIO 公网/内网配置**

在仓库根 `.env.example` 追加或确认以下变量：

```env
MINIO_ENDPOINT=minio:9000
MINIO_PUBLIC_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=bid-files
MINIO_SECURE=false
MINIO_PRESIGN_EXPIRES_SECONDS=3600
```

说明：
- `MINIO_ENDPOINT`：Django/worker 容器访问 MinIO 的内网地址。
- `MINIO_PUBLIC_ENDPOINT`：浏览器访问预签名 URL 的地址；本地开发可用 `localhost:9000`，生产由 nginx 暴露。
- `MINIO_SECURE`：本地 `false`，生产通常 `true`。

- [ ] **Step 2：在 `base.py` 读取 MinIO 配置**

在 `backend/config/settings/base.py` 追加：

```python
MINIO_ENDPOINT = env("MINIO_ENDPOINT", default="localhost:9000")
MINIO_PUBLIC_ENDPOINT = env("MINIO_PUBLIC_ENDPOINT", default=MINIO_ENDPOINT)
MINIO_ACCESS_KEY = env("MINIO_ACCESS_KEY", default="minioadmin")
MINIO_SECRET_KEY = env("MINIO_SECRET_KEY", default="minioadmin")
MINIO_BUCKET = env("MINIO_BUCKET", default="bid-files")
MINIO_SECURE = env.bool("MINIO_SECURE", default=False)
MINIO_PRESIGN_EXPIRES_SECONDS = env.int("MINIO_PRESIGN_EXPIRES_SECONDS", default=3600)
```

- [ ] **Step 3：写失败测试 `backend/apps/common/tests/test_storage_service.py`**

```python
from datetime import timedelta

from apps.common.services.storage import StorageService


def test_build_object_key_is_stable_without_lot():
    key = StorageService.build_tender_object_key(
        project_id=1,
        lot_id=None,
        file_id=10,
        original_name="招标文件.PDF",
    )
    assert key == "projects/1/tender/10/original.pdf"


def test_build_object_key_supports_lot():
    key = StorageService.build_tender_object_key(
        project_id=1,
        lot_id=2,
        file_id=10,
        original_name="招标文件.docx",
    )
    assert key == "projects/1/lots/2/tender/10/original.docx"


def test_safe_extension_defaults_to_bin():
    key = StorageService.build_tender_object_key(
        project_id=1,
        lot_id=None,
        file_id=10,
        original_name="no-extension",
    )
    assert key.endswith("/original.bin")
```

- [ ] **Step 4：运行测试确认失败**

Run（`backend/`）：`pytest apps/common/tests/test_storage_service.py -v`

Expected：FAIL，`ModuleNotFoundError` 或 `ImportError`。

- [ ] **Step 5：创建 `common/services/storage.py`**

> **设计要点（务必遵守）：** MinIO 预签名 URL 的 SigV4 签名覆盖 `host`，URL **一旦生成就不能改写 host**，否则签名校验失败。因此 `StorageService` 持有两个 client：
> - `_ops`：用内网 `MINIO_ENDPOINT`，供 Django/worker 容器做 bucket 检查、stat、读取文件头、删除对象。
> - `_presign`：用浏览器可达的 `MINIO_PUBLIC_ENDPOINT`，**只**用于生成预签名 PUT URL。
>
> 不再有「生成后改写 host」的逻辑（删除旧设计里的 `_rewrite_public_endpoint`）。

```python
"""MinIO 存储封装（spec §3.5、§3.7）。

业务层不直接依赖 minio.Client，统一经 StorageService。
v1 只实现单对象 PUT 预签名；分片上传预留，不实现。

预签名 URL 的 SigV4 签名包含 host，生成后不可改写 host，所以这里持有两个
client：_ops 走内网地址做常规操作，_presign 走浏览器可达地址只用于签名。
"""
from __future__ import annotations

import re
from datetime import timedelta
from pathlib import Path

from django.conf import settings
from minio import Minio
from minio.error import S3Error

SAFE_EXT_RE = re.compile(r"^[a-zA-Z0-9]{1,12}$")


class StorageError(RuntimeError):
    pass


class ObjectNotFound(StorageError):
    pass


class StorageService:
    def __init__(self):
        self.bucket = settings.MINIO_BUCKET
        # 内网 client：容器内对 MinIO 的常规操作（bucket / stat / 读取 / 删除）。
        self._ops = Minio(
            settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_SECURE,
        )
        # 预签名 client：用浏览器可达地址签名；URL 生成后不可再改 host。
        self._presign = Minio(
            settings.MINIO_PUBLIC_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_SECURE,
        )

    @staticmethod
    def _safe_ext(original_name: str) -> str:
        suffix = Path(original_name).suffix.lower().lstrip(".")
        if not suffix or not SAFE_EXT_RE.match(suffix):
            return "bin"
        return suffix

    @classmethod
    def build_tender_object_key(cls, project_id: int, lot_id: int | None, file_id: int, original_name: str) -> str:
        ext = cls._safe_ext(original_name)
        if lot_id:
            return f"projects/{project_id}/lots/{lot_id}/tender/{file_id}/original.{ext}"
        return f"projects/{project_id}/tender/{file_id}/original.{ext}"

    def ensure_bucket(self) -> None:
        if not self._ops.bucket_exists(self.bucket):
            self._ops.make_bucket(self.bucket)

    def presigned_put_object(self, object_key: str, expires_seconds: int | None = None) -> str:
        self.ensure_bucket()
        expires = timedelta(seconds=expires_seconds or settings.MINIO_PRESIGN_EXPIRES_SECONDS)
        # 直接用 _presign client 生成；host 已是浏览器可达地址，不再改写。
        return self._presign.presigned_put_object(self.bucket, object_key, expires=expires)

    def stat_object(self, object_key: str):
        try:
            return self._ops.stat_object(self.bucket, object_key)
        except S3Error as exc:
            if exc.code in {"NoSuchKey", "NoSuchBucket", "NotFound"}:
                raise ObjectNotFound(object_key) from exc
            raise StorageError(str(exc)) from exc

    def read_head(self, object_key: str, length: int = 4096) -> bytes:
        try:
            response = self._ops.get_object(
                self.bucket,
                object_key,
                offset=0,
                length=length,
            )
            try:
                return response.read()
            finally:
                response.close()
                response.release_conn()
        except S3Error as exc:
            if exc.code in {"NoSuchKey", "NoSuchBucket", "NotFound"}:
                raise ObjectNotFound(object_key) from exc
            raise StorageError(str(exc)) from exc

    def remove_object(self, object_key: str) -> None:
        try:
            self._ops.remove_object(self.bucket, object_key)
        except S3Error as exc:
            raise StorageError(str(exc)) from exc
```

- [ ] **Step 6：运行测试确认通过**

Run（`backend/`）：`pytest apps/common/tests/test_storage_service.py -v`

Expected：`3 passed`。（`build_tender_object_key` 是 classmethod，不触发 `__init__`，测试不需要真实 MinIO。）

- [ ] **Step 7：提交**

```bash
git add .env.example backend/config/settings/base.py backend/apps/common/services backend/apps/common/tests/test_storage_service.py
git commit -m "feat: common 增加 MinIO StorageService 抽象"
```

---

## Task 2：文件 magic bytes 校验工具

**Files:**
- Create: `backend/apps/common/services/file_magic.py`
- Create: `backend/apps/common/tests/test_file_magic.py`

- [ ] **Step 1：写测试 `backend/apps/common/tests/test_file_magic.py`**

```python
from apps.common.services.file_magic import detect_kind, is_allowed_upload


def test_detect_pdf():
    assert detect_kind(b"%PDF-1.7\n") == "pdf"


def test_detect_docx_zip_signature():
    assert detect_kind(b"PK\x03\x04xxxx") == "zip"


def test_detect_txt_fallback():
    assert detect_kind("招标文件内容".encode()) == "txt"


def test_reject_extension_mismatch():
    assert is_allowed_upload("evil.pdf", b"not really pdf") is False


def test_allow_pdf():
    assert is_allowed_upload("招标文件.pdf", b"%PDF-1.7\n") is True


def test_allow_docx_zip_signature():
    assert is_allowed_upload("招标文件.docx", b"PK\x03\x04xxxx") is True
```

- [ ] **Step 2：运行测试确认失败**

Run（`backend/`）：`pytest apps/common/tests/test_file_magic.py -v`

Expected：FAIL，模块不存在。

- [ ] **Step 3：写 `backend/apps/common/services/file_magic.py`**

```python
"""轻量 magic bytes 校验。

v1 支持 docx/pdf/txt/xlsx/xls/zip 的粗粒度识别。docx/xlsx 本质为 zip，
更细粒度校验留到后续文档解析阶段；此处只防止明显伪造扩展名。
"""
from pathlib import Path

ALLOWED_EXTENSIONS = {"pdf", "docx", "doc", "txt", "xlsx", "xls", "zip"}


def extension_of(filename: str) -> str:
    return Path(filename).suffix.lower().lstrip(".")


def detect_kind(head: bytes) -> str:
    if head.startswith(b"%PDF"):
        return "pdf"
    if head.startswith(b"PK\x03\x04") or head.startswith(b"PK\x05\x06") or head.startswith(b"PK\x07\x08"):
        return "zip"
    if _looks_text(head):
        return "txt"
    return "unknown"


def _looks_text(head: bytes) -> bool:
    if not head:
        return True
    try:
        head.decode("utf-8")
        return b"\x00" not in head
    except UnicodeDecodeError:
        return False


def is_allowed_upload(filename: str, head: bytes) -> bool:
    ext = extension_of(filename)
    if ext not in ALLOWED_EXTENSIONS:
        return False

    kind = detect_kind(head)
    if ext == "pdf":
        return kind == "pdf"
    if ext in {"docx", "xlsx", "zip"}:
        return kind == "zip"
    if ext == "txt":
        return kind == "txt"
    # 老 doc/xls 是 OLE 复合文档，v1 不做深校验，解析阶段再处理。
    if ext in {"doc", "xls"}:
        return kind in {"unknown", "zip"}
    return False
```

- [ ] **Step 4：运行测试确认通过**

Run（`backend/`）：`pytest apps/common/tests/test_file_magic.py -v`

Expected：`6 passed`。

- [ ] **Step 5：提交**

```bash
git add backend/apps/common/services/file_magic.py backend/apps/common/tests/test_file_magic.py
git commit -m "feat: common 增加上传文件 magic bytes 校验"
```

---

## Task 3：`GET /api/tasks/{id}` 任务轮询接口

**Files:**
- Create: `backend/apps/common/serializers.py`
- Modify: `backend/apps/common/views.py`（当前为 `startapp` 生成的 stub，整体替换）
- Create: `backend/apps/common/urls.py`
- Modify: `backend/config/urls.py`
- Create: `backend/apps/common/tests/test_task_api.py`

- [ ] **Step 1：写测试 `backend/apps/common/tests/test_task_api.py`**

```python
import pytest
from django.urls import reverse

from apps.common.models import AsyncTask


@pytest.mark.django_db
def test_task_detail_returns_owner_task(api_client, normal_user):
    task = AsyncTask.objects.create(
        task_type="tender_parse",
        status="running",
        progress=30,
        current_step="正在解析",
        created_by=normal_user,
    )
    api_client.force_authenticate(normal_user)

    response = api_client.get(f"/api/tasks/{task.id}")
    assert response.status_code == 200
    assert response.data["id"] == task.id
    assert response.data["progress"] == 30


@pytest.mark.django_db
def test_task_detail_forbidden_for_other_user(api_client, normal_user, bid_manager_user):
    task = AsyncTask.objects.create(task_type="tender_parse", created_by=bid_manager_user)
    api_client.force_authenticate(normal_user)

    response = api_client.get(f"/api/tasks/{task.id}")
    assert response.status_code == 403


@pytest.mark.django_db
def test_task_detail_system_admin_can_view(api_client, admin_user, normal_user):
    task = AsyncTask.objects.create(task_type="tender_parse", created_by=normal_user)
    api_client.force_authenticate(admin_user)

    response = api_client.get(f"/api/tasks/{task.id}")
    assert response.status_code == 200
```

- [ ] **Step 2：运行测试确认失败**

Run（`backend/`）：`pytest apps/common/tests/test_task_api.py -v`

Expected：FAIL，路由未找到或视图不存在。

- [ ] **Step 3：写 `backend/apps/common/serializers.py`**

```python
from rest_framework import serializers

from apps.common.models import AsyncTask


class AsyncTaskSerializer(serializers.ModelSerializer):
    class Meta:
        model = AsyncTask
        fields = [
            "id",
            "task_type",
            "celery_task_id",
            "status",
            "progress",
            "current_step",
            "total_steps",
            "related_object_type",
            "related_object_id",
            "result_payload",
            "error_message",
            "created_at",
            "started_at",
            "finished_at",
        ]
```

- [ ] **Step 4：替换 `backend/apps/common/views.py`**

`apps/common/views.py` 当前是 `startapp` 生成的 stub，整体替换为以下内容。

> 异常用 `apps.common.exceptions` 已有子类，不再向 `APIError` 传 `status_code`：`NotFound` 返回 404、`PermissionDenied` 返回 403。
> 视图覆盖 `permission_classes` 会丢掉 settings 里的默认 `MustChangePasswordPermission`，需显式带上。`TaskDetailView` 无注册权限码（鉴权是「任务属主或系统管理员」对象级判断），不挂 `RequirePermission`。

```python
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import MustChangePasswordPermission
from apps.accounts.services import permission_service
from apps.common.exceptions import NotFound, PermissionDenied
from apps.common.models import AsyncTask
from apps.common.serializers import AsyncTaskSerializer


class TaskDetailView(APIView):
    permission_classes = [IsAuthenticated, MustChangePasswordPermission]

    def get(self, request, task_id):
        try:
            task = AsyncTask.objects.get(pk=task_id)
        except AsyncTask.DoesNotExist as exc:
            raise NotFound(message="任务不存在") from exc

        if task.created_by_id != request.user.id and not permission_service.is_system_admin(request.user):
            raise PermissionDenied(message="无权查看该任务")

        return Response(AsyncTaskSerializer(task).data)
```

- [ ] **Step 5：写 `backend/apps/common/urls.py` 并挂载根路由**

`backend/apps/common/urls.py`：

```python
from django.urls import path

from apps.common.views import TaskDetailView

urlpatterns = [
    path("tasks/<int:task_id>", TaskDetailView.as_view(), name="task-detail"),
]
```

在 `backend/config/urls.py` 追加：

```python
path("api/", include("apps.common.urls")),
```

如尚未导入，补：

```python
from django.urls import include, path
```

- [ ] **Step 6：运行测试确认通过**

Run（`backend/`）：`pytest apps/common/tests/test_task_api.py -v`

Expected：`3 passed`。

- [ ] **Step 7：提交**

```bash
git add backend/apps/common/serializers.py backend/apps/common/views.py backend/apps/common/urls.py backend/apps/common/tests/test_task_api.py backend/config/urls.py
git commit -m "feat: common 增加 AsyncTask 轮询接口"
```

---

## Task 4：TenderFile 上传服务与 API

**Files:**
- Delete: `backend/apps/tender/tests.py`（Phase 1 `startapp` 遗留的 stub，与 `tests/` 包冲突）
- Create: `backend/apps/tender/tests/__init__.py`
- Modify: `backend/apps/projects/permissions.py`（给 `owner` 角色补 `tender.view`）
- Modify: `backend/apps/tender/models.py`
- Create/Modify: `backend/apps/tender/migrations/*.py`
- Create: `backend/apps/tender/serializers.py`
- Create: `backend/apps/tender/services/__init__.py`
- Create: `backend/apps/tender/services/upload_service.py`
- Create: `backend/apps/tender/tasks.py`
- Modify: `backend/apps/tender/views.py`（当前为 `startapp` 生成的 stub，整体替换）
- Create: `backend/apps/tender/urls.py`
- Modify: `backend/config/urls.py`
- Create: `backend/apps/tender/tests/test_upload_api.py`

> 如果 Phase 1 已经创建 `TenderFile`，本 Task 只补齐字段、状态、索引、服务与 API；若 Phase 1 只建了空 app，则本 Task 创建完整模型。最终以迁移后模型与本计划一致为准。

- [ ] **Step 1：清理 tender 测试目录、补齐 `owner` 角色权限**

**1a. 把 `apps/tender/tests.py` 迁移为 `tests` 包**

Phase 1 用 `startapp` 在 `apps/tender/` 下生成了占位文件 `tests.py`。本 Task 要在 `apps/tender/tests/` 下放多个测试文件，模块名 `tests` 不能既是文件又是包。先删除文件并建包：

```bash
git rm backend/apps/tender/tests.py
mkdir -p backend/apps/tender/tests
touch backend/apps/tender/tests/__init__.py
```

**1b. 给项目 `owner` 角色补 `tender.view` 权限**

`backend/apps/projects/permissions.py` 的 `PROJECT_ROLE_PERMISSIONS["owner"]` 当前缺 `tender.view`（`editor`/`reviewer`/`viewer` 都有），导致项目 owner 调 `GET /api/tender/files`（`required_permission = "tender.view"`）会 403。在 owner 集合补上 `"tender.view"`：

```python
PROJECT_ROLE_PERMISSIONS = {
    "owner": {
        "project.view", "project.update", "project.member.manage",
        "tender.view",                       # 本 Task 新增：owner 需能查看招标文件列表
        "tender.upload", "tender.parse", "outline.edit",
        "section.generate", "section.edit", "section.review",
        "export.create",
    },
    # editor / reviewer / viewer 保持不变（它们已含 tender.view）
    ...
}
```

> 只动 `owner` 集合，不要改其它角色，也不要改 `accounts/permissions_registry.py`（`tender.view` 已注册为 PROJECT scope 权限码）。

- [ ] **Step 2：写测试 `backend/apps/tender/tests/test_upload_api.py`**

> `test_complete_upload_is_idempotent` 的 `enqueue_parse_task` 桩**必须真正创建 `AsyncTask` 并落库到 `tender_file.parse_task`**：第二次 `complete-upload` 会走幂等分支返回 `tender_file.parse_task_id`，桩若不落库，第二次返回的 `task_id` 会是 `None`，断言失败。

```python
import pytest

from apps.projects.models import ProjectMember


@pytest.mark.django_db
def test_init_upload_requires_project_permission(api_client, normal_user, project):
    api_client.force_authenticate(normal_user)
    response = api_client.post(
        "/api/tender/files/init-upload",
        {
            "project_id": project.id,
            "file_name": "招标文件.pdf",
            "file_size": 1024,
            "content_type": "application/pdf",
            "file_category": "tender_file",
        },
        format="json",
    )
    assert response.status_code == 403


@pytest.mark.django_db
def test_init_upload_owner_gets_upload_url(api_client, normal_user, project, monkeypatch):
    ProjectMember.objects.create(project=project, user=normal_user, project_role="owner")
    api_client.force_authenticate(normal_user)

    monkeypatch.setattr(
        "apps.tender.services.upload_service.StorageService.presigned_put_object",
        lambda self, object_key: "http://localhost:9000/presigned",
    )

    response = api_client.post(
        "/api/tender/files/init-upload",
        {
            "project_id": project.id,
            "file_name": "招标文件.pdf",
            "file_size": 1024,
            "content_type": "application/pdf",
            "file_category": "tender_file",
        },
        format="json",
    )
    assert response.status_code == 200
    assert response.data["upload_url"] == "http://localhost:9000/presigned"
    assert response.data["file_id"]


@pytest.mark.django_db
def test_complete_upload_is_idempotent(api_client, normal_user, project, monkeypatch):
    from apps.common.models import AsyncTask
    from apps.tender.models import TenderFile

    ProjectMember.objects.create(project=project, user=normal_user, project_role="owner")
    file = TenderFile.objects.create(
        project=project,
        original_name="招标文件.pdf",
        file_size=1024,
        content_type="application/pdf",
        file_category="tender_file",
        object_key="projects/1/tender/1/original.pdf",
        status="uploading",
        created_by=normal_user,
    )
    api_client.force_authenticate(normal_user)

    class Stat:
        size = 1024

    monkeypatch.setattr("apps.tender.services.upload_service.StorageService.stat_object", lambda self, key: Stat())
    monkeypatch.setattr("apps.tender.services.upload_service.StorageService.read_head", lambda self, key, length=4096: b"%PDF-1.7\n")

    def fake_enqueue(tender_file, user):
        """桩必须真正落库 parse_task，否则第二次调用走幂等分支会拿不到 task_id。"""
        task = AsyncTask.objects.create(
            task_type="tender_parse",
            status=AsyncTask.STATUS_PENDING,
            created_by=user,
        )
        tender_file.parse_task = task
        tender_file.save(update_fields=["parse_task", "updated_at"])
        return task.id

    monkeypatch.setattr("apps.tender.services.upload_service.enqueue_parse_task", fake_enqueue)

    first = api_client.post(f"/api/tender/files/{file.id}/complete-upload", {}, format="json")
    second = api_client.post(f"/api/tender/files/{file.id}/complete-upload", {}, format="json")

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.data["task_id"] == second.data["task_id"]


@pytest.mark.django_db
def test_complete_upload_rejects_type_mismatch(api_client, normal_user, project, monkeypatch):
    """伪造类型文件：API 返回 400，且文件状态必须真正落库为 rejected。

    回归用例：complete_upload 若整体 @transaction.atomic，_reject 写库会被随后
    抛出的 ValidationError 一起回滚，文件停在 uploading。此用例锁死该行为。
    """
    from apps.tender.models import TenderFile

    ProjectMember.objects.create(project=project, user=normal_user, project_role="owner")
    file = TenderFile.objects.create(
        project=project,
        original_name="伪造.pdf",
        file_size=1024,
        content_type="application/pdf",
        file_category="tender_file",
        object_key="projects/1/tender/2/original.pdf",
        status="uploading",
        created_by=normal_user,
    )
    api_client.force_authenticate(normal_user)

    class Stat:
        size = 1024

    monkeypatch.setattr("apps.tender.services.upload_service.StorageService.stat_object", lambda self, key: Stat())
    monkeypatch.setattr(
        "apps.tender.services.upload_service.StorageService.read_head",
        lambda self, key, length=4096: b"plain text, definitely not a pdf",
    )
    monkeypatch.setattr("apps.tender.services.upload_service.StorageService.remove_object", lambda self, key: None)

    response = api_client.post(f"/api/tender/files/{file.id}/complete-upload", {}, format="json")

    assert response.status_code == 400
    file.refresh_from_db()
    assert file.status == TenderFile.STATUS_REJECTED
    assert file.error_message
```

- [ ] **Step 3：运行测试确认失败**

Run（`backend/`）：`pytest apps/tender/tests/test_upload_api.py -v`

Expected：FAIL，模型或路由不存在。

- [ ] **Step 4：实现或补齐 `backend/apps/tender/models.py`**

```python
from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel


class TenderFile(TimeStampedModel):
    """招标/附件文件元数据。文件内容存 MinIO，不入数据库。"""

    CATEGORY_TENDER = "tender_file"
    CATEGORY_ATTACHMENT = "attachment"
    CATEGORY_CLARIFICATION = "clarification"

    CATEGORY_CHOICES = [
        (CATEGORY_TENDER, "招标文件"),
        (CATEGORY_ATTACHMENT, "附件"),
        (CATEGORY_CLARIFICATION, "澄清/补遗"),
    ]

    STATUS_UPLOADING = "uploading"
    STATUS_PARSE_PENDING = "parse_pending"
    STATUS_PARSING = "parsing"
    STATUS_PARSED = "parsed"
    STATUS_PARSE_FAILED = "parse_failed"
    STATUS_READY = "ready"
    STATUS_REJECTED = "rejected"
    STATUS_ARCHIVED = "archived"
    STATUS_UPLOAD_EXPIRED = "upload_expired"

    STATUS_CHOICES = [
        (STATUS_UPLOADING, "上传中"),
        (STATUS_PARSE_PENDING, "待解析"),
        (STATUS_PARSING, "解析中"),
        (STATUS_PARSED, "已解析"),
        (STATUS_PARSE_FAILED, "解析失败"),
        (STATUS_READY, "可用"),
        (STATUS_REJECTED, "已拒绝"),
        (STATUS_ARCHIVED, "已归档"),
        (STATUS_UPLOAD_EXPIRED, "上传过期"),
    ]

    project = models.ForeignKey("projects.Project", on_delete=models.CASCADE, related_name="tender_files")
    lot = models.ForeignKey("projects.Lot", on_delete=models.CASCADE, related_name="tender_files", null=True, blank=True)
    original_name = models.CharField(max_length=255)
    file_size = models.BigIntegerField()
    content_type = models.CharField(max_length=128, blank=True)
    file_category = models.CharField(max_length=32, choices=CATEGORY_CHOICES, default=CATEGORY_TENDER)
    object_key = models.CharField(max_length=512, unique=True)
    status = models.CharField(max_length=32, choices=STATUS_CHOICES, default=STATUS_UPLOADING)
    parse_task = models.ForeignKey("common.AsyncTask", null=True, blank=True, on_delete=models.SET_NULL, related_name="tender_files")
    error_message = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="created_tender_files")

    class Meta:
        db_table = "tender_file"
        indexes = [
            models.Index(fields=["project"]),
            models.Index(fields=["lot"]),
            models.Index(fields=["status"]),
            models.Index(fields=["file_category"]),
        ]

    def __str__(self):
        return self.original_name
```

- [ ] **Step 5：生成并应用迁移**

Run（`backend/`）：

```bash
python manage.py makemigrations tender
python manage.py migrate
```

Expected：迁移应用成功，`tender_file` 表存在。

- [ ] **Step 6：写 `backend/apps/tender/serializers.py`**

```python
from rest_framework import serializers

from apps.projects.models import Lot, Project
from apps.tender.models import TenderFile


class InitUploadSerializer(serializers.Serializer):
    project_id = serializers.IntegerField()
    lot_id = serializers.IntegerField(required=False, allow_null=True)
    file_name = serializers.CharField(max_length=255)
    file_size = serializers.IntegerField(min_value=1)
    content_type = serializers.CharField(max_length=128, required=False, allow_blank=True)
    file_category = serializers.ChoiceField(choices=[c[0] for c in TenderFile.CATEGORY_CHOICES])

    def validate(self, attrs):
        try:
            attrs["project"] = Project.objects.get(pk=attrs["project_id"])
        except Project.DoesNotExist as exc:
            raise serializers.ValidationError({"project_id": "项目不存在"}) from exc

        lot_id = attrs.get("lot_id")
        if lot_id:
            try:
                attrs["lot"] = Lot.objects.get(pk=lot_id, project=attrs["project"])
            except Lot.DoesNotExist as exc:
                raise serializers.ValidationError({"lot_id": "标段不存在或不属于该项目"}) from exc
        else:
            attrs["lot"] = None
        return attrs


class InitUploadResponseSerializer(serializers.Serializer):
    file_id = serializers.IntegerField()
    upload_url = serializers.CharField()
    object_key = serializers.CharField()
    expires_in = serializers.IntegerField()


class CompleteUploadResponseSerializer(serializers.Serializer):
    file_id = serializers.IntegerField()
    status = serializers.CharField()
    task_id = serializers.IntegerField(allow_null=True)


class TenderFileSerializer(serializers.ModelSerializer):
    class Meta:
        model = TenderFile
        fields = [
            "id",
            "project",
            "lot",
            "original_name",
            "file_size",
            "content_type",
            "file_category",
            "object_key",
            "status",
            "parse_task",
            "error_message",
            "created_at",
            "updated_at",
        ]
```

- [ ] **Step 7：写 `backend/apps/tender/services/upload_service.py`**

> 异常统一用 `NotFound` / `ValidationError`，不传 `status_code`；需要自定义 `code` 时用 `ValidationError(message=..., code=...)`。
> `enqueue_parse_task` 直接用 `AsyncTask.STATUS_PENDING` 常量（Phase 1 已定义），无需 `hasattr` 兜底。
> `complete_upload` **不要**整体加 `@transaction.atomic`：拒绝分支 `_reject` 先写库再 `raise ValidationError`，若整个方法在事务内，异常会让 `@transaction.atomic` 把拒绝状态一起回滚，文件永远停在 `uploading`，违反 DoD「伪造文件置 `rejected`」与手动测试 §6.1。正确做法是只把「入解析队列」这段连续写库（`enqueue_parse_task` + 置 `parse_pending`）用 `with transaction.atomic()` 包成原子块；`_reject` 与各校验分支留在事务外，写库语句即自动提交（本项目未开 `ATOMIC_REQUESTS`，方法外无隐式事务）。
> Celery 投递走 `transaction.on_commit`：投递语句位于「入解析队列」的 `with transaction.atomic()` 块内，事务提交后再 `apply_async`，避免 worker 在 `AsyncTask` / `TenderFile` 尚未落库时就执行而报 `DoesNotExist`。

```python
import uuid

from django.conf import settings
from django.db import transaction

from apps.common.exceptions import NotFound, ValidationError
from apps.common.models import AsyncTask
from apps.common.services.file_magic import is_allowed_upload
from apps.common.services.storage import ObjectNotFound, StorageService
from apps.tender.models import TenderFile


def enqueue_parse_task(tender_file: TenderFile, user) -> int:
    """创建 AsyncTask 并在事务提交后投递解析任务；返回 AsyncTask.id。

    v1 的解析任务为占位实现，真正解析在 tender 后续 spec 中补。
    """
    from apps.tender.tasks import parse_tender_file

    # 预生成 celery task id 随 AsyncTask 一起落库，投递时复用同一 id，
    # 保证 AsyncTask.celery_task_id 与实际 Celery 任务一致，无需投递后回写。
    celery_task_id = str(uuid.uuid4())
    task = AsyncTask.objects.create(
        task_type="tender_parse",
        celery_task_id=celery_task_id,
        status=AsyncTask.STATUS_PENDING,
        progress=0,
        current_step="等待解析",
        related_object_type="TenderFile",
        related_object_id=tender_file.id,
        input_payload={"tender_file_id": tender_file.id},
        created_by=user,
    )
    tender_file.parse_task = task
    tender_file.save(update_fields=["parse_task", "updated_at"])

    # 必须等外层事务提交后再投递，否则 worker 可能读不到尚未落库的记录。
    transaction.on_commit(
        lambda: parse_tender_file.apply_async(
            args=[task.id, tender_file.id],
            task_id=celery_task_id,
            queue="parse_queue",
        )
    )
    return task.id


class TenderUploadService:
    def __init__(self, storage: StorageService | None = None):
        self.storage = storage or StorageService()

    @transaction.atomic
    def init_upload(self, *, project, lot, file_name, file_size, content_type, file_category, user):
        tender_file = TenderFile.objects.create(
            project=project,
            lot=lot,
            original_name=file_name,
            file_size=file_size,
            content_type=content_type or "",
            file_category=file_category,
            object_key="__pending__",
            status=TenderFile.STATUS_UPLOADING,
            created_by=user,
        )
        object_key = StorageService.build_tender_object_key(
            project_id=project.id,
            lot_id=lot.id if lot else None,
            file_id=tender_file.id,
            original_name=file_name,
        )
        tender_file.object_key = object_key
        tender_file.save(update_fields=["object_key", "updated_at"])

        upload_url = self.storage.presigned_put_object(object_key)
        return {
            "file_id": tender_file.id,
            "upload_url": upload_url,
            "object_key": object_key,
            "expires_in": settings.MINIO_PRESIGN_EXPIRES_SECONDS,
        }

    def complete_upload(self, *, tender_file: TenderFile, user):
        # 幂等：已经进入后续状态则直接返回既有结果
        if tender_file.status in {
            TenderFile.STATUS_PARSE_PENDING,
            TenderFile.STATUS_PARSING,
            TenderFile.STATUS_PARSED,
            TenderFile.STATUS_PARSE_FAILED,
        }:
            return {"file_id": tender_file.id, "status": tender_file.status, "task_id": tender_file.parse_task_id}
        if tender_file.status == TenderFile.STATUS_READY:
            return {"file_id": tender_file.id, "status": tender_file.status, "task_id": None}
        if tender_file.status != TenderFile.STATUS_UPLOADING:
            raise ValidationError(message="当前文件状态不允许完成上传", code="invalid_state")

        try:
            stat = self.storage.stat_object(tender_file.object_key)
        except ObjectNotFound as exc:
            raise NotFound(message="MinIO 对象不存在") from exc

        real_size = getattr(stat, "size", None)
        if real_size != tender_file.file_size:
            self._reject(tender_file, "文件大小与初始化信息不一致")
            raise ValidationError(message="文件大小校验失败")

        head = self.storage.read_head(tender_file.object_key)
        if not is_allowed_upload(tender_file.original_name, head):
            self._reject(tender_file, "文件类型校验失败")
            raise ValidationError(message="文件类型校验失败")

        if tender_file.file_category == TenderFile.CATEGORY_ATTACHMENT:
            tender_file.status = TenderFile.STATUS_READY
            tender_file.save(update_fields=["status", "updated_at"])
            return {"file_id": tender_file.id, "status": tender_file.status, "task_id": None}

        # 入解析队列：AsyncTask 创建、parse_task 回写、状态置 parse_pending 必须原子，
        # enqueue_parse_task 内的 transaction.on_commit 也依赖此块提交后才投递。
        with transaction.atomic():
            task_id = tender_file.parse_task_id or enqueue_parse_task(tender_file, user)
            tender_file.status = TenderFile.STATUS_PARSE_PENDING
            tender_file.save(update_fields=["status", "updated_at"])
        return {"file_id": tender_file.id, "status": tender_file.status, "task_id": task_id}

    def _reject(self, tender_file: TenderFile, message: str):
        # complete_upload 未整体 atomic，此处 save 立即提交；调用方随后 raise
        # ValidationError 也不会回滚拒绝状态。切勿把 complete_upload 改回整体 atomic。
        tender_file.status = TenderFile.STATUS_REJECTED
        tender_file.error_message = message
        tender_file.save(update_fields=["status", "error_message", "updated_at"])
        try:
            self.storage.remove_object(tender_file.object_key)
        except Exception:
            # 删除失败不影响业务状态；后续可由清理任务处理。
            pass
```

- [ ] **Step 8：写 `backend/apps/tender/tasks.py`**

> 所有 import 统一放模块级（含 `StorageService`、`timedelta`）。`cleanup_stale_uploads` 内不再写局部 import：Task 5 的测试用 `monkeypatch.setattr("apps.tender.tasks.StorageService.remove_object", ...)`，该路径要求 `StorageService` 是 `tasks` 模块的模块级属性。

```python
from datetime import timedelta

from django.utils import timezone

from apps.common.models import AsyncTask
from apps.common.services.storage import StorageService
from apps.tender.models import TenderFile
from config.celery import app


@app.task(name="apps.tender.parse_tender_file")
def parse_tender_file(task_id: int, tender_file_id: int):
    """v1 占位解析任务：只更新任务与文件状态，不做真实文档解析。"""
    task = AsyncTask.objects.get(pk=task_id)
    tender_file = TenderFile.objects.get(pk=tender_file_id)

    task.status = "running"
    task.progress = 10
    task.current_step = "开始解析"
    task.started_at = timezone.now()
    task.save(update_fields=["status", "progress", "current_step", "started_at"])

    tender_file.status = TenderFile.STATUS_PARSING
    tender_file.save(update_fields=["status", "updated_at"])

    task.status = "success"
    task.progress = 100
    task.current_step = "解析占位任务完成"
    task.result_payload = {"tender_file_id": tender_file.id, "placeholder": True}
    task.finished_at = timezone.now()
    task.save(update_fields=["status", "progress", "current_step", "result_payload", "finished_at"])

    tender_file.status = TenderFile.STATUS_PARSED
    tender_file.save(update_fields=["status", "updated_at"])
    return task.result_payload


@app.task(name="apps.tender.cleanup_stale_uploads")
def cleanup_stale_uploads():
    """清理超过 24h 仍处于 uploading 的孤儿上传记录。"""
    storage = StorageService()
    cutoff = timezone.now() - timedelta(hours=24)
    qs = TenderFile.objects.filter(status=TenderFile.STATUS_UPLOADING, created_at__lt=cutoff)
    count = 0
    for tender_file in qs:
        try:
            storage.remove_object(tender_file.object_key)
        except Exception:
            pass
        tender_file.status = TenderFile.STATUS_UPLOAD_EXPIRED
        tender_file.save(update_fields=["status", "updated_at"])
        count += 1
    return {"expired": count}
```

- [ ] **Step 9：替换 `backend/apps/tender/views.py`**

`apps/tender/views.py` 当前是 `startapp` 生成的 stub，整体替换为以下内容。

> - 三个视图都显式带上 `MustChangePasswordPermission`（覆盖 `permission_classes` 会丢默认值）。
> - `CompleteUploadView` 不在视图里手写 `permission_service` 判断：改用 `RequirePermission` + `get_permission_project`，把 `file_id` 解析为所属项目后校验 `tender.upload`。
> - `TenderFileListView` 的 `project_id` 来自 query string，`RequirePermission` 默认不会从 query string 取 project，所以提供 `get_permission_project` 显式解析。
> - 异常用 `NotFound` / `ValidationError`，不传 `status_code`。

```python
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import MustChangePasswordPermission, RequirePermission
from apps.common.exceptions import NotFound, ValidationError
from apps.projects.models import Project
from apps.tender.models import TenderFile
from apps.tender.serializers import InitUploadSerializer, TenderFileSerializer
from apps.tender.services.upload_service import TenderUploadService


class InitUploadView(APIView):
    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "tender.upload"
    required_scope = "project"

    def post(self, request):
        serializer = InitUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        result = TenderUploadService().init_upload(
            project=data["project"],
            lot=data["lot"],
            file_name=data["file_name"],
            file_size=data["file_size"],
            content_type=data.get("content_type", ""),
            file_category=data["file_category"],
            user=request.user,
        )
        return Response(result)


class CompleteUploadView(APIView):
    """完成上传确认；鉴权走 RequirePermission + get_permission_project，不在视图里手写。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "tender.upload"
    required_scope = "project"

    def get_permission_project(self, request):
        tender_file = (
            TenderFile.objects.select_related("project")
            .filter(pk=self.kwargs.get("file_id"))
            .first()
        )
        return tender_file.project if tender_file else None

    def post(self, request, file_id):
        try:
            tender_file = TenderFile.objects.select_related("project", "lot", "parse_task").get(pk=file_id)
        except TenderFile.DoesNotExist as exc:
            raise NotFound(message="文件不存在") from exc

        return Response(TenderUploadService().complete_upload(tender_file=tender_file, user=request.user))


class TenderFileListView(APIView):
    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "tender.view"
    required_scope = "project"

    def get_permission_project(self, request):
        return Project.objects.filter(pk=request.query_params.get("project_id")).first()

    def get(self, request):
        project_id = request.query_params.get("project_id")
        if not project_id:
            raise ValidationError(message="缺少 project_id")
        qs = TenderFile.objects.filter(project_id=project_id).order_by("-created_at")
        return Response(TenderFileSerializer(qs, many=True).data)
```

- [ ] **Step 10：写 `backend/apps/tender/urls.py` 并挂载**

`backend/apps/tender/urls.py`：

```python
from django.urls import path

from apps.tender.views import CompleteUploadView, InitUploadView, TenderFileListView

urlpatterns = [
    path("tender/files/init-upload", InitUploadView.as_view(), name="tender-init-upload"),
    path("tender/files/<int:file_id>/complete-upload", CompleteUploadView.as_view(), name="tender-complete-upload"),
    path("tender/files", TenderFileListView.as_view(), name="tender-file-list"),
]
```

在 `backend/config/urls.py` 追加：

```python
path("api/", include("apps.tender.urls")),
```

- [ ] **Step 11：运行测试确认通过**

Run（`backend/`）：`pytest apps/tender/tests/test_upload_api.py -v`

Expected：`4 passed`。

- [ ] **Step 12：Django 系统检查**

Run（`backend/`）：`python manage.py check`

Expected：无问题。

- [ ] **Step 13：提交**

```bash
git add backend/apps/tender backend/apps/projects/permissions.py backend/config/urls.py
git commit -m "feat: tender 增加 MinIO 预签名上传 API"
```

> `git add backend/apps/tender` 会一并暂存 `tests.py` 的删除与新 `tests/` 包。

---

## Task 5：Celery Beat 追加孤儿上传清理任务

**Files:**
- Modify: `backend/config/celery.py`
- Create: `backend/apps/tender/tests/test_cleanup_stale_uploads.py`

- [ ] **Step 1：写测试 `backend/apps/tender/tests/test_cleanup_stale_uploads.py`**

```python
from datetime import timedelta

import pytest
from django.utils import timezone

from apps.tender.models import TenderFile
from apps.tender.tasks import cleanup_stale_uploads


@pytest.mark.django_db
def test_cleanup_stale_uploads_marks_expired(project, normal_user, monkeypatch):
    file = TenderFile.objects.create(
        project=project,
        original_name="old.pdf",
        file_size=1,
        content_type="application/pdf",
        file_category="tender_file",
        object_key="projects/1/tender/1/original.pdf",
        status=TenderFile.STATUS_UPLOADING,
        created_by=normal_user,
    )
    TenderFile.objects.filter(pk=file.pk).update(created_at=timezone.now() - timedelta(hours=25))

    monkeypatch.setattr("apps.tender.tasks.StorageService.remove_object", lambda self, key: None)

    result = cleanup_stale_uploads()
    file.refresh_from_db()
    assert result["expired"] == 1
    assert file.status == TenderFile.STATUS_UPLOAD_EXPIRED
```

- [ ] **Step 2：运行测试确认通过**

Run（`backend/`）：`pytest apps/tender/tests/test_cleanup_stale_uploads.py -v`

Expected：`1 passed`。Task 4 已把 `tasks.py` 的 `StorageService` 改为模块级 import，monkeypatch 路径 `apps.tender.tasks.StorageService.remove_object` 直接可用。

- [ ] **Step 3：在 `backend/config/celery.py` 增加 Beat 条目**

在 `app.conf.beat_schedule` 中加入：

```python
app.conf.beat_schedule.update(
    {
        "cleanup-stale-uploads-hourly": {
            "task": "apps.tender.cleanup_stale_uploads",
            "schedule": 60 * 60,
        },
    }
)
```

保留 Phase 2 已有的 `flush-expired-jwt-tokens` 条目，不要覆盖。

- [ ] **Step 4：验证 Celery Beat 配置可导入**

Run（`backend/`）：

```bash
python -c "from config.celery import app; print(sorted(app.conf.beat_schedule.keys()))"
```

Expected：包含 `cleanup-stale-uploads-hourly` 与 Phase 2 的 `flush-expired-jwt-tokens`。

- [ ] **Step 5：提交**

```bash
git add backend/config/celery.py backend/apps/tender/tests/test_cleanup_stale_uploads.py
git commit -m "feat: tender 增加孤儿上传清理定时任务"
```

---

## Task 6：初始化 Vue3 + Vite + TypeScript 前端工程

**Files:**
- Create: `frontend/`
- Create: `frontend/package.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/tsconfig*.json`
- Modify: `frontend/tsconfig.app.json`（追加 `@` 路径别名）
- Create: `frontend/src/main.ts`
- Create: `frontend/src/App.vue`
- Create: `frontend/src/styles/tokens.css`

- [ ] **Step 1：创建 Vite Vue TS 项目**

在仓库根执行：

```bash
npm create vite@latest frontend -- --template vue-ts
cd frontend
npm install
npm install element-plus @element-plus/icons-vue pinia vue-router axios
npm install -D vitest @vue/test-utils jsdom
```

Expected：`frontend/package.json` 生成且依赖安装成功。

- [ ] **Step 2：配置 Vite 开发代理**

修改 `frontend/vite.config.ts`：

> 配置里含 `test` 字段（Vitest 用），`defineConfig` **必须从 `vitest/config` 引入**——它扩展了 Vite 的配置类型以接受 `test`；从 `vite` 引入会因 `test` 不是合法字段而报类型错误。

```ts
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
  },
})
```

- [ ] **Step 3：在 `frontend/tsconfig.app.json` 配置 `@` 路径别名**

`vite.config.ts` 的 `@` 别名只让 Vite 构建/运行时能解析；TypeScript 类型检查与 IDE 还需要在 tsconfig 同步声明，否则 `import ... from '@/...'` 会报 `Cannot find module`。在包含 `src` 的 tsconfig（`vue-ts` 脚手架是 `tsconfig.app.json`，`tsconfig.json` 只是 references 聚合）的 `compilerOptions` 追加：

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

> 若脚手架版本把源码配置放在别处，以实际 `include` 了 `src` 的 tsconfig 为准。

- [ ] **Step 4：写设计变量 `frontend/src/styles/tokens.css`**

```css
:root {
  --app-bg: #f6f8fb;
  --app-card: #ffffff;
  --app-primary: #2563eb;
  --app-primary-soft: #dbeafe;
  --app-success: #10b981;
  --app-warning: #f59e0b;
  --app-danger: #ef4444;
  --app-text: #111827;
  --app-text-secondary: #6b7280;
  --app-border: #e5e7eb;
  --app-radius: 16px;
  --app-shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
}

html,
body,
#app {
  margin: 0;
  min-height: 100%;
  background: var(--app-bg);
  color: var(--app-text);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
```

- [ ] **Step 5：重写 `frontend/src/main.ts`**

```ts
import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'

import App from './App.vue'
import router from './router'
import { pinia } from './stores'
import './styles/tokens.css'

createApp(App).use(pinia).use(router).use(ElementPlus).mount('#app')
```

> `router`、`stores` 会在后续 Task 创建；此时若 `npm run build` 失败属预期，Task 7 后再验证。

- [ ] **Step 6：提交**

```bash
git add frontend
git commit -m "chore: 初始化 Vue3 Vite TypeScript 前端工程"
```

---

## Task 7：前端 Pinia、Router 与 Auth Store

**Files:**
- Create: `frontend/src/stores/index.ts`
- Create: `frontend/src/stores/auth.ts`
- Create: `frontend/src/stores/project.ts`
- Create: `frontend/src/router/index.ts`
- Create: `frontend/src/views/login/LoginView.vue`（占位，完整页面 Task 9）
- Create: `frontend/src/views/dashboard/DashboardView.vue`
- Create: `frontend/src/views/auth/ChangePasswordView.vue`
- Create: `frontend/src/views/projects/ProjectListView.vue`
- Modify: `frontend/src/App.vue`

- [ ] **Step 1：写 `frontend/src/stores/index.ts`**

```ts
import { createPinia } from 'pinia'

export const pinia = createPinia()
```

- [ ] **Step 2：写 `frontend/src/stores/auth.ts`**

> `MenuItem` 的字段必须与后端 `menu_service.build_menu_tree` 返回的形状一致：后端返回 `{key, title, icon, route}`，所以接口用 `key`/`route`（不是 `name`/`path`）。

```ts
import { defineStore } from 'pinia'

export interface UserInfo {
  id: number
  username: string
  real_name?: string
  email?: string
  must_change_password?: boolean
}

export interface MenuItem {
  key: string
  title: string
  route: string
  icon?: string
  children?: MenuItem[]
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    accessToken: '' as string,
    user: null as UserInfo | null,
    globalPermissions: [] as string[],
    menuTree: [] as MenuItem[],
    mustChangePassword: false,
    initialized: false,
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.accessToken && state.user),
    hasGlobalPermission: (state) => (code: string) => state.globalPermissions.includes(code),
  },
  actions: {
    setSession(payload: {
      access: string
      user: UserInfo
      global_permissions: string[]
      menu_tree: MenuItem[]
      must_change_password: boolean
    }) {
      this.accessToken = payload.access
      this.user = payload.user
      this.globalPermissions = payload.global_permissions || []
      this.menuTree = payload.menu_tree || []
      this.mustChangePassword = payload.must_change_password
      this.initialized = true
    },
    setAccessToken(access: string) {
      this.accessToken = access
    },
    clearSession() {
      this.accessToken = ''
      this.user = null
      this.globalPermissions = []
      this.menuTree = []
      this.mustChangePassword = false
      this.initialized = true
    },
  },
})
```

- [ ] **Step 3：写 `frontend/src/stores/project.ts`**

```ts
import { defineStore } from 'pinia'

export const useProjectStore = defineStore('project', {
  state: () => ({
    currentProjectId: null as number | null,
    projectPermissions: [] as string[],
  }),
  getters: {
    hasProjectPermission: (state) => (code: string) => state.projectPermissions.includes(code),
  },
  actions: {
    setProjectPermissions(projectId: number, permissions: string[]) {
      this.currentProjectId = projectId
      this.projectPermissions = permissions
    },
    clearProject() {
      this.currentProjectId = null
      this.projectPermissions = []
    },
  },
})
```

- [ ] **Step 4：创建占位页面**

`frontend/src/views/login/LoginView.vue`：

```vue
<template><div>Login</div></template>
```

`frontend/src/views/dashboard/DashboardView.vue`：

```vue
<template><div class="page"><h1>工作台</h1></div></template>
<style scoped>.page{padding:24px}</style>
```

`frontend/src/views/auth/ChangePasswordView.vue`：

```vue
<template><div class="page"><h1>修改密码</h1></div></template>
<style scoped>.page{padding:24px}</style>
```

`frontend/src/views/projects/ProjectListView.vue`：

```vue
<template><div class="page"><h1>项目管理</h1></div></template>
<style scoped>.page{padding:24px}</style>
```

- [ ] **Step 5：写 `frontend/src/router/index.ts`**

> 本 Task 先建基础守卫；Task 8 会再补「刷新页面恢复会话」的 bootstrap 逻辑（依赖 Task 8 才创建的 `@/api/auth`）。

```ts
import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes = [
  { path: '/login', name: 'login', component: () => import('@/views/login/LoginView.vue'), meta: { public: true } },
  { path: '/change-password', name: 'change-password', component: () => import('@/views/auth/ChangePasswordView.vue') },
  { path: '/', redirect: '/dashboard' },
  { path: '/dashboard', name: 'dashboard', component: () => import('@/views/dashboard/DashboardView.vue') },
  {
    path: '/projects',
    name: 'projects',
    component: () => import('@/views/projects/ProjectListView.vue'),
    meta: { permission: 'project.create', allowAuthenticated: true },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to) => {
  const auth = useAuthStore()

  if (to.meta.public) {
    return true
  }

  if (!auth.isAuthenticated) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }

  if (auth.mustChangePassword && to.path !== '/change-password') {
    return { path: '/change-password' }
  }

  const requiredPermission = to.meta.permission as string | undefined
  if (requiredPermission && !auth.hasGlobalPermission(requiredPermission) && !to.meta.allowAuthenticated) {
    return { path: '/dashboard' }
  }

  return true
})

export default router
```

- [ ] **Step 6：修改 `frontend/src/App.vue`**

```vue
<template>
  <RouterView />
</template>
```

- [ ] **Step 7：验证构建**

Run（`frontend/`）：`npm run build`

Expected：构建成功。

- [ ] **Step 8：提交**

```bash
git add frontend/src
git commit -m "feat: frontend 增加 Pinia、Router 与认证状态骨架"
```

---

## Task 8：Axios 封装、CSRF 与 refresh single-flight

**Files:**
- Create: `frontend/src/api/http.ts`
- Create: `frontend/src/api/auth.ts`
- Create: `frontend/src/api/tasks.ts`
- Create: `frontend/src/utils/cookie.ts`
- Modify: `frontend/src/router/index.ts`（增加「刷新页面恢复会话」bootstrap）
- Create: `frontend/src/api/__tests__/http.spec.ts`

- [ ] **Step 1：写 `frontend/src/utils/cookie.ts`**

```ts
export function getCookie(name: string): string {
  const cookies = document.cookie ? document.cookie.split('; ') : []
  for (const cookie of cookies) {
    const [key, ...rest] = cookie.split('=')
    if (decodeURIComponent(key) === name) {
      return decodeURIComponent(rest.join('='))
    }
  }
  return ''
}
```

- [ ] **Step 2：写 `frontend/src/api/auth.ts`**

```ts
import { http } from './http'

export interface LoginPayload {
  username: string
  password: string
}

export function login(payload: LoginPayload) {
  return http.post('/api/auth/login', payload)
}

export function refresh() {
  return http.post('/api/auth/refresh')
}

export function logout() {
  return http.post('/api/auth/logout')
}

export function me() {
  return http.get('/api/auth/me')
}

export function changePassword(payload: { old_password: string; new_password: string }) {
  return http.post('/api/auth/change-password', payload)
}
```

- [ ] **Step 3：写 `frontend/src/api/tasks.ts`**

```ts
import { http } from './http'

export function getTask(taskId: number) {
  return http.get(`/api/tasks/${taskId}`)
}
```

- [ ] **Step 4：写 `frontend/src/api/http.ts`**

> - `must_change_password` 后端返回 **403**（`MustChangePassword` 异常），拦截器据此跳转改密页。
> - refresh 调用直接用 `http.post('/api/auth/refresh')`：refresh 失败时后端返回 `token_invalid`（≠ `token_expired`），会落到下方「401 且非 token_expired」分支统一登出，不会递归触发 refresh，无需额外的跳过标记。

```ts
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'
import router from '@/router'
import { useAuthStore } from '@/stores/auth'
import { getCookie } from '@/utils/cookie'

export const http = axios.create({
  baseURL: '',
  withCredentials: true,
  timeout: 30000,
})

let refreshPromise: Promise<string> | null = null

function attachAuth(config: InternalAxiosRequestConfig) {
  const auth = useAuthStore()
  if (auth.accessToken) {
    config.headers.Authorization = `Bearer ${auth.accessToken}`
  }

  const csrfToken = getCookie('csrf_token')
  if (csrfToken) {
    config.headers['X-CSRF-Token'] = csrfToken
  }

  return config
}

http.interceptors.request.use(attachAuth)

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<any>) => {
    const response = error.response
    const originalRequest: any = error.config

    if (!response || originalRequest?._retry) {
      return Promise.reject(error)
    }

    const code = response.data?.code
    if (response.status === 401 && code === 'token_expired') {
      originalRequest._retry = true
      try {
        const access = await refreshAccessTokenOnce()
        const auth = useAuthStore()
        auth.setAccessToken(access)
        originalRequest.headers = originalRequest.headers || {}
        originalRequest.headers.Authorization = `Bearer ${access}`
        return http(originalRequest)
      } catch (refreshError) {
        const auth = useAuthStore()
        auth.clearSession()
        router.push('/login')
        return Promise.reject(refreshError)
      }
    }

    if (response.status === 403 && code === 'must_change_password') {
      router.push('/change-password')
    }

    if (response.status === 401 && code !== 'token_expired') {
      const auth = useAuthStore()
      auth.clearSession()
      router.push('/login')
    }

    return Promise.reject(error)
  },
)

async function refreshAccessTokenOnce(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = http
      .post('/api/auth/refresh')
      .then((res) => {
        const access = res.data.access
        if (!access) {
          throw new Error('refresh response missing access')
        }
        return access
      })
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}
```

> 注意：`refreshPromise` 是 Phase 3 必须实现的 single-flight 机制；否则多请求同时 access 过期时，refresh rotation 会导致旧 refresh 被重复使用，从而误退出登录。

- [ ] **Step 5：修改 `frontend/src/router/index.ts` 增加「刷新页面恢复会话」**

刷新浏览器页面会清空 Pinia 内存，access token 丢失。但 refresh token 仍在 httpOnly Cookie 里，应当用它静默换取新 access，再用 `/me` 回填会话，而不是直接跳登录页。

把 `router/index.ts` 整体替换为下面版本（在 Task 7 基础上增加 `bootstrapAuth`）：

```ts
import { createRouter, createWebHistory } from 'vue-router'
import { me, refresh } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'

const routes = [
  { path: '/login', name: 'login', component: () => import('@/views/login/LoginView.vue'), meta: { public: true } },
  { path: '/change-password', name: 'change-password', component: () => import('@/views/auth/ChangePasswordView.vue') },
  { path: '/', redirect: '/dashboard' },
  { path: '/dashboard', name: 'dashboard', component: () => import('@/views/dashboard/DashboardView.vue') },
  {
    path: '/projects',
    name: 'projects',
    component: () => import('@/views/projects/ProjectListView.vue'),
    meta: { permission: 'project.create', allowAuthenticated: true },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

// 刷新页面后用 httpOnly Cookie 里的 refresh token 静默恢复会话；
// 用 module 级 promise 做 single-flight，避免并发导航重复 bootstrap。
let bootstrapPromise: Promise<void> | null = null

async function bootstrapAuth() {
  const auth = useAuthStore()
  if (auth.initialized) {
    return
  }
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      try {
        const refreshRes = await refresh()
        const access = refreshRes.data.access
        const meRes = await me()
        // /api/auth/me 不返回顶层 must_change_password，但 user 内嵌该字段。
        auth.setSession({
          access,
          user: meRes.data.user,
          global_permissions: meRes.data.global_permissions,
          menu_tree: meRes.data.menu_tree,
          must_change_password: meRes.data.user.must_change_password,
        })
      } catch {
        auth.clearSession()
      }
    })()
  }
  await bootstrapPromise
}

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  if (!auth.initialized) {
    await bootstrapAuth()
  }

  if (to.meta.public) {
    return true
  }

  if (!auth.isAuthenticated) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }

  if (auth.mustChangePassword && to.path !== '/change-password') {
    return { path: '/change-password' }
  }

  const requiredPermission = to.meta.permission as string | undefined
  if (requiredPermission && !auth.hasGlobalPermission(requiredPermission) && !to.meta.allowAuthenticated) {
    return { path: '/dashboard' }
  }

  return true
})

export default router
```

> `bootstrapAuth` 成功后 `setSession` 会把 `initialized` 置 `true`，失败时 `clearSession` 同样置 `true`，所以只在首次导航跑一次。`refresh` / `me` 失败均视为未登录，由守卫跳 `/login`。

- [ ] **Step 6：写最小测试或跳过复杂拦截器单测**

如果项目测试基础不稳定，可先只写 `cookie` 工具测试：

`frontend/src/api/__tests__/cookie.spec.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { getCookie } from '@/utils/cookie'

describe('getCookie', () => {
  it('returns cookie value', () => {
    document.cookie = 'csrf_token=abc'
    expect(getCookie('csrf_token')).toBe('abc')
  })
})
```

- [ ] **Step 7：运行前端测试与构建**

Run（`frontend/`）：

```bash
npm run build
npx vitest run
```

Expected：构建成功；测试通过。

- [ ] **Step 8：提交**

```bash
git add frontend/src/api frontend/src/utils frontend/src/router
git commit -m "feat: frontend 增加 axios 封装与 refresh single-flight"
```

---

## Task 9：登录页与改密页（参考 CareerCompass 视觉风格重写）

**Files:**
- Modify: `frontend/src/views/login/LoginView.vue`
- Modify: `frontend/src/views/auth/ChangePasswordView.vue`
- Create: `THIRD_PARTY_NOTICES.md`

> 登录页参考开源项目 `https://github.com/arsh342/careercompass` 的登录页视觉设计：`src/app/(auth)/login/page.tsx`。该项目登录页属于 **Next.js + React + Firebase Auth + Google 登录** 实现；本项目是 **Vue3 + Vite + Element Plus + Pinia + Django/DRF JWT**，因此只参考视觉风格和布局，必须重新实现为 Vue 页面，禁止复制 Firebase/Firestore/Google 登录逻辑，页面中不得出现 `CareerCompass`、`Firebase`、`Google 登录`、`Sign Up` 等内容。

### Task 9 实现约束

- 视觉目标：浅色现代企业 SaaS 登录页、大留白、圆角卡片、柔和渐变、左右分栏。
- 左侧品牌展示区：
  - 系统名称：`AI 标书生成系统`
  - 副标题：`企业级投标文件智能生成平台`
  - 3 个能力点：`招标文件智能解析`、`知识库辅助生成`、`标书体检与导出`
- 右侧登录卡片：
  - 标题：`欢迎回来`
  - 说明：`请输入账号和密码登录`
  - 账号输入框、密码输入框、显示/隐藏密码、记住登录、忘记密码、登录按钮、错误提示
- 使用 Element Plus `el-form` 做表单校验。
- 登录接口调用 `POST /api/auth/login`。
- 登录成功后：
  - 把 `access` token 存入 Pinia `auth` store 内存。
  - 保存 `user`、`global_permissions`、`menu_tree`、`must_change_password`。
  - `must_change_password=true` 跳转 `/change-password`。
  - 否则跳转 `/dashboard` 或 `redirect` 参数指定页面。
- refresh token 由后端通过 `httpOnly Cookie` 管理，前端不要存 refresh token。
- 按上游 LICENSE 实际情况把许可归属说明保留到 `THIRD_PARTY_NOTICES.md`。

- [ ] **Step 1：写 `THIRD_PARTY_NOTICES.md`**

先确认上游仓库 `https://github.com/arsh342/careercompass` 的 `LICENSE` 文件：核对其许可协议类型与版权行（`Copyright (c) <年份> <持有人>`），**以上游 LICENSE 实际内容为准**，不要凭空写年份/持有人。

> 若上游仓库无 `LICENSE` 文件、或协议并非 MIT，则不得标注为 MIT；改为如实记录实际情况（例如「未声明许可」），必要时改用不依赖该参考的自有视觉实现。

按上游实际信息填写（下例 `Copyright` 行需替换为 LICENSE 中的真实文本）：

```md
# Third Party Notices

This project references UI design ideas from:

CareerCompass
https://github.com/arsh342/careercompass

Original project licensed under the MIT License.
<这里填上游 LICENSE 中的真实版权行，例如 Copyright (c) <年份> <持有人>>

Only the login page visual layout was referenced and reimplemented for Vue3.
Firebase/Next.js/Firebase Auth/Google Sign-In business logic was not reused.
```

- [ ] **Step 2：实现 `LoginView.vue`**

```vue
<template>
  <main class="login-page">
    <section class="brand-panel">
      <div class="brand-shell">
        <div class="brand-logo">
          <span>AI</span>
        </div>
        <div>
          <div class="brand-eyebrow">AI BID PLATFORM</div>
          <h1>AI 标书生成系统</h1>
        </div>
      </div>

      <p class="subtitle">企业级投标文件智能生成平台</p>
      <p class="description">
        从招标文件解析、知识库检索、章节生成到标书体检与导出，帮助投标团队更高效、更规范地完成标书生产。
      </p>

      <div class="features">
        <div v-for="item in features" :key="item.title" class="feature-card">
          <div class="feature-icon">{{ item.icon }}</div>
          <div>
            <h3>{{ item.title }}</h3>
            <p>{{ item.desc }}</p>
          </div>
        </div>
      </div>

      <div class="brand-footer">
        <span>私有化部署</span>
        <span>·</span>
        <span>企业数据隔离</span>
        <span>·</span>
        <span>权限审计</span>
      </div>
    </section>

    <section class="form-panel">
      <el-card class="login-card" shadow="never">
        <div class="mobile-brand">
          <div class="brand-logo small"><span>AI</span></div>
          <span>AI 标书生成系统</span>
        </div>

        <div class="card-header">
          <h2>欢迎回来</h2>
          <p>请输入账号和密码登录</p>
        </div>

        <el-alert
          v-if="errorMessage"
          :title="errorMessage"
          type="error"
          show-icon
          :closable="false"
          class="login-error"
        />

        <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @keyup.enter="handleSubmit">
          <el-form-item label="账号" prop="username">
            <el-input
              v-model="form.username"
              size="large"
              placeholder="请输入账号"
              autocomplete="username"
              clearable
            />
          </el-form-item>

          <el-form-item label="密码" prop="password">
            <el-input
              v-model="form.password"
              size="large"
              placeholder="请输入密码"
              autocomplete="current-password"
              show-password
              type="password"
            />
          </el-form-item>

          <div class="form-row">
            <el-checkbox v-model="rememberMe">记住登录</el-checkbox>
            <el-link type="primary" :underline="false">忘记密码？联系管理员</el-link>
          </div>

          <el-button type="primary" size="large" class="login-button" :loading="loading" @click="handleSubmit">
            登录系统
          </el-button>
        </el-form>

        <p class="terms">登录即表示你同意企业内部系统使用规范与数据保密要求。</p>
      </el-card>
    </section>
  </main>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { login } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const formRef = ref<FormInstance>()
const loading = ref(false)
const errorMessage = ref('')
const rememberMe = ref(false)

const form = reactive({
  username: '',
  password: '',
})

const rules: FormRules = {
  username: [{ required: true, message: '请输入账号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

const features = [
  { icon: '📄', title: '招标文件智能解析', desc: '自动提取项目、资格、评分与风险信息' },
  { icon: '🧠', title: '知识库辅助生成', desc: '结合企业资料生成可追溯的章节初稿' },
  { icon: '✅', title: '标书体检与导出', desc: '检查响应、偏离、资质与格式后导出 Word/PDF' },
]

async function handleSubmit() {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  loading.value = true
  errorMessage.value = ''
  try {
    const response = await login({ username: form.username, password: form.password })
    auth.setSession(response.data)

    if (response.data.must_change_password) {
      await router.push('/change-password')
      return
    }

    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/dashboard'
    await router.push(redirect)
  } catch (error: any) {
    errorMessage.value = error.response?.data?.message || '登录失败，请检查账号或密码'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(420px, 0.92fr);
  background:
    radial-gradient(circle at 18% 16%, rgba(37, 99, 235, 0.16), transparent 34%),
    radial-gradient(circle at 80% 88%, rgba(16, 185, 129, 0.12), transparent 28%),
    linear-gradient(135deg, #f8fbff 0%, #eef4ff 45%, #f7fafc 100%);
  color: var(--app-text-primary);
  overflow: hidden;
}

.brand-panel {
  position: relative;
  padding: 72px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.brand-panel::before,
.brand-panel::after {
  content: '';
  position: absolute;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.54);
  filter: blur(1px);
}

.brand-panel::before {
  width: 220px;
  height: 220px;
  right: 10%;
  top: 12%;
}

.brand-panel::after {
  width: 120px;
  height: 120px;
  left: 10%;
  bottom: 12%;
}

.brand-shell,
.subtitle,
.description,
.features,
.brand-footer {
  position: relative;
  z-index: 1;
}

.brand-shell {
  display: flex;
  gap: 16px;
  align-items: center;
}

.brand-logo {
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  border-radius: 18px;
  background: linear-gradient(135deg, #2563eb, #10b981);
  color: #fff;
  font-weight: 800;
  box-shadow: 0 18px 40px rgba(37, 99, 235, 0.22);
}

.brand-logo.small {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  font-size: 13px;
}

.brand-eyebrow {
  width: fit-content;
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.1);
  color: var(--app-primary);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.brand-panel h1 {
  margin: 20px 0 0;
  font-size: 52px;
  line-height: 1.08;
  letter-spacing: -0.04em;
}

.subtitle {
  color: var(--app-text-primary);
  font-size: 22px;
  font-weight: 700;
  margin: 28px 0 10px;
}

.description {
  max-width: 640px;
  margin: 0 0 36px;
  color: var(--app-text-secondary);
  font-size: 16px;
  line-height: 1.8;
}

.features {
  display: grid;
  gap: 16px;
  max-width: 590px;
}

.feature-card {
  display: flex;
  gap: 16px;
  padding: 18px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(229, 231, 235, 0.82);
  border-radius: var(--app-radius);
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.06);
  backdrop-filter: blur(14px);
}

.feature-icon {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 14px;
  background: #f8fafc;
  font-size: 22px;
}

.feature-card h3 {
  margin: 0 0 6px;
  font-size: 16px;
}

.feature-card p {
  margin: 0;
  color: var(--app-text-secondary);
  line-height: 1.6;
}

.brand-footer {
  display: flex;
  gap: 10px;
  margin-top: 34px;
  color: var(--app-text-secondary);
  font-size: 13px;
}

.form-panel {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px;
}

.login-card {
  width: 430px;
  border: 1px solid rgba(229, 231, 235, 0.9);
  border-radius: 24px;
  box-shadow: var(--app-shadow);
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(18px);
}

.mobile-brand {
  display: none;
  align-items: center;
  gap: 10px;
  margin-bottom: 22px;
  font-weight: 800;
}

.card-header {
  margin-bottom: 28px;
}

.card-header h2 {
  margin: 0 0 8px;
  font-size: 28px;
}

.card-header p,
.terms {
  color: var(--app-text-secondary);
}

.login-error {
  margin-bottom: 18px;
}

.form-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 4px 0 22px;
}

.login-button {
  width: 100%;
  border-radius: 12px;
  font-weight: 700;
}

.terms {
  margin: 18px 0 0;
  font-size: 12px;
  text-align: center;
  line-height: 1.6;
}

@media (max-width: 960px) {
  .login-page {
    grid-template-columns: 1fr;
  }

  .brand-panel {
    display: none;
  }

  .form-panel {
    padding: 28px;
  }

  .login-card {
    width: 100%;
  }

  .mobile-brand {
    display: flex;
  }
}
</style>
```

- [ ] **Step 3：实现 `ChangePasswordView.vue`**

```vue
<template>
  <main class="change-page">
    <el-card class="change-card" shadow="never">
      <h2>修改初始密码</h2>
      <p>为了账号安全，请先修改密码后继续使用系统。</p>

      <el-alert v-if="errorMessage" :title="errorMessage" type="error" show-icon :closable="false" />

      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <el-form-item label="旧密码" prop="old_password">
          <el-input v-model="form.old_password" type="password" show-password size="large" />
        </el-form-item>
        <el-form-item label="新密码" prop="new_password">
          <el-input v-model="form.new_password" type="password" show-password size="large" />
        </el-form-item>
        <el-button type="primary" size="large" :loading="loading" class="submit" @click="handleSubmit">
          保存并进入系统
        </el-button>
      </el-form>
    </el-card>
  </main>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { useRouter } from 'vue-router'
import { changePassword } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()
const formRef = ref<FormInstance>()
const loading = ref(false)
const errorMessage = ref('')

const form = reactive({
  old_password: '',
  new_password: '',
})

const rules: FormRules = {
  old_password: [{ required: true, message: '请输入旧密码', trigger: 'blur' }],
  new_password: [{ required: true, min: 8, message: '新密码至少 8 位', trigger: 'blur' }],
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  loading.value = true
  errorMessage.value = ''
  try {
    await changePassword(form)
    auth.mustChangePassword = false
    await router.push('/dashboard')
  } catch (error: any) {
    errorMessage.value = error.response?.data?.message || '修改密码失败'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.change-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: var(--app-bg);
}
.change-card {
  width: 420px;
  border-radius: 20px;
  box-shadow: var(--app-shadow);
}
.submit {
  width: 100%;
}
</style>
```

- [ ] **Step 4：Task 9 验收检查**

检查项：

```txt
1. 登录页文件路径为 frontend/src/views/login/LoginView.vue。
2. 页面为 Vue3 + Element Plus 实现，不存在 React/Next.js/Firebase/Firestore/Google 登录代码。
3. 页面不出现 CareerCompass、Firebase、Google、Sign Up 文案。
4. 左侧品牌区包含 AI 标书生成系统、企业级投标文件智能生成平台和 3 个能力点。
5. 右侧登录卡片包含欢迎回来、账号、密码、show-password、记住登录、忘记密码、错误提示、登录按钮。
6. 登录接口为 POST /api/auth/login。
7. 成功后保存 access/user/global_permissions/menu_tree/must_change_password 到 Pinia auth store。
8. must_change_password=true 跳转 /change-password，否则跳转 /dashboard 或 redirect。
9. refresh token 不在前端保存，只依赖后端 httpOnly Cookie。
10. THIRD_PARTY_NOTICES.md 已按上游 LICENSE 如实记录许可与版权归属。
```

- [ ] **Step 5：构建验证**

Run（`frontend/`）：`npm run build`

Expected：构建成功。

- [ ] **Step 6：提交**

```bash
git add frontend/src/views/login/LoginView.vue frontend/src/views/auth/ChangePasswordView.vue THIRD_PARTY_NOTICES.md
git commit -m "feat: frontend 参考 CareerCompass 视觉风格实现登录页"
```

---

## Task 10：主布局、菜单与 Dashboard

**Files:**
- Create: `frontend/src/layout/MainLayout.vue`
- Modify: `frontend/src/router/index.ts`
- Modify: `frontend/src/views/dashboard/DashboardView.vue`
- Modify: `frontend/src/views/projects/ProjectListView.vue`

- [ ] **Step 1：实现 `MainLayout.vue`**

> 侧边栏菜单优先消费 `auth.menuTree`（后端 `build_menu_tree` 下发，形状 `{key, title, route}`）；`menuTree` 为空时回退到静态菜单，保证骨架期可用。

```vue
<template>
  <el-container class="app-shell">
    <el-aside width="248px" class="sidebar">
      <div class="logo">
        <div class="logo-mark">AI</div>
        <div>
          <strong>AI 标书生成系统</strong>
          <span>Bid Platform</span>
        </div>
      </div>

      <el-menu router :default-active="$route.path" class="menu">
        <template v-if="auth.menuTree.length">
          <el-menu-item v-for="item in auth.menuTree" :key="item.key" :index="item.route">
            {{ item.title }}
          </el-menu-item>
        </template>
        <template v-else>
          <el-menu-item index="/dashboard">工作台</el-menu-item>
          <el-menu-item index="/projects">项目管理</el-menu-item>
          <el-menu-item index="/tender/upload">招标文件</el-menu-item>
        </template>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="header">
        <div class="breadcrumb">当前位置：{{ $route.meta.title || '工作台' }}</div>
        <div class="user-area">
          <span>{{ auth.user?.real_name || auth.user?.username }}</span>
          <el-button text @click="handleLogout">退出</el-button>
        </div>
      </el-header>

      <el-main class="main">
        <RouterView />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { logout } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()

async function handleLogout() {
  try {
    await logout()
  } finally {
    auth.clearSession()
    router.push('/login')
  }
}
</script>

<style scoped>
.app-shell {
  min-height: 100vh;
}
.sidebar {
  background: #ffffff;
  border-right: 1px solid var(--app-border);
  padding: 18px 12px;
}
.logo {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 10px 12px 24px;
}
.logo-mark {
  width: 40px;
  height: 40px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  background: var(--app-primary);
  color: white;
  font-weight: 800;
}
.logo span {
  display: block;
  color: var(--app-text-secondary);
  font-size: 12px;
  margin-top: 2px;
}
.menu {
  border-right: 0;
}
.header {
  background: rgba(255, 255, 255, 0.86);
  border-bottom: 1px solid var(--app-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  backdrop-filter: blur(16px);
}
.breadcrumb {
  color: var(--app-text-secondary);
}
.user-area {
  display: flex;
  align-items: center;
  gap: 12px;
}
.main {
  background: var(--app-bg);
  padding: 24px;
}
</style>
```

- [ ] **Step 2：调整 `router/index.ts` 使用 Layout**

把 `/dashboard`、`/projects`、`/tender/upload` 放到 `MainLayout` 子路由下（保留 Task 8 的 `bootstrapAuth` 与 `beforeEach`，只改 `routes` 数组）：

```ts
{
  path: '/',
  component: () => import('@/layout/MainLayout.vue'),
  children: [
    { path: '', redirect: '/dashboard' },
    { path: 'dashboard', name: 'dashboard', component: () => import('@/views/dashboard/DashboardView.vue'), meta: { title: '工作台' } },
    { path: 'projects', name: 'projects', component: () => import('@/views/projects/ProjectListView.vue'), meta: { title: '项目管理' } },
    { path: 'tender/upload', name: 'tender-upload', component: () => import('@/views/tender/TenderUploadView.vue'), meta: { title: '招标文件上传' } },
  ],
}
```

> `TenderUploadView` Task 12 创建；此时可先创建占位文件。

- [ ] **Step 3：补 Dashboard 与项目占位页面视觉**

`DashboardView.vue`：

```vue
<template>
  <div class="dashboard">
    <div class="hero">
      <h1>工作台</h1>
      <p>从招标文件上传、AI 解析、章节生成到导出，全流程管理投标项目。</p>
    </div>

    <div class="cards">
      <el-card v-for="item in stats" :key="item.label" shadow="never" class="stat-card">
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
const stats = [
  { label: '进行中项目', value: 0 },
  { label: '待解析文件', value: 0 },
  { label: '待处理任务', value: 0 },
  { label: '已导出标书', value: 0 },
]
</script>

<style scoped>
.hero {
  padding: 28px;
  background: linear-gradient(135deg, #ffffff, #eef4ff);
  border: 1px solid var(--app-border);
  border-radius: 24px;
}
.hero h1 {
  margin: 0 0 8px;
}
.hero p {
  margin: 0;
  color: var(--app-text-secondary);
}
.cards {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  margin-top: 18px;
}
.stat-card {
  border-radius: 18px;
}
.stat-card span {
  color: var(--app-text-secondary);
}
.stat-card strong {
  display: block;
  margin-top: 10px;
  font-size: 30px;
}
</style>
```

- [ ] **Step 4：构建验证**

Run（`frontend/`）：`npm run build`

Expected：构建成功。

- [ ] **Step 5：提交**

```bash
git add frontend/src/layout frontend/src/router frontend/src/views/dashboard frontend/src/views/projects
git commit -m "feat: frontend 增加主布局与工作台页面"
```

---

## Task 11：前端 Tender API 与任务进度组件

**Files:**
- Create: `frontend/src/api/tender.ts`
- Create: `frontend/src/components/task/TaskProgress.vue`

- [ ] **Step 1：写 `frontend/src/api/tender.ts`**

```ts
import axios from 'axios'
import { http } from './http'

export interface InitUploadPayload {
  project_id: number
  lot_id?: number | null
  file_name: string
  file_size: number
  content_type: string
  file_category: 'tender_file' | 'attachment' | 'clarification'
}

export function initUpload(payload: InitUploadPayload) {
  return http.post('/api/tender/files/init-upload', payload)
}

export function completeUpload(fileId: number) {
  return http.post(`/api/tender/files/${fileId}/complete-upload`)
}

export function listTenderFiles(projectId: number) {
  return http.get('/api/tender/files', { params: { project_id: projectId } })
}

export function putToPresignedUrl(uploadUrl: string, file: File, onProgress?: (percent: number) => void) {
  return axios.put(uploadUrl, file, {
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
    },
    onUploadProgress(event) {
      if (!event.total) return
      onProgress?.(Math.round((event.loaded / event.total) * 100))
    },
  })
}
```

> `putToPresignedUrl` 用裸 `axios.put`（不走 `http` 实例）：预签名 URL 直传 MinIO，不能带 `Authorization`/`X-CSRF-Token`，也不能套 `baseURL`。

- [ ] **Step 2：写 `frontend/src/components/task/TaskProgress.vue`**

```vue
<template>
  <el-card v-if="task" class="task-card" shadow="never">
    <div class="task-header">
      <strong>{{ title }}</strong>
      <el-tag :type="tagType">{{ task.status }}</el-tag>
    </div>
    <el-progress :percentage="task.progress || 0" />
    <p class="step">{{ task.current_step || '等待中' }}</p>
    <el-alert v-if="task.error_message" :title="task.error_message" type="error" show-icon :closable="false" />
  </el-card>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { getTask } from '@/api/tasks'

const props = defineProps<{
  taskId: number | null
  title?: string
}>()

const emit = defineEmits<{
  success: [task: any]
  failed: [task: any]
}>()

const task = ref<any>(null)
let timer: number | undefined

const title = computed(() => props.title || '任务进度')
const tagType = computed(() => {
  if (!task.value) return 'info'
  if (task.value.status === 'success') return 'success'
  if (task.value.status === 'failed') return 'danger'
  return 'warning'
})

async function poll() {
  if (!props.taskId) return
  const res = await getTask(props.taskId)
  task.value = res.data

  if (res.data.status === 'success') {
    clear()
    emit('success', res.data)
  } else if (res.data.status === 'failed') {
    clear()
    emit('failed', res.data)
  }
}

function clear() {
  if (timer) {
    window.clearInterval(timer)
    timer = undefined
  }
}

watch(
  () => props.taskId,
  async (id) => {
    clear()
    task.value = null
    if (!id) return
    await poll()
    timer = window.setInterval(poll, 2000)
  },
  { immediate: true },
)

onBeforeUnmount(clear)
</script>

<style scoped>
.task-card {
  margin-top: 18px;
  border-radius: 16px;
}
.task-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.step {
  color: var(--app-text-secondary);
  margin-bottom: 0;
}
</style>
```

- [ ] **Step 3：构建验证**

Run（`frontend/`）：`npm run build`

Expected：构建成功。

- [ ] **Step 4：提交**

```bash
git add frontend/src/api/tender.ts frontend/src/components/task/TaskProgress.vue
git commit -m "feat: frontend 增加 Tender API 与任务进度组件"
```

---

## Task 12：预签名直传组件与招标文件上传页

**Files:**
- Create: `frontend/src/components/upload/PresignedFileUploader.vue`
- Create/Modify: `frontend/src/views/tender/TenderUploadView.vue`

- [ ] **Step 1：创建目录与上传组件 `PresignedFileUploader.vue`**

```vue
<template>
  <el-card class="upload-card" shadow="never">
    <el-upload
      drag
      :auto-upload="false"
      :limit="1"
      :on-change="handleFileChange"
      :on-remove="handleRemove"
      :file-list="fileList"
    >
      <div class="upload-inner">
        <div class="upload-icon">⬆</div>
        <div class="upload-title">拖拽招标文件到这里，或点击选择</div>
        <div class="upload-desc">支持 PDF、DOCX、TXT、ZIP；v1 单文件上传</div>
      </div>
    </el-upload>

    <div v-if="selectedFile" class="meta">
      <el-select v-model="fileCategory" placeholder="文件类别">
        <el-option label="招标文件" value="tender_file" />
        <el-option label="附件" value="attachment" />
        <el-option label="澄清/补遗" value="clarification" />
      </el-select>

      <el-button type="primary" :loading="uploading" @click="startUpload">
        开始上传
      </el-button>
    </div>

    <el-progress v-if="uploading || uploadPercent > 0" :percentage="uploadPercent" />

    <TaskProgress :task-id="taskId" title="解析任务" @success="handleTaskSuccess" />
  </el-card>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { UploadFile, UploadUserFile } from 'element-plus'
import { ElMessage } from 'element-plus'
import { completeUpload, initUpload, putToPresignedUrl } from '@/api/tender'
import TaskProgress from '@/components/task/TaskProgress.vue'

const props = defineProps<{
  projectId: number
  lotId?: number | null
}>()

const emit = defineEmits<{
  uploaded: [payload: any]
}>()

const fileList = ref<UploadUserFile[]>([])
const selectedFile = ref<File | null>(null)
const fileCategory = ref<'tender_file' | 'attachment' | 'clarification'>('tender_file')
const uploading = ref(false)
const uploadPercent = ref(0)
const taskId = ref<number | null>(null)

function handleFileChange(uploadFile: UploadFile) {
  selectedFile.value = uploadFile.raw || null
  fileList.value = uploadFile.raw ? [uploadFile] : []
  uploadPercent.value = 0
  taskId.value = null
}

function handleRemove() {
  selectedFile.value = null
  fileList.value = []
  uploadPercent.value = 0
  taskId.value = null
}

async function startUpload() {
  if (!selectedFile.value) return

  uploading.value = true
  try {
    const file = selectedFile.value
    const initRes = await initUpload({
      project_id: props.projectId,
      lot_id: props.lotId || null,
      file_name: file.name,
      file_size: file.size,
      content_type: file.type || 'application/octet-stream',
      file_category: fileCategory.value,
    })

    await putToPresignedUrl(initRes.data.upload_url, file, (percent) => {
      uploadPercent.value = percent
    })

    const completeRes = await completeUpload(initRes.data.file_id)
    taskId.value = completeRes.data.task_id
    emit('uploaded', completeRes.data)

    if (!taskId.value) {
      ElMessage.success('上传完成')
    } else {
      ElMessage.success('上传完成，已进入解析队列')
    }
  } catch (error: any) {
    ElMessage.error(error.response?.data?.message || '上传失败')
  } finally {
    uploading.value = false
  }
}

function handleTaskSuccess() {
  ElMessage.success('解析任务完成')
}
</script>

<style scoped>
.upload-card {
  border-radius: 18px;
}
.upload-inner {
  padding: 28px 0;
}
.upload-icon {
  font-size: 36px;
  color: var(--app-primary);
}
.upload-title {
  margin-top: 10px;
  font-weight: 700;
}
.upload-desc {
  margin-top: 6px;
  color: var(--app-text-secondary);
}
.meta {
  margin: 18px 0;
  display: flex;
  gap: 12px;
}
</style>
```

- [ ] **Step 2：实现 `TenderUploadView.vue`**

```vue
<template>
  <div class="upload-view">
    <div class="page-header">
      <div>
        <h1>招标文件上传</h1>
        <p>通过 MinIO 预签名 URL 直传文件，上传完成后自动创建解析任务。</p>
      </div>
    </div>

    <el-card class="config-card" shadow="never">
      <el-form inline>
        <el-form-item label="项目 ID">
          <el-input-number v-model="projectId" :min="1" />
        </el-form-item>
        <el-form-item label="标段 ID">
          <el-input-number v-model="lotId" :min="1" placeholder="可选" />
        </el-form-item>
      </el-form>
      <p class="hint">v1 暂用项目 ID/标段 ID 手工输入；完整项目选择器由 projects 模块后续实现。</p>
    </el-card>

    <PresignedFileUploader :project-id="projectId" :lot-id="lotId" @uploaded="loadFiles" />

    <el-card class="list-card" shadow="never">
      <template #header>已上传文件</template>
      <el-table :data="files" empty-text="暂无文件">
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="original_name" label="文件名" />
        <el-table-column prop="file_category" label="类别" width="120" />
        <el-table-column prop="status" label="状态" width="140" />
        <el-table-column prop="created_at" label="上传时间" width="220" />
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import PresignedFileUploader from '@/components/upload/PresignedFileUploader.vue'
import { listTenderFiles } from '@/api/tender'

const projectId = ref(1)
const lotId = ref<number | null>(null)
const files = ref<any[]>([])

async function loadFiles() {
  const res = await listTenderFiles(projectId.value)
  files.value = res.data
}
</script>

<style scoped>
.upload-view {
  display: grid;
  gap: 18px;
}
.page-header {
  padding: 26px;
  border-radius: 24px;
  background: #ffffff;
  border: 1px solid var(--app-border);
}
.page-header h1 {
  margin: 0 0 8px;
}
.page-header p,
.hint {
  margin: 0;
  color: var(--app-text-secondary);
}
.config-card,
.list-card {
  border-radius: 18px;
}
</style>
```

- [ ] **Step 3：构建验证**

Run（`frontend/`）：`npm run build`

Expected：构建成功。

- [ ] **Step 4：提交**

```bash
git add frontend/src/components/upload frontend/src/views/tender/TenderUploadView.vue
git commit -m "feat: frontend 增加 MinIO 预签名直传上传页"
```

---

## Task 13：Nginx 服务与 7 服务 Docker Compose

**Files:**
- Create: `nginx/nginx.conf`
- Modify: `docker-compose.yml`
- Modify: `.env.example`

- [ ] **Step 1：写 `nginx/nginx.conf`**

```nginx
server {
    listen 80;
    server_name _;

    client_max_body_size 200m;

    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://web:8000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    # 可选：浏览器经 nginx 访问 MinIO，便于生产统一域名。
    location /minio/ {
        proxy_pass http://minio:9000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_request_buffering off;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
```

- [ ] **Step 2：修改 `docker-compose.yml` 增加 frontend build + nginx**

追加服务：

```yaml
  nginx:
    image: nginx:1.27-alpine
    depends_on:
      - web
      - minio
    ports:
      - "80:80"
    volumes:
      - ./frontend/dist:/usr/share/nginx/html:ro
      - ./nginx/nginx.conf:/etc/nginx/conf.d/default.conf:ro
```

说明：v1 使用本地 `npm run build` 生成 `frontend/dist`，nginx 直接挂载静态产物；后续可改为多阶段镜像。

- [ ] **Step 3：在 `docker-compose.yml` 的 `x-backend-env` 锚点补 `MINIO_PUBLIC_ENDPOINT`**

`x-backend-env` 锚点目前只有 `MINIO_ENDPOINT: minio:9000`（容器内网地址）。`web` 容器据此生成预签名 URL，但浏览器无法访问 `minio:9000`。补上浏览器可达地址：

```yaml
x-backend-env: &backend-env
  # ...其余变量保持不变...
  MINIO_ENDPOINT: minio:9000
  MINIO_PUBLIC_ENDPOINT: localhost:9000
```

这样 Task 1 的 `StorageService._presign` 会用 `localhost:9000` 签名，浏览器可直接 PUT；`_ops` 仍用 `minio:9000` 走容器内网。

- [ ] **Step 4：更新 `.env.example`**

若本地经 nginx 访问 MinIO，可设置：

```env
MINIO_PUBLIC_ENDPOINT=localhost:9000
```

如果改为 `/minio/` 路径反代，MinIO 预签名 URL 的 path 风格与签名会复杂化，v1 不推荐。保持 `localhost:9000` 简单直连。

- [ ] **Step 5：构建前端并启动 nginx**

Run（仓库根）：

```bash
cd frontend && npm run build && cd ..
docker compose up -d web worker beat nginx
docker compose ps
```

Expected：`nginx`、`web`、`worker`、`beat` 等服务 running；浏览器访问 `http://localhost` 出现前端页面。

- [ ] **Step 6：提交**

```bash
git add nginx/nginx.conf docker-compose.yml .env.example
git commit -m "chore: 增加 nginx 服务形成 7 服务部署拓扑"
```

---

## Task 14：前后端认证与上传联调脚本

**Files:**
- Create: `docs/dev/phase3-manual-test.md`

- [ ] **Step 1：写手工联调说明 `docs/dev/phase3-manual-test.md`**

```md
# Phase 3 手工联调清单

## 1. 启动服务

```bash
cp .env.example .env
docker compose up -d postgres redis minio
cd backend
source .venv/bin/activate
python manage.py migrate
python manage.py sync_permissions
python manage.py runserver 0.0.0.0:8000
```

另开终端：

```bash
cd backend
source .venv/bin/activate
celery -A config worker -l info -Q parse_queue,kb_queue,ai_queue,export_queue,notify_queue
```

前端：

```bash
cd frontend
npm run dev
```

## 2. 准备测试账号与项目

用 Django shell 创建：
- system_admin 或 bid_manager 用户
- Project
- ProjectMember(owner)

## 3. 登录联调

1. 打开 `http://localhost:5173/login`
2. 输入账号密码
3. 成功后跳转 `/dashboard`
4. DevTools 确认：
   - access 不在 localStorage
   - refresh_token 是 httpOnly Cookie
   - csrf_token 是普通 Cookie
5. access 过期后触发 refresh single-flight，接口自动重试
6. 登录后刷新浏览器页面，应保持登录态（refresh + me 自动恢复会话），不被踢回登录页

## 4. 上传联调

1. 进入 `/tender/upload`
2. 输入 project_id
3. 选择 PDF/DOCX
4. 点击上传
5. 确认：
   - `init-upload` 返回 presigned URL
   - 浏览器 PUT 到 MinIO
   - `complete-upload` 返回 `task_id`
   - TaskProgress 轮询到 success
   - 文件列表状态变为 parsed 或 ready

## 5. 权限联调

1. 非项目成员上传应返回 403
2. viewer 上传应返回 403
3. owner 上传成功
4. system_admin 不需要 ProjectMember 也可查看/操作

## 6. 异常联调

1. 上传伪造 pdf 的 txt 内容，应 rejected
2. 删除 MinIO 对象后 complete-upload，应 404
3. 重复 complete-upload，不应重复创建 AsyncTask
```

- [ ] **Step 2：提交**

```bash
git add docs/dev/phase3-manual-test.md
git commit -m "docs: 增加 Phase 3 前后端联调清单"
```

---

## Task 15：全量校验

**Files:**
- 无新增；仅校验。

- [ ] **Step 1：后端迁移检查**

Run（`backend/`）：

```bash
python manage.py makemigrations --check --dry-run
```

Expected：`No changes detected`。

- [ ] **Step 2：后端测试**

Run（`backend/`）：

```bash
pytest -v
```

Expected：全部通过，无 `failed` / `error`。

- [ ] **Step 3：Django 系统检查**

Run（`backend/`）：

```bash
python manage.py check
```

Expected：`System check identified no issues (0 silenced).`

- [ ] **Step 4：前端测试与构建**

Run（`frontend/`）：

```bash
npx vitest run
npm run build
```

Expected：测试通过，构建成功。

- [ ] **Step 5：Docker Compose 7 服务检查**

Run（仓库根）：

```bash
docker compose up -d postgres redis minio web worker beat nginx
docker compose ps
```

Expected：7 个服务均 running。

- [ ] **Step 6：提交（如有改动）**

```bash
git add -A
git commit -m "chore: Phase 3 全量校验通过" || echo "无改动可提交"
```

---

## 完成标准（Phase 3 Definition of Done）

- `frontend/` Vue3 + Vite + TypeScript 工程可 `npm run build`。
- 登录页为浅色现代 SaaS 风格；已用 Vue3 + Element Plus 重新实现；无 CareerCompass/Firebase/Google 登录/Sign Up 逻辑。
- `THIRD_PARTY_NOTICES.md` 已按上游 LICENSE 如实记录 CareerCompass 视觉参考来源与许可。
- Axios 自动注入 Authorization 与 `X-CSRF-Token`；`401 token_expired` 可 refresh single-flight 后重放请求。
- access token 仅存 Pinia 内存；refresh token 仅由后端 httpOnly Cookie 管理；刷新页面可经 refresh+me 恢复会话。
- `GET /api/tasks/{id}` 可返回当前用户有权查看的任务状态。
- `POST /api/tender/files/init-upload` 可生成 MinIO 预签名 PUT URL。
- 前端可直接 PUT 文件到 MinIO，并显示上传进度。
- `POST /api/tender/files/{id}/complete-upload` 幂等；服务端以 MinIO `stat_object` 与文件头校验为准。
- 伪造类型或大小不一致的文件会置为 `rejected`，不会进入解析队列。
- 需要解析的文件进入 `parse_queue` 并创建 `AsyncTask`；附件类文件直接 `ready`。
- `cleanup-stale-uploads-hourly` 已加入 Celery Beat。
- `nginx` 加入 Compose，形成 `nginx/web/worker/beat/postgres/redis/minio` 7 服务拓扑。
- 后端 `pytest -v`、`python manage.py check`、前端 `npm run build` 全部通过。

---

## 给执行者的提示

- 本阶段目标是「前端基础闭环 + 预签名上传闭环」，**不要实现真实招标文件解析、OCR、AI 概要生成**；`parse_tender_file` 只是占位任务，真实解析属于 tender 后续 spec。
- 不要把 refresh token 放 localStorage/sessionStorage；前端 JS 不应读取 refresh token。
- Axios refresh 必须 single-flight；不要让多个并发请求同时 refresh。
- `complete-upload` 必须幂等，重复调用不应重复创建 `AsyncTask`。
- 预签名 URL 的 `object_key` 必须由后端生成；前端只拿 URL 上传，不能传对象路径。
- 预签名 URL 生成后不可改写 host；`StorageService` 用 `_presign`/`_ops` 双 client 区分浏览器可达地址与容器内网地址。
- 文件校验必须以 MinIO `stat_object` 和服务端读取文件头为准，不信任客户端 `content_type`、`size`、`etag`。
- v1 不做分片上传、不做 ClamAV、不做 SSE/WebSocket；这些只保留扩展点。
- 新增受控端点必须使用 Phase 2 的权限体系，统一走 `RequirePermission`（必要时配 `get_permission_project`），禁止在视图里散写鉴权逻辑或绕过 `permission_service`。
- 异常一律用 `apps.common.exceptions` 已有子类，不要再向 `APIError` 传 `status_code`。
- 登录页可以参考 CareerCompass 的视觉风格，但必须重新实现为 Vue3 页面，并移除原项目品牌与 Firebase/Google 逻辑。
- 每个 Task 结束都应提交一次；保持 TDD 顺序：先写失败测试 → 看失败 → 最小实现 → 看通过 → 提交。
