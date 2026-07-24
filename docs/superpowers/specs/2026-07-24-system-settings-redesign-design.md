# 系统设置页全面重设计 Spec

**日期：** 2026-07-24
**状态：** 待审查

## 1. 背景与动机

`/admin/settings` 页面（`SystemSettingsView.vue`）当前存在多个严重问题导致用户体验差：

1. **状态卡片硬编码**：「MinIO 存储: 连接正常」是写死的字符串，不刷新、不真实探测
2. **Provider 编辑 bug**：`ProviderConfigDialog.vue:15` 的 `v-if="!isEdit"` 隐藏了 provider_type 选择器，用户编辑时无法把 mock 改成真实 provider（导致条款抽取返回 0 条的根因之一）
3. **测试连接误报**：MockLLMClient 永远返回成功，导致"测试通过"但实际不调用 LLM
4. **缺少 LLM 配置告警**：默认 chat 模型指向 mock provider 时，前端没有任何提示
5. **页面布局乱**：6 个 Tab 平铺、卡片密度不一致、信息层级不清、用户不知道"哪里有问题"

本 spec 描述如何全面重设计该页面，引入健康度仪表盘、配置向导、真实探针，从根本上解决上述问题。

## 2. 目标

- Hero 状态条真实反映系统配置情况（不再硬编码）
- 配置向导支持 4 步可跳过流程，配置的项目即设为默认
- 测试连接走真实探针，杜绝误报
- Mock Provider 仅供开发调试，禁用设为默认
- 重组信息架构：6 Tab → 4 Tab
- 引入健康度评分，每项配置附"未配置影响"说明

## 3. 范围

**包含：**

- 前端 `SystemSettingsView.vue` 及其子组件全部重写
- 后端新增 `/api/settings/health/`、`/api/settings/test-connection/`、`/api/settings/setup-wizard/` 三个端点
- 后端 Provider 编辑放开 `provider_type` 修改
- 后端 Mock Provider 不可设为默认模型的校验
- 完整单元测试覆盖

**不包含：**

- 现有数据库中存量 mock 配置的迁移（保留不动，仅前端警告）
- 自动轮询/WebSocket 实时推送
- 删除现有 ProviderConfigDialog 等组件（重写而非新建）
- 国际化（沿用现有中文）
- 移动端适配（系统设置仅桌面端使用）

## 4. 关键决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 重设计范围 | C. 全面重设计 | 用户明确要求 |
| Mock 处理 | A. 仅供开发调试，禁用设为默认 | 解决 0 条抽取根因 |
| 状态刷新 | A. 纯手动刷新 | 避免后端资源占用 |
| 测试连接 | A. 后端真实探针 | 杜绝误报 |
| 存量数据 | A. 不动，只加警告 | 不破坏用户配置 |
| 首次自动弹向导 | 否 | 改为手动按钮触发 |
| 向导每步可跳过 | 是 | 不强制配置所有项 |
| 配置了即设为默认 | 是 | 向导语义清晰 |

## 5. 信息架构

### 5.1 页面布局

```
┌──────────────────────────────────────────────────────────────┐
│ 系统设置                                  [配置向导] [刷新] [一键诊断] │
├──────────────────────────────────────────────────────────────┤
│ [Mock 告警横幅] （仅当默认模型指向 mock 时显示红色横幅）                │
├──────────────────────────────────────────────────────────────┤
│  Hero 状态条                                                   │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ │
│  │ Chat 模型│ │Embedding│ │向量检索 │ │文件存储 │ │安全审计 │ │
│  │   🟢     │ │   🔴    │ │   🟡    │ │   🟢    │ │   🟢    │ │
│  │ deepseek │ │ 未配置   │ │ 未启用  │ │ MinIO   │ │ 已启用  │ │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘ │
├──────────────────────────────────────────────────────────────┤
│  配置健康度评分: 65/100  ⚠️ 3 项待修复                          │
│  [Chat 30/30] [Embedding 0/20] [RAG 10/20] [Storage 20/20]   │
│  [Security 5/10]                                              │
│  → 点击任意项跳转到对应 Tab                                     │
├──────────────────────────────────────────────────────────────┤
│  [大模型] [知识库] [文件存储] [安全审计]   ← 4 个 Tab             │
├──────────────────────────────────────────────────────────────┤
│  当前 Tab 内容（统一密度的卡片列表）                              │
└──────────────────────────────────────────────────────────────┘
```

