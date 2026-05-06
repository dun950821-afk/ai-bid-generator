# IMA/百炼知识库互斥选择与统一API方案

## 概述

在设置中新增"知识库引擎"互斥选择（IMA 或 百炼），选择后全局所有后端检索API自动路由到对应引擎。核心思路：**策略模式 + 数据库配置驱动**，在 `RetrievalService` 层做统一抽象，业务代码无感知。

## 技术方案

| 维度 | 选择 | 理由 |
|------|------|------|
| 引擎选择存储 | `system_settings` 表，category=`knowledge_provider`，key=`active_provider`，value=`bailian`\|`ima` | 复用现有设置体系，前端保存逻辑一致 |
| 后端路由策略 | 在 `RetrievalService` 层增加 provider 分发 | 调用方（生成API、搜索API）零改动 |
| IMA适配层 | 新建 `lib/services/retrieval/ima-provider.ts`，实现与百炼相同的 `retrieve` 接口 | 统一返回格式，与 `FullRetrievalService` 无缝衔接 |
| 前端知识库列表 | 根据 `active_provider` 显示对应列表（百炼走现有API，IMA走IMA列表API） | 避免两套列表混在一起 |
| 缓存 | 切换引擎时清除 `BailianKnowledgeService` 单例缓存 | 防止切换后仍用旧引擎 |

## 功能模块

### 1. 数据库：知识库引擎选择配置

`system_settings` 新增记录：
```
category: knowledge_provider
key: active_provider
value: bailian | ima
```

### 2. 后端：统一检索路由层

在 `src/lib/services/retrieval/index.ts` 的 `RetrievalService` 中：

```
retrieve() {
  provider = await getActiveProvider()  // 读DB配置
  if provider === 'ima' → IMAProvider.retrieve()
  else → BailianProvider.retrieve()（现有逻辑）
}
```

新建 `src/lib/services/retrieval/ima-provider.ts`：
- 从DB读IMA配置（api_key, knowledge_base_id）
- 调用 IMA 搜索 API
- 将结果转为 `RetrievedDocument[]` 统一格式

### 3. 后端：FullRetrievalService 适配

`FullRetrievalService.executeSingleQuery()` 内部调 `getBailianKnowledgeService().retrieve()`。
改造为：调 `getProviderRetrieveFn()` 返回的 retrieve 函数，根据 active_provider 动态选择。

### 4. 前端：设置页面 - 知识库引擎选择

将 IMA 和百炼两个 Tab 合并为"知识库"Tab，顶部增加引擎切换 RadioGroup：
- 选择"百炼" → 显示百炼配置项（access_key_id, access_key_secret, workspace_id）
- 选择"IMA" → 显示IMA配置项（api_key, app_id, knowledge_base_id）
- 切换引擎时自动保存 `active_provider`

### 5. 前端：知识库列表页适配

首页和知识库详情页根据 `active_provider` 决定调用哪套 API：
- `bailian` → 现有 `/api/bailian/knowledge-bases` 等
- `ima` → 新增 `/api/ima/knowledge-bases` 列表API

## 是否有原型设计

是

## 实施步骤

1. **阶段一：原型设计** — 加载 design-canvas 技能，设计"知识库引擎选择"设置面板原型（合并百炼/IMA为统一Tab + RadioGroup切换），以及知识库列表页根据引擎切换的交互原型 — 涉及文件：原型 HTML

2. **阶段二：数据库与后端配置层** — 新增 `knowledge_provider.active_provider` 配置项，创建 `src/lib/services/retrieval/provider.ts`（读取active_provider、获取IMA配置） — 涉及文件：`src/lib/services/retrieval/provider.ts`

3. **阶段二：IMA Provider 实现** — 创建 `src/lib/services/retrieval/ima-provider.ts`，实现 IMA 检索适配器，将 IMA API 响应转为 `RetrievedDocument[]` 统一格式 — 涉及文件：`src/lib/services/retrieval/ima-provider.ts`

4. **阶段二：统一检索路由** — 改造 `RetrievalService` 和 `FullRetrievalService`，根据 `active_provider` 分发到百炼或 IMA 引擎；切换引擎时清除缓存 — 涉及文件：`src/lib/services/retrieval/index.ts`、`src/lib/services/retrieval/full-retrieval.ts`

5. **阶段二：设置页面改造** — 合并百炼和IMA两个Tab为"知识库"Tab，顶部增加引擎切换 RadioGroup，切换后自动保存 active_provider，下方显示对应配置表单 — 涉及文件：`src/app/settings/page.tsx`

6. **阶段二：前端知识库页面适配** — 首页、知识库详情页根据 active_provider 动态调用对应API（百炼/IMA），新增 IMA 知识库列表 API — 涉及文件：`src/app/page.tsx`、`src/app/knowledge-bases/[id]/page.tsx`、`src/app/api/ima/knowledge-bases/route.ts`

7. **验证与测试** — ts-check + 服务存活 + API冒烟测试（IMA搜索、百炼搜索、切换引擎后的检索路由）

## 页面规格

##### @nav(web-topbar)
> type: topbar
> platform: web

- @page(/) 首页
- @page(/settings) 系统设置

##### @page(/settings) 系统设置

**核心职责**：管理系统配置，包括LLM、知识库引擎（互斥选择）、对象存储等
**访问路径**：顶部导航直达
**布局**：左侧Tab列表 + 右侧配置表单。知识库Tab内：顶部RadioGroup选择引擎（百炼/IMA），下方根据选择显示对应配置表单

**交互说明**

| 元素 | 动作 | 响应 | 传参 | 备注 |
|------|------|------|------|------|
| 知识库引擎 RadioGroup | 切换选择 | 自动保存 active_provider 到后端，下方表单切换显示 | provider: bailian\|ima | 互斥，切换时有确认提示 |
| 百炼配置表单 | 填写并保存 | 保存到 system_settings category=bailian | access_key_id, access_key_secret, workspace_id | 仅百炼选中时显示 |
| IMA配置表单 | 填写并保存 | 保存到 system_settings category=ima | api_key, app_id, knowledge_base_id | 仅IMA选中时显示 |
| 测试连接按钮 | 点击 | 根据当前引擎调用对应测试API | — | — |
