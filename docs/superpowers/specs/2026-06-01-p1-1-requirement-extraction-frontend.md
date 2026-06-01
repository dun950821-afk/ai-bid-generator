# P1.1 条款抽取前端接入与端到端验收

## 状态概览

| 组件 | 状态 | 备注 |
|------|------|------|
| 后端 API | ✅ 完成 | `/api/requirements/files/{file_id}/extract/`, `/api/requirements/files/{file_id}/`, `/api/requirements/{id}/` |
| 前端 API 客户端 | ✅ 完成 | `frontend/src/api/requirements.ts` |
| RequirementTab.vue | ✅ 完成 | 主容器组件，集成工具栏、表格、详情、编辑 |
| RequirementTable.vue | ✅ 完成 | 条款列表表格，支持筛选、分页、操作按钮 |
| RequirementDetailDrawer.vue | ✅ 完成 | 条款详情抽屉，展示完整信息 |
| RequirementEditDialog.vue | ✅ 完成 | 条款编辑对话框，支持字段修改 |
| RequirementExtractToolbar.vue | ⚠️ 待完善 | 模型选择未传递到 API |
| TenderFileDetailView.vue | ✅ 集成 | 已引用 RequirementTab 组件 |

## 待完善项

### 1. RequirementExtractToolbar 模型选择未传递

**现状**: 工具栏加载了模型列表，用户可选择模型，但 `handleExtract` 未将 `selectedModelId` 传递给父组件。

**修复方案**:
- 将 `selectedModelId` 通过 emit 传递给父组件
- RequirementTab.vue 接收后在 API 调用时传入 `model_config_id`

**代码改动**:

```typescript
// RequirementExtractToolbar.vue
const emit = defineEmits<{
  extract: [payload: { force: boolean; modelConfigId?: number }]
}>()

function handleExtract(force: boolean) {
  emit('extract', { force, modelConfigId: selectedModelId.value })
}

// RequirementTab.vue
async function handleExtract(payload: { force: boolean; modelConfigId?: number }) {
  extractLoading.value = true
  try {
    await extractRequirements(props.tenderFileId, {
      mode: 'hybrid',
      force: payload.force,
      model_config_id: payload.modelConfigId,
    })
    ...
  }
}
```

### 2. 条款详情数据加载

**现状**: 点击"详情"按钮时直接使用列表数据作为详情数据，未调用 `/api/requirements/{id}/` 获取完整字段。

**修复方案**:
- 在 `handleView` 中调用 `getRequirement(id)` API
- 等待数据加载后再打开抽屉

**代码改动**:

```typescript
// RequirementTab.vue
import { getRequirement } from '@/api/requirements'

async function handleView(requirement: Requirement) {
  showDetailDrawer.value = true
  // 加载完整详情
  try {
    const res = await getRequirement(requirement.id)
    selectedRequirement.value = res.data
  } catch (err) {
    ElMessage.error('加载详情失败')
    showDetailDrawer.value = false
  }
}
```

### 3. 提示词版本选择（可选增强）

**现状**: 未提供提示词版本选择器，用户无法指定使用哪个版本的 REQUIREMENT_EXTRACTION 提示词。

**方案**: 在 RequirementExtractToolbar 中添加提示词版本下拉框，调用 `/api/generation/prompts/?scenario=requirement_extraction` 获取版本列表。

**代码改动**:

```typescript
// RequirementExtractToolbar.vue
interface PromptVersion {
  id: number
  version_number: string
  display_name: string
}

const selectedPromptId = ref<number | null>(null)
const promptVersions = ref<PromptVersion[]>([])

async function loadPromptVersions() {
  try {
    const res = await http.get('/api/generation/prompts/', {
      params: { scenario: 'requirement_extraction', is_active: true }
    })
    promptVersions.value = res.data?.results || []
  } catch (err) {
    console.error('加载提示词版本失败:', err)
  }
}
```

## 端到端验收测试清单

### 前置条件

1. 已登录用户具有 `tender.manage` 权限
2. 已上传招标文件且状态为 `parsed` 或 `ready`
3. 后端已配置 DeepSeek 模型（`deepseek-v4-flash` / `deepseek-v4-pro`）
4. 已激活 REQUIREMENT_EXTRACTION 提示词版本

### 测试步骤

#### Test 1: 条款抽取触发

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 进入 `/tender/files/{fileId}` 页面 | 显示文件详情页面 |
| 2 | 切换到"条款管理" Tab | 显示 RequirementTab 组件 |
| 3 | 点击"开始抽取"按钮 | 按钮显示 loading 状态 |
| 4 | 等待 API 返回 | 提示"条款抽取任务已提交" |
| 5 | 2秒后自动刷新列表 | 显示抽取出的条款列表 |