### 5.2 Tab 合并映射

| 新 Tab | 合并来源 | 内容 |
|--------|----------|------|
| 大模型 | 原「大模型设置」独立 | Provider 管理 + ModelConfig 管理 + 默认模型设置 |
| 知识库 | 原「Embedding 配置」+「知识库 RAG」 | Embedding Provider/Model + RAG 检索参数 |
| 文件存储 | 原「对象存储」+「上传策略」 | Storage 表 + 上传模式 + CORS |
| 安全审计 | 原「安全与审计」 | 审计日志开关（保持不变） |

### 5.3 状态徽章语义

| 颜色 | 含义 | 触发条件 |
|------|------|---------|
| 🟢 绿 | 已配置且真实可用 | 有配置项 + 探针成功 |
| 🟡 黄 | 部分配置或测试未通过 | 有配置但探针失败 / RAG 启用但未配 embedding |
| 🔴 红 | 未配置 | 无任何配置项 |
| ⚫ 灰 | Mock 警告 | 默认指向 mock provider（不参与评分，独立显示告警横幅） |

### 5.4 未配置影响说明

| 徽章 | 未配置时的影响说明 |
|------|--------------------|
| Chat 模型 | 投标文件大纲生成、条款抽取、废标检查、一致性修复等所有 LLM 调用将无法执行；招标文件解析流水线中「条款抽取」阶段会一直返回空结果 |
| Embedding 模型 | 知识库 RAG 检索不可用；招标文件解析流水线中「向量嵌入」阶段被跳过；知识库管理中无法对文档建立向量索引 |
| 向量检索 | 投标内容生成时无法引用历史投标库/企业知识库，生成质量依赖单一 LLM 上下文；可通过启用 RAG 检索增强生成 |
| 文件存储 | 所有文件上传（招标文件、附件、生成文档）将失败；预览/下载不可用 |
| 安全审计 | 用户登录、模型调用、文件操作等关键行为无日志记录；安全事件无法追溯 |

## 6. 配置向导

### 6.1 入口

页面顶部「配置向导」按钮，与「刷新」「一键诊断」并列。任何状态都可点击进入（不强制首次）。

### 6.2 对话框结构

- 使用 `el-dialog`，宽度 70%
- 顶部步骤条：4 步进度可视化
- 中间内容区：当前步骤的配置表单
- 底部按钮区：【上一步】【跳过此步】【下一步/完成】

### 6.3 4 步流程

**Step 1: Chat 模型配置**

- Provider 类型（deepseek/bailian/openai，无 mock 选项）
- Base URL
- API Key
- 模型名（根据 provider 自动联动下拉）
- 「测试连接」按钮（走真实探针）
- 「设为默认 Chat 模型」复选框（默认勾选，不可取消）
- 跳过此步 → 不创建/修改任何 Provider/ModelConfig
- 测试失败 → 允许下一步，顶部黄色提示

**Step 2: Embedding 模型配置**

- Provider 类型（bailian/openai，无 mock 选项）
- Base URL / API Key / 模型名
- 测试连接（调用一次 embedding 接口验证）
- 「设为默认 Embedding 模型」复选框
- 跳过 → 保留原状；向量嵌入阶段继续显示 SKIPPED

**Step 3: 向量检索启用**

- 检索模式（关闭/混合/仅向量/仅关键词）
- Top K / 相似度阈值
- 默认 Embedding（自动填充上一步，可下拉切换）
- 跳过 → `retrieval_mode` 保持原值
- 若 Step 2 跳过：顶部黄色提示"未配置 Embedding，检索会返回空结果"

**Step 4: 文件存储配置**

- Endpoint / Public Endpoint / Access Key / Secret Key / Bucket
- 测试连接（head bucket 验证可连通）
- 上传模式（后端代理 / 浏览器直传 + CORS）
- 跳过 → 保留原 StorageConfig 与 UploadCors 配置

