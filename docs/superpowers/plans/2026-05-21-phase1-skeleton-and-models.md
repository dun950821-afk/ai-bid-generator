# Phase 1：项目骨架与数据模型 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建 Django + DRF 项目骨架、14 个单一职责应用、分层 settings、Docker Compose 基础设施，并落地 `accounts` / `projects` / `audit` / `common` 全部 v1 数据模型，迁移在真实 PostgreSQL 上跑通。

**Architecture:** 单体 Django 项目，14 个应用置于 `backend/apps/` 下；settings 按 `base` / `dev` / `prod` 分层；自定义 `User` 模型；Docker Compose 提供 `postgres+pgvector`、`redis`、`minio`。本阶段只建模型与迁移，**鉴权逻辑与 API 端点留待 Phase 2，上传与前端留待 Phase 3**。

**Tech Stack:** Django 5.2、Django REST Framework、PostgreSQL 16 + pgvector、Redis、MinIO、Celery 5、pytest-django、Docker Compose。

**对应 spec：** `docs/superpowers/specs/2026-05-21-architecture-auth-design.md` §2、§3、§4.2、§4.3、§8、§9 步骤 1-7。

**关键约定（贯穿三个阶段，勿改）：**
- 所有命令默认工作目录为 `backend/`，除非显式标注 `frontend/` 或仓库根。
- Python 虚拟环境 `backend/.venv`，每个含 Python 命令的步骤前假定已 `source .venv/bin/activate`。
- 应用以 `apps.<name>` 形式注册进 `INSTALLED_APPS`，模型 `app_label` 取末段（如 `accounts`）。
- 测试用真实 PostgreSQL（见 spec §6），不 mock 数据库。

---

## 文件结构

| 文件 | 职责 |
| --- | --- |
| `backend/manage.py` | Django 管理入口 |
| `backend/requirements.txt` | Python 依赖锁定 |
| `backend/Dockerfile` | `web` / `worker` / `beat` 镜像构建 |
| `backend/pytest.ini` | pytest-django 配置 |
| `backend/config/settings/base.py` | 共享配置 |
| `backend/config/settings/dev.py` | 开发环境配置 |
| `backend/config/settings/prod.py` | 生产环境配置 |
| `backend/config/urls.py` | 根 URLConf |
| `backend/config/celery.py` | Celery 应用、5 队列路由、Beat 调度骨架 |
| `backend/apps/common/models.py` | `TimeStampedModel` 抽象基类、`AsyncTask` |
| `backend/apps/accounts/models.py` | `User` / `Permission` / `Role` / `AuthIdentity` |
| `backend/apps/projects/models.py` | `Project` / `Lot` / `ProjectMember` |
| `backend/apps/audit/models.py` | `OperationLog` |
| `backend/apps/<其余 9 个>/` | v1 空骨架（预留） |
| `docker-compose.yml` | 仓库根；Phase 1 含 6 个服务（`nginx` 留待 Phase 3） |
| `.env.example` | 环境变量样例 |

---

## Task 1：初始化 Django 项目骨架

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/manage.py`、`backend/config/{__init__,settings,urls,wsgi,asgi}.py`（由 `django-admin` 生成）

- [ ] **Step 1：创建 `backend/requirements.txt`**

```
Django==5.2.1
djangorestframework==3.16.0
djangorestframework-simplejwt==5.4.0
django-environ==0.12.0
psycopg[binary]==3.2.4
celery==5.4.0
redis==5.2.1
argon2-cffi==23.1.0
minio==7.2.12
gunicorn==23.0.0
uvicorn==0.34.0
pytest==8.3.4
pytest-django==4.9.0
```

- [ ] **Step 2：建目录、虚拟环境并安装依赖**

在仓库根执行：

```bash
mkdir -p backend
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Expected：pip 安装全部依赖无报错。

- [ ] **Step 3：生成 Django 项目**

在 `backend/` 下执行（注意末尾的 `.`，让 `manage.py` 落在 `backend/` 根）：

```bash
django-admin startproject config .
```

Expected：生成 `backend/manage.py` 与 `backend/config/`。

- [ ] **Step 4：验证项目可启动**

Run（`backend/`）：`python manage.py check`
Expected：`System check identified no issues (0 silenced).`

- [ ] **Step 5：提交**

```bash
git add backend/requirements.txt backend/manage.py backend/config
git commit -m "chore: 初始化 Django 项目骨架"
```

---

## Task 2：分层 settings（base / dev / prod）

**Files:**
- Delete: `backend/config/settings.py`
- Create: `backend/config/settings/__init__.py`、`base.py`、`dev.py`、`prod.py`
- Modify: `backend/manage.py`、`backend/config/wsgi.py`、`backend/config/asgi.py`（`DJANGO_SETTINGS_MODULE` 指向 `config.settings.dev`）

- [ ] **Step 1：把 `settings.py` 改造为 settings 包**

```bash
rm backend/config/settings.py
mkdir backend/config/settings
touch backend/config/settings/__init__.py
```

- [ ] **Step 2：写 `backend/config/settings/base.py`**

```python
"""所有环境共享的基础配置。"""
from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent.parent

env = environ.Env()
_env_file = BASE_DIR / ".env"
if _env_file.exists():
    env.read_env(str(_env_file))

SECRET_KEY = env("DJANGO_SECRET_KEY", default="dev-insecure-change-me")
DEBUG = False
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=[])

DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]
THIRD_PARTY_APPS = [
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
]
# LOCAL_APPS 由 Task 6 在创建 app 骨架后追加
LOCAL_APPS: list[str] = []
INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

DATABASES = {
    "default": env.db("DATABASE_URL", default="postgres://bid:bid@localhost:5432/bid"),
}

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": env("REDIS_URL", default="redis://localhost:6379/1"),
    },
}

# 密码哈希：Argon2 首选（spec §5.8.1）
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2SHA1PasswordHasher",
    "django.contrib.auth.hashers.BCryptSHA256PasswordHasher",
]

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# REST_FRAMEWORK 的认证/权限/异常处理由 Phase 2 填充
REST_FRAMEWORK: dict = {}

# Celery（broker/queues 细节见 config/celery.py）
CELERY_BROKER_URL = env("CELERY_BROKER_URL", default="redis://localhost:6379/0")
CELERY_RESULT_BACKEND = env("CELERY_RESULT_BACKEND", default="redis://localhost:6379/0")

LANGUAGE_CODE = "zh-hans"
TIME_ZONE = "Asia/Shanghai"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
```

