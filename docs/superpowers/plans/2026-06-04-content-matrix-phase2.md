# 内容责任矩阵实现计划 - 第二阶段

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现前端矩阵编辑界面和状态展示

**Architecture:** Vue 3 组件 + TypeScript + Element Plus，通过 API 获取矩阵状态，支持编辑和版本控制

**Tech Stack:** Vue 3, TypeScript, Element Plus, Axios

---

## 文件结构

| 文件 | 职责 |
|------|------|
| `frontend/src/api/outline.ts` | 矩阵相关 API 定义 |
| `frontend/src/components/outline/MatrixStatusBadge.vue` | 矩阵状态图标组件 |
| `frontend/src/components/outline/MatrixEditDialog.vue` | 矩阵编辑对话框 |
| `frontend/src/components/outline/MatrixProgressDialog.vue` | 矩阵生成进度对话框 |
| `frontend/src/views/outline/OutlineDetailView.vue` | 集成矩阵功能 |

---

### Task 1: 更新 API 定义

**Files:**
- Modify: `frontend/src/api/outline.ts`

- [ ] **Step 1: 添加矩阵相关 API 函数**

在 `frontend/src/api/outline.ts` 中添加：

```typescript
// ========== 矩阵相关接口 ==========

export interface ContentMatrix {
  section_role: string
  write_scope: string
  exclude_scope: string
  reference_sections: Array<{ id: number; section_number: string; title: string }>
  no_duplicate_sections: Array<{ id: number; section_number: string; title: string }>
  dependency_sections: Array<{ id: number; section_number: string; title: string }>
  expression_form: string
  writing_depth: string
  related_requirements: number[]
  generation_priority: number
  ai_reasoning_summary: string
  manual_notes: string
}

export interface SectionMatrix {
  section_id: number
  content_matrix: ContentMatrix | null
  content_matrix_status: string
  content_matrix_version: number
  content_matrix_updated_at: string | null
  content_matrix_error: string
}

export interface MatrixStatus {
  total: number
  pending: number
  generating: number
  generated: number
  edited: number
  failed: number
  is_generating: boolean
  current_task_id: number | null
}

export interface GenerationTask {
  id: number
  task_type: string
  status: string
  total_count: number
  success_count: number
  failed_count: number
  skipped_count: number
  current_section_id: number | null
  current_section_title: string | null
  error_message: string
  created_at: string
  updated_at: string
  finished_at: string | null
  params: Record<string, any>
  result: Record<string, any>
}

// 获取大纲矩阵整体状态
export function getMatrixStatus(outlineId: number) {
  return http.get<MatrixStatus>(`/api/outlines/${outlineId}/matrix_status/`)
}

// 批量生成矩阵
export function generateMatrix(outlineId: number, data: {
  force?: boolean
  section_ids?: number[]
}) {
  return http.post<{ task_id: number; status: string; target_count: number }>(
    `/api/outlines/${outlineId}/generate_matrix/`,
    data
  )
}

// 重试失败的矩阵
export function retryMatrixFailed(outlineId: number) {
  return http.post<{ task_id: number; retry_count: number }>(
    `/api/outlines/${outlineId}/retry_matrix_failed/`
  )
}

// 获取章节矩阵
export function getSectionMatrix(sectionId: number) {
  return http.get<SectionMatrix>(`/api/sections/${sectionId}/matrix/`)
}

// 更新章节矩阵（乐观锁）
export function updateSectionMatrix(sectionId: number, data: {
  content_matrix_version: number
  content_matrix: Partial<ContentMatrix>
}) {
  return http.put<{
    success: boolean
    content_matrix_version: number
    content_matrix_status: string
  }>(`/api/sections/${sectionId}/matrix/`, data)
}

// 生成单章节矩阵
export function generateSectionMatrix(sectionId: number, force: boolean = false) {
  return http.post<{ task_id: number; status: string }>(
    `/api/sections/${sectionId}/generate_matrix/`,
    { force }
  )
}

// 获取生成任务状态
export function getGenerationTask(taskId: number) {
  return http.get<GenerationTask>(`/api/generation-tasks/${taskId}/`)
}

// 取消生成任务
export function cancelGenerationTask(taskId: number) {
  return http.post<{ success: boolean; status: string; message: string }>(
    `/api/generation-tasks/${taskId}/cancel/`
  )
}
```