### 6.4 向导完成行为

1. 关闭向导对话框
2. 自动触发 Hero 状态条 + 健康度评分刷新
3. `ElMessage.success("配置已保存")`
4. 如有未通过测试的项，弹出确认框：「以下项目测试未通过：xxx，是否仍保留为默认？」

### 6.5 关键约束

- 向导中配置的项目 → 即设为默认（覆盖原默认 chat/embedding 模型；覆盖原 retrieval_mode；覆盖原 StorageConfig 默认）
- 向导中跳过的项目 → 完全不动数据库
- 向导中修改不会删除任何已有 Provider/ModelConfig（仅切换默认指向）
- Mock provider 不可在向导中选择（前端下拉不显示，后端再校验一次）

## 7. 后端 API 设计

### 7.1 健康检查聚合端点

**端点：** `GET /api/settings/health/`
**鉴权：** `system_settings.manage`
**缓存：** Redis 30 秒（key: `settings:health:{user_id}`）

**响应结构：**

```json
{
  "chat_model": {
    "status": "ok | warning | error | mock",
    "label": "deepseek-chat",
    "sublabel": "DeepSeek · 真实可用",
    "provider_type": "deepseek",
    "is_default": true,
    "is_mock": false,
    "last_probe_at": "2026-07-24T10:30:00Z",
    "last_probe_ok": true,
    "impact_hint": "投标文件大纲生成、条款抽取、废标检查、一致性修复等所有 LLM 调用将无法执行；招标文件解析流水线中「条款抽取」阶段会一直返回空结果",
    "score": 30,
    "score_max": 30
  },
  "embedding_model": {
    "status": "error",
    "label": "未配置",
    "sublabel": "",
    "impact_hint": "知识库 RAG 检索不可用；招标文件解析流水线中「向量嵌入」阶段被跳过；知识库管理中无法对文档建立向量索引",
    "score": 0,
    "score_max": 20
  },
  "rag_search": { "status": "warning", "score": 10, "score_max": 20, "...": "..." },
  "file_storage": { "status": "ok", "score": 20, "score_max": 20, "...": "..." },
  "security_audit": { "status": "warning", "score": 5, "score_max": 10, "...": "..." },
  "mock_warning": {
    "show": true,
    "level": "chat",
    "message": "当前默认 Chat 模型指向 Mock Provider，LLM 调用将返回空结果",
    "model_config_id": 2,
    "provider_id": 1
  },
  "total_score": 65,
  "total_max": 100,
  "pending_count": 3
}
```

### 7.2 一键诊断端点

**端点：** `POST /api/settings/health/diagnose/`
**行为：** 对所有已配置项做完整真实探针（不走缓存），返回与 `/health/` 相同结构的响应

### 7.3 测试连接端点

**端点：** `POST /api/settings/test-connection/`
**鉴权：** `system_settings.manage`

**Request：**

```json
{
  "provider_type": "deepseek",
  "base_url": "https://api.deepseek.com",
  "api_key": "sk-xxx",
  "model_name": "deepseek-chat",
  "test_kind": "chat"
}
```

**Response（成功）：**

```json
{
  "ok": true,
  "latency_ms": 856,
  "detail": "成功调用 /models 接口，返回 23 个模型",
  "error_code": null,
  "models_sample": ["deepseek-chat", "deepseek-coder"]
}
```

**Response（失败）：**

```json
{
  "ok": false,
  "latency_ms": 1200,
  "detail": "API key 无效：401 Unauthorized",
  "error_code": "auth_failed",
  "models_sample": null
}
```

### 7.4 探针实现策略

| Provider 类型 | chat 探针 | embedding 探针 |
|--------------|----------|---------------|
| deepseek | GET `{base_url}/models` 验证 200 + key 有效 | 不支持 |
| bailian | POST 一次 hello world 对话（qwen-turbo） | POST 一次 text-embedding-v3 测试 |
| openai | GET `{base_url}/models` | POST `{base_url}/embeddings` |
| mock | 直接返回 `{"ok": false, "error_code": "mock_not_allowed"}`，不发请求 | 同 |