- [ ] **Step 3：写 `backend/config/settings/dev.py`**

```python
"""开发环境配置。"""
from .base import *  # noqa: F401,F403

DEBUG = True
ALLOWED_HOSTS = ["localhost", "127.0.0.1", "0.0.0.0"]
```

- [ ] **Step 4：写 `backend/config/settings/prod.py`**

```python
"""生产环境配置。"""
from .base import *  # noqa: F401,F403

DEBUG = False
SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
```

- [ ] **Step 5：把 `DJANGO_SETTINGS_MODULE` 默认值改为 `config.settings.dev`**

在 `backend/manage.py`、`backend/config/wsgi.py`、`backend/config/asgi.py` 三处，把
`os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")`
改为
`os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")`。

- [ ] **Step 6：验证**

Run（`backend/`）：`python manage.py check`
Expected：`System check identified no issues (0 silenced).`

- [ ] **Step 7：提交**

```bash
git add backend/config backend/manage.py
git commit -m "chore: settings 按 base/dev/prod 分层"
```

---

## Task 3：Docker Compose 开发基础设施

**Files:**
- Create: `docker-compose.yml`（仓库根）
- Create: `backend/Dockerfile`
- Create: `.env.example`（仓库根）
- Create: `backend/.dockerignore`

Phase 1 含 6 个服务：`postgres`、`redis`、`minio`、`web`、`worker`、`beat`。`nginx`（第 7 个）依赖前端构建产物，留待 Phase 3 加入。

- [ ] **Step 1：写 `backend/Dockerfile`**

```dockerfile
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000"]
```

- [ ] **Step 2：写 `backend/.dockerignore`**

```
.venv
__pycache__
*.pyc
staticfiles
.pytest_cache
```

- [ ] **Step 3：写 `.env.example`**

```
DJANGO_SECRET_KEY=dev-insecure-change-me
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
DATABASE_URL=postgres://bid:bid@postgres:5432/bid
REDIS_URL=redis://redis:6379/1
CELERY_BROKER_URL=redis://redis:6379/0
CELERY_RESULT_BACKEND=redis://redis:6379/0
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=bid-files
MINIO_SECURE=false
```

- [ ] **Step 4：写 `docker-compose.yml`**

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: bid
      POSTGRES_PASSWORD: bid
      POSTGRES_DB: bid
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - miniodata:/data

  web:
    build: ./backend
    command: gunicorn config.wsgi:application --bind 0.0.0.0:8000
    env_file: .env
    depends_on:
      - postgres
      - redis
      - minio
    ports:
      - "8000:8000"

  worker:
    build: ./backend
    command: celery -A config worker -l info -Q parse_queue,kb_queue,ai_queue,export_queue,notify_queue
    env_file: .env
    depends_on:
      - postgres
      - redis

  beat:
    build: ./backend
    command: celery -A config beat -l info
    env_file: .env
    depends_on:
      - redis

volumes:
  pgdata:
  miniodata:
```

- [ ] **Step 5：启动数据服务并验证连通性**

```bash
cp .env.example .env
docker compose up -d postgres redis minio
docker compose ps
```

Expected：`postgres`、`redis`、`minio` 三个服务状态 `running`。

- [ ] **Step 6：提交**

```bash
git add docker-compose.yml backend/Dockerfile backend/.dockerignore .env.example
git commit -m "chore: Docker Compose 开发基础设施（postgres/redis/minio/web/worker/beat）"
```

---

## Task 4：Celery 应用与队列路由

**Files:**
- Create: `backend/config/celery.py`
- Modify: `backend/config/__init__.py`

- [ ] **Step 1：写 `backend/config/celery.py`**

```python
"""Celery 应用：5 个命名队列 + task_routes（spec §3.6.2）。"""
import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")

app = Celery("bid")
app.config_from_object("django.conf:settings", namespace="CELERY")

# 任务到队列的映射；后续按 task 名前缀路由，拆 worker 时无需改业务代码
app.conf.task_routes = {
    "apps.tender.*": {"queue": "parse_queue"},
    "apps.knowledge.*": {"queue": "kb_queue"},
    "apps.generation.*": {"queue": "ai_queue"},
    "apps.exporting.*": {"queue": "export_queue"},
    "apps.notifications.*": {"queue": "notify_queue"},
}

# Beat 调度骨架；具体条目由 Phase 2（flushexpiredtokens）/ Phase 3（cleanup_stale_uploads）追加
app.conf.beat_schedule = {}

app.autodiscover_tasks()
```

- [ ] **Step 2：写 `backend/config/__init__.py`**

```python
from .celery import app as celery_app

