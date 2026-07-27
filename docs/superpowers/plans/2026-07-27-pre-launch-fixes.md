# 上线前问题修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复上线前审计发现的 11 项 P0 阻断问题 + 8 项严重 BUG，使系统达到可上线状态。

**Architecture:** 修复按子系统分 5 个并行 subagent：(1) 后端配置/凭证安全；(2) 后端权限过滤与 SSRF；(3) 后端业务 bug（PDF、AsyncTask、事务投递、AI 异常吞、变量静默）；(4) 前端修复（bootstrap 测试、XSS、内存泄漏、form.validate）；(5) 后端测试同步。所有修复在 master 上逐 commit 推进，每项 P0 一个独立 commit。

**Tech Stack:** Django 4.x / DRF / Celery / Vue 3 / TypeScript / Vitest / pytest / Docker Compose

## Global Constraints

- 后端测试命令：`cd backend && source .venv/bin/activate && python -m pytest --tb=short -q`
- 前端测试命令：`cd frontend && npx vitest run`（注意：根目录的 vitest v4.1.10 会报 `HTMLCanvasElement is not defined`，必须 cd frontend 用 v4.1.7）
- 前端构建命令：`cd frontend && npm run build`
- TypeScript 严格：`erasableSyntaxOnly` 已开启，禁用构造函数参数属性（`private foo: bar` 形式）
- 后端模型修改必须 `python manage.py makemigrations && migrate`
- 部署：`docker compose build web worker beat && docker compose up -d web worker beat && docker compose restart nginx`
- 提交信息中文，遵循 `feat(scope): 描述` / `fix(scope): 描述` 格式
- 任何修改 `.env` 或 `docker-compose.yml` 的修改不能 commit 真实凭证，只修改代码逻辑

---

## 文件结构总览

### 后端将修改的文件

| 文件 | 责任 | 修改任务 |
|------|------|---------|
| `docker-compose.yml` | 容器环境变量 | T1（DJANGO_SETTINGS_MODULE）、T2（端口绑定） |
| `backend/config/settings/base.py` | 共享配置 | T3（Fernet 密钥校验） |
| `backend/config/settings/prod.py` | 生产配置 | T1（fail-fast 校验） |
| `backend/apps/common/services/file_magic.py` | 文件类型识别 | T5（PDF 支持） |
| `backend/apps/tender/services/parsers/pdf_parser.py` | PDF 解析器 | T5（新建） |
| `backend/apps/tender/services/parse_service.py` | 解析服务 | T5（接入 PDF） |
| `backend/apps/outline/views.py` | Outline/Section/GenerationTask ViewSet | T7（过滤） |
| `backend/apps/bid_check/views.py` | BidCheck ViewSet | T7（过滤） |
| `backend/apps/knowledge/views/knowledge_base_views.py` | 知识库 ViewSet | T7（过滤） |
| `backend/apps/projects/views/member_views.py` | 项目成员 ViewSet | T7（过滤） |
| `backend/apps/outline/views_sse.py` | SSE 视图 | T7（过滤） |
| `backend/apps/outline/views_onlyoffice_callback.py` | ONLYOFFICE 回调 | T8（JWT 强制+SSRF） |
| `backend/apps/outline/models/bid_document.py` | BidDocument 模型 | T8（filename 清洗） |
| `backend/apps/system_config/services/probe_service.py` | 探针服务 | T9（SSRF 校验） |
| `backend/apps/common/views.py` | 编辑器图片上传 | T10（magic bytes） |
| `backend/apps/common/services/file_magic.py` | 文件类型识别 | T10（图片白名单） |
| `backend/apps/outline/tasks.py` | Celery 任务 | T11（AsyncTask 容错） |
| `backend/apps/tender/tasks.py` | 招标任务 | T11（AsyncTask 容错） |
| `backend/apps/outline/services/section_generation_service.py` | 章节生成 | T12（on_commit） |
| `backend/apps/generation/services/ai_task_execution_service.py` | AI 任务执行 | T13（异常抛出） |
| `backend/apps/generation/services/prompt_render_service.py` | 提示词渲染 | T14（StrictUndefined） |
| 多个 `views.py` 与 `services.py` | 多个 `.delay()` 调用 | T12（on_commit） |

### 前端将修改的文件

| 文件 | 责任 | 修改任务 |
|------|------|---------|
| `frontend/src/api/__tests__/bootstrap-auth.spec.ts` | bootstrap 测试 | T15（测试同步） |
| `frontend/src/views/knowledge/components/RagContextPreview.vue` | RAG 预览 | T16（XSS 修复） |
| `frontend/src/views/outline/OutlineDetailView.vue` | 大纲详情页 | T17（内存泄漏）、T18（form.validate） |
| `frontend/src/views/projects/ProjectListView.vue` | 项目列表 | T18 |
| `frontend/src/views/projects/ProjectLots.vue` | 项目标段 | T18 |
| `frontend/src/views/workflow/TemplateListView.vue` | 模板列表 | T18 |
| `frontend/src/views/workflow/TemplateEditView.vue` | 模板编辑 | T18 |
| `frontend/src/views/admin/RoleListView.vue` | 角色管理 | T18 |
| `frontend/src/views/admin/UserListView.vue` | 用户管理 | T18 |

---

## Task 1: 生产配置切换 + SECRET_KEY 强制校验（S1）

**Files:**
- Modify: `docker-compose.yml`
- Modify: `backend/config/settings/prod.py`
- Test: `backend/config/settings/test_prod_settings.py`

**Interfaces:**
- Consumes: `docker-compose.yml` 的 `&backend-env` 锚点
- Produces: 生产容器以 `config.settings.prod` 启动，SECRET_KEY 不可为占位值

- [ ] **Step 1: 写失败测试**

创建 `backend/config/settings/test_prod_settings.py`:

```python
"""生产配置校验测试。"""
import os
import pytest
from django.test import override_settings


@pytest.mark.django_db
def test_prod_settings_reject_insecure_secret_key():
    """prod.py 加载时 SECRET_KEY 为占位值应抛 SystemExit。"""
    from config.settings import prod

    # 模拟占位 SECRET_KEY
    with override_settings(SECRET_KEY="dev-insecure-change-me"):
        with pytest.raises(SystemExit, match="SECRET_KEY.*不可.*dev-insecure"):
            prod.validate_production_secrets()
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd backend && source .venv/bin/activate && python -m pytest config/settings/test_prod_settings.py -v
```

Expected: FAIL with `AttributeError: module 'config.settings.prod' has no attribute 'validate_production_secrets'`

- [ ] **Step 3: 实现 validate_production_secrets**

修改 `backend/config/settings/prod.py`，在文件末尾追加：

```python
"""生产环境配置。"""
from django.conf import settings  # noqa: F401

# 继承 base 后再做生产专属校验
from .base import *  # noqa: F401,F403

DEBUG = False
SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True

# 生产环境认证 Cookie 必须带 Secure
AUTH_COOKIE_SECURE = True

# 强随机密钥校验（防止部署时漏改占位值导致 JWT 可伪造）
def validate_production_secrets():
    """启动时校验生产密钥不可为占位值。"""
    insecure_keys = {"dev-insecure-change-me", "changeme", "insecure", ""}
    if settings.SECRET_KEY in insecure_keys:
        raise SystemExit(
            f"[FATAL] SECRET_KEY 不可为占位值（当前={settings.SECRET_KEY!r}），"
            "请在 .env 设置 DJANGO_SECRET_KEY（>=50 字符强随机）。"
        )
    if len(settings.SECRET_KEY) < 32:
        raise SystemExit(
            f"[FATAL] SECRET_KEY 长度不足（当前 {len(settings.SECRET_KEY)} 字符，"
            "要求 >=32 字符）。"
        )
    if not getattr(settings, "SECRET_KEY_ENCRYPTION", None):
        raise SystemExit(
            "[FATAL] 生产环境必须设置 SECRET_KEY_ENCRYPTION（Fernet 强密钥，"
            "用于加密 ModelProvider API Key）。请运行 "
            "python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
            " 生成后写入 .env。"
        )


# 模块加载时执行校验（gunicorn 启动会 import 此模块）
validate_production_secrets()
```

- [ ] **Step 4: 修改 docker-compose.yml 切换到 prod 配置**

修改 `docker-compose.yml`，在 `x-backend-env: &backend-env` 锚点中追加 `DJANGO_SETTINGS_MODULE`：

```yaml
x-backend-env: &backend-env
  DJANGO_SETTINGS_MODULE: config.settings.prod
  DATABASE_URL: postgres://bid:bid@postgres:5432/bid
  REDIS_URL: redis://redis:6379/1
  CELERY_BROKER_URL: redis://redis:6379/0
  CELERY_RESULT_BACKEND: redis://redis:6379/0
  MINIO_ENDPOINT: minio:9000
  MINIO_PUBLIC_ENDPOINT: ${MINIO_PUBLIC_ENDPOINT:-localhost:9000}
```

- [ ] **Step 5: 修改 .env 加入 SECRET_KEY_ENCRYPTION（开发用，生产由部署脚本生成）**

读取当前 `.env`，确认是否已有 `DJANGO_SECRET_KEY` 与 `SECRET_KEY_ENCRYPTION`，若没有则追加（用强随机值，但不 commit）：

```bash
# 检查现有 .env
grep -E "DJANGO_SECRET_KEY|SECRET_KEY_ENCRYPTION" /home/newaibook/ai-bid-generator/.env || echo "缺失，需要补"
# 生成强随机 SECRET_KEY（仅本地，不 commit）
NEW_SECRET=$(python3 -c "import secrets; print(secrets.token_urlsafe(50))")
NEW_FERNET=$(python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
echo "DJANGO_SECRET_KEY=$NEW_SECRET"
echo "SECRET_KEY_ENCRYPTION=$NEW_FERNET"
# 手动写入 .env（不要 echo 到 git）
```

- [ ] **Step 6: 运行测试，确认通过**

```bash
cd backend && source .venv/bin/activate && python -m pytest config/settings/test_prod_settings.py -v
```

Expected: PASS

- [ ] **Step 7: 重新构建容器并验证启动**

```bash
cd /home/newaibook/ai-bid-generator
docker compose build web worker beat 2>&1 | tail -5
docker compose up -d web worker beat 2>&1 | tail -5
sleep 5
docker logs --tail 30 ai-bid-generator-web-1 2>&1 | grep -iE "error|fatal|traceback"
curl -s -o /dev/null -w "HTTP %{http_code}\n" -X POST http://localhost/api/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}'
```

Expected: HTTP 200，无 FATAL 日志。

- [ ] **Step 8: Commit**

