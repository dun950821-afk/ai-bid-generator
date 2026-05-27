# Phase 6.3: Prompt Playground / Prompt IDE 增强 - 设计文档

## 1. 概述

### 1.1 目标

将现有提示词管理从"模板 CRUD + 版本管理"升级为完整的调试开发环境：

- 提示词模板 + 版本管理（已有）
- 调试台（新增）
- 模型选择（新增）
- 变量输入（新增）
- RAG 注入（新增）
- Prompt 预览（新增）
- 试运行（新增）
- 输出校验（新增）
- PromptRun 追踪（新增）
- Token / 耗时 / 错误分析（新增）

### 1.2 参考

本设计参考 Dify 的成熟实现模式：
- 前端：`web/service/debug.ts`、`web/service/log.ts`、`web/service/use-models.ts`、`web/app/components/workflow/run/`
- 后端：`api/core/prompt/`、`api/core/model_manager.py`、`api/core/rag/`、`api/core/ops/`

### 1.3 实现策略

采用**分阶段渐进实现**：
- 阶段 1：后端 API + 数据模型
- 阶段 2：前端骨架页面
- 阶段 3：前端组件完善与交互体验

---

## 2. 阶段 1：后端 API + 数据模型

### 2.1 数据模型变更

**PromptRun 新增字段：**

```python
# backend/apps/generation/models/prompt_run.py

metadata = models.JSONField(
    "元数据",
    default=dict,
    blank=True,
    help_text="存储 schema_valid、schema_errors、rag 相关信息",
)

created_by = models.ForeignKey(
    settings.AUTH_USER_MODEL,
    on_delete=models.SET_NULL,
    null=True,
    blank=True,
    verbose_name="创建人",
)
```

**PromptRunStatus 状态更新：**

```python
class PromptRunStatus:
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    SCHEMA_FAILED = "schema_failed"  # 新增

    CHOICES = [
        (RUNNING, "运行中"),
        (SUCCESS, "成功"),
        (FAILED, "失败"),
        (SCHEMA_FAILED, "结构校验失败"),
    ]
```

**迁移命令：**
```bash
python manage.py makemigrations generation --name add_prompt_run_metadata
python manage.py migrate
```

### 2.2 model_config_id 处理规则

```python
def resolve_model_config(model_config_id: int | None, request) -> ModelConfig:
    """解析模型配置"""
    if model_config_id:
        config = ModelConfig.objects.filter(
            pk=model_config_id,
            is_active=True,
            model_type=ModelType.CHAT,
        ).first()
        if not config:
            raise ValidationError("指定的模型不存在或不可用")
        return config

    # 未传则使用默认 Chat 模型
    default = ModelConfig.objects.filter(
        model_type=ModelType.CHAT,
        is_default=True,
        is_active=True,
    ).first()
    if not default:
        raise ValidationError("未配置默认 Chat 模型，请先在系统设置中配置")
    return default
```

### 2.3 缺失变量处理规则

- **render 接口**：允许缺失变量，只返回 `missing_variables` 列表提示
- **run 接口**：缺失变量时返回 400，不调用 LLM

```python
# run 接口校验
if missing:
    raise ValidationError({
        "missing_variables": missing,
        "detail": f"缺失变量: {', '.join(missing)}，请补全后再运行"
    })
```

### 2.4 RAG 集成流程

```python
rag_info = {"enabled": False}

if rag_options.get("enabled"):
    # 1. 执行检索
    retrieval = RetrievalService().search(
        query=rag_options["query"],
        knowledge_base_ids=rag_options["knowledge_base_ids"],
        top_k=rag_options.get("top_k", 5),
        filters=rag_options.get("filters"),
        created_by=request.user,
    )

    # 2. 构造 context
    rag_context = RagContextBuilder().build(
        retrieval["results"],
        max_tokens=rag_options.get("max_context_tokens", 4000),
    )

    # 3. 注入变量
    variables["retrieved_knowledge"] = rag_context["text"]
    variables["retrieval_sources"] = rag_context["sources"]

    # 4. 构造 rag_info（用于返回）
    rag_info = {
        "enabled": True,
        "retrieval_log_id": retrieval["log_id"],
        "sources": rag_context["sources"],
        "context_token_count": rag_context["token_count"],
    }

    # 5. 写入 metadata（run 阶段）
    metadata["rag_enabled"] = True
    metadata["retrieval_log_id"] = retrieval["log_id"]
    metadata["retrieval_sources"] = rag_context["sources"]
    metadata["rag_context_preview"] = rag_context["text"][:2000]

# run 完成后反向绑定
RetrievalLog.objects.filter(id=retrieval["log_id"]).update(prompt_run=prompt_run)
```