__all__ = ("celery_app",)
```

- [ ] **Step 3：验证 Celery 应用可导入且队列路由生效**

Run（`backend/`）：

```bash
python -c "from config.celery import app; print(sorted(app.conf.task_routes.keys()))"
```

Expected：输出 5 条路由键：
`['apps.exporting.*', 'apps.generation.*', 'apps.knowledge.*', 'apps.notifications.*', 'apps.tender.*']`

- [ ] **Step 4：提交**

```bash
git add backend/config/celery.py backend/config/__init__.py
git commit -m "chore: 配置 Celery 应用与 5 队列路由"
```

---

## Task 5：pytest-django 测试基础设施

**Files:**
- Create: `backend/pytest.ini`
- Create: `backend/conftest.py`
- Create: `backend/tests/__init__.py`、`backend/tests/test_smoke.py`

- [ ] **Step 1：写 `backend/pytest.ini`**

```ini
[pytest]
DJANGO_SETTINGS_MODULE = config.settings.dev
python_files = tests.py test_*.py *_tests.py
addopts = -ra
```

- [ ] **Step 2：写 `backend/conftest.py`**

```python
"""pytest 全局 fixture 占位；Phase 2 会在此追加 user/role 等 fixture。"""
```

- [ ] **Step 3：写冒烟测试 `backend/tests/test_smoke.py`**

```python
def test_settings_module_loads():
    from django.conf import settings

    assert settings.TIME_ZONE == "Asia/Shanghai"
```

并创建空文件 `backend/tests/__init__.py`。

- [ ] **Step 4：运行测试验证**

Run（`backend/`）：`pytest tests/test_smoke.py -v`
Expected：`1 passed`。

- [ ] **Step 5：提交**

```bash
git add backend/pytest.ini backend/conftest.py backend/tests
git commit -m "chore: 接入 pytest-django 测试基础设施"
```

---

## Task 6：创建 14 个 Django 应用骨架

**Files:**
- Create: `backend/apps/__init__.py`
- Create: `backend/apps/<14 个应用>/`（由 `startapp` 生成）
- Modify: 各应用 `apps.py` 的 `name`
- Modify: `backend/config/settings/base.py` 的 `LOCAL_APPS`

14 个应用（spec §3.3）：`common`、`accounts`、`projects`、`tender`、`requirements`、`scoring`、`enterprise`、`knowledge`、`outline`、`generation`、`quotation`、`exporting`、`audit`、`notifications`。

- [ ] **Step 1：批量创建应用骨架**

Run（`backend/`）：

```bash
mkdir -p apps
touch apps/__init__.py
for app in common accounts projects tender requirements scoring enterprise knowledge outline generation quotation exporting audit notifications; do
  mkdir -p "apps/$app"
  python manage.py startapp "$app" "apps/$app"
done
```

- [ ] **Step 2：修正每个应用的 `apps.py` 中 `name`**

`startapp` 生成的 `apps/<app>/apps.py` 里 `name = "<app>"` 不带 `apps.` 前缀，逐个改为 `name = "apps.<app>"`。例如 `apps/accounts/apps.py`：

```python
from django.apps import AppConfig


class AccountsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.accounts"
```

其余 13 个同理（类名保持 `startapp` 生成的形式，仅改 `name`）。

- [ ] **Step 3：在 `base.py` 注册 `LOCAL_APPS`**

把 `backend/config/settings/base.py` 中的
`LOCAL_APPS: list[str] = []`
替换为：

```python
LOCAL_APPS = [
    "apps.common",
    "apps.accounts",
    "apps.projects",
    "apps.tender",
    "apps.requirements",
    "apps.scoring",
    "apps.enterprise",
    "apps.knowledge",
    "apps.outline",
    "apps.generation",
    "apps.quotation",
    "apps.exporting",
    "apps.audit",
    "apps.notifications",
]
```

- [ ] **Step 4：验证**

Run（`backend/`）：`python manage.py check`
Expected：`System check identified no issues (0 silenced).`

- [ ] **Step 5：提交**

```bash
git add backend/apps backend/config/settings/base.py
git commit -m "chore: 创建 14 个 Django 应用骨架并注册"
```

---

## Task 7：`common.TimeStampedModel` 抽象基类

**Files:**
- Modify: `backend/apps/common/models.py`

`TimeStampedModel` 是抽象基类，被后续所有业务模型继承。它本身不建表，其字段行为由继承它的具体模型的测试覆盖（见 Task 8 起）。

- [ ] **Step 1：写 `backend/apps/common/models.py`**

```python
from django.db import models


class TimeStampedModel(models.Model):
    """提供 created_at / updated_at 时间戳的抽象基类（spec §3.5）。"""

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True
```

- [ ] **Step 2：验证抽象基类不产生迁移**

Run（`backend/`）：`python manage.py makemigrations common --dry-run`
Expected：`No changes detected in app 'common'`（抽象模型不建表，符合预期）。

- [ ] **Step 3：提交**

```bash
git add backend/apps/common/models.py
git commit -m "feat: common 增加 TimeStampedModel 抽象基类"
```

---

## Task 8：`accounts.User` 自定义用户模型

**Files:**
- Modify: `backend/apps/accounts/models.py`
- Modify: `backend/config/settings/base.py`（追加 `AUTH_USER_MODEL`）
- Create: `backend/apps/accounts/tests/__init__.py`、`backend/apps/accounts/tests/test_models.py`
- Create: `backend/apps/accounts/migrations/0001_initial.py`（由 `makemigrations` 生成）

> **顺序关键**：本仓库此前从未对自有应用执行 `makemigrations`，因此现在设置 `AUTH_USER_MODEL` 不会触发 “Cannot change AUTH_USER_MODEL” 错误。本 Task 必须在任何 `migrate` 之前完成。

- [ ] **Step 1：写失败测试 `backend/apps/accounts/tests/test_models.py`**

```python
import pytest
from django.contrib.auth import get_user_model

User = get_user_model()


@pytest.mark.django_db
def test_create_user_has_custom_fields():
    user = User.objects.create_user(
        username="alice",
        password="Str0ng-Pass-1",
        real_name="爱丽丝",
        phone="13800000000",
        department="投标部",
    )
    assert user.real_name == "爱丽丝"
    assert user.phone == "13800000000"
    assert user.department == "投标部"
    assert user.must_change_password is False
    assert user.is_active is True
    assert user.created_at is not None
    assert user.updated_at is not None