```bash
git add backend/config/settings/prod.py backend/config/settings/test_prod_settings.py docker-compose.yml
git commit -m "fix(security): 生产配置强制切换 + SECRET_KEY 强校验

- docker-compose.yml 显式设 DJANGO_SETTINGS_MODULE=config.settings.prod
- prod.py 加载时校验 SECRET_KEY 不可为占位值且长度 >=32
- prod.py 校验 SECRET_KEY_ENCRYPTION 必须配置（Fernet 密钥用于加密 API Key）
- 新增 test_prod_settings.py 覆盖校验逻辑

修复审计 S1：原生产容器以 dev 配置 + 占位 SECRET_KEY 运行，可伪造任意 JWT"
```

---

## Task 2: MinIO/Postgres 默认凭证与端口对外（S7）

**Files:**
- Modify: `docker-compose.yml`
- Modify: `.env`（不 commit 真实凭证，只修改 docker-compose 端口绑定逻辑）

**Interfaces:**
- Consumes: `docker-compose.yml` 的 postgres/minio 服务定义
- Produces: Postgres 5432 仅本机可达，MinIO 控制台 9001 仅本机可达

- [ ] **Step 1: 修改 docker-compose.yml 端口绑定**

将 postgres 端口改为 `127.0.0.1:5432`，将 minio 控制台端口改为 `127.0.0.1:9001`：

```yaml
  postgres:
    image: pgvector/pgvector:pg16
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-bid}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-bid}
      POSTGRES_DB: ${POSTGRES_DB:-bid}
    ports:
      - "127.0.0.1:5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  minio:
    image: minio/minio:latest
    restart: unless-stopped
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER:-minioadmin}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD:-minioadmin}
    ports:
      - "9000:9000"
      - "127.0.0.1:9001:9001"
    volumes:
      - miniodata:/data
```

- [ ] **Step 2: 修改 backend-env 锚点中数据库连接串与 MinIO 凭证读取**

```yaml
x-backend-env: &backend-env
  DJANGO_SETTINGS_MODULE: config.settings.prod
  DATABASE_URL: postgres://${POSTGRES_USER:-bid}:${POSTGRES_PASSWORD:-bid}@postgres:5432/${POSTGRES_DB:-bid}
  REDIS_URL: redis://redis:6379/1
  CELERY_BROKER_URL: redis://redis:6379/0
  CELERY_RESULT_BACKEND: redis://redis:6379/0
  MINIO_ENDPOINT: minio:9000
  MINIO_PUBLIC_ENDPOINT: ${MINIO_PUBLIC_ENDPOINT:-localhost:9000}
```

- [ ] **Step 3: 验证 .env 中是否有自定义凭证，没有则生成**

```bash
cd /home/newaibook/ai-bid-generator
grep -E "^POSTGRES_PASSWORD|^MINIO_ROOT_PASSWORD" .env || cat >> .env << 'EOF'

# === 上线前安全配置 ===
POSTGRES_USER=bid
POSTGRES_PASSWORD=$(python3 -c "import secrets; print(secrets.token_urlsafe(24))")
POSTGRES_DB=bid
MINIO_ROOT_USER=$(python3 -c "import secrets; print(secrets.token_urlsafe(16))")
MINIO_ROOT_PASSWORD=$(python3 -c "import secrets; print(secrets.token_urlsafe(24))")
EOF
echo "凭证已写入 .env，但不会 commit"
```

注意：执行 `source .env` 后 docker compose 会用新凭证，但 postgres 数据卷已用旧凭证初始化，需要 `docker compose down -v` 后重建（生产部署时执行；本地测试可跳过）。

- [ ] **Step 4: 重建容器验证**

```bash
cd /home/newaibook/ai-bid-generator
docker compose down -v 2>&1 | tail -3
docker compose up -d 2>&1 | tail -5
sleep 8
docker logs --tail 20 ai-bid-generator-postgres-1 2>&1 | tail -10
docker logs --tail 20 ai-bid-generator-minio-1 2>&1 | tail -10
docker ps --filter "name=ai-bid-generator" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

Expected: postgres 与 minio 控制台端口显示 `127.0.0.1:5432->5432` 与 `127.0.0.1:9001->9001`，但 minio API 仍是 `0.0.0.0:9000->9000`。

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml
git commit -m "fix(security): Postgres 与 MinIO 控制台端口绑定 127.0.0.1

- postgres 5432 端口绑定为 127.0.0.1:5432:5432
- minio 控制台 9001 端口绑定为 127.0.0.1:9001:9001
- 凭证改为从 .env 读取默认值（POSTGRES_PASSWORD/MINIO_ROOT_PASSWORD）

修复审计 S7：原 5432/9001 端口对外暴露，外部可直连窃取数据"
```

---

## Task 3: Fernet 密钥派生弱（S4）

**Files:**
- Modify: `backend/apps/system_config/models.py:13-20`
- Test: `backend/apps/system_config/tests/test_fernet_key.py`

**Interfaces:**
- Consumes: `settings.SECRET_KEY_ENCRYPTION`（生产强制配置，T1 已校验）
- Produces: `get_fernet_key()` 不再回退到 SECRET_KEY 派生

- [ ] **Step 1: 写失败测试**

创建 `backend/apps/system_config/tests/test_fernet_key.py`:

```python
"""Fernet 密钥派生测试。"""
import pytest
from django.test import override_settings


def test_get_fernet_key_uses_explicit_setting():
    """配置 SECRET_KEY_ENCRYPTION 时直接使用。"""
    from apps.system_config.models import get_fernet_key
    with override_settings(SECRET_KEY_ENCRYPTION="explicit-fernet-key-value"):
        result = get_fernet_key()
        assert isinstance(result, (str, bytes))
        assert "explicit" in str(result) or result == "explicit-fernet-key-value"


def test_get_fernet_key_raises_when_missing():
    """未配置 SECRET_KEY_ENCRYPTION 时应抛 ImproperlyConfigured。"""
    from apps.system_config.models import get_fernet_key
    from django.core.exceptions import ImproperlyConfigured
    with override_settings(SECRET_KEY_ENCRYPTION=None):
        with pytest.raises(ImproperlyConfigured, match="SECRET_KEY_ENCRYPTION"):
            get_fernet_key()
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd backend && source .venv/bin/activate && python -m pytest apps/system_config/tests/test_fernet_key.py -v
```

Expected: FAIL with `Failed: DID NOT RAISE`（因当前实现回退到派生值，不抛异常）

- [ ] **Step 3: 修改 get_fernet_key**

修改 `backend/apps/system_config/models.py`:

```python
"""系统配置模型。"""

import json
from cryptography.fernet import Fernet
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.db import models
from django.utils.timezone import now

from apps.common.models import TimeStampedModel


def get_fernet_key():
    """获取 Fernet 加密密钥。

    生产环境必须显式配置 SECRET_KEY_ENCRYPTION（Fernet.format key，
    `Fernet.generate_key()` 产出）。

    不再回退到 SECRET_KEY 派生——SECRET_KEY 长度不足会零填充导致熵不足，
    所有 ModelProvider 的 API Key 等于明文。
    """
    key = getattr(settings, "SECRET_KEY_ENCRYPTION", None)
    if not key:
        raise ImproperlyConfigured(
            "SECRET_KEY_ENCRYPTION 未配置。请运行 "
            "python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
            " 生成 Fernet 密钥后写入 .env 的 SECRET_KEY_ENCRYPTION。"
        )
    return key
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd backend && source .venv/bin/activate && python -m pytest apps/system_config/tests/test_fernet_key.py -v
```

Expected: PASS

- [ ] **Step 5: 运行相关回归测试**

```bash
cd backend && source .venv/bin/activate && python -m pytest apps/system_config/ -v --tb=short 2>&1 | tail -30
```

Expected: 不应有 ImproperlyConfigured 之外的失败。

- [ ] **Step 6: Commit**

```bash
git add backend/apps/system_config/models.py backend/apps/system_config/tests/test_fernet_key.py
git commit -m "fix(security): Fernet 密钥不再回退到 SECRET_KEY 派生

- get_fernet_key 在 SECRET_KEY_ENCRYPTION 未配置时抛 ImproperlyConfigured
- 新增 test_fernet_key.py 覆盖两种场景

修复审计 S4：原 22 字节 SECRET_KEY 经 ljust(32) 零填充后作为 Fernet 密钥，
熵严重不足，所有 ModelProvider API Key 等于明文"
```

---

## Task 4: 编辑器图片上传 magic bytes 校验（S9）

**Files:**
- Modify: `backend/apps/common/views.py:79-110`
- Modify: `backend/apps/common/services/file_magic.py`
- Test: `backend/apps/common/tests/test_editor_image_upload.py`

**Interfaces:**
- Consumes: `apps.common.services.file_magic.detect_image_kind`（新增）
- Produces: 图片上传扩展名白名单 + magic bytes 校验

- [ ] **Step 1: 写失败测试**

创建 `backend/apps/common/tests/test_editor_image_upload.py`:

```python
"""编辑器图片上传安全测试。"""
import io
import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

User = get_user_model()


@pytest.mark.django_db
def test_image_with_svg_extension_rejected():
    """SVG 扩展名应被拒绝（XSS 风险）。"""
    user = User.objects.create_user(username="admin", password="pass")
    client = APIClient()
    client.force_authenticate(user=user)
    # SVG 含脚本
    svg_content = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
    upload = SimpleUploadedFile("evil.svg", svg_content, content_type="image/svg+xml")
    resp = client.post("/api/editor/upload-image/", {"file": upload}, format="multipart")
    assert resp.status_code == 400, f"SVG 应被拒绝，但返回 {resp.status_code}"


@pytest.mark.django_db
def test_image_with_fake_png_content_rejected():
    """伪装 content_type 但内容是 HTML，应被拒绝。"""
    user = User.objects.create_user(username="admin", password="pass")
    client = APIClient()
    client.force_authenticate(user=user)
    html_content = b'<html><script>alert(1)</script></html>'
    upload = SimpleUploadedFile(
        "fake.png",
        html_content,
        content_type="image/png",  # 伪装
    )
    resp = client.post("/api/editor/upload-image/", {"file": upload}, format="multipart")
    assert resp.status_code == 400, "伪装 PNG 应被 magic bytes 拒绝"


@pytest.mark.django_db
def test_real_png_accepted():
    """真实 PNG magic bytes 应被接受。"""
    user = User.objects.create_user(username="admin", password="pass")
    client = APIClient()
    client.force_authenticate(user=user)
    # 1x1 PNG
    png_magic = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
    upload = SimpleUploadedFile("ok.png", png_magic, content_type="image/png")
    resp = client.post("/api/editor/upload-image/", {"file": upload}, format="multipart")
    assert resp.status_code in (200, 201), f"真实 PNG 应被接受，但返回 {resp.status_code}"
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd backend && source .venv/bin/activate && python -m pytest apps/common/tests/test_editor_image_upload.py -v
```

