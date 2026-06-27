<template>
  <div class="project-lots">
    <div class="toolbar">
      <el-button v-if="canCreateLot" type="primary" @click="showCreateDialog = true">
        <el-icon><Plus /></el-icon>
        新建标段
      </el-button>
      <el-alert v-if="isArchived" type="info" :closable="false" show-icon>
        项目已归档，无法进行新建标段、启动流程等操作
      </el-alert>
    </div>

    <el-table :data="safeLots" v-loading="loading" border>
      <el-table-column label="标段名称" min-width="200">
        <template #default="{ row }">
          <div class="lot-name">
            <span>{{ row.name }}</span>
            <el-tag v-if="row.code" size="small" type="info">{{ row.code }}</el-tag>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="流程状态" width="120">
        <template #default="{ row }">
          <el-tag :type="getWorkflowStatusType(row.workflow_status)" size="small">
            {{ getWorkflowStatusLabel(row.workflow_status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="getStatusType(row.status)" size="small">
            {{ getStatusLabel(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="创建时间" width="140">
        <template #default="{ row }">
          {{ formatDate(row.created_at) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="280">
        <template #default="{ row }">
          <el-button type="primary" link @click="viewLot(row.id)">工作流</el-button>
          <el-button type="primary" link @click="viewOutline(row.id)">大纲</el-button>
          <el-button
            v-if="canStartWorkflow && row.workflow_status === 'not_started'"
            type="success"
            link
            @click="startWorkflow(row)"
          >
            启动流程
          </el-button>
          <el-button
            v-if="canStartWorkflow && row.workflow_status === 'not_started'"
            type="danger"
            link
            @click="deleteLot(row)"
          >
            删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 新建标段弹窗 -->
    <el-dialog v-model="showCreateDialog" title="新建标段" width="450px">
      <el-form ref="createFormRef" :model="createForm" :rules="createRules" label-width="100px">
        <el-form-item label="标段名称" prop="name">
          <el-input v-model="createForm.name" maxlength="255" placeholder="请输入标段名称" />
        </el-form-item>
        <el-form-item label="标段编号" prop="code">
          <el-input v-model="createForm.code" maxlength="64" placeholder="可选" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="handleCreate">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { http } from '@/api/http'
import { normalizeList } from '@/utils/normalize'
import type { FormInstance, FormRules } from 'element-plus'

const router = useRouter()

interface Lot {
  id: number
  name: string
  code: string
  status: string
  workflow_status: string
  created_at: string
}

const props = defineProps<{
  projectId: number
  canOperate: boolean
  isArchived?: boolean
}>()

const loading = ref(false)
const lots = ref<Lot[]>([])
const showCreateDialog = ref(false)
const creating = ref(false)
const createFormRef = ref<FormInstance>()
const createForm = ref({ name: '', code: '' })

// 归档项目禁用操作
const canCreateLot = computed(() => props.canOperate && !props.isArchived)
const canStartWorkflow = computed(() => props.canOperate && !props.isArchived)

const createRules: FormRules = {
  name: [
    { required: true, message: '请输入标段名称', trigger: 'blur' },
    { max: 255, message: '标段名称不能超过255个字符', trigger: 'blur' },
  ],
}

async function loadLots() {
  loading.value = true
  try {
    const res = await http.get<Lot[]>(`/api/projects/${props.projectId}/lots/`)
    lots.value = normalizeList<Lot>(res)
  } finally {
    loading.value = false
  }
}

// 安全的标段列表
const safeLots = computed(() => Array.isArray(lots.value) ? lots.value : [])

async function handleCreate() {
  if (!createFormRef.value) return
  await createFormRef.value.validate()

  creating.value = true
  try {
    await http.post(`/api/projects/${props.projectId}/create_lot/`, createForm.value)
    ElMessage.success('标段创建成功')
    showCreateDialog.value = false
    createForm.value = { name: '', code: '' }
    loadLots()
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '创建失败')
  } finally {
    creating.value = false
  }
}

async function startWorkflow(lot: Lot) {
  try {
    // 先尝试初始化工作流
    try {
      await http.post(`/api/lots/${lot.id}/workflow/`)
    } catch (initErr: any) {
      // 如果已经存在，忽略错误
      if (initErr.response?.data?.error !== 'workflow_already_exists') {
        throw initErr
      }
    }

    // 启动工作流
    await http.post(`/api/lots/${lot.id}/workflow/start/`)
    ElMessage.success('流程已启动')
    loadLots()
  } catch (err: any) {
    const errorMsg = err.response?.data?.message || err.response?.data?.error || '启动失败'
    ElMessage.error(errorMsg)
  }
}

async function deleteLot(lot: Lot) {
  try {
    await ElMessageBox.confirm(
      `确认删除标段"${lot.name}"？删除后无法恢复。`,
      '删除确认',
      { type: 'warning' }
    )
    await http.delete(`/api/lots/${lot.id}/`)
    ElMessage.success('删除成功')
    loadLots()
  } catch (err: any) {
    if (err !== 'cancel') {
      ElMessage.error(err.response?.data?.message || '删除失败')
    }
  }
}

function viewLot(id: number) {
  router.push(`/lots/${id}/workflow`)
}

function viewOutline(lotId: number) {
  router.push(`/outlines?lot_id=${lotId}`)
}

function getWorkflowStatusLabel(status: string) {
  const map: Record<string, string> = {
    not_started: '未开始',
    in_progress: '进行中',
    completed: '已完成',
    archived: '已归档',
  }
  return map[status] || status
}

function getWorkflowStatusType(status: string) {
  const map: Record<string, string> = {
    not_started: 'info',
    in_progress: 'primary',
    completed: 'success',
    archived: 'info',
  }
  return map[status] || 'info'
}

function getStatusLabel(status: string) {
  const map: Record<string, string> = {
    active: '活跃',
    archived: '已归档',
  }
  return map[status] || status
}

function getStatusType(status: string) {
  const map: Record<string, string> = {
    active: 'success',
    archived: 'info',
  }
  return map[status] || 'info'
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

onMounted(() => {
  loadLots()
})
</script>

<style scoped>
.project-lots {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.toolbar {
  display: flex;
  justify-content: flex-end;
}

.lot-name {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>