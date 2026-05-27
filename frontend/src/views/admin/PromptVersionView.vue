<!-- frontend/src/views/admin/PromptVersionView.vue -->
<template>
  <div class="prompt-version" v-loading="loading">
    <!-- 顶部模板信息 -->
    <div class="header">
      <div class="header-left">
        <el-button link @click="router.back()">
          <el-icon><ArrowLeft /></el-icon>
          返回
        </el-button>
        <div class="template-info" v-if="template">
          <h2>{{ template.name }}</h2>
          <el-tag size="small">{{ template.scenario_display }}</el-tag>
          <el-tag size="small" type="info">{{ template.key }}</el-tag>
        </div>
      </div>
      <el-button type="primary" @click="handleCreateVersion">
        <el-icon><Plus /></el-icon>
        新建版本
      </el-button>
    </div>

    <div class="content" v-if="template">
      <!-- 左侧版本列表 -->
      <div class="version-panel">
        <h3>版本列表</h3>
        <div class="version-list">
          <div
            v-for="v in versions"
            :key="v.id"
            class="version-item"
            :class="{ active: selectedVersionId === v.id }"
            @click="selectVersion(v)"
          >
            <div class="version-header">
              <span class="version-number">{{ v.version }}</span>
              <el-tag :type="getStatusType(v.status)" size="small">{{ v.status_display }}</el-tag>
            </div>
            <div class="version-meta">
              <span>{{ v.created_by_name || '系统' }}</span>
              <span>{{ formatDate(v.created_at) }}</span>
            </div>
          </div>
          <el-empty v-if="versions.length === 0" description="暂无版本" />
        </div>
      </div>

      <!-- 右侧版本内容 -->
      <div class="edit-panel">
        <div v-if="selectedVersion" class="edit-content">
          <div class="edit-header">
            <div class="version-title">
              <h3>{{ selectedVersion.version }}</h3>
              <el-tag :type="getStatusType(selectedVersion.status)" size="small">
                {{ selectedVersion.status_display }}
              </el-tag>
            </div>
            <div class="actions">
              <!-- Playground 入口 -->
              <el-button @click="goToPlayground">
                <el-icon><VideoPlay /></el-icon>
                Playground
              </el-button>
              <!-- draft 状态：可保存/发布/删除 -->
              <template v-if="selectedVersion.status === 'draft'">
                <el-button type="primary" :loading="saving" @click="handleSaveVersion">
                  保存
                </el-button>
                <el-button type="success" @click="handlePublish">
                  发布
                </el-button>
                <el-button type="danger" @click="handleDelete">
                  删除
                </el-button>
              </template>
              <!-- published/archived 状态：可复制为新版本 -->
              <template v-else>
                <el-button type="primary" @click="handleCopy">
                  复制为新版本
                </el-button>
              </template>
            </div>
          </div>

          <el-form :model="versionForm" label-width="100px" class="version-form">
            <el-form-item label="版本号">
              <el-input
                v-model="versionForm.version"
                :disabled="!isEditable"
                placeholder="如：1.0.0"
              />
            </el-form-item>

            <el-form-item label="系统提示词">
              <el-input
                v-model="versionForm.system_prompt"
                type="textarea"
                :rows="6"
                :disabled="!isEditable"
                placeholder="系统提示词（可选）"
              />
            </el-form-item>

            <el-form-item label="用户提示词">
              <el-input
                v-model="versionForm.user_prompt"
                type="textarea"
                :rows="10"
                :disabled="!isEditable"
                placeholder="用户提示词（必填），支持 Jinja2 变量插值：{{ variable_name }}"
              />
            </el-form-item>

            <el-form-item label="变更说明">
              <el-input
                v-model="versionForm.changelog"
                type="textarea"
                :rows="2"
                :disabled="!isEditable"
                placeholder="本次版本变更说明（可选）"
              />
            </el-form-item>
          </el-form>

          <!-- JSON Schema 编辑（仅草稿可编辑） -->
          <div class="schema-section">
            <h4>输出 Schema <el-tag size="small" type="info">JSON Schema</el-tag></h4>
            <el-input
              v-model="outputSchemaText"
              type="textarea"
              :rows="8"
              :disabled="!isEditable"
              placeholder="定义期望的 JSON 输出结构（可选）"
            />
            <div class="schema-error" v-if="schemaError">{{ schemaError }}</div>
          </div>

          <div class="schema-section">
            <h4>变量 Schema <el-tag size="small" type="info">JSON Schema</el-tag></h4>
            <el-input
              v-model="variableSchemaText"
              type="textarea"
              :rows="8"
              :disabled="!isEditable"
              placeholder="定义输入变量结构（可选）"
            />
          </div>
        </div>
        <el-empty v-else description="请选择一个版本" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Plus, VideoPlay } from '@element-plus/icons-vue'
