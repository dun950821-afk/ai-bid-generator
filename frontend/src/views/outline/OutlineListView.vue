<!-- frontend/src/views/outline/OutlineListView.vue -->
<template>
  <div class="outline-list-page">
    <div v-if="lotId" class="outline-list-content">
      <div class="page-header">
        <h2>{{ lotName }} - 大纲管理</h2>
        <div class="header-actions">
          <el-button type="primary" @click="showCreateDialog = true">
            <el-icon><Plus /></el-icon>
            新建大纲
          </el-button>
        </div>
      </div>

      <!-- 大纲生成进度卡片（需求3） -->
      <el-card v-if="generatingTask" shadow="never" class="generating-card">
        <div class="generating-header">
          <span class="generating-title">
            <el-icon class="is-loading"><Loading /></el-icon>
            AI 大纲生成中
          </span>
          <el-tag size="small" :type="generatingTask.status === 'failed' ? 'danger' : 'primary'">
            {{ generatingTask.status }}
          </el-tag>
        </div>
        <el-progress
          :percentage="generatingTask.progress"
          :status="generatingTask.status === 'failed' ? 'exception' : ''"
          :stroke-width="8"
        />
        <div class="generating-step">{{ generatingTask.current_step || '等待中' }}</div>
        <el-alert
          v-if="generatingTask.error_message"
          type="error"
          :title="generatingTask.error_message"
          :closable="false"
          show-icon
        />
      </el-card>

      <el-table :data="outlines" v-loading="loading" border>
        <el-table-column label="大纲名称" min-width="200">
          <template #default="{ row }">
            <div class="outline-name">
              <span>{{ row.name }}</span>
              <el-tag v-if="row.is_current" type="success" size="small">当前版本</el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="来源" width="100">
          <template #default="{ row }">
            <el-tag type="info" size="small">{{ row.source_display }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)" size="small">
              {{ row.status_display }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="章节数" width="100">
          <template #default="{ row }">
            {{ row.section_count }}
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="160">
          <template #default="{ row }">
            {{ formatDate(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200">
          <template #default="{ row }">
            <el-button type="primary" link @click="viewOutline(row.id)">
              查看
            </el-button>
            <el-button
              v-if="!row.is_current"
              type="success"
              link
              @click="setCurrent(row)"
            >
              设为当前
            </el-button>
            <el-button
              v-if="!row.is_current"
              type="danger"
              link
              @click="deleteOutline(row)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 新建大纲弹窗 -->
      <el-dialog v-model="showCreateDialog" title="新建大纲" width="560px">
        <el-form :model="createForm" label-width="100px">
          <el-form-item label="大纲名称">
            <el-input v-model="createForm.name" placeholder="请输入大纲名称" />
          </el-form-item>
          <el-form-item label="创建方式">
            <el-radio-group v-model="createMode">
              <el-radio value="manual">手动创建</el-radio>
              <el-radio value="preset">预设模板</el-radio>
              <el-radio value="ai">AI 解析</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item v-if="createMode === 'preset'" label="预设模板">
            <el-select
              v-model="createForm.templateId"
              placeholder="请选择预设模板"
              style="width: 100%"
              :loading="loadingTemplates"
            >
              <el-option
                v-for="tpl in presetTemplates"
                :key="tpl.id"
                :label="tpl.name"
                :value="tpl.id"
              >
                <span>{{ tpl.name }}</span>
                <span style="color: var(--el-text-color-secondary); margin-left: 8px; font-size: 12px">
                  {{ tpl.description }}
                </span>
              </el-option>
            </el-select>
          </el-form-item>
          <el-form-item v-if="createMode === 'ai'" label="招标文件">
            <el-select
              v-model="createForm.tenderFileId"
              placeholder="请选择招标文件"
              style="width: 100%"
              :loading="loadingTenderFiles"
            >
              <el-option
                v-for="tf in tenderFiles"
                :key="tf.id"
                :label="tf.original_name"
                :value="tf.id"
              >
                <span>{{ tf.original_name }}</span>
                <el-tag
                  v-if="tf.status === 'parsed'"
                  size="small"
                  type="success"
                  style="margin-left: 8px"
                >已解析</el-tag>
              </el-option>
            </el-select>
            <div v-if="createMode === 'ai'" class="ai-tip">
              AI 将读取招标文件全文自动生成章节结构（异步任务）
            </div>
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="showCreateDialog = false">取消</el-button>
          <el-button type="primary" :loading="creating" @click="handleCreate">
            创建
          </el-button>
        </template>
      </el-dialog>
    </div>

    <el-empty v-else description="请从项目详情进入大纲管理" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Loading } from '@element-plus/icons-vue'
import { http } from '@/api/http'
import { normalizeList } from '@/utils/normalize'
import { getGeneratingTask, type GeneratingTask } from '@/api/outline'

interface Outline {
  id: number
  name: string
  source: string
  source_display: string
  status: string
  status_display: string
  is_current: boolean
  section_count: number
  created_at: string
}

const route = useRoute()
const router = useRouter()

const lotId = computed(() => route.query.lot_id ? Number(route.query.lot_id) : null)
const loading = ref(false)
const outlines = ref<Outline[]>([])
const lotName = ref('')
const showCreateDialog = ref(false)
const creating = ref(false)
const createForm = ref({ name: '', templateId: null as number | null, tenderFileId: null as number | null })
const createMode = ref('manual')
const presetTemplates = ref<Array<{ id: number; name: string; description: string }>>([])
const loadingTemplates = ref(false)
const tenderFiles = ref<Array<{ id: number; original_name: string; status: string }>>([])
const loadingTenderFiles = ref(false)
const lotProjectId = ref<number | null>(null)

async function loadLotInfo() {
  if (!lotId.value) return
  try {
    const res = await http.get<{ name: string; project: number }>(`/api/lots/${lotId.value}/`)
    lotName.value = res.data.name
    lotProjectId.value = res.data.project
  } catch (err) {
    ElMessage.error('加载标段信息失败')
  }
}

async function loadOutlines() {
  if (!lotId.value) return
  loading.value = true
  try {
    const res = await http.get<{ results: Outline[] }>('/api/outlines/', {
      params: { lot_id: lotId.value }
    })
    outlines.value = normalizeList<Outline>(res)
  } finally {
    loading.value = false
  }
}

async function loadPresetTemplates() {
  loadingTemplates.value = true
  try {
    const res = await http.get<{ results: Array<{ id: number; name: string; description: string }> }>(
      '/api/preset-templates/',
      { params: { page_size: 100 } }
    )
    presetTemplates.value = res.data?.results || []
  } catch {
    presetTemplates.value = []
  } finally {
    loadingTemplates.value = false
  }
}

async function loadTenderFiles() {
  if (!lotProjectId.value) return
  loadingTenderFiles.value = true
  try {
    const res = await http.get<{ results: Array<{ id: number; original_name: string; status: string }> }>(
      '/api/tender/files',
      { params: { project_id: lotProjectId.value, lot_id: lotId.value, page_size: 100 } }
    )
    tenderFiles.value = res.data?.results || []
  } catch {
    tenderFiles.value = []
  } finally {
    loadingTenderFiles.value = false
  }
}

async function handleCreate() {
  if (!createForm.value.name) {
    ElMessage.warning('请输入大纲名称')
    return
  }
  if (createMode.value === 'preset' && !createForm.value.templateId) {
    ElMessage.warning('请选择预设模板')
    return
  }
  if (createMode.value === 'ai' && !createForm.value.tenderFileId) {
    ElMessage.warning('请选择招标文件')
    return
  }

  creating.value = true
  try {
    if (createMode.value === 'manual') {
      const res = await http.post<Outline>('/api/outlines/', {
        lot: lotId.value,
        name: createForm.value.name,
      })
      ElMessage.success('大纲创建成功')
      showCreateDialog.value = false
      createForm.value = { name: '', templateId: null, tenderFileId: null }
      router.push(`/outlines/${res.data.id}`)
    } else if (createMode.value === 'preset') {
      const res = await http.post<Outline>('/api/outlines/from_preset/', {
        lot_id: lotId.value,
        template_id: createForm.value.templateId,
        name: createForm.value.name,
      })
      ElMessage.success('大纲创建成功')
      showCreateDialog.value = false
      createForm.value = { name: '', templateId: null, tenderFileId: null }
      router.push(`/outlines/${res.data.id}`)
    } else if (createMode.value === 'ai') {
      const res = await http.post<{ task_id: number; status: string; message: string }>(
        '/api/outlines/generate_from_tender/',
        {
          tender_file_id: createForm.value.tenderFileId,
        }
      )
      ElMessage.success(`AI 生成任务已提交（任务 ID: ${res.data.task_id}）`)
      showCreateDialog.value = false
      createForm.value = { name: '', templateId: null, tenderFileId: null }
      checkGeneratingTask()  // 启动进度轮询
    }
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || err.response?.data?.detail || '创建失败')
  } finally {
    creating.value = false
  }
}

function viewOutline(id: number) {
  router.push(`/outlines/${id}`)
}

async function setCurrent(outline: Outline) {
  try {
    await http.post(`/api/outlines/${outline.id}/set_current/`)
    ElMessage.success('已设为当前版本')
    loadOutlines()
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '设置失败')
  }
}

async function deleteOutline(outline: Outline) {
  try {
    await ElMessageBox.confirm(
      `确认删除大纲"${outline.name}"？删除后无法恢复。`,
      '删除确认',
      { type: 'warning' }
    )
    await http.delete(`/api/outlines/${outline.id}/`)
    ElMessage.success('删除成功')
    loadOutlines()
  } catch (err: any) {
    if (err !== 'cancel') {
      ElMessage.error(err.response?.data?.message || '删除失败')
    }
  }
}

function getStatusType(status: string) {
  const map: Record<string, string> = {
    draft: 'info',
    generating: 'warning',
    generated: 'success',
    failed: 'danger',
  }
  return map[status] || 'info'
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

watch(lotId, (newId) => {
  if (newId) {
    loadLotInfo()
    loadOutlines()
  }
})

watch(createMode, (mode) => {
  if (mode === 'preset' && presetTemplates.value.length === 0) {
    loadPresetTemplates()
  }
  if (mode === 'ai' && tenderFiles.value.length === 0 && lotProjectId.value) {
    loadTenderFiles()
  }
})

// ===== 大纲生成进度（需求3）=====
const generatingTask = ref<GeneratingTask | null>(null)
let generatingTimer: ReturnType<typeof setTimeout> | null = null

async function checkGeneratingTask() {
  if (!lotId.value) return
  try {
    const res = await getGeneratingTask(lotId.value)
    generatingTask.value = res.data
    if (generatingTask.value && ['pending', 'running'].includes(generatingTask.value.status)) {
      generatingTimer = setTimeout(checkGeneratingTask, 2000)
    } else if (generatingTask.value?.status === 'success') {
      ElMessage.success('大纲生成完成')
      generatingTask.value = null
      await loadOutlines()
    } else if (generatingTask.value?.status === 'failed') {
      // 失败保留卡片展示错误，不自动清除
    }
  } catch (e) {
    // 查询失败静默
  }
}

function stopGeneratingPoll() {
  if (generatingTimer) {
    clearTimeout(generatingTimer)
    generatingTimer = null
  }
}

onMounted(() => {
  if (lotId.value) {
    loadLotInfo()
    loadOutlines()
    checkGeneratingTask()  // 刷新页面自动检测进行中任务
  }
})

onUnmounted(stopGeneratingPoll)
</script>

<style scoped>
.outline-list-page {
  padding: 20px;
}

.outline-list-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.page-header h2 {
  margin: 0;
  font-size: 20px;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.outline-name {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ai-tip {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}

.generating-card {
  margin-bottom: 16px;
}
.generating-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.generating-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
}
.generating-step {
  margin-top: 8px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
</style>