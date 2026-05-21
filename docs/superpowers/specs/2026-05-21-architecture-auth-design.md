# 企业级 AI 标书生成系统 — 前后端架构与登录权限模块设计

| 项 | 内容 |
| --- | --- |
| 文档版本 | v1.1 |
| 日期 | 2026-05-21 |
| 状态 | 已定稿（评审有条件通过；v1.1 已补充评审提出的实现约束） |
| 适用范围 | 系统整体前后端架构 + 登录与权限模块（v1） |

> **v1.1 修订**（依据评审意见）：新增最小 `Lot` 模型；`complete-upload` 增加 magic bytes 文件头校验；`TenderFile` 状态机增 `rejected`、删 `uploaded`；新增 CSRF 防护与前端 refresh single-flight；明确 `system_admin` 项目权限边界；明确未知权限码默认拒绝；`Role` 权限 scope 业务层校验；`AuthIdentity` 增唯一约束；`OperationLog` 支持匿名失败登录；新增《8. 数据库约束与索引》《9. 实现顺序》两节。

---

## 1. 背景与目标

本系统是一套**企业级 AI 标书 / 投标文件生成系统**，面向单个企业的私有化部署场景，帮助投标团队完成从招标文件解析、需求拆解、大纲编排、章节 AI 生成、报价编制到 Word/PDF 导出的完整流程。

整体功能规划涵盖 17 个业务模块。本 spec **仅覆盖两部分内容**，作为后续所有模块的地基：

1. **系统整体前后端架构** —— 技术栈、应用拆分、目录结构、部署拓扑、异步任务体系、文件上传流程。
2. **登录与权限模块（v1 深入模块）** —— 认证数据模型、两层权限模型、认证流程、鉴权执行、账号与密码安全、审计。

其余 15 个业务模块（招标解析、需求拆解、评分项、企业资料库、知识库、大纲、章节生成、报价、导出、通知等）不在本 spec 范围内，将各自独立走 `spec → plan → implementation` 流程。本 spec 为它们预留了清晰的接入点（应用边界、`AsyncTask` 体系、`permission_service`、权限码注册表）。

### 1.1 设计原则

- **私有化、单企业部署**：不做多租户。所有数据归属同一企业，无 `tenant_id` 维度。
- **YAGNI**：v1 只实现账号密码登录；SSO、多分片上传、SSE/WebSocket、ClamAV 杀毒等仅预留接口，不实现。
- **单一职责与清晰边界**：每个 Django 应用职责单一，通过明确接口协作；`generation` 应用只提供 AI 能力，不承载业务编排。
- **鉴权判定单一入口**：所有权限判断收敛到 `accounts/services/permission_service.py`，DRF 权限类只是薄包装。

---

## 2. 技术栈

| 层 | 选型 | 说明 |
| --- | --- | --- |
| 后端框架 | Django + Django REST Framework (DRF) | REST API，自定义 User 模型，自定义异常处理 |
| 异步任务 | Celery + Redis | 5 个命名队列；Celery Beat 跑定时任务 |
| 数据库 | PostgreSQL + pgvector 扩展 | 向量检索用 pgvector 扩展实现，不引入独立向量库 |
| 缓存 / Broker | Redis | Celery broker、权限缓存、登录失败计数 |
| 对象存储 | MinIO（自建 S3 兼容） | 预签名 URL 直传，大文件不经 Django 中转 |
| 前端框架 | Vue 3 + Vite | 组合式 API |
| 前端 UI | Element Plus | 企业级组件库 |
| 前端状态 / 路由 | Pinia + Vue Router | |
| 文档处理 | python-docx、PyMuPDF / pdfplumber、PaddleOCR、docxtpl | Word 解析/生成、PDF 解析、中文 OCR、模板渲染 |
| LLM | 抽象 LLM Provider 层 | 适配 DeepSeek / 通义 / 智谱 / 自建模型 |
| 认证 | djangorestframework-simplejwt | JWT access + refresh，轮换 + 黑名单 |
| 密码哈希 | Argon2（argon2-cffi） | |
| 部署 | Docker Compose | 7 个服务，见 §3.1 |

---

## 3. 系统整体架构

### 3.1 部署拓扑（Docker Compose，7 个服务）

| 服务 | 说明 |
| --- | --- |
| `nginx` | 反向代理；服务前端静态资源；转发 `/api` 到 `web`；为大文件上传放宽 `client_max_body_size`（虽然预签名直传不经 nginx，但部分小附件仍可能走后端） |
| `web` | Django + DRF（gunicorn/uvicorn 运行），提供 REST API |
| `worker` | Celery worker，v1 单 worker 消费全部 5 个队列 |
| `beat` | Celery Beat，调度定时任务 |
| `postgres` | PostgreSQL + pgvector |
| `redis` | Celery broker + 缓存 |
| `minio` | 对象存储 |

v1 单机部署。`worker` 后续可按队列拆分为多个独立 worker（见 §3.6）。

### 3.2 后端目录结构