- [ ] **Step 2: 验证 API 定义可以正常导入**

Run: `cd frontend && npm run build 2>&1 | head -20`

Expected: 无 TypeScript 错误

---

### Task 2: 创建矩阵状态徽章组件

**Files:**
- Create: `frontend/src/components/outline/MatrixStatusBadge.vue`

- [ ] **Step 1: 创建状态徽章组件**

创建 `frontend/src/components/outline/MatrixStatusBadge.vue`：

```vue
<!-- frontend/src/components/outline/MatrixStatusBadge.vue -->
<template>
  <el-tooltip :content="tooltipContent" placement="top">
    <span class="matrix-status-badge" :class="statusClass">
      <el-icon v-if="status === 'generating'" class="is-loading">
        <Loading />
      </el-icon>
      <el-icon v-else-if="status === 'generated'">
        <Check />
      </el-icon>
      <el-icon v-else-if="status === 'edited'">
        <Edit />
      </el-icon>
      <el-icon v-else-if="status === 'failed'">
        <Close />
      </el-icon>
      <el-icon v-else>
        <Clock />
      </el-icon>
      <span class="status-text">{{ statusDisplay }}</span>
    </span>
  </el-tooltip>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Loading, Check, Edit, Close, Clock } from '@element-plus/icons-vue'

const props = defineProps<{
  status: string
  error?: string
}>()

const statusMap: Record<string, { display: string; class: string; tooltip: string }> = {
  pending: { display: '待生成', class: 'status-pending', tooltip: '尚未生成内容责任矩阵' },
  generating: { display: '生成中', class: 'status-generating', tooltip: '正在 AI 生成矩阵' },
  generated: { display: '已生成', class: 'status-generated', tooltip: 'AI 已生成矩阵，可编辑确认' },
  edited: { display: '已编辑', class: 'status-edited', tooltip: '用户已手动编辑矩阵' },
  failed: { display: '失败', class: 'status-failed', tooltip: '矩阵生成失败' },
}

const statusClass = computed(() => statusMap[props.status]?.class || 'status-pending')
const statusDisplay = computed(() => statusMap[props.status]?.display || '未知')
const tooltipContent = computed(() => {
  const base = statusMap[props.status]?.tooltip || ''
  if (props.error) {
    return `${base}\n错误: ${props.error}`
  }
  return base
})
</script>

<style scoped>
.matrix-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.status-pending {
  background: #f0f0f0;
  color: #909399;
}

.status-generating {
  background: #e6f7ff;
  color: #1890ff;
}

.status-generated {
  background: #f6ffed;
  color: #52c41a;
}

.status-edited {
  background: #fff7e6;
  color: #fa8c16;
}

.status-failed {
  background: #fff2f0;
  color: #ff4d4f;
}

.is-loading {
  animation: rotate 1s linear infinite;
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
```

- [ ] **Step 2: 验证组件**

Run: `cd frontend && npm run build 2>&1 | head -20`

Expected: 无编译错误

---

### Task 3: 创建矩阵编辑对话框

**Files:**
- Create: `frontend/src/components/outline/MatrixEditDialog.vue`

- [ ] **Step 1: 创建编辑对话框组件**

创建 `frontend/src/components/outline/MatrixEditDialog.vue`：

