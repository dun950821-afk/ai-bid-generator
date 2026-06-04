<!-- frontend/src/views/outline/OutlineListView.vue -->
<template>
  <div class="outline-list">
    <div class="page-header">
      <h2>标书制作</h2>
      <el-button type="primary" @click="openCreateDialog">
        <el-icon><Plus /></el-icon>
        创建大纲
      </el-button>
    </div>

    <!-- 筛选 -->
    <el-form :inline="true" class="filter-form">
      <el-form-item label="项目">
        <el-select
          v-model="filters.project_id"
          placeholder="全部项目"
          clearable
          @change="handleProjectFilterChange"
          style="width: 200px"
          id="filter-project"
        >
          <el-option
            v-for="p in projects"
            :key="p.id"
            :label="p.name"
            :value="p.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="标段">
        <el-select
          v-model="filters.lot_id"
          placeholder="全部标段"
          clearable
          :disabled="!filters.project_id"
          @change="loadOutlines"
          style="width: 200px"
          id="filter-lot"
        >
          <el-option
            v-for="lot in filterLots"
            :key="lot.id"
            :label="lot.name"
            :value="lot.id"
          />
        </el-select>
      </el-form-item>
    </el-form>

    <!-- 大纲列表 -->
    <el-table :data="outlines" v-loading="loading" border stripe>
      <el-table-column prop="name" label="大纲名称" min-width="200" />
      <el-table-column prop="project_name" label="项目" width="150" />
      <el-table-column prop="lot_name" label="标段" width="150" />
      <el-table-column prop="source_display" label="来源" width="100">
        <template #default="{ row }">
          <el-tag :type="row.source === 'preset' ? 'info' : 'primary'" size="small">
            {{ row.source_display }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="status_display" label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="getStatusType(row.status)" size="small">
            {{ row.status_display }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="section_count" label="章节数" width="80" align="center" />
      <el-table-column prop="is_current" label="当前" width="80" align="center">
        <template #default="{ row }">
          <el-tag v-if="row.is_current" type="success" size="small">是</el-tag>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column prop="created_at" label="创建时间" width="180">
        <template #default="{ row }">
          {{ formatDate(row.created_at) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="handleDetail(row)">
            查看
          </el-button>
          <el-button
            v-if="!row.is_current"
            link
            type="warning"
            @click="handleSetCurrent(row)"
          >
            设为当前
          </el-button>
          <el-button link type="danger" @click="handleDelete(row)">
            删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 空状态提示 -->
    <el-empty v-if="!loading && outlines.length === 0" description="暂无大纲数据">
      <el-button type="primary" @click="openCreateDialog">创建第一个大纲</el-button>
    </el-empty>

    <!-- 创建大纲对话框 -->
    <el-dialog v-model="showCreateDialog" title="创建大纲" width="550px" destroy-on-close>
      <el-form :model="createForm" :rules="createRules" ref="createFormRef" label-width="100px">
        <el-form-item label="项目" prop="project_id">
          <el-select
            v-model="createForm.project_id"
            placeholder="选择项目"
            @change="onCreateProjectChange"
            style="width: 100%"
            id="create-project"
          >
            <el-option v-for="p in projects" :key="p.id" :label="p.name" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="标段" prop="lot_id">
          <el-select
            v-model="createForm.lot_id"
            placeholder="选择标段"
            :disabled="!createForm.project_id"
            style="width: 100%"
            id="create-lot"
          >
            <el-option v-for="lot in createLots" :key="lot.id" :label="lot.name" :value="lot.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="来源方式" prop="source">
          <el-radio-group v-model="createForm.source" id="create-source">
            <el-radio value="preset">预设模板</el-radio>
            <el-radio value="ai">AI解析</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="createForm.source === 'preset'" label="模板" prop="template_id">
          <el-select
            v-model="createForm.template_id"
            placeholder="选择模板"
            style="width: 100%"
            id="create-template"
          >
            <el-option v-for="t in templates" :key="t.id" :label="t.name" :value="t.id" />
          </el-select>
        </el-form-item>
        <el-form-item v-else label="招标文件" prop="tender_file_id">
          <el-select
            v-model="createForm.tender_file_id"
            placeholder="选择招标文件"
            style="width: 100%"
            id="create-tender-file"
          >
            <el-option
              v-for="f in tenderFiles"
              :key="f.id"
              :label="f.original_name"
              :value="f.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="handleCreate" :loading="creating">确认创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import {
  listOutlines,
  deleteOutline,
  setOutlineCurrent,
  createOutlineFromPreset,
  generateOutlineFromTender,
  listPresetTemplates,
  type Outline,
  type PresetTemplate,
} from '@/api/outline'
import { projectApi, type Project } from '@/api/project'
import { http } from '@/api/http'
import type { FormInstance, FormRules } from 'element-plus'

const router = useRouter()

// 数据状态
const loading = ref(false)
const creating = ref(false)
const outlines = ref<Outline[]>([])
const projects = ref<Project[]>([])
const filterLots = ref<any[]>([])
const createLots = ref<any[]>([])
const templates = ref<PresetTemplate[]>([])
const tenderFiles = ref<any[]>([])

// 筛选条件
const filters = ref({
  project_id: null as number | null,
  lot_id: null as number | null,
})

// 创建对话框
const showCreateDialog = ref(false)
const createFormRef = ref<FormInstance>()
const createForm = ref({
  project_id: null as number | null,
  lot_id: null as number | null,
  source: 'preset',
  template_id: null as number | null,
  tender_file_id: null as number | null,
})

const createRules: FormRules = {
  project_id: [{ required: true, message: '请选择项目', trigger: 'change' }],
  lot_id: [{ required: true, message: '请选择标段', trigger: 'change' }],
  source: [{ required: true, message: '请选择来源方式', trigger: 'change' }],
  template_id: [
    {
      validator: (_rule, value, callback) => {
        if (createForm.value.source === 'preset' && !value) {
          callback(new Error('请选择模板'))
        } else {
          callback()
        }
      },
      trigger: 'change',
    },
  ],
  tender_file_id: [
    {
      validator: (_rule, value, callback) => {
        if (createForm.value.source === 'ai' && !value) {
          callback(new Error('请选择招标文件'))
        } else {
          callback()
        }
      },
      trigger: 'change',
    },
  ],
}

onMounted(async () => {
  await Promise.all([loadProjects(), loadTemplates()])
  await loadOutlines()
})

async function loadProjects() {
  try {
    const res = await projectApi.list({ status: 'active' })
    const data = res.data as any
    // 只显示进行中的项目，过滤掉已归档项目
    const allProjects = Array.isArray(data) ? data : data.results || []
    projects.value = allProjects.filter((p: Project) => p.status === 'active')
  } catch (err) {
    console.error('加载项目失败:', err)
    projects.value = []
  }
}

async function loadTemplates() {
  try {
    const res = await listPresetTemplates()
    const data = res.data as any
    templates.value = Array.isArray(data) ? data : data.results || []
  } catch (err) {
    console.error('加载模板失败:', err)
    templates.value = []
  }
}

async function loadOutlines() {
  loading.value = true
  try {
    const params: any = {}
    if (filters.value.project_id) {
      params.project_id = filters.value.project_id
    }
    if (filters.value.lot_id) {
      params.lot_id = filters.value.lot_id
    }

    const res = await listOutlines(params)
    const data = res.data as any
    // 处理分页响应或数组响应
    outlines.value = Array.isArray(data) ? data : data.results || []
    console.log('Loaded outlines:', outlines.value.length, 'records')
  } catch (err) {
    console.error('加载大纲列表失败:', err)
    ElMessage.error('加载大纲列表失败')
    outlines.value = []
  } finally {
    loading.value = false
  }
}

async function loadLotsForProject(projectId: number, target: 'filter' | 'create') {
  try {
    const res = await http.get(`/api/projects/${projectId}/lots/`)
    const data = res.data as any
    const lots = Array.isArray(data) ? data : data.results || []
    if (target === 'filter') {
      filterLots.value = lots
    } else {
      createLots.value = lots
    }
  } catch (err) {
    console.error('加载标段失败:', err)
    if (target === 'filter') {
      filterLots.value = []
    } else {
      createLots.value = []
    }
  }
}

async function loadTenderFilesForLot(lotId: number) {
  if (!createForm.value.project_id) {
    tenderFiles.value = []
    return
  }

  try {
    const res = await http.get('/api/tender/files', {
      params: {
        project_id: createForm.value.project_id,
        lot_id: lotId,
      },
    })
    const data = res.data as any
    const allFiles = Array.isArray(data) ? data : data.results || []

    // 只显示已解析的招标文件（parsed, ready, chunked, requirement_extracted, indexed）
    const validStatuses = ['parsed', 'ready', 'chunked', 'requirement_extracted', 'indexed']
    tenderFiles.value = allFiles.filter((f: any) => validStatuses.includes(f.status))

    console.log('Loaded tender files:', tenderFiles.value.length, 'of', allFiles.length)
  } catch (err) {
    console.error('加载招标文件失败:', err)
    tenderFiles.value = []
  }
}

// 筛选项目变化
async function handleProjectFilterChange(projectId: number | null) {
  filters.value.lot_id = null
  filterLots.value = []
  if (projectId) {
    await loadLotsForProject(projectId, 'filter')
  }
  await loadOutlines()
}

// 打开创建对话框
function openCreateDialog() {
  createForm.value = {
    project_id: filters.value.project_id,
    lot_id: null,
    source: 'preset',
    template_id: null,
    tender_file_id: null,
  }
  createLots.value = []
  tenderFiles.value = []

  // 如果有筛选项目，预加载标段
  if (filters.value.project_id) {
    loadLotsForProject(filters.value.project_id, 'create')
  }

  showCreateDialog.value = true
}

// 创建对话框中选择项目变化
async function onCreateProjectChange(projectId: number | null) {
  createForm.value.lot_id = null
  createForm.value.tender_file_id = null
  createLots.value = []
  tenderFiles.value = []

  if (projectId) {
    await loadLotsForProject(projectId, 'create')
  }
}

// 监听标段变化，加载招标文件
watch(
  () => createForm.value.lot_id,
  (lotId) => {
    if (lotId && createForm.value.source === 'ai') {
      loadTenderFilesForLot(lotId)
    } else {
      tenderFiles.value = []
    }
  }
)

// 监听来源变化
watch(
  () => createForm.value.source,
  (source) => {
    createForm.value.template_id = null
    createForm.value.tender_file_id = null
    if (source === 'ai' && createForm.value.lot_id) {
      loadTenderFilesForLot(createForm.value.lot_id)
    }
  }
)

function handleDetail(row: Outline) {
  router.push(`/outlines/${row.id}`)
}

async function handleSetCurrent(row: Outline) {
  try {
    await ElMessageBox.confirm('确认将此大纲设为当前大纲？', '提示')
    await setOutlineCurrent(row.id)
    ElMessage.success('已设置为当前大纲')
    await loadOutlines()
  } catch (err: any) {
    if (err !== 'cancel') {
      ElMessage.error(err.response?.data?.message || '操作失败')
    }
  }
}

async function handleDelete(row: Outline) {
  try {
    await ElMessageBox.confirm('确认删除此大纲？删除后无法恢复。', '警告', {
      type: 'warning',
    })
    await deleteOutline(row.id)
    ElMessage.success('删除成功')
    await loadOutlines()
  } catch (err: any) {
    if (err !== 'cancel') {
      ElMessage.error(err.response?.data?.message || '删除失败')
    }
  }
}

async function handleCreate() {
  if (!createFormRef.value) return

  await createFormRef.value.validate()

  creating.value = true
  try {
    if (createForm.value.source === 'preset') {
      await createOutlineFromPreset({
        lot_id: createForm.value.lot_id!,
        template_id: createForm.value.template_id!,
      })
      ElMessage.success('创建成功')
      showCreateDialog.value = false

      // 清除筛选条件，显示所有大纲
      filters.value.project_id = null
      filters.value.lot_id = null
      filterLots.value = []

      // 重新加载大纲列表
      await loadOutlines()
    } else {
      // AI解析方式
      const res = await generateOutlineFromTender({
        tender_file_id: createForm.value.tender_file_id!,
      })

      ElMessage.success({
        message: '正在AI解析大纲中...',
        type: 'success',
        duration: 0, // 不自动关闭
      })
      showCreateDialog.value = false

      // 轮询任务状态
      const taskId = res.data.task_id
      pollOutlineGenerationTask(taskId)
    }
  } catch (err: any) {
    console.error('创建大纲失败:', err)
    ElMessage.error(err.response?.data?.error || err.response?.data?.message || '创建失败')
  } finally {
    creating.value = false
  }
}

// 轮询大纲生成任务状态
async function pollOutlineGenerationTask(taskId: number) {
  const maxAttempts = 60 // 最大轮询次数（约 5 分钟）
  const interval = 5000 // 5秒间隔

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await http.get(`/api/tasks/${taskId}`)
      const task = res.data

      if (task.status === 'success') {
        ElMessage.closeAll()
        ElMessage.success('大纲生成成功！')

        // 清除筛选条件，显示所有大纲
        filters.value.project_id = null
        filters.value.lot_id = null
        filterLots.value = []

        // 重新加载大纲列表
        await loadOutlines()
        return
      }

      if (task.status === 'failed') {
        ElMessage.closeAll()
        ElMessage.error(task.error_message || '大纲生成失败')
        return
      }

      // 继续等待
      await new Promise(resolve => setTimeout(resolve, interval))
    } catch (err) {
      console.error('查询任务状态失败:', err)
      // 继续尝试
      await new Promise(resolve => setTimeout(resolve, interval))
    }
  }

  ElMessage.closeAll()
  ElMessage.warning('任务轮询超时，请稍后刷新查看')
}

function getStatusType(status: string): string {
  const map: Record<string, string> = {
    draft: 'info',
    active: 'success',
    archived: 'warning',
  }
  return map[status] || 'info'
}

function formatDate(date: string): string {
  return new Date(date).toLocaleString('zh-CN')
}
</script>

<style scoped>
.outline-list {
  padding: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.page-header h2 {
  margin: 0;
}

.filter-form {
  margin-bottom: 16px;
}
</style>