@pytest.mark.django_db
def test_must_change_password_can_be_set():
    user = User.objects.create_user(username="bob", password="Str0ng-Pass-1")
    user.must_change_password = True
    user.save(update_fields=["must_change_password"])
    user.refresh_from_db()
    assert user.must_change_password is True
```

并创建空文件 `backend/apps/accounts/tests/__init__.py`。

- [ ] **Step 2：运行测试确认失败**

Run（`backend/`）：`pytest apps/accounts/tests/test_models.py -v`
Expected：FAIL，错误形如 `TypeError: ... unexpected keyword argument 'real_name'`（`User` 尚无自定义字段）。

- [ ] **Step 3：写 `backend/apps/accounts/models.py`**

```python
from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """自定义用户模型（spec §4.2.1）。

    is_staff / is_superuser 仅用于 Django Admin，与业务 RBAC 无关。
    """

    real_name = models.CharField("真实姓名", max_length=64, blank=True)
    phone = models.CharField("手机号", max_length=32, blank=True)
    department = models.CharField("部门", max_length=128, blank=True)
    must_change_password = models.BooleanField("强制改密", default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "accounts_user"

    def __str__(self):
        return self.username
```

- [ ] **Step 4：追加 `AUTH_USER_MODEL` 到 `base.py`**

在 `backend/config/settings/base.py` 的 `DEFAULT_AUTO_FIELD` 之后追加一行：

```python
AUTH_USER_MODEL = "accounts.User"
```

- [ ] **Step 5：生成并应用迁移**

Run（`backend/`）：

```bash
python manage.py makemigrations accounts
python manage.py migrate
```

Expected：生成 `accounts/migrations/0001_initial.py`；`migrate` 应用全部内置 + accounts 迁移无报错。

- [ ] **Step 6：运行测试确认通过**

Run（`backend/`）：`pytest apps/accounts/tests/test_models.py -v`
Expected：`2 passed`。

- [ ] **Step 7：提交**

```bash
git add backend/apps/accounts backend/config/settings/base.py
git commit -m "feat: accounts 增加自定义 User 模型"
```

---

## Task 9：`accounts.Permission` 权限点模型

**Files:**
- Modify: `backend/apps/accounts/models.py`
- Modify: `backend/apps/accounts/tests/test_models.py`
- Create: `backend/apps/accounts/migrations/0002_*.py`

- [ ] **Step 1：追加失败测试到 `test_models.py`**

```python
from django.db import IntegrityError

from apps.accounts.models import Permission


@pytest.mark.django_db
def test_permission_code_is_unique():
    Permission.objects.create(
        code="tender.upload", name="上传招标文件", module="tender", scope="project"
    )
    with pytest.raises(IntegrityError):
        Permission.objects.create(
            code="tender.upload", name="重复码", module="tender", scope="project"
        )


@pytest.mark.django_db
def test_permission_defaults_active():
    perm = Permission.objects.create(
        code="project.create", name="创建项目", module="projects", scope="global"
    )
    assert perm.is_active is True
    assert perm.scope == "global"
```

- [ ] **Step 2：运行测试确认失败**

Run（`backend/`）：`pytest apps/accounts/tests/test_models.py -k permission -v`
Expected：FAIL，`ImportError: cannot import name 'Permission'`。

- [ ] **Step 3：在 `accounts/models.py` 追加 `Permission`**

在文件顶部 import 处加入 `from apps.common.models import TimeStampedModel`，并在 `User` 之后追加：

```python
class Permission(TimeStampedModel):
    """权限点（spec §4.2.2）；命名规范 模块.动作。"""

    SCOPE_GLOBAL = "global"
    SCOPE_PROJECT = "project"
    SCOPE_CHOICES = [
        (SCOPE_GLOBAL, "全局"),
        (SCOPE_PROJECT, "项目"),
    ]

    code = models.CharField("权限码", max_length=128, unique=True)
    name = models.CharField("显示名", max_length=128)
    module = models.CharField("所属模块", max_length=64)
    scope = models.CharField("作用域", max_length=16, choices=SCOPE_CHOICES)
    description = models.TextField("描述", blank=True)
    is_active = models.BooleanField("是否启用", default=True)

    class Meta:
        db_table = "accounts_permission"
        ordering = ["module", "code"]

    def __str__(self):
        return self.code
```

- [ ] **Step 4：生成并应用迁移**

Run（`backend/`）：`python manage.py makemigrations accounts && python manage.py migrate`
Expected：生成 `0002_permission.py`，应用无报错。

- [ ] **Step 5：运行测试确认通过**

Run（`backend/`）：`pytest apps/accounts/tests/test_models.py -k permission -v`
Expected：`2 passed`。

- [ ] **Step 6：提交**

```bash
git add backend/apps/accounts
git commit -m "feat: accounts 增加 Permission 权限点模型"
```

---

## Task 10：`accounts.Role` 角色模型与 `User.roles` M2M

**Files:**
- Modify: `backend/apps/accounts/models.py`
- Modify: `backend/apps/accounts/tests/test_models.py`
- Create: `backend/apps/accounts/migrations/0003_*.py`

- [ ] **Step 1：追加失败测试到 `test_models.py`**

```python
from apps.accounts.models import Role


@pytest.mark.django_db
def test_role_code_is_unique():
    Role.objects.create(code="bid_manager", name="投标经理")
    with pytest.raises(IntegrityError):
        Role.objects.create(code="bid_manager", name="重复码")


@pytest.mark.django_db
def test_role_permissions_m2m_and_user_roles():
    role = Role.objects.create(code="normal_user", name="普通用户", is_system=True)
    perm = Permission.objects.create(
        code="project.view", name="查看项目", module="projects", scope="global"
    )
    role.permissions.add(perm)
    user = User.objects.create_user(username="carol", password="Str0ng-Pass-1")
    user.roles.add(role)
    assert list(user.roles.all()) == [role]
    assert list(role.permissions.all()) == [perm]
```

- [ ] **Step 2：运行测试确认失败**

Run（`backend/`）：`pytest apps/accounts/tests/test_models.py -k role -v`
Expected：FAIL，`ImportError: cannot import name 'Role'`。

- [ ] **Step 3：在 `accounts/models.py` 追加 `Role` 并给 `User` 加 `roles`**

在 `User` 类体内（`must_change_password` 之后）追加一行 M2M 字段：

```python
    roles = models.ManyToManyField(
        "accounts.Role", related_name="users", blank=True, verbose_name="角色"
    )
```

在 `Permission` 之后追加 `Role`：

```python
class Role(TimeStampedModel):
    """全局角色（spec §4.2.3）；permissions 只允许绑定 scope=global 的 Permission，
    该约束由 Phase 2 的 RoleService / RoleSerializer 在业务层强制。"""

    code = models.CharField("角色码", max_length=64, unique=True)
    name = models.CharField("显示名", max_length=128)
    description = models.TextField("描述", blank=True)
    is_system = models.BooleanField("内置角色", default=False)
    permissions = models.ManyToManyField(
        Permission, related_name="roles", blank=True, verbose_name="权限"
    )

    class Meta:
        db_table = "accounts_role"
        ordering = ["code"]

    def __str__(self):
        return self.code
```

- [ ] **Step 4：生成并应用迁移**

Run（`backend/`）：`python manage.py makemigrations accounts && python manage.py migrate`
Expected：生成 `0003_role_user_roles.py`（含 `Role` 与 `User.roles`），应用无报错。

- [ ] **Step 5：运行测试确认通过**

Run（`backend/`）：`pytest apps/accounts/tests/test_models.py -k role -v`
Expected：`2 passed`。

- [ ] **Step 6：提交**

```bash
git add backend/apps/accounts
git commit -m "feat: accounts 增加 Role 模型与 User.roles 多对多关系"
```

---

## Task 11：`accounts.AuthIdentity` 模型（SSO 预留）

**Files:**
- Modify: `backend/apps/accounts/models.py`
- Modify: `backend/apps/accounts/tests/test_models.py`
- Create: `backend/apps/accounts/migrations/0004_*.py`

- [ ] **Step 1：追加失败测试到 `test_models.py`**

```python
from apps.accounts.models import AuthIdentity


@pytest.mark.django_db
def test_authidentity_unique_provider_external_id():
    user1 = User.objects.create_user(username="dave", password="Str0ng-Pass-1")
    user2 = User.objects.create_user(username="erin", password="Str0ng-Pass-1")
    AuthIdentity.objects.create(user=user1, provider="ldap", external_id="ext-1")
    with pytest.raises(IntegrityError):
        AuthIdentity.objects.create(user=user2, provider="ldap", external_id="ext-1")
```

- [ ] **Step 2：运行测试确认失败**

Run（`backend/`）：`pytest apps/accounts/tests/test_models.py -k authidentity -v`
Expected：FAIL，`ImportError: cannot import name 'AuthIdentity'`。

- [ ] **Step 3：在 `accounts/models.py` 追加 `AuthIdentity`**

```python
class AuthIdentity(TimeStampedModel):
    """外部身份绑定（spec §4.2.5）；v1 账号密码登录不写本表，保持空表。"""

    PROVIDER_CHOICES = [
        ("password", "账号密码"),
        ("dingtalk", "钉钉"),
        ("ldap", "LDAP"),
        ("wecom", "企业微信"),
        ("oauth2", "OAuth2"),
    ]

    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="auth_identities"
    )
    provider = models.CharField("认证源", max_length=32, choices=PROVIDER_CHOICES)
    external_id = models.CharField("外部身份标识", max_length=255)
    extra = models.JSONField("附加信息", default=dict, blank=True)
    last_login_at = models.DateTimeField("最近登录", null=True, blank=True)

    class Meta:
        db_table = "accounts_auth_identity"
        constraints = [
            models.UniqueConstraint(
                fields=["provider", "external_id"],
                name="uniq_authidentity_provider_external",
            )
        ]

    def __str__(self):
        return f"{self.provider}:{self.external_id}"
