# P1.1 条款抽取前端接入与端到端验收（修订版）

## 一、状态概览

| 组件 | 状态 | 说明 |
|------|------|------|
| 后端 API | ✅ 完成 | 抽取、列表、详情、更新接口已实现 |
| 前端 API 客户端 | ✅ 完成 | `frontend/src/api/requirements.ts` |
| RequirementTab.vue | ⚠️ 待修改 | 模型/提示词选择未传递，删除改停用 |
| RequirementTable.vue | ✅ 完成 | 列表展示，需增加停用按钮 |
| RequirementDetailDrawer.vue | ⚠️ 待修改 | 缺少来源追踪字段展示 |
| RequirementEditDialog.vue | ✅ 完成 | 字段编辑已实现 |
| RequirementExtractToolbar.vue | ⚠️ 待重构 | 需增加提示词版本选择，emit 完整配置 |
| 后端提示词版本 API | ⚠️ 待新增 | 需轻量级接口获取指定场景的 published 版本 |

## 二、待完成任务

### 2.1 后端新增提示词版本轻量接口

**现状**: 当前只能通过 `/api/generation/prompt-templates/?scenario=requirement_extraction` 获取模板及其 `published_version`，但无法直接筛选版本状态。

**新增接口**:

```
GET /api/generation/prompt-versions/
    ?scenario=requirement_extraction
    &status=published
```

**响应**:

```json
[
  {
    "id": 1,
    "version": "1.0.0",
    "status": "published",
    "status_display": "已发布",
    "template_id": 5,
    "template_name": "条款抽取模板",
    "changelog": "初始版本",
    "created_at": "2026-05-28T10:00:00Z"
  }
]
```

**实现文件**: `backend/apps/generation/views/template_views.py`

```python
class PromptVersionByScenarioListView(generics.ListAPIView):
    """按场景获取提示词版本列表。"""
    
    serializer_class = PromptVersionSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None
    
    def get_queryset(self):
        scenario = self.request.query_params.get("scenario")
        status = self.request.query_params.get("status")
        
        queryset = PromptVersion.objects.select_related("template")
        
        if scenario:
            queryset = queryset.filter(template__scenario=scenario)
        if status:
            queryset = queryset.filter(status=status)
            
        return queryset.order_by("-created_at")
```

**URL 路由**: `backend/apps/generation/urls.py`

```python
path("prompt-versions/", PromptVersionByScenarioListView.as_view(), name="prompt-version-by-scenario"),
```

### 2.2 RequirementExtractToolbar 重构

**文件**: `frontend/src/components/requirements/RequirementExtractToolbar.vue`

**Props**:
```typescript
defineProps<{
  loading: boolean
  parsedDocumentId: number | null
}>()
```

**Emits**:
```typescript
interface ExtractPayload {
  force: boolean
  modelConfigId?: number
  promptVersionId?: number
  ragOptions: {
    enabled: boolean
    knowledge_base_ids: number[]
    query?: string
    top_k: number
    max_context_tokens: number
  }
}

defineEmits<{
  extract: [payload: ExtractPayload]
}>()
```

**状态管理**:
```typescript
// 模型选择
const selectedModelId = ref<number | null>(null)
const models = ref<ModelConfig[]>([])

// 提示词版本选择
const selectedPromptVersionId = ref<number | null>(null)
const promptVersions = ref<PromptVersion[]>([])

// RAG 配置
const ragEnabled = ref(false)
const ragConfig = ref({
  knowledge_base_ids: [] as number[],
  query: '',
  top_k: 5,
  max_context_tokens: 2000,
})

// 默认选中第一个 published 版本
watch(promptVersions, (versions) => {
  if (versions.length > 0 && !selectedPromptVersionId.value) {
    selectedPromptVersionId.value = versions[0].id
  }
})
```

**数据加载**:
```typescript
async function loadModels() {
  const res = await http.get<{ results: ModelConfig[] }>('/api/generation/model-configs/', {
    params: { is_active: true, model_type: 'chat' }
  })
  models.value = res.data?.results || []
  // 默认选中第一个
  if (models.value.length > 0 && !selectedModelId.value) {
    selectedModelId.value = models.value[0].id
  }
}

async function loadPromptVersions() {
  const res = await http.get<PromptVersion[]>('/api/generation/prompt-versions/', {
    params: { scenario: 'requirement_extraction', status: 'published' }
  })
  promptVersions.value = res.data || []
}
```

**触发抽取**:
```typescript
function handleExtract(force: boolean) {
  emit('extract', {
    force,
    modelConfigId: selectedModelId.value,
    promptVersionId: selectedPromptVersionId.value,
    ragOptions: {
      enabled: ragEnabled.value,
      ...ragConfig.value,
    },
  })
}
```