```
backend/
├── manage.py
├── requirements.txt
├── Dockerfile
├── config/                 # 项目配置
│   ├── settings/            # base / dev / prod 分层
│   ├── urls.py
│   ├── celery.py
│   ├── asgi.py
│   └── wsgi.py
└── apps/                    # 14 个业务应用
    ├── accounts/
    ├── projects/
    ├── tender/
    ├── requirements/
    ├── scoring/
    ├── enterprise/
    ├── knowledge/
    ├── outline/
    ├── generation/
    ├── quotation/
    ├── exporting/
    ├── audit/
    ├── notifications/
    └── common/
```

### 3.3 14 个 Django 应用职责

| 应用 | 职责 | v1 状态 |
| --- | --- | --- |
| `accounts` | 用户、角色、权限、登录与认证 | **v1 深入实现** |
| `projects` | 项目、标段（lot）、项目成员 | v1 最小桩（支撑权限框架） |
| `tender` | 招标文件、解析、摘要、澄清/补遗 | 预留 |
| `requirements` | 招标需求项、应答项、偏离表、废标项 | 预留 |
| `scoring` | 评分项、覆盖矩阵、预估得分 | 预留 |
| `enterprise` | 企业资料、资质证书、人员库、业绩案例库 | 预留 |
| `knowledge` | 知识库文档、分块、向量检索 | 预留 |
| `outline` | 投标大纲、章节、章节版本 | 预留 |
| `generation` | AI 章节生成、局部改写、AI 助手 —— **仅能力层，不承载业务编排** | 预留 |
| `quotation` | 报价表、报价明细、报价校验 | 预留 |
| `exporting` | Word/PDF 导出、导出模板 | 预留 |
| `audit` | 操作日志、审计日志 | **v1 随 accounts 落地 `OperationLog`** |
| `notifications` | 站内通知、提醒、证书到期、投标截止提醒 | 预留 |
| `common` | 共享层：存储、LLM、异常、分页、基础模型、文档处理服务 | **v1 实现基础设施部分** |

> **`generation` 的边界**：`generation` 只对外提供「给定 prompt/上下文 → 返回生成结果」的能力。哪个章节、用什么资料、生成后写回哪里、状态如何流转，由对应业务应用（如 `outline`）编排。这样保证 AI 能力可独立测试、可替换 Provider，业务编排不被 AI 细节污染。

### 3.4 前端目录结构

```
frontend/
├── index.html
├── vite.config.js
├── package.json
└── src/
    ├── main.js
    ├── App.vue
    ├── layout/             # 主框架布局（侧边菜单、顶栏、面包屑）
    ├── router/             # Vue Router，路由守卫
    ├── store/              # Pinia（auth、user、project 等）
    ├── api/                # API 封装（按模块拆分），统一 axios 实例与拦截器
    ├── views/              # 页面
    │   ├── login/
    │   ├── dashboard/
    │   ├── projects/
    │   ├── tender/
    │   ├── requirements/
    │   ├── scoring/
    │   ├── enterprise/
    │   ├── knowledge/
    │   ├── generation/
    │   ├── quotation/
    │   ├── exporting/
    │   └── system/         # 用户/角色/权限管理、系统配置
    ├── components/         # 通用组件
    └── utils/              # 工具（权限指令、请求重试、格式化等）
```

### 3.5 common 服务抽象层

`common/services/` 提供基础设施的接口抽象，业务应用只依赖接口，不依赖具体实现：

| 服务 | 职责 |
| --- | --- |
| `storage` | MinIO 封装：预签名 URL 生成、`stat_object`、对象删除；按业务域提供 endpoint |
| `llm` | LLM Provider 抽象，适配多家模型供应商 |
| `ocr` | OCR 抽象（PaddleOCR 中文识别） |
| `document_parser` | 文档解析抽象（Word/PDF → 结构化内容） |
| `document_converter` | 格式转换抽象 |
| `office_exporter` | Word/PDF 导出抽象（docxtpl 模板渲染） |

`common` 还提供：基础模型 Mixin（`created_at`/`updated_at` 等时间戳）、统一分页、DRF 自定义异常处理器、`AsyncTask` 模型（见 §3.6）。

### 3.6 异步任务体系

#### 3.6.1 `common.AsyncTask` 统一异步任务模型

所有耗时操作（招标解析、知识库入库、AI 生成、导出等）统一通过 `AsyncTask` 跟踪，前端统一轮询。

| 字段 | 说明 |
| --- | --- |
| `id` | 主键 |
| `task_type` | 任务类型（如 `tender_parse`、`kb_ingest`、`section_generate`、`export`） |
| `celery_task_id` | Celery 任务 ID |
| `status` | `pending` / `running` / `success` / `failed` / `cancelled` / `retrying` |
| `progress` | 进度百分比（0–100） |
| `current_step` | 当前步骤描述 |
| `total_steps` | 总步骤数 |
| `related_object_type` | 关联业务对象类型（如 `TenderFile`） |
| `related_object_id` | 关联业务对象 ID |
| `input_payload` | 输入参数（JSON） |
| `result_payload` | 结果（JSON）—— **只存引用/摘要，不存大段正文内容** |
| `error_message` | 失败原因 |
| `created_by` | 发起人 |
| `created_at` / `started_at` / `finished_at` | 时间戳 |

> **关键约束**：`result_payload` 只放对象引用、ID、统计摘要等轻量数据。生成的章节正文、解析出的全文等大体量内容写入各自业务表，不塞进 `AsyncTask`。

