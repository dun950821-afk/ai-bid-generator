<template>
  <div class="requirement-tab">
    <!-- 任务进度条 -->
    <TaskProgress
      v-if="currentTaskId"
      :task-id="currentTaskId"
      :poll-interval="2000"
      @completed="handleTaskCompleted"
      @failed="handleTaskFailed"
      @refresh="loadRequirements"
      @dismiss="currentTaskId = null"
    />

    <!-- 抽取工具栏 -->
    <RequirementExtractToolbar
      v-if="canManage"
      :loading="extractLoading"
      :parsed-document-id="parsedDocumentId"
      @extract="handleExtract"
    />

    <!-- 左右布局 -->
    <div class="requirement-layout" v-if="requirements.length > 0 || loading">
      <!-- 左侧导航 -->
      <RequirementSidebar
        :categories="categoriesWithCount"
        :active-category="activeCategory"
        @select="handleCategorySelect"
      />

      <!-- 右侧内容 -->
      <div class="requirement-content">
        <div class="category-header">
          <h3>{{ currentCategoryLabel }}</h3>
          <span class="count">共 {{ currentRequirements.length }} 条</span>
        </div>

        <div class="card-grid" v-loading="loading">
          <RequirementCard
            v-for="req in currentRequirements"
            :key="req.id"
            :requirement="req"
            :can-manage="canManage"
            @view="handleView"
            @edit="handleEdit"
          />
        </div>

        <el-empty v-if="!loading && currentRequirements.length === 0" description="该分类暂无条款" />
      </div>
    </div>

    <!-- 空状态 -->
    <el-empty v-if="!loading && requirements.length === 0" description="暂无条款数据，请先执行抽取" />

    <!-- 详情抽屉 -->
    <RequirementDetailDrawer
      v-model="showDetailDrawer"
      :requirement="selectedRequirement"
      :loading="detailLoading"
    />

    <!-- 编辑对话框 -->
    <RequirementEditDialog
      v-model="showEditDialog"
      :requirement="selectedRequirement"
      @saved="handleSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import { ElMessage } from 'element-plus'
import {
  listRequirements,
  extractRequirements,
  getRequirement,
  getSafeRequirementList,
  type Requirement,
  type RequirementDetail,
  type RagOptions,
} from '@/api/requirements'
import { getCurrentTask } from '@/api/task'
import RequirementExtractToolbar from './RequirementExtractToolbar.vue'
import RequirementSidebar from './RequirementSidebar.vue'
import RequirementCard from './RequirementCard.vue'
import RequirementDetailDrawer from './RequirementDetailDrawer.vue'
import RequirementEditDialog from './RequirementEditDialog.vue'
import TaskProgress from '@/components/common/TaskProgress.vue'

interface ExtractPayload {
  force: boolean
  modelConfigId: number | null
  promptVersionId: number | null
  ragOptions: RagOptions
}

const props = defineProps<{
  tenderFileId: number
  parsedDocumentId: number | null
  canManage?: boolean
}>()

// 状态
const loading = ref(false)
const extractLoading = ref(false)
const detailLoading = ref(false)
const requirements = ref<Requirement[]>([])
const activeCategory = ref('qualification')

// 当前任务
const currentTaskId = ref<number | null>(null)

// 详情/编辑
const showDetailDrawer = ref(false)
const showEditDialog = ref(false)
const selectedRequirement = ref<RequirementDetail | null>(null)

// 11类定义
const CATEGORY_DEFINITIONS = [
  { value: 'qualification', label: '资格要求' },
  { value: 'tech_req', label: '技术要求' },
  { value: 'scoring', label: '评分项' },
  { value: 'commercial', label: '商务条款' },
  { value: 'legal', label: '合同法律' },
  { value: 'submission', label: '投标递交' },
  { value: 'schedule', label: '履约周期' },
  { value: 'material', label: '材料要求' },
  { value: 'format', label: '文件格式' },
  { value: 'clarification', label: '澄清补遗' },
  { value: 'other', label: '其他' },
]

// 计算各分类数量
const categoriesWithCount = computed(() => {
  const countMap: Record<string, number> = {}
  for (const req of requirements.value) {
    const type = req.requirement_type || 'other'
    countMap[type] = (countMap[type] || 0) + 1
  }
  return CATEGORY_DEFINITIONS.map((def) => ({
    value: def.value,
    label: def.label,
    count: countMap[def.value] || 0,
  }))
})

// 当前分类标签
const currentCategoryLabel = computed(() => {
  const def = CATEGORY_DEFINITIONS.find((d) => d.value === activeCategory.value)
  return def?.label || '未知'
})

// 当前分类条款
const currentRequirements = computed(() => {
  return requirements.value.filter((req) => {
    const type = req.requirement_type || 'other'
    return type === activeCategory.value
  })
})

// 加载条款列表
async function loadRequirements() {
  loading.value = true
  try {
    const res = await listRequirements(props.tenderFileId, {
      is_active: true,
    })
    requirements.value = getSafeRequirementList(res)
  } catch (err: any) {
    console.error('加载条款列表失败:', err)
    ElMessage.error(err.response?.data?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

// 检查是否有进行中的任务
async function checkCurrentTask() {
  try {
    const res = await getCurrentTask({
      related_object_type: 'TenderFile',
      related_object_id: props.tenderFileId,
      task_type: 'requirement_extraction',
    })
    currentTaskId.value = res.data?.id || null
  } catch (err) {
    console.error('检查当前任务失败:', err)
  }
}

// 切换分类
function handleCategorySelect(category: string) {
  activeCategory.value = category
}

// 触发条款抽取
async function handleExtract(payload: ExtractPayload) {
  if (!payload.modelConfigId || !payload.promptVersionId) {
    ElMessage.error('请选择模型和提示词版本')
    return
  }

  extractLoading.value = true
  try {
    const res = await extractRequirements(props.tenderFileId, {
      mode: 'hybrid',
      force: payload.force,
      model_config_id: payload.modelConfigId,
      prompt_version_id: payload.promptVersionId,
      rag_options: payload.ragOptions,
    })
    if (res.data?.task_id) {
      currentTaskId.value = res.data.task_id
    }
    ElMessage.success('条款抽取任务已创建')
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '创建任务失败')
  } finally {
    extractLoading.value = false
  }
}

// 任务完成回调
function handleTaskCompleted(result: Record<string, unknown>) {
  ElMessage.success(`抽取完成，共 ${result.total_count || 0} 条条款`)
  loadRequirements()
}

// 任务失败回调
function handleTaskFailed(error: string) {
  ElMessage.error(`抽取失败: ${error}`)
}

// 查看详情
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

// 编辑
function handleEdit(requirement: Requirement) {
  selectedRequirement.value = requirement as RequirementDetail
  showEditDialog.value = true
}

// 编辑保存后刷新
function handleSaved() {
  loadRequirements()
}

// 监听 tenderFileId 变化
watch(
  () => props.tenderFileId,
  (newId) => {
    if (newId) {
      loadRequirements()
      checkCurrentTask()
    } else {
      requirements.value = []
    }
  },
  { immediate: true }
)

onMounted(() => {
  if (props.tenderFileId) {
    loadRequirements()
    checkCurrentTask()
  }
})
</script>

<style scoped>
.requirement-tab {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.requirement-layout {
  display: flex;
  min-height: 500px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  overflow: hidden;
}

.requirement-content {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
}

.category-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--el-border-color-light);
}

.category-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.category-header .count {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 16px;
}

@media (max-width: 768px) {
  .card-grid {
    grid-template-columns: 1fr;
  }
}
</style>