```vue
<!-- frontend/src/components/outline/MatrixEditDialog.vue -->
<template>
  <el-dialog
    v-model="visible"
    title="编辑内容责任矩阵"
    width="800px"
    destroy-on-close
    @close="handleClose"
  >
    <el-alert
      v-if="versionConflict"
      type="error"
      title="版本冲突"
      description="矩阵内容已被其他操作更新，请刷新后再编辑。"
      :closable="false"
      show-icon
    />

    <el-form
      ref="formRef"
      :model="formData"
      :rules="formRules"
      label-width="120px"
      class="matrix-form"
    >
      <!-- 章节定位 -->
      <el-form-item label="章节定位" prop="section_role">
        <el-select v-model="formData.section_role" placeholder="选择章节定位" style="width: 100%">
          <el-option label="资格证明" value="qualification" />
          <el-option label="技术方案" value="technical_solution" />
          <el-option label="商务响应" value="business_response" />
          <el-option label="服务方案" value="service_plan" />
          <el-option label="团队介绍" value="team_intro" />
          <el-option label="附件材料" value="attachment" />
          <el-option label="其他" value="other" />
        </el-select>
      </el-form-item>

      <!-- 写作范围 -->
      <el-form-item label="本章写什么" prop="write_scope">
        <el-input
          v-model="formData.write_scope"
          type="textarea"
          :rows="4"
          placeholder="详细说明本章负责的内容范围"
        />
      </el-form-item>

      <!-- 排除范围 -->
      <el-form-item label="本章不写什么" prop="exclude_scope">
        <el-input
          v-model="formData.exclude_scope"
          type="textarea"
          :rows="3"
          placeholder="明确说明本章不负责的内容"
        />
      </el-form-item>

      <!-- 建议表达形式 -->
      <el-form-item label="表达形式" prop="expression_form">
        <el-select v-model="formData.expression_form" placeholder="选择表达形式" style="width: 100%">
          <el-option label="正文" value="body_text" />
          <el-option label="表格" value="table" />
          <el-option label="承诺函" value="commitment_letter" />
          <el-option label="证明材料" value="certificate" />
          <el-option label="附件索引" value="attachment_index" />
          <el-option label="简历表" value="resume_table" />
          <el-option label="混合形式" value="mixed" />
        </el-select>
      </el-form-item>

      <!-- 写作深度 -->
      <el-form-item label="写作深度" prop="writing_depth">
        <el-select v-model="formData.writing_depth" placeholder="选择写作深度" style="width: 100%">
          <el-option label="概述" value="overview" />
          <el-option label="适度展开" value="moderate" />
          <el-option label="详细展开" value="detailed" />
        </el-select>
      </el-form-item>

      <!-- 生成优先级 -->
      <el-form-item label="生成优先级" prop="generation_priority">
        <el-slider
          v-model="formData.generation_priority"
          :min="0"
          :max="100"
          :step="10"
          show-stops
          :marks="priorityMarks"
        />
        <div class="priority-hint">
          <span>数值越大，正文生成越靠前。叶子章节建议 80-100，父章节建议 20-40。</span>
        </div>
      </el-form-item>

      <!-- AI 划分说明 -->
      <el-form-item label="AI 划分说明">
        <el-input
          v-model="formData.ai_reasoning_summary"
          type="textarea"
          :rows="2"
          disabled
          placeholder="AI 生成的边界划分依据"
        />
      </el-form-item>

      <!-- 人工备注 -->
      <el-form-item label="人工备注">
        <el-input
          v-model="formData.manual_notes"
          type="textarea"
          :rows="3"
          placeholder="补充自定义要求（高优先级）"
        />
      </el-form-item>

      <!-- 引用章节 -->
      <el-form-item label="可引用章节">
        <el-tag
          v-for="section in formData.reference_sections"
          :key="section.id"
          type="info"
          class="section-tag"
        >
          {{ section.section_number }} {{ section.title }}
        </el-tag>
        <el-button text type="primary" @click="showReferenceSelector = true">
          添加引用
        </el-button>
      </el-form-item>

      <!-- 禁止重复章节 -->
      <el-form-item label="禁止重复章节">
        <el-tag
          v-for="section in formData.no_duplicate_sections"
          :key="section.id"
          type="warning"
          class="section-tag"
        >
          {{ section.section_number }} {{ section.title }}
        </el-tag>
        <el-button text type="primary" @click="showNoDuplicateSelector = true">
          添加禁止
        </el-button>
      </el-form-item>

      <!-- 依赖章节 -->
      <el-form-item label="依赖章节">
        <el-tag
          v-for="section in formData.dependency_sections"
          :key="section.id"
          type="success"
          class="section-tag"
        >
          {{ section.section_number }} {{ section.title }}
        </el-tag>
        <el-button text type="primary" @click="showDependencySelector = true">
          添加依赖
        </el-button>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="handleClose">取消</el-button>
      <el-button type="primary" @click="handleSave" :loading="saving">保存</el-button>
    </template>
  </el-dialog>

  <!-- 章节选择器对话框 -->
  <el-dialog
    v-model="showReferenceSelector"
    title="选择可引用章节"
    width="500px"
  >
    <el-checkbox-group v-model="selectedReferenceIds">
      <el-checkbox
        v-for="section in allSections"
        :key="section.id"
        :label="section.id"
        :disabled="section.id === currentSectionId"
      >
        {{ section.section_number }} {{ section.title }}
      </el-checkbox>
    </el-checkbox-group>
    <template #footer>
      <el-button @click="showReferenceSelector = false">取消</el-button>
      <el-button type="primary" @click="confirmReferenceSelection">确认</el-button>
    </template>
  </el-dialog>

  <el-dialog
    v-model="showNoDuplicateSelector"
    title="选择禁止重复章节"
    width="500px"
  >
    <el-checkbox-group v-model="selectedNoDuplicateIds">
      <el-checkbox
        v-for="section in allSections"
        :key="section.id"
        :label="section.id"
        :disabled="section.id === currentSectionId"
      >
        {{ section.section_number }} {{ section.title }}
      </el-checkbox>
    </el-checkbox-group>
    <template #footer>
      <el-button @click="showNoDuplicateSelector = false">取消</el-button>
      <el-button type="primary" @click="confirmNoDuplicateSelection">确认</el-button>
    </template>
  </el-dialog>

  <el-dialog
    v-model="showDependencySelector"
    title="选择依赖章节"
    width="500px"
  >
    <el-checkbox-group v-model="selectedDependencyIds">
      <el-checkbox
        v-for="section in allSections"
        :key="section.id"
        :label="section.id"
        :disabled="section.id === currentSectionId"
      >
        {{ section.section_number }} {{ section.title }}
      </el-checkbox>
    </el-checkbox-group>
    <template #footer>
      <el-button @click="showDependencySelector = false">取消</el-button>
      <el-button type="primary" @click="confirmDependencySelection">确认</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { getSectionMatrix, updateSectionMatrix, type ContentMatrix, type SectionMatrix } from '@/api/outline'

const props = defineProps<{
  sectionId: number
  currentSectionId: number
  allSections: Array<{ id: number; section_number: string; title: string }>
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'saved'): void
}>()

const visible = defineModel<boolean>('visible')
const saving = ref(false)
const versionConflict = ref(false)

const formRef = ref<FormInstance>()
const originalVersion = ref(1)

const formData = ref<Partial<ContentMatrix>>({
  section_role: '',
  write_scope: '',
  exclude_scope: '',
  reference_sections: [],
  no_duplicate_sections: [],
  dependency_sections: [],
  expression_form: 'body_text',
  writing_depth: 'detailed',
  related_requirements: [],
  generation_priority: 50,
  ai_reasoning_summary: '',
  manual_notes: '',
})

const formRules: FormRules = {
  write_scope: [
    { required: true, message: '请填写本章写什么', trigger: 'blur' },
    { min: 10, message: '写作范围描述至少 10 个字符', trigger: 'blur' },
  ],
}

const priorityMarks = {
  0: '最后',
  20: '父章节',
  50: '普通',
  80: '优先',
  100: '最优先',
}

// 章节选择器
const showReferenceSelector = ref(false)
const showNoDuplicateSelector = ref(false)
const showDependencySelector = ref(false)

const selectedReferenceIds = ref<number[]>([])
const selectedNoDuplicateIds = ref<number[]>([])
const selectedDependencyIds = ref<number[]>([])

// 加载矩阵数据
async function loadMatrix() {
  try {
    const res = await getSectionMatrix(props.sectionId)
    const data = res.data as SectionMatrix
    
    originalVersion.value = data.content_matrix_version
    if (data.content_matrix) {
      formData.value = { ...data.content_matrix }
    }
    
    // 初始化选中列表
    selectedReferenceIds.value = formData.value.reference_sections?.map(s => s.id) || []
    selectedNoDuplicateIds.value = formData.value.no_duplicate_sections?.map(s => s.id) || []
    selectedDependencyIds.value = formData.value.dependency_sections?.map(s => s.id) || []
    
    versionConflict.value = false
  } catch (err) {
    console.error('加载矩阵失败:', err)
    ElMessage.error('加载矩阵失败')
  }
}

// 确认引用章节选择
function confirmReferenceSelection() {
  formData.value.reference_sections = selectedReferenceIds.value
    .map(id => props.allSections.find(s => s.id === id))
    .filter(Boolean)
    .map(s => ({ id: s!.id, section_number: s!.section_number, title: s!.title }))
  showReferenceSelector.value = false
}

// 确认禁止重复章节选择
function confirmNoDuplicateSelection() {
  formData.value.no_duplicate_sections = selectedNoDuplicateIds.value
    .map(id => props.allSections.find(s => s.id === id))
    .filter(Boolean)
    .map(s => ({ id: s!.id, section_number: s!.section_number, title: s!.title }))
  showNoDuplicateSelector.value = false
}

// 确认依赖章节选择
function confirmDependencySelection() {
  formData.value.dependency_sections = selectedDependencyIds.value
    .map(id => props.allSections.find(s => s.id === id))
    .filter(Boolean)
    .map(s => ({ id: s!.id, section_number: s!.section_number, title: s!.title }))
  showDependencySelector.value = false
}

// 保存矩阵
async function handleSave() {
  if (!formRef.value) return
  
  await formRef.value.validate()
  
  saving.value = true
  versionConflict.value = false
  
  try {
    const res = await updateSectionMatrix(props.sectionId, {
      content_matrix_version: originalVersion.value,
      content_matrix: formData.value,
    })
    
    const result = res.data as any
    if (result.success) {
      ElMessage.success('矩阵已保存')
      emit('saved')
      visible.value = false
    } else if (result.error_code === 'VERSION_CONFLICT') {
      versionConflict.value = true
      ElMessage.error('矩阵已被其他操作更新，请刷新后重试')
    }
  } catch (err: any) {
    if (err.response?.data?.error_code === 'VERSION_CONFLICT') {
      versionConflict.value = true
      ElMessage.error('矩阵已被其他操作更新，请刷新后重试')
    } else {
      console.error('保存矩阵失败:', err)
      ElMessage.error(err.response?.data?.message || '保存失败')
    }
  } finally {
    saving.value = false
  }
}

function handleClose() {
  visible.value = false
}

// 监听对话框打开，加载数据
watch(visible, (val) => {
  if (val) {
    loadMatrix()
  }
})
</script>

<style scoped>
.matrix-form {
  max-height: 500px;
  overflow-y: auto;
}

.section-tag {
  margin-right: 8px;
  margin-bottom: 4px;
}

.priority-hint {
  font-size: 12px;
  color: #909399;
  margin-top: 8px;
}
</style>
```

