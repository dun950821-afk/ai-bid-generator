<!-- frontend/src/views/admin/PromptListView.vue -->
<template>
  <div class="prompt-list">
    <div class="toolbar">
      <el-select v-model="filterScenario" placeholder="场景筛选" clearable style="width: 160px" @change="handleFilterChange">
        <el-option v-for="item in SCENARIO_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
      </el-select>
      <el-checkbox v-model="showInactive" @change="handleFilterChange">显示已停用</el-checkbox>
      <el-button type="primary" @click="showCreateDialog = true">
        <el-icon><Plus /></el-icon>
        新建模板
      </el-button>
    </div>

    <div class="content" v-loading="loading">
      <!-- 左侧模板列表 -->
      <div class="template-panel">
        <h3>模板列表</h3>
        <el-menu :default-active="selectedTemplateId" @select="handleSelectTemplate">
          <el-menu-item-group v-for="group in groupedTemplates" :key="group.scenario" :title="group.label">
            <el-menu-item
              v-for="template in group.templates"
              :key="String(template.id)"
              :index="String(template.id)"
            >
              <div class="template-item">
                <span class="template-name">{{ template.name }}</span>
                <el-tag v-if="!template.is_active" size="small" type="danger">已停用</el-tag>
                <el-tag v-if="template.published_version" size="small" type="success">已发布</el-tag>
              </div>
            </el-menu-item>
          </el-menu-item-group>
        </el-menu>
        <el-empty v-if="templates.length === 0" description="暂无模板" />
        <el-pagination
          v-if="total > pageSize"
          :current-page="currentPage"
          :page-size="pageSize"
          :total="total"
          layout="total, prev, pager, next"
          class="pagination"
          @current-change="handlePageChange"
        />
      </div>

      <!-- 右侧模板详情 -->
      <div class="detail-panel">
        <div v-if="selectedTemplate" class="detail-content">
          <div class="detail-header">
            <div class="template-info">
              <h3>{{ selectedTemplate.name }}</h3>
              <el-tag size="small">{{ selectedTemplate.scenario_display }}</el-tag>
              <el-tag v-if="!selectedTemplate.is_active" size="small" type="danger">已停用</el-tag>
            </div>
            <div class="actions">
              <el-button type="primary" size="small" @click="handleEditTemplate">
                编辑
              </el-button>
              <el-button type="success" size="small" @click="handleNewVersion">
                新建版本
              </el-button>
              <el-button size="small" @click="openPlayground">
                <el-icon><VideoPlay /></el-icon>
                Playground
              </el-button>
              <el-button
                v-if="selectedTemplate.is_active"
                type="danger"
                size="small"
                @click="handleDeactivate"
              >
                停用
              </el-button>
              <el-button
                v-else
                type="success"
                size="small"
                @click="handleActivate"
              >
                启用
              </el-button>
            </div>
          </div>

          <div class="detail-body">
            <el-descriptions :column="2" border>
              <el-descriptions-item label="模板 Key">{{ selectedTemplate.key }}</el-descriptions-item>
              <el-descriptions-item label="作用域">{{ selectedTemplate.scope_display }}</el-descriptions-item>
              <el-descriptions-item label="版本数量">{{ selectedTemplate.version_count }}</el-descriptions-item>
              <el-descriptions-item label="创建时间">{{ formatDate(selectedTemplate.created_at) }}</el-descriptions-item>
              <el-descriptions-item label="描述" :span="2">{{ selectedTemplate.description || '暂无描述' }}</el-descriptions-item>
            </el-descriptions>

            <!-- 已发布版本 -->
            <div class="published-section" v-if="selectedTemplate.published_version">
              <h4>已发布版本</h4>
              <el-card shadow="never">
                <div class="version-info">
                  <span class="version-number">{{ selectedTemplate.published_version.version }}</span>
                  <el-tag size="small" type="success">{{ selectedTemplate.published_version.status_display }}</el-tag>
                  <span class="version-time">{{ formatDate(selectedTemplate.published_version.created_at) }}</span>
                </div>
                <el-button type="primary" size="small" @click="handleViewVersions">
                  查看所有版本
                </el-button>
              </el-card>
            </div>

            <div class="no-published" v-else>
              <el-empty description="暂无已发布版本" :image-size="60" />
              <el-button type="primary" @click="handleNewVersion">创建第一个版本</el-button>
            </div>
          </div>
        </div>
        <el-empty v-else description="请选择一个模板查看详情" />
      </div>
    </div>

    <!-- 新建/编辑模板弹窗 -->
    <el-dialog
      v-model="showCreateDialog"
      :title="editingTemplate ? '编辑模板' : '新建模板'"
      width="500px"
      @close="resetForm"
    >
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="100px">
        <el-form-item label="模板 Key" prop="key" v-if="!editingTemplate">
          <el-input v-model="form.key" maxlength="100" placeholder="如：outline_generation.default" />
        </el-form-item>
        <el-form-item label="模板名称" prop="name">
          <el-input v-model="form.name" maxlength="100" />
        </el-form-item>
        <el-form-item label="场景" prop="scenario" v-if="!editingTemplate">
          <el-select v-model="form.scenario" style="width: 100%">
            <el-option v-for="item in SCENARIO_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="描述" prop="description">
          <el-input v-model="form.description" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSaveTemplate">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, VideoPlay } from '@element-plus/icons-vue'
