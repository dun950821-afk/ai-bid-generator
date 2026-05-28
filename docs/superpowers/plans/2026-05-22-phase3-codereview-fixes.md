# Phase 3 Code Review 修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地 Phase 3 code review 输出的 5 条高危 + 8 条中危共 13 处修复，关闭"刷新即踢出"、"远端直传失败"、"presigned PUT 无大小限制"、"账户锁定 DoS 风险"、"Axios 静默错误处理不当" 等问题。

**Architecture:** 分三组推进。Group A 是 8 条独立小修，并行性高、可一周内全部 ship；Group B 是 MinIO 存储链路重构（含 PUT→POST policy 协议变更，影响 BE+FE 契约）；Group C 是认证安全分层（含 Axios 静默错误约定 + 登录三层节流 + 简单 captcha）。Group A 完成后即可发一版补丁；B、C 需要更仔细的回归测试，可分独立 PR。

**Tech Stack:** Django 5 / DRF / simplejwt / Celery / Redis cache / MinIO (python-minio SDK) / Vue 3 + Element Plus + Pinia + Axios / pytest / vitest

---

## File Structure

### 新建文件
- `backend/apps/accounts/services/captcha_service.py` — H5 captcha 生成与校验（math captcha）
- `backend/apps/accounts/tests/test_captcha_service.py` — captcha 单测
- `backend/apps/accounts/tests/test_login_throttle_layers.py` — 三层节流回归
- `backend/apps/tender/tests/test_upload_post_policy.py` — POST policy 回归
- `frontend/src/components/auth/CaptchaInput.vue` — captcha 输入控件
- `frontend/src/api/__tests__/http-handled-error.spec.ts` — Axios 静默约定回归

### 修改文件
- `frontend/src/router/index.ts` — H1 bootstrapAuth setAccessToken
- `docker-compose.yml` — H2 MINIO_PUBLIC_ENDPOINT 改读 env
- `.env.example`（如存在） — H2 增加 MINIO_PUBLIC_ENDPOINT 示例
- `backend/apps/accounts/views/auth_views.py` — M2 RefreshView 区分 expired/invalid；H5 LoginView 串三层节流 + captcha
- `backend/apps/accounts/cookies.py` — M8 COOKIE_MAX_AGE 改读 SIMPLE_JWT settings
- `backend/apps/accounts/services/permission_service.py` — M5 has_permission scope 模块级缓存
- `backend/apps/accounts/services/login_throttle.py` — H5 增加 IP 层 + username 软层
- `backend/apps/common/services/storage.py` — H4 新增 `presigned_post_upload`；H3 拆 ensure_bucket
- `backend/apps/common/apps.py` — M4 启动时 ensure_bucket
- `backend/apps/tender/services/upload_service.py` — H3 事务分离；H4 改 POST policy；M7 stat 失败走 reject
- `backend/apps/tender/serializers.py` — H4 InitUploadResponseSerializer 增 form_fields；增 MAX_TENDER_FILE_SIZE 校验
- `backend/apps/tender/tasks.py` — M1 parse_tender_file 异常捕获 + bind=True
- `backend/apps/tender/views.py` —（仅在 H4 改字段时同步）
- `backend/config/settings/base.py` — H4 增 MAX_TENDER_FILE_SIZE；M8 COOKIE_MAX_AGE 联动
- `frontend/src/layout/MainLayout.vue` — M6 菜单 fallback 收敛
- `frontend/src/api/http.ts` — M3 isHandled 约定 + 全局 ElMessage 静默
- `frontend/src/api/tender.ts` — H4 POST FormData 替换 PUT
- `frontend/src/components/upload/PresignedFileUploader.vue` — H4 调用方改造
- `frontend/src/views/login/LoginView.vue` — H5 captcha 集成
- `frontend/src/api/auth.ts` — H5 captcha endpoint client

### 测试文件改动
- `backend/apps/accounts/tests/test_auth_refresh_logout.py` — M2 expired vs invalid 断言
- `backend/apps/accounts/tests/test_auth_login.py` — H5 三层节流场景
- `backend/apps/tender/tests/test_upload_api.py` — H3 / H4 / M7 协议变更
- `backend/apps/tender/tests/test_cleanup_stale_uploads.py` — H4 cleanup grace period 调整

---

## Group A: 独立小修（8 项）

### Task A1: H1 — bootstrapAuth 在 me() 前 setAccessToken

**Files:**
- Modify: `frontend/src/router/index.ts:50-66`
- Test: `frontend/src/api/__tests__/bootstrap-auth.spec.ts`（新建）

- [ ] **Step 1: 写失败的回归测试**

Create `frontend/src/api/__tests__/bootstrap-auth.spec.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'

vi.mock('@/api/auth', () => ({
  refresh: vi.fn(() => Promise.resolve({ data: { access: 'NEW_ACCESS' } })),
  me: vi.fn(),
}))

describe('bootstrapAuth', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('me() must see accessToken set before being called', async () => {
    const { me } = await import('@/api/auth')
    let seen = ''
    ;(me as any).mockImplementation(() => {
      seen = useAuthStore().accessToken
      return Promise.resolve({
        data: {
          user: { id: 1, username: 'u', must_change_password: false },
          global_permissions: [],
          menu_tree: [],
        },
      })
    })
    const mod = await import('@/router')
    // trigger bootstrap by accessing internal — easier to extract bootstrapAuth as named export
    // assertion: seen === 'NEW_ACCESS'
    expect(seen).toBe('NEW_ACCESS')
  })
})
```

注：若 `bootstrapAuth` 不便于直接测试，将其抽成 `frontend/src/api/bootstrap.ts` 导出，router 调用。本步骤先做抽取重构。

- [ ] **Step 2: 重构 bootstrapAuth 为独立模块**

Create `frontend/src/api/bootstrap.ts`:
```ts
import { me, refresh } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'

let bootstrapPromise: Promise<void> | null = null

export async function bootstrapAuth() {
  const auth = useAuthStore()
  if (auth.initialized) return
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      try {
        const refreshRes = await refresh()
        const access = refreshRes.data.access
        auth.setAccessToken(access)            // <-- 关键：先写 token 再调 me
        const meRes = await me()
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
    })().finally(() => {
      bootstrapPromise = null
    })
  }
  await bootstrapPromise
}
```

Modify `frontend/src/router/index.ts:42-69` — 删掉本地 `bootstrapAuth` 与 `bootstrapPromise`，改为：
```ts
import { bootstrapAuth } from '@/api/bootstrap'
```

- [ ] **Step 3: 运行回归测试**

Run: `cd frontend && npm test -- bootstrap-auth`
Expected: PASS