**错误码：**

| error_code | 含义 |
|------------|------|
| auth_failed | 401，API key 无效 |
| model_not_found | 400 + 模型不存在 |
| provider_error | 其他 HTTP 错误 |
| timeout | 10 秒超时 |
| mock_not_allowed | Mock provider 不可测试 |

**约束：** 单次请求超时 10 秒，不重试。

### 7.5 评分规则

| 项 | 满分 | 得分规则 |
|----|------|---------|
| Chat 模型 | 30 | 30 默认模型存在 + provider_type≠mock + 探针成功；15 配置但探针失败；0 未配置 |
| Embedding 模型 | 20 | 20 默认存在 + 探针成功；10 配置但探针失败；0 未配置 |
| 向量检索 | 20 | 20 启用且有可用 embedding；10 启用但无 embedding；5 关闭；0 异常 |
| 文件存储 | 20 | 20 配置 + head bucket 成功；10 配置但探测失败；0 未配置 |
| 安全审计 | 10 | 10 启用；5 关闭（不强制启用，仅提示） |

### 7.6 向导端点

**端点：** `POST /api/settings/setup-wizard/`
**鉴权：** `system_settings.manage`

**Request：**

```json
{
  "steps": {
    "chat_model": {
      "provider_type": "deepseek",
      "base_url": "https://api.deepseek.com",
      "api_key": "sk-xxx",
      "model_name": "deepseek-chat"
    },
    "embedding_model": null,
    "rag_search": null,
    "file_storage": {
      "endpoint": "minio:9000",
      "public_endpoint": "163.7.6.60:9000",
      "access_key": "minioadmin",
      "secret_key": "minioadmin",
      "bucket": "bid-files",
      "upload_mode": "proxy"
    }
  }
}
```

`null` 表示该步骤被跳过，不写数据库。

**响应：** 返回最新 health 状态（同 GET /api/settings/health/）

**后端保存逻辑：**

1. chat_model 步骤非 null → `update_or_create` ProviderConfig + ModelConfig + 设为默认 chat（清除其他默认）
2. embedding_model 步骤非 null → 同上，设为默认 embedding
3. rag_search 步骤非 null → 更新 RagSettings
4. file_storage 步骤非 null → `update_or_create` StorageConfig + UploadCors
5. 任一步骤 provider_type='mock' → 400 `mock_not_allowed`
6. 完成后清空 health Redis 缓存，返回最新状态

### 7.7 Provider 编辑放开 provider_type

`ProviderConfigSerializer.validate()` 新增校验：

- 如果是编辑且 provider_type 变更，需检查 Provider 下是否有 ModelConfig
- 若有 → 400「请先删除该 Provider 下所有 ModelConfig，再切换 provider_type」
- 若无 → 允许切换

### 7.8 Mock 限制（设为默认）

`ModelConfigViewSet.set_default` action 新增校验：

```python
if model_config.provider.provider_type == 'mock':
    return Response(
        {
            "detail": "Mock Provider 仅供开发调试，不能设为默认模型",
            "error_code": "mock_not_allowed_as_default"
        },
        status=status.HTTP_400_BAD_REQUEST
    )
```

## 8. 前端组件设计

### 8.1 新增组件

| 组件 | 职责 |
|------|------|
| `frontend/src/components/settings/HealthHeroBar.vue` | 顶部 5 个状态徽章 + Mock 告警横幅 |
| `frontend/src/components/settings/HealthScorePanel.vue` | 健康度评分面板（5 项进度条+影响说明） |
| `frontend/src/components/settings/SetupWizardDialog.vue` | 4 步配置向导对话框 |
| `frontend/src/components/settings/ProviderModelList.vue` | Tab 1 内 Provider + 嵌套 ModelConfig 列表 |

### 8.2 重写组件