import { promptApi, SCENARIO_OPTIONS, type PromptTemplate, type PromptTemplateCreateParams } from '@/api/prompt'
import type { FormInstance, FormRules } from 'element-plus'

const router = useRouter()
const loading = ref(false)
const templates = ref<PromptTemplate[]>([])
const selectedTemplateId = ref('')
const saving = ref(false)
const showCreateDialog = ref(false)
const editingTemplate = ref<PromptTemplate | null>(null)
const filterScenario = ref('')
const showInactive = ref(false)
const currentPage = ref(1)
const pageSize = ref(20)
const total = ref(0)

const formRef = ref<FormInstance>()
const form = ref<PromptTemplateCreateParams>({
  key: '',
  name: '',
  scenario: '',
  description: '',
})

const formRules: FormRules = {
  key: [
    { required: true, message: '请输入模板 Key', trigger: 'blur' },
    { pattern: /^[a-z][a-z0-9_.]*$/, message: 'Key 只能包含小写字母、数字、下划线和点，且以字母开头', trigger: 'blur' },
  ],
  name: [
    { required: true, message: '请输入模板名称', trigger: 'blur' },
  ],
  scenario: [
    { required: true, message: '请选择场景', trigger: 'change' },
  ],
}

const selectedTemplate = computed(() => {
  return templates.value.find(t => String(t.id) === selectedTemplateId.value)
})

// 筛选/停用过滤交由后端（分页 + 过滤都在服务端），前端只按场景分组展示当前页
const groupedTemplates = computed(() => {
  const groups: Record<string, { scenario: string; label: string; templates: PromptTemplate[] }> = {}

  for (const t of templates.value) {
    if (!groups[t.scenario]) {
      const option = SCENARIO_OPTIONS.find(o => o.value === t.scenario)
      groups[t.scenario] = {
        scenario: t.scenario,
        label: option?.label || t.scenario,
        templates: [],
      }
    }
    groups[t.scenario].templates.push(t)
  }

  return Object.values(groups).sort((a, b) => a.scenario.localeCompare(b.scenario))
})

async function loadTemplates() {
  loading.value = true
  try {
    const params: Record<string, unknown> = {
      page: currentPage.value,
      page_size: pageSize.value,
    }
    if (!showInactive.value) params.is_active = true
    if (filterScenario.value) params.scenario = filterScenario.value

    const res = await promptApi.listTemplates(params)
    templates.value = res.data.results || []
    total.value = res.data.count || 0

    if (templates.value.length > 0 && !selectedTemplateId.value) {
      const activeTemplate = templates.value.find(t => t.is_active)
      if (activeTemplate) {
        selectedTemplateId.value = String(activeTemplate.id)
      }
    }
  } finally {
    loading.value = false
  }
}

