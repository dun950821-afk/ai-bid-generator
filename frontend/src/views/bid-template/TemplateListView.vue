<!-- frontend/src/views/bid-template/TemplateListView.vue -->
<template>
  <div class="template-list-page">
    <div class="toolbar">
      <el-radio-group v-model="scopeFilter" @change="loadTemplates">
        <el-radio-button value="">全部</el-radio-button>
        <el-radio-button value="system">系统模板</el-radio-button>
        <el-radio-button value="enterprise">企业模板</el-radio-button>
        <el-radio-button value="project">项目模板</el-radio-button>
      </el-radio-group>

      <el-input
        v-model="search"
        placeholder="搜索模板……"
        clearable
        class="search-input"
        @input="loadTemplates"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>

      <el-button v-if="canManage && !hasDefault" @click="handleInitDefault">
        初始化默认模板
      </el-button>
      <el-button v-if="canManage" type="primary" @click="showCreateDialog = true">
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
        <div class="card-cover" v-if="template.cover_url" @click="goDetail(template)">
          <img :src="template.cover_url" alt="模板首页预览" />
        </div>
        <div class="card-header" @click="goDetail(template)">
          <div class="template-title">
            <span class="name">{{ template.name }}</span>
            <el-tag size="small">{{ template.scope_type_display }}</el-tag>
            <el-tag v-if="template.status === 'active'" size="small" type="success">
              V{{ template.published_version_no }}
            </el-tag>
            <el-tag v-else size="small" type="info">草稿</el-tag>
            <el-tag v-if="template.is_default" size="small" type="warning">默认</el-tag>
          </div>
          <div class="card-actions" @click.stop>
            <el-button
              v-if="canManage"
              type="primary"
              size="small"
              @click="goEditor(template)"
            >
              <el-icon><Edit /></el-icon>设计
            </el-button>
            <el-dropdown trigger="click" @command="(cmd: string) => handleCommand(cmd, template)">
              <el-button type="info" size="small">
                <el-icon><MoreFilled /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="detail">
                    <el-icon><View /></el-icon>详情
                  </el-dropdown-item>
                  <el-dropdown-item command="download" :disabled="!template.has_draft_file">
                    <el-icon><Download /></el-icon>下载
                  </el-dropdown-item>
                  <el-dropdown-item v-if="canManage" command="publish" :disabled="!template.has_draft_file">
                    <el-icon><Promotion /></el-icon>发布新版本
                  </el-dropdown-item>
                  <el-dropdown-item v-if="canManage && !template.is_default" command="set_default" :disabled="!template.published_version_no">
                    <el-icon><Star /></el-icon>设为默认
                  </el-dropdown-item>
                  <el-dropdown-item v-if="canManage" command="delete" divided>
                    <el-icon><Delete /></el-icon>删除
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>
        <div class="card-body" @click="goDetail(template)">
          <p class="description">{{ template.description || '暂无描述' }}</p>
          <div class="meta">
            <span>版本 {{ template.version_count }} 个</span>
            <span>使用 {{ template.usage_count }} 次</span>
            <span>更新于 {{ formatDate(template.updated_at) }}</span>
          </div>
        </div>
      </el-card>

      <el-empty v-if="!loading && templates.length === 0" description="暂无模板" />
    </div>

    <!-- 新建模板弹窗 -->
    <el-dialog
      v-model="showCreateDialog"
      title="新建模板"
      width="520px"
      @close="resetForm"
    >
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="100px">
        <el-form-item label="模板名称" prop="name">
          <el-input v-model="form.name" maxlength="255" placeholder="如：银行标准投标模板" />
        </el-form-item>
        <el-form-item label="作用域" prop="scope_type">
          <el-radio-group v-model="form.scope_type">
            <el-radio value="system">系统模板</el-radio>
            <el-radio value="enterprise">企业模板</el-radio>
            <el-radio value="project">项目模板</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="模板描述">
          <el-input v-model="form.description" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item label="初始文件">
          <el-upload
            ref="uploadRef"
            :auto-upload="false"
            :limit="1"
            accept=".docx"
            :on-change="handleFileChange"
            :on-remove="() => (form.file = undefined)"
          >
            <el-button>选择 DOCX（可选）</el-button>
            <template #tip>
              <div class="el-upload__tip">不上传则创建空白模板，之后可在线设计</div>
            </template>
          </el-upload>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleCreate">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Delete,
  Download,
  Edit,
  MoreFilled,
  Plus,
  Promotion,
  Search,
  Star,
  View,
} from '@element-plus/icons-vue'
import type { FormInstance, FormRules, UploadFile } from 'element-plus'
import {
  createTemplate,
  deleteTemplate,
  downloadTemplate,
  initDefaultTemplate,
  listTemplates,
  publishTemplate,
  setDefaultTemplate,
  type BidWordTemplate,
} from '@/api/bidTemplate'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()