- [ ] **Step 2: 验证组件**

Run: `cd frontend && npm run build 2>&1 | head -30`

Expected: 无编译错误

---

### Task 4: 创建矩阵生成进度对话框

**Files:**
- Create: `frontend/src/components/outline/MatrixProgressDialog.vue`

- [ ] **Step 1: 创建进度对话框组件**

创建 `frontend/src/components/outline/MatrixProgressDialog.vue`：

```vue
<!-- frontend/src/components/outline/MatrixProgressDialog.vue -->
<template>
  <el-dialog
    v-model="visible"
    title="矩阵生成进度"
    width="500px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    @close="handleClose"
  >
    <div class="progress-content">
      <!-- 总体进度 -->
      <el-progress
        :percentage="overallPercentage"
        :status="progressStatus"
        :stroke-width="20"
      />
      
      <div class="progress-stats">
        <span>总计: {{ task.total_count }}</span>
        <span>成功: {{ task.success_count }}</span>
        <span>失败: {{ task.failed_count }}</span>
      </div>

      <!-- 当前处理章节 -->
      <div v-if="task.status === 'running'" class="current-section">
        <el-icon class="is-loading"><Loading /></el-icon>
        <span>正在处理: {{ task.current_section_title || '准备中...' }}</span>
      </div>

      <!-- 状态消息 -->
      <el-alert
        v-if="task.status === 'failed'"
        type="error"
        :title="`生成失败: ${task.error_message}`"
        :closable="false"
        show-icon
      />

      <el-alert
        v-if="task.status === 'partial_success'"
        type="warning"
        :title="`部分成功: 成功 ${task.success_count}, 失败 ${task.failed_count}`"
        :closable="false"
        show-icon
      />

      <el-alert
        v-if="task.status === 'success'"
        type="success"
        title="矩阵生成完成"
        :closable="false"
        show-icon
      />
    </div>

    <template #footer>
      <el-button
        v-if="task.status === 'running'"
        type="danger"
        @click="handleCancel"
        :loading="canceling"
      >
        取消任务
      </el-button>
      <el-button
        v-if="['success', 'failed', 'partial_success'].includes(task.status)"
        type="primary"
        @click="handleClose"
      >
        关闭
      </el-button>
      <el-button
        v-if="task.status === 'failed' || task.status === 'partial_success'"
        @click="handleRetry"
      >
        重试失败
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import { getGenerationTask, cancelGenerationTask, retryMatrixFailed, type GenerationTask } from '@/api/outline'

const props = defineProps<{
  taskId: number
  outlineId: number
}>()

const visible = defineModel<boolean>('visible')
const canceling = ref(false)

const task = ref<GenerationTask>({
  id: 0,
  task_type: '',
  status: 'pending',
  total_count: 0,
  success_count: 0,
  failed_count: 0,
  skipped_count: 0,
  current_section_id: null,
  current_section_title: null,
  error_message: '',
  created_at: '',
  updated_at: '',
  finished_at: null,
  params: {},
  result: {},
})

let pollTimer: ReturnType<typeof setInterval> | null = null

const overallPercentage = computed(() => {
  if (task.value.total_count === 0) return 0
  const completed = task.value.success_count + task.value.failed_count + task.value.skipped_count
  return Math.round((completed / task.value.total_count) * 100)
})

const progressStatus = computed(() => {
  if (task.value.status === 'success') return 'success'
  if (task.value.status === 'failed') return 'exception'
  return undefined
})

// 轮询任务状态
async function pollTaskStatus() {
  try {
    const res = await getGenerationTask(props.taskId)
    task.value = res.data as GenerationTask
    
    // 如果任务完成，停止轮询
    if (['success', 'failed', 'partial_success', 'cancelled'].includes(task.value.status)) {
      stopPolling()
    }
  } catch (err) {
    console.error('查询任务状态失败:', err)
  }
}

function startPolling() {
  pollTaskStatus() // 立即查询一次
  pollTimer = setInterval(pollTaskStatus, 3000) // 每 3 秒轮询
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

// 取消任务
async function handleCancel() {
  canceling.value = true
  try {
    const res = await cancelGenerationTask(props.taskId)
    if (res.data.success) {
      ElMessage.success('已请求取消任务')
      task.value.status = 'cancel_requested'
      stopPolling()
    }
  } catch (err) {
    console.error('取消任务失败:', err)
    ElMessage.error('取消失败')
  } finally {
    canceling.value = false
  }
}

// 重试失败
async function handleRetry() {
  try {
    const res = await retryMatrixFailed(props.outlineId)
    if (res.data.retry_count > 0) {
      ElMessage.success(`已提交重试，共 ${res.data.retry_count} 个章节`)
      visible.value = false
    } else {
      ElMessage.info('没有需要重试的章节')
    }
  } catch (err) {
    console.error('重试失败:', err)
    ElMessage.error('重试提交失败')
  }
}

function handleClose() {
  stopPolling()
  visible.value = false
}

// 监听对话框打开
watch(visible, (val) => {
  if (val) {
    task.value = {
      id: props.taskId,
      task_type: 'matrix_generation',
      status: 'pending',
      total_count: 0,
      success_count: 0,
      failed_count: 0,
      skipped_count: 0,
      current_section_id: null,
      current_section_title: null,
      error_message: '',
      created_at: '',
      updated_at: '',
      finished_at: null,
      params: {},
      result: {},
    }
    startPolling()
  } else {
    stopPolling()
  }
})

// 清理
onUnmounted(() => {
  stopPolling()
})
</script>

<style scoped>
.progress-content {
  padding: 20px 0;
}

.progress-stats {
  display: flex;
  justify-content: space-around;
  margin-top: 16px;
  font-size: 14px;
  color: #606266;
}

.current-section {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
  color: #409eff;
}

.is-loading {
  animation: rotate 1s linear infinite;
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
```