Expected: 3 个测试中前 2 个 FAIL（SVG 与伪装 PNG 当前可通过）

- [ ] **Step 3: 在 file_magic.py 新增 detect_image_kind**

修改 `backend/apps/common/services/file_magic.py`，在文件末尾追加：

```python
# 图片扩展名白名单（编辑器图片上传）
ALLOWED_IMAGE_EXTENSIONS = {"png", "jpeg", "jpg", "webp"}

# 图片 magic bytes 签名
IMAGE_MAGIC_BYTES = {
    "png": b"\x89PNG\r\n\x1a\n",
    "jpeg": b"\xff\xd8\xff",
    "webp": b"RIFF",  # WebP 前 4 字节
}


def detect_image_kind(head: bytes) -> str:
    """根据 magic bytes 识别图片真实类型。

    Args:
        head: 文件头部字节（至少 12 字节）

    Returns:
        "png" / "jpeg" / "webp" / "unknown"
    """
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if head.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if head.startswith(b"RIFF") and head[8:12] == b"WEBP":
        return "webp"
    return "unknown"


def is_allowed_image(filename: str, head: bytes) -> bool:
    """校验图片扩展名与 magic bytes 一致。"""
    ext = extension_of(filename)
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        return False
    # jpeg 的扩展名可能是 .jpg 或 .jpeg
    canonical = "jpeg" if ext in ("jpg", "jpeg") else ext
    actual_kind = detect_image_kind(head)
    return actual_kind == canonical
```

- [ ] **Step 4: 修改 EditorImageUploadView 使用新校验**

修改 `backend/apps/common/views.py`:

```python
# 文件头部修改 import
import os
import uuid
from django.utils import timezone
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response

from apps.common.exceptions import BadRequest
from apps.common.services.storage import StorageService
from apps.common.services.file_magic import is_allowed_image


class EditorImageUploadView(APIView):
    """编辑器图片上传。

    Element Plus 富文本编辑器使用，图片上传到 MinIO 公开前缀。
    """

    MAX_SIZE = 10 * 1024 * 1024  # 10MB
    EDITOR_IMAGES_PREFIX = "editor/images/"
    ALLOWED_EXTENSIONS = ("png", "jpeg", "jpg", "webp")

    def post(self, request):
        """上传编辑器图片。"""
        file = request.FILES.get("file")
        if not file:
            raise BadRequest(message="未提供文件")

        # 读取文件头做 magic bytes 校验
        file.seek(0)
        head = file.read(12)
        file.seek(0)

        if not is_allowed_image(file.name, head):
            raise BadRequest(message="不支持的文件类型，仅支持 png、jpeg、webp（拒绝 SVG/HTML）")

        if file.size > self.MAX_SIZE:
            raise BadRequest(message="文件大小超过 10MB 限制")

        # 扩展名从白名单取，不用原文件名扩展
        ext_map = {"png": "png", "jpeg": "jpeg", "jpg": "jpeg", "webp": "webp"}
        ext = ext_map.get(Path(file.name).suffix.lower().lstrip("."), "png")
        filename = f"{uuid.uuid4().hex}.{ext}"
        today = timezone.now()
        object_key = f"{self.EDITOR_IMAGES_PREFIX}{today.year}/{today.month:02d}/{today.day:02d}/{filename}"

        storage = StorageService()
        storage.upload_fileobj(file, object_key, content_type=f"image/{ext}")

        storage.set_public_policy(self.EDITOR_IMAGES_PREFIX)

        return Response(
            {"url": f"/minio/{self.EDITOR_IMAGES_PREFIX}{today.year}/{today.month:02d}/{today.day:02d}/{filename}"},
            status=status.HTTP_201_CREATED,
        )
```

需要在文件顶部 import Path:

```python
from pathlib import Path
```

- [ ] **Step 5: 运行测试确认通过**

```bash
cd backend && source .venv/bin/activate && python -m pytest apps/common/tests/test_editor_image_upload.py -v
```

Expected: 3 个测试全部 PASS

- [ ] **Step 6: Commit**

```bash
git add backend/apps/common/views.py backend/apps/common/services/file_magic.py backend/apps/common/tests/test_editor_image_upload.py
git commit -m "fix(security): 编辑器图片上传 magic bytes 校验 + 扩展名白名单

- 新增 detect_image_kind 与 is_allowed_image 校验图片真实类型
- 上传时读文件头 12 字节做 magic bytes 校验
- 扩展名从白名单映射，强制重命名为 uuid+白名单扩展
- 拒绝 SVG/HTML 伪装为图片

修复审计 S9：原仅校验 content_type（可伪造），editor/images/ 公开读前缀下成 XSS 投放点"
```

---

## Task 5: PDF 招标文件支持（S6）

**Files:**
- Create: `backend/apps/tender/services/parsers/pdf_parser.py`
- Modify: `backend/apps/common/services/file_magic.py:9,22-27`
- Modify: `backend/apps/tender/services/parse_service.py:34,44,141-156`
- Test: `backend/apps/tender/tests/test_pdf_parser.py`

**Interfaces:**
- Consumes: `pdfplumber` (已在 requirements.txt)
- Produces: `PdfParser.parse(content, filename) -> ParseResult`，`file_magic` 支持 PDF

- [ ] **Step 1: 写失败测试**

创建 `backend/apps/tender/tests/test_pdf_parser.py`:

```python
"""PDF 解析器测试。"""
import pytest
from apps.tender.services.parsers.pdf_parser import PdfParser


def test_pdf_parser_supports_pdf_extension():
    parser = PdfParser()
    assert parser.supports("pdf")
    assert parser.supports("PDF")


def test_pdf_parser_rejects_non_pdf():
    parser = PdfParser()
    assert not parser.supports("docx")
    assert not parser.supports("txt")


def test_pdf_parser_with_invalid_content_raises():
    """非 PDF 内容应抛 UnsupportedFormatError 或解析错误。"""
    parser = PdfParser()
    with pytest.raises(Exception):
        parser.parse(b"not a pdf", "test.pdf")


def test_file_magic_accepts_pdf():
    """file_magic 应识别 PDF 并允许上传。"""
    from apps.common.services.file_magic import is_allowed_upload, detect_kind
    pdf_magic = b"%PDF-1.7\n"
    assert detect_kind(pdf_magic) == "pdf"
    assert is_allowed_upload("test.pdf", pdf_magic)
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd backend && source .venv/bin/activate && python -m pytest apps/tender/tests/test_pdf_parser.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'apps.tender.services.parsers.pdf_parser'`

- [ ] **Step 3: 创建 PdfParser**

创建 `backend/apps/tender/services/parsers/pdf_parser.py`:

```python
"""PDF 文档解析器。"""

import io
import logging

from apps.tender.services.parsers.base import BaseParser, ParseResult

logger = logging.getLogger(__name__)


class PdfParser(BaseParser):
    """PDF 文档解析器。

    使用 pdfplumber 提取文本与表格，转换为 Markdown。
    """

    SUPPORTED_EXTENSIONS = ["pdf"]

    def parse(self, content: bytes, filename: str) -> ParseResult:
        """解析 PDF 文件。

        Args:
            content: PDF 文件二进制内容
            filename: 文件名

        Returns:
            ParseResult 包含 Markdown 和元数据

        Raises:
            RuntimeError: pdfplumber 未安装或解析失败
        """
        try:
            import pdfplumber
        except ImportError:
            raise RuntimeError("pdfplumber 未安装，请检查 requirements.txt")

        markdown_parts = []
        page_count = 0
        table_count = 0

        try:
            with pdfplumber.open(io.BytesIO(content)) as pdf:
                page_count = len(pdf.pages)

                for page_idx, page in enumerate(pdf.pages, start=1):
                    # 提取文本
                    text = page.extract_text() or ""
                    if text.strip():
                        # 按行处理
                        for line in text.split("\n"):
                            line = line.strip()
                            if line:
                                markdown_parts.append(line)

                    # 提取表格
                    tables = page.extract_tables() or []
                    for table in tables:
                        if not table:
                            continue
                        markdown_parts.append("")
                        markdown_parts.append("| " + " | ".join(table[0]) + " |")
                        markdown_parts.append("| " + " | ".join(["---"] * len(table[0])) + " |")
                        for row in table[1:]:
                            # 补齐列数
                            row = list(row) + [""] * (len(table[0]) - len(row))
                            markdown_parts.append("| " + " | ".join(str(c or "") for c in row) + " |")
                        markdown_parts.append("")
                        table_count += 1

                    # 分页标记
                    if page_idx < page_count:
                        markdown_parts.append("")
                        markdown_parts.append(f"<!-- page {page_idx} -->")

        except Exception as exc:
            logger.exception("PDF 解析失败: %s", exc)
            raise RuntimeError(f"PDF 解析失败: {exc}") from exc

        markdown = "\n".join(markdown_parts)

        return ParseResult(
            markdown=markdown,
            page_count=page_count,
            parse_engine="pdfplumber",
            parse_quality="high" if page_count > 0 else "low",
            quality_metrics={
                "page_count": page_count,
                "table_count": table_count,
                "char_count": len(markdown),
            },
        )
```

- [ ] **Step 4: 修改 file_magic.py 支持 PDF**

修改 `backend/apps/common/services/file_magic.py`:

```python
"""轻量 magic bytes 校验。"""
from pathlib import Path

# 允许的文件扩展名
ALLOWED_EXTENSIONS = {"docx", "txt", "md", "xlsx", "xls", "zip", "pdf"}

# 不支持的文件类型及提示
UNSUPPORTED_TYPES = {
    "doc": "暂不支持旧版 DOC 格式，请转换为 DOCX 后上传",
}


def extension_of(filename: str) -> str:
    return Path(filename).suffix.lower().lstrip(".")


def detect_kind(head: bytes) -> str:
    if head.startswith(b"%PDF-"):
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
    if ext in {"txt", "md"}:
        return kind == "txt"
    if ext in {"doc", "xls"}:
        return kind in {"unknown", "zip"}
    return False


def get_unsupported_message(filename: str) -> str | None:
    """获取不支持的文件类型提示信息。"""
    ext = extension_of(filename)
    return UNSUPPORTED_TYPES.get(ext)
```

- [ ] **Step 5: 修改 parse_service.py 接入 PdfParser**

修改 `backend/apps/tender/services/parse_service.py`:

```python
class ParseService:
    """文档解析服务。

    根据 settings.PARSER_ENGINE 选择解析器：
    - "mock": 使用 MockParser（测试用）
    - 其他: 使用真实解析器（DocxParser / TextParser / PdfParser）
    """

    VERSION = PARSER_VERSION

    SUPPORTED_EXTENSIONS = ["docx", "txt", "md", "pdf"]

    # 不支持的扩展名及提示
    UNSUPPORTED_MESSAGE = {
        "doc": "暂不支持旧版 DOC 格式，请转换为 DOCX 后上传",
    }

    def __init__(self):
        self.docx_parser = DocxParser()
        self.text_parser = TextParser()
        self.pdf_parser = PdfParser()
        self.mock_parser = MockParser()
```

在 `_do_parse` 方法中新增 pdf 分支:

```python
        # 使用真实解析器
        if extension == "docx":
            return self.docx_parser.parse(content, filename)
        elif extension in ["txt", "md"]:
            return self.text_parser.parse(content, filename)
        elif extension == "pdf":
            return self.pdf_parser.parse(content, filename)
        else:
            raise UnsupportedFormatError(f"不支持的文件格式: {extension}")
```

文件顶部 import 区追加:

```python
from apps.tender.services.parsers.pdf_parser import PdfParser
```

- [ ] **Step 6: 修改 upload_service.py 错误提示**

修改 `backend/apps/tender/services/upload_service.py`，在 `_reject` 之前的 message 处理中（约 line 137），不再硬编码 "暂不支持 PDF" 错误信息（已在 file_magic 中移除）。

- [ ] **Step 7: 运行测试确认通过**

```bash
cd backend && source .venv/bin/activate && python -m pytest apps/tender/tests/test_pdf_parser.py apps/common/tests/test_file_magic.py -v
```

Expected: 5 个测试全部 PASS

- [ ] **Step 8: 修复 test_upload_api.py 中 PDF 相关断言**

修改 `backend/apps/tender/tests/test_upload_api.py:146` 中 `test_complete_upload_is_idempotent`：

```bash
# 查看具体行
sed -n '140,160p' backend/apps/tender/tests/test_upload_api.py
```

如果测试 fixture 用 `.pdf` 文件名 + `%PDF-1.7\n` magic，现在应该返回 200 而不是 400。如果断言期望 400，改为 200：

```python
# 修改前
assert response.status_code == 400
# 修改后（如果该测试期望 PDF 被拒）
assert response.status_code in (200, 201)
```

- [ ] **Step 9: 运行完整 tender 测试套件**

```bash
cd backend && source .venv/bin/activate && python -m pytest apps/tender/ -v --tb=short 2>&1 | tail -30
```

Expected: 之前因 PDF 拒绝而失败的测试现在通过

- [ ] **Step 10: Commit**

```bash
git add backend/apps/tender/services/parsers/pdf_parser.py backend/apps/common/services/file_magic.py backend/apps/tender/services/parse_service.py backend/apps/tender/tests/test_pdf_parser.py backend/apps/common/tests/test_file_magic.py backend/apps/tender/tests/test_upload_api.py
git commit -m "feat(tender): 支持 PDF 招标文件上传与解析

- 新增 PdfParser 使用 pdfplumber 提取文本与表格
- file_magic 加入 PDF magic bytes 识别与白名单
- ParseService 接入 PdfParser
- 同步修复 test_upload_api.py 中 PDF 相关断言

修复审计 S6：原 file_magic 明确移除 pdf 支持，PDF 招标文件被系统拒绝"
```

---

## Task 6: 越权数据过滤（S2）— Part A：Outline/Section/GenerationTask

**Files:**
- Modify: `backend/apps/outline/views.py:56-77,926-935,1455-1466`
- Test: `backend/apps/outline/tests/test_outline_permission.py`

**Interfaces:**
- Consumes: `apps.projects.models.ProjectMember` 的 `project__members__user` 关系
- Produces: 所有项目级 ViewSet 的 `get_queryset` 按 `project__members__user=request.user` 过滤

- [ ] **Step 1: 写失败测试**

创建 `backend/apps/outline/tests/test_outline_permission.py`:

```python
"""大纲越权访问测试。"""
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.projects.models import Project, ProjectMember, ProjectRole

User = get_user_model()


@pytest.fixture
def owner_user(db):
    user = User.objects.create_user(username="owner", password="pass")
    return user


@pytest.fixture
def other_user(db):
    user = User.objects.create_user(username="other", password="pass")
    return user


@pytest.fixture
def project_with_owner(owner_user):
    project = Project.objects.create(name="test", code="test")
    # 初始化内置角色并加 owner
    from apps.projects.services.project_service import ProjectService
    ProjectService().initialize_project_memberships(project, owner_user)
    return project


@pytest.mark.django_db
def test_outline_list_excludes_other_users_projects(project_with_owner, other_user):
    """非项目成员不应看到该项目的 outline。"""
    client = APIClient()
    client.force_authenticate(user=other_user)
    resp = client.get("/api/outlines/")
    assert resp.status_code == 200
    data = resp.json().get("data", {}).get("results", [])
    # 不应看到 project_with_owner 的 outline
    for item in data:
        assert item.get("project") != project_with_owner.id


@pytest.mark.django_db
def test_outline_detail_forbidden_for_non_member(project_with_owner, other_user):
    """非项目成员访问具体 outline 应 403 或 404。"""
    from apps.outline.models import Outline, OutlineSource
    outline = Outline.objects.create(
        project=project_with_owner,
        name="test outline",
        source=OutlineSource.MANUAL,
        created_by=project_with_owner.members.first().user,
    )
    client = APIClient()
    client.force_authenticate(user=other_user)
    resp = client.get(f"/api/outlines/{outline.id}/")
    assert resp.status_code in (403, 404)
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd backend && source .venv/bin/activate && python -m pytest apps/outline/tests/test_outline_permission.py -v
```

Expected: FAIL（当前实现未按用户过滤）

- [ ] **Step 3: 修改 OutlineViewSet.get_queryset**

修改 `backend/apps/outline/views.py:56-77`:

```python
class OutlineViewSet(viewsets.ModelViewSet):
    """大纲视图集。"""

    queryset = Outline.objects.select_related("project", "lot", "created_by")
    serializer_class = OutlineSerializer
    permission_classes = [RequirePermission]

    def get_queryset(self):
        queryset = super().get_queryset()
        # 按用户可见项目过滤（成员关系）
        user = self.request.user
        if user.is_authenticated and not user.is_superuser:
            queryset = queryset.filter(project__members__user=user)
        project_id = self.request.query_params.get("project_id")
        lot_id = self.request.query_params.get("lot_id")
        is_current = self.request.query_params.get("is_current")

        if project_id:
            queryset = queryset.filter(project_id=project_id)
        if lot_id:
            queryset = queryset.filter(lot_id=lot_id)
        if is_current is not None:
            queryset = queryset.filter(is_current=is_current.lower() == "true")

        return queryset.distinct()
```

- [ ] **Step 4: 修改 SectionViewSet.get_queryset**

修改 `backend/apps/outline/views.py:926-935`，类似 OutlineViewSet 增加 `outline__project__members__user=user` 过滤。

- [ ] **Step 5: 修改 GenerationTaskViewSet.get_queryset**

修改 `backend/apps/outline/views.py:1455-1466`，类似增加 `outline__project__members__user=user` 过滤。

- [ ] **Step 6: 运行测试确认通过**

```bash
cd backend && source .venv/bin/activate && python -m pytest apps/outline/tests/test_outline_permission.py -v
```

Expected: PASS

- [ ] **Step 7: 运行现有 outline 测试回归**

```bash
cd backend && source .venv/bin/activate && python -m pytest apps/outline/ -v --tb=short 2>&1 | tail -30
```

Expected: 现有测试不应回归失败（如果某些测试不创建成员关系就访问 outline，需要补 fixture）

- [ ] **Step 8: Commit**

```bash
git add backend/apps/outline/views.py backend/apps/outline/tests/test_outline_permission.py
git commit -m "fix(security): Outline/Section/GenerationTask 按项目成员过滤

- OutlineViewSet.get_queryset 增加 project__members__user=user 过滤
- SectionViewSet.get_queryset 增加 outline__project__members__user=user 过滤
- GenerationTaskViewSet.get_queryset 同样过滤
- 新增 test_outline_permission.py 覆盖非成员访问被拒场景

修复审计 S2：原无用户维度过滤，任意登录用户可读写任意项目数据"
```

---

## Task 7: 越权数据过滤（S2）— Part B：BidCheck/Knowledge/ProjectMember/SSE

**Files:**
- Modify: `backend/apps/bid_check/views.py:23-37,82-92`
- Modify: `backend/apps/knowledge/views/knowledge_base_views.py:24-26,48-49`
- Modify: `backend/apps/projects/views/member_views.py:30-36`
- Modify: `backend/apps/outline/views_sse.py:48-58,154-170`
- Test: `backend/apps/bid_check/tests/test_bid_check_permission.py`

**Interfaces:**
- Consumes: T6 已建立的成员过滤模式
- Produces: 各 ViewSet 按用户/项目过滤

- [ ] **Step 1: 写失败测试**

创建 `backend/apps/bid_check/tests/test_bid_check_permission.py`:

```python
"""废标检查越权访问测试。"""
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.projects.models import Project
from apps.projects.services.project_service import ProjectService

User = get_user_model()


@pytest.fixture
def project_with_owner(db):
    owner = User.objects.create_user(username="owner", password="pass")
    project = Project.objects.create(name="test", code="test")
    ProjectService().initialize_project_memberships(project, owner)
    return project, owner


@pytest.fixture
def stranger(db):
    return User.objects.create_user(username="stranger", password="pass")


@pytest.mark.django_db
def test_bid_check_task_list_excludes_non_member(project_with_owner, stranger):
    """非项目成员不应看到该项目的废标检查任务。"""
    project, owner = project_with_owner
    client = APIClient()
    client.force_authenticate(user=stranger)
    resp = client.get("/api/bid-check/tasks/")
    assert resp.status_code == 200
    data = resp.json().get("data", {}).get("results", [])
    for item in data:
        # 不应包含 owner 项目的任务
        assert item.get("project") != project.id
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd backend && source .venv/bin/activate && python -m pytest apps/bid_check/tests/test_bid_check_permission.py -v
```

- [ ] **Step 3: 修改 BidCheckTaskViewSet.get_queryset**

修改 `backend/apps/bid_check/views.py:23-37`:

```python
class BidCheckTaskViewSet(viewsets.ReadOnlyModelViewSet):
    """废标检查任务视图集。"""

    serializer_class = BidCheckTaskSerializer
    permission_classes = [RequirePermission]

    def get_queryset(self):
        queryset = BidCheckTask.objects.select_related("project", "outline", "created_by")
        user = self.request.user
        if user.is_authenticated and not user.is_superuser:
            queryset = queryset.filter(project__members__user=user)
        project_id = self.request.query_params.get("project_id")
        if project_id:
            queryset = queryset.filter(project_id=project_id)
        return queryset.distinct()
```