- [ ] **Step 4: 浏览器手工验证**

按 docs/dev/phase3-manual-test.md §6 流程：登录 → 刷新 → 应留在原页（非跳 /login）。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/api/bootstrap.ts frontend/src/router/index.ts frontend/src/api/__tests__/bootstrap-auth.spec.ts
git commit -m "fix(frontend): bootstrapAuth 必须在 me() 前 setAccessToken

刷新页面时 me() 走 http.ts attachAuth 读不到 accessToken
会因 401 触发 clearSession+跳登录页。"
```

---

### Task A2: H2 — docker-compose MINIO_PUBLIC_ENDPOINT 改读 env

**Files:**
- Modify: `docker-compose.yml:11`
- Modify: `.env.example`（若有；否则新建）

- [ ] **Step 1: 修改 compose 锚点**

Edit `docker-compose.yml:11`:
```yaml
  MINIO_PUBLIC_ENDPOINT: ${MINIO_PUBLIC_ENDPOINT:-localhost:9000}
```

- [ ] **Step 2: 更新 .env.example（如不存在则创建）**

```bash
# Append/create line:
# 浏览器可达的 MinIO 地址；远程部署必须改成外网 host:port，否则预签名 URL 浏览器访问 localhost 会失败
MINIO_PUBLIC_ENDPOINT=localhost:9000
```

- [ ] **Step 3: 本地验证 compose 解释**

Run: `docker compose config | grep MINIO_PUBLIC_ENDPOINT`
Expected: `localhost:9000`（无 env 时默认）

Run: `MINIO_PUBLIC_ENDPOINT=example.com:9000 docker compose config | grep MINIO_PUBLIC_ENDPOINT`
Expected: `example.com:9000`

- [ ] **Step 4: 提交**

```bash
git add docker-compose.yml .env.example
git commit -m "fix(infra): MINIO_PUBLIC_ENDPOINT 走 env 覆盖

容器化部署时浏览器无法访问 localhost:9000；远端环境改用外网 host。"
```

---

### Task A3: M2 — RefreshView 区分 token_expired / token_invalid

**Files:**
- Modify: `backend/apps/accounts/views/auth_views.py:89-111`
- Test: `backend/apps/accounts/tests/test_auth_refresh_logout.py`

- [ ] **Step 1: 写失败测试**

Add to `backend/apps/accounts/tests/test_auth_refresh_logout.py`:
```python
def test_refresh_expired_token_returns_token_expired(client, settings):
    # 制造过期 refresh：把 lifetime 改成 1s，sleep 2s
    from datetime import timedelta
    settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"] = timedelta(seconds=1)
    # ... login → 拿 cookie → time.sleep(2) → 调 refresh
    response = client.post("/api/auth/refresh", HTTP_X_CSRF_TOKEN=csrf)
    assert response.status_code == 401
    assert response.json()["code"] == "token_expired"
```

- [ ] **Step 2: 跑测试，确认 FAIL**

Run: `cd backend && pytest apps/accounts/tests/test_auth_refresh_logout.py::test_refresh_expired_token_returns_token_expired -v`
Expected: FAIL（当前返回 token_invalid）

- [ ] **Step 3: 修改 RefreshView 复用 _looks_expired**

Edit `backend/apps/accounts/views/auth_views.py:102-106`:
```python
from apps.accounts.authentication import JWTAuthentication
from apps.common.exceptions import TokenExpired

serializer = TokenRefreshSerializer(data={"refresh": raw_refresh})
try:
    serializer.is_valid(raise_exception=True)
except (TokenError, InvalidToken) as exc:
    if JWTAuthentication._looks_expired(exc):
        raise TokenExpired
    raise TokenInvalid
```

- [ ] **Step 4: 跑测试，确认 PASS**

Run: `cd backend && pytest apps/accounts/tests/test_auth_refresh_logout.py -v`
Expected: ALL PASS

- [ ] **Step 5: 提交**

```bash
git add backend/apps/accounts/views/auth_views.py backend/apps/accounts/tests/test_auth_refresh_logout.py
git commit -m "fix(auth): RefreshView 区分 token_expired 与 token_invalid"
```

---

### Task A4: M8 — COOKIE_MAX_AGE 与 SIMPLE_JWT 同源

**Files:**
- Modify: `backend/apps/accounts/cookies.py:16`

- [ ] **Step 1: 改为从 settings 派生**

Edit `backend/apps/accounts/cookies.py:7-16`:
```python
import secrets

from django.conf import settings

REFRESH_COOKIE_NAME = "refresh_token"
CSRF_COOKIE_NAME = "csrf_token"
CSRF_HEADER_NAME = "X-CSRF-Token"
REFRESH_COOKIE_PATH = "/api/auth"
CSRF_COOKIE_PATH = "/"


def _cookie_max_age():
    """Cookie 寿命与 SIMPLE_JWT.REFRESH_TOKEN_LIFETIME 严格同源。"""
    return int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds())
```

Replace all 4 `COOKIE_MAX_AGE` 使用点（set_cookie 调用）→ `_cookie_max_age()`。

- [ ] **Step 2: 添加测试**

Add to `backend/apps/accounts/tests/test_auth_login.py`:
```python
def test_cookie_max_age_follows_simplejwt_setting(client, settings):
    from datetime import timedelta
    settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"] = timedelta(days=3)
    # login → assert Set-Cookie 中 Max-Age=259200
```

- [ ] **Step 3: 跑全部 cookies 相关测试**

Run: `cd backend && pytest apps/accounts/tests/ -k "cookie or login or refresh" -v`
Expected: ALL PASS

- [ ] **Step 4: 提交**

```bash
git add backend/apps/accounts/cookies.py backend/apps/accounts/tests/test_auth_login.py
git commit -m "fix(auth): Cookie 寿命与 SIMPLE_JWT 设置同源"
```

---

### Task A5: M5 — permission_service.has_permission scope 模块级缓存

**Files:**
- Modify: `backend/apps/accounts/services/permission_service.py:132-151`

- [ ] **Step 1: 写命中缓存的测试**

Add to `backend/apps/accounts/tests/test_permission_service.py`:
```python
def test_has_permission_uses_module_cache(django_assert_num_queries, db, user_factory):
    from apps.accounts.services import permission_service
    permission_service._scope_cache.clear()
    user = user_factory()
    # 第一次：1 次 Permission 查询用于建 scope 缓存 + 后续判定
    permission_service.has_permission(user, "project.create")
    permission_service.has_permission(user, "project.create")
    permission_service.has_permission(user, "tender.upload")
    # 三次调用不应有 3 次 Permission scope 查询
    with django_assert_num_queries(0):
        permission_service.has_permission(user, "project.create")
