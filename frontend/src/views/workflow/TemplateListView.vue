<!-- frontend/src/views/workflow/TemplateListView.vue -->
<template>
  <div class="template-list">
    <div class="toolbar">
      <el-radio-group v-model="activeTab" @change="loadTemplates">
        <el-radio-button value="system">系统模板</el-radio-button>
        <el-radio-button value="custom">自定义模板</el-radio-button>
      </el-radio-group>
      <el-button type="primary" @click="showCreateDialog = true" v-if="activeTab === 'custom'">
        <el-icon><Plus /></el-icon>
        新建模板
      </el-button>
    </div>

    <div class="template-cards" v-loading="loading">
      <el-card
        v-for="template in templates"
        :key="template.id"
        class="template-card"
        shadow="hover"
      >
        <div class="card-header">
          <div class="template-title" @click="handleViewTemplate(template)">
            <span class="name">{{ template.name }}</span>
            <el-tag v-if="template.is_builtin" size="small" type="primary">内置</el-tag>
            <el-tag v-if="!template.is_active" size="small" type="danger">已禁用</el-tag>
          </div>
          <div class="card-actions" @click.stop>
            <el-button type="primary" size="small" @click="handleViewTemplate(template)">
              <el-icon><View /></el-icon>
            </el-button>
            <el-button v-if="template.is_builtin" type="success" size="small" @click="handleCopy(template)">
              <el-icon><CopyDocument /></el-icon>
            </el-button>
            <el-button v-if="!template.is_builtin" type="primary" size="small" @click="handleEdit(template)">
              <el-icon><Edit /></el-icon>
            </el-button>
            <el-dropdown trigger="click" @command="(cmd: string) => handleCommand(cmd, template)">
              <el-button type="info" size="small">
                <el-icon><MoreFilled /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="view">
                    <el-icon><View /></el-icon>查看详情
                  </el-dropdown-item>
                  <el-dropdown-item v-if="template.is_builtin" command="copy">
                    <el-icon><CopyDocument /></el-icon>克隆
                  </el-dropdown-item>
                  <el-dropdown-item v-if="!template.is_builtin" command="edit">
                    <el-icon><Edit /></el-icon>编辑
                  </el-dropdown-item>
                  <el-dropdown-item v-if="!template.is_builtin" :command="template.is_active ? 'disable' : 'enable'">
                    <el-icon v-if="template.is_active"><Close /></el-icon>
                    <el-icon v-else><Check /></el-icon>
                    {{ template.is_active ? '禁用' : '启用' }}
                  </el-dropdown-item>
                  <el-dropdown-item v-if="!template.is_builtin" command="delete" divided>
                    <el-icon><Delete /></el-icon>删除
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>
        <div class="card-body" @click="handleViewTemplate(template)">
          <p class="description">{{ template.description || '暂无描述' }}</p>
          <div class="meta">
            <span class="node-count">
              <el-icon><List /></el-icon>
              {{ template.node_count }} 个节点
            </span>
            <span class="created-at">
              创建于 {{ formatDate(template.created_at) }}
            </span>
          </div>
        </div>
      </el-card>

      <el-empty v-if="!loading && templates.length === 0" description="暂无模板" />
    </div>

    <!-- 新建/编辑模板弹窗 -->
    <el-dialog
      v-model="showCreateDialog"
      :title="editingTemplate ? '编辑模板' : '新建模板'"
      width="500px"
      @close="resetForm"
    >
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="100px">
        <el-form-item label="模板名称" prop="name">
          <el-input v-model="form.name" maxlength="255" />
        </el-form-item>
        <el-form-item label="模板描述" prop="description">
          <el-input v-model="form.description" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, MoreFilled, View, CopyDocument, Edit, Delete, Close, Check, List } from '@element-plus/icons-vue'
import { workflowApi, type WorkflowTemplate } from '@/api/workflow'
import type { FormInstance, FormRules } from 'element-plus'