```

- [ ] **Step 4：生成并应用迁移**

Run（`backend/`）：`python manage.py makemigrations accounts && python manage.py migrate`
Expected：生成 `0004_authidentity.py`，应用无报错。

- [ ] **Step 5：运行测试确认通过**

Run（`backend/`）：`pytest apps/accounts/tests/test_models.py -k authidentity -v`
Expected：`1 passed`。

- [ ] **Step 6：提交**

```bash
git add backend/apps/accounts
git commit -m "feat: accounts 增加 AuthIdentity 模型（SSO 预留）"
```

---

## Task 12：`projects.Project` 模型

**Files:**
- Modify: `backend/apps/projects/models.py`
- Create: `backend/apps/projects/tests/__init__.py`、`backend/apps/projects/tests/test_models.py`
- Create: `backend/apps/projects/migrations/0001_initial.py`

- [ ] **Step 1：写失败测试 `backend/apps/projects/tests/test_models.py`**

```python
import pytest
from django.contrib.auth import get_user_model

from apps.projects.models import Project

User = get_user_model()


@pytest.mark.django_db
def test_create_project():
    creator = User.objects.create_user(username="pm", password="Str0ng-Pass-1")
    project = Project.objects.create(name="某高速公路标书", created_by=creator)
    assert project.name == "某高速公路标书"
    assert project.status == "active"
    assert project.created_by == creator
    assert project.created_at is not None