### 2.5 输出 Schema 校验流程

```python
# 解析输出
output_json = {}
try:
    if response.text:
        output_json = json.loads(response.text)
except JSONDecodeError:
    pass

# Schema 校验
schema_valid = True
schema_errors = []
if prompt_version.output_schema:
    result = OutputSchemaValidator().validate(output_json, prompt_version.output_schema)
    schema_valid = result["valid"]
    schema_errors = result["errors"]

# 写入 metadata
metadata["schema_valid"] = schema_valid
metadata["schema_errors"] = schema_errors

# P0: 模型调用成功但 schema 校验失败，status 仍为 success
# P1: 可添加 SCHEMA_FAILED 状态
```

### 2.6 API 路由设计

```python
# backend/apps/generation/urls.py

urlpatterns = [
    # ... 现有路由 ...

    # Playground API
    path("playground/render/", PlaygroundRenderView.as_view(), name="playground-render"),
    path("playground/run/", PlaygroundRunView.as_view(), name="playground-run"),

    # PromptRun API
    path("prompt-runs/", PromptRunListView.as_view(), name="prompt-run-list"),
    path("prompt-runs/<int:pk>/", PromptRunDetailView.as_view(), name="prompt-run-detail"),
]
```

### 2.7 API 返回结构

**POST /api/generation/playground/render/**

```json
{
  "system_prompt": "...",
  "user_prompt": "...",
  "missing_variables": [],
  "token_estimate": 980,
  "rag": {
    "enabled": true,
    "retrieval_log_id": 88,
    "sources": [],
    "context_token_count": 1200
  }
}
```

**POST /api/generation/playground/run/**

```json
{
  "run_id": 1001,
  "status": "success",
  "rendered_prompt": {
    "system_prompt": "...",
    "user_prompt": "..."
  },
  "output": {
    "raw_text": "...",
    "parsed_json": {},
    "schema_valid": true,
    "schema_errors": []
  },
  "usage": {
    "prompt_tokens": 1200,
    "completion_tokens": 800,
    "total_tokens": 2000,
    "latency_ms": 3200
  },
  "rag": {
    "enabled": true,
    "retrieval_log_id": 88,
    "sources": []
  },
  "error_message": ""
}
```

### 2.8 PromptRunListView 过滤支持

```python
def get_queryset(self):
    qs = PromptRun.objects.select_related(
        "prompt_template", "prompt_version", "model_config", "created_by"
    )

    template_id = self.request.query_params.get("template_id")
    if template_id:
        qs = qs.filter(prompt_template_id=template_id)

    version_id = self.request.query_params.get("version_id")
    if version_id:
        qs = qs.filter(prompt_version_id=version_id)

    status = self.request.query_params.get("status")
    if status:
        qs = qs.filter(status=status)

    return qs.order_by("-created_at")
```

### 2.9 权限配置

所有 API 统一使用：
```python
permission_classes = [IsAuthenticated, RequirePermission]
required_permission = "prompt_template.manage"
```

### 2.10 阶段 1 验收标准（14 条）

1. PromptRun 有 `metadata` 和 `created_by` 字段
2. `POST /api/generation/playground/render/` 返回渲染结果
3. `POST /api/generation/playground/run/` 创建 PromptRun 并返回结果
4. `GET /api/generation/prompt-runs/` 返回运行记录列表
5. `GET /api/generation/prompt-runs/{id}/` 返回运行记录详情
6. RAG 选项开启时正确调用 RetrievalService
7. 所有 API 使用 `prompt_template.manage` 权限
8. 后端测试覆盖核心逻辑
9. run 接口缺失变量时不调用模型
10. 未传 model_config_id 时自动使用默认 Chat 模型
11. 没有默认 Chat 模型时返回 400
12. RAG 开启时 PromptRun.metadata 记录 retrieval_log_id 和 retrieval_sources
13. RetrievalLog 能反向关联 PromptRun
14. PromptRun 列表支持 template_id / version_id / status 过滤

---

## 3. 阶段 2：前端骨架页面

### 3.1 新增文件清单

```
frontend/src/
├── api/
│   ├── prompt-playground.ts    # Playground API + 完整类型定义
│   └── prompt-run.ts           # PromptRun API + 完整类型定义
├── views/admin/
│   ├── PromptPlaygroundView.vue
│   ├── PromptRunListView.vue
│   └── PromptRunDetailView.vue
├── components/
│   ├── common/
│   │   └── ResizablePane.vue   # 可拖拽面板（带内存泄漏防护）
│   └── prompt/
│       ├── VersionSelector.vue          # 版本选择器（轻量）
│       ├── InputConfigPanel.vue         # 输入配置面板（轻量）
│       ├── PromptPreviewPanel.vue       # Prompt 预览面板（轻量）
│       └── PromptRunResultPanel.vue     # 运行结果面板（轻量）
```

### 3.2 API 类型定义

```typescript
// prompt-playground.ts

export interface RenderResponse {
  system_prompt: string
  user_prompt: string
  missing_variables: string[]
  token_estimate: number
  rag?: {
    enabled: boolean
    retrieval_log_id?: number | null
    sources?: unknown[]
    context_token_count?: number
  }
}

export interface RunResponse {
  run_id: number
  status: string
  rendered_prompt: {
    system_prompt: string
    user_prompt: string
  }
  output: {
    raw_text: string
    parsed_json?: unknown
    schema_valid?: boolean
    schema_errors?: string[]
  }
  usage: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
    latency_ms?: number
  }
  rag?: {
    enabled: boolean
    retrieval_log_id?: number | null
    sources?: unknown[]
  }
  error_message?: string
}

// prompt-run.ts

export interface PromptRun {
  id: number
  template_name: string
  version_number: string
  model_name: string
  scenario: string
  status: string
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  latency_ms: number
  created_at: string
  created_by_name: string | null
}

export interface PromptRunDetail extends PromptRun {
  template_key: string
  model_provider: string
  input_variables: Record<string, unknown>
  rendered_system_prompt: string
  rendered_user_prompt: string
  output_text: string
  output_json: unknown
  error_message: string
  schema_valid: boolean
  schema_errors: string[]
  rag_info: {
    enabled: boolean
    retrieval_log_id?: number | null
    sources?: unknown[]
    context_preview?: string
  }
}
```

### 3.3 路由配置

```typescript
// frontend/src/router/index.ts

{
  path: '/admin/prompts/:id/playground',
  name: 'admin-prompt-playground',
  component: () => import('@/views/admin/PromptPlaygroundView.vue'),
  meta: { title: '提示词调试台', permission: 'prompt_template.manage' },
},
{
  path: '/admin/prompt-runs',
  name: 'admin-prompt-runs',
  component: () => import('@/views/admin/PromptRunListView.vue'),
  meta: { title: '运行记录', permission: 'prompt_template.manage' },
},
{
  path: '/admin/prompt-runs/:id',
  name: 'admin-prompt-run-detail',
  component: () => import('@/views/admin/PromptRunDetailView.vue'),
  meta: { title: '运行记录详情', permission: 'prompt_template.manage' },
},
```

### 3.4 三栏布局 CSS

```css
.playground-main {
  display: grid;
  grid-template-columns: var(--left-width, 320px) minmax(0, 1fr) var(--right-width, 420px);
  gap: 12px;
  height: calc(100vh - 140px);
  min-width: 0;
  overflow: hidden;
}

.playground-pane {
  min-width: 0;
  overflow: auto;
  background: #fff;
  border-radius: 8px;
  padding: 16px;
}

/* 左栏拖拽范围：280px - 460px */
/* 右栏拖拽范围：360px - 560px */
/* 中栏自适应，不可拖拽 */
```

### 3.5 ResizablePane.vue

```vue
<template>
  <div class="resizable-pane" :style="{ '--pane-width': width + 'px' }">
    <slot />
    <div class="resize-handle" @mousedown="startResize" />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount } from 'vue'

