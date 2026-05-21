# Phase 2：权限注册表、permission_service 与 JWT 认证 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Phase 1 的模型之上落地权限码注册表与种子数据、唯一鉴权判定入口 `permission_service`、simplejwt 认证端点（login/refresh/logout/me/change-password/reset-password），以及 `RequirePermission` / `MustChangePasswordPermission` 两个 DRF 权限类。

**Architecture:** 权限点由「代码内注册表 + 数据迁移」种子化；项目角色权限为静态映射。所有鉴权判定收敛到 `accounts/services/permission_service.py`，DRF 权限类只是薄包装。认证抽象为可插拔 Provider，v1 实现账号密码 Provider；所有 Provider 成功后走统一 `complete_login`。access token 走前端内存、refresh token 走 httpOnly Cookie，`refresh`/`logout` 用双提交 Cookie 模式防 CSRF。

**Tech Stack:** Django 5.2、Django REST Framework、djangorestframework-simplejwt（JWT 轮换 + 黑名单）、Redis（权限缓存 + 登录失败计数）、pytest-django + 真实 PostgreSQL。

**对应 spec：** `docs/superpowers/specs/2026-05-21-architecture-auth-design.md` §4.1、§4.4、§4.5、§5、§9 步骤 8-11、附录 A。

**前置条件：** Phase 1 全部 17 个 Task 已完成（14 个 app、分层 settings、`accounts`/`projects`/`audit`/`common` 模型与迁移已落库）。

**关键约定（沿用 Phase 1，勿改）：**
- 所有命令默认工作目录为 `backend/`，除非显式标注仓库根。
- 每个含 Python 命令的步骤前假定已 `source .venv/bin/activate`。
- 应用以 `apps.<name>` 形式注册；模型 `app_label` 取末段。
- 测试用真实 PostgreSQL（见 spec §6），不 mock 数据库；缓存在测试环境用 LocMemCache（Task 5 引入）。
- 迁移文件名以 `makemigrations` 实际生成为准；计划中的序号（如 `0005_seed_permissions`）仅供参考。

---

## 文件结构

| 文件 | 职责 |
| --- | --- |
| `backend/apps/accounts/permissions_registry.py` | 权限码注册表 + `apply_registry()` |
| `backend/apps/accounts/migrations/0005_seed_permissions.py` | 权限点种子数据迁移 |
| `backend/apps/accounts/migrations/0006_seed_roles.py` | 内置角色种子数据迁移 |
| `backend/apps/accounts/management/commands/sync_permissions.py` | 权限码同步管理命令 |
| `backend/apps/projects/permissions.py` | `PROJECT_ROLE_PERMISSIONS` 静态映射 |
| `backend/apps/common/request_cache.py` | 请求级缓存 + `RequestCacheMiddleware` |
| `backend/apps/common/exceptions.py` | `APIError` 体系 + `custom_exception_handler` |
| `backend/apps/common/pagination.py` | `DefaultPagination` |
| `backend/apps/common/utils.py` | `get_client_ip` 等工具 |
| `backend/apps/accounts/services/permission_service.py` | 鉴权判定单一入口 |
| `backend/apps/accounts/services/login_service.py` | `complete_login` 登录收尾 |
| `backend/apps/accounts/services/login_throttle.py` | 登录失败限流与锁定 |
| `backend/apps/accounts/services/menu_service.py` | 菜单树计算 |
| `backend/apps/accounts/services/role_service.py` | 角色权限 scope 业务校验 |
| `backend/apps/accounts/auth/` | 可插拔认证 Provider（base/exceptions/password/registry） |
| `backend/apps/accounts/authentication.py` | 自定义 `JWTAuthentication` |
| `backend/apps/accounts/permissions.py` | `RequirePermission` / `MustChangePasswordPermission` |
| `backend/apps/accounts/cookies.py` | 认证 Cookie 读写 + CSRF 双提交校验 |
| `backend/apps/accounts/serializers.py` | `UserSerializer` / `LoginSerializer` / `ChangePasswordSerializer` |
| `backend/apps/accounts/views/auth_views.py` | login/refresh/logout/me/change-password 视图 |
| `backend/apps/accounts/views/user_views.py` | reset-password 视图 |
| `backend/apps/accounts/urls.py` | accounts API 路由 |
| `backend/apps/accounts/tasks.py` | `flush_expired_tokens` Celery 任务 |
| `backend/apps/accounts/admin.py` | User/Role/Permission Django Admin 注册 |
| `backend/apps/accounts/signals.py` / `apps/projects/signals.py` | 权限缓存失效信号 |
| `backend/apps/projects/views.py` / `urls.py` | `my-permissions` 视图与路由 |
| `backend/config/settings/test.py` | 测试环境配置（LocMemCache） |
| `backend/conftest.py` | pytest fixture（用户/项目/APIClient） |

---

## Task 1：权限码注册表与种子化

**Files:**
- Create: `backend/apps/accounts/permissions_registry.py`
- Create: `backend/apps/accounts/management/__init__.py`、`management/commands/__init__.py`、`management/commands/sync_permissions.py`
- Create: `backend/apps/accounts/migrations/0005_seed_permissions.py`
- Create: `backend/apps/accounts/tests/test_permissions_registry.py`

- [ ] **Step 1：写 `backend/apps/accounts/permissions_registry.py`**

```python
"""权限码注册表（spec §4.2.2）。

权限点以「代码内注册表 + 数据迁移」方式种子化，保证代码与数据库一致、可演进。
后续业务模块接入时在 PERMISSION_REGISTRY 追加自身权限点，再跑 sync_permissions。
本模块不导入任何 Django 模型，可安全被数据迁移导入。
"""

GLOBAL = "global"
PROJECT = "project"

# (code, name, module, scope)
PERMISSION_REGISTRY = [
    # ---- 全局权限 ----
    ("project.create", "创建项目", "projects", GLOBAL),
    ("user.manage", "用户管理", "accounts", GLOBAL),
    ("role.manage", "角色管理", "accounts", GLOBAL),
    ("audit.view", "查看审计日志", "audit", GLOBAL),
    # ---- 项目权限 ----
    ("project.view", "查看项目", "projects", PROJECT),
    ("project.update", "编辑项目", "projects", PROJECT),
    ("project.member.manage", "管理项目成员", "projects", PROJECT),
    ("tender.view", "查看招标文件", "tender", PROJECT),
    ("tender.upload", "上传招标文件", "tender", PROJECT),
    ("tender.parse", "解析招标文件", "tender", PROJECT),
    ("outline.view", "查看大纲", "outline", PROJECT),
    ("outline.edit", "编辑大纲", "outline", PROJECT),
    ("section.view", "查看章节", "outline", PROJECT),
    ("section.generate", "生成章节", "outline", PROJECT),
    ("section.edit", "编辑章节", "outline", PROJECT),
    ("section.review", "评审章节", "outline", PROJECT),
    ("export.view", "查看导出", "exporting", PROJECT),
    ("export.create", "创建导出", "exporting", PROJECT),
]


def apply_registry(permission_model):
    """把 PERMISSION_REGISTRY 同步到 Permission 表（幂等）。

    - 注册表中存在的码：创建或更新 name/module/scope，并置 is_active=True。
    - 注册表中不存在、但库中 is_active=True 的码：置 is_active=False（停用，不删除，
      以免破坏历史审计与既有 Role 绑定）。

    permission_model 由调用方传入：数据迁移传 apps.get_model(...) 的历史模型，
    管理命令传真实 Permission 模型。
    """
    registry_codes = set()
    for code, name, module, scope in PERMISSION_REGISTRY:
        registry_codes.add(code)
        permission_model.objects.update_or_create(
            code=code,
            defaults={
                "name": name,
                "module": module,
                "scope": scope,
                "is_active": True,
            },
        )
    permission_model.objects.exclude(code__in=registry_codes).filter(
        is_active=True
    ).update(is_active=False)
```

- [ ] **Step 2：写管理命令 `sync_permissions`**

先建两个空文件：

```bash
mkdir -p apps/accounts/management/commands
touch apps/accounts/management/__init__.py apps/accounts/management/commands/__init__.py
```

写 `backend/apps/accounts/management/commands/sync_permissions.py`：

```python
"""把权限码注册表同步到 Permission 表（幂等）。"""
from django.core.management.base import BaseCommand

from apps.accounts.models import Permission
from apps.accounts.permissions_registry import apply_registry


class Command(BaseCommand):
    help = "把 PERMISSION_REGISTRY 同步到 Permission 表"

    def handle(self, *args, **options):
        apply_registry(Permission)
        count = Permission.objects.filter(is_active=True).count()
        self.stdout.write(self.style.SUCCESS(f"权限同步完成，当前启用 {count} 项"))
```

- [ ] **Step 3：写数据迁移 `0005_seed_permissions.py`**

先确认 accounts 当前最后一个迁移名：

Run（`backend/`）：`ls apps/accounts/migrations/`
Expected：能看到 Phase 1 的 `0001_initial.py` … `0004_authidentity.py`。

写 `backend/apps/accounts/migrations/0005_seed_permissions.py`（若 `0004` 实际文件名不同，把 `dependencies` 改为实际名）：

```python
from django.db import migrations

from apps.accounts.permissions_registry import apply_registry


def seed_permissions(apps, schema_editor):
    Permission = apps.get_model("accounts", "Permission")
    apply_registry(Permission)


def noop(apps, schema_editor):
    """反向迁移不删除权限点，保留历史审计与 Role 绑定。"""


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0004_authidentity"),
    ]

    operations = [
        migrations.RunPython(seed_permissions, noop),
    ]
```

- [ ] **Step 4：写测试 `backend/apps/accounts/tests/test_permissions_registry.py`**

```python
import pytest

from apps.accounts.models import Permission
from apps.accounts.permissions_registry import PERMISSION_REGISTRY, apply_registry


@pytest.mark.django_db
def test_seed_migration_loaded_all_registry_codes():
    """0005 数据迁移应已把注册表全部权限码写入库。"""
    db_codes = set(Permission.objects.values_list("code", flat=True))
    registry_codes = {code for code, _, _, _ in PERMISSION_REGISTRY}
    assert registry_codes.issubset(db_codes)


@pytest.mark.django_db
def test_registry_scopes_are_valid():
    for code, name, module, scope in PERMISSION_REGISTRY:
        assert scope in ("global", "project"), code


@pytest.mark.django_db
def test_apply_registry_is_idempotent():
    before = Permission.objects.count()
    apply_registry(Permission)
    assert Permission.objects.count() == before


@pytest.mark.django_db
def test_apply_registry_deactivates_unknown_code():
    Permission.objects.create(
        code="legacy.removed", name="已废弃", module="legacy", scope="global"
    )
    apply_registry(Permission)
    assert Permission.objects.get(code="legacy.removed").is_active is False
```

- [ ] **Step 5：运行测试验证**

Run（`backend/`）：`pytest apps/accounts/tests/test_permissions_registry.py -v`
Expected：`4 passed`（数据迁移已随测试库建库自动执行，权限点已种子化）。

- [ ] **Step 6：验证管理命令可运行**

Run（`backend/`）：`python manage.py sync_permissions`
Expected：输出 `权限同步完成，当前启用 18 项`。

- [ ] **Step 7：提交**

```bash
git add backend/apps/accounts/permissions_registry.py backend/apps/accounts/management backend/apps/accounts/migrations/0005_seed_permissions.py backend/apps/accounts/tests/test_permissions_registry.py
git commit -m "feat: accounts 增加权限码注册表与种子化迁移"
```

---

## Task 2：内置角色种子化

**Files:**
- Create: `backend/apps/accounts/migrations/0006_seed_roles.py`
- Create: `backend/apps/accounts/tests/test_seed_roles.py`

内置角色（spec §4.1、§4.2.3）：`system_admin` / `bid_manager` / `normal_user`，均 `is_system=True`。`system_admin` **不绑定具体权限**——其「全部权限」由 `permission_service` 直通逻辑处理（spec §4.1、附录 A #12）。`bid_manager` 绑定 `project.create`；`normal_user` 不绑定全局权限。

- [ ] **Step 1：写数据迁移 `0006_seed_roles.py`**

```python
from django.db import migrations

BUILTIN_ROLES = [
    {
        "code": "system_admin",
        "name": "系统管理员",
        "description": "拥有系统全部权限，不受限",
        "permissions": [],  # 直通逻辑在 permission_service，不绑定具体权限
    },
    {
        "code": "bid_manager",
        "name": "投标经理",
        "description": "可创建与管理项目",
        "permissions": ["project.create"],
    },
    {
        "code": "normal_user",
        "name": "普通用户",
        "description": "基础全局能力",
        "permissions": [],
    },
]


def seed_roles(apps, schema_editor):
    Role = apps.get_model("accounts", "Role")
    Permission = apps.get_model("accounts", "Permission")
    for spec in BUILTIN_ROLES:
        role, _ = Role.objects.update_or_create(
            code=spec["code"],
            defaults={
                "name": spec["name"],
                "description": spec["description"],
                "is_system": True,
            },
        )
        role.permissions.set(
            Permission.objects.filter(code__in=spec["permissions"])
        )


def noop(apps, schema_editor):
    """反向迁移不删除内置角色。"""


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0005_seed_permissions"),
    ]

    operations = [
        migrations.RunPython(seed_roles, noop),
    ]
```

- [ ] **Step 2：写测试 `backend/apps/accounts/tests/test_seed_roles.py`**

```python
import pytest

from apps.accounts.models import Role


@pytest.mark.django_db
def test_builtin_roles_seeded():
    codes = set(Role.objects.values_list("code", flat=True))
    assert {"system_admin", "bid_manager", "normal_user"}.issubset(codes)


@pytest.mark.django_db
def test_builtin_roles_are_system():
    for code in ["system_admin", "bid_manager", "normal_user"]:
        assert Role.objects.get(code=code).is_system is True


@pytest.mark.django_db
def test_bid_manager_bound_to_project_create():
    role = Role.objects.get(code="bid_manager")
    assert set(role.permissions.values_list("code", flat=True)) == {"project.create"}


@pytest.mark.django_db
def test_system_admin_has_no_explicit_permissions():
    """system_admin 不绑定具体权限，全部权限由 permission_service 直通。"""
    assert Role.objects.get(code="system_admin").permissions.count() == 0


@pytest.mark.django_db
def test_normal_user_has_no_global_permissions():
    assert Role.objects.get(code="normal_user").permissions.count() == 0
```

- [ ] **Step 3：运行测试验证**

Run（`backend/`）：`pytest apps/accounts/tests/test_seed_roles.py -v`
Expected：`5 passed`。

- [ ] **Step 4：提交**

```bash
git add backend/apps/accounts/migrations/0006_seed_roles.py backend/apps/accounts/tests/test_seed_roles.py
git commit -m "feat: accounts 增加内置角色种子化迁移"
```

---

## Task 3：`PROJECT_ROLE_PERMISSIONS` 静态映射

**Files:**
- Create: `backend/apps/projects/permissions.py`
- Create: `backend/apps/projects/tests/test_permissions.py`

- [ ] **Step 1：写测试 `backend/apps/projects/tests/test_permissions.py`**

```python
from apps.accounts.permissions_registry import PERMISSION_REGISTRY
from apps.projects.models import ProjectMember
from apps.projects.permissions import PROJECT_ROLE_PERMISSIONS


def test_role_keys_match_projectmember_choices():
    role_codes = {code for code, _ in ProjectMember.ROLE_CHOICES}
    assert set(PROJECT_ROLE_PERMISSIONS.keys()) == role_codes


def test_owner_can_manage_members():
    assert "project.member.manage" in PROJECT_ROLE_PERMISSIONS["owner"]


def test_viewer_is_read_only():
    assert PROJECT_ROLE_PERMISSIONS["viewer"] == {
        "project.view", "tender.view", "outline.view",
        "section.view", "export.view",
    }


def test_all_mapped_codes_are_registered_project_scope():
    """映射里出现的每个权限码都必须是注册表中的 project 权限。"""
    project_codes = {
        code for code, _, _, scope in PERMISSION_REGISTRY if scope == "project"
    }
    for role, codes in PROJECT_ROLE_PERMISSIONS.items():
        assert codes.issubset(project_codes), f"{role} 含未注册/非 project 权限码"
```

- [ ] **Step 2：运行测试确认失败**

Run（`backend/`）：`pytest apps/projects/tests/test_permissions.py -v`
Expected：FAIL，`ModuleNotFoundError: No module named 'apps.projects.permissions'`。