- [ ] **Step 2: 验证组件**

Run: `cd frontend && npm run build 2>&1 | head -30`

Expected: 无编译错误

---

### Task 5: 集成到大纲详情页

**Files:**
- Modify: `frontend/src/views/outline/OutlineDetailView.vue`

- [ ] **Step 1: 在大纲详情页添加矩阵状态展示和操作**

修改 `frontend/src/views/outline/OutlineDetailView.vue`，添加矩阵相关功能。

需要：
1. 导入矩阵相关组件和 API
2. 在页面头部添加矩阵状态摘要
3. 在章节树中显示矩阵状态徽章
4. 添加矩阵编辑和生成按钮
5. 添加矩阵生成进度对话框

主要修改点：

1. 导入部分添加：
```typescript
import MatrixStatusBadge from '@/components/outline/MatrixStatusBadge.vue'
import MatrixEditDialog from '@/components/outline/MatrixEditDialog.vue'
import MatrixProgressDialog from '@/components/outline/MatrixProgressDialog.vue'
import {
  getMatrixStatus,
  generateMatrix,
  getSectionMatrix,
  generateSectionMatrix,
  type MatrixStatus,
  type SectionMatrix,
} from '@/api/outline'
```

2. 添加矩阵状态数据：
```typescript
const matrixStatus = ref<MatrixStatus>({
  total: 0,
  pending: 0,
  generating: 0,
  generated: 0,
  edited: 0,
  failed: 0,
  is_generating: false,
  current_task_id: null,
})

const showMatrixProgressDialog = ref(false)
const currentMatrixTaskId = ref<number | null>(null)
const showMatrixEditDialog = ref(false)
const currentEditSectionId = ref<number | null>(null)
```