| 组件 | 修改要点 |
|------|---------|
| `SystemSettingsView.vue` | 整体重组：Hero 条 + 评分面板 + 4 Tab，移除原硬编码状态卡 |
| `ModelSettingsPanel.vue` | 简化为只承载 Tab 1，逻辑迁移到 `ProviderModelList.vue` |
| `ProviderConfigDialog.vue` | **移除 `v-if="!isEdit"`**（line 15），允许编辑 provider_type；移除 mock 选项 |
| `ModelCard.vue` | 新增「设为默认 Chat 模型」按钮直接切换默认；mock 时按钮置灰 |
| `EmbeddingSettingsPanel.vue` | 与 RagSettingsPanel 合并，简化为单页面两块布局 |

### 8.3 保留不动

- `ProviderCard.vue`：基础卡片样式仍可用，仅微调密度
- `ModelConfigDialog.vue`：模型名下拉根据 provider_type 联动逻辑保留
- `StorageSettingsPanel.vue`：合并到 Tab 3 但内部结构基本不变
- `SecurityAuditSettingsPanel.vue`：完全不动

### 8.4 前端 API 封装

`frontend/src/api/settings.ts` 新增：

```typescript
export interface HealthItem {
  status: 'ok' | 'warning' | 'error' | 'mock'
  label: string
  sublabel?: string
  impact_hint: string
  score: number
  score_max: number
  last_probe_at?: string
  last_probe_ok?: boolean
}

export interface HealthStatus {
  chat_model: HealthItem
  embedding_model: HealthItem
  rag_search: HealthItem
  file_storage: HealthItem
  security_audit: HealthItem
  mock_warning: { show: boolean; level: string; message: string } | null
  total_score: number
  total_max: number
  pending_count: number
}

export async function getHealthStatus(): Promise<HealthStatus>
export async function diagnoseAll(): Promise<HealthStatus>
export async function testConnection(payload: TestConnectionRequest): Promise<TestConnectionResponse>
export async function submitWizard(data: SetupWizardPayload): Promise<HealthStatus>
```

## 9. 测试策略

### 9.1 后端测试（pytest）

**新增测试文件：**

| 文件 | 测试内容 |
|------|---------|
| `backend/apps/settings/tests/test_health_service.py` | HealthCheckService 评分逻辑、Mock 检测、缓存行为 |
| `backend/apps/settings/tests/test_health_api.py` | GET /api/settings/health/ 与 diagnose 端点 |
| `backend/apps/settings/tests/test_probe_service.py` | 各 provider 真实探针（用 responses mock HTTP） |
| `backend/apps/settings/tests/test_test_connection_api.py` | 测试连接端点 + Mock 拒绝 |
| `backend/apps/settings/tests/test_setup_wizard.py` | 向导端点：跳过步骤、设为默认、Mock 拒绝 |
| `backend/apps/settings/tests/test_provider_edit.py` | provider_type 编辑放开 + 切换前需清空 model |

**关键测试用例：**

- `test_total_score_100_when_all_ok`
- `test_chat_model_mock_returns_mock_status`
- `test_chat_model_not_configured_returns_error`
- `test_rag_enabled_but_no_embedding_returns_warning`
- `test_health_status_cached_in_redis`
- `test_diagnose_bypasses_cache`
- `test_deepseek_probe_success_returns_models`
- `test_deepseek_probe_401_returns_auth_failed`
- `test_mock_probe_rejected_without_network`
- `test_skip_step_does_not_modify_db`
- `test_chat_step_sets_default_overrides_old`
- `test_mock_provider_rejected_in_wizard`
- `test_partial_wizard_only_configures_provided_steps`
- `test_can_change_provider_type_when_no_models`
- `test_cannot_change_provider_type_with_existing_models`

### 9.2 前端测试（vitest）

**新增测试文件：**

| 文件 | 测试内容 |
|------|---------|
| `HealthHeroBar.spec.ts` | 5 徽章渲染 + Mock 告警横幅条件渲染 |
| `HealthScorePanel.spec.ts` | 评分进度条 + 影响说明展示 |
| `SetupWizardDialog.spec.ts` | 4 步流程 + 跳过逻辑 + Mock 选项不显示 |
| `ProviderConfigDialog.spec.ts`（回归测试） | 编辑模式下 provider_type 下拉可见 |
| `ModelCard.spec.ts` | Mock 模型「设为默认」按钮置灰 |
| `SystemSettingsView.spec.ts` | 整页组装：Hero + 评分 + Tab 切换 |