- [ ] **Step 3：写 `backend/apps/projects/permissions.py`**

逐字复制 spec §4.4：

```python
"""项目角色 → 权限集合静态映射（spec §4.4）。

项目角色固定，不做成可配置数据表（YAGNI）。后续业务模块接入时按需扩充，
并在 accounts/permissions_registry.py 注册对应的 project 权限码。
"""

PROJECT_ROLE_PERMISSIONS = {
    "owner": {
        "project.view", "project.update", "project.member.manage",
        "tender.upload", "tender.parse", "outline.edit",
        "section.generate", "section.edit", "section.review",
        "export.create",
    },
    "editor": {
        "project.view", "tender.view", "outline.view",
        "section.generate", "section.edit",
    },
    "reviewer": {
        "project.view", "tender.view", "outline.view",
        "section.view", "section.review",
    },
    "viewer": {
        "project.view", "tender.view", "outline.view",
        "section.view", "export.view",
    },
}
```

- [ ] **Step 4：运行测试确认通过**

Run（`backend/`）：`pytest apps/projects/tests/test_permissions.py -v`
Expected：`4 passed`。

- [ ] **Step 5：提交**

```bash
git add backend/apps/projects/permissions.py backend/apps/projects/tests/test_permissions.py
git commit -m "feat: projects 增加 PROJECT_ROLE_PERMISSIONS 静态映射"
```

---

## Task 4：`common.request_cache` 请求级缓存

**Files:**
- Create: `backend/apps/common/request_cache.py`
- Modify: `backend/config/settings/base.py`（`MIDDLEWARE` 追加 `RequestCacheMiddleware`）
- Create: `backend/apps/common/tests/test_request_cache.py`

请求级缓存是 spec §4.5「两级缓存」的第一级：用 `contextvar` 存放单次请求内的权限判定结果，避免一个请求里对同一用户/项目反复查库或查 Redis。

- [ ] **Step 1：写测试 `backend/apps/common/tests/test_request_cache.py`**

```python
from apps.common import request_cache


def test_get_returns_none_after_clear():
    request_cache.clear()
    assert request_cache.get("missing") is None


def test_set_and_get_within_context():
    request_cache.reset()
    request_cache.set_value("k", {"a", "b"})
    assert request_cache.get("k") == {"a", "b"}
    request_cache.clear()


def test_clear_drops_values():
    request_cache.reset()
    request_cache.set_value("k", 1)
    request_cache.clear()
    assert request_cache.get("k") is None


def test_delete_removes_single_key():
    request_cache.reset()
    request_cache.set_value("k1", 1)
    request_cache.set_value("k2", 2)
    request_cache.delete("k1")
    assert request_cache.get("k1") is None
    assert request_cache.get("k2") == 2
    request_cache.clear()


def test_set_value_outside_context_is_noop():
    request_cache.clear()
    request_cache.set_value("k", 1)  # 无请求上下文时静默忽略
    assert request_cache.get("k") is None
```

- [ ] **Step 2：运行测试确认失败**

Run（`backend/`）：`pytest apps/common/tests/test_request_cache.py -v`
Expected：FAIL，`ImportError: cannot import name 'request_cache'`。

- [ ] **Step 3：写 `backend/apps/common/request_cache.py`**

```python
"""请求级缓存（spec §4.5 两级缓存的第一级）。

用 contextvar 存放「单次请求内」的缓存。约定：缓存值不允许为 None
（permission_service 只缓存集合与布尔值），故 get() 返回 None 即表示未命中。
RequestCacheMiddleware 在每个请求开始时 reset、结束时 clear。
"""
import contextvars

_store: contextvars.ContextVar = contextvars.ContextVar("request_cache_store")


def _current():
    """取当前请求级 store；不在请求上下文中（或已 clear）返回 None。"""
    try:
        return _store.get()
    except LookupError:
        return None


def reset():
    """请求开始时调用：建立一个空的请求级缓存。"""
    _store.set({})


def clear():
    """请求结束时调用：丢弃请求级缓存。"""
    _store.set(None)


def get(key):
    """取缓存值；未命中或不在请求上下文中返回 None。"""
    store = _current()
    if store is None:
        return None
    return store.get(key)


def set_value(key, value):
    """写缓存；不在请求上下文中时静默忽略。"""
    store = _current()
    if store is not None:
        store[key] = value


def delete(key):
    """删除单个键；不在请求上下文中时静默忽略。"""
    store = _current()
    if store is not None:
        store.pop(key, None)


class RequestCacheMiddleware:
    """每个请求开始时重置请求级缓存，结束时清理。"""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        reset()
        try:
            return self.get_response(request)
        finally:
            clear()
```

- [ ] **Step 4：在 `base.py` 的 `MIDDLEWARE` 末尾追加中间件**

把 `backend/config/settings/base.py` 中 `MIDDLEWARE` 列表的最后一项
`"django.middleware.clickjacking.XFrameOptionsMiddleware",`
之后追加一行：

```python
    "apps.common.request_cache.RequestCacheMiddleware",
```

- [ ] **Step 5：运行测试确认通过**

Run（`backend/`）：`pytest apps/common/tests/test_request_cache.py -v`
Expected：`5 passed`。

- [ ] **Step 6：Django 系统检查**

Run（`backend/`）：`python manage.py check`
Expected：`System check identified no issues (0 silenced).`

- [ ] **Step 7：提交**

```bash
git add backend/apps/common/request_cache.py backend/apps/common/tests/test_request_cache.py backend/config/settings/base.py
git commit -m "feat: common 增加请求级缓存与 RequestCacheMiddleware"
```

---

## Task 5：测试环境配置与 pytest fixture

**Files:**
- Create: `backend/config/settings/test.py`
- Modify: `backend/pytest.ini`（`DJANGO_SETTINGS_MODULE` 指向 `config.settings.test`）
- Modify: `backend/conftest.py`（追加 fixture，替换 Phase 1 占位内容）

测试环境用 `LocMemCache` 取代 Redis 缓存，使测试不依赖 Redis 服务；并加 autouse fixture 在每个测试前后清缓存，隔离权限缓存。后续 Task 6+ 的所有测试都依赖本 Task 的 fixture。

- [ ] **Step 1：写 `backend/config/settings/test.py`**

```python
"""测试环境配置：用本地内存缓存，使测试不依赖 Redis 服务。"""
from .dev import *  # noqa: F401,F403

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "bid-test-cache",
    },
}
```

- [ ] **Step 2：把 `pytest.ini` 的 settings 模块改为 test**

把 `backend/pytest.ini` 中
`DJANGO_SETTINGS_MODULE = config.settings.dev`
改为
`DJANGO_SETTINGS_MODULE = config.settings.test`。

- [ ] **Step 3：重写 `backend/conftest.py`**

完全替换 Phase 1 的占位内容（模型 import 放在 fixture 内部，避免 `AppRegistryNotReady`）：

```python
"""pytest 全局 fixture。"""
import pytest


@pytest.fixture(autouse=True)
def _clear_cache():
    """每个测试前后清空缓存，隔离权限缓存。"""
    from django.core.cache import cache

    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def api_client():
    from rest_framework.test import APIClient

    return APIClient()


@pytest.fixture
def normal_user(django_user_model):
    from apps.accounts.models import Role

    user = django_user_model.objects.create_user(
        username="normal", password="Str0ng-Pass-1", real_name="普通用户"
    )
    user.roles.add(Role.objects.get(code="normal_user"))
    return user


@pytest.fixture
def bid_manager_user(django_user_model):
    from apps.accounts.models import Role

    user = django_user_model.objects.create_user(
        username="manager", password="Str0ng-Pass-1", real_name="投标经理"
    )
    user.roles.add(Role.objects.get(code="bid_manager"))
    return user


@pytest.fixture
def admin_user(django_user_model):
    from apps.accounts.models import Role

    user = django_user_model.objects.create_user(
        username="sysadmin", password="Str0ng-Pass-1", real_name="系统管理员"
    )
    user.roles.add(Role.objects.get(code="system_admin"))
    return user


@pytest.fixture
def project(bid_manager_user):
    from apps.projects.models import Project

    return Project.objects.create(name="测试项目", created_by=bid_manager_user)
```

- [ ] **Step 4：运行已有测试验证配置未破坏**

Run（`backend/`）：`pytest -q`
Expected：Phase 1 与 Task 1-4 的全部测试仍通过（无 `failed` / `error`）。

- [ ] **Step 5：提交**

```bash
git add backend/config/settings/test.py backend/pytest.ini backend/conftest.py
git commit -m "chore: 增加测试环境配置与 pytest fixture"
```

---

## Task 6：`permission_service` 核心判定（全局 + 项目层）

**Files:**
- Create: `backend/apps/accounts/services/__init__.py`
- Create: `backend/apps/accounts/services/permission_service.py`
- Create: `backend/apps/accounts/tests/test_permission_service.py`

`permission_service` 是 spec §4.5 规定的**全系统唯一鉴权判定入口**。本 Task 实现「按 scope 分层判定」的核心：`is_system_admin` / 全局判定 / 项目判定 + 两级缓存；统一入口 `has_permission` 留待 Task 7。

- [ ] **Step 1：写测试 `backend/apps/accounts/tests/test_permission_service.py`**

```python
import pytest

from apps.accounts.services import permission_service as ps
from apps.projects.models import ProjectMember


@pytest.mark.django_db
def test_is_system_admin(admin_user, normal_user):
    assert ps.is_system_admin(admin_user) is True
    assert ps.is_system_admin(normal_user) is False


@pytest.mark.django_db
def test_is_system_admin_false_for_anonymous():
    from django.contrib.auth.models import AnonymousUser

    assert ps.is_system_admin(AnonymousUser()) is False


@pytest.mark.django_db
def test_global_permission_from_role(bid_manager_user, normal_user):
    assert ps.has_global_permission(bid_manager_user, "project.create") is True
    assert ps.has_global_permission(normal_user, "project.create") is False


@pytest.mark.django_db
def test_system_admin_passes_any_global_permission(admin_user):
    assert ps.has_global_permission(admin_user, "user.manage") is True
    assert ps.has_global_permission(admin_user, "project.create") is True


@pytest.mark.django_db
def test_get_global_permissions_admin_returns_all(admin_user):
    from apps.accounts.models import Permission

    expected = set(
        Permission.objects.filter(scope="global", is_active=True).values_list(
            "code", flat=True
        )
    )
    assert ps.get_global_permissions(admin_user) == expected


@pytest.mark.django_db
def test_get_global_permissions_bid_manager(bid_manager_user):
    assert ps.get_global_permissions(bid_manager_user) == {"project.create"}


@pytest.mark.django_db
def test_project_permission_for_member(normal_user, project):
    ProjectMember.objects.create(
        project=project, user=normal_user, project_role="editor"
    )
    assert ps.has_project_permission(normal_user, project, "section.edit") is True
    assert ps.has_project_permission(normal_user, project, "project.view") is True


@pytest.mark.django_db
def test_project_permission_denied_for_non_member(normal_user, project):
    """非项目成员 → 无任何项目权限（spec §6）。"""
    assert ps.has_project_permission(normal_user, project, "project.view") is False
    assert ps.get_project_permissions(normal_user, project) == set()


@pytest.mark.django_db
def test_project_role_limits_permissions(normal_user, project):
    """viewer 只读，无 section.edit。"""
    ProjectMember.objects.create(
        project=project, user=normal_user, project_role="viewer"
    )
    assert ps.has_project_permission(normal_user, project, "section.view") is True
    assert ps.has_project_permission(normal_user, project, "section.edit") is False


@pytest.mark.django_db
def test_system_admin_accesses_any_project_without_membership(admin_user, project):
    """system_admin 不要求 ProjectMember 关系（附录 A #12）。"""
    assert ps.has_project_permission(admin_user, project, "section.review") is True
    assert ps.has_project_permission(admin_user, project, "export.create") is True
```

- [ ] **Step 2：运行测试确认失败**

Run（`backend/`）：`pytest apps/accounts/tests/test_permission_service.py -v`
Expected：FAIL，`ModuleNotFoundError: No module named 'apps.accounts.services'`。

- [ ] **Step 3：创建空 `backend/apps/accounts/services/__init__.py`**

```bash
mkdir -p apps/accounts/services
touch apps/accounts/services/__init__.py
```

- [ ] **Step 4：写 `backend/apps/accounts/services/permission_service.py`**

```python
"""权限判定服务（spec §4.5）—— 全系统唯一鉴权判定入口。

DRF 权限类、视图、菜单计算都从这里取权限，不在视图里散落判定逻辑。
缓存策略（spec §4.5）：请求级缓存 + Redis 两级，TTL 180s；角色/成员/
权限变更时由 signals 主动失效相关键（见 Task 8）。
"""
from django.core.cache import cache

from apps.accounts.models import Permission
from apps.common import request_cache
from apps.projects.models import ProjectMember
from apps.projects.permissions import PROJECT_ROLE_PERMISSIONS

CACHE_TTL = 180  # spec §4.5：60–300s
SYSTEM_ADMIN_ROLE_CODE = "system_admin"


def _global_cache_key(user_id):
    return f"perm:global:user:{user_id}"


def _project_cache_key(user_id, project_id):
    return f"perm:project:user:{user_id}:project:{project_id}"


def _cached(key, producer):
    """两级缓存读取：先请求级，再 Redis，最后 producer() 计算并回填两级。

    约定缓存值不为 None（只缓存集合），故 None 即未命中。
    """
    hit = request_cache.get(key)
    if hit is not None:
        return hit
    hit = cache.get(key)
    if hit is not None:
        request_cache.set_value(key, hit)
        return hit
    value = producer()
    cache.set(key, value, CACHE_TTL)
    request_cache.set_value(key, value)
    return value


def _all_codes_by_scope(scope):
    return set(
        Permission.objects.filter(scope=scope, is_active=True).values_list(
            "code", flat=True
        )
    )


def is_system_admin(user):
    """是否系统管理员（请求级缓存，不进 Redis）。"""
    if user is None or not getattr(user, "is_authenticated", False):
        return False
    key = f"perm:is_admin:user:{user.pk}"
    hit = request_cache.get(key)
    if hit is not None:
        return hit
    result = user.roles.filter(code=SYSTEM_ADMIN_ROLE_CODE).exists()
    request_cache.set_value(key, result)
    return result


def get_global_permissions(user):
    """取用户全局权限码集合（供登录响应、菜单计算）。

    system_admin 直通：返回全部启用的 global 权限码。
    """
    if user is None or not getattr(user, "is_authenticated", False):
        return set()
    if is_system_admin(user):
        return _all_codes_by_scope(Permission.SCOPE_GLOBAL)

    def producer():
        return set(
            Permission.objects.filter(
                roles__users=user,
                scope=Permission.SCOPE_GLOBAL,
                is_active=True,
            )
            .values_list("code", flat=True)
            .distinct()
        )

    return _cached(_global_cache_key(user.pk), producer)


def has_global_permission(user, code):
    """全局权限判定。"""
    if is_system_admin(user):
        return True
    return code in get_global_permissions(user)


def get_project_permissions(user, project):
    """取用户在某项目的权限码集合（供 my-permissions、菜单二次裁剪）。

    system_admin 直通：返回全部启用的 project 权限码，且不要求 ProjectMember
    关系（spec §4.1、附录 A #12）。其余用户必须是该项目的 ProjectMember，
    按其 project_role 查 PROJECT_ROLE_PERMISSIONS 静态映射。
    """
    if (
        user is None
        or not getattr(user, "is_authenticated", False)
        or project is None
    ):
        return set()
    if is_system_admin(user):
        return _all_codes_by_scope(Permission.SCOPE_PROJECT)

    def producer():
        member = (
            ProjectMember.objects.filter(project=project, user=user)
            .only("project_role")
            .first()
        )
        if member is None:
            return set()
        return set(PROJECT_ROLE_PERMISSIONS.get(member.project_role, set()))

    return _cached(_project_cache_key(user.pk, project.pk), producer)


def has_project_permission(user, project, code):
    """项目权限判定。"""
    if is_system_admin(user):
        return True
    return code in get_project_permissions(user, project)
```

- [ ] **Step 5：运行测试确认通过**

Run（`backend/`）：`pytest apps/accounts/tests/test_permission_service.py -v`
Expected：`10 passed`。

- [ ] **Step 6：提交**