### 2.3 RequirementTab 修改

**文件**: `frontend/src/components/requirements/RequirementTab.vue`

**handleExtract 修改**:
```typescript
interface ExtractPayload {
  force: boolean
  modelConfigId?: number
  promptVersionId?: number
  ragOptions: RagOptions
}

async function handleExtract(payload: ExtractPayload) {
  extractLoading.value = true
  try {
    await extractRequirements(props.tenderFileId, {
      mode: 'hybrid',
      force: payload.force,
      model_config_id: payload.modelConfigId,
      prompt_version_id: payload.promptVersionId,
      rag_options: payload.ragOptions,
    })
    ElMessage.success('条款抽取任务已提交，请稍后刷新查看结果')
    // 不自动刷新，用户手动点击刷新按钮
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '抽取失败')
  } finally {
    extractLoading.value = false
  }
}
```

**handleView 修改**（调用完整详情 API）:
```typescript
import { getRequirement } from '@/api/requirements'

async function handleView(requirement: Requirement) {
  showDetailDrawer.value = true
  detailLoading.value = true
  try {
    const res = await getRequirement(requirement.id)
    selectedRequirement.value = res.data
  } catch (err: any) {
    ElMessage.error('加载详情失败')
    showDetailDrawer.value = false
  } finally {
    detailLoading.value = false
  }
}
```

**handleDelete 改为 handleDeactivate**:
```typescript
async function handleDeactivate(requirement: Requirement) {
  try {
    await ElMessageBox.confirm(
      `确定停用条款「${requirement.title || requirement.requirement_no}」吗？停用后将不再显示在条款列表中。`,
      '停用条款',
      { type: 'warning', confirmButtonText: '停用', cancelButtonText: '取消' }
    )
    await updateRequirement(requirement.id, { is_active: false })
    ElMessage.success('已停用')
    loadRequirements()
  } catch (err: any) {
    if (err !== 'cancel') {
      ElMessage.error(err.response?.data?.message || '操作失败')
    }
  }
}
```

**列表默认过滤 is_active=true**:
```typescript
async function loadRequirements() {
  const res = await listRequirements(props.tenderFileId, {
    parsed_document_id: props.parsedDocumentId,
    ...filters.value,
    // is_active 默认为 true，但允许用户查看已停用
    is_active: showInactive.value ? undefined : true,
  })
  // ...
}
```

### 2.4 RequirementDetailDrawer 字段扩展

**文件**: `frontend/src/components/requirements/RequirementDetailDrawer.vue`

**新增展示字段**:

```html
<el-descriptions-item label="提示词版本">
  {{ requirement.prompt_version_id || '-' }}
</el-descriptions-item>
<el-descriptions-item label="来源 PromptRun">
  {{ requirement.source_prompt_run_id || '-' }}
</el-descriptions-item>
<el-descriptions-item label="来源 Chunk">
  {{ requirement.source_chunk_id || '-' }}
</el-descriptions-item>
<el-descriptions-item label="来源页码">
  {{ formatPageRange(requirement) }}
</el-descriptions-item>
<el-descriptions-item label="来源章节" :span="2">
  {{ requirement.source_section_path || '-' }}
</el-descriptions-item>

<!-- 原始抽取结果 -->
<div class="section" v-if="requirement.raw_extracted">
  <h4>原始抽取结果</h4>
  <pre class="content-text">{{ JSON.stringify(requirement.raw_extracted, null, 2) }}</pre>
</div>

<!-- 结构化信息已有，确保展示 -->
<div class="section" v-if="hasFeatureInfo()">
  <h4>结构化信息</h4>
  <div class="feature-info">
    <div v-if="requirement.score_info && Object.keys(requirement.score_info).length">
      <strong>评分信息：</strong>
      <pre>{{ JSON.stringify(requirement.score_info, null, 2) }}</pre>
    </div>
    <div v-if="requirement.deadline_info && Object.keys(requirement.deadline_info).length">
      <strong>截止时间：</strong>
      <pre>{{ JSON.stringify(requirement.deadline_info, null, 2) }}</pre>
    </div>
    <div v-if="requirement.amount_info && Object.keys(requirement.amount_info).length">
      <strong>金额信息：</strong>
      <pre>{{ JSON.stringify(requirement.amount_info, null, 2) }}</pre>
    </div>
  </div>
</div>
```

### 2.5 RequirementTable 操作按钮修改

**文件**: `frontend/src/components/requirements/RequirementTable.vue`