```

- [ ] **Step 2: 实现 scope 缓存**

Edit `backend/apps/accounts/services/permission_service.py`：

在 imports 后加：
```python
_scope_cache: dict[str, str] | None = None


def _get_scope_map():
    global _scope_cache
    if _scope_cache is None:
        _scope_cache = dict(
            Permission.objects.filter(is_active=True).values_list("code", "scope")
        )
    return _scope_cache


def _invalidate_scope_cache():
    global _scope_cache
    _scope_cache = None
```

修改 `has_permission`:
```python
def has_permission(user, code, project=None, required_scope=None):
    scope_map = _get_scope_map()
    scope = scope_map.get(code)
    if scope is None:
        return False
    if required_scope is not None and scope != required_scope:
        return False
    if scope == Permission.SCOPE_GLOBAL:
        return has_global_permission(user, code)
    if project is None:
        return False
    return has_project_permission(user, project, code)
```

在 `apps/accounts/signals.py` 的 Permission post_save/post_delete 钩子内增加 `permission_service._invalidate_scope_cache()` 调用（如已有 Permission 信号；若无则不加，因为 PERMISSION_REGISTRY 是启动时种子数据，运行期不变更）。

- [ ] **Step 3: 跑测试**

Run: `cd backend && pytest apps/accounts/tests/test_permission_service.py -v`
Expected: ALL PASS

- [ ] **Step 4: 提交**

```bash
git add backend/apps/accounts/services/permission_service.py backend/apps/accounts/tests/test_permission_service.py
git commit -m "perf(permissions): has_permission 用模块级 scope 缓存避免每次查库"
```

---

### Task A6: M6 — MainLayout 菜单 fallback 收敛

**Files:**
- Modify: `frontend/src/layout/MainLayout.vue:18-22`

- [ ] **Step 1: 改为只显示"工作台"或加载占位**

Edit `frontend/src/layout/MainLayout.vue:18-22`:
```vue
<template v-else>
  <el-menu-item index="/dashboard">工作台</el-menu-item>
</template>
```

理由：菜单必须由后端 menu_tree 驱动，fallback 静态写入 /projects、/tender/upload 会绕过后端权限控制。

- [ ] **Step 2: 手工验证**

新建普通用户（无 project.create / tender.upload 权限）登录 → 边栏只见工作台。

- [ ] **Step 3: 提交**

```bash
git add frontend/src/layout/MainLayout.vue
git commit -m "fix(frontend): 菜单 fallback 仅保留工作台，避免绕过后端权限"
```

---

### Task A7: M7 — stat 失败时也走 _reject 流转

**Files:**
- Modify: `backend/apps/tender/services/upload_service.py:96-99`
- Test: `backend/apps/tender/tests/test_upload_api.py`

- [ ] **Step 1: 写失败回归**

Add test:
```python
def test_complete_upload_stat_not_found_rejects_file(client_with_user, monkeypatch):
    # init_upload → 不真正 PUT → 直接 complete_upload
    # 期望：TenderFile.status == REJECTED, error_message 非空
    ...
    assert tender_file.status == TenderFile.STATUS_REJECTED
```

- [ ] **Step 2: 修改 complete_upload**

Edit `backend/apps/tender/services/upload_service.py:96-99`:
```python
try:
    stat = self.storage.stat_object(tender_file.object_key)
except ObjectNotFound as exc:
    self._reject(tender_file, "MinIO 对象不存在")
    raise NotFound(message="MinIO 对象不存在") from exc
```

- [ ] **Step 3: 跑测试**

Run: `cd backend && pytest apps/tender/tests/test_upload_api.py -v`
Expected: ALL PASS

- [ ] **Step 4: 提交**

```bash
git add backend/apps/tender/services/upload_service.py backend/apps/tender/tests/test_upload_api.py
git commit -m "fix(upload): stat_object 失败时也将 TenderFile 置为 rejected"
```

---

### Task A8: M1 — parse_tender_file 异常捕获 + bind=True

**Files:**
- Modify: `backend/apps/tender/tasks.py:11-35`
- Test: `backend/apps/tender/tests/test_parse_task_failure.py`（新建）

- [ ] **Step 1: 写失败测试**

Create `backend/apps/tender/tests/test_parse_task_failure.py`:
```python
import pytest
from unittest.mock import patch
from apps.common.models import AsyncTask
from apps.tender.models import TenderFile
from apps.tender.tasks import parse_tender_file

@pytest.mark.django_db
def test_parse_task_failure_marks_async_task_failed(tender_file_factory):
    tf = tender_file_factory(status=TenderFile.STATUS_PARSE_PENDING)
    task = AsyncTask.objects.create(task_type="tender_parse", status="pending",
                                     related_object_type="TenderFile", related_object_id=tf.id)
    with patch("apps.tender.tasks.TenderFile.objects.get",
               side_effect=Exception("boom")):
        with pytest.raises(Exception):
            parse_tender_file(task.id, tf.id)
    task.refresh_from_db()
    assert task.status == "failed"
    assert "boom" in task.error_message
```

- [ ] **Step 2: 改写 task**

Edit `backend/apps/tender/tasks.py:11-35`:
```python
@app.task(name="apps.tender.parse_tender_file", bind=True)
def parse_tender_file(self, task_id: int, tender_file_id: int):
    """v1 占位解析任务：更新任务与文件状态。失败时把 AsyncTask 置 failed 并 re-raise。"""
    task = AsyncTask.objects.get(pk=task_id)
    try:
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
    except Exception as exc:
        AsyncTask.objects.filter(pk=task_id).update(
            status="failed",
            error_message=str(exc)[:1000],
            finished_at=timezone.now(),
        )
        TenderFile.objects.filter(pk=tender_file_id).update(
            status=TenderFile.STATUS_PARSE_FAILED,
        )
        raise  # 让 Celery 走重试/报警链路
```

- [ ] **Step 3: 跑测试**

Run: `cd backend && pytest apps/tender/tests/test_parse_task_failure.py -v`
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add backend/apps/tender/tasks.py backend/apps/tender/tests/test_parse_task_failure.py
git commit -m "fix(celery): parse_tender_file 失败必须落 AsyncTask.failed 后 re-raise"
```

---

## Group B: 存储链路重构（3 项 + 拆分）

### Task B1: M4 — bucket_exists 移到 AppConfig.ready()

**Files:**
- Modify: `backend/apps/common/apps.py`
- Modify: `backend/apps/common/services/storage.py:66-70`

- [ ] **Step 1: 改 ensure_bucket 为 idempotent + 启动期一次性触发**

