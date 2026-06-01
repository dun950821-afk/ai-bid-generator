<!-- frontend/src/views/knowledge/components/KnowledgeUploadDialog.vue -->
<template>
  <el-dialog
    :model-value="modelValue"
    title="上传文档"
    class="upload-dialog"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <el-upload
      ref="uploadRef"
      class="upload-area"
      drag
      :auto-upload="false"
      :limit="1"
      :on-change="handleFileChange"
      :on-exceed="handleExceed"
    >
      <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
      <div class="el-upload__text">
        拖拽文件到此处，或 <em>点击上传</em>
      </div>
      <template #tip>
        <div class="el-upload__tip">
          支持 PDF、Word、Markdown、文本文件
        </div>
      </template>
    </el-upload>

    <div v-if="selectedFile" class="selected-file">
      <span class="selected-file-name">{{ selectedFile.name }}</span>
      <span class="selected-file-size">{{ formatSize(selectedFile.size) }}</span>
    </div>

    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="uploading" @click="handleUpload">
        上传
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'
import { directUploadDocument } from '@/api/knowledge'

const props = defineProps<{
  modelValue: boolean
  knowledgeBaseId: number
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  uploaded: []
}>()

const selectedFile = ref<File | null>(null)
const uploading = ref(false)

const handleFileChange = (file: any) => {
  selectedFile.value = file.raw
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
  try {
    await directUploadDocument(props.knowledgeBaseId, selectedFile.value)
    ElMessage.success('上传成功，正在处理文档...')
    emit('update:modelValue', false)
    emit('uploaded')
    selectedFile.value = null
  } catch (e: any) {
    console.error('上传错误:', e)
    let errorMsg = '上传失败'
    if (e.response?.data?.message) {
      errorMsg = e.response.data.message
    } else if (e.response?.data?.detail) {
      errorMsg = e.response.data.detail
    } else if (e.message) {
      errorMsg = e.message
    }
    ElMessage.error(errorMsg)
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
  justify-content: space-between;
  margin-top: 12px;
  padding: 8px 12px;
  background: #f5f7fa;
  border-radius: 4px;
}

.selected-file-name {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.selected-file-size {
  color: #909399;
  margin-left: 12px;
}
</style>