```

并创建空文件 `backend/apps/projects/tests/__init__.py`。

- [ ] **Step 2：运行测试确认失败**

Run（`backend/`）：`pytest apps/projects/tests/test_models.py -v`
Expected：FAIL，`ImportError: cannot import name 'Project'`。

- [ ] **Step 3：写 `backend/apps/projects/models.py`**

```python
from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel


class Project(TimeStampedModel):
    """项目（spec §4.3.1）；v1 最小桩，完整项目管理在 projects 后续 spec 扩展。"""

    STATUS_CHOICES = [
        ("active", "进行中"),
        ("archived", "已归档"),
        ("closed", "已关闭"),
    ]

    name = models.CharField("项目名", max_length=255)
    status = models.CharField(
        "状态", max_length=32, choices=STATUS_CHOICES, default="active"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_projects",
        verbose_name="创建人",
    )

    class Meta:
        db_table = "projects_project"
        ordering = ["-created_at"]

    def __str__(self):
        return self.name
```

- [ ] **Step 4：生成并应用迁移**

Run（`backend/`）：`python manage.py makemigrations projects && python manage.py migrate`
Expected：生成 `projects/migrations/0001_initial.py`，应用无报错。

- [ ] **Step 5：运行测试确认通过**

Run（`backend/`）：`pytest apps/projects/tests/test_models.py -v`
Expected：`1 passed`。

- [ ] **Step 6：提交**

```bash
git add backend/apps/projects
git commit -m "feat: projects 增加 Project 模型"
```

---

## Task 13：`projects.Lot` 标段模型

**Files:**
- Modify: `backend/apps/projects/models.py`
- Modify: `backend/apps/projects/tests/test_models.py`
- Create: `backend/apps/projects/migrations/0002_*.py`

- [ ] **Step 1：追加失败测试到 `test_models.py`**

```python
from apps.projects.models import Lot


@pytest.mark.django_db
def test_create_lot_belongs_to_project():
    creator = User.objects.create_user(username="pm2", password="Str0ng-Pass-1")
    project = Project.objects.create(name="某机房采购", created_by=creator)
    lot = Lot.objects.create(project=project, name="一标段", code="LOT-1")
    assert lot.project == project
    assert lot.code == "LOT-1"
    assert lot.status == "active"
    assert list(project.lots.all()) == [lot]
```

- [ ] **Step 2：运行测试确认失败**

Run（`backend/`）：`pytest apps/projects/tests/test_models.py -k lot -v`
Expected：FAIL，`ImportError: cannot import name 'Lot'`。

- [ ] **Step 3：在 `projects/models.py` 追加 `Lot`**

```python
class Lot(TimeStampedModel):
    """标段（spec §4.3.2）；v1 最小桩，支撑上传接口的 lot_id 维度与 object_key 路径段。
    两层权限仍在项目级，不下沉到标段级。"""

    STATUS_CHOICES = [
        ("active", "进行中"),
        ("archived", "已归档"),
    ]

    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="lots", verbose_name="项目"
    )
    name = models.CharField("标段名称", max_length=255)
    code = models.CharField("标段编号", max_length=64, blank=True)
    status = models.CharField(
        "状态", max_length=32, choices=STATUS_CHOICES, default="active"
    )

    class Meta:
        db_table = "projects_lot"
        ordering = ["id"]
        indexes = [models.Index(fields=["project"])]

    def __str__(self):
        return f"{self.project.name} / {self.name}"
```

- [ ] **Step 4：生成并应用迁移**

Run（`backend/`）：`python manage.py makemigrations projects && python manage.py migrate`
Expected：生成 `0002_lot.py`，应用无报错。

- [ ] **Step 5：运行测试确认通过**

Run（`backend/`）：`pytest apps/projects/tests/test_models.py -k lot -v`
Expected：`1 passed`。

- [ ] **Step 6：提交**

```bash
git add backend/apps/projects
git commit -m "feat: projects 增加 Lot 标段模型"
```

---

## Task 14：`projects.ProjectMember` 项目成员模型

**Files:**
- Modify: `backend/apps/projects/models.py`
- Modify: `backend/apps/projects/tests/test_models.py`
- Create: `backend/apps/projects/migrations/0003_*.py`

- [ ] **Step 1：追加失败测试到 `test_models.py`**

```python
from django.db import IntegrityError

from apps.projects.models import ProjectMember


@pytest.mark.django_db
def test_project_member_unique_project_user():
    creator = User.objects.create_user(username="pm3", password="Str0ng-Pass-1")
    member_user = User.objects.create_user(username="member1", password="Str0ng-Pass-1")
    project = Project.objects.create(name="某弱电工程", created_by=creator)
    ProjectMember.objects.create(
        project=project, user=member_user, project_role="editor", added_by=creator
    )
    with pytest.raises(IntegrityError):
        ProjectMember.objects.create(
            project=project, user=member_user, project_role="viewer", added_by=creator
        )
```

- [ ] **Step 2：运行测试确认失败**

Run（`backend/`）：`pytest apps/projects/tests/test_models.py -k member -v`
Expected：FAIL，`ImportError: cannot import name 'ProjectMember'`。

- [ ] **Step 3：在 `projects/models.py` 追加 `ProjectMember`**

```python
class ProjectMember(TimeStampedModel):
    """项目成员（spec §4.3.3）；一个用户在一个项目内只有一个角色。"""

    ROLE_OWNER = "owner"
    ROLE_EDITOR = "editor"
    ROLE_REVIEWER = "reviewer"
    ROLE_VIEWER = "viewer"
    ROLE_CHOICES = [
        (ROLE_OWNER, "负责人"),
        (ROLE_EDITOR, "编辑"),
        (ROLE_REVIEWER, "评审"),
        (ROLE_VIEWER, "只读"),
    ]

    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="members", verbose_name="项目"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="project_memberships",
        verbose_name="用户",
    )
    project_role = models.CharField("项目角色", max_length=16, choices=ROLE_CHOICES)
    added_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="added_members",
        verbose_name="添加人",
    )

    class Meta:
        db_table = "projects_project_member"
        constraints = [
            models.UniqueConstraint(
                fields=["project", "user"], name="uniq_projectmember_project_user"
            )
        ]
        indexes = [
            models.Index(fields=["project"]),
            models.Index(fields=["user"]),
        ]

    def __str__(self):
        return f"{self.project.name} / {self.user.username} ({self.project_role})"