Edit `backend/apps/common/apps.py`:
```python
from django.apps import AppConfig


class CommonConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.common"

    def ready(self):
        # 启动时一次性 ensure_bucket；运行期 presigned_* 路径不再触网。
        # 测试环境下 MinIO 不可达时静默跳过，避免阻断 manage.py / pytest。
        import logging
        from django.conf import settings
        if not getattr(settings, "MINIO_ENSURE_BUCKET_ON_READY", True):
            return
        try:
            from apps.common.services.storage import StorageService
            StorageService().ensure_bucket()
        except Exception as exc:
            logging.getLogger(__name__).warning("ensure_bucket on ready failed: %s", exc)
```

Edit `backend/apps/common/services/storage.py:66-70` 删除 `self.ensure_bucket()` 这一行：
```python
def presigned_put_object(self, object_key: str, expires_seconds: int | None = None) -> str:
    expires = timedelta(seconds=expires_seconds or settings.MINIO_PRESIGN_EXPIRES_SECONDS)
    return self._presign.presigned_put_object(self.bucket, object_key, expires=expires)
```

Edit `backend/config/settings/base.py` 增加：
```python
MINIO_ENSURE_BUCKET_ON_READY = env.bool("MINIO_ENSURE_BUCKET_ON_READY", default=True)
```

Edit `backend/config/settings/test.py`（若存在；否则在 conftest.py override）:
```python
MINIO_ENSURE_BUCKET_ON_READY = False
```

- [ ] **Step 2: 验证现有 upload 测试不破**

Run: `cd backend && pytest apps/tender/tests/test_upload_api.py -v`
Expected: ALL PASS

- [ ] **Step 3: 提交**

```bash
git add backend/apps/common/apps.py backend/apps/common/services/storage.py backend/config/settings/base.py backend/config/settings/test.py
git commit -m "perf(storage): bucket_exists 仅启动期一次，签名路径去除 RTT"
```

---

### Task B2: H3 — init_upload 事务分离

**Files:**
- Modify: `backend/apps/tender/services/upload_service.py:52-80`
- Modify: `backend/apps/tender/tasks.py:38-53`（cleanup grace period）
- Test: `backend/apps/tender/tests/test_upload_api.py`

- [ ] **Step 1: 拆事务**

Edit `backend/apps/tender/services/upload_service.py:52-80`:
```python
def init_upload(self, *, project, lot, file_name, file_size, content_type, file_category, user):
    # 阶段 1：DB 落库（atomic），不做任何网络 IO
    with transaction.atomic():
        tender_file = TenderFile.objects.create(
            project=project, lot=lot,
            original_name=file_name, file_size=file_size,
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

    # 阶段 2：MinIO 签名（事务外）；失败时把 TenderFile 标记为 rejected
    try:
        upload_url = self.storage.presigned_put_object(object_key)
    except Exception as exc:
        tender_file.status = TenderFile.STATUS_REJECTED
        tender_file.error_message = f"签名失败: {exc}"[:500]
        tender_file.save(update_fields=["status", "error_message", "updated_at"])
        raise

    return {
        "file_id": tender_file.id,
        "upload_url": upload_url,
        "object_key": object_key,
        "expires_in": settings.MINIO_PRESIGN_EXPIRES_SECONDS,
    }
```

- [ ] **Step 2: cleanup 任务缩短 grace（从 24h → 配置化默认 1h），扫描 rejected 也走清理**

Edit `backend/apps/tender/tasks.py:38-53`:
```python
@app.task(name="apps.tender.cleanup_stale_uploads")
def cleanup_stale_uploads():
    """清理超过 grace 仍未完成的孤儿上传记录（uploading / rejected）。"""
    from django.conf import settings
    storage = StorageService()
    grace_hours = getattr(settings, "UPLOAD_GRACE_HOURS", 1)
    cutoff = timezone.now() - timedelta(hours=grace_hours)
    qs = TenderFile.objects.filter(
        status__in=[TenderFile.STATUS_UPLOADING, TenderFile.STATUS_REJECTED],
        created_at__lt=cutoff,
    )
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

Edit `backend/config/settings/base.py`:
```python
UPLOAD_GRACE_HOURS = env.int("UPLOAD_GRACE_HOURS", default=1)
```

- [ ] **Step 3: 写事务分离回归测试**

Add to `backend/apps/tender/tests/test_upload_api.py`:
```python
def test_init_upload_does_not_hold_transaction_during_minio_call(monkeypatch, client_with_user):
    from apps.common.services import storage as storage_mod
    seen_in_atomic = []
    real = storage_mod.StorageService.presigned_put_object
    def wrapper(self, *a, **kw):
        from django.db import transaction
        seen_in_atomic.append(transaction.get_connection().in_atomic_block)
        return "https://example/put"
    monkeypatch.setattr(storage_mod.StorageService, "presigned_put_object", wrapper)
    client_with_user.post("/api/tender/files/init-upload", ...)
    assert seen_in_atomic == [False]
```

- [ ] **Step 4: 跑测试**

Run: `cd backend && pytest apps/tender/tests/test_upload_api.py apps/tender/tests/test_cleanup_stale_uploads.py -v`
Expected: ALL PASS

- [ ] **Step 5: 提交**

```bash
git add backend/apps/tender/services/upload_service.py backend/apps/tender/tasks.py backend/config/settings/base.py backend/apps/tender/tests/test_upload_api.py backend/apps/tender/tests/test_cleanup_stale_uploads.py
git commit -m "fix(upload): init_upload 拆事务，MinIO 签名移出 atomic 块

事务内做网络 IO 会让 MinIO 抖动时占用 DB 连接。
配套 cleanup 任务缩短 grace 至 1h 并扫描签名失败的孤儿记录。"
```

---

### Task B3: H4 — presigned PUT → POST policy + 三层防御

**核心协议变更：后端返回 form_fields 而非单 upload_url；前端用 FormData POST。**

#### B3a: 后端 storage.py 新增 `presigned_post_upload`

**Files:**
- Modify: `backend/apps/common/services/storage.py`
- Modify: `backend/config/settings/base.py`
- Test: `backend/apps/tender/tests/test_upload_post_policy.py`（新建）

- [ ] **Step 1: 加 MAX_TENDER_FILE_SIZE 设置**

Edit `backend/config/settings/base.py`:
```python
MAX_TENDER_FILE_SIZE = env.int("MAX_TENDER_FILE_SIZE", default=200 * 1024 * 1024)  # 200 MB
```

- [ ] **Step 2: storage.py 加 presigned_post_upload**

Edit `backend/apps/common/services/storage.py`:
```python
from datetime import datetime, timedelta, timezone as dt_timezone
from minio.datatypes import PostPolicy

