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
- [十、标书生成全流程（理解业务与修改生成逻辑必读）](#十标书生成全流程理解业务与修改生成逻辑必读)
- [十一、MinIO 文件存储](#十一minio-文件存储)
- [十二、ONLYOFFICE 集成](#十二onlyoffice-集成)
- [十三、种子数据初始化](#十三种子数据初始化)
- [十四、测试](#十四测试)
- [十五、二次开发指南](#十五二次开发指南)
- [十六、常见问题排查](#十六常见问题排查)
- [十七、备份与恢复](#十七备份与恢复)

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

最快路径：克隆 → 配置 .env → 跑 setup.sh。

```bash
# 1. 克隆
git clone https://github.com/dun950821-afk/ai-bid-generator.git
cd ai-bid-generator

# 2. 准备环境变量
cp .env.example .env
# 编辑 .env，必改 4 项（详见 §5.3）：
#   DJANGO_SECRET_KEY=<openssl rand -base64 32 生成的随机串>
#   DJANGO_ALLOWED_HOSTS=localhost,你的域名
#   MINIO_PUBLIC_ENDPOINT=<外网可达 host:port>（远程部署关键）
#   ONLYOFFICE_JWT_SECRET=<随机串>

# 3. 一键初始化（构建前端 + 启动容器 + 迁移 + 种子数据 + MinIO 权限）
bash scripts/setup.sh
```

`setup.sh` 首次运行会：构建前端 → 构建 web/worker/beat 镜像 → 启动全部 8 个服务 → 启用 pgvector → 执行数据库迁移 → 种子数据（权限/提示词/工作流/管理员）→ MinIO bucket 权限 → 重启 nginx。

启动后访问 `http://localhost`，默认管理员账号：

| 用户名 | 密码 |
|--------|------|
| `admin` | `admin123` |

> ⚠️ 默认账号由种子数据创建，**生产环境请立即修改密码**。

### 方式 B：本地开发（无 Docker）

见 [§六、本地开发](#六本地开发无-docker)。

---

## 五、Docker 部署（推荐）

### 5.1 前置要求

- Docker 24+ / Docker Compose v2
- 可用内存 ≥ 4 GB（推荐 8 GB），磁盘 ≥ 20 GB
- 端口占用要求：

| 端口 | 用途 | 绑定范围 |
|------|------|----------|
| 80 | nginx（前端 + API + MinIO 代理） | 0.0.0.0（对外） |
| 9000 | MinIO API（预签名 URL 直传） | 0.0.0.0（对外，远程部署需开放） |
| 8082 | ONLYOFFICE Document Server | 0.0.0.0（对外） |
| 5432 | PostgreSQL | 仅 127.0.0.1 |
| 6379 | Redis | 仅 127.0.0.1 |
| 9001 | MinIO 控制台 | 仅 127.0.0.1 |

> postgres/redis/MinIO 控制台只绑定本机回环地址，公网无法直接连接（Redis SLAVEOF 攻击防护见 §16.4）。

### 5.2 服务清单

| 服务 | 容器名 | 端口 | 说明 |
|------|--------|------|------|
| postgres | ai-bid-generator-postgres-1 | 5432 | PostgreSQL 16 + pgvector |
| redis | ai-bid-generator-redis-1 | 6379 | Celery broker / result backend |
| minio | ai-bid-generator-minio-1 | 9000, 9001 | 对象存储（9001 是控制台） |
| web | ai-bid-generator-web-1 | 8000 | Django + Gunicorn（gevent, 4 workers, 超时 300s） |
| worker | ai-bid-generator-worker-1 | - | Celery worker（5 队列） |
| beat | ai-bid-generator-beat-1 | - | Celery beat 调度器 |
| nginx | ai-bid-generator-nginx-1 | 80 | 反向代理 + 前端托管 |
| onlyoffice | onlyoffice-document-server | 8082 | Word 在线协同编辑 |

### 5.3 环境变量配置（.env）

所有配置通过项目根目录 `.env` 文件注入（已在 .gitignore 排除），模板见 `.env.example`。

**1. 创建并生成密钥**

```bash
cp .env.example .env
openssl rand -base64 32    # 用于 DJANGO_SECRET_KEY
openssl rand -base64 32    # 用于 ONLYOFFICE_JWT_SECRET
```

**2. 部署前必改项**（不改会导致启动失败或功能异常）：

| 变量 | 为什么必须改 | 不改的后果 |
|------|--------------|------------|
| `DJANGO_SECRET_KEY` | Django 签名密钥 | `setup.sh` 直接拒绝执行 |
| `DJANGO_ALLOWED_HOSTS` | 允许访问的域名/IP | 访问报 `DisallowedHost` 400 |
| `MINIO_PUBLIC_ENDPOINT` | 浏览器可达的 MinIO 地址 | 远程部署时文件上传/下载失败（§16.3） |
| `ONLYOFFICE_JWT_SECRET` | ONLYOFFICE 回调签名 | Word 编辑器无法打开/保存 |

**3. 完整变量表**

| 变量 | 说明 | 默认值 | 部署取值 |
|------|------|--------|----------|
| `DJANGO_SECRET_KEY` | Django 密钥 | `dev-insecure-change-me` | 随机串（必改） |
| `DJANGO_ALLOWED_HOSTS` | 允许 host，逗号分隔 | `localhost,127.0.0.1` | 域名/公网 IP（必改） |
| `DATABASE_URL` | Postgres 连接串 | `postgres://bid:bid@localhost:5432/bid` | 容器内自动覆盖为 `postgres:5432`，无需改 |
| `REDIS_URL` | Redis 缓存 | `redis://localhost:6379/1` | 容器内自动覆盖为 `redis:6379`，无需改 |
| `CELERY_BROKER_URL` | Celery broker | `redis://localhost:6379/0` | 同上 |
| `CELERY_RESULT_BACKEND` | Celery 结果后端 | `redis://localhost:6379/0` | 同上 |
| `MINIO_ENDPOINT` | MinIO 内部地址 | `minio:9000` | `minio:9000`（容器内服务名），无需改 |
| `MINIO_PUBLIC_ENDPOINT` | 浏览器可达地址 | `localhost:9000` | **外网 host:port**（必改） |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | MinIO 账号密码 | `minioadmin` / `minioadmin` | 生产建议改 |
| `MINIO_BUCKET` | bucket 名 | `bid-files` | 一般不动 |
| `MINIO_SECURE` | HTTPS 开关 | `false` | 有 HTTPS 证书时改 `true` |
| `MINIO_PROXY_ENABLED` | 经 nginx 代理 MinIO | `true` | 一般不动 |
| `MINIO_PRESIGN_EXPIRES_SECONDS` | 预签名 URL 有效期 | `3600` | 一般不动 |
| `ONLYOFFICE_JWT_SECRET` | OO JWT 密钥 | 占位串 | 随机串（必改） |
| `ONLYOFFICE_DOCUMENT_SERVER_URL` | OO 服务地址（容器间） | `http://onlyoffice-document-server` | 不动 |
| `ONLYOFFICE_PUBLIC_BASE_URL` | OO 浏览器可达地址 | `http://localhost:8082` | 域名或公网 IP |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | 数据库账号/库名 | `bid` / `bid` / `bid` | 生产建议改（仅首次建库生效） |
| `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` | MinIO root 账号 | `minioadmin` / `minioadmin` | 生产建议改 |
| `DEEPSEEK_API_KEY` 等 | AI Provider key（可选） | - | 也可在「系统设置 → AI 模型配置」界面填写 |

**4. 容器内变量覆盖说明**

`docker-compose.yml` 的 `x-backend-env` 锚点会把 web/worker/beat 的 `DATABASE_URL`、`REDIS_URL`、`CELERY_*`、`MINIO_ENDPOINT` 强制覆盖为容器间服务名（`postgres:5432`、`redis:6379`、`minio:9000`）。因此 **.env 里这几个指向 localhost 的值只在本地开发（非容器）时生效，Docker 部署无需修改**。

### 5.4 首次部署

```bash
bash scripts/setup.sh
```

`setup.sh` 逐步做了什么、失败怎么排查：

| 步骤 | 动作 | 失败排查 |
|------|------|----------|
| 0 | 检查 `.env` 存在、密钥非默认 | 报错退出，按提示修改后重跑 |
| 1 | `npm install && npm run build` 构建前端到 `frontend/dist/` | 看 node 报错；网络问题重试 |
| 2 | `docker compose build web worker beat` | 看 Docker 构建日志 |
| 3 | `docker compose up -d` 启动全部服务 | `docker compose ps` 看容器状态 |
| 4 | 等待 postgres 就绪（30s 轮询） | 超时看 `docker logs ai-bid-generator-postgres-1` |
| 5 | `CREATE EXTENSION IF NOT EXISTS vector` 启用 pgvector | 确认镜像是 `pgvector/pgvector:pg16` |
| 6 | `python manage.py migrate` 执行数据库迁移 | 见 §5.6 |
| 7 | 种子数据（权限/提示词/工作流/写作模板，幂等） | 可重跑 `bash scripts/seed_data.sh` |
| 8 | 创建默认管理员 admin/admin123（如不存在） | - |
| 9 | MinIO bucket 设为公开下载 | 手动执行 `mc anonymous set download local/bid-files` |
| 10 | `docker compose restart nginx` | - |

首次部署后检查清单：

- [ ] `docker compose ps` 全部 running
- [ ] 浏览器访问 `http://localhost` 能打开登录页
- [ ] admin/admin123 登录成功
- [ ] **立即修改默认密码**
- [ ] 远程部署：确认服务器安全组开放 80 / 9000 / 8082 端口

### 5.5 日常更新部署

代码更新后：

```bash
bash scripts/deploy.sh
```

`deploy.sh` 逐步做了什么：

| 步骤 | 动作 | 说明 |
|------|------|------|
| 1 | `cd frontend && npm run build` | 构建前端（vue-tsc 类型检查 + vite build） |
| 2 | `docker compose build web worker beat` | 重建后端镜像（安装新依赖、打包新 Python 代码） |
| 3 | `docker compose up -d web worker beat` | 用新镜像重建容器 |
| 4 | 等待 web 就绪（30s 轮询） | - |
| 5 | `python manage.py migrate` | 应用数据库迁移（新模型/字段） |
| 6 | `docker compose restart nginx` | 避免 nginx 缓存旧 upstream 导致 502 |
| 7 | `docker compose restart worker beat` | 确保加载新代码 |
| 8 | 验证：web 日志 + curl 登录接口 | 返回 400/401 = 密码被改过，属正常 |

**按改动类型选择最小部署动作**：

| 改动类型 | 最小操作 |
|----------|----------|
| 仅前端（Vue/静态资源） | `npm run build` → `docker compose restart nginx`（`frontend/dist` 由 nginx 卷挂载直接生效，**无需重建镜像**） |
| 后端 Python 代码 | `docker compose build web worker beat` → `docker compose up -d web worker beat` → `docker compose restart nginx worker beat` |
| 新增模型字段/表（有迁移文件） | 上述基础上再执行 `bash scripts/migrate.sh`（或直接 `deploy.sh` 全流程） |
| 新增 Python 依赖（requirements.txt） | 必须 `docker compose build`（依赖在镜像内安装） |
| 仅改 .env 环境变量 | `docker compose up -d`（环境变量变更需 recreate 容器） |

> ⚠️ **部署前必读：提示词存于数据库，必须备份**
>
> **提示词模板（含前端维护的所有自定义修改）存在 PostgreSQL 的 `generation_prompttemplate` / `generation_promptversion` 表里，不在代码中。** 部署本身不会丢提示词，但数据卷被删（`docker compose down -v`）、容器损坏、误回滚迁移都会丢。
>
> `seed_prompts` 是幂等的**只补缺、不覆盖**——数据库丢了之后重新 seed，只会恢复内置默认模板，**前端线上修改过的提示词无法找回**。
>
> **每次部署前先备份数据库**：
> ```bash
> bash scripts/db_backup.sh        # 全库备份（含提示词），详见 §17
> ```

### 5.6 数据库迁移

#### 5.6.1 两个命令的分工（先搞清概念）

| 命令 | 作用 | 何时执行 | 产物 |
|------|------|----------|------|
| `makemigrations` | 根据模型代码**生成迁移文件** | 仅开发时（改完模型后） | 新迁移文件，**必须提交 git** |
| `migrate` | 把迁移文件**应用到数据库** | 部署时 / 所有环境 | 数据库 schema 变更 |

> ⚠️ **部署机上只执行 `migrate`，不要执行 `makemigrations`**：迁移文件必须来自 git 仓库，才能保证各环境一致。在部署机生成迁移文件会造成环境漂移，且未提交的文件会在下次部署丢失。

#### 5.6.2 开发时：新增/修改模型

```bash
# 1. 修改模型代码（apps/<app>/models/*.py）

# 2. 本地生成迁移并应用，验证无报错
cd backend
source .venv/bin/activate
python manage.py makemigrations          # 只针对某 app：makemigrations <app>
python manage.py migrate

# 3. 检查迁移文件内容，确认符合预期
git diff backend/apps/<app>/migrations/

# 4. 提交迁移文件（不提交 = 部署时该表/字段永远建不出来）
git add backend/apps/<app>/migrations/
git commit
```

#### 5.6.3 部署时：应用迁移

```bash
# 方式一：单独执行（推荐，迁移文件已从 git 拉到部署机）
docker exec ai-bid-generator-web-1 python manage.py migrate
docker compose restart web worker beat

# 方式二：用脚本（脚本会先 makemigrations 再 migrate；
# 仓库已有迁移文件时 makemigrations 是空操作，无害）
bash scripts/migrate.sh

# 方式三：随完整部署自动执行（deploy.sh 第 5 步会自动跑 migrate）
bash scripts/deploy.sh
```

> `migrate.sh` 在容器未运行时自动降级为本地执行（`cd backend && python manage.py migrate`）。

#### 5.6.4 查看迁移状态

```bash
docker exec ai-bid-generator-web-1 python manage.py showmigrations
# [X] = 已应用   [ ] = 未应用
```

#### 5.6.5 回滚迁移

```bash
# 回滚某个 app 到指定迁移
docker exec ai-bid-generator-web-1 python manage.py migrate <app> <migration_name>
# 例：回滚 outline 到 0014
docker exec ai-bid-generator-web-1 python manage.py migrate outline 0014
```

> ⚠️ 回滚可能丢数据，生产环境务必先备份（见 [§十七](#十七备份与恢复)）。

#### 5.6.6 迁移常见错误

| 报错 | 原因 | 解决 |
|------|------|------|
| `ProgrammingError: column does not exist` | 代码引用了新字段，但迁移未执行 | `bash scripts/migrate.sh` 后重启 web/worker/beat |
| `MigrationSchemaMissing` | 库已存在但无迁移记录（如从旧库拷贝） | 使用新库（§7.2）或重建数据卷 |
| 迁移冲突（Conflicting migrations） | 多人同时改模型 | 开发时 `makemigrations --merge` 或手动调整依赖，提交修复 |

### 5.7 查看日志

```bash
# 全部
docker compose logs -f

# 单服务
docker logs -f ai-bid-generator-web-1
docker logs -f ai-bid-generator-worker-1
docker logs -f ai-bid-generator-beat-1
docker logs -f ai-bid-generator-nginx-1
```

### 5.8 停止与清理

```bash
# 停止（保留数据卷，数据不丢）
docker compose down

# 停止并删除数据卷（⚠️ 慎用！会同时删除数据库与 MinIO 全部数据，提示词等配置无法找回）
docker compose down -v
```

---

## 六、本地开发（无 Docker）

适用于后端调试、单元测试。Django 直接跑在宿主机，只把 postgres/redis/minio 跑在容器里。

### 6.1 启动依赖服务

```bash
docker compose up -d postgres redis minio
```

- postgres（pgvector 镜像）、redis、minio 由 compose 管理
- 端口 5432 / 6379 / 9001 只绑定 `127.0.0.1`，仅本机可访问

### 6.2 配置 .env（本地开发）

项目根 `.env` 已存在时，**必须覆盖一个变量**（默认值是给 Docker 容器用的）：

```bash
# .env 中：
DATABASE_URL=postgres://bid:bid@localhost:5432/bid   # ✓ 默认已是 localhost，无需改
REDIS_URL=redis://localhost:6379/1                    # ✓ 默认已是 localhost，无需改
MINIO_ENDPOINT=localhost:9000                         # ⚠️ 必须改！默认 minio:9000 是容器内服务名，宿主机解析不了
MINIO_PUBLIC_ENDPOINT=localhost:9000                  # ✓ 本机开发默认即可
```

> Django 通过 django-environ 直接读项目根 `.env`；容器间服务名（`minio:9000`、`postgres`）在宿主机上无法解析，不改会连不上 MinIO/数据库。

### 6.3 后端

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 首次：迁移 + 种子数据
python manage.py migrate
python manage.py sync_permissions
python manage.py seed_prompts
python manage.py seed_workflow_templates
python manage.py seed_section_writing_templates

# 启动开发服务器
python manage.py runserver 0.0.0.0:8000
```

或用一键脚本（自动起依赖容器 + venv + 迁移 + 种子 + runserver）：

```bash
bash scripts/dev.sh
```

> 注意：容器内跑过的迁移不会同步到本地库——本地开发环境要**单独**跑 migrate / seed_data。

### 6.4 前端

```bash
cd frontend
npm install
npm run dev      # Vite dev server，默认 5173
```

`vite.config.ts` 已配置 `/api` 代理到 `http://localhost:8000`，开发时直接访问 `http://localhost:5173`。

类型检查与产物构建：

```bash
npm run build    # vue-tsc 类型检查 + vite build（部署前本地验证用）
```

### 6.5 Celery（本地开发可选）

需要异步任务（解析、生成、导出）时：

```bash
cd backend
source .venv/bin/activate
celery -A config worker -l info -Q parse_queue,kb_queue,ai_queue,export_queue,notify_queue
celery -A config beat -l info   # 另一个终端
```

### 6.6 测试

```bash
cd backend
source .venv/bin/activate
python -m pytest --tb=short -q
```

---

## 七、数据库迁移与同步

> 迁移的完整指南（概念分工、开发/部署流程、回滚、常见错误）见 [§5.6](#56-数据库迁移)。本章补充初始化新库、跨环境同步等场景。

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

> ⚠️ 回滚可能丢数据，生产环境务必先备份（见 [§十七](#十七备份与恢复)）。

### 7.5 从其他环境同步数据

项目**不提供**跨环境数据同步脚本，推荐做法：

- **结构同步**：通过迁移文件（git 管理）
- **开发数据**：`pg_dump` + `pg_restore`（见 [§十七](#十七备份与恢复)）
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

## 十、标书生成全流程（理解业务与修改生成逻辑必读）

> 本章是系统业务流转的核心文档。修改任何生成逻辑前，先通过本章定位对应函数与 LLM 场景（scenario），再动手。
> 所有 LLM 调用统一走 `AiTaskExecutionService().execute(scenario, variables, ...)`（`apps/generation/services/ai_task_execution_service.py`），场景模板在 `generation_prompttemplate` / `generation_promptversion` 表（前端「提示词管理」维护，见 [§十五.4](#十五二次开发指南)）。

### 10.1 端到端主链路

```
上传招标文件（TenderFile: UPLOADING）
  → 解析（ParseService，规则实现，无 LLM；PARSING → PARSED）
  → 分块（ChunkService，规则实现，无 LLM；PARSED → CHUNKED）
  → 需求提取（6 类场景并行，LLM；CHUNKED → REQUIREMENT_EXTRACTED）
  → 标段级需求去重（规则 + 向量 + LLM 仲裁 requirement_dedup_arbitration）
  → 大纲生成（两步：需求分组 outline_requirement_groups → 逐大类子目录 outline_children；GENERATING → DRAFT）
  → 目录审核与修订（outline_review → refine_outline，审核闭环）
  → 内容矩阵（content_matrix_generation_v2；PENDING → GENERATING → GENERATED）
  → 章节批量生成（chord 并发，每章：规划 → 生成 → 解析 → 后处理 → 校验 → 修订 → 保存 → 内联扩写）
  → 批量收尾链（一致性审计 consistency_audit → 字数扩写 section_expand → 表格清理 table_cleanup
                  → Mermaid 配图 mermaid_illustration → AI 生图 image_generation）
  → Word 导出（BidDocxBuilder → BidDocument 存 MinIO，ONLYOFFICE 在线编辑）
```

### 10.2 阶段详解

#### 10.2.1 招标文件解析（无 LLM）

| 步骤 | 入口 | 调用链 | 状态流转 |
|------|------|--------|----------|
| 上传 | `InitUploadView.post` → `TenderUploadService.init_upload` | MinIO presigned POST | TenderFile: UPLOADING |
| 完成上传 | `CompleteUploadView.post` → `complete_upload` → `enqueue_parse_task` | 创建 `AsyncTask(task_type="tender_parse")`，on_commit 后投递 `parse_tender_file`（parse_queue） | PARSE_PENDING |
| 解析 | `parse_tender_file`（`apps/tender/tasks.py:57`） | `ParseService` 规则解析 | PARSING → PARSED（progress 5→35） |
| 分块 | `chunk_parsed_document`（:130） | `ChunkService` 规则分块 | PARSED → CHUNKED（progress 40→65） |
| 需求提取衔接 | `extract_requirements_v2`（`apps/requirements/tasks.py:39`） | 见 10.2.2 | CHUNKED → REQUIREMENT_EXTRACTED（progress 65→100） |

PipelineJob（`pipeline_job.py`）按 stage 记录每步：`parse → chunk → requirement_extract → embedding`。解析与分块均为规则实现，**不产生任何 LLM 调用**，LLM 从需求提取开始。

#### 10.2.2 需求提取与去重

**编排**：`extract_requirements_v2` → `RequirementExtractService.extract_requirements` → `ExtractionOrchestrator.run`（`apps/requirements/services/extraction/orchestrator.py`）

Orchestrator 五阶段：

1. `validate` — 校验 TenderFile 与提取类型
2. `prepare` — 清旧条款、创建/复用 `RequirementExtractionRun`、按类型构建上下文
3. `extract` — **ThreadPoolExecutor 最多 6 线程并行**，每类一个 `SingleTypeExtractor.extract`
4. `aggregate` — 按请求顺序聚合
5. `finalize` — 写终态 + `activate()` 置当前版本（事务 + select_for_update 并发保护）

**LLM 场景**（按提取类型）：`requirement_extraction_scoring` / `mandatory` / `qualification` / `commercial` / `technical` / `submission`（`apps/requirements/constants.py` 的 `TYPE_TO_SCENARIO`）。单类型内部：AI 调用（重试 `MAX_AI_ATTEMPTS=2`）→ 输出模式兼容解析 → `MisclassificationFilter` 三级过滤（hard 丢弃 / suspected 软标）→ `RequirementWriter` 落库。

**状态流转**：`RequirementExtractionRun: PENDING → RUNNING → SUCCESS / PARTIAL_SUCCESS / FAILED / CANCELLED`。任务完成后自动触发标段级去重：`deduplicate_lot_requirements_task` → `RequirementDedupService.run`（规则层标题归一化+内容哈希 → 向量层 embedding 余弦（失败降级）→ 聚簇 → **LLM 仲裁 `requirement_dedup_arbitration`**（失败走确定性兜底：来源权威性 > evidence > 长度 > id）→ KEPT/DUPLICATE 标记）。

#### 10.2.3 大纲生成与审核

**入口**：AI 大纲 action → `AsyncTask(task_type="generate_outline")` → `generate_outline_task`（`apps/outline/tasks.py:1571`）→ `OutlineReviewService.generate_with_review`（`services/outline_review_service.py:175`）

两步生成：

1. `_extract_requirement_groups` — 优先复用已抽取的 `TenderRequirement(scoring)`；没有则调 **`outline_requirement_groups`**
2. `_generate_aligned_outline` — 逐评分大类调 **`outline_children`** 生成二三级子目录，校验 `MIN_OUTLINE_DEPTH=3`

落库：`_save_outline_tree` 递归写 Section；Outline 状态 `GENERATING → DRAFT`；失败时无章节则删除草稿、有章节则改 DRAFT 保留。

**审核闭环**（手动触发）：
- `review_outline` — `_extract_requirement_groups` → `_build_outline_tree` → **`outline_review`** → `_save_review_result`（review_status = passed/failed + review_suggestions）
- `force_pass` — 直接置 passed + `review_overridden=true`
- `refine_outline_task` → `refine_with_suggestions` — 按建议重跑生成 → `_diff_outline` 出 added/removed/new_tree 供前端预览 → 确认后 `apply_refine` 覆盖章节树并迁移已编辑内容（超时上限 `refine_outline_timeout_seconds` 队列参数）

**全局事实**（可选，前置于正文生成）：`extract_global_facts_task` → `run_global_fact_extraction` — 五轮 `global_fact_extract` → `global_fact_merge` → `global_fact_supplement` → `global_fact_finalize`。状态：`PENDING → EXTRACTING → MERGING → SUPPLEMENTING → FINALIZING → SUCCESS/FAILED`。

#### 10.2.4 内容矩阵生成

**入口**：`MatrixService.start_matrix_generation`（`services/matrix_service.py:98`）——残留 GENERATING 章节重置 PENDING、旧 RUNNING 任务置 CANCELLED → 创建 `GenerationTask(MATRIX_GENERATION)` → `generate_content_matrix_task.delay`

**任务内部**（`tasks.py:1855`）：取锁（`acquire_matrix_generation_lock` / `steal_stale_lock`）→ `get_matrix_generation_targets` 章节置 GENERATING → 变量：招标要求摘要 + `RetrievalOrchestrator.collect_metadata_snapshot` 公司材料元数据 → **分批**（`matrix_generation_batch_size` 默认 10）逐批调 **`content_matrix_generation_v2`** → `validate_matrix_output` → `enrich_section_references` → `update_section_matrix`。单批失败不阻断，缺失章节标 FAILED。

**状态流转**：`ContentMatrixStatus: PENDING → GENERATING → GENERATED / FAILED`（EDITED 由用户编辑置位）；取消时 GENERATING 恢复 PENDING。

#### 10.2.5 章节批量生成（chord 并发）

**创建**：`BatchGenerationService.create_batch_task`（`services/batch_generation_service.py:270`）——防重（select_for_update）→ `precheck`（仅矩阵 GENERATED/EDITED 章节可生成）→ `calculate_generation_order`（**叶子优先**：leaf_depth 降序 + 依赖批次）→ 建 `GenerationTask` + `BatchGenerationTaskItem`（冻结 sort_index）+ Section `content_generation_status=PENDING`

**派发**：`start_batch_generation` 置 RUNNING → `batch_section_generation_task.delay` → 任务内 `chord(group(generate_single_section_for_batch.s(sid, task_id)))(on_batch_complete.s(task_id))`；派发失败 → 子项 failed + 任务 FAILED

**子任务** `generate_single_section_for_batch`（`tasks.py:655`）：
1. item pending → running；创建 `SectionGenerationRecord(async_task=None)`（批量内不建独立 AsyncTask，避免队列堆积废弃书签）
2. `_execute_single_section_generation`（完整内部流转见 10.2.6）
3. 成功后 `_inline_expand_section`（字数不足当场扩写，见 10.2.6）
4. item success（记 word_count / generation_meta.inline_expand）/ failed
5. 瞬时 DB 错误自动重试（`batch_section_max_retries`，指数退避）；**绝不向 chord 抛异常**

**回调** `on_batch_complete`（`tasks.py:800`）依次触发：
1. `_finalize_batch_task` — 统计 → 终态：全成功 `COMPLETED`、0 成功 `FAILED`、否则 `PARTIAL_SUCCESS`；COMPLETED/PARTIAL_SUCCESS 时**自动触发一致性审计** `consistency_audit_task`
2. 字数扩写 `expand_sections_task`（多轮兜底，`MAX_EXPAND_ROUNDS=2`）
3. 表格清理 `table_cleanup_outline_task`（先于配图，避免配图误用低质量表格）
4. Mermaid 配图 `mermaid_illustration_task`
5. AI 生图 `image_generation_task`

**GenerationTask 状态机**（`constants.py:215`）：

```
PENDING → RUNNING →（PAUSE_REQUESTED → PAUSED ｜ CANCEL_REQUESTED → CANCELLED）→ COMPLETED / FAILED / PARTIAL_SUCCESS
```

暂停/恢复/取消/重试失败章节：`pause_task` / `resume_task` / `cancel_task` / `retry_failed`（`batch_generation_service.py`）。

#### 10.2.6 单章生成内部流转（先生成、再校验）

单章（`generate_section_task`）与批量（`_execute_single_section_generation`，`tasks.py:1281`）两路径一致，完整流转：

```
① prepare_generation_context（section_generation_service.py:276）
    GenerationModeService.get_generation_mode（模式决策）
    → RetrievalOrchestrator.retrieve_for_section（RAG 检索，knowledge 应用）
    → GenerationContextService.build_generation_context + build_prompt_context
    → 反推 rag_sources + retrieval_meta（溯源落库）
② plan_section_content（scenario=section_content_plan，content_plan 为空时）
    失败回退默认 plan，不阻断
③ AiTaskExecutionService().execute（scenario=section_content_generation）
    字数预期 get_expected_word_range 注入 target_words / max_words（模板 {% if %} 守卫）
④ GenerationResultParser().parse（优先 output_json）
⑤ ContentPostProcessor().process（格式后处理，按 generation_mode / content_structure_policy）
⑥ GenerationQualityService.run_all_checks（质量校验）
    检查项：keyword_coverage / duplicate_sections / exclude_scope_violation 等
    final_status：fail / warning / pass
⑦ 自动修订（final_status == fail 时）
    ContentRevisionService.can_revise（最多 1 次、仅 fail、仅可修复问题）
    → execute_revision（scenario=content_revision）→ 再后处理 → 再 run_all_checks
⑧ 保存（事务内，select_for_update）
    · 校验仍 fail → 【不覆盖原正文】content_generation_status=FAILED
      + content_generation_error="生成内容未通过质量校验，未覆盖原正文"
      + failed_content_preview（生成内容预览存 meta 供排查）→ 返回失败
    · pass / warning → 覆盖 section.content + word_count/content_summary
      + content_generation_status=SUCCESS + generation_status=SUCCESS + status=GENERATED
      + 创建 SectionVersion（version_no+1，source=AI）
⑨ 记录收尾：record 落库 rag_sources、generation_meta（retrieval/generation_mode/content_structure_policy）、prompt_run、llm_model
⑩ 内联扩写（批量路径；单章路径不扩写）
    _inline_expand_section：本次生成字数 < MIN_SECTION_WORDS(默认 500)
    → SectionExpandService.expand_section（scenario=section_expand，一轮）
    → patches 逐个应用（_apply_single_patch：insert/replace/delete，锚点须唯一）
    → 保存 + 新 SectionVersion；【任何失败不阻断本章 success】
    扩写信息记入 item.generation_meta.inline_expand（expanded/before/after）
```

> 设计要点：**质量校验失败绝不覆盖原正文**（只存 failed_content_preview），保证用户已有的内容不被一次坏生成冲掉；**扩写内联**在批量子任务内完成（生成一个校验一个），批量完成后不再出现串行长扩写任务。

#### 10.2.7 一致性审计与修复

- **触发**：① 批量生成完成自动 dispatch（`_finalize_batch_task`）；② 前端手动触发
- **审计**：`consistency_audit_task` → `ConsistencyAuditService.run_audit` — 清旧冲突 → `_group_by_top_level` 按一级目录分组 → 每组 **`consistency_audit`** → `_write_conflicts_to_sections` 写入 `Section.content_generation_meta["consistency_conflicts"]`（resolved=False，含 fact_title/evidence/severity）
- **修复**：`repair_section`（单章）/ `consistency_repair_task`（批量）— 读 unresolved 冲突 → **`consistency_repair`** → `_apply_patches`（行号区间须与 old_text 完全一致，否则全文唯一匹配）→ 失败带反馈重试 `_retry_repair_with_feedback` → 成功标记 resolved + repaired_at + repaired_diff

#### 10.2.8 表格清理 / Mermaid 配图 / AI 生图

| 能力 | 任务 | 服务 | scenario | 触发 |
|------|------|------|----------|------|
| 表格清理（单章） | `table_cleanup_task` | `TableCleanupService.cleanup_section` | `table_cleanup`（逐表 keep/convert） | 手动 |
| 表格清理（大纲批量） | `table_cleanup_outline_task` | 同上 | 同上 | 批量完成后自动（先于配图） |
| Mermaid 配图 | `mermaid_illustration_task` | `MermaidIllustrationService.run_illustration` | `mermaid_illustration`（渲染校验失败修复 1 次，调 mermaid.ink 渲染） | 批量后自动 + 手动；扫描 `content_plan.mermaid.needed=true` |
| AI 生图 | `image_generation_task` | `ImageGenerationService.run_generation` | `image_generation`（配置 `IMAGE_GEN_MODEL` 时生图存 MinIO+嵌入，否则只生成 prompt） | 批量后自动 + 手动；扫描 `content_plan.image.needed=true` |

#### 10.2.9 Word 导出

`OutlineViewSet.build_docx` → `BidDocxBuilder().build(outline, sections)`（markdown → docx、表格、材料占位符 `_process_material_placeholders`、材料包图片插入）→ `BidDocument`（version 递增）→ `save_file` 存 MinIO → presigned URL。`BidDocumentViewSet` 提供 ONLYOFFICE 在线编辑（JWT 配置）与下载；`views_onlyoffice_callback.py` 处理保存回调。

#### 10.2.10 队列管理与僵尸任务回收

- **队列管理**（`apps/task_queue/`）：队列列表聚合 `AsyncTask` + `GenerationTask`，叠加 Celery broker 快照（active/reserved）判断真实排队状态；强制结束 `app.control.revoke(celery_task_id, terminate=True, signal="SIGKILL")`（矩阵任务重置章节 PENDING + 释放矩阵锁；批量任务子项置 cancelled 防回调覆盖终态）；参数维护走 `CONFIG_DEFINITIONS` 注册表（见 10.4）
- **僵尸回收** `reconcile_stale_async_tasks`（`apps/common/tasks.py:13`，beat 60s + Redis 门控 `reconcile_interval_seconds`）：RUNNING 超宽限期（`stale_task_grace_minutes`=60）→ FAILED 并联动回收关联抽取 run / PipelineJob / 卡 parsing 的 TenderFile；**未投递 PENDING**（celery_task_id 为空，超 10 分钟）→ 直接删除；RUNNING PromptRun → FAILED；卡 GENERATING 的 Outline → 无章节删除/有章节改 DRAFT；GenerationTask RUNNING 超时 / PENDING 超双宽限期 → 矩阵重置章节、批量子项置 failed，任务 FAILED

### 10.3 LLM scenario 全集

所有场景模板存 `generation_prompttemplate` / `generation_promptversion` 表，前端「提示词管理」维护；`seed_prompts` 只补缺不覆盖（见 [§十五.4](#十五二次开发指南)）。

| scenario | 用途 | 触发环节 |
|----------|------|----------|
| `requirement_extraction_scoring/mandatory/qualification/commercial/technical/submission` | 六类需求条款提取 | 需求提取（并行） |
| `requirement_dedup_arbitration` | 去重候选集 LLM 仲裁 | 标段级去重 |
| `outline_requirement_groups` | 大纲生成：抽取评分需求分组 | 大纲两步生成第一步 |
| `outline_children` | 大纲生成：逐大类生成子目录 | 大纲两步生成第二步 |
| `outline_review` | 目录审核（passed/failed + 建议） | 审核闭环 |
| `global_fact_extract/merge/supplement/finalize` | 全局事实四轮工作流 | 可选，前置于正文 |
| `content_matrix_generation_v2`（旧版 `content_matrix_generation`） | 内容矩阵（每章写作要点） | 矩阵生成（分批） |
| `section_content_plan` | 章节内容规划（content_plan） | 单章生成前置 |
| `section_content_generation` | 章节正文生成 | 单章/批量生成 |
| `content_revision` | 质量校验失败后的自动修订 | 单章/批量生成 |
| `section_expand` | 字数不足扩写（patches） | 批量内联扩写 + 批量后兜底 |
| `consistency_audit` | 跨章节一致性审计 | 批量完成自动 + 手动 |
| `consistency_repair` | 冲突修复（patch 模式） | 审计后修复 |
| `table_cleanup` | 低质量表格清理/转换 | 批量后自动 + 手动 |
| `mermaid_illustration` | 流程图配图生成 | 批量后自动 + 手动 |
| `image_generation` | AI 生图 | 批量后自动 + 手动 |
| `outline_expand` | 大纲字数不足补目录 | 手动 |
| `bid_check_analysis/final/inspection`、`bid_invalid_items_extract` | 废标检查 | 手动 |

### 10.4 生成逻辑关键配置

| 配置 | 默认值 | 位置 | 说明 |
|------|--------|------|------|
| `MIN_SECTION_WORDS` | 500 | settings | 字数不足判定阈值（内联扩写/兜底扩写共用） |
| `MAX_EXPAND_ROUNDS` | 2 | settings | 批量后置扩写任务最大轮数 |
| `MIN_OUTLINE_DEPTH` | 3 | 大纲服务 | 大纲最小层级校验 |
| `stale_task_grace_minutes` | 60 | 队列参数 | 僵尸任务宽限期 |
| `reconcile_interval_seconds` | 600 | 队列参数 | 回收器实际执行间隔（Redis 门控） |
| `batch_section_max_retries` | 2 | 队列参数 | 批量子任务瞬时 DB 错误重试上限 |
| `matrix_generation_batch_size` | 10 | 队列参数 | 矩阵生成每批章节数 |
| `refine_outline_timeout_seconds` | ~600 | 队列参数 | 目录完善任务超时上限 |

队列参数通过前端「队列管理 → 失效参数维护」或 `config_service` 动态调整，无需重启。

### 10.5 修改生成逻辑指引

| 想改什么 | 改哪里 |
|----------|--------|
| 生成/审核/扩写等 AI 行为 | 前端「提示词管理」改模板并发布新版本（不要改 seed 覆盖线上，见 [§十五.4](#十五二次开发指南)） |
| 质量校验规则（keyword 覆盖、重复段、越界等） | `apps/outline/services/generation_quality_service.py` |
| 自动修订策略（次数、触发条件） | `apps/outline/services/content_revision_service.py` |
| 字数扩写（内联 + 兜底） | `apps/outline/services/section_expand_service.py`；批量内联入口 `apps/outline/tasks.py` 的 `_inline_expand_section` |
| 批量编排（排序、防重、chord 结构、收尾链） | `apps/outline/services/batch_generation_service.py` + `apps/outline/tasks.py`（`batch_section_generation_task` / `on_batch_complete`） |
| 单章生成内部流转 | `apps/outline/tasks.py` 的 `_execute_single_section_generation`（批量）/ `generate_section_task`（单章） |
| 一致性审计/修复 | `apps/outline/services/consistency_audit_service.py` |
| 矩阵生成 | `apps/outline/services/matrix_service.py` + `generate_content_matrix_task` |
| 表格清理/配图/生图 | `apps/outline/services/table_cleanup_service.py`、`mermaid_illustration_service.py`、`image_generation_service.py` |
| 模型选择/超参 | 前端「系统设置 → AI 模型配置」（ModelConfig） |

---

## 十一、MinIO 文件存储

### 11.1 Bucket 权限
`bid-files` bucket 已配置为公开下载模式（`scripts/setup.sh` 自动执行）：

```bash
docker exec ai-bid-generator-minio-1 mc alias set local http://localhost:9000 minioadmin minioadmin
docker exec ai-bid-generator-minio-1 mc anonymous set download local/bid-files
```

### 11.2 文件 URL 格式
- **浏览器访问**（经 nginx 代理）：`/minio/bid-files/path/to/file`
- **外部服务访问**（如 ONLYOFFICE）：`http://<MINIO_PUBLIC_ENDPOINT>/bid-files/path/to/file`

### 11.3 存储服务使用
```python
from apps.common.services.storage import StorageService

storage = StorageService()
storage.upload_fileobj(file_obj, object_key, content_type)
storage.put_object(object_key, data_bytes, content_type)
content = storage.get_object(object_key)
exists = storage.object_exists(object_key)
```

### 11.4 MinIO 控制台
访问 `http://localhost:9001`，账号 `minioadmin` / `minioadmin`（生产环境通过 `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` 修改）。

---

## 十二、ONLYOFFICE 集成
### 12.1 配置要点
1. **文件 URL**：必须使用绝对 URL（`http://<MINIO_PUBLIC_ENDPOINT>/bid-files/...`）
2. **回调 URL**：`http://<host>/api/onlyoffice/callback/<document_id>/`
3. **JWT 认证**：`ONLYOFFICE_JWT_SECRET` 必须与 ONLYOFFICE 容器配置一致

### 12.2 Word 文档模型
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

## 十三、种子数据初始化
### 13.1 一键执行
```bash
bash scripts/seed_data.sh
```

### 13.2 包含的命令
| 命令 | 作用 | 幂等 |
|------|------|------|
| `python manage.py sync_permissions` | 同步权限码到 Permission 表 | ✅ |
| `python manage.py seed_prompts` | 初始化内置提示词模板与模型配置 | ✅ |
| `python manage.py seed_workflow_templates` | 初始化系统工作流模板 | ✅ |
| `python manage.py seed_section_writing_templates` | 初始化章节写作模板 | ✅ |
| `python manage.py createsuperuser`（如不存在） | 创建管理员 | ✅ |

> 种子数据是幂等的，可重复执行。提示词模板的版本管理见 [§十五.4](#十五二次开发指南)。

---

## 十四、测试
### 14.1 后端测试
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

### 14.2 前端测试
```bash
cd frontend
npm run test        # vitest
npm run build       # vue-tsc 类型检查 + 构建
```

### 14.3 测试注意事项
- `ProjectMember.project_role` 必须使用 `ProjectRole` 实例，不能传字符串
- 公开菜单项：`dashboard`、`projects`、`templates`
- 测试 fixture 必须用 `RoleService.initialize_builtin_roles(project)` 初始化角色

---

## 十五、二次开发指南
### 15.1 新增 app / 模块
```bash
cd backend
python manage.py startapp <your_app>

# 注册到 config/settings/base.py 的 LOCAL_APPS
# 注册路由到 config/urls.py：path("api/your_app/", include("apps.your_app.urls"))
```

### 15.2 新增模型字段
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

### 15.3 新增菜单项
修改 [backend/apps/accounts/services/menu_service.py](backend/apps/accounts/services/menu_service.py) 的 `MENU_DEFINITION`，并在 [permissions_registry.py](backend/apps/accounts/permissions_registry.py) 注册对应权限码。

### 15.4 新增提示词模板
**推荐方式**：通过前端「提示词管理」页面创建并发布（走 `PromptTemplate` + `PromptVersion` 表），不要修改 `seed_prompts.py` 覆盖线上。

提示词渲染器是 **Jinja2**（非 Mustache），模板变量示例：
```
{{ chunk_context }}
{{ section_title }}
{% for item in items %}{{ item.name }}{% endfor %}
```

### 15.5 新增 Celery 任务
```python
# apps/<app>/tasks.py
from config.celery import app

@app.task
def my_task(arg):
    ...

# 路由按 app 自动匹配（见 §9.1）
# beat 调度在 config/celery.py 的 beat_schedule 中追加
```

### 15.6 新增 AI Provider
1. 在 `apps/generation/constants.py` 的 `ProviderType` 添加类型
2. 实现 `apps/generation/services/provider_client.py` 中的调用逻辑
3. 通过前端「系统设置 → AI 模型配置」添加 Provider 与模型

### 15.7 前端新增页面
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

### 15.8 二次开发 Checklist
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

## 十六、常见问题排查
### 16.1 502 Bad Gateway
**原因**：后端容器启动失败，或 nginx 缓存了旧 upstream。

```bash
# 检查 web 日志
docker logs ai-bid-generator-web-1

# 解决
docker compose build web worker beat
docker exec ai-bid-generator-web-1 python manage.py migrate
docker compose restart nginx
```

### 16.1 数据库字段不存在 (ProgrammingError: column does not exist)
**原因**：新增模型字段但未运行迁移。

```bash
docker exec ai-bid-generator-web-1 python manage.py migrate
docker compose restart web worker beat
```

### 16.2 容器网络问题
**现象**：容器内无法解析服务名（如 `minio`、`postgres`）

```bash
docker exec ai-bid-generator-web-1 python -c "import socket; print(socket.gethostbyname('minio'))"
# 失败则重启容器
docker restart ai-bid-generator-web-1
```

### 16.3 MinIO 远端直传失败
**原因**：`MINIO_PUBLIC_ENDPOINT` 仍是默认 `localhost:9000`，浏览器预签名 URL 解析到自己机器。

**解决**：把 `.env` 中 `MINIO_PUBLIC_ENDPOINT` 改成外网可达 host:port，重启 web/worker/beat。

### 16.4 Redis SLAVEOF 攻击导致 worker 退出
**现象**：文件解析卡住，worker 日志出现 `SLAVEOF` 或主从切换提示后退出。

**原因**：6379 端口公网暴露且无密码，被攻击者通过 `SLAVEOF` 注入恶意副本。

**解决**：
1. `docker-compose.yml` 中 redis 只绑定 `127.0.0.1`
2. 配置 Redis 密码
3. 确保 worker 配置了 `restart: unless-stopped`

### 16.5 磁盘满导致 postgres 崩溃
**现象**：`df` 100%，postgres 卡在 WAL recovery 循环，登录 502 + 测试连接失败。

**解决**：清理 `~/.cache`、`/var/lib/docker` 等占用，重启 postgres。

---

## 十七、备份与恢复

> ⚠️ **提示词（含前端所有自定义修改）存在数据库里，不在代码中**：`generation_prompttemplate` / `generation_promptversion` 两张表。数据库丢失 = 提示词丢失，且 `seed_prompts` 只补缺不覆盖，无法找回。**全库备份是提示词唯一的保险**（见 [§五.4 部署警示](#五docker-部署推荐)）。

### 17.1 备份
```bash
# 备份 PostgreSQL（结构 + 数据，含提示词/权限/角色/工作流模板等全部配置）
bash scripts/db_backup.sh

# 备份 MinIO 文件（招标文件、导出文档、配图等对象存储）
docker run --rm -v $(pwd)/backups:/backup -v miniodata:/data \
  minio/mc:latest cp -r /data /backup/minio-$(date +%Y%m%d)
```

> 建议：**每次部署前**执行 `db_backup.sh`；重要修改（提示词、系统设置）后也备份一次。备份文件保留在 `backups/` 目录，可定期同步到外部存储。

### 17.2 恢复
```bash
# 恢复 PostgreSQL
bash scripts/db_restore.sh backups/bid_YYYYMMDD.sql

# 恢复 MinIO
docker run --rm -v $(pwd)/backups:/backup -v miniodata:/data \
  minio/mc:latest cp -r /backup/minio-YYYYMMDD /data
```

### 17.3 仅备份结构（不含数据）
```bash
docker exec ai-bid-generator-postgres-1 pg_dump -U bid -d bid --schema-only > backups/schema.sql
```

### 17.4 仅备份种子数据
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