前端通过 `GET /api/tasks/{id}` 轮询任务状态。v1 用轮询；SSE/WebSocket 推送为后续预留，不实现。

#### 3.6.2 Celery 5 队列

| 队列 | 用途 |
| --- | --- |
| `parse_queue` | 招标文件解析、OCR |
| `kb_queue` | 知识库文档入库、分块、向量化 |
| `ai_queue` | AI 章节生成、改写 |
| `export_queue` | Word/PDF 导出 |
| `notify_queue` | 通知、提醒发送 |

v1 单 worker 消费全部队列；`config/celery.py` 通过 `task_routes` 配置任务到队列的映射，后续可不改业务代码、仅调整部署即可把 worker 按队列拆分（如给 `ai_queue` 单独配置并发与资源）。

#### 3.6.3 Celery Beat 定时任务

| 任务 | 周期 | 说明 |
| --- | --- | --- |
| `cleanup_stale_uploads` | 定期（如每小时） | 清理超过 24h 仍处于 `uploading` 的孤儿上传记录（见 §3.7） |
| `flushexpiredtokens` | 每日 | 执行 `manage.py flushexpiredtokens`，清理 simplejwt 过期黑名单 token |

其余业务定时任务（证书到期提醒、投标截止提醒等）由对应模块在自己的 spec 中定义。

### 3.7 招标文件上传流程（MinIO 预签名直传）

**v1 默认且唯一的上传方案**：客户端经预签名 URL 直传 MinIO，大文件不经过 Django。

#### 3.7.1 四个端点

**① `POST /api/tender/files/init-upload`** —— 初始化上传

- 入参：`{ project_id, lot_id（可选）, file_name, file_size, content_type, file_category }`
- 后端：校验权限与参数（含 `lot_id` 须属于 `project_id`、文件扩展名在白名单内）→ 后端生成 `object_key` → 创建 `TenderFile`（status=`uploading`）→ 返回预签名 PUT URL
- 返回：`{ file_id, upload_url, object_key, expires_in }`

**② `PUT {upload_url}`** —— 前端直传

- 前端直接把文件 PUT 到 MinIO 预签名 URL。

**③ `POST /api/tender/files/{file_id}/complete-upload`** —— 确认上传完成

- **存在性与大小校验**：调用 MinIO `stat_object` 确认对象存在并获取**真实大小**（以服务端为准，不信任客户端上报的 etag/size）。
- **文件头校验**：调用 MinIO `get_object` 读取头部字节（`Range: bytes=0-4095`），用 magic bytes 校验真实文件类型，与 `file_category` 允许的类型比对。
- **校验失败**（类型不符、大小超限等）→ 删除 MinIO 对象 → `TenderFile` 状态置 `rejected` → 返回错误，不创建任务。
- **校验通过** → 按 `file_category` 分支处理：
  - 需解析的类别 → 创建 `AsyncTask` → 投递到 `parse_queue` → 文件状态置 `parse_pending`
  - 不需解析的类别（如附件）→ 文件状态置 `ready`，不创建解析任务
- 返回：`{ file_id, status, task_id }`（`ready` / `rejected` 类别 `task_id` 为 `null`）
- **幂等**：重复调用（含 `AsyncTask` 创建）返回已存在的 `task_id`，不重复建任务；已处于终态（`rejected` / `parse_pending` / `ready`）的记录直接返回当前状态，不再访问 MinIO。

**④ `GET /api/tasks/{task_id}`** —— 轮询解析进度

#### 3.7.2 上传规则

1. **`object_key` 由后端生成**，防止路径穿越与越权覆盖。命名模式：
   - 有标段：`projects/{project_id}/lots/{lot_id}/tender/{file_id}/original.pdf`
   - 无标段：`projects/{project_id}/tender/{file_id}/original.pdf`
   - `lot_id` 为可选维度。
2. **`complete-upload` 幂等**，含任务创建幂等。
3. **`AsyncTask` 不存大段内容**（见 §3.6.1）。
4. **文件类型校验**：`init-upload` 阶段按扩展名白名单做初步校验；`complete-upload` 阶段从 MinIO 读取文件头做 magic bytes 校验（见 §3.7.1 ③）。两道校验均不信任客户端 `content_type`。
5. **大小校验**：预签名 PUT 无法在上传时强制限制大小；v1 采用上传后 `stat_object` 事后校验。内部可信用户场景下可接受。
6. **孤儿清理**：`cleanup_stale_uploads`（Celery Beat）扫描 `uploading` 状态超 24h 的记录 → 删除 MinIO 对象 + 置 `upload_expired`。
7. **杀毒扫描**（ClamAV）为后续预留，v1 不实现。
8. **分片上传**为后续预留，v1 不实现，但 `storage` 服务接口需为其留出扩展空间。

#### 3.7.3 `TenderFile` 状态机

| 状态 | 含义 |
| --- | --- |
| `uploading` | 已 init，等待客户端直传 |
| `parse_pending` | 上传完成且文件头校验通过，已入解析队列，等待 worker |
| `parsing` | 解析中 |
| `parsed` | 解析完成 |
| `parse_failed` | 解析失败 |
| `ready` | 不需要解析的类别（如附件）直接可用 |
| `rejected` | 上传后文件头校验失败（类型不符、大小超限等），MinIO 对象已删除 |
| `archived` | 归档 |
| `upload_expired` | 上传超时被清理 |