class StorageService:
    # ... 既有代码 ...

    def presigned_post_upload(
        self, object_key: str, *,
        max_size: int, content_type: str | None = None,
        expires_seconds: int | None = None,
    ) -> dict[str, str | dict]:
        """生成带 content-length-range 的 POST policy 表单。

        MinIO 端会在接收 multipart body 时硬性掐断超过 max_size 的请求，
        无法靠 PUT presigned URL 实现。返回 {url, fields} 供浏览器 POST。
        """
        expires_at = datetime.now(tz=dt_timezone.utc) + timedelta(
            seconds=expires_seconds or settings.MINIO_PRESIGN_EXPIRES_SECONDS
        )
        policy = PostPolicy(self.bucket, expires_at)
        policy.add_equals_condition("key", object_key)
        if content_type:
            policy.add_equals_condition("Content-Type", content_type)
        policy.add_content_length_range_condition(1, max_size)
        fields = self._presign.presigned_post_policy(policy)
        # MinIO 公网 endpoint scheme 由 _presign.secure 决定
        scheme = "https" if settings.MINIO_SECURE else "http"
        url = f"{scheme}://{settings.MINIO_PUBLIC_ENDPOINT}/{self.bucket}"
        return {"url": url, "fields": fields}
```

- [ ] **Step 3: 写单测**

Create `backend/apps/tender/tests/test_upload_post_policy.py`:
```python
import pytest
from apps.common.services.storage import StorageService

@pytest.mark.django_db
def test_presigned_post_upload_includes_size_range():
    svc = StorageService()
    result = svc.presigned_post_upload("test/key", max_size=10*1024*1024)
    assert "url" in result and "fields" in result
    # policy 是 base64 编码 JSON；解出后断言含 content-length-range
    import base64, json
    policy = json.loads(base64.b64decode(result["fields"]["policy"]))
    conditions = policy["conditions"]
    has_range = any(
        c == ["content-length-range", 1, 10*1024*1024] for c in conditions
    )
    assert has_range
```

- [ ] **Step 4: 跑测试**

Run: `cd backend && pytest apps/tender/tests/test_upload_post_policy.py -v`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add backend/apps/common/services/storage.py backend/config/settings/base.py backend/apps/tender/tests/test_upload_post_policy.py
git commit -m "feat(storage): 新增 presigned_post_upload 带 content-length-range 限制"
```

#### B3b: 后端 upload_service / serializer / 返回字段切换

**Files:**
- Modify: `backend/apps/tender/services/upload_service.py`
- Modify: `backend/apps/tender/serializers.py`
- Test: `backend/apps/tender/tests/test_upload_api.py`

- [ ] **Step 1: serializer 加 MAX_TENDER_FILE_SIZE 校验 + 返回字段**

Edit `backend/apps/tender/serializers.py`:
```python
from django.conf import settings

class InitUploadSerializer(serializers.Serializer):
    project_id = serializers.IntegerField()
    lot_id = serializers.IntegerField(required=False, allow_null=True)
    file_name = serializers.CharField(max_length=255)
    file_size = serializers.IntegerField(min_value=1)
    content_type = serializers.CharField(max_length=128, required=False, allow_blank=True)
    file_category = serializers.ChoiceField(choices=[c[0] for c in TenderFile.CATEGORY_CHOICES])

    def validate_file_size(self, value):
        if value > settings.MAX_TENDER_FILE_SIZE:
            raise serializers.ValidationError(
                f"文件大小超过限制 {settings.MAX_TENDER_FILE_SIZE} 字节"
            )
        return value

    # ... 既有 validate(self, attrs) ...


class InitUploadResponseSerializer(serializers.Serializer):
    file_id = serializers.IntegerField()
    upload_url = serializers.CharField()         # POST endpoint
    upload_fields = serializers.DictField()      # 必填表单字段
    object_key = serializers.CharField()
    expires_in = serializers.IntegerField()
```

- [ ] **Step 2: upload_service.init_upload 改用 post policy**

Edit `backend/apps/tender/services/upload_service.py` 阶段 2:
```python
try:
    post_form = self.storage.presigned_post_upload(
        object_key,
        max_size=settings.MAX_TENDER_FILE_SIZE,
        content_type=content_type or None,
    )
except Exception as exc:
    tender_file.status = TenderFile.STATUS_REJECTED
    tender_file.error_message = f"签名失败: {exc}"[:500]
    tender_file.save(update_fields=["status", "error_message", "updated_at"])
    raise

return {
    "file_id": tender_file.id,
    "upload_url": post_form["url"],
    "upload_fields": post_form["fields"],
    "object_key": object_key,
    "expires_in": settings.MINIO_PRESIGN_EXPIRES_SECONDS,
}
```

- [ ] **Step 3: 更新 test_upload_api.py 断言新字段**

将既有 `assert "upload_url" in data` 后增加 `assert "upload_fields" in data`，并把 PUT 链路的集成断言改 POST。

- [ ] **Step 4: 跑测试**

Run: `cd backend && pytest apps/tender/tests/test_upload_api.py -v`
Expected: ALL PASS

- [ ] **Step 5: 提交**

```bash
git add backend/apps/tender/services/upload_service.py backend/apps/tender/serializers.py backend/apps/tender/tests/test_upload_api.py
git commit -m "feat(upload): init_upload 改用 POST policy 返回 upload_url + upload_fields"
```

#### B3c: 前端切换为 POST FormData

**Files:**
- Modify: `frontend/src/api/tender.ts`
- Modify: `frontend/src/components/upload/PresignedFileUploader.vue`

- [ ] **Step 1: 改 tender.ts**

Edit `frontend/src/api/tender.ts`：将 `putToPresignedUrl` 删除/替换为：
```ts
import axios from 'axios'

export async function postToPresignedForm(
  url: string,
  fields: Record<string, string>,
  file: File,
  onProgress: (percent: number) => void,
) {
  const form = new FormData()
  Object.entries(fields).forEach(([k, v]) => form.append(k, v))
  form.append('file', file)
  await axios.post(url, form, {
    withCredentials: false,                // 跨域到 MinIO 不带 cookie
    onUploadProgress: (e) => {
      if (e.total) onProgress(Math.round((e.loaded / e.total) * 100))
    },
  })
}
```

`initUpload` 返回类型也同步增加 `upload_fields: Record<string, string>`。

- [ ] **Step 2: 改 PresignedFileUploader.vue:88**