```

- [ ] **Step 4：生成并应用迁移**

Run（`backend/`）：`python manage.py makemigrations projects && python manage.py migrate`
Expected：生成 `0003_projectmember.py`，应用无报错。

- [ ] **Step 5：运行测试确认通过**

Run（`backend/`）：`pytest apps/projects/tests/test_models.py -k member -v`
Expected：`1 passed`。

- [ ] **Step 6：提交**

```bash
git add backend/apps/projects
git commit -m "feat: projects 增加 ProjectMember 模型"
```

---

## Task 15：`audit.OperationLog` 操作日志模型

**Files:**
- Modify: `backend/apps/audit/models.py`
- Create: `backend/apps/audit/tests/__init__.py`、`backend/apps/audit/tests/test_models.py`
- Create: `backend/apps/audit/migrations/0001_initial.py`

`OperationLog` 只追加不更新，仅有 `created_at`，**不继承 `TimeStampedModel`**（spec §5.10）。

- [ ] **Step 1：写失败测试 `backend/apps/audit/tests/test_models.py`**

```python
import pytest
from django.contrib.auth import get_user_model

from apps.audit.models import OperationLog

User = get_user_model()


@pytest.mark.django_db
def test_operation_log_with_actor():
    user = User.objects.create_user(username="admin1", password="Str0ng-Pass-1")
    log = OperationLog.objects.create(
        actor=user, action="login_success", summary="登录成功"
    )
    assert log.actor == user
    assert log.created_at is not None


@pytest.mark.django_db
def test_operation_log_actor_nullable_for_failed_login():
    """登录失败无已认证用户，actor 留空，上下文写 extra（spec §5.10）。"""
    log = OperationLog.objects.create(
        actor=None,
        action="login_failed",
        summary="登录失败",
        extra={"username_attempted": "ghost", "reason": "invalid_password"},
    )
    assert log.actor is None
    assert log.extra["username_attempted"] == "ghost"
```

并创建空文件 `backend/apps/audit/tests/__init__.py`。

- [ ] **Step 2：运行测试确认失败**

Run（`backend/`）：`pytest apps/audit/tests/test_models.py -v`
Expected：FAIL，`ImportError: cannot import name 'OperationLog'`。

- [ ] **Step 3：写 `backend/apps/audit/models.py`**

```python
from django.conf import settings
from django.db import models


class OperationLog(models.Model):
    """操作 / 审计日志（spec §5.10）；append-only，仅有 created_at。

    actor 可为空：登录失败等无已认证用户的事件，actor 留 None，
    尝试的用户名与失败原因写入 extra，不得硬塞成某个 User。
    """

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="operation_logs",
        verbose_name="操作者",
    )
    action = models.CharField("动作类型", max_length=64)
    target_type = models.CharField("对象类型", max_length=64, blank=True)
    target_id = models.CharField("对象 ID", max_length=64, blank=True)
    summary = models.CharField("摘要", max_length=255, blank=True)
    extra = models.JSONField("附加上下文", default=dict, blank=True)
    ip = models.GenericIPAddressField("来源 IP", null=True, blank=True)
    user_agent = models.CharField("User-Agent", max_length=512, blank=True)
    created_at = models.DateTimeField("时间", auto_now_add=True)

    class Meta:
        db_table = "audit_operation_log"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["actor"]),
            models.Index(fields=["action"]),
            models.Index(fields=["created_at"]),
        ]

    def __str__(self):
        return f"{self.action} @ {self.created_at:%Y-%m-%d %H:%M}"
```

- [ ] **Step 4：生成并应用迁移**

Run（`backend/`）：`python manage.py makemigrations audit && python manage.py migrate`
Expected：生成 `audit/migrations/0001_initial.py`，应用无报错。

- [ ] **Step 5：运行测试确认通过**

Run（`backend/`）：`pytest apps/audit/tests/test_models.py -v`
Expected：`2 passed`。

- [ ] **Step 6：提交**

```bash
git add backend/apps/audit
git commit -m "feat: audit 增加 OperationLog 操作日志模型"
```

---

## Task 16：`common.AsyncTask` 统一异步任务模型

**Files:**
- Modify: `backend/apps/common/models.py`
- Create: `backend/apps/common/tests/__init__.py`、`backend/apps/common/tests/test_models.py`
- Create: `backend/apps/common/migrations/0001_initial.py`

- [ ] **Step 1：写失败测试 `backend/apps/common/tests/test_models.py`**

```python
import pytest
from django.contrib.auth import get_user_model

from apps.common.models import AsyncTask

User = get_user_model()


@pytest.mark.django_db
def test_create_async_task_defaults():
    user = User.objects.create_user(username="taskuser", password="Str0ng-Pass-1")
    task = AsyncTask.objects.create(task_type="tender_parse", created_by=user)
    assert task.status == "pending"
    assert task.progress == 0
    assert task.total_steps == 1
    assert task.input_payload == {}
    assert task.result_payload == {}
    assert task.created_at is not None


@pytest.mark.django_db
def test_async_task_status_choices_accept_terminal_states():
    task = AsyncTask.objects.create(task_type="export")
    for status in ["running", "success", "failed", "cancelled", "retrying"]:
        task.status = status
        task.save(update_fields=["status"])
        task.refresh_from_db()
        assert task.status == status