```bash
git add backend/apps/accounts/services backend/apps/accounts/tests/test_permission_service.py
git commit -m "feat: accounts 增加 permission_service 全局与项目层判定"
```

---

## Task 7：`permission_service.has_permission` 统一入口

**Files:**
- Modify: `backend/apps/accounts/services/permission_service.py`
- Create: `backend/apps/accounts/tests/test_permission_service_dispatch.py`

`has_permission` 是按权限点 `scope` 自动分流的总入口。**关键约束（附录 A #13）**：未知 / `is_active=False` / `scope` 与 `required_scope` 不一致的 `code` 一律拒绝；判定为 `project` scope 但 `project` 为 `None` 也拒绝，绝不默认放行。

- [ ] **Step 1：写测试 `backend/apps/accounts/tests/test_permission_service_dispatch.py`**

```python
import pytest

from apps.accounts.models import Permission
from apps.accounts.services import permission_service as ps
from apps.projects.models import ProjectMember


@pytest.mark.django_db
def test_unknown_code_is_denied(normal_user):
    assert ps.has_permission(normal_user, "nonexistent.code") is False


@pytest.mark.django_db
def test_inactive_permission_is_denied(bid_manager_user):
    Permission.objects.filter(code="project.create").update(is_active=False)
    assert ps.has_permission(bid_manager_user, "project.create") is False


@pytest.mark.django_db
def test_scope_mismatch_is_denied(bid_manager_user):
    """project.create 是 global；声明 required_scope=project → 拒绝。"""
    assert (
        ps.has_permission(
            bid_manager_user, "project.create", required_scope="project"
        )
        is False
    )


@pytest.mark.django_db
def test_global_dispatch(bid_manager_user, normal_user):
    assert ps.has_permission(bid_manager_user, "project.create") is True
    assert ps.has_permission(normal_user, "project.create") is False


@pytest.mark.django_db
def test_project_dispatch_requires_project(normal_user, project):
    ProjectMember.objects.create(
        project=project, user=normal_user, project_role="editor"
    )
    # project scope 权限码但未传 project → 拒绝
    assert ps.has_permission(normal_user, "section.edit") is False
    # 传 project → 正常判定
    assert ps.has_permission(normal_user, "section.edit", project=project) is True


@pytest.mark.django_db
def test_project_dispatch_with_required_scope(normal_user, project):
    ProjectMember.objects.create(
        project=project, user=normal_user, project_role="viewer"
    )
    assert (
        ps.has_permission(
            normal_user, "section.view", project=project, required_scope="project"
        )
        is True
    )
```

- [ ] **Step 2：运行测试确认失败**

Run（`backend/`）：`pytest apps/accounts/tests/test_permission_service_dispatch.py -v`
Expected：FAIL，`AttributeError: module ... has no attribute 'has_permission'`。

- [ ] **Step 3：在 `permission_service.py` 末尾追加 `has_permission`**

```python
def has_permission(user, code, project=None, required_scope=None):
    """总入口：按权限点 scope 自动走全局或项目判定（spec §4.5）。

    一律拒绝（绝不默认放行，附录 A #13）：
    - code 不存在，或对应 Permission.is_active=False；
    - required_scope 已声明且与 Permission.scope 不一致；
    - 判定 scope 为 project 但未传 project。
    """
    perm = (
        Permission.objects.filter(code=code, is_active=True).only("scope").first()
    )
    if perm is None:
        return False
    if required_scope is not None and perm.scope != required_scope:
        return False
    if perm.scope == Permission.SCOPE_GLOBAL:
        return has_global_permission(user, code)
    if project is None:
        return False
    return has_project_permission(user, project, code)
```

- [ ] **Step 4：运行测试确认通过**

Run（`backend/`）：`pytest apps/accounts/tests/test_permission_service_dispatch.py -v`
Expected：`6 passed`。

- [ ] **Step 5：提交**

```bash
git add backend/apps/accounts/services/permission_service.py backend/apps/accounts/tests/test_permission_service_dispatch.py
git commit -m "feat: permission_service 增加 has_permission 统一判定入口"
```

---

## Task 8：权限缓存失效与信号

**Files:**
- Modify: `backend/apps/accounts/services/permission_service.py`（追加失效函数）
- Create: `backend/apps/accounts/signals.py`
- Create: `backend/apps/projects/signals.py`
- Modify: `backend/apps/accounts/apps.py`、`backend/apps/projects/apps.py`（`ready()` 加载信号）
- Create: `backend/apps/accounts/tests/test_permission_cache_invalidation.py`

spec §4.5：角色/成员/权限变更时主动失效相关缓存键。所有失效都精确到键——`ProjectMember` 变更知道确切的 `(user_id, project_id)`；`Role.permissions` / `User.roles` 变更可枚举受影响用户——无需通配删除。

- [ ] **Step 1：在 `permission_service.py` 末尾追加失效函数**

```python
def invalidate_global(user_id):
    """失效某用户的全局权限缓存。"""
    cache.delete(_global_cache_key(user_id))


def invalidate_project(user_id, project_id):
    """失效某用户在某项目的权限缓存。"""
    cache.delete(_project_cache_key(user_id, project_id))
```

- [ ] **Step 2：写测试 `backend/apps/accounts/tests/test_permission_cache_invalidation.py`**

```python
import pytest

from apps.accounts.models import Permission, Role
from apps.accounts.services import permission_service as ps
from apps.projects.models import ProjectMember


@pytest.mark.django_db
def test_role_permission_change_invalidates_global_cache(normal_user):
    assert ps.has_global_permission(normal_user, "project.create") is False
    Role.objects.get(code="normal_user").permissions.add(
        Permission.objects.get(code="project.create")
    )
    assert ps.has_global_permission(normal_user, "project.create") is True


@pytest.mark.django_db
def test_user_role_change_invalidates_global_cache(normal_user):
    assert ps.has_global_permission(normal_user, "project.create") is False
    normal_user.roles.add(Role.objects.get(code="bid_manager"))
    assert ps.has_global_permission(normal_user, "project.create") is True


@pytest.mark.django_db
def test_member_create_invalidates_project_cache(normal_user, project):
    assert ps.has_project_permission(normal_user, project, "project.view") is False
    ProjectMember.objects.create(
        project=project, user=normal_user, project_role="viewer"
    )
    assert ps.has_project_permission(normal_user, project, "project.view") is True


@pytest.mark.django_db
def test_member_delete_invalidates_project_cache(normal_user, project):
    member = ProjectMember.objects.create(
        project=project, user=normal_user, project_role="viewer"
    )
    assert ps.has_project_permission(normal_user, project, "project.view") is True
    member.delete()
    assert ps.has_project_permission(normal_user, project, "project.view") is False
```

- [ ] **Step 3：运行测试确认失败**

Run（`backend/`）：`pytest apps/accounts/tests/test_permission_cache_invalidation.py -v`
Expected：FAIL —— 缓存未失效，第二次断言仍读到旧值。

- [ ] **Step 4：写 `backend/apps/accounts/signals.py`**

```python
"""accounts 权限缓存失效信号（spec §4.5）。"""
from django.contrib.auth import get_user_model
from django.db.models.signals import m2m_changed
from django.dispatch import receiver

from apps.accounts.models import Role
from apps.accounts.services import permission_service

User = get_user_model()

_M2M_ACTIONS = ("post_add", "post_remove", "post_clear")


@receiver(m2m_changed, sender=User.roles.through)
def _on_user_roles_changed(sender, instance, action, pk_set, **kwargs):
    """User.roles 变更 → 失效相关用户的全局权限缓存。"""
    if action not in _M2M_ACTIONS:
        return
    if isinstance(instance, User):
        permission_service.invalidate_global(instance.pk)
    else:  # instance 为 Role（role.users.add/remove 这一侧）
        for user_id in pk_set or []:
            permission_service.invalidate_global(user_id)


@receiver(m2m_changed, sender=Role.permissions.through)
def _on_role_permissions_changed(sender, instance, action, **kwargs):
    """Role.permissions 变更 → 失效该角色全部用户的全局权限缓存。"""
    if action not in _M2M_ACTIONS:
        return
    if isinstance(instance, Role):
        user_ids = list(instance.users.values_list("pk", flat=True))
    else:  # instance 为 Permission（permission.roles.add/remove 这一侧）
        user_ids = list(
            User.objects.filter(roles__permissions=instance)
            .values_list("pk", flat=True)
            .distinct()
        )
    for user_id in user_ids:
        permission_service.invalidate_global(user_id)
```

- [ ] **Step 5：写 `backend/apps/projects/signals.py`**

```python
"""projects 权限缓存失效信号（spec §4.5）。"""
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from apps.accounts.services import permission_service
from apps.projects.models import ProjectMember


@receiver([post_save, post_delete], sender=ProjectMember)
def _on_project_member_changed(sender, instance, **kwargs):
    """ProjectMember 增删改 → 失效该成员在该项目的权限缓存。"""
    permission_service.invalidate_project(instance.user_id, instance.project_id)
```

- [ ] **Step 6：在 `apps.py` 的 `ready()` 中加载信号**

`backend/apps/accounts/apps.py` 给 `AccountsConfig` 增加 `ready()`：

```python
from django.apps import AppConfig


class AccountsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.accounts"

    def ready(self):
        from . import signals  # noqa: F401
```

`backend/apps/projects/apps.py` 给 `ProjectsConfig` 同样增加 `ready()`：

```python
from django.apps import AppConfig


class ProjectsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.projects"

    def ready(self):
        from . import signals  # noqa: F401
```

- [ ] **Step 7：运行测试确认通过**

Run（`backend/`）：`pytest apps/accounts/tests/test_permission_cache_invalidation.py -v`
Expected：`4 passed`。

- [ ] **Step 8：提交**

```bash
git add backend/apps/accounts/services/permission_service.py backend/apps/accounts/signals.py backend/apps/accounts/apps.py backend/apps/projects/signals.py backend/apps/projects/apps.py backend/apps/accounts/tests/test_permission_cache_invalidation.py
git commit -m "feat: 角色/成员/权限变更时主动失效权限缓存"
```

---

## Task 9：统一异常体系与分页

**Files:**
- Create: `backend/apps/common/exceptions.py`
- Create: `backend/apps/common/pagination.py`
- Modify: `backend/config/settings/base.py`（填充 `REST_FRAMEWORK`）
- Create: `backend/apps/common/tests/test_exceptions.py`

spec §5.9：DRF 自定义 `EXCEPTION_HANDLER`，统一错误响应体 `{ "code", "message", "detail" }`。本 Task 落地全部业务异常类与处理器，并首次填充 `REST_FRAMEWORK`。

- [ ] **Step 1：写测试 `backend/apps/common/tests/test_exceptions.py`**

```python
from rest_framework import status
from rest_framework.exceptions import NotFound

from apps.common import exceptions as exc


def test_api_error_subclass_codes_and_status():
    assert exc.ValidationError().code == "validation_error"
    assert exc.ValidationError().status_code == status.HTTP_400_BAD_REQUEST
    assert exc.PermissionDenied().code == "permission_denied"
    assert exc.PermissionDenied().status_code == status.HTTP_403_FORBIDDEN
    assert exc.AccountLocked().status_code == 423
    assert exc.RateLimited().status_code == 429
    assert exc.TokenExpired().code == "token_expired"
    assert exc.TokenInvalid().code == "token_invalid"
    assert exc.MustChangePassword().code == "must_change_password"
    assert exc.AccountDisabled().code == "account_disabled"


def test_api_error_custom_message_and_detail():
    e = exc.ValidationError(message="字段缺失", detail={"field": "username"})
    assert e.message == "字段缺失"
    assert e.detail_payload == {"field": "username"}


def test_handler_formats_api_error():
    response = exc.custom_exception_handler(exc.PermissionDenied(message="不行"), {})
    assert response.status_code == 403
    assert response.data == {
        "code": "permission_denied",
        "message": "不行",
        "detail": {},
    }


def test_handler_maps_drf_not_found():
    response = exc.custom_exception_handler(NotFound(), {})
    assert response.status_code == 404
    assert response.data["code"] == "not_found"


def test_handler_returns_none_for_unhandled():
    assert exc.custom_exception_handler(ValueError("x"), {}) is None
```

- [ ] **Step 2：运行测试确认失败**

Run（`backend/`）：`pytest apps/common/tests/test_exceptions.py -v`
Expected：FAIL，`ImportError: cannot import name 'exceptions'`。

- [ ] **Step 3：写 `backend/apps/common/exceptions.py`**

```python
"""统一 API 异常与 DRF 异常处理器（spec §5.9）。

所有业务异常继承 APIError，携带稳定 code；响应体统一为
{ "code", "message", "detail" }。
"""
from rest_framework import status
from rest_framework.exceptions import APIException
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler


class APIError(APIException):
    """业务异常基类。"""

    status_code = status.HTTP_400_BAD_REQUEST
    default_code = "server_error"
    default_message = "请求处理失败"

    def __init__(self, message=None, detail=None, code=None):
        self.code = code or self.default_code
        self.message = message or self.default_message
        self.detail_payload = detail or {}
        super().__init__(detail=self.message)


class ValidationError(APIError):
    status_code = status.HTTP_400_BAD_REQUEST
    default_code = "validation_error"
    default_message = "参数校验失败"


class AuthenticationFailed(APIError):
    status_code = status.HTTP_401_UNAUTHORIZED
    default_code = "unauthenticated"
    default_message = "未认证或认证失败"


class TokenExpired(APIError):
    status_code = status.HTTP_401_UNAUTHORIZED
    default_code = "token_expired"
    default_message = "登录态已过期"


class TokenInvalid(APIError):
    status_code = status.HTTP_401_UNAUTHORIZED
    default_code = "token_invalid"
    default_message = "登录凭据非法"


class PermissionDenied(APIError):
    status_code = status.HTTP_403_FORBIDDEN
    default_code = "permission_denied"
    default_message = "无权限执行此操作"


class AccountDisabled(APIError):
    status_code = status.HTTP_403_FORBIDDEN
    default_code = "account_disabled"
    default_message = "账号已停用"


class MustChangePassword(APIError):
    status_code = status.HTTP_403_FORBIDDEN
    default_code = "must_change_password"
    default_message = "请先修改初始密码"


class NotFound(APIError):
    status_code = status.HTTP_404_NOT_FOUND
    default_code = "not_found"
    default_message = "资源不存在"


class AccountLocked(APIError):
    status_code = status.HTTP_423_LOCKED
    default_code = "account_locked"
    default_message = "账号已被锁定，请稍后再试"


class RateLimited(APIError):
    status_code = status.HTTP_429_TOO_MANY_REQUESTS
    default_code = "rate_limited"
    default_message = "操作过于频繁，请稍后再试"


_STATUS_FALLBACK = {
    400: ("validation_error", "参数校验失败"),
    401: ("unauthenticated", "未认证"),
    403: ("permission_denied", "无权限执行此操作"),
    404: ("not_found", "资源不存在"),
    405: ("method_not_allowed", "请求方法不被允许"),
    415: ("unsupported_media_type", "不支持的请求体类型"),
    429: ("rate_limited", "操作过于频繁，请稍后再试"),
}


def _map_drf_exception(exc, response):
    """把 DRF 内建异常映射为本系统稳定 code。"""
    from django.http import Http404
    from rest_framework import exceptions as drf_exc

    if isinstance(exc, (drf_exc.NotFound, Http404)):
        return "not_found", "资源不存在"
    if isinstance(exc, drf_exc.NotAuthenticated):
        return "unauthenticated", "未认证"
    if isinstance(exc, drf_exc.AuthenticationFailed):
        return "unauthenticated", "认证失败"
    if isinstance(exc, drf_exc.PermissionDenied):
        return "permission_denied", "无权限执行此操作"
    if isinstance(exc, drf_exc.ValidationError):
        return "validation_error", "参数校验失败"
    if isinstance(exc, drf_exc.Throttled):
        return "rate_limited", "操作过于频繁，请稍后再试"
    fallback = _STATUS_FALLBACK.get(response.status_code)
    if fallback:
        return fallback
    if response.status_code >= 500:
        return "server_error", "服务端错误"
    return "error", "请求处理失败"


def custom_exception_handler(exc, context):
    """把异常规整为 { code, message, detail } 响应体。"""
    if isinstance(exc, APIError):
        return Response(
            {"code": exc.code, "message": exc.message, "detail": exc.detail_payload},
            status=exc.status_code,
        )
    response = drf_exception_handler(exc, context)
    if response is None:
        return None
    code, message = _map_drf_exception(exc, response)
    detail = (
        response.data
        if isinstance(response.data, dict)
        else {"detail": response.data}
    )
    response.data = {"code": code, "message": message, "detail": detail}
    return response
```