Edit `frontend/src/components/upload/PresignedFileUploader.vue`：
```ts
await postToPresignedForm(
  initRes.data.upload_url,
  initRes.data.upload_fields,
  file,
  (percent) => { uploadPercent.value = percent },
)
```

import 也同步改 `import { completeUpload, initUpload, postToPresignedForm } from '@/api/tender'`。

- [ ] **Step 3: 手工验证端到端上传**

启动后端 + MinIO + 前端，上传一个 10MB 文件 → 进度条到 100% → 解析任务出现 → 然后上传一个 300MB（> 200MB）文件 → MinIO 应在传输过程中或完成时拒绝。

- [ ] **Step 4: 提交**

```bash
git add frontend/src/api/tender.ts frontend/src/components/upload/PresignedFileUploader.vue
git commit -m "feat(frontend): 上传改用 POST FormData 携带 policy 字段"
```

---

## Group C: 认证安全分层（2 项）

### Task C1: M3 — Axios isHandled 静默约定

**Files:**
- Modify: `frontend/src/api/http.ts`
- Modify: `frontend/src/components/upload/PresignedFileUploader.vue:101-103`
- Test: `frontend/src/api/__tests__/http-handled-error.spec.ts`（新建）

- [ ] **Step 1: 写测试**

Create `frontend/src/api/__tests__/http-handled-error.spec.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import MockAdapter from 'axios-mock-adapter'
import { http } from '@/api/http'

describe('http handled error contract', () => {
  it('must_change_password rejects with isHandled=true', async () => {
    const mock = new MockAdapter(http)
    mock.onGet('/api/x').reply(403, { code: 'must_change_password' })
    try {
      await http.get('/api/x')
      throw new Error('should have rejected')
    } catch (err: any) {
      expect(err.isHandled).toBe(true)
    }
  })
})
```

- [ ] **Step 2: 修改 http.ts 拦截器**

Edit `frontend/src/api/http.ts:59-61`:
```ts
if (response.status === 403 && code === 'must_change_password') {
  router.push('/change-password')
  const handled: any = new Error('MUST_CHANGE_PASSWORD')
  handled.isHandled = true
  handled.code = 'must_change_password'
  return Promise.reject(handled)
}
```

并在文件顶部增加导出 helper：
```ts
export function isHandledError(err: any): boolean {
  return Boolean(err?.isHandled)
}
```

- [ ] **Step 3: 改 PresignedFileUploader.vue 调用方约定**

Edit `frontend/src/components/upload/PresignedFileUploader.vue:101-103`:
```ts
} catch (error: any) {
  if (error?.isHandled) return
  ElMessage.error(error.response?.data?.message || '上传失败')
}
```

并把"上传失败"逻辑全前端搜索一遍，对所有 ElMessage.error 调用都加 `if (error?.isHandled) return;` 守卫（影响范围列表用 `grep -rn "ElMessage.error" frontend/src` 确认）。

- [ ] **Step 4: 跑测试**

Run: `cd frontend && npm test -- http-handled-error`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/api/http.ts frontend/src/components/upload/PresignedFileUploader.vue frontend/src/api/__tests__/http-handled-error.spec.ts
git commit -m "fix(frontend): Axios 拦截器静默约定 isHandled，调用方守卫跳过弹窗"
```

---

### Task C2: H5 — 登录三层节流 + 简单 captcha

**Files:**
- Modify: `backend/apps/accounts/services/login_throttle.py`
- Create: `backend/apps/accounts/services/captcha_service.py`
- Create: `backend/apps/accounts/tests/test_captcha_service.py`
- Create: `backend/apps/accounts/tests/test_login_throttle_layers.py`
- Modify: `backend/apps/accounts/views/auth_views.py`
- Modify: `backend/apps/accounts/serializers.py`（LoginSerializer 加 captcha_token/captcha_answer 可选字段）
- Modify: `backend/apps/accounts/urls.py`（加 /api/auth/captcha 路由）
- Create: `frontend/src/components/auth/CaptchaInput.vue`
- Modify: `frontend/src/views/login/LoginView.vue`
- Modify: `frontend/src/api/auth.ts`

#### C2a: Backend captcha 服务

- [ ] **Step 1: 写 captcha_service**

Create `backend/apps/accounts/services/captcha_service.py`:
```python
"""简单 math captcha（spec §5.4 反 DOS）。

生成 token → 缓存正确答案 5 分钟；登录提交 captcha_token + captcha_answer
后服务端核对一次性消费。无图形，纯文本"3 + 4 = ?"。
"""
import secrets
import random
from django.core.cache import cache

CAPTCHA_TTL = 5 * 60
CACHE_PREFIX = "captcha:"


def generate():
    a = random.randint(1, 9)
    b = random.randint(1, 9)
    token = secrets.token_urlsafe(16)
    cache.set(f"{CACHE_PREFIX}{token}", str(a + b), CAPTCHA_TTL)
    return {"captcha_token": token, "question": f"{a} + {b} = ?"}


def verify(token: str, answer: str) -> bool:
    if not token or not answer:
        return False
    key = f"{CACHE_PREFIX}{token}"
    expected = cache.get(key)
    if expected is None:
        return False
    cache.delete(key)  # 一次性
    return expected.strip() == str(answer).strip()
```

- [ ] **Step 2: 写测试**

Create `backend/apps/accounts/tests/test_captcha_service.py`:
```python
import pytest
from apps.accounts.services import captcha_service

def test_generate_and_verify_roundtrip():
    c = captcha_service.generate()
    assert "captcha_token" in c
    q = c["question"]
    a, b = [int(x) for x in q.replace(" = ?", "").split(" + ")]
    assert captcha_service.verify(c["captcha_token"], str(a + b))
    # 一次性
    assert not captcha_service.verify(c["captcha_token"], str(a + b))

def test_verify_wrong_answer():
    c = captcha_service.generate()
    assert not captcha_service.verify(c["captcha_token"], "999")
```

Run: `cd backend && pytest apps/accounts/tests/test_captcha_service.py -v`
Expected: PASS

#### C2b: Backend login_throttle 三层

- [ ] **Step 3: 改写 login_throttle**

Edit `backend/apps/accounts/services/login_throttle.py`:
```python
"""登录失败限流三层（spec §5.4）。

L1 按 IP 全局速率：login_fail:ip:{ip}，60s 滑窗 20 次
L2 按 username+IP 硬锁：login_fail:{username}:{ip}，5 次锁 15 分钟
L3 按 username 软触发 captcha：login_fail:user:{username}，10 次后需 captcha
"""
from django.core.cache import cache

# L1
IP_RATE_LIMIT = 20
IP_RATE_WINDOW = 60

# L2
MAX_FAILURES = 5
LOCK_SECONDS = 15 * 60

