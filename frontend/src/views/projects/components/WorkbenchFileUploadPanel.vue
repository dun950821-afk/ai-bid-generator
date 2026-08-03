<template>
  <div class="panel">
    <div class="panel-topline" style="--step-color: #409EFF" />

    <div class="panel-header">
      <div class="panel-title">
        <el-icon :size="20" color="#409EFF"><UploadFilled /></el-icon>
        <span>招标文件上传</span>
      </div>
      <div class="panel-desc">支持 DOCX、DOC、PDF、TXT、MD 格式，最大 200MB。DOC 文件将自动转换为 DOCX 后解析</div>
    </div>

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
      <el-icon class="upload-icon" :size="40"><UploadFilled /></el-icon>
      <div class="upload-text">拖拽招标文件到此处或 <em>点击选择</em></div>
    </el-upload>

    <div v-if="uploading" class="upload-progress">
      <el-progress type="circle" :percentage="uploadProgress" :status="uploadStatus" :width="64" />
    </div>

    <!-- 文件卡片列表 -->
    <div v-if="files.length" class="file-cards">
      <div v-for="file in files" :key="file.id" class="file-card">
        <div class="file-icon" :class="`is-${file.display_status}`">
          <el-icon :size="20"><Document /></el-icon>
        </div>
        <div class="file-info">
          <div class="file-name">{{ file.name }}</div>
          <div v-if="file.error_message" class="file-error">{{ file.error_message }}</div>
        </div>
        <el-tag :type="getDisplayTagType(file.display_status)" size="small" effect="light">
          {{ getDisplayLabel(file.display_status) }}
        </el-tag>
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
    <el-empty v-else-if="!uploading" description="暂无文件，请上传招标文件" :image-size="60" />
  </div>
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
  DISPLAY_STATUS_TAG_TYPE,
} from '@/utils/fileStatusMap'
import type { WorkbenchStatus, WorkbenchFile } from '@/api/workbench'

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

const files = computed<WorkbenchFile[]>(() => {
  return props.status?.steps.tender_file.files ?? []
})

function getDisplayLabel(status: string): string {
  return DISPLAY_STATUS_LABEL[mapFileDisplayStatus(status)]
}

function getDisplayTagType(status: string): string {
  return DISPLAY_STATUS_TAG_TYPE[mapFileDisplayStatus(status)]
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
.panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.panel-topline {
  height: 2px;
  background: var(--step-color, var(--el-color-primary));
  border-radius: 1px;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
}

.panel-desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.upload-area :deep(.el-upload-dragger) {
  width: 100%;
  padding: 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.upload-icon {
  color: var(--el-color-primary);
}

.upload-text {
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.upload-text em {
  color: var(--el-color-primary);
  font-style: normal;
}

.upload-progress {
  display: flex;
  justify-content: center;
  padding: 8px 0;
}

.file-cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.file-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  background: var(--el-fill-color-blank);
  transition: box-shadow 0.2s;
}

.file-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.file-icon {
  width: 36px;
  height: 36px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
}

.file-icon.is-ready {
  background: var(--el-color-success-light-9);
  color: var(--el-color-success);
}

.file-icon.is-parsing {
  background: var(--el-color-warning-light-9);
  color: var(--el-color-warning);
}

.file-icon.is-failed {
  background: var(--el-color-danger-light-9);
  color: var(--el-color-danger);
}

.file-info {
  flex: 1;
  min-width: 0;
}

.file-name {
  font-size: 14px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.file-error {
  font-size: 12px;
  color: var(--el-color-danger);
  margin-top: 4px;
}

.file-actions {
  display: flex;
  gap: 8px;
}
</style>