- [ ] **Step 4：写 `backend/apps/common/pagination.py`**

```python
"""统一分页（spec §3.5）。"""
from rest_framework.pagination import PageNumberPagination


class DefaultPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100
```

- [ ] **Step 5：在 `base.py` 填充 `REST_FRAMEWORK`**

把 `backend/config/settings/base.py` 中的
`REST_FRAMEWORK: dict = {}`
替换为：

```python
REST_FRAMEWORK = {
    # DEFAULT_AUTHENTICATION_CLASSES 由 Task 14 填入 JWTAuthentication
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    # DEFAULT_PERMISSION_CLASSES 由 Task 18 追加 MustChangePasswordPermission
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_PAGINATION_CLASS": "apps.common.pagination.DefaultPagination",
    "PAGE_SIZE": 20,
    "EXCEPTION_HANDLER": "apps.common.exceptions.custom_exception_handler",
}
```

- [ ] **Step 6：运行测试与系统检查**

Run（`backend/`）：`pytest apps/common/tests/test_exceptions.py -v && python manage.py check`
Expected：`5 passed`；`System check identified no issues (0 silenced).`

- [ ] **Step 7：提交**

```bash
git add backend/apps/common/exceptions.py backend/apps/common/pagination.py backend/config/settings/base.py backend/apps/common/tests/test_exceptions.py
git commit -m "feat: common 增加统一异常体系与分页配置"
```

---

## Task 10：`common.utils` 与 `audit_service` 审计日志服务

**Files:**
- Create: `backend/apps/common/utils.py`
- Create: `backend/apps/audit/services/__init__.py`
- Create: `backend/apps/audit/services/audit_service.py`
- Test: `backend/apps/common/tests/test_utils.py`
- Test: `backend/apps/audit/tests/test_audit_service.py`

审计日志只追加（spec §5.10）。`audit_service.log_operation` 是写 `OperationLog` 的唯一入口；登录失败等无已认证用户的事件 `actor` 传 `None`，上下文写 `extra`（附录 A #5）。`OperationLog.ip` 是 `GenericIPAddressField`，无 IP 时必须存 `None` 而非空串。

- [ ] **Step 1：写 `get_client_ip` / `get_user_agent` 的失败测试**

创建 `backend/apps/common/tests/test_utils.py`：

```python
"""apps.common.utils 工具函数测试。"""
from apps.common.utils import get_client_ip, get_user_agent


def test_get_client_ip_prefers_forwarded_for(rf):
    request = rf.get("/", HTTP_X_FORWARDED_FOR="198.51.100.4, 10.0.0.9")
    assert get_client_ip(request) == "198.51.100.4"


def test_get_client_ip_falls_back_to_remote_addr(rf):
    request = rf.get("/")
    assert get_client_ip(request) == "127.0.0.1"


def test_get_client_ip_none_request_returns_none():
    assert get_client_ip(None) is None


def test_get_user_agent_truncates(rf):
    request = rf.get("/", HTTP_USER_AGENT="x" * 600)
    assert len(get_user_agent(request)) == 512


def test_get_user_agent_none_request_returns_empty():
    assert get_user_agent(None) == ""
```

- [ ] **Step 2：运行测试确认失败**

Run（`backend/`）：`pytest apps/common/tests/test_utils.py -v`
Expected：FAIL，`ModuleNotFoundError: No module named 'apps.common.utils'`。

- [ ] **Step 3：创建 `common/utils.py`**

```python
"""HTTP 请求相关的轻量工具函数。"""


def get_client_ip(request):
    """取客户端 IP。

    优先取 X-Forwarded-For 的第一段（最初的客户端）；否则回退 REMOTE_ADDR。
    无可用 IP 时返回 None——GenericIPAddressField 不接受空串。
    """
    if request is None:
        return None
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded:
        candidate = forwarded.split(",")[0].strip()
        if candidate:
            return candidate
    return request.META.get("REMOTE_ADDR") or None


def get_user_agent(request):
    """取 User-Agent，截断到 512 字符（与 OperationLog.user_agent 长度一致）。"""
    if request is None:
        return ""
    return request.META.get("HTTP_USER_AGENT", "")[:512]
```

- [ ] **Step 4：运行测试确认通过**

Run（`backend/`）：`pytest apps/common/tests/test_utils.py -v`
Expected：`5 passed`。

- [ ] **Step 5：写 `audit_service.log_operation` 的失败测试**

创建 `backend/apps/audit/tests/test_audit_service.py`：

```python
"""apps.audit.services.audit_service 测试。"""
import pytest

from apps.audit.models import OperationLog
from apps.audit.services import audit_service


@pytest.mark.django_db
def test_log_operation_with_actor(normal_user):
    log = audit_service.log_operation(
        actor=normal_user, action="login_success", summary="登录成功"
    )
    assert log.pk is not None
    assert log.actor == normal_user
    assert log.action == "login_success"
    assert OperationLog.objects.count() == 1


@pytest.mark.django_db
def test_log_operation_anonymous_actor_none():
    log = audit_service.log_operation(
        actor=None, action="login_failed", extra={"username": "ghost"}
    )
    assert log.actor is None
    assert log.extra == {"username": "ghost"}


@pytest.mark.django_db
def test_log_operation_extracts_ip_and_target(rf):
    request = rf.post("/api/auth/login", HTTP_X_FORWARDED_FOR="203.0.113.7, 10.0.0.1")
    log = audit_service.log_operation(
        actor=None, action="login_failed", request=request,
        target_type="user", target_id=42,
    )
    assert log.ip == "203.0.113.7"
    assert log.target_type == "user"
    assert log.target_id == "42"


@pytest.mark.django_db
def test_log_operation_no_request_leaves_ip_none():
    log = audit_service.log_operation(actor=None, action="login_failed")
    assert log.ip is None
    assert log.user_agent == ""
```

- [ ] **Step 6：运行测试确认失败**

Run（`backend/`）：`pytest apps/audit/tests/test_audit_service.py -v`
Expected：FAIL，`ModuleNotFoundError: No module named 'apps.audit.services'`。

- [ ] **Step 7：创建 `audit/services/` 包**

创建空文件 `backend/apps/audit/services/__init__.py`（内容为单行 docstring）：

```python
"""audit 应用的服务层。"""
```

创建 `backend/apps/audit/services/audit_service.py`：

```python
"""审计日志服务（spec §5.10）。

log_operation 是写 OperationLog 的唯一入口。OperationLog 只追加不更新。
登录失败等无已认证用户的事件：actor 传 None，尝试的用户名/原因写 extra。
"""
from apps.audit.models import OperationLog
from apps.common.utils import get_client_ip, get_user_agent


def log_operation(
    *,
    actor,
    action,
    request=None,
    target_type="",
    target_id="",
    summary="",
    extra=None,
):
    """写一条操作日志并返回 OperationLog 实例。

    参数全部 keyword-only，避免调用点位置参数写错。
    actor 允许为 None（匿名/登录失败场景）。
    """
    return OperationLog.objects.create(
        actor=actor,
        action=action,
        target_type=target_type,
        target_id=str(target_id) if target_id != "" else "",
        summary=summary,
        extra=extra or {},
        ip=get_client_ip(request),
        user_agent=get_user_agent(request),
    )
```

- [ ] **Step 8：运行测试确认通过**

Run（`backend/`）：`pytest apps/audit/tests/test_audit_service.py -v`
Expected：`4 passed`。

- [ ] **Step 9：提交**

```bash
git add backend/apps/common/utils.py backend/apps/common/tests/test_utils.py backend/apps/audit/services backend/apps/audit/tests/test_audit_service.py
git commit -m "feat: 增加 common.utils 与 audit_service 审计日志服务"
```

---

## Task 11：认证 Provider 抽象与 `password` Provider

**Files:**
- Create: `backend/apps/accounts/auth/__init__.py`
- Create: `backend/apps/accounts/auth/exceptions.py`
- Create: `backend/apps/accounts/auth/base.py`
- Create: `backend/apps/accounts/auth/password.py`
- Create: `backend/apps/accounts/auth/registry.py`
- Test: `backend/apps/accounts/tests/test_auth_providers.py`

spec §5.1 要求认证可插拔：Provider 只负责「用一组凭证换出本地 `User`」，不签发 Token、不做 `is_active` 校验（后者集中在 `login_service.complete_login`，见附录 A #6）。`PasswordAuthProvider` 刻意不走 `django.contrib.auth.authenticate`——后者会顺带做 `is_active` 校验，与 spec 的职责划分冲突。

- [ ] **Step 1：写 Provider 的失败测试**

创建 `backend/apps/accounts/tests/test_auth_providers.py`：

```python
"""认证 Provider 测试（spec §5.1）。"""
import pytest

from apps.accounts.auth import exceptions as auth_exc
from apps.accounts.auth.password import PasswordAuthProvider
from apps.accounts.auth.registry import get_provider


@pytest.mark.django_db
def test_password_provider_returns_user_on_valid_credentials(normal_user):
    provider = PasswordAuthProvider()
    user = provider.authenticate(
        {"username": "normal", "password": "Str0ng-Pass-1"}
    )
    assert user == normal_user


@pytest.mark.django_db
def test_password_provider_rejects_wrong_password(normal_user):
    provider = PasswordAuthProvider()
    with pytest.raises(auth_exc.InvalidCredentials):
        provider.authenticate({"username": "normal", "password": "wrong"})


@pytest.mark.django_db
def test_password_provider_rejects_unknown_username():
    provider = PasswordAuthProvider()
    with pytest.raises(auth_exc.InvalidCredentials):
        provider.authenticate({"username": "ghost", "password": "whatever"})


@pytest.mark.django_db
def test_password_provider_rejects_blank_credentials():
    provider = PasswordAuthProvider()
    with pytest.raises(auth_exc.InvalidCredentials):
        provider.authenticate({"username": "", "password": ""})


@pytest.mark.django_db
def test_password_provider_accepts_disabled_user(normal_user):
    """Provider 不做 is_active 校验：停用账号也能换出 User，由 login_service 拦截。"""
    normal_user.is_active = False
    normal_user.save(update_fields=["is_active"])
    provider = PasswordAuthProvider()
    user = provider.authenticate(
        {"username": "normal", "password": "Str0ng-Pass-1"}
    )
    assert user == normal_user


def test_get_provider_returns_password_provider():
    assert isinstance(get_provider("password"), PasswordAuthProvider)


def test_get_provider_unknown_code_raises():
    with pytest.raises(auth_exc.ProviderUnavailable):
        get_provider("saml")
```

- [ ] **Step 2：运行测试确认失败**

Run（`backend/`）：`pytest apps/accounts/tests/test_auth_providers.py -v`
Expected：FAIL，`ModuleNotFoundError: No module named 'apps.accounts.auth'`。

- [ ] **Step 3：创建 `auth/` 包与异常**

创建 `backend/apps/accounts/auth/__init__.py`：

```python
"""认证 Provider 子系统（spec §5.1）。"""
```

创建 `backend/apps/accounts/auth/exceptions.py`：

```python
"""认证流程异常。

这些异常属于"认证子系统内部语言"，由 LoginView 翻译成 common.exceptions
中带 error_code 的 APIError 后返回前端——Provider 自身不关心 HTTP。
"""


class AuthError(Exception):
    """认证流程异常基类。"""


class InvalidCredentials(AuthError):
    """用户名或密码错误。"""


class AccountDisabled(AuthError):
    """账号已被停用。"""


class AccountLocked(AuthError):
    """账号因连续登录失败被临时锁定。"""


class ProviderUnavailable(AuthError):
    """认证 Provider 不存在或暂不可用。"""


class ExternalIdentityNotBound(AuthError):
    """外部身份未绑定到任何本地用户（预留给后续 OAuth/LDAP Provider）。"""
```

- [ ] **Step 4：创建 `auth/base.py`**

```python
"""认证 Provider 抽象基类。"""


class BaseAuthProvider:
    """所有认证 Provider 的基类（spec §5.1）。

    职责单一：用一组凭证换出一个本地 User。
    刻意不做：签发 Token、is_active 校验、写审计日志——这些由
    login_service.complete_login 统一处理，保证不同 Provider 行为一致。
    """

    provider_code = ""

    def authenticate(self, credentials):
        """校验凭证并返回本地 User；失败抛 auth.exceptions 中的异常。

        credentials 是一个 dict，字段由具体 Provider 约定。
        """
        raise NotImplementedError
```

- [ ] **Step 5：创建 `auth/password.py`**

```python
"""用户名 + 密码认证 Provider。"""
from apps.accounts.auth.base import BaseAuthProvider
from apps.accounts.auth.exceptions import InvalidCredentials
from apps.accounts.models import User


class PasswordAuthProvider(BaseAuthProvider):
    """用户名 + 密码认证（spec §5.1）。

    刻意不使用 django.contrib.auth.authenticate：后者会顺带校验 is_active，
    而 spec §5.2／附录 A #6 要求 is_active 校验集中在 login_service，
    以便对停用账号返回精确的 ACCOUNT_DISABLED 错误码。
    """

    provider_code = "password"

    def authenticate(self, credentials):
        username = (credentials.get("username") or "").strip()
        password = credentials.get("password") or ""
        if not username or not password:
            raise InvalidCredentials
        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist:
            raise InvalidCredentials
        if not user.check_password(password):
            raise InvalidCredentials
        return user
```

- [ ] **Step 6：创建 `auth/registry.py`**

```python
"""认证 Provider 注册表。"""
from apps.accounts.auth.exceptions import ProviderUnavailable
from apps.accounts.auth.password import PasswordAuthProvider

_PROVIDERS = {
    PasswordAuthProvider.provider_code: PasswordAuthProvider,
}


def get_provider(provider_code):
    """按 provider_code 取 Provider 实例；未知 code 抛 ProviderUnavailable。

    新增 Provider（OAuth/LDAP 等）只需在此登记，调用方无需改动。
    """
    provider_cls = _PROVIDERS.get(provider_code)
    if provider_cls is None:
        raise ProviderUnavailable(f"未知认证 Provider：{provider_code}")
    return provider_cls()
```

- [ ] **Step 7：运行测试确认通过**

Run（`backend/`）：`pytest apps/accounts/tests/test_auth_providers.py -v`
Expected：`7 passed`。

- [ ] **Step 8：提交**

```bash
git add backend/apps/accounts/auth backend/apps/accounts/tests/test_auth_providers.py
git commit -m "feat: 增加可插拔认证 Provider 抽象与 password Provider"
```

---

## Task 12：登录失败限流 `login_throttle`

**Files:**
- Create: `backend/apps/accounts/services/login_throttle.py`
- Test: `backend/apps/accounts/tests/test_login_throttle.py`

spec §5.4：连续登录失败按「用户名 + IP」维度计数，达到 5 次锁定 15 分钟。计数存 Django cache（生产 Redis、测试 LocMemCache）。每次失败都用新的 15 分钟 TTL 重置——锁定窗口从「最后一次失败」起算。

- [ ] **Step 1：写限流的失败测试**

创建 `backend/apps/accounts/tests/test_login_throttle.py`：

```python
"""登录失败限流测试（spec §5.4）。"""
from apps.accounts.services import login_throttle


def test_record_failure_increments():
    assert login_throttle.record_failure("alice", "10.0.0.1") == 1
    assert login_throttle.record_failure("alice", "10.0.0.1") == 2


def test_is_locked_after_max_failures():
    for _ in range(login_throttle.MAX_FAILURES):
        login_throttle.record_failure("bob", "10.0.0.1")
    assert login_throttle.is_locked("bob", "10.0.0.1") is True


def test_not_locked_below_threshold():
    for _ in range(login_throttle.MAX_FAILURES - 1):
        login_throttle.record_failure("carol", "10.0.0.1")
    assert login_throttle.is_locked("carol", "10.0.0.1") is False


def test_reset_clears_failures():
    for _ in range(login_throttle.MAX_FAILURES):
        login_throttle.record_failure("dave", "10.0.0.1")
    login_throttle.reset("dave", "10.0.0.1")
    assert login_throttle.is_locked("dave", "10.0.0.1") is False


def test_different_ip_counted_separately():
    for _ in range(login_throttle.MAX_FAILURES):
        login_throttle.record_failure("erin", "10.0.0.1")
    assert login_throttle.is_locked("erin", "10.0.0.2") is False
```