#### Test 2: 条款筛选

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 选择"条款类型" = "资格要求" | 列表仅显示 qualification 类型条款 |
| 2 | 选择"强制程度" = "强制" | 列表仅显示 mandatory 级别条款 |
| 3 | 选择"风险等级" = "高" | 列表仅显示 high 风险条款 |
| 4 | 输入搜索关键词并回车 | 列表筛选包含关键词的条款 |
| 5 | 点击"刷新"按钮 | 重置筛选条件并重新加载 |

#### Test 3: 条款详情查看

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 点击条款行的"详情"按钮 | 打开右侧抽屉 |
| 2 | 检查抽屉内容 | 显示完整字段：类型、强制程度、风险、响应策略、来源章节、页码、置信度、内容、结构化信息 |
| 3 | 关闭抽屉 | 返回列表 |

#### Test 4: 条款编辑

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 点击条款行的"编辑"按钮 | 打开编辑对话框 |
| 2 | 修改"条款类型" | 下拉框选择有效 |
| 3 | 修改"风险等级" | 下拉框选择有效 |
| 4 | 修改"审核状态" | 下拉框选择有效 |
| 5 | 点击"保存"按钮 | 提示"保存成功"，对话框关闭，列表刷新显示新值 |

#### Test 5: 条款删除

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 点击条款行的"删除"按钮 | 弹出确认对话框 |
| 2 | 点击"确认" | 提示"删除成功"，条款从列表消失 |

#### Test 6: 强制重新抽取

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 点击"强制重新抽取"按钮 | API 调用传入 `force=true` |
| 2 | 等待返回 | 提示任务已提交 |
| 3 | 刷新后 | 旧条款被清理，新条款生成 |

#### Test 7: 模型选择传递

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 在工具栏选择模型 "DeepSeek V4 Pro" | selectedModelId = 对应 ID |
| 2 | 点击"开始抽取" | API payload 包含 `model_config_id` |
| 3 | 检查后端日志 | 使用指定模型执行抽取 |

## 修复任务清单

| # | 任务 | 文件 | 预估工时 |
|---|------|------|----------|
| 1 | 模型选择传递到 API | RequirementExtractToolbar.vue, RequirementTab.vue | 15min |
| 2 | 详情加载调用完整 API | RequirementTab.vue | 10min |
| 3 | 添加提示词版本选择器（可选） | RequirementExtractToolbar.vue | 30min |
| 4 | 端到端验收测试执行 | 手动测试 | 30min |

## 验收标准

### 必须满足

1. ✅ 条款抽取 API 正常响应
2. ✅ 条款列表正确显示和筛选
3. ✅ 条款详情完整展示
4. ✅ 条款编辑保存成功
5. ✅ 条款删除成功
6. ✅ 模型选择传递到后端

### 可选满足

7. 提示词版本选择功能
8. RAG 配置传递（rag_options）

## 后端依赖确认

| 依赖项 | 状态 | 检查方式 |
|--------|------|----------|
| DeepSeek 模型配置 | ✅ 已配置 | `/api/generation/models/` 返回 deepseek-v4-flash/pro |
| REQUIREMENT_EXTRACTION 提示词 | ✅ 已 seed | `python manage.py seed_prompts` 已执行 |
| AiTaskExecutionService | ✅ 已实现 | `apps/generation/services/ai_task_execution_service.py` |
| CandidateSelector | ✅ 已实现 | `apps/requirements/services/candidate_selector.py` |
| RequirementMapper | ✅ 已实现 | `apps/requirements/services/requirement_mapper.py` |

## 部署验证步骤

```bash
# 1. 确认后端服务正常
curl -s http://localhost/api/generation/models/ | jq '.results[].model_name'

# 2. 确认提示词已激活
curl -s http://localhost/api/generation/prompts/?scenario=requirement_extraction | jq '.results[].is_active'

# 3. 上传测试文件
# （使用已有上传流程）

# 4. 触发条款抽取
curl -X POST http://localhost/api/requirements/files/{file_id}/extract/ \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"mode": "hybrid", "force": false}'

# 5. 查看抽取结果
curl -s http://localhost/api/requirements/files/{file_id}/ | jq '.count'
```

## 预估完成时间

- 代码修复: 1h
- 端到端测试: 0.5h
- **总计: 1.5h**