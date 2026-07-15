# AI Bid Generator · AI 投标文件生成系统

基于 Django + Vue 3 + Celery 的企业级投标文件智能生成平台。覆盖招标文件解析、需求抽取、知识库 RAG、大纲生成、正文编排、废标检查、一致性审核、Word 导出全流程。

---

## 目录

- [一、项目简介](#一项目简介)
- [二、技术栈](#二技术栈)
- [三、目录结构](#三目录结构)
- [四、快速开始](#四快速开始)
- [五、Docker 部署（推荐）](#五docker-部署推荐)
- [六、本地开发（无 Docker）](#六本地开发无-docker)
- [七、数据库迁移与同步](#七数据库迁移与同步)
- [八、环境变量](#八环境变量)
- [九、Celery 任务队列](#九celery-任务队列)
- [十、MinIO 文件存储](#十minio-文件存储)
- [十一、ONLYOFFICE 集成](#十一onlyoffice-集成)
- [十二、种子数据初始化](#十二种子数据初始化)
- [十三、测试](#十三测试)
- [十四、二次开发指南](#十四二次开发指南)
- [十五、常见问题排查](#十五常见问题排查)
- [十六、备份与恢复](#十六备份与恢复)

---

## 一、项目简介

本系统面向工程类投标场景，核心能力：

| 模块 | 能力 |
|------|------|
| 招标文件解析 | 上传 PDF/Word，自动抽取条款、结构化分块、生成需求清单 |
| 知识库 RAG | 企业资料入库、向量化、语义检索、扣子知识库对接 |
| 大纲生成 | 三步流程（生成→审核→修订），支持目录审核与全局事实 |
| 正文编排 | 章节生成、Mermaid 配图、AI 生图、表格清理 |
| 废标检查 | 全文扫描废标条款，生成检查报告 |
| 一致性审核 | 跨章节事实/数据一致性检测，patch 模式修复 |
| Word 导出 | ONLYOFFICE 在线协同编辑 + 最终导出 |
| 工作台 | 5 阶段差异化面板，进度可视化与轮询恢复 |

---

## 二、技术栈

**后端**
- Python 3.12 + Django 5.2 + DRF 3.16
- Celery 5.4 + Redis 7（5 个命名队列）
- PostgreSQL 16 + pgvector（向量检索）
- MinIO（对象存储）
- Argon2 密码哈希、JWT 鉴权（SimpleJWT + 黑名单）

**前端**
- Vue 3.5 + TypeScript + Vite 8
- Element Plus 2.14、Pinia 3、Vue Router 5
- ECharts 6、Vue Flow（流程图）、Tiptap 3（富文本）
- OnlyOffice Document Editor Vue（在线协同）

**基础设施**
- Docker Compose 编排 8 个服务
- Nginx 反向代理 + 前端静态托管
- ONLYOFFICE Document Server（Word 协同编辑）

---

## 三、目录结构

```
ai-bid-generator/
├── backend/                       # Django 后端
│   ├── apps/                      # 业务应用（每个独立模块）
│   │   ├── accounts/              # 用户、角色、权限、JWT 鉴权
│   │   ├── projects/              # 项目、标段、成员、角色
│   │   ├── workflows/             # 工作流模板与实例
│   │   ├── tender/                # 招标文件解析、分块
│   │   ├── requirements/          # 需求抽取
│   │   ├── knowledge/             # 知识库、文档、向量、检索
│   │   ├── outline/               # 大纲、章节、正文、配图、审核
│   │   ├── generation/            # AI 模型配置、提示词模板、Provider
│   │   ├── quotation/             # 报价
│   │   ├── exporting/             # Word 导出
│   │   ├── bid_check/             # 废标检查
│   │   ├── audit/                 # 操作审计
│   │   ├── notifications/         # 通知
│   │   ├── system_config/         # 系统设置、Embedding 配置
│   │   ├── enterprise/            # 企业、材料、分包
│   │   ├── scoring/               # 评分
│   │   └── common/                # 公共服务（存储、请求缓存等）
│   ├── config/                    # 项目配置
│   │   ├── settings/               #    base.py / dev.py / prod.py / test.py
│   │   ├── celery.py               #    Celery 应用与队列路由
│   │   ├── urls.py                 #    根 URLConf
│   │   ├── wsgi.py / asgi.py
│   │   └── __init__.py
│   ├── dashboard/                  # 仪表盘 API（独立 app）
│   ├── manage.py
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── pytest.ini
│   └── conftest.py
│
├── frontend/                      # Vue 3 前端
│   ├── src/
│   │   ├── api/                   # Axios 封装的 API 模块
│   │   ├── views/                 # 页面（admin/auth/bid/dashboard/
│   │   │                          #       enterprise/knowledge/outline/
│   │   │                          #       playground/projects/tender/workflow）
│   │   ├── components/            # 通用组件
│   │   ├── composables/           # Vue 组合式函数
│   │   ├── router/                # Vue Router
│   │   ├── stores/                # Pinia stores
│   │   ├── layout/                # 布局组件
│   │   ├── utils/                 # 工具函数
│   │   ├── assets/ styles/
│   │   └── main.ts
│   ├── public/
│   ├── index.html
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── package.json
│
├── nginx/
│   └── nginx.conf                 # Nginx 配置（前端托管 + API/MinIO 反代）
│
├── docs/                          # 文档
│   ├── dev/                       # 开发文档
│   ├── superpowers/               # 能力手册
│   ├── audit-log-improvement-plan.md
│   ├── system-review-and-optimization.md
│   └── 优化需求清单.md
│
├── scripts/                      # 运维与部署脚本（详见下文）
│   ├── setup.sh                   # 首次初始化
│   ├── deploy.sh                  # Docker 重建部署
│   ├── migrate.sh                 # 容器内执行迁移
│   ├── seed_data.sh                # 种子数据
│   ├── db_backup.sh                # PostgreSQL 备份
│   ├── db_restore.sh               # PostgreSQL 恢复
│   └── dev.sh                      # 本地开发启动（无 Docker）
│
├── .env.example                   # 环境变量模板
├── .gitignore
├── docker-compose.yml              # 服务编排
├── CLAUDE.md                      # Claude Code 项目记忆
├── THIRD_PARTY_NOTICES.md         # 第三方组件声明
├── project_context.md             # 项目上下文
├── ai_tasks.md                    # 任务清单
└── README.md
```

---

## 四、快速开始

### 方式 A：Docker 一键启动（推荐）

```bash
# 1. 克隆
git clone https://github.com/dun950821-afk/ai-bid-generator.git
cd ai-bid-generator

# 2. 准备环境变量
cp .env.example .env
# 编辑 .env，把 DJANGO_SECRET_KEY 改成随机字符串
# 远程部署务必把 MINIO_PUBLIC_ENDPOINT 改成外网可达地址

# 3. 一键初始化（构建前端 + 启动容器 + 迁移 + 种子数据）
bash scripts/setup.sh
```

启动后访问 `http://localhost`。默认管理员账号：

| 用户名 | 密码 |
|--------|------|
| `admin` | `admin123` |

> 默认账号通过种子数据创建，生产环境请立即修改密码。

### 方式 B：本地开发（无 Docker）

见 [§六、本地开发](#六本地开发无-docker)。

---

## 五、Docker 部署（推荐）

### 5.1 前置要求

- Docker 24+
- Docker Compose v2
- 可用内存 ≥ 4 GB（推荐 8 GB）
- 磁盘 ≥ 20 GB

### 5.2 服务清单

| 服务 | 容器名 | 端口 | 说明 |
|------|--------|------|------|
| postgres | ai-bid-generator-postgres-1 | 5432 | PostgreSQL 16 + pgvector |
| redis | ai-bid-generator-redis-1 | 6379 | Celery broker / result backend |
| minio | ai-bid-generator-minio-1 | 9000, 9001 | 对象存储（9001 是控制台） |
| web | ai-bid-generator-web-1 | 8000 | Django + Gunicorn |
| worker | ai-bid-generator-worker-1 | - | Celery worker（5 队列） |
| beat | ai-bid-generator-beat-1 | - | Celery beat 调度器 |
| nginx | ai-bid-generator-nginx-1 | 80 | 反向代理 + 前端托管 |
| onlyoffice | onlyoffice-document-server | 8082 | Word 在线协同编辑 |

### 5.3 首次部署

```bash
cp .env.example .env
# 编辑 .env：
#   - DJANGO_SECRET_KEY=<openssl rand -base64 32 生成的随机串>
#   - DJANGO_ALLOWED_HOSTS=localhost,你的域名
#   - MINIO_PUBLIC_ENDPOINT=<外网可达 host:port>（远程部署关键）
#   - ONLYOFFICE_JWT_SECRET=<随机串>

bash scripts/setup.sh
```

`setup.sh` 做的事：
1. `cd frontend && npm install && npm run build`（构建前端到 `dist/`）
2. `docker compose build`（构建 web/worker/beat 镜像）
3. `docker compose up -d`（启动全部服务）
4. 等待 postgres 就绪后执行 `migrate`
5. 执行 `seed_data`（权限、角色、工作流模板、提示词模板、内置管理员）
6. 设置 MinIO bucket 公开下载权限

### 5.4 日常更新部署

代码更新后：

```bash
bash scripts/deploy.sh
```

`deploy.sh` 做的事（对应 [CLAUDE.md](CLAUDE.md) 的部署流程）：
1. 构建前端：`cd frontend && npm run build`
2. 重建镜像：`docker compose build web worker beat`
3. 重启服务：`docker compose up -d web worker beat`
4. 执行迁移：`docker exec ai-bid-generator-web-1 python manage.py migrate`
5. 重启 nginx：`docker compose restart nginx`（避免缓存 502）
6. 验证：检查 web 容器日志、curl 登录接口

### 5.5 单独执行迁移

新增模型/字段后只需执行迁移，无需重建镜像：

```bash
bash scripts/migrate.sh
```

等价于：
```bash
docker exec ai-bid-generator-web-1 python manage.py makemigrations
docker exec ai-bid-generator-web-1 python manage.py migrate
docker compose restart web worker beat
```

### 5.6 查看日志

```bash
# 全部
docker compose logs -f

# 单服务
docker logs -f ai-bid-generator-web-1
docker logs -f ai-bid-generator-worker-1
docker logs -f ai-bid-generator-beat-1
```

### 5.7 停止与清理

```bash
# 停止（保留数据卷）
docker compose down

# 停止并删除数据卷（⚠️ 慎用，会丢数据库与 MinIO 数据）
docker compose down -v
```

---

## 六、本地开发（无 Docker）

适用于后端调试、单元测试。

### 6.1 启动依赖服务

最小依赖：postgres + redis + minio。可以用 Docker 单独跑依赖：

```bash
docker compose up -d postgres redis minio
```

或本机安装。

### 6.2 后端

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 在项目根编辑 .env，DATABASE_URL 指向 localhost:5432
cd ..
bash scripts/dev.sh
# 或手动：
# cd backend
# python manage.py migrate
# python manage.py seed_data
# python manage.py runserver 0.0.0.0:8000
```

### 6.3 前端

```bash
cd frontend
npm install
npm run dev      # Vite dev server，默认 5173
```

`vite.config.ts` 中已配置 `/api` 代理到 `http://localhost:8000`，开发时直接访问 `http://localhost:5173`。

### 6.4 Celery（本地开发可选）

```bash
cd backend
source .venv/bin/activate
celery -A config worker -l info -Q parse_queue,kb_queue,ai_queue,export_queue,notify_queue
celery -A config beat -l info
```

---

## 七、数据库迁移与同步

### 7.1 迁移工作流

项目使用 Django 标准 migrations。**任何模型变更都必须生成迁移并提交到仓库**：

```bash
# Docker 环境
docker exec ai-bid-generator-web-1 python manage.py makemigrations
docker exec ai-bid-generator-web-1 python manage.py migrate

# 本地开发
cd backend
python manage.py makemigrations
python manage.py migrate
```

迁移文件位置：`backend/apps/<app>/migrations/`，当前共 60+ 个迁移文件，跨 17 个 app。

### 7.2 初始化新数据库

```bash
# 1. 创建库（Docker 已自动创建 bid 库，本机需要手动）
createdb -U bid bid

# 2. 启用 pgvector 扩展（向量检索必需）
docker exec ai-bid-generator-postgres-1 psql -U bid -d bid -c "CREATE EXTENSION IF NOT EXISTS vector;"

# 3. 迁移
bash scripts/migrate.sh

# 4. 种子数据
bash scripts/seed_data.sh
```

### 7.3 查看迁移状态

```bash
docker exec ai-bid-generator-web-1 python manage.py showmigrations
```

### 7.4 回滚迁移

```bash
# 回滚某个 app 到指定迁移
docker exec ai-bid-generator-web-1 python manage.py migrate <app> <migration_name>

# 例：回滚 outline 到 0014
docker exec ai-bid-generator-web-1 python manage.py migrate outline 0014
```

> ⚠️ 回滚可能丢数据，生产环境务必先备份（见 [§十六](#十六备份与恢复)）。

### 7.5 从其他环境同步数据

项目**不提供**跨环境数据同步脚本，推荐做法：

- **结构同步**：通过迁移文件（git 管理）
- **开发数据**：`pg_dump` + `pg_restore`（见 [§十六](#十六备份与恢复)）
- **种子数据**：通过 `seed_data.sh`（幂等）

### 7.6 pgvector 扩展

项目使用 pgvector 存储文档嵌入向量。新数据库必须执行：

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

迁移 `apps.knowledge.migrations.0002_add_embedding_vector` 会自动处理字段创建，但扩展本身需手动启用（PostgreSQL 权限要求）。

---

## 八、环境变量

所有环境变量在 `.env` 文件中配置（已在 `.gitignore` 中排除）。模板见 `.env.example`。

### 8.1 Django 核心

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DJANGO_SECRET_KEY` | Django 密钥，**生产必须改** | `dev-insecure-change-me` |
| `DJANGO_ALLOWED_HOSTS` | 允许的 host，逗号分隔 | `localhost,127.0.0.1` |
| `DATABASE_URL` | Postgres 连接串 | `postgres://bid:bid@localhost:5432/bid` |
| `REDIS_URL` | Redis 缓存连接串 | `redis://localhost:6379/1` |
| `CELERY_BROKER_URL` | Celery broker | `redis://localhost:6379/0` |
| `CELERY_RESULT_BACKEND` | Celery result backend | `redis://localhost:6379/0` |

### 8.2 MinIO

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `MINIO_ENDPOINT` | 内部 endpoint（容器间用服务名 `minio:9000`） | `minio:9000` |
| `MINIO_PUBLIC_ENDPOINT` | 浏览器可达地址，**远程部署必须改** | `localhost:9000` |
| `MINIO_ACCESS_KEY` | MinIO 用户名 | `minioadmin` |
| `MINIO_SECRET_KEY` | MinIO 密码 | `minioadmin` |
| `MINIO_BUCKET` | bucket 名 | `bid-files` |
| `MINIO_SECURE` | 是否 HTTPS | `false` |
| `MINIO_PROXY_ENABLED` | 是否通过 nginx 代理 MinIO | `true` |
| `MINIO_PRESIGN_EXPIRES_SECONDS` | 预签名 URL 有效期 | `3600` |

### 8.3 ONLYOFFICE

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `ONLYOFFICE_JWT_SECRET` | JWT 签名密钥，**生产必须改** | `change-this-to-a-long-random-secret` |
| `ONLYOFFICE_DOCUMENT_SERVER_URL` | ONLYOFFICE 服务地址 | `http://onlyoffice-document-server` |
| `ONLYOFFICE_PUBLIC_BASE_URL` | 浏览器可达地址 | `http://localhost:8082` |

### 8.4 Docker Compose 锚点

`docker-compose.yml` 使用 `x-backend-env: &backend-env` 锚点统一 web/worker/beat 的环境变量。容器间通过服务名互连（`postgres`、`redis`、`minio`），覆盖 `.env` 中面向宿主机的 `localhost`。

---

## 九、Celery 任务队列

### 9.1 队列路由

定义在 [backend/config/celery.py](backend/config/celery.py)：

| 队列 | 任务前缀 | 用途 |
|------|----------|------|
| `parse_queue` | `apps.tender.*`、`apps.requirements.*` | 招标文件解析 |
| `kb_queue` | `apps.knowledge.*` | 知识库文档处理、向量化 |
| `ai_queue` | `apps.outline.*`、`apps.generation.*`、`apps.bid_check.*` | 大纲生成、正文编排、废标检查 |
| `export_queue` | `apps.exporting.*` | Word 导出 |
| `notify_queue` | `apps.notifications.*` | 通知 |

### 9.2 Beat 调度

| 任务 | 周期 | 说明 |
|------|------|------|
| `flush_expired_tokens` | 每日 03:30 | 清理过期 JWT 黑名单 |
| `cleanup_stale_uploads` | 每小时 | 清理过期上传文件 |

### 9.3 排查 worker 问题

```bash
# 查看 worker 日志
docker logs -f ai-bid-generator-worker-1

# 查看 beat 日志
docker logs -f ai-bid-generator-beat-1

# 查看队列积压
docker exec ai-bid-generator-redis-1 redis-cli -n 0 LLEN celery
```

---

## 十、MinIO 文件存储

### 10.1 Bucket 权限

`bid-files` bucket 已配置为公开下载模式（`scripts/setup.sh` 自动执行）：

```bash
docker exec ai-bid-generator-minio-1 mc alias set local http://localhost:9000 minioadmin minioadmin
docker exec ai-bid-generator-minio-1 mc anonymous set download local/bid-files
```

### 10.2 文件 URL 格式

- **浏览器访问**（经 nginx 代理）：`/minio/bid-files/path/to/file`
- **外部服务访问**（如 ONLYOFFICE）：`http://<MINIO_PUBLIC_ENDPOINT>/bid-files/path/to/file`

### 10.3 存储服务使用

```python
from apps.common.services.storage import StorageService

storage = StorageService()
storage.upload_fileobj(file_obj, object_key, content_type)
storage.put_object(object_key, data_bytes, content_type)
content = storage.get_object(object_key)
exists = storage.object_exists(object_key)
```

### 10.4 MinIO 控制台

访问 `http://localhost:9001`，账号 `minioadmin` / `minioadmin`（生产环境通过 `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` 修改）。

---

## 十一、ONLYOFFICE 集成

### 11.1 配置要点

1. **文件 URL**：必须使用绝对 URL（`http://<MINIO_PUBLIC_ENDPOINT>/bid-files/...`）
2. **回调 URL**：`http://<host>/api/onlyoffice/callback/<document_id>/`
3. **JWT 认证**：`ONLYOFFICE_JWT_SECRET` 必须与 ONLYOFFICE 容器配置一致

### 11.2 Word 文档模型

```python
from apps.outline.models import BidDocument

document = BidDocument.objects.create(outline=outline, title=filename, ...)
document.save_file(content_bytes, filename)

# 用于 ONLYOFFICE（绝对 URL）
url = document.get_file_url(absolute_url=True)
# 用于浏览器（相对 URL）
url = document.get_file_url(absolute_url=False)
```

---

## 十二、种子数据初始化

### 12.1 一键执行

```bash
bash scripts/seed_data.sh
```

### 12.2 包含的命令

| 命令 | 作用 | 幂等 |
|------|------|------|
| `python manage.py sync_permissions` | 同步权限码到 Permission 表 | ✅ |
| `python manage.py seed_prompts` | 初始化内置提示词模板与模型配置 | ✅ |
| `python manage.py seed_workflow_templates` | 初始化系统工作流模板 | ✅ |
| `python manage.py seed_section_writing_templates` | 初始化章节写作模板 | ✅ |
| `python manage.py createsuperuser`（如不存在） | 创建管理员 | ✅ |

> 种子数据是幂等的，可重复执行。提示词模板的版本管理见 [§十四.4](#十四二次开发指南)。

---

## 十三、测试

### 13.1 后端测试

```bash
cd backend
source .venv/bin/activate   # 本地开发
python -m pytest --tb=short -q

# 或在 Docker 容器内
docker exec ai-bid-generator-web-1 python -m pytest --tb=short -q

# 单个 app
python -m pytest apps/outline --tb=short -q

# 生成覆盖率
python -m pytest --cov=apps --cov-report=html
```

测试配置：`backend/pytest.ini`、`backend/conftest.py`。

### 13.2 前端测试

```bash
cd frontend
npm run test        # vitest
npm run build       # vue-tsc 类型检查 + 构建
```

### 13.3 测试注意事项

- `ProjectMember.project_role` 必须使用 `ProjectRole` 实例，不能传字符串
- 公开菜单项：`dashboard`、`projects`、`templates`
- 测试 fixture 必须用 `RoleService.initialize_builtin_roles(project)` 初始化角色

---

## 十四、二次开发指南

### 14.1 新增 app / 模块

```bash
cd backend
python manage.py startapp <your_app>

# 注册到 config/settings/base.py 的 LOCAL_APPS
# 注册路由到 config/urls.py：path("api/your_app/", include("apps.your_app.urls"))
```

### 14.2 新增模型字段

```bash
# 1. 修改 apps/<app>/models/*.py

# 2. 生成迁移
docker exec ai-bid-generator-web-1 python manage.py makemigrations

# 3. 提交迁移文件到 git
git add backend/apps/<app>/migrations/

# 4. 执行迁移
docker exec ai-bid-generator-web-1 python manage.py migrate

# 5. 重建服务（如有新依赖或 settings 变更）
bash scripts/deploy.sh
```

### 14.3 新增菜单项

修改 [backend/apps/accounts/services/menu_service.py](backend/apps/accounts/services/menu_service.py) 的 `MENU_DEFINITION`，并在 [permissions_registry.py](backend/apps/accounts/permissions_registry.py) 注册对应权限码。

### 14.4 新增提示词模板

**推荐方式**：通过前端「提示词管理」页面创建并发布（走 `PromptTemplate` + `PromptVersion` 表），不要修改 `seed_prompts.py` 覆盖线上。

提示词渲染器是 **Jinja2**（非 Mustache），模板变量示例：
```
{{ chunk_context }}
{{ section_title }}
{% for item in items %}{{ item.name }}{% endfor %}
```

### 14.5 新增 Celery 任务

```python
# apps/<app>/tasks.py
from config.celery import app

@app.task
def my_task(arg):
    ...

# 路由按 app 自动匹配（见 §9.1）
# beat 调度在 config/celery.py 的 beat_schedule 中追加
```

### 14.6 新增 AI Provider

1. 在 `apps/generation/constants.py` 的 `ProviderType` 添加类型
2. 实现 `apps/generation/services/provider_client.py` 中的调用逻辑
3. 通过前端「系统设置 → AI 模型配置」添加 Provider 与模型

### 14.7 前端新增页面

```bash
# 1. 创建视图组件
frontend/src/views/<module>/<YourView>.vue

# 2. 注册路由
frontend/src/router/index.ts

# 3. 封装 API
frontend/src/api/<module>.ts

# 4. （可选）Pinia store
frontend/src/stores/<module>.ts
```

### 14.8 二次开发 Checklist

新增功能时检查：

- [ ] 后端模型/序列化器/视图/URL 是否完整
- [ ] 是否需要新 Python 依赖？→ 更新 `backend/requirements.txt`
- [ ] 是否需要数据库迁移？→ `makemigrations` + 提交迁移文件
- [ ] 前端 API/路由/组件是否完整
- [ ] 测试是否使用正确 fixture（`ProjectRole` 实例等）
- [ ] 菜单项是否需要更新？→ `menu_service.py` 的 `MENU_DEFINITION`
- [ ] 权限码是否已注册？→ `permissions_registry.py`
- [ ] 重建 Docker 镜像后验证登录正常
- [ ] 存储相关代码变更后，确保 MinIO bucket 权限正确

---

## 十五、常见问题排查

### 15.1 502 Bad Gateway

**原因**：后端容器启动失败，或 nginx 缓存了旧 upstream。

```bash
# 检查 web 日志
docker logs ai-bid-generator-web-1

# 解决
docker compose build web worker beat
docker exec ai-bid-generator-web-1 python manage.py migrate
docker compose restart nginx
```

### 15.2 数据库字段不存在 (ProgrammingError: column does not exist)

**原因**：新增模型字段但未运行迁移。

```bash
docker exec ai-bid-generator-web-1 python manage.py migrate
docker compose restart web worker beat
```

### 15.3 容器网络问题

**现象**：容器内无法解析服务名（如 `minio`、`postgres`）

```bash
docker exec ai-bid-generator-web-1 python -c "import socket; print(socket.gethostbyname('minio'))"
# 失败则重启容器
docker restart ai-bid-generator-web-1
```

### 15.4 MinIO 远端直传失败

**原因**：`MINIO_PUBLIC_ENDPOINT` 仍是默认 `localhost:9000`，浏览器预签名 URL 解析到自己机器。

**解决**：把 `.env` 中 `MINIO_PUBLIC_ENDPOINT` 改成外网可达 host:port，重启 web/worker/beat。

### 15.5 Redis SLAVEOF 攻击导致 worker 退出

**现象**：文件解析卡住，worker 日志出现 `SLAVEOF` 或主从切换提示后退出。

**原因**：6379 端口公网暴露且无密码，被攻击者通过 `SLAVEOF` 注入恶意副本。

**解决**：
1. `docker-compose.yml` 中 redis 只绑定 `127.0.0.1`
2. 配置 Redis 密码
3. 确保 worker 配置了 `restart: unless-stopped`

### 15.6 磁盘满导致 postgres 崩溃

**现象**：`df` 100%，postgres 卡在 WAL recovery 循环，登录 502 + 测试连接失败。

**解决**：清理 `~/.cache`、`/var/lib/docker` 等占用，重启 postgres。

---

## 十六、备份与恢复

### 16.1 备份

```bash
# 备份 PostgreSQL（结构 + 数据）
bash scripts/db_backup.sh

# 备份 MinIO 文件
docker run --rm -v $(pwd)/backups:/backup -v miniodata:/data \
  minio/mc:latest cp -r /data /backup/minio-$(date +%Y%m%d)
```

### 16.2 恢复

```bash
# 恢复 PostgreSQL
bash scripts/db_restore.sh backups/bid_YYYYMMDD.sql

# 恢复 MinIO
docker run --rm -v $(pwd)/backups:/backup -v miniodata:/data \
  minio/mc:latest cp -r /backup/minio-YYYYMMDD /data
```

### 16.3 仅备份结构（不含数据）

```bash
docker exec ai-bid-generator-postgres-1 pg_dump -U bid -d bid --schema-only > backups/schema.sql
```

### 16.4 仅备份种子数据

```bash
# 权限、角色、提示词模板等关键配置
docker exec ai-bid-generator-postgres-1 pg_dump -U bid -d bid \
  -t accounts_permission -t accounts_role -t accounts_role_permissions \
  -t generation_prompttemplate -t generation_promptversion \
  -t workflows_workflowtemplate -t workflows_workflownodetemplate \
  > backups/seed_data.sql
```

---

## 许可证

私有项目，未开源。详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 获取第三方组件声明。

## 相关文档

- [CLAUDE.md](CLAUDE.md) — Claude Code 项目记忆与部署细节
- [project_context.md](project_context.md) — 项目上下文
- [ai_tasks.md](ai_tasks.md) — 任务清单
- [docs/](docs/) — 开发与设计文档