> `_clear_cache` autouse fixture（Task 5）已保证每个测试缓存隔离，无需 `django_db` 标记。

- [ ] **Step 2：运行测试确认失败**

Run（`backend/`）：`pytest apps/accounts/tests/test_login_throttle.py -v`
Expected：FAIL，`ImportError: cannot import name 'login_throttle'`。

- [ ] **Step 3：创建 `accounts/services/login_throttle.py`**

```python
"""登录失败限流（spec §5.4）。

按 用户名 + IP 维度统计连续登录失败次数；达到 MAX_FAILURES 锁定 LOCK_SECONDS。
计数存 Django cache。每次失败都用完整 TTL 重置，锁定窗口从最后一次失败起算。
"""
from django.core.cache import cache

MAX_FAILURES = 5
LOCK_SECONDS = 15 * 60


def _key(username, ip):
    return f"login_fail:{username}:{ip or '-'}"


def is_locked(username, ip):
    """是否已达失败上限。"""
    return cache.get(_key(username, ip), 0) >= MAX_FAILURES


def record_failure(username, ip):
    """记一次登录失败，返回累计失败次数。"""
    key = _key(username, ip)
    failures = cache.get(key, 0) + 1
    cache.set(key, failures, LOCK_SECONDS)
    return failures


def reset(username, ip):
    """登录成功后清除该 用户名+IP 的失败计数。"""
    cache.delete(_key(username, ip))
```

- [ ] **Step 4：运行测试确认通过**

Run（`backend/`）：`pytest apps/accounts/tests/test_login_throttle.py -v`
Expected：`5 passed`。

- [ ] **Step 5：提交**

```bash
git add backend/apps/accounts/services/login_throttle.py backend/apps/accounts/tests/test_login_throttle.py
git commit -m "feat: 增加登录失败限流 login_throttle"
```

---

## Task 13：`UserSerializer` + `menu_service` + `login_service.complete_login`

**Files:**
- Create: `backend/apps/accounts/serializers.py`
- Create: `backend/apps/accounts/services/menu_service.py`
- Create: `backend/apps/accounts/services/login_service.py`
- Test: `backend/apps/accounts/tests/test_login_service.py`

`login_service.complete_login` 是登录流程的统一收尾（spec §5.2）：Provider 换出 `User` 后，集中做 `is_active` 校验、签发 JWT、收集全局权限与菜单树、写审计日志，返回登录响应所需的全部数据。菜单树由全局权限过滤得到，前端据此渲染左侧导航（Phase 3 登录页消费 `menu_tree`）。

> 本 Task 创建 `serializers.py` 并先放入 `UserSerializer`；`LoginSerializer`（Task 14）、`ChangePasswordSerializer`（Task 16）后续追加到同一文件。

- [ ] **Step 1：写 `menu_service` + `login_service` 的失败测试**

创建 `backend/apps/accounts/tests/test_login_service.py`：

```python
"""menu_service 与 login_service 测试（spec §5.2）。"""
import pytest

from apps.accounts.auth.exceptions import AccountDisabled
from apps.accounts.services import login_service
from apps.accounts.services.menu_service import build_menu_tree


def test_build_menu_tree_filters_by_permission():
    tree = build_menu_tree(["user.manage"])
    keys = {node["key"] for node in tree}
    assert "dashboard" in keys      # permission=None，始终可见
    assert "users" in keys          # user.manage 命中
    assert "roles" not in keys      # role.manage 未命中


def test_build_menu_tree_empty_permissions_keeps_public_items():
    tree = build_menu_tree([])
    keys = {node["key"] for node in tree}
    assert keys == {"dashboard", "projects"}


@pytest.mark.django_db
def test_complete_login_returns_tokens_and_profile(bid_manager_user, rf):
    request = rf.post("/api/auth/login")
    result = login_service.complete_login(bid_manager_user, request)
    assert result["access"]
    assert result["refresh"]
    assert result["user"]["username"] == "manager"
    assert result["global_permissions"] == ["project.create"]
    assert result["must_change_password"] is False
    assert any(node["key"] == "dashboard" for node in result["menu_tree"])


@pytest.mark.django_db
def test_complete_login_rejects_disabled_account(normal_user, rf):
    normal_user.is_active = False
    normal_user.save(update_fields=["is_active"])
    request = rf.post("/api/auth/login")
    with pytest.raises(AccountDisabled):
        login_service.complete_login(normal_user, request)


@pytest.mark.django_db
def test_complete_login_updates_last_login(normal_user, rf):
    assert normal_user.last_login is None
    request = rf.post("/api/auth/login")
    login_service.complete_login(normal_user, request)
    normal_user.refresh_from_db()
    assert normal_user.last_login is not None
```

- [ ] **Step 2：运行测试确认失败**

Run（`backend/`）：`pytest apps/accounts/tests/test_login_service.py -v`
Expected：FAIL，`ImportError: cannot import name 'login_service'`。

- [ ] **Step 3：创建 `accounts/serializers.py` 与 `UserSerializer`**

```python
"""accounts 应用的 DRF 序列化器。"""
from rest_framework import serializers

from apps.accounts.models import User


class UserSerializer(serializers.ModelSerializer):
    """用户信息（登录响应、me 接口）；全部字段只读。"""

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "real_name",
            "email",
            "phone",
            "department",
            "is_active",
            "must_change_password",
            "last_login",
        ]
        read_only_fields = fields
```

- [ ] **Step 4：创建 `accounts/services/menu_service.py`**

```python
"""菜单树服务（spec §5.2 登录响应 menu_tree）。

菜单按全局权限过滤：permission 为 None 的项始终可见，
否则要求登录用户的全局权限集合包含该权限码。
"""

MENU_DEFINITION = [
    {"key": "dashboard", "title": "工作台", "icon": "Odometer",
     "route": "/dashboard", "permission": None},
    {"key": "projects", "title": "项目管理", "icon": "Folder",
     "route": "/projects", "permission": None},
    {"key": "users", "title": "用户管理", "icon": "User",
     "route": "/admin/users", "permission": "user.manage"},
    {"key": "roles", "title": "角色权限", "icon": "Lock",
     "route": "/admin/roles", "permission": "role.manage"},
    {"key": "audit", "title": "操作审计", "icon": "Document",
     "route": "/admin/audit", "permission": "audit.view"},
]


def build_menu_tree(global_permissions, definition=MENU_DEFINITION):
    """根据全局权限集合构造前端菜单列表。"""
    perms = set(global_permissions)
    tree = []
    for item in definition:
        required = item["permission"]
        if required is not None and required not in perms:
            continue
        tree.append({
            "key": item["key"],
            "title": item["title"],
            "icon": item["icon"],
            "route": item["route"],
        })
    return tree
```

- [ ] **Step 5：创建 `accounts/services/login_service.py`**

```python
"""登录流程收尾服务（spec §5.2）。

Provider 换出 User 之后，complete_login 统一负责：
is_active 校验 → 签发 JWT → 更新 last_login → 收集全局权限与菜单 → 写审计日志。
"""
from django.contrib.auth.models import update_last_login
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.auth.exceptions import AccountDisabled
from apps.accounts.serializers import UserSerializer
from apps.accounts.services import menu_service, permission_service
from apps.audit.services import audit_service


def complete_login(user, request=None):
    """完成登录并返回登录响应数据 dict。

    停用账号会写一条 login_failed 审计并抛 AccountDisabled。
    返回 dict 含 access / refresh / user / global_permissions / menu_tree /
    must_change_password；refresh 由调用方（LoginView）写入 httpOnly Cookie，
    不进响应体。
    """
    if not user.is_active:
        audit_service.log_operation(
            actor=None,
            action="login_failed",
            request=request,
            summary="账号已停用",
            extra={"username": user.username, "reason": "disabled"},
        )
        raise AccountDisabled

    refresh = RefreshToken.for_user(user)
    update_last_login(None, user)

    global_permissions = sorted(permission_service.get_global_permissions(user))
    menu_tree = menu_service.build_menu_tree(global_permissions)

    audit_service.log_operation(
        actor=user, action="login_success", request=request, summary="登录成功"
    )

    return {
        "access": str(refresh.access_token),
        "refresh": str(refresh),
        "user": UserSerializer(user).data,
        "global_permissions": global_permissions,
        "menu_tree": menu_tree,
        "must_change_password": user.must_change_password,
    }
```

- [ ] **Step 6：运行测试确认通过**

Run（`backend/`）：`pytest apps/accounts/tests/test_login_service.py -v`
Expected：`5 passed`。

- [ ] **Step 7：提交**

```bash
git add backend/apps/accounts/serializers.py backend/apps/accounts/services/menu_service.py backend/apps/accounts/services/login_service.py backend/apps/accounts/tests/test_login_service.py
git commit -m "feat: 增加 UserSerializer、menu_service 与 login_service"
```

---

## Task 14：JWT 配置、自定义认证、Cookie 与登录端点

**Files:**
- Modify: `backend/config/settings/base.py`（追加 `SIMPLE_JWT` / `AUTH_COOKIE_SECURE`；改 `DEFAULT_AUTHENTICATION_CLASSES`）
- Modify: `backend/config/settings/prod.py`（追加 `AUTH_COOKIE_SECURE = True`）
- Create: `backend/apps/accounts/authentication.py`
- Create: `backend/apps/accounts/cookies.py`
- Modify: `backend/apps/accounts/serializers.py`（追加 `LoginSerializer`）
- Create: `backend/apps/accounts/views/__init__.py`
- Create: `backend/apps/accounts/views/auth_views.py`
- Create: `backend/apps/accounts/urls.py`
- Modify: `backend/config/urls.py`
- Test: `backend/apps/accounts/tests/test_auth_login.py`

实现 `POST /api/auth/login`（spec §5.2）。access token 进响应体，refresh token 只进 httpOnly Cookie（限定 path `/api/auth`），csrf_token 进非 httpOnly Cookie——前端读不到 refresh、只能读 csrf 用于双提交（spec §5.3、附录 A #7）。自定义 `JWTAuthentication` 把「过期」与「非法」令牌区分成两个 error code。

> Phase 1 `startapp` 生成了占位文件 `accounts/views.py`；本 Task 用 `views/` 包取代它。

- [ ] **Step 1：写登录端点的失败测试**

创建 `backend/apps/accounts/tests/test_auth_login.py`：

```python
"""登录端点测试（spec §5.2）。"""
import pytest

from apps.accounts.cookies import CSRF_COOKIE_NAME, REFRESH_COOKIE_NAME


@pytest.mark.django_db
def test_login_success_returns_access_and_sets_cookies(api_client, normal_user):
    resp = api_client.post(
        "/api/auth/login",
        {"username": "normal", "password": "Str0ng-Pass-1"},
        format="json",
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["access"]
    assert "refresh" not in body                       # refresh 不进响应体
    assert body["user"]["username"] == "normal"
    assert "global_permissions" in body
    assert "menu_tree" in body
    assert resp.cookies[REFRESH_COOKIE_NAME]["httponly"] is True
    assert resp.cookies[REFRESH_COOKIE_NAME]["path"] == "/api/auth"
    assert not resp.cookies[CSRF_COOKIE_NAME]["httponly"]  # csrf 非 httpOnly


@pytest.mark.django_db
def test_login_wrong_password_returns_401(api_client, normal_user):
    resp = api_client.post(
        "/api/auth/login",
        {"username": "normal", "password": "wrong"},
        format="json",
    )
    assert resp.status_code == 401
    assert resp.json()["code"] == "unauthenticated"


@pytest.mark.django_db
def test_login_locks_account_after_five_failures(api_client, normal_user):
    for _ in range(4):
        api_client.post(
            "/api/auth/login",
            {"username": "normal", "password": "wrong"},
            format="json",
        )
    resp = api_client.post(
        "/api/auth/login",
        {"username": "normal", "password": "wrong"},
        format="json",
    )
    assert resp.status_code == 423
    assert resp.json()["code"] == "account_locked"


@pytest.mark.django_db
def test_login_disabled_account_returns_403(api_client, normal_user):
    normal_user.is_active = False
    normal_user.save(update_fields=["is_active"])
    resp = api_client.post(
        "/api/auth/login",
        {"username": "normal", "password": "Str0ng-Pass-1"},
        format="json",
    )
    assert resp.status_code == 403
    assert resp.json()["code"] == "account_disabled"


@pytest.mark.django_db
def test_login_missing_field_returns_400(api_client):
    resp = api_client.post("/api/auth/login", {"username": "x"}, format="json")
    assert resp.status_code == 400
```

- [ ] **Step 2：运行测试确认失败**

Run（`backend/`）：`pytest apps/accounts/tests/test_auth_login.py -v`
Expected：FAIL，`ModuleNotFoundError: No module named 'apps.accounts.cookies'`。

- [ ] **Step 3：在 `base.py` 追加 JWT 配置**

在 `backend/config/settings/base.py` 顶部 import 区（与 `import environ` 同处）追加：

```python
from datetime import timedelta
```

在 `base.py` **文件末尾**追加：

```python
# ---- JWT（spec §5.5）----
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": False,  # last_login 由 login_service 显式更新
    "AUTH_HEADER_TYPES": ("Bearer",),
}

# 认证 Cookie 是否带 Secure 标记；生产环境在 prod.py 置 True
AUTH_COOKIE_SECURE = env.bool("AUTH_COOKIE_SECURE", default=False)
```

- [ ] **Step 4：在 `prod.py` 强制 Secure Cookie**

在 `backend/config/settings/prod.py` 文件末尾追加：

```python
# 生产环境认证 Cookie 必须带 Secure
AUTH_COOKIE_SECURE = True
```

- [ ] **Step 5：创建 `accounts/authentication.py`**

```python
"""自定义 JWT 认证（spec §5.5）。

在 simplejwt 的 JWTAuthentication 之上，把"令牌过期"与"令牌非法"
区分成两个稳定 error code（token_expired / token_invalid），
便于前端据此决定是否触发静默刷新。
"""
from rest_framework_simplejwt.authentication import (
    JWTAuthentication as BaseJWTAuthentication,
)
from rest_framework_simplejwt.exceptions import InvalidToken

from apps.common.exceptions import TokenExpired, TokenInvalid


class JWTAuthentication(BaseJWTAuthentication):
    """区分过期 / 非法令牌的 JWT 认证。"""

    def get_validated_token(self, raw_token):
        try:
            return super().get_validated_token(raw_token)
        except InvalidToken as exc:
            if self._looks_expired(exc):
                raise TokenExpired
            raise TokenInvalid

    @staticmethod
    def _looks_expired(exc):
        """simplejwt 对过期令牌给出的 message 含 'expired'。

        get_validated_token 失败时把每个 token class 的失败原因收进
        exc.detail['messages']；过期 access token 的 message 为
        'Token is expired'，据此与结构非法令牌区分。
        """
        detail = getattr(exc, "detail", None)
        messages = detail.get("messages", []) if isinstance(detail, dict) else []
        for item in messages:
            if "expired" in str(item.get("message", "")).lower():
                return True
        return False
```

- [ ] **Step 6：创建 `accounts/cookies.py`**

```python
"""认证 Cookie 读写与 CSRF 双提交校验（spec §5.3）。

refresh token 存 httpOnly Cookie，限定 path /api/auth，前端 JS 读不到；
csrf_token 存非 httpOnly Cookie（path /），供前端读出后回填请求头，
对 refresh / logout 这类带 Cookie 的状态变更端点做 double-submit 校验。
"""
import secrets

from django.conf import settings

REFRESH_COOKIE_NAME = "refresh_token"
CSRF_COOKIE_NAME = "csrf_token"
CSRF_HEADER_NAME = "X-CSRF-Token"
REFRESH_COOKIE_PATH = "/api/auth"
CSRF_COOKIE_PATH = "/"
COOKIE_MAX_AGE = 7 * 24 * 60 * 60  # 与 REFRESH_TOKEN_LIFETIME 一致


def _secure():
    return getattr(settings, "AUTH_COOKIE_SECURE", False)


def set_auth_cookies(response, refresh_token):
    """把 refresh token 与新签发的 csrf_token 写入响应 Cookie，返回 csrf_token。"""
    response.set_cookie(
        REFRESH_COOKIE_NAME,
        refresh_token,
        max_age=COOKIE_MAX_AGE,
        httponly=True,
        secure=_secure(),
        samesite="Lax",
        path=REFRESH_COOKIE_PATH,
    )
    csrf_token = secrets.token_urlsafe(32)
    response.set_cookie(
        CSRF_COOKIE_NAME,
        csrf_token,
        max_age=COOKIE_MAX_AGE,
        httponly=False,
        secure=_secure(),
        samesite="Lax",
        path=CSRF_COOKIE_PATH,
    )
    return csrf_token


def clear_auth_cookies(response):
    """登出时清除 refresh / csrf Cookie。"""
    response.delete_cookie(REFRESH_COOKIE_NAME, path=REFRESH_COOKIE_PATH)
    response.delete_cookie(CSRF_COOKIE_NAME, path=CSRF_COOKIE_PATH)


def check_csrf(request):
    """double-submit 校验：Cookie 中的 csrf_token 须与请求头一致。"""
    cookie_token = request.COOKIES.get(CSRF_COOKIE_NAME)
    header_token = request.headers.get(CSRF_HEADER_NAME)
    if not cookie_token or not header_token:
        return False
    return secrets.compare_digest(cookie_token, header_token)
```

