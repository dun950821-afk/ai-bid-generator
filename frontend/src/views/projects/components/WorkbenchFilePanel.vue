<template>
  <div class="workbench-file-panel">
    <!-- 拖拽上传区 -->
    <el-upload
      ref="uploadRef"
      :auto-upload="false"
      :show-file-list="false"
      :on-change="handleFileChange"
      drag
      multiple
      class="upload-area"
    >
      <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
      <div class="el-upload__text">拖拽招标文件到此处或 <em>点击选择</em></div>
      <template #tip>
        <div class="upload-tip">支持 DOCX、TXT、MD 格式，最大 100MB。暂不支持 PDF。</div>
      </template>
    </el-upload>

    <div v-if="uploading" class="upload-progress">
      <el-progress :percentage="uploadProgress" :status="uploadStatus" />
    </div>

    <!-- 文件列表 -->
    <div v-if="files.length" class="file-list">
      <h4>本标段文件</h4>
      <div v-for="file in files" :key="file.id" class="file-item">
        <el-icon><Document /></el-icon>
        <div class="file-info">
          <div class="file-name">{{ file.name }}</div>
          <div v-if="file.error_message" class="file-error">{{ file.error_message }}</div>
        </div>
        <el-tag :type="getDisplayTagType(file.display_status)" size="small">
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
          <el-button type="default" size="small" link @click="viewFileDetail(file.id)">详情</el-button>
        </div>
      </div>
    </div>
    <el-empty v-else description="暂无文件，请上传招标文件" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { UploadFilled, Document } from '@element-plus/icons-vue'
import type { UploadFile } from 'element-plus'
import { directUpload, retryParse } from '@/api/tender'
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
  if (!ext || !['docx', 'txt', 'md'].includes(ext)) {
    ElMessage.error('暂不支持该文件格式，请上传 DOCX、TXT 或 MD 文件')
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
    uploading.value = false
    uploadProgress.value = 0
    uploadStatus.value = ''
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
</script>

<style scoped>
.workbench-file-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.upload-area :deep(.el-upload-dragger) {
  width: 100%;
  padding: 24px;
}

.upload-progress {
  padding: 0 8px;
}

.file-list h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.file-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  margin-bottom: 8px;
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