import { promptApi, type PromptTemplate, type PromptVersion, type PromptVersionCreateParams } from '@/api/prompt'

const route = useRoute()
const router = useRouter()

const loading = ref(false)
const saving = ref(false)
const template = ref<PromptTemplate | null>(null)
const versions = ref<PromptVersion[]>([])
const selectedVersionId = ref<number | null>(null)
const schemaError = ref('')

const versionForm = ref<PromptVersionCreateParams>({
  version: '',
  system_prompt: '',
  user_prompt: '',
  changelog: '',
  output_schema: {},
  variable_schema: {},
})

const outputSchemaText = ref('{}')
const variableSchemaText = ref('{}')

const selectedVersion = computed(() => {
  return versions.value.find(v => v.id === selectedVersionId.value)
})

const isEditable = computed(() => {
  return selectedVersion.value?.status === 'draft'
})

function getStatusType(status: string) {
  switch (status) {
    case 'published': return 'success'
    case 'archived': return 'info'
    case 'draft': return 'warning'
    default: return ''
  }
}

function formatDate(date: string) {
  return new Date(date).toLocaleString('zh-CN')
}

async function loadTemplate() {
  const id = Number(route.params.id)
  if (!id) return

  loading.value = true
  try {
    const res = await promptApi.getTemplate(id)
    template.value = res.data
    versions.value = res.data.versions || []

    if (versions.value.length > 0) {
      const draftVersion = versions.value.find(v => v.status === 'draft')
      const publishedVersion = versions.value.find(v => v.status === 'published')
      selectVersion(draftVersion || publishedVersion || versions.value[0])
    }
  } catch (error) {
    ElMessage.error('加载模板失败')
    router.push({ name: 'admin-prompts' })
  } finally {
    loading.value = false
  }
}

function selectVersion(v: PromptVersion) {
  selectedVersionId.value = v.id
  versionForm.value = {
    version: v.version,
    system_prompt: v.system_prompt,
    user_prompt: v.user_prompt,
    changelog: v.changelog,
    output_schema: v.output_schema,
    variable_schema: v.variable_schema,
  }
  outputSchemaText.value = JSON.stringify(v.output_schema || {}, null, 2)
  variableSchemaText.value = JSON.stringify(v.variable_schema || {}, null, 2)
  schemaError.value = ''
}

async function handleSaveVersion() {
  if (!selectedVersion.value || !template.value) return

  // 验证 JSON Schema 格式
  try {
    versionForm.value.output_schema = outputSchemaText.value ? JSON.parse(outputSchemaText.value) : {}
    versionForm.value.variable_schema = variableSchemaText.value ? JSON.parse(variableSchemaText.value) : {}
  } catch {
    schemaError.value = 'JSON Schema 格式错误'
    return
  }

  saving.value = true
  schemaError.value = ''
  try {
    await promptApi.updateVersion(template.value.id, selectedVersion.value.id, versionForm.value)
    ElMessage.success('版本已保存')
    await loadTemplate()
  } catch (error: any) {
    const detail = error.response?.data?.detail
    if (typeof detail === 'string') {
      schemaError.value = detail
    } else {
      ElMessage.error('保存失败')
    }
  } finally {
    saving.value = false
  }
}