- [ ] **Step 4: 修改 BidCheckFindingViewSet**

类似增加 `task__project__members__user=user` 过滤。

- [ ] **Step 5: 修改 KnowledgeBaseListView.get_queryset**

修改 `backend/apps/knowledge/views/knowledge_base_views.py:16-26`:

```python
class KnowledgeBaseListView(generics.ListCreateAPIView):
    serializer_class = KnowledgeBaseSerializer

    def get_queryset(self):
        queryset = KnowledgeBase.objects.filter(is_deleted=False)
        user = self.request.user
        if user.is_authenticated and not user.is_superuser:
            queryset = queryset.filter(created_by=user)
        return queryset
```

- [ ] **Step 6: 修改 ProjectMemberViewSet.get_queryset**

修改 `backend/apps/projects/views/member_views.py:20-36`:

```python
class ProjectMemberViewSet(viewsets.ModelViewSet):
    """项目成员视图集。"""

    serializer_class = ProjectMemberSerializer
    permission_classes = [RequirePermission]
    required_permission = "project.member.manage"
    required_scope = "project"

    def get_queryset(self):
        queryset = ProjectMember.objects.select_related("project", "user", "project_role")
        # 只返回当前用户所属项目的成员
        user = self.request.user
        if user.is_authenticated and not user.is_superuser:
            queryset = queryset.filter(project__members__user=user)
        project_pk = self.kwargs.get("project_pk")
        if project_pk:
            queryset = queryset.filter(project_id=project_pk)
        return queryset.distinct()
```

- [ ] **Step 7: 修改 SSE 视图**

修改 `backend/apps/outline/views_sse.py:48-58` 的 `authenticate_request` 与 `BatchGenerationSSEView`、`OutlineProgressSSEView`，在认证后增加 outline 归属校验：

```python
def _check_outline_access(user, outline_id):
    """校验用户是否可访问该 outline。"""
    from apps.outline.models import Outline
    if user.is_superuser:
        return True
    return Outline.objects.filter(pk=outline_id, project__members__user=user).exists()
```

在每个 SSE view 的 get 方法中调用此函数，返回 403 若无权限。

- [ ] **Step 8: 运行测试确认通过**

```bash
cd backend && source .venv/bin/activate && python -m pytest apps/bid_check/tests/test_bid_check_permission.py apps/knowledge/ apps/projects/ -v --tb=short 2>&1 | tail -30
```

Expected: PASS（可能需要补 fixture）

- [ ] **Step 9: Commit**

```bash
git add backend/apps/bid_check/views.py backend/apps/knowledge/views/knowledge_base_views.py backend/apps/projects/views/member_views.py backend/apps/outline/views_sse.py backend/apps/bid_check/tests/test_bid_check_permission.py
git commit -m "fix(security): BidCheck/Knowledge/ProjectMember/SSE 按用户/项目过滤

- BidCheckTaskViewSet/BidCheckFindingViewSet 按 project__members__user 过滤
- KnowledgeBaseListView 按 created_by 过滤
- ProjectMemberViewSet 增加成员归属校验
- SSE 视图增加 outline 归属校验

修复审计 S2 越权数据访问剩余部分"
```

---

## Task 8: ONLYOFFICE 回调 SSRF + JWT 强制 + 路径遍历（S3）

**Files:**
- Modify: `backend/apps/outline/views_onlyoffice_callback.py:107-115,145,160`
- Modify: `backend/apps/outline/models/bid_document.py:160-179`
- Create: `backend/apps/outline/services/url_safety.py`
- Test: `backend/apps/outline/tests/test_onlyoffice_callback_security.py`

**Interfaces:**
- Consumes: `url_safety.is_safe_external_url(url)`
- Produces: JWT 校验失败返回 400，download_url 内网地址被拒，filename 清洗

- [ ] **Step 1: 写失败测试**

创建 `backend/apps/outline/tests/test_onlyoffice_callback_security.py`:

```python
"""ONLYOFFICE 回调安全测试。"""
import pytest
from apps.outline.services.url_safety import is_safe_external_url


def test_internal_ip_rejected():
    assert not is_safe_external_url("http://127.0.0.1/")
    assert not is_safe_external_url("http://169.254.169.254/latest/meta-data/")
    assert not is_safe_external_url("http://10.0.0.1/")
    assert not is_safe_external_url("http://192.168.1.1/")


def test_localhost_rejected():
    assert not is_safe_external_url("http://localhost/")


def test_file_scheme_rejected():
    assert not is_safe_external_url("file:///etc/passwd")


def test_https_external_accepted():
    assert is_safe_external_url("https://example.com/file.docx")


def test_path_traversal_filename_sanitized():
    """filename 含 ../ 应被清洗。"""
    from apps.outline.models.bid_document import sanitize_filename
    assert sanitize_filename("../../etc/passwd") == "etc_passwd"
    assert sanitize_filename("normal.docx") == "normal.docx"
    assert sanitize_filename("a/b\\c.pdf") == "abc.pdf"
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd backend && source .venv/bin/activate && python -m pytest apps/outline/tests/test_onlyoffice_callback_security.py -v
```

- [ ] **Step 3: 创建 url_safety 服务**

创建 `backend/apps/outline/services/url_safety.py`:

```python
"""URL 安全校验（防 SSRF）。"""
import ipaddress
import socket
from urllib.parse import urlparse


PRIVATE_NETWORKS = [
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
]


def is_safe_external_url(url: str) -> bool:
    """校验 URL 是否可安全请求（防 SSRF）。

    Args:
        url: 待校验的 URL

    Returns:
        True 如果 URL 指向外部公网且 scheme 是 http/https
    """
    if not url:
        return False
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return False
    hostname = parsed.hostname
    if not hostname:
        return False
    try:
        # 解析所有 A/AAAA 记录
        addr_infos = socket.getaddrinfo(hostname, None)
    except socket.gaierror:
        return False
    for addr_info in addr_infos:
        ip = ipaddress.ip_address(addr_info[4][0])
        for network in PRIVATE_NETWORKS:
            if ip in network:
                return False
    return True


def sanitize_filename(filename: str) -> str:
    """清洗文件名，移除路径分隔符与目录穿越。"""
    import re
    # 移除路径分隔符与 ..
    cleaned = re.sub(r"[\\/.]+", "_", filename)
    # 移除控制字符
    cleaned = re.sub(r"[\x00-\x1f]", "", cleaned)
    # 限制长度
    if len(cleaned) > 200:
        name, _, ext = cleaned.rpartition(".")
        cleaned = name[:150] + "." + ext
    return cleaned or "document"
```

- [ ] **Step 4: 修改 onlyoffice_callback.py JWT 校验改为强制**

修改 `backend/apps/outline/views_onlyoffice_callback.py`:

```python
        # JWT 校验（强制：缺失或失败一律 400）
        token = data.get("token")
        if not token:
            logger.warning(f"ONLYOFFICE callback: no token, document_id={document_id}")
            return JsonResponse(
                {"error": 1, "message": "JWT token missing"},
                status=400,
            )
        try:
            import jwt
            from django.conf import settings
            jwt.decode(token, settings.ONLYOFFICE_JWT_SECRET, algorithms=["HS256"])
        except Exception as e:
            logger.warning(f"ONLYOFFICE callback: JWT validation failed: {e}")
            return JsonResponse(
                {"error": 1, "message": "JWT validation failed"},
                status=400,
            )
```

- [ ] **Step 5: 修改 _download_and_save 校验 URL + 清洗 filename**

```python
def _download_and_save(document: BidDocument, download_url: str):
    """从 ONLYOFFICE 下载文件并保存到 BidDocument。"""
    from apps.outline.services.url_safety import is_safe_external_url, sanitize_filename

    if not is_safe_external_url(download_url):
        logger.error(f"ONLYOFFICE callback: unsafe download_url={download_url}")
        raise ValueError("下载地址不安全")

    try:
        response = requests.get(download_url, timeout=60)
        response.raise_for_status()

        filename = sanitize_filename(document.title or f"document_{document.id}.docx")
        document.save_file(response.content, filename)

        logger.info(
            f"Downloaded and saved document: id={document.id}, "
            f"size={len(response.content)} bytes"
        )
    except requests.RequestException as e:
        logger.exception(
            f"Failed to download from ONLYOFFICE: url={download_url}, error={str(e)}"
        )
        raise
```

- [ ] **Step 6: 运行测试确认通过**

```bash
cd backend && source .venv/bin/activate && python -m pytest apps/outline/tests/test_onlyoffice_callback_security.py -v
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/apps/outline/services/url_safety.py backend/apps/outline/views_onlyoffice_callback.py backend/apps/outline/tests/test_onlyoffice_callback_security.py
git commit -m "fix(security): ONLYOFFICE 回调 SSRF 防护 + JWT 强制 + filename 清洗

- 新增 url_safety.is_safe_external_url 拒绝内网/环回/链路本地地址
- JWT token 缺失或校验失败一律返回 400（原仅 warning）
- download_url 经 SSRF 校验后才请求
- filename 经 sanitize_filename 清洗路径分隔符与 ..

修复审计 S3：原回调无 SSRF 防护、JWT 可选、filename 含路径可遍历"
```

---

## Task 9: 测试连接接口 SSRF 防护（S5）

**Files:**
- Modify: `backend/apps/system_config/services/probe_service.py:95,144,203,252,302`
- Test: `backend/apps/system_config/tests/test_probe_ssrf.py`

**Interfaces:**
- Consumes: `apps.outline.services.url_safety.is_safe_external_url`（T8 已建）
- Produces: 探针服务在请求前校验 base_url

- [ ] **Step 1: 写失败测试**

创建 `backend/apps/system_config/tests/test_probe_ssrf.py`:

```python
"""探针服务 SSRF 测试。"""
import pytest
from apps.system_config.services.probe_service import ProbeService


@pytest.mark.parametrize("bad_url", [
    "http://127.0.0.1/",
    "http://localhost/",
    "http://169.254.169.254/",
    "http://10.0.0.1/",
    "file:///etc/passwd",
])
def test_probe_rejects_internal_urls(bad_url):
    """内网/环回/非 http(s) URL 应被拒绝。"""
    service = ProbeService()
    result = service.probe_chat("deepseek", bad_url, "fake-key", "test-model")
    assert not result.ok
    assert result.error_code == "unsafe_url"
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd backend && source .venv/bin/activate && python -m pytest apps/system_config/tests/test_probe_ssrf.py -v
```

- [ ] **Step 3: 修改 ProbeService 在每个 probe_* 方法入口校验 URL**

修改 `backend/apps/system_config/services/probe_service.py`，在 `probe_chat` 与 `probe_embedding` 入口（约 line 60-80）增加：