const props = defineProps<{
  width: number
  minWidth: number
  maxWidth: number
}>()
const emit = defineEmits(['resize'])

let onMouseMove: ((e: MouseEvent) => void) | null = null
let onMouseUp: (() => void) | null = null

function startResize(e: MouseEvent) {
  e.preventDefault()
  const startX = e.clientX
  const startWidth = props.width

  document.body.style.userSelect = 'none'
  document.body.style.cursor = 'col-resize'

  onMouseMove = (e: MouseEvent) => {
    const delta = e.clientX - startX
    const newWidth = Math.max(props.minWidth, Math.min(props.maxWidth, startWidth + delta))
    emit('resize', newWidth)
  }

  onMouseUp = () => {
    if (onMouseMove) document.removeEventListener('mousemove', onMouseMove)
    if (onMouseUp) document.removeEventListener('mouseup', onMouseUp)
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp, { once: true })
}

onBeforeUnmount(() => {
  if (onMouseMove) document.removeEventListener('mousemove', onMouseMove)
  if (onMouseUp) document.removeEventListener('mouseup', onMouseUp)
  document.body.style.userSelect = ''
  document.body.style.cursor = ''
})
</script>
```

### 3.6 数据源获取（防数组类型错误）

```typescript
// 统一数组处理工具
export function normalizeList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object' && 'results' in data) {
    return Array.isArray((data as { results: unknown }).results)
      ? (data as { results: T[] }).results
      : []
  }
  return []
}

