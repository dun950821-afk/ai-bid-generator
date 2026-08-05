<template>
  <WorkbenchPanelShell
    title="招标文件上传"
    desc="支持 DOCX、DOC、PDF、TXT、MD 格式，最大 200MB。DOC 文件将自动转换为 DOCX 后解析"
    :icon="UploadFilled"
    :theme-color="STEP_THEME.tender_file.color"
    :theme-bg-color="STEP_THEME.tender_file.bgColor"
  >
    <!-- 大拖拽上传区 -->
    <el-upload
      ref="uploadRef"
      :auto-upload="false"
      :show-file-list="false"
      :on-change="handleFileChange"
      drag
      multiple
      class="upload-area"
    >
      <div class="upload-content">
        <div class="upload-icon-wrap">
          <el-icon class="upload-icon" :size="44"><UploadFilled /></el-icon>
        </div>
        <div class="upload-text">拖拽招标文件到此处，或 <em>点击选择文件</em></div>
        <div class="upload-hint">单次可上传多个文件，DOC 文件自动转换后解析</div>
      </div>
    </el-upload>

    <!-- 附件上传隐藏输入框（技术规范书等，与标书同项目同标段） -->
    <input
      ref="attachmentInput"
      type="file"
      accept=".docx,.doc,.pdf,.txt,.md"
      multiple
      style="display: none"
      @change="handleAttachmentChange"
    />

    <div v-if="uploading" class="upload-progress">
      <el-progress type="circle" :percentage="uploadProgress" :status="uploadStatus" :width="72" />
      <div class="upload-progress-text">上传中...</div>
    </div>

    <!-- 文件列表 -->
    <div v-if="files.length" class="file-section">
      <div class="section-header">
        <span class="section-title">已上传文件</span>
        <span class="section-count">{{ files.length }} 个</span>
      </div>
      <div class="file-cards">
        <div
          v-for="file in files"
          :key="file.id"
          class="file-card"
          :class="`is-${file.display_status}`"
        >
          <div class="file-icon">
            <el-icon :size="22"><Document /></el-icon>
          </div>
          <div class="file-info">
            <div class="file-name">{{ file.name }}</div>
            <div class="file-meta">
              <span class="file-status-text">{{ getDisplayLabel(file.display_status) }}</span>
              <span v-if="file.error_message" class="file-error" :title="file.error_message">
                {{ file.error_message }}
              </span>
            </div>
          </div>
          <div class="file-actions">
            <el-button
              v-if="file.display_status === 'failed'"
              type="warning"
              size="small"
              :loading="retryingId === file.id"
              @click="handleRetry(file.id)"
            >重试</el-button>
            <el-button size="small" type="primary" plain @click="viewFileDetail(file.id)">详情</el-button>
            <el-button
              type="danger"
              size="small"
              :loading="deletingId === file.id"
              @click="handleDelete(file)"
            >删除</el-button>
          </div>
        </div>
      </div>
    </div>
    <el-empty v-else-if="!uploading" description="暂无文件，请上传招标文件" :image-size="80" />
  </WorkbenchPanelShell>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { UploadFilled, Document } from '@element-plus/icons-vue'
import type { UploadFile } from 'element-plus'
import { directUpload, retryParse, deleteTenderFile } from '@/api/tender'
import {
  mapFileDisplayStatus,
  DISPLAY_STATUS_LABEL,
} from '@/utils/fileStatusMap'
import type { WorkbenchStatus, WorkbenchFile } from '@/api/workbench'
import WorkbenchPanelShell from './WorkbenchPanelShell.vue'
import { STEP_THEME } from './workbenchTheme'

const props = defineProps<{
  lotId: number
  projectId: number
  status: WorkbenchStatus | null
}>()

const emit = defineEmits<{ uploaded: [] }>()

const router = useRouter()
const uploadRef = ref()
const uploading = ref(false)
const uploadProgress = ref(0)
const uploadStatus = ref<'success' | 'exception' | ''>('')
const retryingId = ref<number | null>(null)
const deletingId = ref<number | null>(null)
const attachmentInput = ref<HTMLInputElement | null>(null)

const files = computed<WorkbenchFile[]>(() => {
  return props.status?.steps.tender_file.files ?? []
})

function getDisplayLabel(status: string): string {
  return DISPLAY_STATUS_LABEL[mapFileDisplayStatus(status)]
}

function handleFileChange(uploadFile: UploadFile) {
  const file = uploadFile.raw
  if (!file) return
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (!ext || !['docx', 'txt', 'md', 'pdf', 'doc'].includes(ext)) {
    ElMessage.error('暂不支持该文件格式，请上传 DOCX、DOC、PDF、TXT 或 MD 文件')
    uploadRef.value?.clearFiles()
    return
  }
  doUpload(file)
}