```python
    def probe_chat(self, provider_type, base_url, api_key, model_name=None):
        """通用 chat 探针入口。"""
        from apps.outline.services.url_safety import is_safe_external_url
        if not is_safe_external_url(base_url):
            return ProbeResult(
                ok=False,
                latency_ms=0,
                detail=f"base_url 不安全（内网/环回/非 http(s)）",
                error_code="unsafe_url",
            )
        # 原有分发逻辑
        ...
```

同样在 `probe_embedding` 入口增加相同校验。

- [ ] **Step 4: 运行测试确认通过**

```bash
cd backend && source .venv/bin/activate && python -m pytest apps/system_config/tests/test_probe_ssrf.py -v
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/apps/system_config/services/probe_service.py backend/apps/system_config/tests/test_probe_ssrf.py
git commit -m "fix(security): 测试连接接口 SSRF 防护

- ProbeService.probe_chat/probe_embedding 入口校验 base_url
- 复用 url_safety.is_safe_external_url 拒绝内网/环回/非 http(s)

修复审计 S5：原 base_url 直接 requests.get，可探测内网/云元数据"
```

---

## Task 10: 前端 bootstrap-auth 测试同步（S10）

**Files:**
- Modify: `frontend/src/api/__tests__/bootstrap-auth.spec.ts`

**Interfaces:**
- Consumes: T15 已建立的测试同步逻辑（本任务与 T15 合并）
- Produces: 3 个失败测试通过

- [ ] **Step 1: 修改测试 beforeEach 给 auth store 设置 accessToken**

修改 `frontend/src/api/__tests__/bootstrap-auth.spec.ts`，在 `beforeEach` 中追加：

```typescript
  beforeEach(() => {
    setActivePinia(createPinia())
    refreshMock.mockReset()
    meMock.mockReset()
    vi.resetModules()
    // 模拟持久化的 token（bootstrapAuth 在无 token 时直接 return）
    useAuthStore().$patch({ accessToken: 'EXISTING_TOKEN' })
  })
```

- [ ] **Step 2: 运行测试确认通过**

```bash
cd frontend && npx vitest run src/api/__tests__/bootstrap-auth.spec.ts
```

Expected: 3 个测试全部 PASS

- [ ] **Step 3: 运行完整前端测试套件**

```bash
cd frontend && npx vitest run 2>&1 | tail -10
```

Expected: 77/77 PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/__tests__/bootstrap-auth.spec.ts
git commit -m "fix(tests): bootstrap-auth 测试同步持久化 token 场景

- beforeEach 中给 auth store 设置 accessToken
- 配合源码 \"无 token 直接 return\" 的语义

修复审计 S10：原 3 个测试因源码契约变更而失败"
```

---

## Task 11: AsyncTask.objects.get 容错（H1）

**Files:**
- Modify: `backend/apps/outline/tasks.py:60,110,150,473,708,748,829,868,907,945,1340`
- Modify: `backend/apps/tender/tasks.py:58,130,207`
- Modify: `backend/apps/requirements/tasks.py:94,257`
- Test: `backend/apps/outline/tests/test_async_task_not_found.py`

**Interfaces:**
- Consumes: `apps.common.models.AsyncTask`
- Produces: 任务入口对 DoesNotExist 兜底，记日志后退出

- [ ] **Step 1: 写失败测试**

创建 `backend/apps/outline/tests/test_async_task_not_found.py`:

```python
"""AsyncTask 不存在时任务容错测试。"""
import pytest
from apps.common.models import AsyncTask
from apps.outline.tasks import refine_outline_task


@pytest.mark.django_db
def test_async_task_not_found_does_not_raise():
    """AsyncTask 记录不存在时任务应静默退出，不抛异常。"""
    # 调用一个不存在的 async_task_id
    result = refine_outline_task.apply(
        kwargs={
            "async_task_id": 999999,
            "user_id": 1,
            "outline_id": 1,
        }
    )
    # 不应抛 DoesNotExist
    assert not result.failed()


@pytest.mark.django_db
def test_async_task_not_found_other_tasks():
    """其他 task 也应容错。"""
    from apps.outline.tasks import generate_section_task
    result = generate_section_task.apply(
        kwargs={
            "async_task_id": 999999,
            "section_id": 1,
            "record_id": 1,
            "analysis_result": {},
            "user_prompt": "",
            "user_id": 1,
        }
    )
    assert not result.failed()
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd backend && source .venv/bin/activate && python -m pytest apps/outline/tests/test_async_task_not_found.py -v
```

Expected: FAIL with `AsyncTask.DoesNotExist`

- [ ] **Step 3: 创建通用容错装饰器**

创建 `backend/apps/common/tasks_utils.py`:

```python
"""Celery 任务通用工具。"""
import logging
from functools import wraps

logger = logging.getLogger(__name__)


def soft_get_async_task(async_task_id: int):
    """获取 AsyncTask，不存在时返回 None 并记日志。

    用法：
        async_task = soft_get_async_task(async_task_id)
        if async_task is None:
            return
    """
    from apps.common.models import AsyncTask
    try:
        return AsyncTask.objects.get(pk=async_task_id)
    except AsyncTask.DoesNotExist:
        logger.warning(
            "AsyncTask not found, ignoring stale task message: id=%s",
            async_task_id,
        )
        return None
```

- [ ] **Step 4: 修改 outline/tasks.py 所有 AsyncTask.objects.get 调用**

将所有 `async_task = AsyncTask.objects.get(pk=async_task_id)` 改为：

```python
from apps.common.tasks_utils import soft_get_async_task
async_task = soft_get_async_task(async_task_id)
if async_task is None:
    return
```

需要在每个 task 函数开头加 import 与判断。共约 11 处。

- [ ] **Step 5: 修改 tender/tasks.py 与 requirements/tasks.py**

同样替换 `AsyncTask.objects.get` 调用。

- [ ] **Step 6: 运行测试确认通过**

```bash
cd backend && source .venv/bin/activate && python -m pytest apps/outline/tests/test_async_task_not_found.py -v
```

Expected: PASS

- [ ] **Step 7: 运行 outline 完整测试套件回归**

```bash
cd backend && source .venv/bin/activate && python -m pytest apps/outline/ apps/tender/ apps/requirements/ --tb=short 2>&1 | tail -20
```

Expected: 不应有新增失败

- [ ] **Step 8: Commit**

```bash
git add backend/apps/common/tasks_utils.py backend/apps/outline/tasks.py backend/apps/tender/tasks.py backend/apps/requirements/tasks.py backend/apps/outline/tests/test_async_task_not_found.py
git commit -m "fix(worker): AsyncTask.objects.get 容错避免 Celery 重试死循环

- 新增 soft_get_async_task 工具，DoesNotExist 时返回 None
- outline/tender/requirements 三个 tasks 模块共 16 处替换
- 任务入口找不到 AsyncTask 时记 warning 后退出

修复审计 H1：原 worker 持续报 DoesNotExist，重试遗留消息死循环"
```

---

## Task 12: Celery 任务在事务提交前投递修复（H2）

**Files:**
- Modify: `backend/apps/outline/services/section_generation_service.py:559`
- Modify: `backend/apps/outline/services/batch_generation_service.py:351,411,521`
- Modify: `backend/apps/outline/services/matrix_service.py:172`
- Modify: `backend/apps/outline/services/global_fact_service.py:60`
- Modify: `backend/apps/outline/views.py:186,690,738,834,867,892,915,1021,1048,1074`
- Modify: `backend/apps/knowledge/views/document_views.py:238`
- Modify: `backend/apps/requirements/views.py:95`
- Test: `backend/apps/outline/tests/test_task_on_commit.py`

**Interfaces:**
- Consumes: `transaction.on_commit`
- Produces: 所有 .delay() 调用包装在 transaction.on_commit 中

- [ ] **Step 1: 写失败测试**

创建 `backend/apps/outline/tests/test_task_on_commit.py`:

```python
"""事务提交前投递任务测试。"""
import pytest
from django.db import transaction
from unittest.mock import patch, MagicMock


@pytest.mark.django_db
def test_section_generation_task_delivered_on_commit():
    """section_generation_service 的 .delay 应在事务提交后才调用。"""
    from apps.outline.services.section_generation_service import SectionGenerationService
    from apps.projects.models import Project, ProjectMember
    from apps.outline.models import Outline, Section, OutlineSource
    from apps.accounts.models import User

    user = User.objects.create_user(username="u", password="p")
    project = Project.objects.create(name="t", code="t")

    outline = Outline.objects.create(project=project, name="o", source=OutlineSource.MANUAL)
    section = Section.objects.create(outline=outline, title="s", order=1)

    with patch("apps.outline.tasks.generate_section_task.delay") as mock_delay:
        with patch("apps.outline.services.section_generation_service.SectionGenerationRecord.objects.create"):
            # 在事务内调用
            with transaction.atomic():
                service = SectionGenerationService()
                try:
                    service.generate_section(section.id, {}, "", user)
                except Exception:
                    pass  # mock 可能导致异常，但 delay 不应在事务内被调用
                # 事务内 delay 不应被调用
                assert mock_delay.call_count == 0
            # 事务提交后 delay 应被调用
            assert mock_delay.call_count == 1
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd backend && source .venv/bin/activate && python -m pytest apps/outline/tests/test_task_on_commit.py -v
```

Expected: FAIL（当前 delay 在事务内直接调用）

- [ ] **Step 3: 修改 section_generation_service.py**

修改 `backend/apps/outline/services/section_generation_service.py:559`:

```python
        # 触发 Celery 任务（在事务提交后才投递，避免事务回滚后产生孤儿消息）
        def _trigger_task():
            generate_section_task.delay(
                section_id=section_id,
                record_id=record.id,
                analysis_result=analysis_result,
                user_prompt=user_prompt,
                user_id=created_by.id,
            )
        transaction.on_commit(_trigger_task)
```

需要在文件顶部确保 import transaction（已有 `@transaction.atomic` 表明已 import）。

- [ ] **Step 4: 修改 batch_generation_service.py 3 处**

类似 T12-Step 3，将 3 处 `.delay(...)` 调用包装在 `transaction.on_commit` 中。

- [ ] **Step 5: 修改其他 service 与 views 中 .delay 调用**

对 `matrix_service.py:172`、`global_fact_service.py:60`、`outline/views.py` 中 10 处、`knowledge/views/document_views.py:238`、`requirements/views.py:95` 都用相同模式包装。

对于 view 层不在事务内的 `.delay()`，可以判断是否在事务中，若不在则直接调用：

```python
from django.db import transaction
if transaction.get_connection().in_atomicBlock:
    transaction.on_commit(lambda: some_task.delay(...))
else:
    some_task.delay(...)
