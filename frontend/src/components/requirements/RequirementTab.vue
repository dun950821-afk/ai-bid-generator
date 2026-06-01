<template>
  <div class="requirement-tab">
    <!-- 抽取工具栏 -->
    <RequirementExtractToolbar
      v-if="canManage"
      :loading="extractLoading"
      :parsed-document-id="parsedDocumentId"
      @extract="handleExtract"
    />

    <!-- 筛选工具栏 -->
    <div class="filter-bar">
      <el-select
        v-model="filters.requirement_type"
        placeholder="条款类型"
        clearable
        style="width: 140px"
        @change="loadRequirements"
      >
        <el-option label="资格要求" value="qualification" />
        <el-option label="技术要求" value="tech_req" />
        <el-option label="评分项" value="scoring" />
        <el-option label="商务条款" value="commercial" />
        <el-option label="合同法律" value="legal" />
        <el-option label="投标递交" value="submission" />
        <el-option label="履约周期" value="schedule" />
        <el-option label="材料要求" value="material" />
        <el-option label="文件格式" value="format" />
        <el-option label="澄清补遗" value="clarification" />
        <el-option label="其他" value="other" />
      </el-select>
      <el-select
        v-model="filters.mandatory_level"
        placeholder="强制程度"
        clearable
        style="width: 120px"
        @change="loadRequirements"
      >
        <el-option label="强制" value="mandatory" />
        <el-option label="重要" value="important" />
        <el-option label="可选" value="optional" />
        <el-option label="未知" value="unknown" />
      </el-select>
      <el-select
        v-model="filters.risk_level"
        placeholder="风险等级"
        clearable
        style="width: 120px"
        @change="loadRequirements"
      >
        <el-option label="高" value="high" />
        <el-option label="中" value="medium" />
        <el-option label="低" value="low" />
        <el-option label="未知" value="unknown" />
      </el-select>
      <el-select
        v-model="filters.owner_role"
        placeholder="负责人"
        clearable
        style="width: 120px"
        @change="loadRequirements"
      >
        <el-option label="标书经理" value="bid_manager" />
        <el-option label="销售" value="sales" />
        <el-option label="技术" value="tech" />
        <el-option label="法务" value="legal" />
        <el-option label="财务" value="finance" />
        <el-option label="项目经理" value="project_manager" />
        <el-option label="其他" value="other" />
      </el-select>
      <el-checkbox v-model="showInactive" @change="loadRequirements">显示已停用</el-checkbox>
      <el-input
        v-model="searchKeyword"
        placeholder="搜索内容"
        clearable
        style="width: 200px"
        @keyup.enter="loadRequirements"
        @clear="loadRequirements"
      >
        <template #append>
          <el-button @click="loadRequirements">搜索</el-button>
        </template>
      </el-input>
      <div class="filter-right">
        <span class="count-text">共 {{ totalCount }} 条</span>
        <el-button @click="loadRequirements" :loading="loading">
          刷新
        </el-button>
      </div>
    </div>

    <!-- 条款表格 -->
    <RequirementTable
      :requirements="requirements"
      :loading="loading"
      :can-manage="canManage"
      @view="handleView"
      @edit="handleEdit"
      @deactivate="handleDeactivate"
      @reactivate="handleReactivate"
    />

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
import { ref, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  listRequirements,
  extractRequirements,
  getRequirement,
  updateRequirement,
  getSafeRequirementList,
  type Requirement,
  type RequirementDetail,
  type RagOptions,
} from '@/api/requirements'
import RequirementExtractToolbar from './RequirementExtractToolbar.vue'
import RequirementTable from './RequirementTable.vue'
import RequirementDetailDrawer from './RequirementDetailDrawer.vue'
import RequirementEditDialog from './RequirementEditDialog.vue'

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
const totalCount = ref(0)
const searchKeyword = ref('')
const showInactive = ref(false)

const filters = ref({
  requirement_type: '',
  mandatory_level: '',
  risk_level: '',
  owner_role: '',
})

// 详情/编辑
const showDetailDrawer = ref(false)
const showEditDialog = ref(false)
const selectedRequirement = ref<RequirementDetail | null>(null)

// 加载条款列表
async function loadRequirements() {
  // parsed_document_id 必须传递，确保切换解析版本后条款不混淆
  if (!props.parsedDocumentId) {
    requirements.value = []
    totalCount.value = 0
    return
  }

  loading.value = true
  try {
    const res = await listRequirements(props.tenderFileId, {
      parsed_document_id: props.parsedDocumentId,  // 必须传递
      ...filters.value,
      // is_active 默认为 true，但允许用户查看已停用
      is_active: showInactive.value ? undefined : true,
    })
    requirements.value = getSafeRequirementList(res)
    totalCount.value = res.data?.count || requirements.value.length
  } catch (err: any) {
    console.error('加载条款列表失败:', err)
    ElMessage.error(err.response?.data?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

// 触发条款抽取
async function handleExtract(payload: ExtractPayload) {
  // 前置校验
  if (!payload.modelConfigId || !payload.promptVersionId) {
    ElMessage.error('请选择模型和提示词版本')
    return
  }

  extractLoading.value = true
  try {
    await extractRequirements(props.tenderFileId, {
      mode: 'hybrid',
      force: payload.force,
      model_config_id: payload.modelConfigId,
      prompt_version_id: payload.promptVersionId,
      rag_options: payload.ragOptions,  // 始终传递完整结构
    })
    ElMessage.success('条款抽取任务已提交，请稍后刷新查看结果')
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '抽取失败')
  } finally {
    extractLoading.value = false
  }
}

// 查看详情（调用完整 API）
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

// 停用条款
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

// 启用条款
async function handleReactivate(requirement: Requirement) {
  try {
    await updateRequirement(requirement.id, { is_active: true })
    ElMessage.success('已启用')
    loadRequirements()
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '操作失败')
  }
}

// 编辑保存后刷新
function handleSaved() {
  loadRequirements()
}

// 监听 parsedDocumentId 变化
watch(
  () => props.parsedDocumentId,
  (newId) => {
    if (newId) {
      loadRequirements()
    } else {
      requirements.value = []
      totalCount.value = 0
    }
  },
  { immediate: true }
)

onMounted(() => {
  if (props.parsedDocumentId) {
    loadRequirements()
  }
})
</script>

<style scoped>
.requirement-tab {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.filter-bar {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
}

.filter-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 12px;
}

.count-text {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
</style>