3. 加载矩阵状态：
```typescript
async function loadMatrixStatus() {
  try {
    const res = await getMatrixStatus(outlineId)
    matrixStatus.value = res.data as MatrixStatus
  } catch (err) {
    console.error('加载矩阵状态失败:', err)
  }
}
```

4. 批量生成矩阵：
```typescript
async function handleGenerateMatrix() {
  try {
    const res = await generateMatrix(outlineId, { force: false })
    currentMatrixTaskId.value = res.data.task_id
    showMatrixProgressDialog.value = true
    loadMatrixStatus()
  } catch (err) {
    console.error('启动矩阵生成失败:', err)
    ElMessage.error('启动矩阵生成失败')
  }
}
```

5. 在模板中添加矩阵状态栏：
```vue
<!-- 矩阵状态栏 -->
<div class="matrix-status-bar">
  <el-card shadow="never">
    <div class="status-summary">
      <span class="status-title">内容责任矩阵</span>
      <div class="status-counts">
        <el-tag type="info">待生成 {{ matrixStatus.pending }}</el-tag>
        <el-tag type="primary" v-if="matrixStatus.generating > 0">
          <el-icon class="is-loading"><Loading /></el-icon>
          生成中 {{ matrixStatus.generating }}
        </el-tag>
        <el-tag type="success">已生成 {{ matrixStatus.generated }}</el-tag>
        <el-tag type="warning">已编辑 {{ matrixStatus.edited }}</el-tag>
        <el-tag type="danger" v-if="matrixStatus.failed > 0">失败 {{ matrixStatus.failed }}</el-tag>
      </div>
      <div class="status-actions">
        <el-button
          v-if="!matrixStatus.is_generating"
          type="primary"
          @click="handleGenerateMatrix"
        >
          生成矩阵
        </el-button>
        <el-button
          v-if="matrixStatus.failed > 0"
          @click="handleRetryFailedMatrix"
        >
          重试失败
        </el-button>
        <el-button
          v-if="matrixStatus.is_generating"
          type="primary"
          @click="showMatrixProgressDialog = true"
        >
          查看进度
        </el-button>
      </div>
    </div>
  </el-card>
</div>
```