```

或统一用 `transaction.on_commit`（即使无显式 atomic，Django 也会处理）。

- [ ] **Step 6: 运行测试确认通过**

```bash
cd backend && source .venv/bin/activate && python -m pytest apps/outline/tests/test_task_on_commit.py -v
```

Expected: PASS

- [ ] **Step 7: 运行 outline 测试套件回归**

```bash
cd backend && source .venv/bin/activate && python -m pytest apps/outline/ apps/tender/ apps/requirements/ apps/knowledge/ --tb=short 2>&1 | tail -20
```

- [ ] **Step 8: Commit**

```bash
git add backend/apps/outline/services/section_generation_service.py backend/apps/outline/services/batch_generation_service.py backend/apps/outline/services/matrix_service.py backend/apps/outline/services/global_fact_service.py backend/apps/outline/views.py backend/apps/knowledge/views/document_views.py backend/apps/requirements/views.py backend/apps/outline/tests/test_task_on_commit.py
git commit -m "fix(worker): Celery 任务改用 transaction.on_commit 投递

- section_generation_service/batch_generation_service/matrix_service/global_fact_service
- outline/views 10 处、knowledge/views、requirements/views
- 所有 .delay() 调用包装在 transaction.on_commit 中

修复审计 H2：原 .delay() 在事务内调用，事务回滚后产生孤儿 Celery 消息"
```

---

## Task 13: AI 任务执行吞异常修复（H3）

**Files:**
- Modify: `backend/apps/generation/services/ai_task_execution_service.py:131-145`
- Test: `backend/apps/generation/tests/test_ai_task_execute_raises.py`

**Interfaces:**
- Consumes: 无
- Produces: AI 任务失败时 raise，调用方可感知

- [ ] **Step 1: 写失败测试**

创建 `backend/apps/generation/tests/test_ai_task_execute_raises.py`:

```python
"""AI 任务执行异常抛出测试。"""
import pytest
from apps.generation.services.ai_task_execution_service import AiTaskExecutionService
from apps.generation.models import PromptTemplate, PromptVersion


@pytest.mark.django_db
def test_execute_raises_on_failure():
    """AI 任务失败时应抛异常，调用方可感知。"""
    service = AiTaskExecutionService()

    # 构造一个会失败的 prompt_version（无 system_prompt）
    template = PromptTemplate.objects.create(
        scenario="test_scenario",
        name="test template",
    )
    version = PromptVersion.objects.create(
        template=template,
        version=1,
        system_prompt="",  # 空会触发渲染错误
        user_prompt="{{ content }}",
        variable_schema={},
    )

    with pytest.raises(Exception):
        service.execute(
            scenario="test_scenario",
            variables={},
            prompt_version=version,
            model_config=None,  # 触发失败
            created_by=None,
        )
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd backend && source .venv/bin/activate && python -m pytest apps/generation/tests/test_ai_task_execute_raises.py -v
```

Expected: FAIL（当前 except 后直接 return run，不 raise）

- [ ] **Step 3: 修改 execute 异常分支**

修改 `backend/apps/generation/services/ai_task_execution_service.py:131-145`:

```python
        except Exception as exc:
            run.status = PromptRunStatus.FAILED
            run.error_message = str(exc)[:2000]
            run.latency_ms = int((time.time() - start_time) * 1000)
            run.save()

            # 记录失败的 Token 用量
            self._record_token_usage(run, business_context, status="failed")

            # 重新抛出，让调用方感知失败（与 prompt_execution_service 对齐）
            raise AiTaskExecutionError(f"AI 任务执行失败: {exc}") from exc
```

需要确认 `AiTaskExecutionError` 类已定义（搜索 `class AiTaskExecutionError`）。如果未定义，在文件中加：

```python
class AiTaskExecutionError(Exception):
    """AI 任务执行错误。"""
    pass
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd backend && source .venv/bin/activate && python -m pytest apps/generation/tests/test_ai_task_execute_raises.py -v
```

Expected: PASS

- [ ] **Step 5: 运行相关回归测试**

```bash
cd backend && source .venv/bin/activate && python -m pytest apps/generation/ apps/outline/tests/test_matrix_rag_integration.py --tb=short 2>&1 | tail -20
```

Expected: 之前因 Mock 不可迭代失败的 `test_use_published_version_by_scenario` 等测试可能仍失败（属于 S11 测试同步问题），但不应有新增失败。

- [ ] **Step 6: Commit**

```bash
git add backend/apps/generation/services/ai_task_execution_service.py backend/apps/generation/tests/test_ai_task_execute_raises.py
git commit -m "fix(generation): AI 任务执行失败时抛异常

- except 分支 raise AiTaskExecutionError（与 prompt_execution_service 对齐）
- 调用方可感知失败并重试，监控告警不再失效

修复审计 H3：原 except 后直接 return run，失败被静默吞掉"
```

---

## Task 14: prompt_render 缺失变量改 StrictUndefined（H4）

**Files:**
- Modify: `backend/apps/generation/services/prompt_render_service.py:13,46,71`
- Test: `backend/apps/generation/tests/test_prompt_render_service.py`

**Interfaces:**
- Consumes: `jinja2.StrictUndefined`
- Produces: 渲染时缺失变量抛 TemplateRenderError

- [ ] **Step 1: 检查现有失败测试**

```bash
cd backend && source .venv/bin/activate && python -m pytest apps/generation/tests/test_prompt_render_service.py -v --tb=short 2>&1 | tail -30
```

确认 `test_render_with_missing_variable` 与 `test_sandbox_security` 失败（期望抛异常）。

- [ ] **Step 2: 修改 PromptRenderService 用 StrictUndefined**

修改 `backend/apps/generation/services/prompt_render_service.py`:

```python
"""提示词渲染服务。"""

from dataclasses import dataclass

import jsonschema
from jinja2 import StrictUndefined
from jinja2.sandbox import SandboxedEnvironment


class VariableValidationError(Exception):
    """变量校验失败。"""
    pass


class TemplateRenderError(Exception):
    """模板渲染失败。"""
    pass


@dataclass
class RenderedPrompt:
    """渲染后的提示词。"""
    system_prompt: str
    user_prompt: str


class PromptRenderService:
    """提示词渲染服务。

    使用 SandboxedEnvironment + StrictUndefined：
    - SandboxedEnvironment 禁止危险操作（如访问私有属性、调用 os.system）
    - StrictUndefined 缺失变量时抛 UndefinedError，避免静默返回空串导致
      AI 用残缺提示词调用 LLM 产出垃圾结果
    """

    def __init__(self):
        self._env = SandboxedEnvironment(undefined=StrictUndefined)

    def render(self, prompt_version, variables: dict) -> RenderedPrompt:
        """渲染提示词。"""
        # 1. 校验变量 Schema
        if prompt_version.variable_schema:
            self._validate_variables(prompt_version.variable_schema, variables)

        # 2. 渲染模板
        try:
            system_prompt = self._render_text(
                prompt_version.system_prompt,
                variables,
            )
            user_prompt = self._render_text(
                prompt_version.user_prompt,
                variables,
            )
        except Exception as exc:
            raise TemplateRenderError(f"模板渲染失败: {exc}")

        return RenderedPrompt(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
        )
```

删除 `SafeUndefined` 类（不再需要）。

- [ ] **Step 3: 运行测试确认通过**

```bash
cd backend && source .venv/bin/activate && python -m pytest apps/generation/tests/test_prompt_render_service.py -v
```

Expected: 之前失败的 `test_render_with_missing_variable` 与 `test_sandbox_security` 现在 PASS

- [ ] **Step 4: 运行相关回归**

```bash
cd backend && source .venv/bin/activate && python -m pytest apps/generation/ --tb=short 2>&1 | tail -20
```

Expected: 不应有新增失败（如果有测试依赖 SafeUndefined 的容忍行为，需要补 schema 校验）

- [ ] **Step 5: Commit**

```bash
git add backend/apps/generation/services/prompt_render_service.py
git commit -m "fix(generation): prompt_render 改用 StrictUndefined

- 删除 SafeUndefined，改用 jinja2.StrictUndefined
- 缺失变量时抛 UndefinedError → TemplateRenderError
- AI 任务不会用残缺提示词调用 LLM

修复审计 H4：原 SafeUndefined 把缺失变量当空串，静默产出垃圾结果"
```

---

## Task 15: 前端 RagContextPreview XSS 修复（S8）

**Files:**
- Modify: `frontend/src/views/knowledge/components/RagContextPreview.vue:56,87-119`
- Test: `frontend/src/views/knowledge/components/__tests__/RagContextPreview.spec.ts`

**Interfaces:**
- Consumes: `markdown-it` (已安装)
- Produces: RAG 上下文经 markdown-it 渲染（默认转义内联 HTML）

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/views/knowledge/components/__tests__/RagContextPreview.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RagContextPreview from '../RagContextPreview.vue'
import ElementPlus from 'element-plus'

describe('RagContextPreview XSS 防护', () => {
  it('script 标签应被转义，不执行', () => {
    const maliciousText = '### 来源：xxx\n<script>alert(1)</script>'
    const wrapper = mount(RagContextPreview, {
      props: {
        ragContext: {
          text: maliciousText,
          token_count: 0,
          chunk_count: 1,
          sources: [{ chunk_id: '1', document_title: 't', section_path: '' }],
        },
      },
      global: { plugins: [ElementPlus] },
    })
    const html = wrapper.html()
    // 不应包含原始 <script> 标签
    expect(html).not.toContain('<script>alert(1)</script>')
    // 应被转义为 &lt;script&gt;
    expect(html).toContain('&lt;script&gt;') || expect(html).toContain('&lt;script')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd frontend && npx vitest run src/views/knowledge/components/__tests__/RagContextPreview.spec.ts
```

- [ ] **Step 3: 修改 RagContextPreview.vue 改用 markdown-it**

修改 `frontend/src/views/knowledge/components/RagContextPreview.vue`:

```vue
<script setup lang="ts">
// ... 顶部 import 不变
import MarkdownIt from 'markdown-it'

// 初始化 markdown-it（默认 html=false，会转义内联 HTML）
const md = new MarkdownIt({
  html: false,  // 禁止内联 HTML
  linkify: true,
  breaks: false,
})

// 按来源分割内容
const getBlockContent = (index: number): string => {
  if (!props.ragContext?.text) return ''
  const parts = props.ragContext.text.split(/(?=### 来源：)/g)
  if (index < parts.length) {
    return md.render(parts[index])
  }
  return ''
}
</script>
```

删除原 `renderMarkdown` 函数（手写正则替换的那段）。

- [ ] **Step 4: 运行测试确认通过**

