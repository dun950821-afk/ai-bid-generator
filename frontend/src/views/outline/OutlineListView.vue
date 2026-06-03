<!-- frontend/src/views/outline/OutlineListView.vue -->
<template>
  <div class="outline-list">
    <div class="page-header">
      <h2>大纲管理</h2>
      <el-button type="primary" @click="showCreateDialog = true">
        创建大纲
      </el-button>
    </div>

    <!-- 筛选 -->
    <el-form :inline="true" class="filter-form">
      <el-form-item label="项目">
        <el-select v-model="filters.project_id" placeholder="选择项目" clearable @change="loadOutlines">
          <el-option
            v-for="p in projects"
            :key="p.id"
            :label="p.name"
            :value="p.id"
          />
        </el-select>
      </el-form-item>
    </el-form>

    <!-- 大纲列表 -->
    <el-table :data="outlines" v-loading="loading">
      <el-table-column prop="name" label="大纲名称" />
      <el-table-column prop="lot_name" label="标段" width="150" />
      <el-table-column prop="source_display" label="来源" width="100" />
      <el-table-column prop="status_display" label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="getStatusType(row.status)" size="small">
            {{ row.status_display }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="section_count" label="章节数" width="80" />
      <el-table-column prop="is_current" label="当前" width="80">
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

    <!-- 创建大纲对话框 -->
    <el-dialog v-model="showCreateDialog" title="创建大纲" width="500px">
      <el-form :model="createForm" label-width="80px">
        <el-form-item label="标段">
          <el-select v-model="createForm.lot_id" placeholder="选择标段">
            <el-option v-for="lot in lots" :key="lot.id" :label="lot.name" :value="lot.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="来源">
          <el-radio-group v-model="createForm.source">
            <el-radio value="preset">预设模板</el-radio>
            <el-radio value="ai">AI解析</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="createForm.source === 'preset'" label="模板">
          <el-select v-model="createForm.template_id" placeholder="选择模板">
            <el-option v-for="t in templates" :key="t.id" :label="t.name" :value="t.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="handleCreate" :loading="creating">确认</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { listOutlines, deleteOutline, setOutlineCurrent, createOutlineFromPreset, listPresetTemplates, type Outline, type PresetTemplate } from '@/api/outline'
import { listProjects, type Project } from '@/api/project'

const router = useRouter()

const loading = ref(false)
const creating = ref(false)
const outlines = ref<Outline[]>([])
const projects = ref<Project[]>([])
const lots = ref<any[]>([])
const templates = ref<PresetTemplate[]>([])
const filters = ref({
  project_id: null as number | null,
})
const showCreateDialog = ref(false)
const createForm = ref({
  lot_id: null as number | null,
  source: 'preset',
  template_id: null as number | null,
})

onMounted(async () => {
  await loadProjects()
  await loadTemplates()
  await loadOutlines()
})

async function loadProjects() {
  try {
    const res = await listProjects()
    projects.value = res.data
  } catch (err) {
    console.error('加载项目失败:', err)
  }
}

async function loadTemplates() {
  try {
    const res = await listPresetTemplates()
    templates.value = res.data
  } catch (err) {
    console.error('加载模板失败:', err)
  }
}

async function loadOutlines() {
  loading.value = true
  try {
    const res = await listOutlines({
      project_id: filters.value.project_id || undefined,
    })
    outlines.value = res.data
  } catch (err) {
    ElMessage.error('加载大纲列表失败')
  } finally {
    loading.value = false
  }
}

function handleDetail(row: Outline) {
  router.push(`/outlines/${row.id}`)
}

async function handleSetCurrent(row: Outline) {
  try {
    await ElMessageBox.confirm('确认将此大纲设为当前大纲？', '提示')
    await setOutlineCurrent(row.id)
    ElMessage.success('已设置为当前大纲')
    loadOutlines()
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
    loadOutlines()
  } catch (err: any) {
    if (err !== 'cancel') {
      ElMessage.error(err.response?.data?.message || '删除失败')
    }
  }
}

async function handleCreate() {
  if (!createForm.value.lot_id) {
    ElMessage.warning('请选择标段')
    return
  }
  if (createForm.value.source === 'preset' && !createForm.value.template_id) {
    ElMessage.warning('请选择模板')
    return
  }

  creating.value = true
  try {
    if (createForm.value.source === 'preset') {
      await createOutlineFromPreset({
        lot_id: createForm.value.lot_id,
        template_id: createForm.value.template_id!,
      })
    }
    ElMessage.success('创建成功')
    showCreateDialog.value = false
    loadOutlines()
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '创建失败')
  } finally {
    creating.value = false
  }
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