6. 在章节树节点中添加矩阵状态徽章：
```vue
<!-- 在 SectionTree 组件中 -->
<template #default="{ node, data }">
  <div class="section-node">
    <span class="section-title">{{ data.title }}</span>
    <MatrixStatusBadge
      :status="data.content_matrix_status"
      :error="data.content_matrix_error"
    />
    <el-button
      link
      type="primary"
      @click="openMatrixEdit(data)"
    >
      编辑矩阵
    </el-button>
    <el-button
      link
      @click="handleGenerateSectionMatrix(data)"
    >
      重新生成
    </el-button>
  </div>
</template>
```

- [ ] **Step 2: 验证页面功能**

Run: `cd frontend && npm run build`

Expected: 无编译错误

---

### Task 6: 更新 SectionTree 组件显示矩阵状态

**Files:**
- Modify: `frontend/src/components/outline/SectionTree.vue`

- [ ] **Step 1: 在 SectionTree 中添加矩阵状态显示**

修改 `frontend/src/components/outline/SectionTree.vue`，确保章节树节点显示矩阵状态。

需要：
1. 接收 matrixStatusMap prop（章节 ID -> 矩阵状态映射）
2. 在节点中显示 MatrixStatusBadge
3. 提供矩阵编辑事件

- [ ] **Step 2: 验证组件**

