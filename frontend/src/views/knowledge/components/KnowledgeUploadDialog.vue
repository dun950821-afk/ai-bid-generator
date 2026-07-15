<!-- frontend/src/views/knowledge/components/KnowledgeUploadDialog.vue -->
<template>
  <el-dialog
    :model-value="modelValue"
    title="上传文档"
    class="upload-dialog"
    @update:model-value="$emit('update:modelValue', $event)"
    @closed="handleClosed"
  >
    <el-upload
      ref="uploadRef"
      class="upload-area"
      drag
      :auto-upload="false"
      :limit="1"
      accept=".pdf,.doc,.docx,.txt,.md,.markdown,.xls,.xlsx,.ppt,.pptx"
      :on-change="handleFileChange"
      :on-exceed="handleExceed"
      :before-upload="() => false"
    >
      <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
      <div class="el-upload__text">
        拖拽文件到此处，或 <em>点击上传</em>
      </div>
      <template #tip>
        <div class="el-upload__tip">
          支持 PDF / Word / Excel / PPT / Markdown / 文本，最大 200MB
        </div>
      </template>
    </el-upload>

    <div v-if="selectedFile" class="selected-file">
      <el-icon class="file-icon"><Document /></el-icon>
      <div class="file-info">
        <span class="selected-file-name">{{ selectedFile.name }}</span>
        <span class="selected-file-size">{{ formatSize(selectedFile.size) }}</span>
      </div>
      <el-button text type="danger" @click="clearFile">
        <el-icon><Close /></el-icon>
      </el-button>
    </div>

    <div v-if="uploading" class="upload-progress">
      <el-progress :percentage="uploadProgress" :stroke-width="8" />
      <span class="progress-text">上传中 {{ uploadProgress }}%</span>
    </div>

    <template #footer>
      <el-button @click="$emit('update:modelValue', false)" :disabled="uploading">取消</el-button>
      <el-button
        type="primary"
        :loading="uploading"
        :disabled="!selectedFile"
        @click="handleUpload"
      >
        上传
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { logError } from '@/utils/logger'
import { ElMessage } from 'element-plus'
import { UploadFilled, Document, Close } from '@element-plus/icons-vue'
import { directUploadDocument } from '@/api/knowledge'
import { extractApiError } from '@/utils/errors'

const props = defineProps<{
  modelValue: boolean
  knowledgeBaseId: number
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  uploaded: [documentId: number]
}>()

const selectedFile = ref<File | null>(null)
const uploading = ref(false)
const uploadProgress = ref(0)

const ALLOWED_EXTS = ['pdf', 'doc', 'docx', 'txt', 'md', 'markdown', 'xls', 'xlsx', 'ppt', 'pptx']
const MAX_SIZE = 200 * 1024 * 1024 // 200MB

const handleFileChange = (file: any) => {
  const raw: File = file.raw
  // 文件类型预校验
  const parts = raw.name.toLowerCase().split('.')
  const ext = parts.length > 1 ? parts[parts.length - 1] : ''
  if (!ALLOWED_EXTS.includes(ext)) {
    ElMessage.warning(`不支持的文件类型：.${ext}，请上传 PDF/Word/Excel/PPT/Markdown/文本`)
    return
  }
  // 文件大小预校验
  if (raw.size > MAX_SIZE) {
    ElMessage.warning(`文件超过 200MB 限制（当前 ${(raw.size / 1024 / 1024).toFixed(1)}MB）`)
    return
  }
  selectedFile.value = raw
}

const clearFile = () => {
  selectedFile.value = null
  uploadProgress.value = 0
}

const handleClosed = () => {
  clearFile()
}

const handleExceed = () => {
  ElMessage.warning('一次只能上传一个文件')
}

const handleUpload = async () => {
  if (!selectedFile.value) {
    ElMessage.warning('请选择文件')
    return
  }

  uploading.value = true
  uploadProgress.value = 0

  try {
    const res = await directUploadDocument(
      props.knowledgeBaseId,
      selectedFile.value,
      (percent) => {
        uploadProgress.value = percent
      }
    )
    ElMessage.success('上传完成，系统正在后台解析文档...')
    emit('update:modelValue', false)
    emit('uploaded', res.data.document_id)
    clearFile()
  } catch (e: any) {
    logError('上传错误:', e)
    ElMessage.error(extractApiError(e, '上传失败'))
  } finally {
    uploading.value = false
  }
}

const formatSize = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
</script>

<style scoped>
.upload-dialog {
  width: 760px;
  max-width: calc(100vw - 32px);
}

.upload-dialog :deep(.el-dialog__body) {
  overflow: hidden;
}

.upload-area :deep(.el-upload),
.upload-area :deep(.el-upload-dragger) {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

.selected-file {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
  padding: 12px;
  background: #f5f7fa;
  border-radius: 4px;
  border: 1px solid #ebeef5;
}

.file-icon {
  color: #409eff;
  font-size: 20px;
}

.file-info {
  flex: 1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-width: 0;
}

.selected-file-name {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: #303133;
}

.selected-file-size {
  color: #909399;
  margin-left: 12px;
  font-size: 12px;
  flex-shrink: 0;
}

.upload-progress {
  margin-top: 16px;
}

.progress-text {
  display: block;
  margin-top: 8px;
  font-size: 12px;
  color: #909399;
  text-align: center;
}
</style>