const loading = ref(false)
const saving = ref(false)
const templates = ref<BidWordTemplate[]>([])
const scopeFilter = ref('')
const search = ref('')
const showCreateDialog = ref(false)
const formRef = ref<FormInstance>()

const canManage = auth.hasGlobalPermission('bid_template.manage')

const hasDefault = computed(() => templates.value.some(t => t.is_default))

const form = reactive<{
  name: string
  description: string
  scope_type: 'system' | 'enterprise' | 'project'
  file?: File
}>({
  name: '',
  description: '',
  scope_type: 'system',
  file: undefined,
})

const formRules: FormRules = {
  name: [{ required: true, message: '请输入模板名称', trigger: 'blur' }],
  scope_type: [{ required: true, message: '请选择作用域', trigger: 'change' }],
}

async function loadTemplates() {
  loading.value = true
  try {
    const res = await listTemplates({
      search: search.value || undefined,
      scope_type: scopeFilter.value || undefined,
    })
    const data = res.data
    templates.value = Array.isArray(data) ? data : data.results
  } catch (err) {
    ElMessage.error('加载模板列表失败')
  } finally {
    loading.value = false
  }
}

function handleFileChange(file: UploadFile) {
  form.file = file.raw
}

async function handleCreate() {
  await formRef.value?.validate()
  saving.value = true
  try {
    const res = await createTemplate({ ...form })
    ElMessage.success('模板创建成功')
    showCreateDialog.value = false
    // 创建后直接进入在线设计
    goEditor(res.data)
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.error || '创建失败')
  } finally {
    saving.value = false
  }
}

function resetForm() {
  form.name = ''
  form.description = ''
  form.scope_type = 'system'
  form.file = undefined
}

function goDetail(template: BidWordTemplate) {
  router.push(`/bid-templates/${template.id}`)
}

function goEditor(template: BidWordTemplate) {
  router.push(`/bid-templates/${template.id}/editor`)
}

async function handleCommand(command: string, template: BidWordTemplate) {
  if (command === 'detail') {
    goDetail(template)
  } else if (command === 'download') {
    await handleDownload(template)
  } else if (command === 'publish') {
    await handlePublish(template)
  } else if (command === 'set_default') {
    await handleSetDefault(template)
  } else if (command === 'delete') {
    await handleDelete(template)
  }
}

async function handleSetDefault(template: BidWordTemplate) {
  try {
    await setDefaultTemplate(template.id)
    ElMessage.success(`已把「${template.name}」设为默认模板`)
    loadTemplates()
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.error || '设置失败')
  }
}

async function handleInitDefault() {
  try {
    await initDefaultTemplate()
    ElMessage.success('系统默认模板已初始化')
    loadTemplates()
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.error || '初始化失败')
  }
}

async function handleDownload(template: BidWordTemplate) {
  try {
    const res = await downloadTemplate(template.id)
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = url
    a.download = `${template.name}.docx`
    a.click()
    URL.revokeObjectURL(url)
  } catch (err) {
    ElMessage.error('下载失败')
  }
}

async function handlePublish(template: BidWordTemplate) {
  try {
    await ElMessageBox.confirm(
      `将当前草稿发布为新版本（V${(template.published_version_no || 0) + 1}）？发布后版本不可修改。`,
      '发布模板',
      { confirmButtonText: '发布', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  try {
    const res = await publishTemplate(template.id)
    ElMessage.success(`已发布 V${res.data.version.version_no}`)
    loadTemplates()
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.error || '发布失败')
  }
}

async function handleDelete(template: BidWordTemplate) {
  try {
    await ElMessageBox.confirm(
      `确定删除模板「${template.name}」？其全部版本将一并删除。`,
      '删除模板',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await deleteTemplate(template.id)
    ElMessage.success('已删除')
    loadTemplates()
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '删除失败')
  }
}

function formatDate(value?: string | null) {
  if (!value) return '-'
  return value.slice(0, 10)
}

onMounted(loadTemplates)
</script>

<style scoped>
.template-list-page {
  padding: 20px;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.search-input {
  width: 240px;
}

.toolbar .el-button {
  margin-left: auto;
}

.template-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.template-card {
  cursor: pointer;
}

.card-cover {
  margin: -20px -20px 12px;
  height: 160px;
  overflow: hidden;
  border-bottom: 1px solid #ebeef5;
  background: #f5f7fa;
  display: flex;
  align-items: center;
  justify-content: center;
}

.card-cover img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}

.template-title {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.template-title .name {
  font-weight: 600;
  font-size: 15px;
}

.card-actions {
  flex-shrink: 0;
  display: flex;
  gap: 4px;
}

.card-body .description {
  color: #606266;
  font-size: 13px;
  margin: 10px 0;
  min-height: 36px;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.card-body .meta {
  display: flex;
  gap: 12px;
  color: #909399;
  font-size: 12px;
}
</style>
