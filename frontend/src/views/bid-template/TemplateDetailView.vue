<!-- frontend/src/views/bid-template/TemplateDetailView.vue -->
<template>
  <div class="template-detail-page" v-loading="loading">
    <template v-if="template">
      <div class="page-header">
        <div>
          <h2>{{ template.name }}</h2>
          <div class="tags">
            <el-tag size="small">{{ template.scope_type_display }}</el-tag>
            <el-tag size="small" :type="template.status === 'active' ? 'success' : 'info'">
              {{ template.status_display }}
            </el-tag>
            <el-tag v-if="template.is_default" size="small" type="warning">默认模板</el-tag>
          </div>
        </div>
        <div class="actions">
          <el-button
            v-if="canManage && !template.is_default"
            :disabled="!template.published_version_no"
            @click="handleSetDefault"
          >
            <el-icon><Star /></el-icon>设为默认
          </el-button>
          <el-button @click="handleValidate" :disabled="!template.has_draft_file">
            <el-icon><CircleCheck /></el-icon>校验
          </el-button>
          <el-button @click="handleDownload" :disabled="!template.has_draft_file">
            <el-icon><Download /></el-icon>下载
          </el-button>
          <el-button v-if="canManage" type="primary" @click="goEditor">
            <el-icon><Edit /></el-icon>在线设计
          </el-button>
          <el-button
            v-if="canManage"
            type="success"
            :disabled="!template.has_draft_file"
            :loading="publishing"
            @click="handlePublish"
          >
            <el-icon><Promotion /></el-icon>发布新版本
          </el-button>
        </div>
      </div>

      <el-descriptions :column="2" border class="info-block">
        <el-descriptions-item label="模板编码">{{ template.code }}</el-descriptions-item>
        <el-descriptions-item label="当前发布版本">
          {{ template.published_version_no ? `V${template.published_version_no}` : '未发布' }}
        </el-descriptions-item>
        <el-descriptions-item label="草稿修订号">{{ template.draft_revision }}</el-descriptions-item>
        <el-descriptions-item label="使用次数">{{ template.usage_count }}</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ formatTime(template.created_at) }}</el-descriptions-item>
        <el-descriptions-item label="最近更新">{{ formatTime(template.updated_at) }}</el-descriptions-item>
        <el-descriptions-item label="模板说明" :span="2">
          {{ template.description || '暂无描述' }}
        </el-descriptions-item>
      </el-descriptions>

      <h3 class="section-title">格式规范（样式映射）</h3>
      <TemplateStylePanel
        v-if="template.has_draft_file"
        :template-id="templateId"
        :can-manage="canManage"
        class="info-block"
      />

      <h3 class="section-title">版本记录</h3>
      <el-table :data="versions" v-loading="versionsLoading" border>
        <el-table-column prop="version_no" label="版本" width="80">
          <template #default="{ row }">V{{ row.version_no }}</template>
        </el-table-column>
        <el-table-column prop="file_name" label="文件名" min-width="160" />
        <el-table-column label="大小" width="100">
          <template #default="{ row }">{{ formatSize(row.file_size) }}</template>
        </el-table-column>
        <el-table-column label="校验状态" width="110">
          <template #default="{ row }">
            <el-tag
              size="small"
              :type="row.validation_status === 'passed' ? 'success' : row.validation_status === 'failed' ? 'danger' : 'info'"
            >
              {{ row.validation_status_display }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="发布时间" width="160">
          <template #default="{ row }">{{ formatTime(row.published_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="260">
          <template #default="{ row }">
            <el-button size="small" @click="handleDownloadVersion(row.id)">下载</el-button>
            <el-button
              size="small"
              :disabled="!row.has_preview_pdf"
              @click="handlePreviewPdf(row.id)"
            >预览</el-button>
            <el-button
              v-if="canManage"
              size="small"
              type="warning"
              plain
              :disabled="row.id === template?.published_version"
              @click="handleRollback(row)"
            >回滚</el-button>
          </template>
        </el-table-column>
        <template #empty>还没有发布版本</template>
      </el-table>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Download, Edit, Promotion, CircleCheck, Star } from '@element-plus/icons-vue'