Run: `cd frontend && npm run build`

Expected: 无编译错误

---

### Task 7: 构建和测试

**Files:**
- All modified files

- [ ] **Step 1: 构建前端**

Run: `cd frontend && npm run build`

Expected: 构建成功

- [ ] **Step 2: 验证页面可访问**

打开浏览器访问大纲详情页，验证：
- 矩阵状态栏显示正常
- 状态徽章显示正确
- 编辑对话框可打开
- 生成进度对话框可显示

- [ ] **Step 3: 提交代码**

```bash
git add frontend/src/api/outline.ts frontend/src/components/outline/ frontend/src/views/outline/OutlineDetailView.vue
git commit -m "$(cat <<'EOF'
feat(frontend): add matrix edit UI and status display (Phase 2)

- Add matrix API functions (status, generate, edit, retry)
- Add MatrixStatusBadge component for status display
- Add MatrixEditDialog for matrix editing with optimistic lock
- Add MatrixProgressDialog for generation progress tracking
- Integrate matrix features into OutlineDetailView

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## 后续阶段预览

### 第三阶段：批量生成顺序计算
- 推荐生成顺序计算算法
- 生成顺序预览界面
- 依赖冲突检测

### 第四阶段：正文生成上下文和提示词接入
- 正文生成目标章节筛选
- 上下文构建服务
- 章节正文生成提示词

### 第五阶段：防重复校验、失败重试、任务控制
- 防重复校验功能
- 章节摘要自动生成
- 任务控制 API