// 使用示例
const chatModels = normalizeList<ModelConfig>(res.data)
const knowledgeBases = normalizeList<KnowledgeBase>(res.data)
```

### 3.7 阶段 2 验收标准（14 条）

1. `/admin/prompts/:id/playground` 路由可访问
2. `/admin/prompt-runs` 路由可访问
3. `/admin/prompt-runs/:id` 路由可访问
4. 三栏布局可拖拽调整宽度（左栏 280-460px，右栏 360-560px）
5. 版本选择器加载 PromptVersion 列表
6. 模型选择器只显示 Chat 类型模型（调用正确 API）
7. 点击"渲染预览"调用 render API 并显示结果
8. 点击"运行测试"调用 run API 并显示结果
9. 左右栏宽度状态保存到 localStorage
10. 无权限用户显示 403 页面
11. 所有新页面 TypeScript 编译通过
12. PromptPlaygroundView 不会出现横向滚动条
13. 三栏布局在 1366px 宽度下可用
14. 所有表格/选择器数据源都保证是数组（统一处理分页响应）

---

## 4. 阶段 3：前端组件完善与交互体验

### 4.1 组件清单

```
frontend/src/components/prompt/
├── VersionSelector.vue           # 已有（阶段 2）
├── InputConfigPanel.vue          # 升级：整合变量、模型、RAG
├── PromptVariableEditor.vue      # 新增：JSON 变量编辑器
├── PromptModelSelector.vue       # 新增：模型选择器
├── PromptRagConfigPanel.vue      # 新增：RAG 配置面板
├── PromptPreviewPanel.vue        # 升级：预览 + 安全高亮 + Token
├── PromptRunResultPanel.vue      # 升级：整合输出、校验、Token、RAG
├── PromptSchemaValidationPanel.vue  # 新增：Schema 校验结果
├── PromptTokenUsage.vue          # 新增：Token 使用统计
├── PromptRagSourcesPanel.vue     # 新增：RAG 来源展示
└── PromptRunHistoryPanel.vue     # 新增：运行历史面板
```

### 4.2 安全高亮缺失变量

```vue
<script setup lang="ts">
// 安全分段渲染，无 v-html
function parsePromptParts(text: string, missingVars: string[]) {
  if (!text) return []
  const parts: { text: string; missing: boolean }[] = []
  const regex = /\{\{\s*(\w+)\s*\}\}/g
  let lastIndex = 0
  let match

  while ((match = regex.exec(text)) !== null) {
    // 普通文本部分
    if (match.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, match.index), missing: false })
    }
    // 变量部分
    const varName = match[1]
    parts.push({
      text: match[0],
      missing: missingVars.includes(varName),
    })
    lastIndex = match.index + match[0].length
  }
  // 剩余文本
  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), missing: false })
  }
  return parts
}
</script>