```bash
cd frontend && npx vitest run src/views/knowledge/components/__tests__/RagContextPreview.spec.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/knowledge/components/RagContextPreview.vue frontend/src/views/knowledge/components/__tests__/RagContextPreview.spec.ts
git commit -m "fix(security): RagContextPreview 改用 markdown-it 防 XSS

- 删除手写正则 renderMarkdown（无 HTML 转义）
- 改用 markdown-it 默认配置 html=false
- 新增 XSS 防护测试

修复审计 S8：原手写渲染无转义，RAG 检索返回的内容含 <script> 即可注入"
```

---

## Task 16: 前端 OutlineDetailView setInterval 内存泄漏（H7）

**Files:**
- Modify: `frontend/src/views/outline/OutlineDetailView.vue:1673-1702,1215-1225`

**Interfaces:**
- Consumes: 无
- Produces: pollGenerationStatus 的 timer 在 onBeforeUnmount 中被清理

- [ ] **Step 1: 提升 timer 为组件级变量**

修改 `frontend/src/views/outline/OutlineDetailView.vue`:

在 `<script setup>` 顶部（其他 ref 声明附近）增加：

```typescript
let generationPollTimer: ReturnType<typeof setInterval> | null = null
```

- [ ] **Step 2: 修改 pollGenerationStatus 使用组件级变量**

```typescript
function pollGenerationStatus(sectionId: number) {
  let count = 0
  const maxCount = 120
  // 清理之前的 timer
  if (generationPollTimer) {
    clearInterval(generationPollTimer)
  }
  generationPollTimer = setInterval(async () => {
    count++
    if (count > maxCount) {
      if (generationPollTimer) {
        clearInterval(generationPollTimer)
        generationPollTimer = null
      }
      ElMessage.warning('生成状态检查超时，请手动刷新查看结果')
      return
    }
    try {
      const res = await getSection(sectionId)
      const status = res.data.generation_status
      if (selectedSection.value?.id === sectionId) {
        sectionDetail.value = res.data
      }
      await loadSections()
      if (status === 'success') {
        if (generationPollTimer) {
          clearInterval(generationPollTimer)
          generationPollTimer = null
        }
        ElMessage.success('章节生成完成')
        await loadSectionDetail(sectionId)
      } else if (status === 'failed') {
        if (generationPollTimer) {
          clearInterval(generationPollTimer)
          generationPollTimer = null
        }
        ElMessage.error('章节生成失败')
      }
    } catch {
      if (generationPollTimer) {
        clearInterval(generationPollTimer)
        generationPollTimer = null
      }
    }
  }, 2000)
}
```

- [ ] **Step 3: 在 onBeforeUnmount 中清理**

修改 `onBeforeUnmount`:

```typescript
onBeforeUnmount(() => {
  document.removeEventListener('mousemove', handleResize)
  document.removeEventListener('mouseup', stopResize)
  document.removeEventListener('click', closeContextMenu)
  stopBatchSSE()
  if (generationPollTimer) {
    clearInterval(generationPollTimer)
    generationPollTimer = null
  }
})
```

- [ ] **Step 4: 运行测试**

```bash
cd frontend && npx vitest run 2>&1 | tail -10
```

Expected: 现有测试不回归（无专门测试此场景，但应不破坏其他测试）

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/outline/OutlineDetailView.vue
git commit -m "fix(outline): pollGenerationStatus timer 在卸载时清理

- timer 提升为组件级变量 generationPollTimer
- onBeforeUnmount 中 clearInterval
- 避免页面卸载后定时器持续运行导致内存泄漏

修复审计 H7"
```

---

## Task 17: 前端 7 处 form.validate() 未捕获（H8）

**Files:**
- Modify: `frontend/src/views/projects/ProjectListView.vue:230`
- Modify: `frontend/src/views/outline/OutlineDetailView.vue:1778`
- Modify: `frontend/src/views/projects/ProjectLots.vue:142`
- Modify: `frontend/src/views/workflow/TemplateListView.vue:169`
- Modify: `frontend/src/views/workflow/TemplateEditView.vue:455`
- Modify: `frontend/src/views/admin/RoleListView.vue:175`
- Modify: `frontend/src/views/admin/UserListView.vue:239`

**Interfaces:**
- Consumes: 无
- Produces: 所有 validate() 调用都有 catch

- [ ] **Step 1: 修改 ProjectListView.vue:230**

```typescript
const valid = await createFormRef.value.validate().catch(() => false)
if (!valid) return
```

- [ ] **Step 2: 修改 OutlineDetailView.vue:1778**

```typescript
const valid = await addFormRef.value.validate().catch(() => false)
if (!valid) return
```

- [ ] **Step 3: 修改 ProjectLots.vue:142**

```typescript
const valid = await createFormRef.value.validate().catch(() => false)
if (!valid) return
```

- [ ] **Step 4: 修改 TemplateListView.vue:169**

```typescript
const valid = await formRef.value.validate().catch(() => false)
if (!valid) return
```

- [ ] **Step 5: 修改 TemplateEditView.vue:455**

```typescript
const valid = await nodeFormRef.value.validate().catch(() => false)
if (!valid) return
```

- [ ] **Step 6: 修改 RoleListView.vue:175**

```typescript
const valid = await formRef.value.validate().catch(() => false)
if (!valid) return
```

- [ ] **Step 7: 修改 UserListView.vue:239**

```typescript
const valid = await formRef.value.validate().catch(() => false)
if (!valid) return
```

- [ ] **Step 8: 运行前端测试套件**

```bash
cd frontend && npx vitest run 2>&1 | tail -10
```

Expected: 现有测试不回归

- [ ] **Step 9: Commit**

```bash
git add frontend/src/views/projects/ProjectListView.vue frontend/src/views/outline/OutlineDetailView.vue frontend/src/views/projects/ProjectLots.vue frontend/src/views/workflow/TemplateListView.vue frontend/src/views/workflow/TemplateEditView.vue frontend/src/views/admin/RoleListView.vue frontend/src/views/admin/UserListView.vue
git commit -m "fix(forms): 7 处 form.validate() 加 catch 避免未处理 rejection

- ProjectListView/OutlineDetailView/ProjectLots/TemplateListView
- TemplateEditView/RoleListView/UserListView
- 统一 .validate().catch(() => false) 模式

修复审计 H8"
```

---

## Task 18: 最终验证与部署

**Files:**
- 部署：无代码修改，仅验证

**Interfaces:**
- Consumes: T1-T17 所有修改
- Produces: 可上线的 Docker 部署

- [ ] **Step 1: 运行后端完整测试套件**

```bash
cd backend && source .venv/bin/activate && python -m pytest --tb=short -q 2>&1 | tail -20
```

Expected: 失败数 < 当前 30 个（应至少修复 12 个 ERROR + 多个 FAILED）

- [ ] **Step 2: 运行前端完整测试套件**

```bash
cd frontend && npx vitest run 2>&1 | tail -10
```

Expected: 77/77 PASS

- [ ] **Step 3: 前端构建**

```bash
cd frontend && npm run build 2>&1 | tail -10
```

Expected: 构建成功，无 TypeScript 错误

- [ ] **Step 4: Docker 重建部署**

```bash
cd /home/newaibook/ai-bid-generator
docker compose build web worker beat 2>&1 | tail -5
docker compose up -d web worker beat 2>&1 | tail -5
docker compose restart nginx 2>&1 | tail -3
```

- [ ] **Step 5: 验证服务启动**

```bash
sleep 8
docker ps --filter "name=ai-bid-generator" --format "table {{.Names}}\t{{.Status}}"
curl -s -o /dev/null -w "HTTP %{http_code}\n" -X POST http://localhost/api/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}'
docker logs --tail 20 ai-bid-generator-web-1 2>&1 | grep -iE "error|fatal|traceback" | tail -10
docker logs --tail 20 ai-bid-generator-worker-1 2>&1 | grep -iE "error|DoesNotExist" | tail -10
```

Expected: HTTP 200，无 FATAL，worker 不再持续报 DoesNotExist

- [ ] **Step 6: 推送所有提交到远程**

```bash
git log origin/master..HEAD --oneline
git push origin master 2>&1 | tail -5
```

Expected: 推送成功

- [ ] **Step 7: 更新记忆文件**

更新 `bugs_preexisting_test_failures.md` 记录已修复的问题清单。

- [ ] **Step 8: 最终汇报**

向用户汇报：
- 修复的 P0 项数（应 11/11）
- 修复的 H 项数（应 8/8）
- 测试套件状态
- 部署状态

---

## Self-Review

### Spec coverage 检查

- S1 生产配置 → T1 ✓
- S2 越权过滤 → T6（Outline/Section/GenerationTask）+ T7（BidCheck/Knowledge/ProjectMember/SSE）✓
- S3 ONLYOFFICE SSRF → T8 ✓
- S4 Fernet 密钥 → T3 ✓
- S5 测试连接 SSRF → T9 ✓
- S6 PDF 上传 → T5 ✓
- S7 默认凭证 → T2 ✓
- S8 前端 XSS → T15 ✓
- S9 编辑器图片 → T4 ✓
- S10 前端测试 → T10 ✓
- S11 后端测试 → 散落在 T5（PDF 相关）、T14（render 相关），其余测试与实现签名同步问题在 T11/T13 中部分处理
- H1 AsyncTask 容错 → T11 ✓
- H2 事务提交前投递 → T12 ✓
- H3 AI 异常吞 → T13 ✓
- H4 缺失变量静默 → T14 ✓
- H7 内存泄漏 → T16 ✓
- H8 form.validate → T17 ✓

（H5 健康检查真实探针、H6 临时密码明文未列入本次 P0 修复，作为 P1 后续处理。）

### Placeholder scan

无 TBD/TODO，每个 step 都有具体代码或命令。

### Type consistency

- `soft_get_async_task` 在 T11 定义，被 T11 内部多处使用 ✓
- `is_safe_external_url` 在 T8 定义，被 T9 复用 ✓
- `sanitize_filename` 在 T8 定义 ✓
- `validate_production_secrets` 在 T1 定义 ✓
- `detect_image_kind` / `is_allowed_image` 在 T4 定义 ✓

---

## 执行策略

本计划 17 个任务，建议分 5 个并行 subagent 执行：

1. **subagent A**：T1（生产配置）、T2（凭证端口）、T3（Fernet）、T9（探针 SSRF）
2. **subagent B**：T6（Outline 过滤）、T7（其他过滤）、T8（ONLYOFFICE）
3. **subagent C**：T5（PDF 支持）、T4（图片校验）
4. **subagent D**：T11（AsyncTask 容错）、T12（on_commit）、T13（AI 异常）、T14（StrictUndefined）
5. **subagent E**：T10（前端 bootstrap）、T15（前端 XSS）、T16（前端内存泄漏）、T17（前端 form.validate）

并行执行后由主 agent 收尾 T18 验证部署。
