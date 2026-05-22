<template>
  <el-card class="upload-card" shadow="never">
    <el-upload
      drag
      :auto-upload="false"
      :limit="1"
      :on-change="handleFileChange"
      :on-remove="handleRemove"
      :file-list="fileList"
    >
      <div class="upload-inner">
        <div class="upload-icon">⬆</div>
        <div class="upload-title">拖拽招标文件到这里，或点击选择</div>
        <div class="upload-desc">支持 PDF、DOCX、TXT、ZIP；v1 单文件上传</div>
      </div>
    </el-upload>

    <div v-if="selectedFile" class="meta">
      <el-select v-model="fileCategory" placeholder="文件类别">
        <el-option label="招标文件" value="tender_file" />
        <el-option label="附件" value="attachment" />
        <el-option label="澄清/补遗" value="clarification" />
      </el-select>

      <el-button type="primary" :loading="uploading" @click="startUpload">
        开始上传
      </el-button>
    </div>

    <el-progress v-if="uploading || uploadPercent > 0" :percentage="uploadPercent" />

    <TaskProgress :task-id="taskId" title="解析任务" @success="handleTaskSuccess" />
  </el-card>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { UploadFile, UploadUserFile } from 'element-plus'
import { ElMessage } from 'element-plus'
import { completeUpload, initUpload, putToPresignedUrl } from '@/api/tender'
import TaskProgress from '@/components/task/TaskProgress.vue'

const props = defineProps<{
  projectId: number
  lotId?: number | null
}>()

const emit = defineEmits<{
  uploaded: [payload: any]
}>()

const fileList = ref<UploadUserFile[]>([])
const selectedFile = ref<File | null>(null)
const fileCategory = ref<'tender_file' | 'attachment' | 'clarification'>('tender_file')
const uploading = ref(false)
const uploadPercent = ref(0)
const taskId = ref<number | null>(null)

function handleFileChange(uploadFile: UploadFile) {
  selectedFile.value = uploadFile.raw || null
  fileList.value = uploadFile.raw ? [uploadFile] : []
  uploadPercent.value = 0
  taskId.value = null
}

function handleRemove() {
  selectedFile.value = null
  fileList.value = []
  uploadPercent.value = 0
  taskId.value = null
}

async function startUpload() {
  if (!selectedFile.value) return

  uploading.value = true
  try {
    const file = selectedFile.value
    const initRes = await initUpload({
      project_id: props.projectId,
      lot_id: props.lotId || null,
      file_name: file.name,
      file_size: file.size,
      content_type: file.type || 'application/octet-stream',
      file_category: fileCategory.value,
    })

    await putToPresignedUrl(initRes.data.upload_url, file, (percent) => {
      uploadPercent.value = percent
    })

    const completeRes = await completeUpload(initRes.data.file_id)
    taskId.value = completeRes.data.task_id
    emit('uploaded', completeRes.data)

    if (!taskId.value) {
      ElMessage.success('上传完成')
    } else {
      ElMessage.success('上传完成，已进入解析队列')
    }
  } catch (error: any) {
    ElMessage.error(error.response?.data?.message || '上传失败')
  } finally {
    uploading.value = false
  }
}

function handleTaskSuccess() {
  ElMessage.success('解析任务完成')
}
</script>

<style scoped>
.upload-card {
  border-radius: 18px;
}
.upload-inner {
  padding: 28px 0;
}
.upload-icon {
  font-size: 36px;
  color: var(--app-primary);
}
.upload-title {
  margin-top: 10px;
  font-weight: 700;
}
.upload-desc {
  margin-top: 6px;
  color: var(--app-text-secondary);
}
.meta {
  margin: 18px 0;
  display: flex;
  gap: 12px;
}
</style>