import {
  downloadTemplate,
  downloadTemplatePreview,
  getTemplate,
  listTemplateVersions,
  publishTemplate,
  rollbackTemplate,
  setDefaultTemplate,
  validateTemplate,
  type BidWordTemplate,
  type BidWordTemplateVersion,
} from '@/api/bidTemplate'
import TemplateStylePanel from '@/components/bid-template/TemplateStylePanel.vue'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const templateId = Number(route.params.id)
const loading = ref(false)
const versionsLoading = ref(false)
const publishing = ref(false)
const template = ref<BidWordTemplate | null>(null)
const versions = ref<BidWordTemplateVersion[]>([])

const canManage = auth.hasGlobalPermission('bid_template.manage')

async function loadAll() {
  loading.value = true
  try {
    const res = await getTemplate(templateId)
    template.value = res.data
  } catch (err) {
    ElMessage.error('加载模板失败')
  } finally {
    loading.value = false
  }
  loadVersions()
}

async function loadVersions() {
  versionsLoading.value = true
  try {
    const res = await listTemplateVersions(templateId)
    versions.value = res.data
  } catch (err) {
    ElMessage.error('加载版本记录失败')
  } finally {
    versionsLoading.value = false
  }
}

function goEditor() {
  router.push(`/bid-templates/${templateId}/editor`)
}

async function handleSetDefault() {
  try {
    await setDefaultTemplate(templateId)
    ElMessage.success('已设为默认模板')
    loadAll()
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.error || '设置失败')
  }
}

async function handlePreviewPdf(versionId: number) {
  try {
    const res = await downloadTemplatePreview(templateId, 'pdf', versionId)
    const url = URL.createObjectURL(res.data as Blob)
    window.open(url, '_blank')
  } catch (err) {
    ElMessage.error('预览不可用')
  }
}

async function handleRollback(version: BidWordTemplateVersion) {
  try {
    await ElMessageBox.confirm(
      `把 V${version.version_no} 复制为当前草稿？历史版本不会被修改，确认后可在编辑器中检查并重新发布。`,
      '回滚到此版本',
      { confirmButtonText: '回滚', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  try {
    const res = await rollbackTemplate(templateId, version.id)
    ElMessage.success(res.data.message)
    loadAll()
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.error || '回滚失败')
  }
}

async function handleValidate() {  try {
    const res = await validateTemplate(templateId)
    const result = res.data
    if (result.valid) {
      ElMessageBox.alert(
        `识别变量：${result.variables.join('、') || '无'}`,
        '校验通过',
        { confirmButtonText: '知道了', type: 'success' },
      )
    } else {
      ElMessageBox.alert(
        result.errors.map(e => `× ${e.message}`).join('\n'),
        '校验未通过',
        { confirmButtonText: '知道了', type: 'error' },
      )
    }
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.error || '校验失败')
  }
}

async function handlePublish() {
  try {
    await ElMessageBox.confirm(
      '将当前草稿发布为新版本？发布后版本不可修改。',
      '发布模板',
      { confirmButtonText: '发布', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  publishing.value = true
  try {
    const res = await publishTemplate(templateId)
    ElMessage.success(`已发布 V${res.data.version.version_no}`)
    loadAll()
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.error || '发布失败')
  } finally {
    publishing.value = false
  }
}

function saveBlob(data: Blob, filename: string) {
  const url = URL.createObjectURL(data)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

async function handleDownload() {
  if (!template.value) return
  try {
    const res = await downloadTemplate(templateId)
    saveBlob(res.data, `${template.value.name}.docx`)
  } catch (err) {
    ElMessage.error('下载失败')
  }
}

async function handleDownloadVersion(versionId: number) {
  try {
    const res = await downloadTemplate(templateId, versionId)
    saveBlob(res.data, `${template.value?.name || '模板'}.docx`)
  } catch (err) {
    ElMessage.error('下载失败')
  }
}

function formatTime(value?: string | null) {
  if (!value) return '-'
  return value.replace('T', ' ').slice(0, 19)
}

function formatSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

onMounted(loadAll)
</script>

<style scoped>
.template-detail-page {
  padding: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
}

.page-header h2 {
  margin: 0 0 8px 0;
}

.tags {
  display: flex;
  gap: 6px;
}

.actions {
  display: flex;
  gap: 8px;
}

.info-block {
  margin-bottom: 24px;
}

.section-title {
  margin: 0 0 12px 0;
}
</style>