允许的重试流转：`parse_failed → parsing`、`parsed → parsing`（重新解析）。

---

## 4. 登录与权限数据模型

### 4.1 两层权限模型

权限分为两个相互独立的层次：

- **第一层 —— 全局角色（global）**：决定用户在系统层面能做什么。
  - `system_admin`（系统管理员）：所有权限，不受限。
  - `bid_manager`（投标经理）：可创建/管理项目等全局能力。
  - `normal_user`（普通用户）：基础全局能力。
- **第二层 —— 项目角色（project）**：决定用户在**某个具体项目内**能做什么，通过 `ProjectMember` 绑定。
  - `owner`、`editor`、`reviewer`、`viewer`。

同一用户可以在项目 A 是 `editor`、在项目 B 是 `reviewer`。两层是正交的：全局角色不会自动赋予项目内权限（`system_admin` 除外）。

**权限判定逻辑**（见 §4.5 `permission_service`）：

```
若 user 是 system_admin            → 允许
若权限 scope == global             → 查用户全局角色的权限集合
若权限 scope == project            → 用户必须是该项目的 ProjectMember
                                     → 查该 project_role 的权限集合
```

> **`system_admin` 的边界**：`system_admin` 拥有全部 `global` 与 `project` 权限，且**不要求 `ProjectMember` 关系**，可直接访问任意项目。这是单企业私有化部署下的预期行为；实现时不要理解为「仅绕过 global 权限、项目权限仍需成员关系」。

### 4.2 `accounts` 应用模型

#### 4.2.1 `User`（继承 `AbstractUser`）

| 字段 | 说明 |
| --- | --- |
| `username` | 登录名（继承） |
| `password` | 密码哈希（继承）；v1 账号密码登录使用此原生字段 |
| `real_name` | 真实姓名 |
| `email` | 邮箱 |
| `phone` | 手机号 |
| `department` | 部门（v1 用字符串，后续可升级为外键） |
| `is_active` | 是否启用；停用用户即置 `False`（继承） |
| `must_change_password` | 是否强制修改密码（首次登录/管理员重置后为 `True`） |
| `created_at` / `updated_at` / `last_login` | 时间戳 |

> `is_staff` / `is_superuser` 仅用于 Django Admin 站点访问控制，**与本系统业务 RBAC 完全独立**，不参与业务鉴权判定。

#### 4.2.2 `Permission`（权限点）

| 字段 | 说明 |
| --- | --- |
| `code` | 权限码，`unique`；命名规范 `模块.动作`，如 `tender.upload`、`section.review` |
| `name` | 显示名 |
| `module` | 所属模块 |
| `scope` | `global` / `project` |
| `description` | 描述 |
| `is_active` | 是否启用 |
| `created_at` / `updated_at` | 时间戳 |

权限点通过**代码内权限码注册表 + 数据迁移**种子化（保证代码与数据库一致、可演进），不靠手工插入。

#### 4.2.3 `Role`（全局角色）

| 字段 | 说明 |
| --- | --- |
| `code` | 角色码，`unique` |
| `name` | 显示名 |
| `description` | 描述 |
| `is_system` | 是否内置角色 |
| `permissions` | M2M → `Permission`（**只允许 `scope=global` 的权限**） |
| `created_at` / `updated_at` | 时间戳 |

**内置角色规则**（`is_system=True`）：

- 不可删除；不可修改 `code`。
- `name` / `description` 可编辑。
- 权限可编辑 —— **`system_admin` 例外**：其权限锁定为「全部权限」，不可改。

**`permissions` 的 scope 约束**：`Role` 只能绑定 `scope=global` 的 `Permission`。该约束在数据库层难以直接表达，必须由业务层强制——`RoleService` / `RoleSerializer` 在保存权限时过滤并拒绝任何 `scope=project` 的 `Permission`，违反则返回 `validation_error`。

#### 4.2.4 `User` – `Role` 关系

M2M。v1 前端只展示/分配单个角色，但后端模型支持多角色，为后续扩展留空间。

#### 4.2.5 `AuthIdentity`（SSO 预留，v1 空表）

| 字段 | 说明 |
| --- | --- |
| `id` | 主键 |
| `user` | FK → `User` |
| `provider` | `password` / `dingtalk` / `ldap` / `wecom` / `oauth2` |
| `external_id` | 外部身份标识 |
| `extra` | JSON，附加信息 |
| `created_at` / `updated_at` / `last_login_at` | 时间戳 |
| 约束 | `unique(provider, external_id)` —— 同一外部身份不可绑定到多个本地用户 |

v1 账号密码登录使用 `User` 原生 `password` 字段，**不写 `AuthIdentity`**。该表为后续 SSO 接入预留，v1 保持为空表。

### 4.3 `projects` 应用模型（v1 最小桩）

为使「项目层权限」框架在 v1 即可落地、可测试，`projects` 提供最小可用模型；完整项目管理在 `projects` 自己的 spec 中扩展。

#### 4.3.1 `Project`