async function handlePublish() {
  if (!selectedVersion.value || !template.value) return

  await ElMessageBox.confirm(
    '发布后此版本将成为当前生效版本，之前的已发布版本将自动归档。确定要发布吗？',
    '发布版本',
    { type: 'warning' }
  )

  try {
    await promptApi.publishVersion(template.value.id, selectedVersion.value.id)
    ElMessage.success('版本已发布')
    await loadTemplate()
  } catch (error: any) {
    ElMessage.error(error.response?.data?.detail || '发布失败')
  }
}

async function handleDelete() {
  if (!selectedVersion.value || !template.value) return

  await ElMessageBox.confirm(
    '删除后无法恢复，确定要删除此草稿版本吗？',
    '删除版本',
    { type: 'warning' }
  )

  try {
    await promptApi.deleteVersion(template.value.id, selectedVersion.value.id)
    ElMessage.success('版本已删除')
    selectedVersionId.value = null
    await loadTemplate()
  } catch (error: any) {
    ElMessage.error(error.response?.data?.detail || '删除失败')
  }
}

async function handleCopy() {
  if (!selectedVersion.value || !template.value) return

  try {
    const res = await promptApi.copyVersion(template.value.id, selectedVersion.value.id)
    ElMessage.success('已创建新草稿')
    await loadTemplate()
    selectVersion(res.data)
  } catch (error: any) {
    ElMessage.error(error.response?.data?.detail || '复制失败')
  }
}

function handleCreateVersion() {
  if (!template.value) return

  // 生成新版本号
  const lastVersion = versions.value[0]?.version || '0.0.0'
  const parts = lastVersion.split('.').map(Number)
  parts[2] = (parts[2] || 0) + 1
  const newVersion = parts.join('.')

  const newDraft: PromptVersion = {
    id: 0,
    version: newVersion,
    status: 'draft',
    status_display: '草稿',
    system_prompt: selectedVersion.value?.system_prompt || '',
    user_prompt: selectedVersion.value?.user_prompt || '',
    output_schema: selectedVersion.value?.output_schema || {},
    variable_schema: selectedVersion.value?.variable_schema || {},
    changelog: '',
    created_by_name: '',
    created_at: new Date().toISOString(),
  }

  versions.value.unshift(newDraft as PromptVersion)
  selectVersion(newDraft as PromptVersion)
}

function goToPlayground() {
  if (selectedVersion.value) {
    router.push({
      path: '/playground',
      query: { version_id: selectedVersion.value.id },
    })
  }
}

onMounted(() => {
  loadTemplate()
})
</script>

<style scoped>
.prompt-version {
  padding: 20px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.template-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.template-info h2 {
  margin: 0;
}

.content {
  display: flex;
  gap: 20px;
  min-height: 600px;
}

.version-panel {
  width: 300px;
  background: #fff;
  border-radius: 8px;
  padding: 16px;
}

.version-panel h3 {
  margin-bottom: 16px;
}

.version-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.version-item {
  padding: 12px;
  border-radius: 8px;
  border: 1px solid #e4e7ed;
  cursor: pointer;
  transition: all 0.2s;
}

.version-item:hover {
  border-color: #409eff;
}

.version-item.active {
  border-color: #409eff;
  background: #ecf5ff;
}

.version-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.version-number {
  font-weight: 600;
}

.version-meta {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #909399;
}

.edit-panel {
  flex: 1;
  background: #fff;
  border-radius: 8px;
  padding: 20px;
}

.edit-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.version-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.version-title h3 {
  margin: 0;
}

.actions {
  display: flex;
  gap: 8px;
}

.version-form {
  margin-bottom: 24px;
}

.schema-section {
  margin-bottom: 24px;
}

.schema-section h4 {
  margin-bottom: 12px;
}

.schema-error {
  margin-top: 8px;
  color: #f56c6c;
  font-size: 14px;
}
</style>