<template>
  <pre class="prompt-text">
    <span
      v-for="(part, index) in promptParts"
      :key="index"
      :class="{ 'missing-var': part.missing }"
    >{{ part.text }}</span>
  </pre>
</template>

<style scoped>
.missing-var {
  background-color: #fef0f0;
  color: #f56c6c;
  border-radius: 2px;
  padding: 0 2px;
}
</style>
```

### 4.3 PromptVariableEditor 校验

```typescript
function validateAndEmit() {
  if (!jsonText.value.trim()) {
    parseError.value = ''
    emit('update:variables', {})
    return
  }

  try {
    const parsed = JSON.parse(jsonText.value)

    // 必须是对象，不能是数组
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      parseError.value = '变量必须是 JSON 对象'
      emit('error', parseError.value)
      return
    }

    parseError.value = ''
    emit('update:variables', parsed)
  } catch {
    parseError.value = 'JSON 格式错误'
    emit('error', parseError.value)
  }
}
```

### 4.4 PromptRagConfigPanel 校验

```vue
<script setup lang="ts">
const ragValid = computed(() => {
  if (!props.modelValue.enabled) return true
  if (!props.modelValue.knowledge_base_ids?.length) return false
  if (!props.modelValue.query?.trim()) return false
  return true
})

defineExpose({ ragValid })
</script>
```

### 4.5 状态值前后端统一

```typescript
// constants/status.ts
export const PROMPT_RUN_STATUS = {
  RUNNING: 'running',
  SUCCESS: 'success',
  FAILED: 'failed',
  SCHEMA_FAILED: 'schema_failed',
} as const

export const STATUS_MAP: Record<string, { label: string; type: string }> = {
  running: { label: '运行中', type: 'warning' },
  success: { label: '成功', type: 'success' },
  failed: { label: '失败', type: 'danger' },
  schema_failed: { label: '结构校验失败', type: 'warning' },
}
```

### 4.6 Token 估算进度条

```vue
<template>
  <div class="token-bar">
    <el-progress
      :percentage="tokenPercentage"
      :color="tokenColor"
      :stroke-width="8"
    />
    <span class="token-text">~{{ tokenEstimate }} / {{ contextLimit }}</span>
  </div>
</template>

<script setup lang="ts">
const CONTEXT_LIMIT = 8192

const tokenPercentage = computed(() =>
  Math.min(100, (props.tokenEstimate / CONTEXT_LIMIT) * 100)
)

const tokenColor = computed(() => {
  if (tokenPercentage.value > 100) return '#f56c6c'
  if (tokenPercentage.value > 80) return '#e6a23c'
  return '#67c23a'
})
</script>
```

### 4.7 统一复制工具

```typescript
// utils/clipboard.ts
import { ElMessage } from 'element-plus'