| 字段 | 说明 |
| --- | --- |
| `id` | 主键 |
| `name` | 项目名 |
| `status` | 项目状态 |
| `created_by` | 创建人 |
| `created_at` / `updated_at` | 时间戳 |

#### 4.3.2 `Lot`（标段）

| 字段 | 说明 |
| --- | --- |
| `id` | 主键 |
| `project` | FK → `Project` |
| `name` | 标段名称 |
| `code` | 标段编号 |
| `status` | 标段状态 |
| `created_at` / `updated_at` | 时间戳 |

`Lot` 为 v1 最小桩，用于支撑上传接口的 `lot_id` 维度与 `object_key` 的标段路径段；完整多标段管理在 `projects` 后续 spec 扩展。**两层权限仍在项目级，不下沉到标段级。**

#### 4.3.3 `ProjectMember`

| 字段 | 说明 |
| --- | --- |
| `id` | 主键 |
| `project` | FK → `Project` |
| `user` | FK → `User` |
| `project_role` | `owner` / `editor` / `reviewer` / `viewer` |
| `added_by` | 添加人 |
| `created_at` / `updated_at` | 时间戳 |
| 约束 | `unique(project, user)` —— 一个用户在一个项目内只有一个角色 |

### 4.4 `PROJECT_ROLE_PERMISSIONS` 静态映射

项目角色 → 权限集合为**静态映射**，定义在 `projects/permissions.py`（与项目层语义同源，便于维护）。项目角色固定，不做成可配置数据表（YAGNI）。