function handlePageChange(page: number) {
  currentPage.value = page
  loadTemplates()
}

function handleFilterChange() {
  currentPage.value = 1
  loadTemplates()
}

function handleSelectTemplate(id: string) {
  selectedTemplateId.value = id
}

function handleEditTemplate() {
  if (!selectedTemplate.value) return
  editingTemplate.value = selectedTemplate.value
  form.value = {
    key: selectedTemplate.value.key,
    name: selectedTemplate.value.name,
    scenario: selectedTemplate.value.scenario,
    description: selectedTemplate.value.description,
  }
  showCreateDialog.value = true
}

function handleNewVersion() {
  if (!selectedTemplate.value) return
  router.push({ name: 'admin-prompt-detail', params: { id: selectedTemplate.value.id } })
}

function handleViewVersions() {
  if (!selectedTemplate.value) return
  router.push({ name: 'admin-prompt-detail', params: { id: selectedTemplate.value.id } })
}

function openPlayground() {
  if (!selectedTemplate.value) return
  router.push({
    path: '/playground',
    query: { template_id: selectedTemplate.value.id },
  })
}

async function handleDeactivate() {
  if (!selectedTemplate.value) return

  await ElMessageBox.confirm(
    '停用后模板将不再可用，确定要停用吗？',
    '停用模板',
    { type: 'warning' }
  )

  try {
    await promptApi.deactivateTemplate(selectedTemplate.value.id)
    ElMessage.success('模板已停用')
    await loadTemplates()
  } catch (error) {
    ElMessage.error('停用失败')
  }
}

async function handleActivate() {
  if (!selectedTemplate.value) return

  try {
    await promptApi.updateTemplate(selectedTemplate.value.id, { is_active: true })
    ElMessage.success('模板已启用')
    await loadTemplates()
  } catch (error) {
    ElMessage.error('启用失败')
  }
}

async function handleSaveTemplate() {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  saving.value = true
  try {
    if (editingTemplate.value) {
      await promptApi.updateTemplate(editingTemplate.value.id, {
        name: form.value.name,
        description: form.value.description,
      })
      ElMessage.success('模板已更新')
    } else {
      await promptApi.createTemplate(form.value)
      ElMessage.success('模板已创建')
    }
    showCreateDialog.value = false
    await loadTemplates()
  } catch (error: any) {
    ElMessage.error(error.response?.data?.detail || '保存失败')
  } finally {
    saving.value = false
  }
}

function resetForm() {
  editingTemplate.value = null
  form.value = { key: '', name: '', scenario: '', description: '' }
  formRef.value?.resetFields()
}

function formatDate(date: string) {
  return new Date(date).toLocaleString('zh-CN')
}

onMounted(() => {
  loadTemplates()
})
</script>

<style scoped>
.prompt-list {
  padding: 20px;
}

.toolbar {
  display: flex;
  gap: 16px;
  align-items: center;
  margin-bottom: 20px;
}

.content {
  display: flex;
  gap: 20px;
  min-height: 500px;
}

.template-panel {
  width: 280px;
  background: #fff;
  border-radius: 8px;
  padding: 16px;
}

.template-panel h3 {
  margin-bottom: 16px;
}

.template-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pagination {
  margin-top: 16px;
  justify-content: center;
}

.template-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
}

.detail-panel {
  flex: 1;
  background: #fff;
  border-radius: 8px;
  padding: 20px;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
}

.template-info h3 {
  margin-bottom: 8px;
}

.template-info .el-tag {
  margin-right: 8px;
}

.actions {
  display: flex;
  gap: 8px;
}

.detail-body {
  margin-top: 20px;
}

.published-section {
  margin-top: 24px;
}

.published-section h4 {
  margin-bottom: 12px;
}

.version-info {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.version-number {
  font-weight: 600;
}

.version-time {
  color: #909399;
}

.no-published {
  margin-top: 24px;
  text-align: center;
}
</style>