- [ ] **Step 7：在 `serializers.py` 追加 `LoginSerializer`**

在 `backend/apps/accounts/serializers.py` 文件末尾追加：

```python
class LoginSerializer(serializers.Serializer):
    """登录请求体。"""

    username = serializers.CharField()
    password = serializers.CharField(
        write_only=True, style={"input_type": "password"}
    )
```

- [ ] **Step 8：创建 `views/` 包与 `LoginView`**

先删除 Phase 1 占位文件并建包：

```bash
rm -f backend/apps/accounts/views.py
```

创建 `backend/apps/accounts/views/__init__.py`：

```python
"""accounts 应用视图层。"""
```

创建 `backend/apps/accounts/views/auth_views.py`：

```python
"""认证相关视图（spec §5.2、§5.3）。"""
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.auth import exceptions as auth_exc
from apps.accounts.auth.registry import get_provider
from apps.accounts.cookies import set_auth_cookies
from apps.accounts.serializers import LoginSerializer
from apps.accounts.services import login_service, login_throttle
from apps.audit.services import audit_service
from apps.common.exceptions import (
    AccountDisabled,
    AccountLocked,
    AuthenticationFailed,
)
from apps.common.utils import get_client_ip


class LoginView(APIView):
    """POST /api/auth/login —— 用户名 + 密码登录。"""

    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        username = serializer.validated_data["username"]
        password = serializer.validated_data["password"]
        ip = get_client_ip(request)

        if login_throttle.is_locked(username, ip):
            raise AccountLocked

        try:
            provider = get_provider("password")
            user = provider.authenticate(
                {"username": username, "password": password}
            )
            result = login_service.complete_login(user, request)
        except auth_exc.AccountDisabled:
            raise AccountDisabled
        except auth_exc.InvalidCredentials:
            failures = login_throttle.record_failure(username, ip)
            audit_service.log_operation(
                actor=None,
                action="login_failed",
                request=request,
                summary="用户名或密码错误",
                extra={"username": username, "failures": failures},
            )
            if failures >= login_throttle.MAX_FAILURES:
                raise AccountLocked
            raise AuthenticationFailed

        login_throttle.reset(username, ip)
        response = Response(
            {
                "access": result["access"],
                "user": result["user"],
                "global_permissions": result["global_permissions"],
                "menu_tree": result["menu_tree"],
                "must_change_password": result["must_change_password"],
            }
        )
        set_auth_cookies(response, result["refresh"])
        return response
```

- [ ] **Step 9：创建 `accounts/urls.py`**

```python
"""accounts 应用 API 路由。"""
from django.urls import path

from apps.accounts.views.auth_views import LoginView

app_name = "accounts"

urlpatterns = [
    path("auth/login", LoginView.as_view(), name="login"),
]
```

- [ ] **Step 10：改写 `config/urls.py`**

完全替换 `backend/config/urls.py`：

```python
"""根 URLConf。"""
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("apps.accounts.urls")),
]
```

- [ ] **Step 11：在 `base.py` 启用 `JWTAuthentication`**

把 `backend/config/settings/base.py` 中 `REST_FRAMEWORK` 的
`"DEFAULT_AUTHENTICATION_CLASSES": [],`
替换为：

```python
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "apps.accounts.authentication.JWTAuthentication",
    ],
```

- [ ] **Step 12：运行测试确认通过**

Run（`backend/`）：`pytest apps/accounts/tests/test_auth_login.py -v && python manage.py check`
Expected：`5 passed`；`System check identified no issues`。

- [ ] **Step 13：提交**

```bash
git add backend/config/settings/base.py backend/config/settings/prod.py backend/config/urls.py backend/apps/accounts/authentication.py backend/apps/accounts/cookies.py backend/apps/accounts/serializers.py backend/apps/accounts/views backend/apps/accounts/urls.py backend/apps/accounts/tests/test_auth_login.py
git commit -m "feat: 增加 JWT 配置、自定义认证与登录端点"
```

---

## Task 15：刷新与登出端点

**Files:**
- Modify: `backend/apps/accounts/views/auth_views.py`（追加 `RefreshView` / `LogoutView`）
- Modify: `backend/apps/accounts/urls.py`
- Test: `backend/apps/accounts/tests/test_auth_refresh_logout.py`

`POST /api/auth/refresh` 从 httpOnly Cookie 读 refresh token，旋转出新 access + refresh（`ROTATE_REFRESH_TOKENS`，旧 refresh 进黑名单）。`POST /api/auth/logout` 把 refresh token 拉黑并清 Cookie。两者都先做 CSRF 双提交校验（spec §5.3）。

- [ ] **Step 1：写刷新 / 登出的失败测试**

创建 `backend/apps/accounts/tests/test_auth_refresh_logout.py`：

```python
"""刷新与登出端点测试（spec §5.3）。"""
import pytest

from apps.accounts.cookies import CSRF_COOKIE_NAME, REFRESH_COOKIE_NAME


def _login(api_client):
    return api_client.post(
        "/api/auth/login",
        {"username": "normal", "password": "Str0ng-Pass-1"},
        format="json",
    )


@pytest.mark.django_db
def test_refresh_rotates_tokens(api_client, normal_user):
    login = _login(api_client)
    csrf = login.cookies[CSRF_COOKIE_NAME].value
    old_refresh = login.cookies[REFRESH_COOKIE_NAME].value

    resp = api_client.post(
        "/api/auth/refresh", {}, format="json", HTTP_X_CSRF_TOKEN=csrf
    )
    assert resp.status_code == 200
    assert resp.json()["access"]
    assert resp.cookies[REFRESH_COOKIE_NAME].value != old_refresh


@pytest.mark.django_db
def test_refresh_without_csrf_header_rejected(api_client, normal_user):
    _login(api_client)
    resp = api_client.post("/api/auth/refresh", {}, format="json")
    assert resp.status_code == 401
    assert resp.json()["code"] == "token_invalid"


@pytest.mark.django_db
def test_logout_returns_204_and_clears_cookie(api_client, normal_user):
    login = _login(api_client)
    csrf = login.cookies[CSRF_COOKIE_NAME].value
    resp = api_client.post(
        "/api/auth/logout", {}, format="json", HTTP_X_CSRF_TOKEN=csrf
    )
    assert resp.status_code == 204
    assert resp.cookies[REFRESH_COOKIE_NAME]["max-age"] == 0


@pytest.mark.django_db
def test_logout_blacklists_refresh_token(api_client, normal_user):
    login = _login(api_client)
    csrf = login.cookies[CSRF_COOKIE_NAME].value
    old_refresh = login.cookies[REFRESH_COOKIE_NAME].value

    logout = api_client.post(
        "/api/auth/logout", {}, format="json", HTTP_X_CSRF_TOKEN=csrf
    )
    assert logout.status_code == 204

    # 用登出前的 refresh token 再刷新——应被黑名单拦截
    api_client.cookies[REFRESH_COOKIE_NAME] = old_refresh
    api_client.cookies[CSRF_COOKIE_NAME] = csrf
    resp = api_client.post(
        "/api/auth/refresh", {}, format="json", HTTP_X_CSRF_TOKEN=csrf
    )
    assert resp.status_code == 401
```

- [ ] **Step 2：运行测试确认失败**

Run（`backend/`）：`pytest apps/accounts/tests/test_auth_refresh_logout.py -v`
Expected：FAIL，`ImportError: cannot import name 'RefreshView'`。

- [ ] **Step 3：在 `auth_views.py` 追加 `RefreshView` / `LogoutView`**

在 `backend/apps/accounts/views/auth_views.py` 文件末尾追加（同时把所需 import 补到文件顶部已有 import 区）：

```python
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.cookies import (
    REFRESH_COOKIE_NAME,
    check_csrf,
    clear_auth_cookies,
)
from apps.common.exceptions import TokenInvalid


class RefreshView(APIView):
    """POST /api/auth/refresh —— 旋转刷新令牌。"""

    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        if not check_csrf(request):
            raise TokenInvalid(message="CSRF 校验失败")
        raw_refresh = request.COOKIES.get(REFRESH_COOKIE_NAME)
        if not raw_refresh:
            raise TokenInvalid(message="缺少 refresh token")

        serializer = TokenRefreshSerializer(data={"refresh": raw_refresh})
        try:
            serializer.is_valid(raise_exception=True)
        except (TokenError, InvalidToken):
            raise TokenInvalid

        data = serializer.validated_data
        response = Response({"access": data["access"]})
        set_auth_cookies(response, data["refresh"])
        return response


class LogoutView(APIView):
    """POST /api/auth/logout —— 拉黑 refresh token 并清 Cookie（幂等）。"""

    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        if not check_csrf(request):
            raise TokenInvalid(message="CSRF 校验失败")
        raw_refresh = request.COOKIES.get(REFRESH_COOKIE_NAME)
        if raw_refresh:
            try:
                RefreshToken(raw_refresh).blacklist()
            except TokenError:
                pass  # 已失效 / 已拉黑：登出仍按成功处理
        response = Response(status=204)
        clear_auth_cookies(response)
        return response
```

- [ ] **Step 4：更新 `accounts/urls.py`**

完全替换 `backend/apps/accounts/urls.py`：

```python
"""accounts 应用 API 路由。"""
from django.urls import path

from apps.accounts.views.auth_views import LoginView, LogoutView, RefreshView

app_name = "accounts"

urlpatterns = [
    path("auth/login", LoginView.as_view(), name="login"),
    path("auth/refresh", RefreshView.as_view(), name="refresh"),
    path("auth/logout", LogoutView.as_view(), name="logout"),
]
```

- [ ] **Step 5：运行测试确认通过**

Run（`backend/`）：`pytest apps/accounts/tests/test_auth_refresh_logout.py -v`
Expected：`4 passed`。

- [ ] **Step 6：提交**

```bash
git add backend/apps/accounts/views/auth_views.py backend/apps/accounts/urls.py backend/apps/accounts/tests/test_auth_refresh_logout.py
git commit -m "feat: 增加刷新与登出端点"
```

---

## Task 16：当前用户信息与修改密码端点

**Files:**
- Modify: `backend/apps/accounts/serializers.py`（追加 `ChangePasswordSerializer`）
- Modify: `backend/apps/accounts/views/auth_views.py`（追加 `MeView` / `ChangePasswordView`）
- Modify: `backend/apps/accounts/urls.py`
- Test: `backend/apps/accounts/tests/test_auth_me_change_password.py`

`GET /api/auth/me` 返回当前用户、全局权限与菜单树（前端刷新页面时重建会话）。`POST /api/auth/change-password` 改本人密码并清除 `must_change_password`。两者均标注 `must_change_password_exempt = True`——强制改密用户也要能查看自身信息、完成改密（spec §5.7、附录 A #8）。

- [ ] **Step 1：写 me / change-password 的失败测试**

创建 `backend/apps/accounts/tests/test_auth_me_change_password.py`：

```python
"""me 与 change-password 端点测试（spec §5.2、§5.7）。"""
import pytest


def _login(api_client, username, password="Str0ng-Pass-1"):
    resp = api_client.post(
        "/api/auth/login",
        {"username": username, "password": password},
        format="json",
    )
    return resp.json()["access"]


@pytest.mark.django_db
def test_me_returns_profile_and_permissions(api_client, bid_manager_user):
    token = _login(api_client, "manager")
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    resp = api_client.get("/api/auth/me")
    assert resp.status_code == 200
    body = resp.json()
    assert body["user"]["username"] == "manager"
    assert body["global_permissions"] == ["project.create"]
    assert any(node["key"] == "dashboard" for node in body["menu_tree"])


@pytest.mark.django_db
def test_me_requires_authentication(api_client):
    resp = api_client.get("/api/auth/me")
    assert resp.status_code == 401


@pytest.mark.django_db
def test_change_password_succeeds_and_clears_flag(api_client, normal_user):
    normal_user.must_change_password = True
    normal_user.save(update_fields=["must_change_password"])
    token = _login(api_client, "normal")
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    resp = api_client.post(
        "/api/auth/change-password",
        {"old_password": "Str0ng-Pass-1", "new_password": "Even-Str0nger-2"},
        format="json",
    )
    assert resp.status_code == 200
    normal_user.refresh_from_db()
    assert normal_user.must_change_password is False
    assert normal_user.check_password("Even-Str0nger-2")


@pytest.mark.django_db
def test_change_password_rejects_wrong_old_password(api_client, normal_user):
    token = _login(api_client, "normal")
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    resp = api_client.post(
        "/api/auth/change-password",
        {"old_password": "wrong-pass", "new_password": "Even-Str0nger-2"},
        format="json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_change_password_rejects_weak_new_password(api_client, normal_user):
    token = _login(api_client, "normal")
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    resp = api_client.post(
        "/api/auth/change-password",
        {"old_password": "Str0ng-Pass-1", "new_password": "123"},
        format="json",
    )
    assert resp.status_code == 400
```

- [ ] **Step 2：运行测试确认失败**

Run（`backend/`）：`pytest apps/accounts/tests/test_auth_me_change_password.py -v`
Expected：FAIL，me / change-password 路由不存在（404）。

- [ ] **Step 3：在 `serializers.py` 追加 `ChangePasswordSerializer`**

在 `backend/apps/accounts/serializers.py` 文件末尾追加：

```python
class ChangePasswordSerializer(serializers.Serializer):
    """修改密码请求体；校验需通过 context 传入当前 user。"""

    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)

    def validate_old_password(self, value):
        user = self.context["user"]
        if not user.check_password(value):
            raise serializers.ValidationError("原密码不正确")
        return value

    def validate_new_password(self, value):
        from django.contrib.auth.password_validation import validate_password

        validate_password(value, user=self.context.get("user"))
        return value
```

- [ ] **Step 4：在 `auth_views.py` 调整 import 并追加视图**

把 `backend/apps/accounts/views/auth_views.py` 顶部的

```python
from apps.accounts.serializers import LoginSerializer
```

改为：

```python
from apps.accounts.serializers import (
    ChangePasswordSerializer,
    LoginSerializer,
    UserSerializer,
)
```

把

```python
from apps.accounts.services import login_service, login_throttle
```

改为：

```python
from apps.accounts.services import (
    login_service,
    login_throttle,
    menu_service,
    permission_service,
)
```

在文件末尾追加：

```python
class MeView(APIView):
    """GET /api/auth/me —— 当前登录用户信息、全局权限与菜单。"""

    must_change_password_exempt = True

    def get(self, request):
        user = request.user
        global_permissions = sorted(
            permission_service.get_global_permissions(user)
        )
        return Response(
            {
                "user": UserSerializer(user).data,
                "global_permissions": global_permissions,
                "menu_tree": menu_service.build_menu_tree(global_permissions),
            }
        )


class ChangePasswordView(APIView):
    """POST /api/auth/change-password —— 修改本人密码。"""

    must_change_password_exempt = True

    def post(self, request):
        serializer = ChangePasswordSerializer(
            data=request.data, context={"user": request.user}
        )
        serializer.is_valid(raise_exception=True)
        user = request.user
        user.set_password(serializer.validated_data["new_password"])
        user.must_change_password = False
        user.save(update_fields=["password", "must_change_password"])
        audit_service.log_operation(
            actor=user,
            action="password_changed",
            request=request,
            summary="修改密码",
        )
        return Response({"detail": "密码已更新"})
```

- [ ] **Step 5：更新 `accounts/urls.py`**

完全替换 `backend/apps/accounts/urls.py`：