```python
# projects/permissions.py
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

> 上述权限码为示例集，覆盖了大纲/章节/导出等后续模块的代表性动作。后续模块接入时，在权限码注册表中补充自身权限点，并按需扩充本映射。

### 4.5 `permission_service` 权限判定服务

`accounts/services/permission_service.py` 是**全系统唯一的鉴权判定入口**。DRF 权限类、视图、模板渲染所需的权限集合都从这里取，不允许在视图里散落判定逻辑。

| 方法 | 说明 |
| --- | --- |
| `is_system_admin(user)` | 是否系统管理员 |
| `has_permission(user, code, project=None)` | 总入口：按权限点 `scope` 自动走全局或项目判定 |
| `has_global_permission(user, code)` | 全局权限判定 |
| `has_project_permission(user, project, code)` | 项目权限判定（`system_admin` 直接通过；其余用户须是 `ProjectMember`） |
| `get_global_permissions(user)` | 取用户全局权限码集合（供登录响应、菜单计算） |
| `get_project_permissions(user, project)` | 取用户在某项目的权限码集合（供 `GET /api/projects/{id}/my-permissions`） |

**未知权限码处理**：`has_permission` 遇到不存在、`is_active=False`、或 `scope` 与调用方 `required_scope` 声明不一致的 `code`，**一律拒绝**，绝不默认放行。

**缓存策略**：

- 缓存键：`perm:global:user:{user_id}`、`perm:project:user:{user_id}:project:{project_id}`。
- TTL：60–300s。
- 两级缓存：单次请求内缓存（request-level）+ Redis 缓存。
- 角色/成员/权限变更时主动失效相关键。

---

## 5. 认证流程与鉴权执行

### 5.1 可插拔认证 Provider

为后续 SSO 预留，认证入口抽象为 Provider：`accounts/auth/`。

```
accounts/auth/
├── base.py        # BaseAuthProvider 接口
├── password.py    # PasswordAuthProvider（v1 实现）
├── registry.py    # Provider 注册表
└── ...            # 未来：dingtalk.py / ldap.py / wecom.py / oauth2.py
```

**`BaseAuthProvider` 接口**：

- `provider_code`：Provider 标识。
- `authenticate(credentials) -> User`：校验凭据并返回 `User`，失败抛统一异常。

**统一 Provider 异常**：

| 异常 | 含义 |
| --- | --- |
| `InvalidCredentials` | 凭据错误 |
| `AccountDisabled` | 账号已停用 |
| `AccountLocked` | 账号被锁定（登录失败过多） |
| `ProviderUnavailable` | 认证源不可用（如外部 SSO 宕机） |
| `ExternalIdentityNotBound` | 外部身份未绑定本地账号 |

各 Provider 的差异只在「如何校验凭据」；校验之后的统一收尾流程见 §5.2。

### 5.2 `complete_login` 统一登录收尾流程

不论哪个 Provider，认证成功后都走同一个 `complete_login(user, request)`：

1. `user` 为 `None` → 登录失败。
2. `user.is_active == False` → 拒绝（`account_disabled`）。
   > **必须手动检查 `is_active`**：simplejwt 的 `RefreshToken.for_user()` **不会**校验账号是否启用。
3. `user.must_change_password == True` → 仍允许登录，但在响应里打标记。
4. 签发 JWT（access + refresh）。
5. 写审计日志（登录成功）。
6. 返回：用户信息 + 全局权限 + 菜单树。

### 5.3 认证 API 端点

| 端点 | 方法 | 入参 | 说明 |
| --- | --- | --- | --- |
| `/api/auth/login` | POST | `{ username, password }` | 登录 |
| `/api/auth/refresh` | POST | （从 Cookie 读 refresh） | 刷新 access；自定义实现；须校验 CSRF token（见 §5.5.2） |
| `/api/auth/logout` | POST | （从 Cookie 读 refresh） | 黑名单 refresh + 清 Cookie；须校验 CSRF token |
| `/api/auth/change-password` | POST | `{ old_password, new_password }` | 修改密码 |
| `/api/auth/me` | GET | — | 返回用户 + `global_permissions` + `menu_tree` |
| `/api/users/{id}/reset-password` | POST | — | 管理员重置用户密码（置 `must_change_password=True`） |
| `/api/projects/{id}/my-permissions` | GET | — | 返回当前用户在该项目的权限码集合 |

**登录成功响应体**：

```json
{
  "access": "<jwt-access-token>",
  "user": { "...": "用户基础信息" },
  "global_permissions": ["project.create", "..."],
  "menu_tree": [ { "...": "按权限裁剪后的菜单" } ],
  "must_change_password": false
}
```

> `menu_tree` 由用户全局权限计算得出（前端据此渲染侧边菜单）；项目内菜单在进入具体项目时按 `my-permissions` 二次裁剪。

### 5.4 JWT 配置（simplejwt）

| 配置 | 值 |
| --- | --- |
| `ACCESS_TOKEN_LIFETIME` | **15 分钟** |
| `REFRESH_TOKEN_LIFETIME` | **7 天** |
| `ROTATE_REFRESH_TOKENS` | `True`（刷新时轮换 refresh） |
| 黑名单 | 启用 `token_blacklist` 应用，logout / 轮换旧 token 入黑名单 |

> access 15 分钟：在企业数据敏感性与体验之间取平衡。access token 无法即时吊销，故生命周期取短；refresh 轮换 + 黑名单提供「可吊销」能力。

### 5.5 Token 存储、跨站防护与并发刷新

#### 5.5.1 Token 存储策略

| Token | 存储位置 | 传递方式 |
| --- | --- | --- |
| access | 前端内存（不落 localStorage） | 请求头 `Authorization: Bearer <access>` |
| refresh | `httpOnly` + `Secure` + `SameSite=Strict` Cookie | 浏览器自动携带 |

- v1 为同源部署，`SameSite=Strict` 可用。
- `/api/auth/refresh` 与 `/api/auth/logout` 为**自定义端点**：从 Cookie 读取 refresh token；refresh 成功后 `Set-Cookie` 写入轮换后的新 refresh；logout 时 `Clear-Cookie`。
- access 放内存 → 关闭页面即丢失，降低 XSS 持久窃取风险；刷新页面后用 refresh Cookie 静默续签。

#### 5.5.2 CSRF 防护

`refresh` / `logout` 经 Cookie 自动携带凭据，存在 CSRF 风险。v1 采用双重防护，**直接落地、不作预留**：

1. **`SameSite=Strict`** 为主要防御：跨站请求不会携带 refresh Cookie。
2. **CSRF token（双提交 Cookie 模式）** 为纵深防御：登录时后端额外下发一个**非 httpOnly** 的 `csrf_token` Cookie；前端调用 `refresh` / `logout` 时把它回填到 `X-CSRF-Token` 请求头，后端比对 Cookie 与请求头，不一致即拒绝。
3. `change-password` 用 `Authorization: Bearer` 认证（凭据不在 Cookie 中），不受 CSRF 影响，**无需** CSRF token。

> 跨域部署时 `SameSite=Strict` 失效，CSRF token 将成为唯一防线，故 v1 即落地而非预留。

#### 5.5.3 前端 refresh single-flight（并发刷新保护）

`ROTATE_REFRESH_TOKENS=True` 下，旧 refresh 在刷新后立即入黑名单。若前端多个请求同时收到 `token_expired` 并各自发起 `refresh`：第一个成功后旧 Cookie 失效，其余 `refresh` 用已失效 Cookie 失败，导致用户被错误登出。

前端 axios **必须**实现 single-flight：

1. 同一时刻只允许一个 `refresh` 请求在途。
2. 其它收到 `token_expired` 的请求挂起，等待该 `refresh` 完成。
3. `refresh` 成功后，用新 access **统一重放**所有挂起请求。
4. 仅当 `refresh` 本身失败时才执行登出。

### 5.6 `RequirePermission` 鉴权类

DRF 权限类 `RequirePermission`，是 `permission_service` 的薄包装。视图通过类属性声明所需权限：

```python
class TenderFileUploadView(APIView):
    permission_classes = [IsAuthenticated, RequirePermission]
    required_permission = "tender.upload"
    required_scope = "project"   # global | project