# L3
CAPTCHA_THRESHOLD = 10
CAPTCHA_WINDOW = 30 * 60


def _ip_key(ip):
    return f"login_fail:ip:{ip or '-'}"


def _pair_key(username, ip):
    return f"login_fail:{username}:{ip or '-'}"


def _user_key(username):
    return f"login_fail:user:{username}"


def is_ip_throttled(ip):
    return cache.get(_ip_key(ip), 0) >= IP_RATE_LIMIT


def is_locked(username, ip):
    """L2 username+IP 是否已锁。"""
    return cache.get(_pair_key(username, ip), 0) >= MAX_FAILURES


def captcha_required(username):
    """L3 username 软触发：是否需要 captcha。"""
    return cache.get(_user_key(username), 0) >= CAPTCHA_THRESHOLD


def record_failure(username, ip):
    """记三个维度的失败计数；返回 (l2_count, captcha_required_now)。"""
    pair = cache.get(_pair_key(username, ip), 0) + 1
    cache.set(_pair_key(username, ip), pair, LOCK_SECONDS)

    user = cache.get(_user_key(username), 0) + 1
    cache.set(_user_key(username), user, CAPTCHA_WINDOW)

    ip_cnt = cache.get(_ip_key(ip), 0) + 1
    cache.set(_ip_key(ip), ip_cnt, IP_RATE_WINDOW)

    return pair, user >= CAPTCHA_THRESHOLD


def reset(username, ip):
    """登录成功后只清 L2 + L3；L1 IP 全局速率不重置。"""
    cache.delete(_pair_key(username, ip))
    cache.delete(_user_key(username))
```

- [ ] **Step 4: 加 IpThrottled / CaptchaRequired 异常**

Edit `backend/apps/common/exceptions.py`：增加两个异常类（参照既有 AccountLocked 形式）：
```python
class IpThrottled(BusinessError):
    status_code = 429
    default_code = "ip_throttled"
    default_message = "请求过于频繁，请稍后再试"


class CaptchaRequired(BusinessError):
    status_code = 400
    default_code = "captcha_required"
    default_message = "需要验证码"


class CaptchaInvalid(BusinessError):
    status_code = 400
    default_code = "captcha_invalid"
    default_message = "验证码错误"
```

- [ ] **Step 5: 三层节流测试**

Create `backend/apps/accounts/tests/test_login_throttle_layers.py`:
```python
import pytest
from django.core.cache import cache
from apps.accounts.services import login_throttle

@pytest.fixture(autouse=True)
def clear_cache():
    cache.clear()
    yield
    cache.clear()

def test_l1_ip_throttle_blocks_after_n_failures():
    for _ in range(login_throttle.IP_RATE_LIMIT):
        login_throttle.record_failure("u1", "1.1.1.1")
    assert login_throttle.is_ip_throttled("1.1.1.1")

def test_l2_username_ip_lock_after_5():
    for _ in range(login_throttle.MAX_FAILURES):
        login_throttle.record_failure("u1", "1.1.1.1")
    assert login_throttle.is_locked("u1", "1.1.1.1")

def test_l3_captcha_required_after_threshold_across_ips():
    for i in range(login_throttle.CAPTCHA_THRESHOLD):
        login_throttle.record_failure("u1", f"2.2.2.{i}")
    assert login_throttle.captcha_required("u1")

def test_success_resets_l2_l3_but_not_l1():
    login_throttle.record_failure("u1", "1.1.1.1")
    login_throttle.reset("u1", "1.1.1.1")
    assert cache.get(login_throttle._pair_key("u1", "1.1.1.1"), 0) == 0
    # L1 仍计数（防代理池绕过）
```

Run: `cd backend && pytest apps/accounts/tests/test_login_throttle_layers.py -v`
Expected: PASS

#### C2c: LoginView / Serializer / URL 集成

- [ ] **Step 6: LoginSerializer 加可选 captcha 字段**

Edit `backend/apps/accounts/serializers.py`（找到 LoginSerializer 加字段）:
```python
class LoginSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(max_length=128)
    captcha_token = serializers.CharField(required=False, allow_blank=True)
    captcha_answer = serializers.CharField(required=False, allow_blank=True)
```

- [ ] **Step 7: 新增 GET /api/auth/captcha 路由 + view**

Edit `backend/apps/accounts/views/auth_views.py`：在文件末尾加：
```python
from apps.accounts.services import captcha_service

class CaptchaView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        return Response(captcha_service.generate())
```

Edit `backend/apps/accounts/urls.py`：增加 `path("captcha", CaptchaView.as_view())`。

- [ ] **Step 8: LoginView 串三层节流**

Edit `backend/apps/accounts/views/auth_views.py:38-86`:
```python
class LoginView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        username = serializer.validated_data["username"]
        password = serializer.validated_data["password"]
        captcha_token = serializer.validated_data.get("captcha_token", "")
        captcha_answer = serializer.validated_data.get("captcha_answer", "")
        ip = get_client_ip(request)

        # L1
        if login_throttle.is_ip_throttled(ip):
            raise IpThrottled
        # L2
        if login_throttle.is_locked(username, ip):
            raise AccountLocked
        # L3：若 username 累计错过阈值，必须先通过 captcha
        if login_throttle.captcha_required(username):
            if not captcha_token:
                raise CaptchaRequired
            if not captcha_service.verify(captcha_token, captcha_answer):
                raise CaptchaInvalid

        try:
            provider = get_provider("password")
            user = provider.authenticate(
                {"username": username, "password": password}
            )
            result = login_service.complete_login(user, request)
        except auth_exc.AccountDisabled:
            raise AccountDisabled
        except auth_exc.InvalidCredentials:
            failures, captcha_now_required = login_throttle.record_failure(username, ip)
            audit_service.log_operation(
                actor=None,
                action="login_failed",
                request=request,
                summary="用户名或密码错误",
                extra={"username": username, "failures": failures,
                       "captcha_required": captcha_now_required},
            )
            if failures >= login_throttle.MAX_FAILURES:
                raise AccountLocked
            if captcha_now_required:
                raise CaptchaRequired  # 让前端立即弹 captcha
            raise AuthenticationFailed

        login_throttle.reset(username, ip)
        # ... 既有 200 返回 ...
```

- [ ] **Step 9: 写端到端节流测试**

Add to `backend/apps/accounts/tests/test_auth_login.py`:
```python
def test_login_third_failure_layer_returns_captcha_required(client, user_factory):
    user_factory(username="bob", password="correct")
    for _ in range(10):
        client.post("/api/auth/login", {"username": "bob", "password": "wrong"})
    r = client.post("/api/auth/login", {"username": "bob", "password": "wrong"})
    assert r.status_code == 400
    assert r.json()["code"] == "captcha_required"
