<template>
  <div class="project-detail" v-loading="loading">
    <div v-if="project" class="project-header">
      <div class="header-left">
        <h1 class="project-title">{{ project.name }}</h1>
        <el-tag :type="getStatusTagType(project.status)" size="small">
          {{ getStatusLabel(project.status) }}
        </el-tag>
      </div>
      <div class="header-right">
        <el-button v-if="canEdit" @click="showEditDialog = true">
          <el-icon><Edit /></el-icon>
          编辑
        </el-button>
        <el-button v-if="canArchive" type="danger" @click="handleArchive">
          <el-icon><Delete /></el-icon>
          归档
        </el-button>
      </div>
    </div>

    <!-- Tab 内容 -->
    <el-tabs v-model="activeTab" class="project-tabs">
      <el-tab-pane label="概览" name="overview">
        <ProjectOverview :project="project" :permissions="permissions" />
      </el-tab-pane>
      <el-tab-pane label="成员" name="members">
        <ProjectMembers :project-id="projectId" :can-manage="canManageMember" />
      </el-tab-pane>
      <el-tab-pane label="标段" name="lots">
        <ProjectLots :project-id="projectId" :can-operate="canOperateWorkflow" :is-archived="project?.status === 'archived'" />
      </el-tab-pane>
    </el-tabs>

    <!-- 编辑项目弹窗 -->
    <el-dialog v-model="showEditDialog" title="编辑项目" width="540px">
      <el-form :model="editForm" label-width="100px">
        <el-form-item label="项目名称">
          <el-input v-model="editForm.name" maxlength="255" show-word-limit />
        </el-form-item>
        <el-form-item label="项目描述">
          <el-input v-model="editForm.description" type="textarea" :rows="3" maxlength="1000" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEditDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Edit, Delete } from '@element-plus/icons-vue'
import { useProjectStore } from '@/stores/project'
import { projectApi, type Project } from '@/api/project'
import ProjectOverview from './ProjectOverview.vue'
import ProjectMembers from './ProjectMembers.vue'
import ProjectLots from './ProjectLots.vue'

const route = useRoute()
const router = useRouter()
const projectStore = useProjectStore()

const projectId = computed(() => Number(route.params.id))
const loading = ref(true)
const activeTab = ref('overview')
const project = ref<Project | null>(null)
const permissions = ref<string[]>([])

// 编辑
const showEditDialog = ref(false)
const saving = ref(false)
const editForm = ref({ name: '', description: '' })

// 权限计算
const canEdit = computed(() => permissions.value.includes('project.update'))
const canArchive = computed(() => permissions.value.includes('project.delete'))
const canManageMember = computed(() => permissions.value.includes('project.member.manage'))
const canOperateWorkflow = computed(() => permissions.value.includes('lot.workflow.operate'))

// 加载项目详情和权限
async function loadProject() {
  loading.value = true
  try {
    const [projectRes, permRes] = await Promise.all([
      projectApi.get(projectId.value),
      projectApi.getMyPermissions(projectId.value),
    ])
    project.value = projectRes.data
    permissions.value = permRes.data.permissions
    projectStore.setProjectPermissions(projectId.value, permissions.value)
    editForm.value = {
      name: project.value.name,
      description: project.value.description,
    }
  } catch (err: any) {
    if (err.response?.status === 404) {
      ElMessage.error('项目不存在')
      router.push('/projects')
    } else {
      ElMessage.error('加载失败')
    }
  } finally {
    loading.value = false
  }
}

// 保存编辑
async function handleSave() {
  saving.value = true
  try {
    project.value = await projectStore.updateProject(projectId.value, editForm.value)
    ElMessage.success('保存成功')
    showEditDialog.value = false
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

// 归档项目
async function handleArchive() {
  await ElMessageBox.confirm('确定要归档该项目吗？归档后项目将不再活跃。', '归档确认', {
    type: 'warning',
  })
  try {
    await projectStore.deleteProject(projectId.value)
    ElMessage.success('项目已归档')
    router.push('/projects')
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '归档失败')
  }
}

// 状态标签
function getStatusLabel(status: string) {
  const map: Record<string, string> = {
    active: '进行中',
    archived: '已归档',
    closed: '已关闭',
  }
  return map[status] || status
}

function getStatusTagType(status: string) {
  const map: Record<string, string> = {
    active: 'primary',
    archived: 'info',
    closed: 'danger',
  }
  return map[status] || 'info'
}

// 监听路由变化
watch(projectId, (newId, oldId) => {
  if (newId && newId !== oldId) {
    loadProject()
  }
})

onMounted(() => {
  loadProject()
})

onBeforeUnmount(() => {
  projectStore.clearProject()
})
</script>

<style scoped>
.project-detail {
  padding: 20px;
}

.project-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--el-border-color);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.project-title {
  font-size: 24px;
  margin: 0;
  font-weight: 600;
}

.header-right {
  display: flex;
  gap: 8px;
}

.project-tabs {
  margin-top: 0;
}
</style>