```

**`project` 资源解析优先级**：`URL 中的 project_id` > `对象的 project_id` > `请求体中的 project_id`。

**关键规则**：若 `required_scope == "project"` 但无法解析出 `project` → **直接拒绝**，不做默认放行。

所有判定委托给 `permission_service.has_permission(...)`，鉴权类自身不含业务逻辑。

### 5.7 `MustChangePasswordPermission`

强制改密的拦截**用 DRF 全局 Permission 实现，不用 Django Middleware**。

> **原因**：JWT + DRF 架构下，普通 Django Middleware 执行时通常尚未完成 DRF 的 JWT 认证，middleware 不一定能可靠拿到当前 JWT 用户；而 DRF Permission 在认证之后执行，能正确拿到 `request.user`。

`MustChangePasswordPermission`（注册为 DRF 全局默认权限）逻辑：

1. 匿名用户 → 跳过（交给其它认证权限处理）。
2. `user.must_change_password == False` → 放行。
3. 当前端点属于 `change-password` / `logout` / `me` → 放行（否则用户无法自救）。
4. 其余 → 拒绝，返回 `code = must_change_password`（HTTP 403）。

### 5.8 密码与账号安全

#### 5.8.1 密码哈希

`PASSWORD_HASHERS` 顺序：

1. `Argon2PasswordHasher`（首选，依赖 `argon2-cffi`）
2. PBKDF2 系列
3. `BCryptSHA256PasswordHasher`

启用 Django 默认 `AUTH_PASSWORD_VALIDATORS`（长度、常见弱密码、纯数字等校验）。

#### 5.8.2 登录失败限流与锁定

- 计数键：`login_fail:{username}:{ip}`（Redis）。
- 连续失败 **5 次** → 锁定 **15 分钟**。
- 登录成功 → 清零计数。
- 每次失败写审计日志。
- 返回区分：
  - 账号锁定 → **HTTP 423 `account_locked`**
  - 触发频率限流 → **HTTP 429 `rate_limited`**

### 5.9 错误码与异常处理

DRF 自定义 `EXCEPTION_HANDLER`，统一错误响应体：

```json
{ "code": "permission_denied", "message": "可读提示", "detail": { } }
```

| `code` | 典型 HTTP 状态 | 含义 |
| --- | --- | --- |
| `unauthenticated` | 401 | 未认证 |
| `token_expired` | 401 | access token 过期（前端据此触发静默刷新） |
| `token_invalid` | 401 | token 非法 |
| `permission_denied` | 403 | 已认证但无权限 —— **前端不跳登录页** |
| `account_disabled` | 403 | 账号停用 |
| `account_locked` | 423 | 账号锁定 |
| `must_change_password` | 403 | 需先改密 |
| `rate_limited` | 429 | 触发频率限流 |
| `validation_error` | 400 | 参数校验失败 |
| `not_found` | 404 | 资源不存在 |
| `server_error` | 500 | 服务端错误 |

前端拦截器据 `code` 区分处理：`401/token_expired` → 静默刷新后重试；`403` → 提示无权限、停留当前页；`account_locked`/`must_change_password` → 专门引导。

### 5.10 审计

审计写入 `audit.OperationLog`。

**v1 必须审计的事件**：登录成功、登录失败、登出、修改密码、管理员重置密码、用户启用/停用、角色变更、项目成员增删改、权限变更。

**`OperationLog` 字段**：

| 字段 | 说明 |
| --- | --- |
| `actor` | 操作者；**可为空**（如登录失败时尚无已认证用户） |
| `action` | 动作类型 |
| `target_type` / `target_id` | 操作对象 |
| `summary` | 摘要 |
| `extra` | JSON，附加上下文 |
| `ip` / `user_agent` | 来源 |
| `created_at` | 时间戳 |

登录失败等无 `actor` 的事件**不得硬塞成某个 `User`**：`actor` 留空，尝试的用户名与失败原因写入 `extra`（如 `{"username_attempted": "...", "reason": "invalid_password"}`）。

> 所有权限相关模型（`Permission`/`Role`/`ProjectMember` 等）均带 `created_at`/`updated_at`；建议补 `created_by`/`updated_by`。`ProjectMember` 必须有 `added_by` 与 `created_at`。

### 5.11 Celery Beat 定时任务（认证相关）

`flushexpiredtokens`：每日执行 `python manage.py flushexpiredtokens`，清理 simplejwt 黑名单中已过期的 token 记录，避免黑名单表无限膨胀。

---

## 6. 测试策略

v1 范围内需覆盖：

- **`permission_service` 单元测试**：全局/项目两层判定、`system_admin` 直通、非成员拒绝、`project` 无法解析时拒绝。
- **认证流程测试**：登录成功/失败、停用账号被拒、`must_change_password` 流程、登录失败 5 次锁定、锁定期满恢复。
- **JWT 测试**：access 过期、refresh 轮换、logout 后 refresh 入黑名单不可再用。
- **`RequirePermission` 集成测试**：`global`/`project` 两种 scope、project_id 三种解析来源优先级、解析失败拒绝。
- **`MustChangePasswordPermission` 测试**：放行 change-password/logout/me、拦截其它端点。
- **错误响应测试**：各 `code` 与 HTTP 状态映射正确。
- **上传校验测试**：magic bytes 与 `file_category` 不符 → `TenderFile` 置 `rejected` 且 MinIO 对象被删除；`complete-upload` 幂等。

测试使用真实 PostgreSQL（不 mock 数据库），保证迁移与 pgvector 行为一致。

---

## 7. v1 范围与后续预留

### 7.1 v1 实现范围

- `accounts`：用户、角色、权限、账号密码登录、两层鉴权、`permission_service`、审计。
- `projects`：`Project` / `Lot` / `ProjectMember` 最小桩（支撑项目层权限与标段维度）。
- `audit`：`OperationLog`。
- `common`：`AsyncTask`、`storage` 服务、异常处理、分页、基础模型。
- `tender`：仅预签名直传 4 端点 + `TenderFile` 模型与状态机（解析逻辑本身属 `tender` 后续 spec）。
- 部署：Docker Compose 7 服务。

### 7.2 明确预留、v1 不实现

| 项 | 预留方式 |
| --- | --- |
| SSO 登录 | `AuthIdentity` 表 + `BaseAuthProvider` 接口 |
| 多角色 UI | `User`–`Role` 已是 M2M，仅前端限制单选 |
| worker 按队列拆分 | `task_routes` 已配置 |
| SSE/WebSocket 进度推送 | v1 用轮询；`AsyncTask` 模型不变 |
| 分片上传 | `storage` 服务接口预留扩展点 |
| ClamAV 杀毒扫描 | 在 `complete-upload` 后流程中预留挂载点 |
| `department` 升级为外键 | v1 用字符串 |
| 跨域部署 | v1 同源 + `SameSite=Strict`；跨域时再调整 Cookie 策略 |

---

## 8. 数据库约束与索引

以下约束与索引为实现期强制要求，写入对应 model 的 `Meta`。

**`accounts`**

```
User.username                                       unique
Permission.code                                     unique
Role.code                                           unique
AuthIdentity(provider, external_id)                 unique
```

**`projects`**

```
ProjectMember(project, user)                        unique
ProjectMember(project)                              index
ProjectMember(user)                                 index
Lot(project)                                        index
```

**`common.AsyncTask`**

```
AsyncTask.celery_task_id                            index
AsyncTask.status                                    index
AsyncTask.task_type                                 index
AsyncTask.created_by                                index
AsyncTask(related_object_type, related_object_id)   index
```

**`tender.TenderFile`**

```
TenderFile.object_key                               unique
TenderFile.project                                  index
TenderFile.lot                                      index
TenderFile.status                                   index
TenderFile.file_category                            index
```

`TenderFile.object_key` 的 `unique` 约束尤为关键，是防止对象覆盖与重复记录的最后一道防线。

---

## 9. 实现顺序

交付实现时按以下顺序推进，避免过早进入复杂业务：

1. 创建 Django 项目与 14 个 app 骨架。
2. 配置 `settings/`（`base` / `dev` / `prod` 分层）。
3. 配置自定义 `User` 模型并设置 `AUTH_USER_MODEL`。
4. 实现 `accounts` 模型：`User` / `Permission` / `Role` / `AuthIdentity`。
5. 实现 `projects` 最小模型：`Project` / `Lot` / `ProjectMember`。
6. 实现 `audit.OperationLog`。
7. 实现 `common.AsyncTask`。
8. 实现权限码注册表 + 种子化（management command / 数据迁移）。
9. 实现 `permission_service`（鉴权判定单一入口）。
10. 实现 simplejwt 认证：`login` / `refresh` / `logout` / `me` / `change-password`。
11. 实现 `RequirePermission` 与 `MustChangePasswordPermission`。
12. 实现 MinIO `storage` service。
13. 实现 `TenderFile` 与 `init-upload` / `complete-upload` / 任务轮询端点。
14. 实现前端：`login`、`layout`、路由守卫、axios refresh single-flight、权限菜单。
15. 补充测试（见 §6）。

---

## 附录 A：关键约束清单（实现时勿违反）

1. `generation` 应用只做 AI 能力，不做业务编排。
2. `AsyncTask.result_payload` 不存大段正文。
3. `object_key` 一律后端生成，并加 DB `unique` 约束。
4. `complete-upload` 全链路幂等（含 `AsyncTask` 创建）。
5. 扩展名校验在 `init-upload`；magic bytes 校验在 `complete-upload`（从 MinIO 读文件头）；文件大小以 `stat_object` 为准；全程不信任客户端 `content_type`。
6. 鉴权判定只走 `permission_service`，视图内不散落逻辑。
7. `project` scope 解析不出 `project` → 拒绝，不默认放行。
8. 登录收尾必须手动检查 `is_active`（simplejwt 不查）。
9. 强制改密用 DRF Permission，不用 Django Middleware。
10. 内置角色不可删、`code` 不可改；`system_admin` 权限锁定为全部。
11. access token 放前端内存，refresh token 放 httpOnly Cookie。
12. `system_admin` 拥有全部 `global` 与 `project` 权限，访问任意项目不要求 `ProjectMember` 关系。
13. `has_permission` 遇未知 / `is_active=False` / `scope` 不匹配的权限码，一律拒绝，绝不默认放行。
14. `Role` 只能绑定 `scope=global` 的 `Permission`，由 `RoleService` / `RoleSerializer` 业务层强制校验。
15. `complete-upload` 文件头校验失败 → 删除 MinIO 对象 + `TenderFile` 置 `rejected`。
16. `OperationLog.actor` 可为空；失败登录用 `extra` 记录上下文，不得硬塞成某个 `User`。
17. 前端 axios 必须实现 refresh single-flight，避免 `ROTATE_REFRESH_TOKENS` 下并发刷新导致误登出。
18. `refresh` / `logout` 须校验 CSRF token（双提交 Cookie 模式）。