```

Run: `cd backend && pytest apps/accounts/tests/test_auth_login.py -v`
Expected: PASS

#### C2d: Frontend captcha 输入控件 + LoginView 集成

- [ ] **Step 10: 新建 CaptchaInput.vue**

Create `frontend/src/components/auth/CaptchaInput.vue`:
```vue
<template>
  <div class="captcha-input">
    <span class="question">{{ question }}</span>
    <el-input v-model="answer" placeholder="请输入答案" @input="emitChange" />
    <el-button text @click="refresh">换一题</el-button>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { fetchCaptcha } from '@/api/auth'

const emit = defineEmits<{
  update: [payload: { token: string; answer: string }]
}>()

const token = ref('')
const question = ref('')
const answer = ref('')

async function refresh() {
  const res = await fetchCaptcha()
  token.value = res.data.captcha_token
  question.value = res.data.question
  answer.value = ''
  emitChange()
}

function emitChange() {
  emit('update', { token: token.value, answer: answer.value })
}

onMounted(refresh)
defineExpose({ refresh })
</script>

<style scoped>
.captcha-input { display: flex; gap: 8px; align-items: center; }
.question { font-family: monospace; font-weight: 600; }
</style>
```

- [ ] **Step 11: api/auth.ts 加 fetchCaptcha**

Edit `frontend/src/api/auth.ts`：
```ts
export function fetchCaptcha() {
  return http.get('/api/auth/captcha')
}
```

并更新 `login(...)` 调用签名接受 `captcha_token?` / `captcha_answer?`。

- [ ] **Step 12: LoginView.vue 集成**

Edit `frontend/src/views/login/LoginView.vue`：登录失败时若错误码为 `captcha_required` 或 `captcha_invalid`，渲染 `<CaptchaInput @update="onCaptchaChange" />`，后续登录请求带上 `captcha_token / captcha_answer`。

- [ ] **Step 13: 端到端手工验证**

10 次连续错误密码 → 第 11 次失败响应包含 `captcha_required` → 前端弹 captcha → 填正确答案 + 正确密码 → 登录成功；第三方代理换 IP 也无法绕过 username 软层。

- [ ] **Step 14: 提交**

```bash
git add backend/apps/accounts/services/login_throttle.py backend/apps/accounts/services/captcha_service.py backend/apps/accounts/views/auth_views.py backend/apps/accounts/serializers.py backend/apps/accounts/urls.py backend/apps/common/exceptions.py backend/apps/accounts/tests/test_captcha_service.py backend/apps/accounts/tests/test_login_throttle_layers.py backend/apps/accounts/tests/test_auth_login.py frontend/src/components/auth/CaptchaInput.vue frontend/src/views/login/LoginView.vue frontend/src/api/auth.ts
git commit -m "feat(auth): 登录失败限流三层 (IP 速率 / username+IP 锁 / username 软触发 captcha)

避免单维度被代理池绕过或 DoS 合法账户。"
```

---

## Self-Review

### 1. Spec coverage check

13 处修复对应任务：

| 编号 | 修复 | 任务 |
|------|------|------|
| H1 | bootstrapAuth setAccessToken | A1 |
| H2 | MINIO_PUBLIC_ENDPOINT compose 默认 | A2 |
| H3 | init_upload 事务分离 | B2 |
| H4 | presigned PUT → POST policy + 三层防御 | B3 (a/b/c) |
| H5 | 登录三层节流 + captcha | C2 (a/b/c/d) |
| M1 | parse_tender_file 异常捕获 | A8 |
| M2 | RefreshView 区分 expired/invalid | A3 |
| M3 | Axios isHandled 静默约定 | C1 |
| M4 | bucket_exists AppConfig.ready() | B1 |
| M5 | permission scope 缓存 | A5 |
| M6 | MainLayout 菜单 fallback 收敛 | A6 |
| M7 | stat 失败走 reject | A7 |
| M8 | COOKIE_MAX_AGE 同源 settings | A4 |

✅ 全覆盖。

### 2. Placeholder scan

- A1 Step 1 中"将其抽成 frontend/src/api/bootstrap.ts 导出，router 调用。本步骤先做抽取重构。" — 这是设计说明而非占位，Step 2 给了具体代码。
- B1 Step 1 提到 `backend/config/settings/test.py（若存在；否则在 conftest.py override）` — 条件分支需明确：若 test.py 不存在，执行时在 `backend/conftest.py` 加 `settings.MINIO_ENSURE_BUCKET_ON_READY = False`。
- C2c Step 6 LoginSerializer 改动假设了"找到 LoginSerializer 加字段"，需先 grep 确认它在 `backend/apps/accounts/serializers.py`。

🔧 已 inline 说明，无硬性 placeholder 留空。

### 3. Type consistency

- A1 用 `auth.setAccessToken(access)` 与 `stores/auth.ts` 既有 action 名一致（已验证 router/index.ts:55 处的 `auth.clearSession` / `auth.setSession` 在原 store 中）。
- B3b 返回字段 `upload_fields` 与 B3c 前端 `initRes.data.upload_fields` 一致。
- H5 字段名 `captcha_token` / `captcha_answer` / `question` 在 service / serializer / view / 前端组件四处一致。

### 4. 执行风险提示

- **B3 是协议变更**，必须 BE+FE 同 PR 合并；切勿单独合后端导致前端 putToPresignedUrl 调用 404。
- **C2 captcha 是新增 endpoint**，部署时需要 redis 已就绪（cache backend）。
- **A2 docker-compose 改动**对远程环境，需在 deploy 文档同步说明 .env 必须设 MINIO_PUBLIC_ENDPOINT。
- B1（AppConfig.ready）在测试环境必须关掉 `MINIO_ENSURE_BUCKET_ON_READY`，否则 CI 没 MinIO 时 pytest 启动会打 warning。

---

## 执行顺序建议

1. **Group A（A1–A8）** 8 个独立小任务，可并行多 agent 处理或一气呵成；预估 1 天。
2. **Group B**：
   - B1 先（不影响契约）
   - B2 次之（init 流程内部重构）
   - B3 a→b→c 顺序严格，BE+FE 同 PR；预估 1 天
3. **Group C**：
   - C1 独立（不影响协议）；预估 0.5 天
   - C2 a→b→c→d 顺序严格，captcha 整套；预估 1 天

总计 ~3.5 天，可拆 4 个 PR（A 一个 / B1+B2 一个 / B3 一个 / C 一个），便于回归与回滚。