**关键测试用例：**

- `renders 5 status badges`
- `shows red mock banner when mock_warning.show is true`
- `hides mock banner when show is false`
- `emits refresh event on button click`
- `emits diagnose event on button click`
- `navigates to corresponding tab on badge click`
- `renders 4 step indicators`
- `step 1 form shows provider_type dropdown without mock option`
- `skip button does not submit current step data`
- `next button validates required fields`
- `test connection button calls testConnection API`
- `submit sends only non-skipped steps`
- `cancel without submission does not modify anything`
- `shows provider_type dropdown in edit mode`（回归）
- `disables provider_type change when provider has models`

### 9.3 手动验收清单

部署到 http://163.7.6.60 后验证：

1. 进入 `/admin/settings`，Hero 状态条显示真实状态（不再硬编码"连接正常"）
2. 当前默认 Chat 模型指向 mock → 顶部红色 Mock 告警横幅
3. 点击「配置向导」→ 4 步流程，每步可跳过
4. 跳过 Embedding 步骤 → 完成后 Embedding 仍显示未配置
5. 配置 DeepSeek → 测试连接走真实 /models 接口 → 通过后设为默认 → Mock 告警消失
6. 编辑现有 Mock Provider → 可修改 provider_type 为 deepseek（前提：先删除其下 ModelConfig）
7. 尝试将 mock ModelConfig 设为默认 → 按钮置灰，无法点击
8. 点击「一键诊断」→ 对所有已配置项做真实探针 → 结果反映在 Hero 状态条
9. Hero 徽章点击 → 跳转到对应 Tab
10. 评分项点击 → 跳转到对应 Tab

## 10. 实施计划

| 阶段 | 内容 | 预估 |
|------|------|------|
| 1 | 后端探针服务 + 测试连接端点 + 单测 | 1 天 |
| 2 | 后端 HealthCheck 服务 + /health/ 端点 + Redis 缓存 + 单测 | 0.5 天 |
| 3 | 后端向导端点 + Mock 限制中间件 + 单测 | 0.5 天 |
| 4 | 后端 Provider 编辑放开 provider_type + 单测 | 0.5 天 |
| 5 | 前端 API 封装 + 类型定义 | 0.5 天 |
| 6 | 前端 HealthHeroBar + HealthScorePanel 组件 + 测试 | 1 天 |
| 7 | 前端 SetupWizardDialog 组件 + 测试 | 1 天 |
| 8 | 前端重写 SystemSettingsView（4 Tab 重组）+ 测试 | 1 天 |
| 9 | 前端修复 ProviderConfigDialog + ModelCard Mock 限制 + 测试 | 0.5 天 |
| 10 | 端到端手动验收 + 修复回归 | 0.5 天 |
| **合计** | | **7 天** |

**提交策略：**

- 后端阶段（1-4）：合并为 1 个 commit `feat(settings): 系统设置健康检查与测试连接探针`
- 前端阶段（5-9）：分 2-3 个 commit，按组件聚合
- 阶段 10：`test(settings): 端到端验收与回归修复`

## 11. 风险与缓解

| 风险 | 缓解 |
|------|------|
| 真实探针调用慢（deepseek 海外接口） | 10 秒超时 + 不重试，前端 loading 态明确 |
| 用户编辑 provider_type 后旧 model 失效 | 强制校验：切换前必须删除其下 ModelConfig |
| 向导跳过步骤后默认指向仍为旧 mock | 跳过不写库；用户需主动通过 Tab 编辑或重新跑向导 |
| 缓存导致用户改了配置但状态不刷新 | 保存/向导完成时主动清缓存；前端手动「刷新」按钮 |
| Mock 限制导致存量用户无法使用 | 存量数据不动；仅禁止设为默认，可编辑/删除 |

## 12. 不在范围内

- 存量 mock 配置自动迁移（用户手动编辑）
- WebSocket 实时推送
- 移动端适配
- 国际化
- 新增 Provider 类型支持（如 Anthropic/Claude）
- 后端 audit_log 实际启用逻辑（仅在 Hero 显示开关状态）
