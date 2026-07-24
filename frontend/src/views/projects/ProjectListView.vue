<template>
  <div class="project-list">
    <!-- 顶部工具栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <el-input
          v-model="searchKeyword"
          placeholder="搜索项目名称"
          clearable
          style="width: 240px"
          @clear="handleSearch"
          @keyup.enter="handleSearch"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <el-select v-model="statusFilter" placeholder="状态筛选" clearable style="width: 140px" @change="handleSearch">
          <el-option label="进行中" value="active" />
          <el-option label="已归档" value="archived" />
          <el-option label="已关闭" value="closed" />
        </el-select>
      </div>
      <div class="toolbar-right">
        <el-button @click="showInstructions = true">
          <el-icon><QuestionFilled /></el-icon>
          标书制作说明
        </el-button>
        <el-button type="primary" @click="showCreateDialog = true">
          <el-icon><Plus /></el-icon>
          新建项目
        </el-button>
      </div>
    </div>

    <!-- 项目卡片网格 -->
    <div v-loading="projectStore.loading" class="project-grid">
      <el-empty v-if="!projectStore.loading && projectStore.projects.length === 0" description="暂无项目，点击右上角新建" />
      <el-card
        v-for="project in projectStore.projects"
        :key="project.id"
        class="project-card"
        shadow="hover"
      >
        <div class="card-header">
          <span class="project-name" @click="goToProject(project.id)">{{ project.name }}</span>
          <div class="card-actions">
            <el-tag :type="getStatusTagType(project.status)" size="small">
              {{ getStatusLabel(project.status) }}
            </el-tag>
            <el-dropdown trigger="click" @command="(cmd: string) => handleProjectAction(cmd, project.id)" @click.stop>
              <el-button link size="small" @click.stop>
                <el-icon><MoreFilled /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="view">
                    <el-icon><View /></el-icon>查看详情
                  </el-dropdown-item>
                  <el-dropdown-item v-if="project.status !== 'archived'" command="archive">
                    <el-icon><FolderOpened /></el-icon>归档项目
                  </el-dropdown-item>
                  <el-dropdown-item command="delete" divided>
                    <el-icon><Delete /></el-icon>删除项目
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>
        <div class="card-body" @click="goToProject(project.id)">
          <p class="project-desc">{{ project.description || '暂无描述' }}</p>
          <div class="project-meta">
            <span class="meta-item">
              <el-icon><User /></el-icon>
              {{ project.created_by_name }}
            </span>
            <span class="meta-item">
              <el-icon><Folder /></el-icon>
              {{ project.lot_count }} 个标段
            </span>
          </div>
          <div class="project-time">
            创建于 {{ formatDate(project.created_at) }}
          </div>
        </div>
      </el-card>
    </div>

    <!-- 分页 -->
    <div v-if="projectStore.total > projectStore.pageSize" class="pagination">
      <el-pagination
        v-model:current-page="currentPage"
        :page-size="projectStore.pageSize"
        :total="projectStore.total"
        layout="prev, pager, next"
        @current-change="handlePageChange"
      />
    </div>

    <!-- 新建项目弹窗 -->
    <el-dialog v-model="showCreateDialog" title="新建项目" width="540px" destroy-on-close>
      <el-form ref="createFormRef" :model="createForm" :rules="createRules" label-width="100px">
        <el-form-item label="项目名称" prop="name">
          <el-input v-model="createForm.name" maxlength="255" show-word-limit placeholder="请输入项目名称" />
        </el-form-item>
        <el-form-item label="项目描述" prop="description">
          <el-input
            v-model="createForm.description"
            type="textarea"
            :rows="3"
            maxlength="1000"
            show-word-limit
            placeholder="请输入项目描述（可选）"
          />
        </el-form-item>
        <el-form-item label="流程模板" prop="workflow_template_id">
          <el-select v-model="createForm.workflow_template_id" placeholder="请选择流程模板" style="width: 100%">
            <el-option
              v-for="tpl in templates"
              :key="tpl.id"
              :label="tpl.name"
              :value="tpl.id"
            >
              <div class="template-option">
                <span class="template-name">
                  {{ tpl.name }}
                  <el-tag v-if="tpl.is_builtin" type="primary" size="small" class="template-tag">
                    <el-icon><Star /></el-icon>系统
                  </el-tag>
                  <el-tag v-else type="success" size="small" class="template-tag">
                    <el-icon><Stamp /></el-icon>自定义
                  </el-tag>
                </span>
                <span class="template-desc">{{ tpl.description }}</span>
              </div>
            </el-option>
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="handleCreate">创建</el-button>
      </template>
    </el-dialog>

    <!-- 标书制作说明对话框 -->
    <BidInstructionsDialog v-model="showInstructions" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Plus, User, Folder, Star, Stamp, MoreFilled, View, FolderOpened, Delete, QuestionFilled } from '@element-plus/icons-vue'