```python
"""accounts 应用 API 路由。"""
from django.urls import path

from apps.accounts.views.auth_views import (
    ChangePasswordView,
    LoginView,
    LogoutView,
    MeView,
    RefreshView,
)

app_name = "accounts"

urlpatterns = [
    path("auth/login", LoginView.as_view(), name="login"),
    path("auth/refresh", RefreshView.as_view(), name="refresh"),
    path("auth/logout", LogoutView.as_view(), name="logout"),
    path("auth/me", MeView.as_view(), name="me"),
    path("auth/change-password", ChangePasswordView.as_view(), name="change-password"),
]
```

- [ ] **Step 6：运行测试确认通过**

Run（`backend/`）：`pytest apps/accounts/tests/test_auth_me_change_password.py -v`
Expected：`5 passed`。

- [ ] **Step 7：提交**

```bash
git add backend/apps/accounts/serializers.py backend/apps/accounts/views/auth_views.py backend/apps/accounts/urls.py backend/apps/accounts/tests/test_auth_me_change_password.py
git commit -m "feat: 增加当前用户信息与修改密码端点"
```

---

## Task 17：`RequirePermission` DRF 权限类

**Files:**
- Create: `backend/apps/accounts/permissions.py`
- Test: `backend/apps/accounts/tests/test_require_permission.py`

`RequirePermission` 是 `permission_service` 的薄包装（spec §4.5、附录 A #9）：视图用类属性 `required_permission` / `required_scope` 声明所需权限，权限类负责解析目标 `project` 并调用 `permission_service.has_permission`。项目级权限解析不到 `project` 时**拒绝**（fail-closed，附录 A #10）。

- [ ] **Step 1：写 `RequirePermission` 的失败测试**

创建 `backend/apps/accounts/tests/test_require_permission.py`：

```python
"""RequirePermission 权限类测试（spec §4.5）。"""
import pytest
from rest_framework.response import Response
from rest_framework.test import APIRequestFactory, force_authenticate
from rest_framework.views import APIView

from apps.accounts.permissions import RequirePermission


class _GlobalView(APIView):
    permission_classes = [RequirePermission]
    required_permission = "user.manage"
    required_scope = "global"

    def get(self, request):
        return Response({"ok": True})


class _ProjectView(APIView):
    permission_classes = [RequirePermission]
    required_permission = "section.edit"
    required_scope = "project"

    def get(self, request, project_id=None):
        return Response({"ok": True})


def _authed_get(user):
    request = APIRequestFactory().get("/x")
    force_authenticate(request, user=user)
    return request


@pytest.mark.django_db
def test_allows_user_with_global_permission(admin_user):
    response = _GlobalView.as_view()(_authed_get(admin_user))
    assert response.status_code == 200


@pytest.mark.django_db
def test_denies_user_without_global_permission(normal_user):
    response = _GlobalView.as_view()(_authed_get(normal_user))
    assert response.status_code == 403
    assert response.data["code"] == "permission_denied"


@pytest.mark.django_db
def test_allows_project_member_via_url_kwarg(normal_user, project):
    from apps.projects.models import ProjectMember

    ProjectMember.objects.create(
        project=project, user=normal_user, project_role="editor"
    )
    response = _ProjectView.as_view()(
        _authed_get(normal_user), project_id=project.id
    )
    assert response.status_code == 200


@pytest.mark.django_db
def test_denies_when_project_unresolvable(normal_user):
    response = _ProjectView.as_view()(_authed_get(normal_user))
    assert response.status_code == 403
```

- [ ] **Step 2：运行测试确认失败**

Run（`backend/`）：`pytest apps/accounts/tests/test_require_permission.py -v`
Expected：FAIL，`ModuleNotFoundError: No module named 'apps.accounts.permissions'`。

- [ ] **Step 3：创建 `accounts/permissions.py`**

```python
"""DRF 权限类——permission_service 的薄包装（spec §4.5）。"""
from rest_framework.permissions import BasePermission

from apps.accounts.permissions_registry import PROJECT
from apps.accounts.services import permission_service
from apps.common.exceptions import PermissionDenied


class RequirePermission(BasePermission):
    """要求当前用户具备视图声明的权限码。

    视图通过类属性声明：
        required_permission = "user.manage"
        required_scope = "global"   # 或 "project"

    项目级权限按以下优先级解析目标 project：
        1) URL kwarg `project_id`
        2) 视图的 get_permission_project(request) 钩子
        3) 请求体 project / project_id 字段
    解析不到项目即拒绝（fail-closed）。
    """

    def has_permission(self, request, view):
        code = getattr(view, "required_permission", None)
        if not code:
            return True  # 视图未声明权限码 → 本权限类不拦截
        user = getattr(request, "user", None)
        if user is None or not user.is_authenticated:
            raise PermissionDenied(message="未认证")

        scope = getattr(view, "required_scope", None)
        project = None
        if scope == PROJECT:
            project = self._resolve_project(request, view)
            if project is None:
                raise PermissionDenied(message="无法确定目标项目")

        allowed = permission_service.has_permission(
            user, code, project=project, required_scope=scope
        )
        if not allowed:
            raise PermissionDenied
        return True

    def _resolve_project(self, request, view):
        from apps.projects.models import Project

        raw = view.kwargs.get("project_id")
        if raw is None and hasattr(view, "get_permission_project"):
            return view.get_permission_project(request)
        if raw is None:
            raw = request.data.get("project") or request.data.get("project_id")
        if raw is None:
            return None
        return Project.objects.filter(pk=raw).first()
```

- [ ] **Step 4：运行测试确认通过**

Run（`backend/`）：`pytest apps/accounts/tests/test_require_permission.py -v`
Expected：`4 passed`。

- [ ] **Step 5：提交**

```bash
git add backend/apps/accounts/permissions.py backend/apps/accounts/tests/test_require_permission.py
git commit -m "feat: 增加 RequirePermission DRF 权限类"
```

---

## Task 18：`MustChangePasswordPermission` 与全局接入

**Files:**
- Modify: `backend/apps/accounts/permissions.py`（追加 `MustChangePasswordPermission`）
- Modify: `backend/config/settings/base.py`（`DEFAULT_PERMISSION_CLASSES`）
- Test: `backend/apps/accounts/tests/test_must_change_password.py`

`must_change_password=True` 的用户除显式豁免（`must_change_password_exempt`）的视图外一律拦截，强制其先改密（spec §5.7）。把该权限类接入 `DEFAULT_PERMISSION_CLASSES`，对全站生效。

- [ ] **Step 1：写 `MustChangePasswordPermission` 的失败测试**

创建 `backend/apps/accounts/tests/test_must_change_password.py`：

```python
"""MustChangePasswordPermission 测试（spec §5.7）。"""
import pytest

from apps.accounts.permissions import MustChangePasswordPermission
from apps.common.exceptions import MustChangePassword


class _PlainView:
    pass


class _ExemptView:
    must_change_password_exempt = True


def _request(user):
    return type("R", (), {"user": user})()


@pytest.mark.django_db
def test_blocks_user_with_must_change_password(normal_user):
    normal_user.must_change_password = True
    perm = MustChangePasswordPermission()
    with pytest.raises(MustChangePassword):
        perm.has_permission(_request(normal_user), _PlainView())


@pytest.mark.django_db
def test_allows_exempt_view(normal_user):
    normal_user.must_change_password = True
    perm = MustChangePasswordPermission()
    assert perm.has_permission(_request(normal_user), _ExemptView()) is True


@pytest.mark.django_db
def test_allows_user_without_flag(normal_user):
    perm = MustChangePasswordPermission()
    assert perm.has_permission(_request(normal_user), _PlainView()) is True


@pytest.mark.django_db
def test_me_endpoint_still_reachable_when_flag_set(api_client, normal_user):
    """全局接入后，me 仍因豁免而可访问。"""
    normal_user.must_change_password = True
    normal_user.save(update_fields=["must_change_password"])
    login = api_client.post(
        "/api/auth/login",
        {"username": "normal", "password": "Str0ng-Pass-1"},
        format="json",
    )
    token = login.json()["access"]
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    assert api_client.get("/api/auth/me").status_code == 200
```

- [ ] **Step 2：运行测试确认失败**

Run（`backend/`）：`pytest apps/accounts/tests/test_must_change_password.py -v`
Expected：FAIL，`ImportError: cannot import name 'MustChangePasswordPermission'`。

- [ ] **Step 3：在 `permissions.py` 追加 `MustChangePasswordPermission`**

把 `backend/apps/accounts/permissions.py` 顶部的

```python
from apps.common.exceptions import PermissionDenied
```

改为：

```python
from apps.common.exceptions import MustChangePassword, PermissionDenied
```

在文件末尾追加：

```python
class MustChangePasswordPermission(BasePermission):
    """强制改密拦截（spec §5.7）。

    must_change_password=True 的用户，除标注 must_change_password_exempt
    的视图（me / change-password）外一律拦截。未认证用户放行，交由
    IsAuthenticated 处理。
    """

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        if user is None or not user.is_authenticated:
            return True
        if not getattr(user, "must_change_password", False):
            return True
        if getattr(view, "must_change_password_exempt", False):
            return True
        raise MustChangePassword
```

- [ ] **Step 4：接入 `DEFAULT_PERMISSION_CLASSES`**

把 `backend/config/settings/base.py` 中 `REST_FRAMEWORK` 的

```python
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
```

替换为：

```python
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
        "apps.accounts.permissions.MustChangePasswordPermission",
    ],
```

- [ ] **Step 5：运行测试确认通过（含回归）**

Run（`backend/`）：`pytest apps/accounts/tests/test_must_change_password.py apps/accounts/tests/test_auth_me_change_password.py -v`
Expected：全部通过——`must_change_password` 用户仍能访问 me 与 change-password。

- [ ] **Step 6：提交**

```bash
git add backend/apps/accounts/permissions.py backend/config/settings/base.py backend/apps/accounts/tests/test_must_change_password.py
git commit -m "feat: 增加 MustChangePasswordPermission 并全局接入"
```

---

## Task 19：管理员重置用户密码端点

**Files:**
- Create: `backend/apps/accounts/views/user_views.py`
- Modify: `backend/apps/accounts/urls.py`
- Test: `backend/apps/accounts/tests/test_reset_password.py`

`POST /api/users/<user_id>/reset-password` 由具备全局 `user.manage` 权限的管理员调用，给目标用户生成临时密码并置 `must_change_password=True`（spec §5.7）。这是 `RequirePermission` 在真实端点上的首次接入。

- [ ] **Step 1：写重置密码端点的失败测试**

创建 `backend/apps/accounts/tests/test_reset_password.py`：

```python
"""管理员重置密码端点测试（spec §5.7）。"""
import pytest


def _login(api_client, username):
    resp = api_client.post(
        "/api/auth/login",
        {"username": username, "password": "Str0ng-Pass-1"},
        format="json",
    )
    return resp.json()["access"]


@pytest.mark.django_db
def test_admin_can_reset_user_password(api_client, admin_user, normal_user):
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(api_client, 'sysadmin')}")
    resp = api_client.post(
        f"/api/users/{normal_user.id}/reset-password", {}, format="json"
    )
    assert resp.status_code == 200
    temp_password = resp.json()["temporary_password"]
    normal_user.refresh_from_db()
    assert normal_user.must_change_password is True
    assert normal_user.check_password(temp_password)


@pytest.mark.django_db
def test_non_admin_cannot_reset_password(api_client, bid_manager_user, normal_user):
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(api_client, 'manager')}")
    resp = api_client.post(
        f"/api/users/{normal_user.id}/reset-password", {}, format="json"
    )
    assert resp.status_code == 403
    assert resp.json()["code"] == "permission_denied"


@pytest.mark.django_db
def test_reset_password_unknown_user_returns_404(api_client, admin_user):
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(api_client, 'sysadmin')}")
    resp = api_client.post("/api/users/999999/reset-password", {}, format="json")
    assert resp.status_code == 404


@pytest.mark.django_db
def test_reset_password_requires_authentication(api_client, normal_user):
    resp = api_client.post(
        f"/api/users/{normal_user.id}/reset-password", {}, format="json"
    )
    assert resp.status_code == 401
```

- [ ] **Step 2：运行测试确认失败**

Run（`backend/`）：`pytest apps/accounts/tests/test_reset_password.py -v`
Expected：FAIL，reset-password 路由不存在（404）。

- [ ] **Step 3：创建 `accounts/views/user_views.py`**

```python
"""用户管理视图（spec §5.7）。"""
import secrets

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.accounts.permissions import MustChangePasswordPermission, RequirePermission
from apps.accounts.permissions_registry import GLOBAL
from apps.audit.services import audit_service
from apps.common.exceptions import NotFound


class ResetPasswordView(APIView):
    """POST /api/users/<user_id>/reset-password —— 管理员重置用户密码。"""

    permission_classes = [
        IsAuthenticated,
        MustChangePasswordPermission,
        RequirePermission,
    ]
    required_permission = "user.manage"
    required_scope = GLOBAL

    def post(self, request, user_id):
        try:
            target = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            raise NotFound(message="用户不存在")
        temp_password = secrets.token_urlsafe(9)
        target.set_password(temp_password)
        target.must_change_password = True
        target.save(update_fields=["password", "must_change_password"])
        audit_service.log_operation(
            actor=request.user,
            action="password_reset",
            request=request,
            target_type="user",
            target_id=target.pk,
            summary=f"重置用户 {target.username} 的密码",
        )
        return Response({"temporary_password": temp_password})
```

- [ ] **Step 4：更新 `accounts/urls.py`**

完全替换 `backend/apps/accounts/urls.py`：

```python
"""accounts 应用 API 路由。"""
from django.urls import path

from apps.accounts.views.auth_views import (
    ChangePasswordView,
    LoginView,
    LogoutView,
    MeView,
    RefreshView,
)
from apps.accounts.views.user_views import ResetPasswordView

app_name = "accounts"

urlpatterns = [
    path("auth/login", LoginView.as_view(), name="login"),
    path("auth/refresh", RefreshView.as_view(), name="refresh"),
    path("auth/logout", LogoutView.as_view(), name="logout"),
    path("auth/me", MeView.as_view(), name="me"),
    path("auth/change-password", ChangePasswordView.as_view(), name="change-password"),
    path(
        "users/<int:user_id>/reset-password",
        ResetPasswordView.as_view(),
        name="reset-password",
    ),
]
```

- [ ] **Step 5：运行测试确认通过**

Run（`backend/`）：`pytest apps/accounts/tests/test_reset_password.py -v`
Expected：`4 passed`。

- [ ] **Step 6：提交**

```bash
git add backend/apps/accounts/views/user_views.py backend/apps/accounts/urls.py backend/apps/accounts/tests/test_reset_password.py
git commit -m "feat: 增加管理员重置用户密码端点"
```

---

## Task 20：项目个人权限查询端点

**Files:**
- Modify: `backend/apps/projects/views.py`
- Create: `backend/apps/projects/urls.py`
- Modify: `backend/config/urls.py`
- Test: `backend/apps/projects/tests/test_my_permissions.py`

`GET /api/projects/<project_id>/my-permissions` 返回当前用户在该项目内的权限码集合，前端据此控制项目页内按钮可见性（spec §4.5）。本端点仅需登录（不需特定权限码），但仍受 `MustChangePasswordPermission` 约束——借此首次在真实端点上验证强制改密拦截。

- [ ] **Step 1：写个人权限端点的失败测试**

创建 `backend/apps/projects/tests/test_my_permissions.py`：

```python
"""项目个人权限查询端点测试（spec §4.5、§5.7）。"""
import pytest


def _login(api_client, username):
    resp = api_client.post(
        "/api/auth/login",
        {"username": username, "password": "Str0ng-Pass-1"},
        format="json",
    )
    return resp.json()["access"]


@pytest.mark.django_db
def test_member_sees_role_permissions(api_client, normal_user, project):
    from apps.projects.models import ProjectMember

    ProjectMember.objects.create(
        project=project, user=normal_user, project_role="viewer"
    )
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(api_client, 'normal')}")
    resp = api_client.get(f"/api/projects/{project.id}/my-permissions")
    assert resp.status_code == 200
    perms = resp.json()["permissions"]
    assert "section.view" in perms       # viewer 含查看类权限
    assert "section.edit" not in perms   # viewer 不含编辑类权限


@pytest.mark.django_db
def test_non_member_gets_empty_permissions(api_client, normal_user, project):
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(api_client, 'normal')}")
    resp = api_client.get(f"/api/projects/{project.id}/my-permissions")
    assert resp.status_code == 200
    assert resp.json()["permissions"] == []


@pytest.mark.django_db
def test_unknown_project_returns_404(api_client, normal_user):
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(api_client, 'normal')}")
    resp = api_client.get("/api/projects/999999/my-permissions")
    assert resp.status_code == 404


@pytest.mark.django_db
def test_blocked_when_must_change_password(api_client, normal_user, project):
    normal_user.must_change_password = True
    normal_user.save(update_fields=["must_change_password"])
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(api_client, 'normal')}")
    resp = api_client.get(f"/api/projects/{project.id}/my-permissions")
    assert resp.status_code == 403
    assert resp.json()["code"] == "must_change_password"
```

