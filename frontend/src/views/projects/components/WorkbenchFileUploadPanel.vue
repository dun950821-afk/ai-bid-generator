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

    <div v-if="uploading" class="upload-progress">
      <el-progress type="circle" :percentage="uploadProgress" :status="uploadStatus" :width="72" />
      <div class="upload-progress-text">上传中...</div>
    </div>

    <!-- 文件列表 -->
    <div v-if="files.length" class="file-section">
      <div class="section-header">
        <span class="section-title">已上传文件</span>
        <div class="section-actions">
          <span class="section-count">{{ files.length }} 个</span>
          <el-button
            v-if="pendingParseFiles.length"
            type="primary"
            size="small"
            :loading="startingParse"
            @click="startParse(pendingParseFiles)"
          >
            开始解析（{{ pendingParseFiles.length }}）
          </el-button>
        </div>
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
            <el-select
              :model-value="file.file_category"
              size="small"
              class="category-select"
              :disabled="categoryChangingId === file.id"
              @change="(val: string) => handleCategoryChange(file, val)"
            >
              <el-option label="招标文件" value="tender_file" />
              <el-option label="附件" value="attachment" />
              <el-option label="澄清/补遗" value="clarification" />
            </el-select>
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

    <!-- 选择所属主文件：类别改为附件/澄清时弹出 -->
    <el-dialog v-model="showMainFileDialog" title="选择所属主文件" width="440px">
      <p class="main-file-dialog-text">
        请将「{{ categoryTargetFile?.name }}」关联到同标段的招标文件：
      </p>
      <el-select v-model="selectedMainFileId" style="width: 100%" placeholder="请选择主文件">
        <el-option
          v-for="f in mainFileOptions"
          :key="f.id"
          :label="f.original_name"
          :value="f.id"
        />
      </el-select>
      <template #footer>
        <el-button @click="cancelCategoryChange">取消</el-button>
        <el-button type="primary" :disabled="!selectedMainFileId" :loading="categoryChangingId !== null" @click="confirmCategoryChange">确定</el-button>
      </template>
    </el-dialog>
  </WorkbenchPanelShell>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { UploadFilled, Document } from '@element-plus/icons-vue'
import type { UploadFile } from 'element-plus'
import {
  directUpload,
  smartReparse,
  deleteTenderFile,
  listTenderFiles,
  updateFileAssociation,
  type TenderFile,
} from '@/api/tender'
import { normalizeList } from '@/utils/normalize'
import { DISPLAY_STATUS_LABEL, type DisplayStatus } from '@/utils/fileStatusMap'
import type { WorkbenchStatus, WorkbenchFile } from '@/api/workbench'
import { useStartParse } from '@/composables/useStartParse'
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
const categoryChangingId = ref<number | null>(null)

const { startingParse, startParse } = useStartParse(() => emit('uploaded'))

// 类别改为附件/澄清时的所属主文件选择
const showMainFileDialog = ref(false)
const categoryTargetFile = ref<WorkbenchFile | null>(null)
const categoryTargetValue = ref<'attachment' | 'clarification'>('attachment')
const mainFileOptions = ref<TenderFile[]>([])
const selectedMainFileId = ref<number | null>(null)

const files = computed<WorkbenchFile[]>(() => {
  return props.status?.steps.tender_file.files ?? []
})

// 待开始解析的招标文件：仅解析中的文件不可重复触发，
// 待解析/已就绪/失败（可重新解析）均显示按钮
const pendingParseFiles = computed<WorkbenchFile[]>(() =>
  files.value.filter(f => f.file_category === 'tender_file' && f.display_status !== 'parsing')
)

// 入参已是展示状态（display_status），直接查标签；
// 再经 mapFileDisplayStatus 会把 'failed' 兜底成 'parsing'（'failed' 不在内部状态键集）
function getDisplayLabel(status: string): string {
  return DISPLAY_STATUS_LABEL[status as DisplayStatus] ?? status
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
    const res = await directUpload(file, {
      project_id: props.projectId,
      lot_id: props.lotId,
      file_category: 'tender_file',
      auto_parse: false,
    })
    uploadProgress.value = 100
    uploadStatus.value = 'success'
    emit('uploaded')
    const uploadedFileId = res.data?.file_id ?? null
    // 提示是否有附件需要上传（附件统一在文件详情页上传）
    setTimeout(() => {
      ElMessageBox.confirm(
        `「${file.name}」上传成功。该招标文件是否有附件需要上传？附件需在文件详情页上传。`,
        '上传成功',
        {
          confirmButtonText: '去上传附件',
          cancelButtonText: '没有',
          type: 'info',
          distinguishCancelAndClose: true,
        }
      )
        .then(() => {
          if (uploadedFileId) {
            router.push({ name: 'tender-file-detail', params: { fileId: uploadedFileId } })
          }
        })
        .catch(() => {})
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

// 修改文件类别：招标文件直接改；附件/澄清需先选所属主文件
async function handleCategoryChange(file: WorkbenchFile, value: string) {
  if (value === file.file_category) return
  if (value === 'tender_file') {
    categoryChangingId.value = file.id
    try {
      await updateFileAssociation(file.id, { file_category: 'tender_file' })
      ElMessage.success('已改为招标文件')
      emit('uploaded')
    } catch (err: any) {
      ElMessage.error(err.response?.data?.message || '修改失败')
    } finally {
      categoryChangingId.value = null
    }
    return
  }
  categoryTargetFile.value = file
  categoryTargetValue.value = value as 'attachment' | 'clarification'
  selectedMainFileId.value = null
  try {
    const res = await listTenderFiles({
      project_id: props.projectId,
      lot_id: props.lotId,
      file_category: 'tender_file',
    })
    mainFileOptions.value = normalizeList<TenderFile>(res).filter(f => f.id !== file.id)
  } catch {
    mainFileOptions.value = []
  }
  if (!mainFileOptions.value.length) {
    ElMessage.warning('同标段暂无招标文件，请先上传招标文件')
    return
  }
  showMainFileDialog.value = true
}

function cancelCategoryChange() {
  showMainFileDialog.value = false
  categoryTargetFile.value = null
}

async function confirmCategoryChange() {
  if (!categoryTargetFile.value || !selectedMainFileId.value) return
  categoryChangingId.value = categoryTargetFile.value.id
  try {
    await updateFileAssociation(categoryTargetFile.value.id, {
      file_category: categoryTargetValue.value,
      main_file_id: selectedMainFileId.value,
    })
    ElMessage.success('已更新文件类别与所属主文件')
    showMainFileDialog.value = false
    categoryTargetFile.value = null
    emit('uploaded')
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '修改失败')
  } finally {
    categoryChangingId.value = null
  }
}

async function handleRetry(fileId: number) {
  retryingId.value = fileId
  try {
    await smartReparse(fileId)
    ElMessage.success('已触发解析（有附件时自动合并）')
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

.section-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.category-select {
  width: 108px;
}

.main-file-dialog-text {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--el-text-color-regular);
  line-height: 1.6;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>