import BidInstructionsDialog from './components/BidInstructionsDialog.vue'
import { useProjectStore } from '@/stores/project'
import { templateApi, type WorkflowTemplate, archiveProject, deleteProject } from '@/api/project'
import type { FormInstance, FormRules } from 'element-plus'

const router = useRouter()
const projectStore = useProjectStore()

// 搜索和筛选
const searchKeyword = ref('')
const statusFilter = ref('')
const currentPage = ref(1)

// 模板列表
const templates = ref<WorkflowTemplate[]>([])

// 标书制作说明
const showInstructions = ref(false)

// 新建项目
const showCreateDialog = ref(false)
const createFormRef = ref<FormInstance>()
const creating = ref(false)
const createForm = ref({
  name: '',
  description: '',
  workflow_template_id: undefined as number | undefined,
})

const createRules: FormRules = {
  name: [
    { required: true, message: '请输入项目名称', trigger: 'blur' },
    { max: 255, message: '项目名称不能超过255个字符', trigger: 'blur' },
  ],
  workflow_template_id: [
    { required: true, message: '请选择流程模板', trigger: 'change' },
  ],
}

// 加载项目列表
async function loadProjects() {
  await projectStore.fetchProjects({
    page: currentPage.value,
    keyword: searchKeyword.value || undefined,
    status: statusFilter.value || undefined,
  })
}

// 加载流程模板
async function loadTemplates() {
  try {
    const res = await templateApi.listSystem()
    templates.value = res.data.results
  } catch {
    // 忽略错误
  }
}

// 搜索
function handleSearch() {
  currentPage.value = 1
  loadProjects()
}

// 分页
function handlePageChange(page: number) {
  currentPage.value = page
  loadProjects()
}

// 创建项目
async function handleCreate() {
  if (!createFormRef.value) return
  await createFormRef.value.validate()

  creating.value = true
  try {
    const project = await projectStore.createProject({
      name: createForm.value.name,
      description: createForm.value.description,
      workflow_template_id: createForm.value.workflow_template_id,
    })
    ElMessage.success('项目创建成功')
    showCreateDialog.value = false
    // 重置表单
    createForm.value = { name: '', description: '', workflow_template_id: undefined }
    // 跳转到项目详情
    router.push(`/projects/${project.id}`)
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '创建失败')
  } finally {
    creating.value = false
  }
}

// 跳转项目详情
function goToProject(id: number) {
  router.push(`/projects/${id}`)
}

// 项目操作
async function handleProjectAction(cmd: string, projectId: number) {
  if (cmd === 'view') {
    goToProject(projectId)
  } else if (cmd === 'archive') {
    try {
      await ElMessageBox.confirm('确认归档此项目？归档后项目将只能查看，不能修改。', '归档确认', { type: 'warning' })
      await archiveProject(projectId)
      ElMessage.success('项目已归档')
      loadProjects()
    } catch (err: unknown) {
      if (err !== 'cancel') {
        ElMessage.error('归档失败')
      }
    }
  } else if (cmd === 'delete') {
    try {
      await ElMessageBox.confirm('确认删除此项目？删除后将无法恢复，所有关联数据将被删除。', '删除确认', { type: 'warning' })
      await deleteProject(projectId)
      ElMessage.success('项目已删除')
      loadProjects()
    } catch (err: unknown) {
      if (err !== 'cancel') {
        ElMessage.error('删除失败')
      }
    }
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

// 日期格式化
function formatDate(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

onMounted(() => {
  loadProjects()
  loadTemplates()
})
</script>

<style scoped>
.project-list {
  padding: 20px;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.toolbar-left {
  display: flex;
  gap: 12px;
}

.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
  min-height: 200px;
}

.project-card {
  cursor: pointer;
  transition: transform 0.2s;
}

.project-card:hover {
  transform: translateY(-2px);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.project-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  margin-right: 8px;
  cursor: pointer;
}

.project-name:hover {
  color: var(--el-color-primary);
}

.card-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.card-body {
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.project-desc {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 36px;
}

.project-meta {
  display: flex;
  gap: 16px;
  color: var(--el-text-color-regular);
  font-size: 13px;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.project-time {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.pagination {
  display: flex;
  justify-content: center;
  margin-top: 20px;
}

.template-option {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.template-name {
  display: flex;
  align-items: center;
  gap: 8px;
}

.template-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.template-desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