**操作列修改**:
```html
<el-table-column label="操作" width="160" fixed="right">
  <template #default="{ row }">
    <el-button size="small" link @click.stop="$emit('view', row)">
      详情
    </el-button>
    <el-button
      v-if="canManage"
      size="small"
      link
      type="primary"
      @click.stop="$emit('edit', row)"
    >
      编辑
    </el-button>
    <el-button
      v-if="canManage && row.is_active"
      size="small"
      link
      type="warning"
      @click.stop="$emit('deactivate', row)"
    >
      停用
    </el-button>
    <el-button
      v-if="canManage && !row.is_active"
      size="small"
      link
      type="success"
      @click.stop="$emit('reactivate', row)"
    >
      启用
    </el-button>
  </template>
</el-table-column>
```

**Emits 修改**:
```typescript
defineEmits<{
  view: [requirement: Requirement]
  edit: [requirement: Requirement]
  deactivate: [requirement: Requirement]
  reactivate: [requirement: Requirement]
}>()
```

### 2.6 前端 API 类型扩展

**文件**: `frontend/src/api/requirements.ts`

**RagOptions 类型**:
```typescript
export interface RagOptions {
  enabled: boolean
  knowledge_base_ids: number[]
  query?: string
  top_k: number
  max_context_tokens: number
}

export interface RequirementExtractPayload {
  mode: 'rule' | 'llm' | 'hybrid'
  force?: boolean
  model_config_id?: number | null
  prompt_version_id?: number | null
  rag_options?: RagOptions | null
}
```

### 2.7 前端 API 新增提示词版本接口

**文件**: `frontend/src/api/prompt.ts`

```typescript
// 轻量级版本列表（用于选择器）
export interface PromptVersionLite {
  id: number
  version: string
  status: string
  status_display: string
  template_id: number
  template_name?: string
  changelog: string
  created_at: string
}

export const promptVersionApi = {
  listByScenario(params: { scenario: string; status?: string }) {
    return http.get<PromptVersionLite[]>('/api/generation/prompt-versions/', { params })
  },
}
```

## 三、端到端验收测试清单

### 前置条件

1. 已登录用户具有 `tender.manage` 权限
2. 已上传招标文件且状态为 `parsed` / `chunked` / `ready`
3. 后端已配置 DeepSeek 模型（`deepseek-v4-flash` / `deepseek-v4-pro`）
4. 已存在 `requirement_extraction` 场景的 PromptTemplate 且有 `published` 版本

### Test 1: 提示词版本选择

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 进入 `/tender/files/{fileId}` 条款管理 Tab | RequirementExtractToolbar 显示模型和提示词选择器 |
| 2 | 检查提示词下拉框 | 列出所有 `status=published` 的 requirement_extraction 版本 |
| 3 | 默认选中第一个 published 版本 | selectedPromptVersionId 自动设置为第一个版本 ID |

### Test 2: 模型选择

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 检查模型下拉框 | 列出所有活跃的 chat 类型模型配置 |
| 2 | 选择 "DeepSeek V4 Pro" | selectedModelId 更新为对应 ID |

### Test 3: 条款抽取触发

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 点击"开始抽取"按钮 | 按钮 loading 状态 |
| 2 | 检查 API payload | 包含 `mode`, `force`, `model_config_id`, `prompt_version_id`, `rag_options` |
| 3 | 等待返回 | 提示"条款抽取任务已提交，请稍后刷新查看结果" |
| 4 | 点击"刷新"按钮 | 列表加载新抽取的条款 |

### Test 4: 后端 PromptRun 记录验证

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 执行抽取（选择特定 PromptVersion 和 ModelConfig） | API 返回成功 |
| 2 | 查询 PromptRun 记录 | `prompt_version_id` = 选择的版本 ID，`model_config_id` = 选择的配置 ID |

### Test 5: force=true 不删除 manual 条款

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 手动创建一条 `extraction_method=manual` 的条款 | 条款保存成功 |
| 2 | 执行"强制重新抽取"（force=true） | API 返回成功 |
| 3 | 检查条款列表 | manual 条款仍然存在，rule/llm/hybrid 条款被清理后重建 |

### Test 6: 条款详情完整展示

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 点击条款"详情"按钮 | 调用 GET `/api/requirements/{id}/` |
| 2 | 检查抽屉内容 | 展示：prompt_version_id, source_prompt_run_id, source_chunk_id, source_page_start/end, source_section_path |
| 3 | 检查原始抽取结果 | raw_extracted 正确显示 JSON |
| 4 | 检查结构化信息 | score_info / deadline_info / amount_info 正确展示 |