async function doUpload(file: File) {
  uploading.value = true
  uploadProgress.value = 30
  uploadStatus.value = ''
  try {
    await directUpload(file, {
      project_id: props.projectId,
      lot_id: props.lotId,
      file_category: 'tender_file',
    })
    uploadProgress.value = 100
    uploadStatus.value = 'success'
    ElMessage.success('上传成功，正在解析...')
    emit('uploaded')
    // 延迟 300ms 再弹附件引导，避免打断上传成功提示
    setTimeout(() => {
      ElMessageBox.confirm(
        '该标书是否包含技术规范书等附件？如需一并提取，请继续上传附件。',
        '上传附件',
        {
          confirmButtonText: '上传附件',
          cancelButtonText: '暂不需要',
          type: 'info',
        }
      ).then(() => {
        attachmentInput.value?.click()
      }).catch(() => {
        // 用户选择暂不需要
      })
    }, 300)
  } catch (err: any) {
    uploadStatus.value = 'exception'
    ElMessage.error(err.response?.data?.message || '上传失败')
  } finally {
    setTimeout(() => {
      uploading.value = false
      uploadProgress.value = 0
      uploadStatus.value = ''
    }, 1500)
  }
}

// 附件（技术规范书等）上传：复用当前面板的 project/lot 上下文，归类 attachment
async function handleAttachmentChange(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  input.value = ''
  if (!files.length) return
  for (const file of files) {
    try {
      await directUpload(file, {
        project_id: props.projectId,
        lot_id: props.lotId,
        file_category: 'attachment',
      })
      ElMessage.success(`附件「${file.name}」上传成功`)
    } catch (err: any) {
      ElMessage.error(err.response?.data?.message || `附件「${file.name}」上传失败`)
    }
  }
  emit('uploaded')
}

async function handleRetry(fileId: number) {
  retryingId.value = fileId
  try {
    await retryParse(fileId)
    ElMessage.success('已触发重新解析')
    emit('uploaded')
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '操作失败')
  } finally {
    retryingId.value = null
  }
}

function viewFileDetail(fileId: number) {
  router.push({ name: 'tender-file-detail', params: { fileId } })
}

async function handleDelete(file: WorkbenchFile) {
  const cascadeTip = file.outline_count > 0
    ? `其解析数据及基于该文件生成的 ${file.outline_count} 份标书将一并删除`
    : '其解析数据将一并删除'
  try {
    await ElMessageBox.confirm(
      `确定删除文件「${file.name}」吗？删除后，${cascadeTip}。此操作不可恢复。`,
      '确认删除',
      { type: 'warning', confirmButtonText: '删除', confirmButtonClass: 'el-button--danger' },
    )
    deletingId.value = file.id
    await deleteTenderFile(file.id)
    ElMessage.success('删除成功')
    emit('uploaded')
  } catch (err: any) {
    if (err !== 'cancel') {
      ElMessage.error(err.response?.data?.message || '删除失败')
    }
  } finally {
    deletingId.value = null
  }
}
</script>

<style scoped>
.upload-area :deep(.el-upload-dragger) {
  width: 100%;
  padding: 40px 24px;
  border: 2px dashed var(--el-border-color);
  border-radius: 12px;
  background: var(--el-fill-color-lighter);
  transition: all 0.2s ease;
}

.upload-area :deep(.el-upload-dragger:hover) {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.upload-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.upload-icon-wrap {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: var(--el-color-primary-light-9);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
}

.upload-icon {
  color: var(--el-color-primary);
}

.upload-text {
  font-size: 15px;
  color: var(--el-text-color-primary);
  font-weight: 500;
}

.upload-text em {
  color: var(--el-color-primary);
  font-style: normal;
  text-decoration: underline;
}

.upload-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.upload-progress {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 16px 0;
}

.upload-progress-text {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.file-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.section-count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.file-cards {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.file-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border: 1px solid var(--el-border-color);
  border-radius: 10px;
  background: var(--el-bg-color);
  transition: all 0.2s ease;
}

.file-card:hover {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
}

.file-icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
}

.file-card.is-ready .file-icon {
  background: var(--el-color-success-light-9);
  color: var(--el-color-success);
}

.file-card.is-parsing .file-icon {
  background: var(--el-color-warning-light-9);
  color: var(--el-color-warning);
}

.file-card.is-failed .file-icon {
  background: var(--el-color-danger-light-9);
  color: var(--el-color-danger);
}

.file-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.file-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.file-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.file-status-text {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
}

.file-error {
  font-size: 12px;
  color: var(--el-color-danger);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

.file-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
</style>