```

并创建空文件 `backend/apps/common/tests/__init__.py`。

- [ ] **Step 2：运行测试确认失败**

Run（`backend/`）：`pytest apps/common/tests/test_models.py -v`
Expected：FAIL，`ImportError: cannot import name 'AsyncTask'`。

- [ ] **Step 3：在 `common/models.py` 追加 `AsyncTask`**

在文件顶部加入 `from django.conf import settings`，并在 `TimeStampedModel` 之后追加：

```python
class AsyncTask(TimeStampedModel):
    """统一异步任务模型（spec §3.6.1）。

    关键约束：result_payload 只放对象引用、ID、统计摘要等轻量数据，
    生成的章节正文、解析全文等大体量内容写入各自业务表，不塞进本表。
    """

    STATUS_PENDING = "pending"
    STATUS_RUNNING = "running"
    STATUS_SUCCESS = "success"
    STATUS_FAILED = "failed"
    STATUS_CANCELLED = "cancelled"
    STATUS_RETRYING = "retrying"
    STATUS_CHOICES = [
        (STATUS_PENDING, "等待中"),
        (STATUS_RUNNING, "运行中"),
        (STATUS_SUCCESS, "成功"),
        (STATUS_FAILED, "失败"),
        (STATUS_CANCELLED, "已取消"),
        (STATUS_RETRYING, "重试中"),
    ]

    task_type = models.CharField("任务类型", max_length=64)
    celery_task_id = models.CharField("Celery 任务 ID", max_length=255, blank=True)
    status = models.CharField(
        "状态", max_length=16, choices=STATUS_CHOICES, default=STATUS_PENDING
    )
    progress = models.PositiveSmallIntegerField("进度百分比", default=0)
    current_step = models.CharField("当前步骤", max_length=255, blank=True)
    total_steps = models.PositiveSmallIntegerField("总步骤数", default=1)
    related_object_type = models.CharField("关联对象类型", max_length=64, blank=True)
    related_object_id = models.CharField("关联对象 ID", max_length=64, blank=True)
    input_payload = models.JSONField("输入参数", default=dict, blank=True)
    result_payload = models.JSONField("结果（仅引用/摘要）", default=dict, blank=True)
    error_message = models.TextField("失败原因", blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="async_tasks",
        verbose_name="发起人",
    )
    started_at = models.DateTimeField("开始时间", null=True, blank=True)
    finished_at = models.DateTimeField("结束时间", null=True, blank=True)

    class Meta:
        db_table = "common_async_task"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["celery_task_id"]),
            models.Index(fields=["status"]),
            models.Index(fields=["task_type"]),
            models.Index(fields=["created_by"]),
            models.Index(fields=["related_object_type", "related_object_id"]),
        ]

    def __str__(self):
        return f"{self.task_type}#{self.pk} ({self.status})"
```

- [ ] **Step 4：生成并应用迁移**

Run（`backend/`）：`python manage.py makemigrations common && python manage.py migrate`
Expected：生成 `common/migrations/0001_initial.py`，应用无报错。

- [ ] **Step 5：运行测试确认通过**

Run（`backend/`）：`pytest apps/common/tests/test_models.py -v`
Expected：`2 passed`。

- [ ] **Step 6：提交**

```bash
git add backend/apps/common
git commit -m "feat: common 增加 AsyncTask 统一异步任务模型"
```

---

## Task 17：全量迁移与测试校验

**Files:**
- 无新增；仅校验。

- [ ] **Step 1：校验无遗漏迁移**

Run（`backend/`）：`python manage.py makemigrations --check --dry-run`
Expected：`No changes detected`（所有模型变更都已生成迁移）。

- [ ] **Step 2：在全新数据库上重建并应用全部迁移**

Run（`backend/`）：

```bash
python manage.py migrate --run-syncdb
python -c "import django; django.setup(); from django.db import connection; print(sorted(connection.introspection.table_names()))"
```

Expected：表名列表包含 `accounts_user`、`accounts_permission`、`accounts_role`、`accounts_auth_identity`、`projects_project`、`projects_lot`、`projects_project_member`、`audit_operation_log`、`common_async_task` 以及 simplejwt 黑名单表 `token_blacklist_*`。

- [ ] **Step 3：运行全量测试**

Run（`backend/`）：`pytest -v`
Expected：全部通过（Task 5/8-16 累计 12 个测试用例 `passed`），无 `failed` / `error`。

- [ ] **Step 4：Django 系统检查**

Run（`backend/`）：`python manage.py check`
Expected：`System check identified no issues (0 silenced).`

- [ ] **Step 5：提交（如有改动）**

```bash
git add -A backend
git commit -m "chore: Phase 1 全量迁移与测试校验通过" || echo "无改动可提交"
```

---

## 完成标准（Phase 1 Definition of Done）

- `python manage.py makemigrations --check --dry-run` 报 `No changes detected`。
- `pytest -v` 全绿。
- `docker compose up -d postgres redis minio` 三服务可用。
- 9 张业务表 + simplejwt 黑名单表均已建。
- `accounts` / `projects` / `audit` / `common` 模型字段、唯一约束、索引与 spec §4.2、§4.3、§8 完全一致。

---

## 给执行者的提示

- 本阶段**不写任何视图、序列化器、URL、服务层**——纯模型与脚手架。鉴权与 API 是 Phase 2、上传与前端是 Phase 3。
- `Permission` / `Role` 模型只建表，**不在本阶段插入任何权限点 / 角色数据**——种子化是 Phase 2 Task 1-2。
- 若 `makemigrations` 生成的迁移文件名与计划中标注的序号（如 `0002_permission.py`）不完全一致，以 Django 实际生成的为准，不影响后续。
- 每个 Task 结束都应有一次干净的 `git commit`；不要把多个 Task 攒成一个提交。