### Test 7: 条款停用与启用

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 点击条款"停用"按钮 | 确认对话框弹出 |
| 2 | 确认停用 | 调用 PATCH `/api/requirements/{id}/` 更新 `is_active=false` |
| 3 | 条款从列表消失 | 默认列表只显示 `is_active=true` |
| 4 | 勾选"显示已停用" | 停用的条款显示，操作按钮变为"启用" |
| 5 | 点击"启用" | 调用 PATCH 更新 `is_active=true`，条款恢复正常显示 |

### Test 8: RAG 配置传递（P1.1 默认关闭）

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | RAG 开关默认关闭 | ragEnabled = false |
| 2 | 点击抽取 | payload.rag_options.enabled = false |
| 3 | 打开 RAG 开关 | 显示知识库选择、top_k、max_context_tokens 配置 |
| 4 | 选择知识库并抽取 | payload.rag_options 包含完整配置 |

### Test 9: 审核状态流程

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 新抽取的条款 | review_status = 'pending' |
| 2 | 编辑条款，修改审核状态为 'reviewed' | 保存成功 |
| 3 | 再次编辑，修改为 'confirmed' | 保存成功 |

### Test 10: 筛选功能

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 选择"条款类型" = "资格要求" | 列表仅显示 qualification 类型 |
| 2 | 选择"强制程度" = "强制" | 列表仅显示 mandatory 级别 |
| 3 | 选择"风险等级" = "高" | 列表仅显示 high 风险 |
| 4 | 输入搜索关键词 | 列表筛选包含关键词的条款 |

## 四、任务清单

| # | 任务 | 文件 | 预估工时 |
|---|------|------|----------|
| 1 | 后端新增 GET /api/generation/prompt-versions/ 接口 | views/template_views.py, urls.py | 30min |
| 2 | 前端 RequirementExtractToolbar 重构 | RequirementExtractToolbar.vue | 1h |
| 3 | 前端 RequirementTab 修改（emit 接收、详情 API、停用） | RequirementTab.vue | 45min |
| 4 | 前端 RequirementDetailDrawer 字段扩展 | RequirementDetailDrawer.vue | 20min |
| 5 | 前端 RequirementTable 操作按钮修改 | RequirementTable.vue | 15min |
| 6 | 前端 API 类型扩展 | requirements.ts, prompt.ts | 15min |
| 7 | 端到端验收测试 | 手动测试 | 1h |
| **总计** | | | **4h** |

## 五、验收标准

### 必须满足

1. ✅ 提示词版本选择器展示 published 版本列表
2. ✅ 模型选择器展示活跃 chat 模型配置
3. ✅ extractRequirements payload 包含完整参数
4. ✅ PromptRun 记录正确关联 prompt_version_id 和 model_config_id
5. ✅ force=true 不删除 manual 条款
6. ✅ 条款详情调用完整 API 并展示所有追踪字段
7. ✅ 条款"删除"改为"停用"（PATCH is_active=false）
8. ✅ 停用条款默认不显示在列表中
9. ✅ RAG 配置结构完整（P1.1 可默认关闭）

### 可选增强

10. RAG 配置 UI（知识库选择、参数配置）
11. 任务轮询（如有 task_id 返回）

## 六、后端依赖确认

| 依赖项 | 状态 | 检查命令 |
|--------|------|----------|
| DeepSeek 模型配置 | ✅ 已配置 | `GET /api/generation/model-configs/?model_type=chat` |
| requirement_extraction 提示词 | ✅ 已 seed | `python manage.py seed_prompts` 已执行 |
| CandidateSelector | ✅ 已实现 | `apps/requirements/services/candidate_selector.py` |
| RequirementMapper | ✅ 已实现 | `apps/requirements/services/requirement_mapper.py` |
| AiTaskExecutionService | ✅ 已实现 | `apps/generation/services/ai_task_execution_service.py` |

## 七、部署验证步骤

```bash
# 1. 确认模型配置
curl -s http://localhost/api/generation/model-configs/?model_type=chat | jq '.results[] | {id, display_name, model_name}'

# 2. 确认提示词版本
curl -s http://localhost/api/generation/prompt-versions/?scenario=requirement_extraction\&status=published | jq '.[] | {id, version}'

# 3. 执行条款抽取
curl -X POST http://localhost/api/requirements/files/{file_id}/extract/ \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "hybrid",
    "force": false,
    "model_config_id": 1,
    "prompt_version_id": 1,
    "rag_options": {"enabled": false}
  }'

# 4. 查看条款列表
curl -s http://localhost/api/requirements/files/{file_id}/ | jq '.count'

# 5. 查看条款详情
curl -s http://localhost/api/requirements/{id}/ | jq '{prompt_version_id, source_prompt_run_id, source_chunk_id}'
```