- [ ] **Step 2：运行测试确认失败**

Run（`backend/`）：`pytest apps/projects/tests/test_my_permissions.py -v`
Expected：FAIL，my-permissions 路由不存在（404）。

- [ ] **Step 3：填充 `projects/views.py`**

完全替换 `backend/apps/projects/views.py`：

```python
"""projects 应用视图。"""
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import MustChangePasswordPermission
from apps.accounts.services import permission_service
from apps.common.exceptions import NotFound
from apps.projects.models import Project


class MyProjectPermissionsView(APIView):
    """GET /api/projects/<project_id>/my-permissions —— 当前用户在该项目的权限集合。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission]

    def get(self, request, project_id):
        try:
            project = Project.objects.get(pk=project_id)
        except Project.DoesNotExist:
            raise NotFound(message="项目不存在")
        permissions = sorted(
            permission_service.get_project_permissions(request.user, project)
        )
        return Response({"project_id": project.id, "permissions": permissions})
```

- [ ] **Step 4：创建 `projects/urls.py`**

```python
"""projects 应用 API 路由。"""
from django.urls import path

from apps.projects.views import MyProjectPermissionsView

app_name = "projects"

urlpatterns = [
    path(
        "projects/<int:project_id>/my-permissions",
        MyProjectPermissionsView.as_view(),
        name="my-permissions",
    ),
]
```

- [ ] **Step 5：在 `config/urls.py` 挂载 projects 路由**

完全替换 `backend/config/urls.py`：

```python
"""根 URLConf。"""
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("apps.accounts.urls")),
    path("api/", include("apps.projects.urls")),
]
```

- [ ] **Step 6：运行测试确认通过**

Run（`backend/`）：`pytest apps/projects/tests/test_my_permissions.py -v`
Expected：`4 passed`。

- [ ] **Step 7：提交**

```bash
git add backend/apps/projects/views.py backend/apps/projects/urls.py backend/config/urls.py backend/apps/projects/tests/test_my_permissions.py
git commit -m "feat: 增加项目个人权限查询端点"
```

---

## Task 21：角色权限 scope 校验与 Django Admin

**Files:**
- Create: `backend/apps/accounts/services/role_service.py`
- Create: `backend/apps/accounts/admin.py`（替换 startapp 占位内容）
- Test: `backend/apps/accounts/tests/test_role_management.py`

附录 A #11：角色只能绑定 `scope=global` 的权限——项目级权限由项目成员角色静态映射，不进角色表；`system_admin` 的「全部权限」由 `permission_service` 直通，不允许显式绑定。`role_service` 与 `RoleAdminForm` 共用同一条校验逻辑（DRY）。

- [ ] **Step 1：写角色服务与 Admin 校验的失败测试**

创建 `backend/apps/accounts/tests/test_role_management.py`：

```python
"""角色权限 scope 校验测试（spec §4.2.3、附录 A #11）。"""
import pytest

from apps.accounts.models import Permission, Role
from apps.accounts.services import role_service
from apps.common.exceptions import ValidationError


@pytest.mark.django_db
def test_set_role_permissions_accepts_global():
    role = Role.objects.get(code="bid_manager")
    perms = list(Permission.objects.filter(code="audit.view"))
    role_service.set_role_permissions(role, perms)
    assert set(role.permissions.values_list("code", flat=True)) == {"audit.view"}


@pytest.mark.django_db
def test_set_role_permissions_rejects_project_scope():
    role = Role.objects.get(code="bid_manager")
    perms = list(Permission.objects.filter(code="section.edit"))
    with pytest.raises(ValidationError):
        role_service.set_role_permissions(role, perms)


@pytest.mark.django_db
def test_set_role_permissions_rejects_system_admin():
    role = Role.objects.get(code="system_admin")
    with pytest.raises(ValidationError):
        role_service.set_role_permissions(role, [])


@pytest.mark.django_db
def test_role_admin_form_rejects_project_permission():
    from apps.accounts.admin import RoleAdminForm

    role = Role.objects.get(code="bid_manager")
    section_edit = Permission.objects.get(code="section.edit")
    form = RoleAdminForm(
        data={
            "code": role.code,
            "name": role.name,
            "description": "",
            "is_system": role.is_system,
            "permissions": [section_edit.pk],
        },
        instance=role,
    )
    assert not form.is_valid()
    assert "permissions" in form.errors
```

- [ ] **Step 2：运行测试确认失败**

Run（`backend/`）：`pytest apps/accounts/tests/test_role_management.py -v`
Expected：FAIL，`ImportError: cannot import name 'role_service'`。

- [ ] **Step 3：创建 `accounts/services/role_service.py`**

```python
"""角色权限维护服务（spec §4.2.3、附录 A #11）。"""
from apps.accounts.permissions_registry import PROJECT
from apps.accounts.services.permission_service import SYSTEM_ADMIN_ROLE_CODE
from apps.common.exceptions import ValidationError


def assert_global_only(permissions):
    """校验 permissions 全部为 global scope；含项目级权限即抛 ValidationError。"""
    project_scoped = [p for p in permissions if p.scope == PROJECT]
    if project_scoped:
        codes = "、".join(p.code for p in project_scoped)
        raise ValidationError(message=f"角色不能绑定项目级权限：{codes}")


def set_role_permissions(role, permissions):
    """设置角色的全局权限集合。

    system_admin 的"全部权限"由 permission_service 直通，不允许显式绑定。
    permissions 须全部为 global scope。
    """
    if role.code == SYSTEM_ADMIN_ROLE_CODE:
        raise ValidationError(message="system_admin 的权限由系统直通，不可手动设置")
    permissions = list(permissions)
    assert_global_only(permissions)
    role.permissions.set(permissions)
    return role
```

- [ ] **Step 4：创建 `accounts/admin.py`**

完全替换 `backend/apps/accounts/admin.py`（startapp 占位内容）：

```python
"""accounts 应用 Django Admin 注册（spec §4.2.3）。"""
from django import forms
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from apps.accounts.models import Permission, Role, User
from apps.accounts.services import role_service
from apps.accounts.services.permission_service import SYSTEM_ADMIN_ROLE_CODE
from apps.common.exceptions import ValidationError as APIValidationError


class RoleAdminForm(forms.ModelForm):
    """角色表单：复用 role_service 的 scope 校验。"""

    class Meta:
        model = Role
        fields = ["code", "name", "description", "is_system", "permissions"]

    def clean_permissions(self):
        permissions = self.cleaned_data.get("permissions")
        if permissions:
            try:
                role_service.assert_global_only(permissions)
            except APIValidationError as exc:
                raise forms.ValidationError(exc.message)
        return permissions


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    form = RoleAdminForm
    list_display = ("code", "name", "is_system")
    search_fields = ("code", "name")
    filter_horizontal = ("permissions",)

    def get_readonly_fields(self, request, obj=None):
        if obj and obj.is_system:
            fields = ["code", "is_system"]
            if obj.code == SYSTEM_ADMIN_ROLE_CODE:
                fields.append("permissions")  # system_admin 权限不可编辑
            return fields
        return []

    def has_delete_permission(self, request, obj=None):
        if obj and obj.is_system:
            return False  # 内置角色不可删除
        return super().has_delete_permission(request, obj)


@admin.register(Permission)
class PermissionAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "module", "scope", "is_active")
    list_filter = ("scope", "module", "is_active")
    search_fields = ("code", "name")

    def has_add_permission(self, request):
        return False  # 权限点由注册表 + 迁移管理

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    list_display = (
        "username", "real_name", "department", "is_active", "must_change_password",
    )
    search_fields = ("username", "real_name", "email")
    filter_horizontal = ("roles", "groups", "user_permissions")
    fieldsets = DjangoUserAdmin.fieldsets + (
        ("业务信息", {
            "fields": ("real_name", "phone", "department", "must_change_password", "roles"),
        }),
    )
    add_fieldsets = DjangoUserAdmin.add_fieldsets + (
        ("业务信息", {"fields": ("real_name", "phone", "department")}),
    )
```

- [ ] **Step 5：运行测试与系统检查**

Run（`backend/`）：`pytest apps/accounts/tests/test_role_management.py -v && python manage.py check`
Expected：`4 passed`；`System check identified no issues`。

- [ ] **Step 6：提交**

```bash
git add backend/apps/accounts/services/role_service.py backend/apps/accounts/admin.py backend/apps/accounts/tests/test_role_management.py
git commit -m "feat: 增加角色 scope 校验与 Django Admin 注册"
```

---

## Task 22：JWT 黑名单清理 Celery 任务与 Phase 2 全量校验

**Files:**
- Create: `backend/apps/accounts/tasks.py`
- Modify: `backend/config/celery.py:441-442`（`beat_schedule` 骨架）
- Test: `backend/apps/accounts/tests/test_tasks.py`

simplejwt 开启 `ROTATE_REFRESH_TOKENS` + `BLACKLIST_AFTER_ROTATION` 后，`token_blacklist_outstandingtoken` / `token_blacklist_blacklistedtoken` 两张表会持续增长。simplejwt 自带 `flushexpiredtokens` 管理命令清理已过期记录；本 Task 用 Celery Beat 每日凌晨调度它（spec §4.5「刷新令牌轮换 + 黑名单」的运维收尾）。

- [ ] **Step 1：写失败测试 `backend/apps/accounts/tests/test_tasks.py`**

```python
"""accounts 应用 Celery 任务测试。"""
import pytest

from apps.accounts.tasks import flush_expired_tokens


@pytest.mark.django_db
def test_flush_expired_tokens_runs_without_error():
    """无过期 token 时任务同步执行应正常返回 None，不抛异常。"""
    result = flush_expired_tokens()
    assert result is None


def test_flush_expired_tokens_registered_in_beat_schedule():
    """Celery Beat 调度应包含每日清理条目，且指向本任务。"""
    from config.celery import app

    schedule = app.conf.beat_schedule
    assert "flush-expired-jwt-tokens" in schedule
    assert schedule["flush-expired-jwt-tokens"]["task"] == (
        "apps.accounts.tasks.flush_expired_tokens"
    )
```

- [ ] **Step 2：运行测试确认失败**

Run（`backend/`）：`pytest apps/accounts/tests/test_tasks.py -v`
Expected：FAIL，`ModuleNotFoundError: No module named 'apps.accounts.tasks'`。

- [ ] **Step 3：创建 `backend/apps/accounts/tasks.py`**

```python
"""accounts 应用的 Celery 任务（spec §4.5）。

被 config.celery 的 autodiscover_tasks() 自动发现；任务名前缀 apps.accounts.*
不在 config/celery.py 的 task_routes 中，落入默认队列即可（清理任务无需独立队列）。
"""
from celery import shared_task
from django.core.management import call_command


@shared_task
def flush_expired_tokens():
    """清理 simplejwt 已过期的 outstanding / blacklisted token 记录。

    复用 rest_framework_simplejwt.token_blacklist 自带的 flushexpiredtokens
    管理命令，避免重复实现过期判定逻辑。
    """
    call_command("flushexpiredtokens")
```

- [ ] **Step 4：修改 `backend/config/celery.py` 注册 Beat 条目**

将 `backend/config/celery.py` 第 441-442 行的 `beat_schedule` 骨架：

```python
# Beat 调度骨架；具体条目由 Phase 2（flushexpiredtokens）/ Phase 3（cleanup_stale_uploads）追加
app.conf.beat_schedule = {}
```

替换为：

```python
# Beat 调度；每日 03:30 清理过期 JWT 黑名单记录，Phase 3 在此追加 cleanup_stale_uploads
app.conf.beat_schedule = {
    "flush-expired-jwt-tokens": {
        "task": "apps.accounts.tasks.flush_expired_tokens",
        "schedule": crontab(hour=3, minute=30),
    },
}
```

并在文件顶部 `from celery import Celery` 之后补一行 import：

```python
from celery import Celery
from celery.schedules import crontab
```

- [ ] **Step 5：运行测试确认通过**

Run（`backend/`）：`pytest apps/accounts/tests/test_tasks.py -v`
Expected：`2 passed`。

- [ ] **Step 6：校验无遗漏迁移**

Run（`backend/`）：`python manage.py makemigrations --check --dry-run`
Expected：`No changes detected`。Phase 2 只新增数据迁移 `0005_seed_permissions` / `0006_seed_roles`，未改任何模型字段，故不应有待生成迁移。

- [ ] **Step 7：运行 Phase 2 全量测试**

Run（`backend/`）：`pytest -q`
Expected：全部用例 `passed`，无 `failed` / `error`。Phase 2 的 Task 1-22 累计新增约 103 个用例，连同 Phase 1 的 12 个，全量约 115 个用例全绿。（若个别任务的测试数量在实现中略有增减，以「无 failed / error」为准——这才是真正的通过判据。）

- [ ] **Step 8：Django 系统检查**

Run（`backend/`）：`python manage.py check`
Expected：`System check identified no issues (0 silenced).`

- [ ] **Step 9：提交**

```bash
git add backend/apps/accounts/tasks.py backend/apps/accounts/tests/test_tasks.py backend/config/celery.py
git commit -m "feat: 增加 JWT 黑名单清理 Celery Beat 任务"
```

---

## 完成标准（Phase 2 Definition of Done）

- `python manage.py makemigrations --check --dry-run` 报 `No changes detected`。
- `pytest -q` 全量绿（无 `failed` / `error`）。
- `python manage.py check` 无问题。
- 权限点种子迁移 `0005_seed_permissions` 与角色种子迁移 `0006_seed_roles` 已落库；`sync_permissions` 管理命令幂等（重复执行不产生重复权限点）。
- `permission_service.has_permission` 是唯一鉴权判定入口；`RequirePermission` / `MustChangePasswordPermission` 仅为薄包装，未在视图内散写鉴权逻辑。
- 认证端点全部可用：`POST /api/auth/login`、`POST /api/auth/refresh`、`POST /api/auth/logout`、`GET /api/auth/me`、`POST /api/auth/change-password`、`POST /api/users/<id>/reset-password`、`GET /api/projects/<id>/my-permissions`。
- access token 走登录响应体（前端存内存）；refresh token 走 httpOnly Cookie（path `/api/auth`）；`refresh` / `logout` 用 `csrf_token` 双提交 Cookie 校验。
- 权限缓存两级（请求级 contextvar + Redis，TTL 180s）生效，角色/成员变更信号触发失效。
- Celery Beat 含 `flush-expired-jwt-tokens` 每日条目。
- 覆盖 spec §4.1、§4.4、§4.5、§5、§9 步骤 8-11、附录 A。

---

## 给执行者的提示

- 本阶段产出鉴权与 API 层；**不涉及 MinIO 上传与前端**——那是 Phase 3。
- **永远不要绕过 `permission_service`** 在视图里手写鉴权 if 判断；新增受控端点一律挂 `RequirePermission` 并声明 `required_permission` / `required_scope`。
- 新增业务模块的权限点时：往 `permissions_registry.PERMISSION_REGISTRY` 追加条目，再跑 `python manage.py sync_permissions`——不要手改数据库。
- access token 仅存前端内存；refresh token 是 httpOnly Cookie，前端 JS **绝不可**读写它。
- 测试用真实 PostgreSQL（见 spec §6），缓存用 LocMemCache；**不要 mock 数据库**。
- 数据迁移文件名以 `makemigrations` 实际生成为准；`0005` / `0006` 序号仅供参考，紧跟 Phase 1 的 `0004`。
- 每个 Task 结束都应有一次干净的 `git commit`；不要把多个 Task 攒成一个提交。
- TDD 顺序严格执行：先写失败测试 → 跑测试看它确实失败（且失败原因符合预期）→ 写最小实现 → 跑测试看它通过 → 提交。