const router = useRouter()
const loading = ref(false)
const activeTab = ref('system')
const templates = ref<WorkflowTemplate[]>([])

const showCreateDialog = ref(false)
const editingTemplate = ref<WorkflowTemplate | null>(null)
const saving = ref(false)

const formRef = ref<FormInstance>()
const form = ref({
  name: '',
  description: '',
})

const formRules: FormRules = {
  name: [
    { required: true, message: '请输入模板名称', trigger: 'blur' },
    { max: 255, message: '模板名称不能超过255个字符', trigger: 'blur' },
  ],
}

async function loadTemplates() {
  loading.value = true
  try {
    const res = await workflowApi.getTemplates({
      scope: activeTab.value,
    })
    templates.value = res.data.results || []
  } finally {
    loading.value = false
  }
}

function resetForm() {
  editingTemplate.value = null
  form.value = { name: '', description: '' }
  formRef.value?.resetFields()
}

function handleViewTemplate(template: WorkflowTemplate) {
  router.push(`/workflows/templates/${template.id}`)
}

function handleEdit(template: WorkflowTemplate) {
  editingTemplate.value = template
  form.value = {
    name: template.name,
    description: template.description || '',
  }
  showCreateDialog.value = true
}

async function handleSave() {
  if (!formRef.value) return
  await formRef.value.validate()

  saving.value = true
  try {
    if (editingTemplate.value) {
      await workflowApi.updateTemplate(editingTemplate.value.id, form.value)
      ElMessage.success('模板已更新')
    } else {
      // 创建自定义模板
      await workflowApi.createTemplate({ ...form.value, scope: 'custom' })
      ElMessage.success('模板已创建')
    }
    showCreateDialog.value = false
    loadTemplates()
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '操作失败')
  } finally {
    saving.value = false
  }
}

async function handleCopy(template: WorkflowTemplate) {
  try {
    await workflowApi.copyTemplate(template.id)
    ElMessage.success('模板已克隆')
    loadTemplates()
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '克隆失败')
  }
}

async function handleToggleStatus(template: WorkflowTemplate, isActive: boolean) {
  try {
    await workflowApi.updateTemplate(template.id, { is_active: isActive })
    ElMessage.success(isActive ? '模板已启用' : '模板已禁用')
    loadTemplates()
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '操作失败')
  }
}

function handleCommand(command: string, template: WorkflowTemplate) {
  switch (command) {
    case 'view':
      handleViewTemplate(template)
      break
    case 'copy':
      handleCopy(template)
      break
    case 'edit':
      handleEdit(template)
      break
    case 'enable':
      handleToggleStatus(template, true)
      break
    case 'disable':
      handleToggleStatus(template, false)
      break
    case 'delete':
      handleDelete(template)
      break
  }
}

async function handleDelete(template: WorkflowTemplate) {
  await ElMessageBox.confirm(
    `确定要删除模板 ${template.name} 吗？`,
    '删除确认',
    { type: 'warning' }
  )
  try {
    await workflowApi.deleteTemplate(template.id)
    ElMessage.success('模板已删除')
    loadTemplates()
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '删除失败')
  }
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

onMounted(() => {
  loadTemplates()
})
</script>

<style scoped>
.template-list {
  padding: 20px;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.template-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.template-card {
  transition: all 0.3s;
}

.template-card:hover {
  transform: translateY(-2px);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
  gap: 8px;
}

.template-title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  cursor: pointer;
}

.template-title:hover {
  opacity: 0.8;
}

.template-title .name {
  font-size: 16px;
  font-weight: 600;
}

.card-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.card-body {
  cursor: pointer;
}

.card-body:hover {
  opacity: 0.8;
}

.card-body .description {
  color: var(--el-text-color-secondary);
  font-size: 14px;
  margin: 0 0 12px;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.meta {
  display: flex;
  justify-content: space-between;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.node-count {
  display: flex;
  align-items: center;
  gap: 4px;
}
</style>