export async function copyText(text: string, successMessage = '已复制'): Promise<boolean> {
  try {
    if (!navigator.clipboard) {
      // 降级方案
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    } else {
      await navigator.clipboard.writeText(text)
    }
    ElMessage.success(successMessage)
    return true
  } catch {
    ElMessage.error('复制失败')
    return false
  }
}
```

### 4.8 阶段 3 实现顺序

1. PromptVariableEditor.vue（变量编辑 + JSON 对象校验）
2. PromptModelSelector.vue（模型选择）
3. PromptRagConfigPanel.vue（RAG 配置 + 必填校验）
4. PromptPreviewPanel.vue（预览 + 安全高亮 + Token 进度条）
5. PromptTokenUsage.vue（Token 统计展示）
6. PromptSchemaValidationPanel.vue（Schema 校验结果）
7. PromptRagSourcesPanel.vue（RAG 来源列表）
8. PromptRunResultPanel.vue（整合输出、校验、Token、RAG）
9. PromptRunHistoryPanel.vue（历史记录 + 数组保护）
10. PromptListView / PromptVersionView 增加调试入口按钮

### 4.9 阶段 3 验收标准（26 条）

**基础功能（1-20）：**

1. 可以从提示词管理进入调试台
2. 可以选择 PromptVersion
3. 可以选择可用 chat 模型
4. 可以输入变量 JSON
5. 非法 JSON 不会提交
6. 可以渲染 Prompt 预览
7. 缺失变量会显示
8. 可以运行测试
9. 运行后生成 PromptRun
10. 可以查看 raw output
11. 可以查看 parsed JSON
12. 可以查看 schema 校验结果
13. 可以查看 token 和耗时
14. 可以查看 RAG 来源
15. 可以复制 Prompt
16. 可以复制输出结果
17. 可以查看 PromptRun 历史
18. 可以打开 PromptRun 详情页
19. RAG 开启时可以选择知识库并注入 retrieved_knowledge
20. 无权限用户不能访问 Playground

**安全与一致性（21-26）：**

21. Prompt 预览缺失变量高亮不使用 v-html，避免 XSS
22. 变量 JSON 必须是对象，数组/字符串/数字不能提交
23. RAG 开启时必须选择知识库并填写 Query
24. PromptRun 历史表格数据源必须始终为数组
25. 状态值 success/failed/running/schema_failed 前后端一致
26. 三栏页面在 1366px 屏幕下不出现横向滚动条

---

## 5. 文件变更清单

### 5.1 后端新增/修改

```
backend/apps/generation/
├── models/prompt_run.py          # 新增 metadata、created_by 字段
├── constants.py                  # 新增 SCHEMA_FAILED 状态
├── views.py                      # 新增 PlaygroundView、PromptRunListView/DetailView
├── urls.py                       # 新增路由
├── serializers/
│   └── playground_serializer.py  # 已有，可能需要调整
└── services/
    ├── prompt_render_service.py  # 已有，扩展 RAG 注入
    ├── prompt_execution_service.py # 已有，扩展 Playground 调用
    ├── output_schema_validator.py  # 新增
    └── token_usage_service.py      # 新增

backend/apps/knowledge/
└── models/retrieval_log.py       # 新增 prompt_run 外键
```

### 5.2 前端新增

```
frontend/src/
├── api/
│   ├── prompt-playground.ts      # 新增
│   └── prompt-run.ts             # 新增
├── views/admin/
│   ├── PromptPlaygroundView.vue  # 新增
│   ├── PromptRunListView.vue     # 新增
│   └── PromptRunDetailView.vue   # 新增
├── components/
│   ├── common/
│   │   └── ResizablePane.vue     # 新增
│   └── prompt/
│       ├── VersionSelector.vue
│       ├── InputConfigPanel.vue
│       ├── PromptVariableEditor.vue
│       ├── PromptModelSelector.vue
│       ├── PromptRagConfigPanel.vue
│       ├── PromptPreviewPanel.vue
│       ├── PromptRunResultPanel.vue
│       ├── PromptSchemaValidationPanel.vue
│       ├── PromptTokenUsage.vue
│       ├── PromptRagSourcesPanel.vue
│       └── PromptRunHistoryPanel.vue
├── utils/
│   ├── normalize.ts              # 新增
│   └── clipboard.ts              # 新增
└── constants/
    └── status.ts                 # 新增
```

### 5.3 数据库迁移

```bash
python manage.py makemigrations generation --name add_prompt_run_metadata
python manage.py makemigrations knowledge --name add_retrieval_log_prompt_run
python manage.py migrate
```

---

## 6. 风险与依赖

### 6.1 技术风险

- **RAG 服务依赖**：需要 Phase 6.1 的 RetrievalService 和 RagContextBuilder 正常工作
- **模型配置依赖**：需要系统设置中配置默认 Chat 模型
- **权限依赖**：需要 `prompt_template.manage` 权限已注册

### 6.2 兼容性

- **浏览器**：需要支持 `navigator.clipboard` API（Chrome 66+、Firefox 63+、Safari 13.1+）
- **屏幕尺寸**：最低支持 1366px 宽度

---

## 7. 后续优化（P1）

1. **SCHEMA_FAILED 状态**：独立的运行状态，区分模型失败和校验失败
2. **Monaco Editor**：引入代码编辑器替代 textarea
3. **Prompt 对比**：支持多个版本对比
4. **批量运行**：支持批量测试多个变量组合
5. **运行报告**：生成统计报告（成功率、平均耗时、Token 消耗）
