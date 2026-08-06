<template>
  <div class="project-files">
    <!-- 工具栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <el-select v-model="filterCategory" placeholder="文件类别" clearable style="width: 140px" @change="loadFiles">
          <el-option label="招标文件" value="tender_file" />
          <el-option label="附件" value="attachment" />
          <el-option label="澄清/补遗" value="clarification" />
        </el-select>
        <el-select v-model="filterStatus" placeholder="状态" clearable style="width: 140px" @change="loadFiles">
          <el-option label="上传中" value="uploading" />
          <el-option label="待解析" value="parse_pending" />
          <el-option label="解析中" value="parsing" />
          <el-option label="已解析" value="parsed" />
          <el-option label="已分块" value="chunked" />
          <el-option label="解析失败" value="parse_failed" />
        </el-select>
      </div>
      <div class="toolbar-right">
        <el-button type="primary" @click="showUploadDialog = true" :disabled="!canUpload">
          <el-icon><Upload /></el-icon>
          上传文件
        </el-button>
      </div>
    </div>

    <!-- 文件列表 -->
    <el-table :data="safeFiles" v-loading="loading" empty-text="暂无文件">
      <el-table-column prop="original_name" label="文件名" min-width="200">
        <template #default="{ row }">
          <div class="file-name">
            <el-icon><Document /></el-icon>
            <span>{{ row.original_name }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="file_category_display" label="类别" width="100" />
      <el-table-column prop="lot_name" label="关联标段" width="150">
        <template #default="{ row }">
          <span v-if="row.lot_name">{{ row.lot_name }}</span>
          <el-tag v-else type="info" size="small">未关联</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="main_file_name" label="所属主文件" min-width="150">
        <template #default="{ row }">
          <span v-if="row.main_file_name" :title="row.main_file_name">{{ row.main_file_name }}</span>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column prop="file_size_mb" label="大小" width="100">
        <template #default="{ row }">
          {{ row.file_size_mb }} MB
        </template>
      </el-table-column>
      <el-table-column prop="status_display" label="状态" width="120">
        <template #default="{ row }">
          <el-tag :type="getStatusType(row.status)" size="small">
            {{ row.status_display }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="created_at" label="上传时间" width="180">
        <template #default="{ row }">
          {{ formatDateTime(row.created_at) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="240" fixed="right">
        <template #default="{ row }">
          <!-- 解析中状态：禁用按钮 -->
          <el-button
            v-if="['parsing', 'chunking', 'processing'].includes(row.status)"
            type="primary"
            size="small"
            disabled
          >
            解析中...
          </el-button>
          <!-- 解析失败：重试解析按钮 -->
          <el-button
            v-if="row.status === 'parse_failed'"
            type="warning"
            size="small"
            @click="handleRetryParse(row)"
          >
            重试解析
          </el-button>
          <!-- 已解析状态：重新解析按钮 -->
          <el-button
            v-if="['parsed', 'chunked', 'ready', 'requirement_extracted'].includes(row.status)"
            type="primary"
            size="small"
            @click="handleReparse(row)"
          >
            重新解析
          </el-button>
          <el-button
            v-if="['parsed', 'chunked', 'requirement_extracted'].includes(row.status)"
            type="primary"
            size="small"
            @click="viewFileDetail(row)"
          >
            查看详情
          </el-button>
          <el-button
            type="default"
            size="small"
            @click="showLinkLotDialog(row)"
          >
            关联标段
          </el-button>
          <el-button
            type="default"
            size="small"
            @click="showAssociationDialog(row)"
          >
            修改关联
          </el-button>
          <el-button
            type="danger"
            size="small"
            @click="handleDelete(row)"
          >
            删除
          </el-button>
          <el-button
            v-if="row.error_message"
            type="danger"
            size="small"
            link
            @click="showError(row)"
          >
            查看错误
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 上传弹窗 -->
    <el-dialog
      v-model="showUploadDialog"
      title="上传招标文件"
      width="560px"
      class="upload-dialog"
      destroy-on-close
    >
      <el-form :model="uploadForm" label-width="100px" class="upload-form">
        <el-form-item label="关联标段">
          <el-select v-model="uploadForm.lot_id" placeholder="可选" clearable style="width: 100%">
            <el-option v-for="lot in lots" :key="lot.id" :label="lot.name" :value="lot.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="文件类别">
          <el-select v-model="uploadForm.file_category" style="width: 100%">
            <el-option label="招标文件" value="tender_file" />
            <el-option label="附件" value="attachment" />
            <el-option label="澄清/补遗" value="clarification" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="uploadNeedsMainFile" label="所属主文件">
          <el-select
            v-model="uploadForm.main_file_id"
            :disabled="!uploadForm.lot_id"
            :placeholder="uploadForm.lot_id ? '选择所属主文件（可选）' : '请先选择标段'"
            :loading="mainFileLoading"
            clearable
            style="width: 100%"
          >
            <el-option
              v-for="f in mainFileOptions"
              :key="f.id"
              :label="f.original_name"
              :value="f.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="选择文件">
          <div class="upload-area">
            <el-upload
              ref="uploadRef"
              :auto-upload="false"
              :limit="1"
              :on-change="handleFileChange"
              :show-file-list="false"
              drag
            >
              <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
              <div class="el-upload__text">
                拖拽文件到此处或 <em>点击选择</em>
              </div>
            </el-upload>
            <div class="upload-tip">
              支持 DOCX、DOC、PDF、TXT、MD 格式，最大 200MB。DOC 文件将自动转换为 DOCX 后解析。
            </div>
            <div v-if="uploadForm.file" class="selected-file-row">
              <el-icon><Document /></el-icon>
              <span class="selected-file-name">{{ uploadForm.file.name }}</span>
              <el-button type="danger" size="small" link @click="clearSelectedFile">
                <el-icon><Close /></el-icon>
              </el-button>
            </div>
          </div>
        </el-form-item>
        <el-form-item v-if="uploadProgress > 0" label="上传进度">
          <el-progress :percentage="uploadProgress" :status="uploadStatus" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showUploadDialog = false">取消</el-button>
        <el-button type="primary" :loading="uploading" @click="handleUpload">
          上传并解析
        </el-button>
      </template>
    </el-dialog>

    <!-- 错误详情弹窗 -->
    <el-dialog v-model="showErrorDialog" title="错误详情" width="500px">
      <pre class="error-message">{{ errorMessage }}</pre>
    </el-dialog>

    <!-- 关联标段弹窗 -->
    <el-dialog v-model="showLinkDialog" title="关联标段" width="450px">
      <el-form label-width="100px">
        <el-form-item label="选择标段">
          <el-select v-model="linkLotId" placeholder="选择要关联的标段" clearable style="width: 100%">
            <el-option v-for="lot in lots" :key="lot.id" :label="lot.name" :value="lot.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showLinkDialog = false">取消</el-button>
        <el-button type="primary" :loading="linking" @click="handleLinkLot">确认</el-button>
      </template>
    </el-dialog>

    <!-- 修改关联弹窗 -->
    <el-dialog v-model="showAssocDialog" title="修改关联" width="450px" destroy-on-close>
      <el-form label-width="100px">
        <el-form-item label="文件类别">
          <el-select v-model="assocForm.file_category" style="width: 100%">
            <el-option label="招标文件" value="tender_file" />
            <el-option label="附件" value="attachment" />
            <el-option label="澄清/补遗" value="clarification" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="assocNeedsMainFile" label="所属主文件">
          <el-select
            v-model="assocForm.main_file_id"
            placeholder="选择所属主文件（可选）"
            :loading="assocMainFileLoading"
            clearable
            style="width: 100%"
          >
            <el-option
              v-for="f in assocMainFileOptions"
              :key="f.id"
              :label="f.original_name"
              :value="f.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAssocDialog = false">取消</el-button>
        <el-button type="primary" :loading="assocSaving" @click="handleUpdateAssociation">确认</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, computed, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Upload, Document, UploadFilled, Close } from '@element-plus/icons-vue'
import type { UploadFile } from 'element-plus'
import {
  listTenderFiles,
  directUpload,
  smartReparse,
  deleteTenderFile,
  getTenderFile,
  linkTenderFileToLot,
  updateFileAssociation,
  type TenderFile,
} from '@/api/tender'
import { http } from '@/api/http'
import { normalizeList } from '@/utils/normalize'

const props = defineProps<{
  projectId: number
  canManage?: boolean
  isArchived?: boolean
}>()

const router = useRouter()

const loading = ref(false)
const files = ref<TenderFile[]>([])
const lots = ref<Array<{ id: number; name: string }>>([])

const filterCategory = ref('')
const filterStatus = ref('')

const canUpload = computed(() => !props.isArchived)

// 上传
const showUploadDialog = ref(false)
const uploading = ref(false)
const uploadProgress = ref(0)
const uploadStatus = ref<'success' | 'exception' | 'warning' | ''>('')
const uploadRef = ref()
const uploadForm = ref({
  lot_id: null as number | null,
  file_category: 'tender_file' as 'tender_file' | 'attachment' | 'clarification',
  main_file_id: null as number | null,
  file: null as File | null,
})

// 上传弹窗：附件/澄清时的所属主文件选项（当前标段下的招标文件）
const mainFileOptions = ref<TenderFile[]>([])
const mainFileLoading = ref(false)
const uploadNeedsMainFile = computed(() =>
  ['attachment', 'clarification'].includes(uploadForm.value.file_category)
)

async function loadMainFileOptions() {
  if (!uploadNeedsMainFile.value || !uploadForm.value.lot_id) {
    mainFileOptions.value = []
    return
  }
  mainFileLoading.value = true
  try {
    const res = await listTenderFiles({
      project_id: props.projectId,
      lot_id: uploadForm.value.lot_id,
      file_category: 'tender_file',
    })
    mainFileOptions.value = normalizeList<TenderFile>(res)
  } catch (err) {
    console.error('加载主文件列表失败:', err)
    mainFileOptions.value = []
  } finally {
    mainFileLoading.value = false
  }
}

watch(
  [() => uploadForm.value.lot_id, () => uploadForm.value.file_category],
  () => {
    uploadForm.value.main_file_id = null
    loadMainFileOptions()
  }
)

// 修改关联
const showAssocDialog = ref(false)
const assocFile = ref<TenderFile | null>(null)
const assocSaving = ref(false)
const assocMainFileOptions = ref<TenderFile[]>([])
const assocMainFileLoading = ref(false)
const assocForm = ref({
  file_category: 'tender_file' as 'tender_file' | 'attachment' | 'clarification',
  main_file_id: null as number | null,
})
const assocNeedsMainFile = computed(() =>
  ['attachment', 'clarification'].includes(assocForm.value.file_category)
)

watch(() => assocForm.value.file_category, (category) => {
  if (category === 'tender_file') {
    assocForm.value.main_file_id = null
  }
})

// 错误
const showErrorDialog = ref(false)
const errorMessage = ref('')

// 关联标段
const showLinkDialog = ref(false)
const linkLotId = ref<number | null>(null)
const linkingFile = ref<TenderFile | null>(null)
const linking = ref(false)

// 加载标段列表
async function loadLots() {
  try {
    const res = await http.get<{ id: number; name: string }[]>(`/api/projects/${props.projectId}/lots/`)
    lots.value = res.data
  } catch (err) {
    console.error('加载标段失败:', err)
  }
}

// 加载文件列表
async function loadFiles() {
  loading.value = true
  try {
    const res = await listTenderFiles({
      project_id: props.projectId,
      file_category: filterCategory.value || undefined,
      status: filterStatus.value || undefined,
    } as Parameters<typeof listTenderFiles>[0])
    files.value = normalizeList<TenderFile>(res)
  } finally {
    loading.value = false
  }
}

// 安全的文件列表（确保始终是数组）
const safeFiles = computed(() => Array.isArray(files.value) ? files.value : [])

// 文件选择
function handleFileChange(uploadFile: UploadFile) {
  const file = uploadFile.raw
  if (!file) return

  // 校验文件扩展名
  const ext = file.name.split('.').pop()?.toLowerCase()
  const allowedExts = ['docx', 'txt', 'md', 'pdf', 'doc']

  if (!ext || !allowedExts.includes(ext)) {
    ElMessage.error('暂不支持该文件格式，请上传 DOCX、DOC、PDF、TXT 或 MD 文件')
    uploadRef.value?.clearFiles()
    return
  }

  uploadForm.value.file = file
}

// 清除已选文件
function clearSelectedFile() {
  uploadForm.value.file = null
  uploadRef.value?.clearFiles()
}

// 执行上传
async function handleUpload() {
  if (!uploadForm.value.file) {
    ElMessage.warning('请选择文件')
    return
  }

  uploading.value = true
  uploadProgress.value = 0
  uploadStatus.value = ''

  try {
    // 直接上传到后端
    uploadProgress.value = 30
    const res = await directUpload(uploadForm.value.file, {
      project_id: props.projectId,
      lot_id: uploadForm.value.lot_id,
      file_category: uploadForm.value.file_category,
      main_file_id: uploadNeedsMainFile.value ? uploadForm.value.main_file_id : undefined,
    })

    uploadProgress.value = 100
    uploadStatus.value = 'success'
    ElMessage.success('上传成功，正在解析...')

    // 关闭弹窗并刷新列表
    setTimeout(() => {
      showUploadDialog.value = false
      uploadForm.value = {
        lot_id: null,
        file_category: 'tender_file',
        main_file_id: null,
        file: null,
      }
      uploadProgress.value = 0
      uploadStatus.value = ''
      uploadRef.value?.clearFiles()
      loadFiles()
      // 开始轮询解析状态
      if (res.data?.file_id) {
        startStatusPolling(res.data.file_id)
      }
    }, 1000)

  } catch (err: any) {
    uploadStatus.value = 'exception'
    ElMessage.error(err.response?.data?.message || '上传失败')
  } finally {
    uploading.value = false
  }
}

// 状态轮询
let pollingTimer: ReturnType<typeof setInterval> | null = null

function startStatusPolling(fileId: number) {
  stopPolling()
  pollingTimer = setInterval(async () => {
    try {
      const res = await getTenderFile(fileId)
      const file = res.data
      if (!['parse_pending', 'parsing', 'chunking', 'processing'].includes(file.status)) {
        stopPolling()
        loadFiles()
        if (file.status === 'parsed' || file.status === 'chunked' || file.status === 'ready') {
          ElMessage.success('解析完成')
        } else if (file.status === 'parse_failed') {
          ElMessage.error('解析失败: ' + (file.error_message || '未知错误'))
        }
      }
    } catch (err) {
      console.error('轮询状态失败:', err)
      stopPolling()
    }
  }, 3000)
}

function stopPolling() {
  if (pollingTimer) {
    clearInterval(pollingTimer)
    pollingTimer = null
  }
}

// 重试解析
async function handleRetryParse(file: TenderFile) {
  try {
    await smartReparse(file.id)
    ElMessage.success('已触发解析（有附件时自动合并）')
    loadFiles()
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '操作失败')
  }
}

// 重新解析
async function handleReparse(file: TenderFile) {
  try {
    await ElMessageBox.confirm(
      '重新解析将生成新的解析版本，并设为当前版本（有关联附件时自动合并解析）。历史解析版本会保留。是否继续？',
      '确认重新解析',
      { type: 'warning' }
    )
    // 立即禁用按钮防重复点击
    file.status = 'parsing'
    await smartReparse(file.id)
    ElMessage.success('已提交重新解析任务')
    loadFiles()
  } catch (err: any) {
    if (err !== 'cancel') {
      ElMessage.error(err.response?.data?.message || '操作失败')
    }
  }
}

// 删除文件
async function handleDelete(file: TenderFile) {
  const cascadeTip = (file.outline_count ?? 0) > 0
    ? `其解析数据及基于该文件生成的 ${file.outline_count} 份标书将一并删除`
    : '其解析数据将一并删除'
  try {
    await ElMessageBox.confirm(
      `确定删除文件「${file.original_name}」吗？删除后，${cascadeTip}。此操作不可恢复。`,
      '确认删除',
      { type: 'warning', confirmButtonText: '删除', confirmButtonClass: 'el-button--danger' },
    )
    await deleteTenderFile(file.id)
    ElMessage.success('删除成功')
    loadFiles()
  } catch (err: any) {
    if (err !== 'cancel') {
      ElMessage.error(err.response?.data?.message || '删除失败')
    }
  }
}

// 查看文件详情
function viewFileDetail(file: TenderFile) {
  router.push({
    name: 'tender-file-detail',
    params: { fileId: file.id },
  })
}

// 显示错误
function showError(file: TenderFile) {
  errorMessage.value = file.error_message || '未知错误'
  showErrorDialog.value = true
}

// 显示关联标段弹窗
function showLinkLotDialog(file: TenderFile) {
  linkingFile.value = file
  linkLotId.value = file.lot || null
  showLinkDialog.value = true
}

// 执行关联标段
async function handleLinkLot() {
  if (!linkingFile.value) return

  linking.value = true
  try {
    const res = await linkTenderFileToLot(linkingFile.value.id, linkLotId.value)
    ElMessage.success('关联成功')
    showLinkDialog.value = false
    // 更新本地数据
    const fileIndex = files.value.findIndex(f => f.id === linkingFile.value!.id)
    if (fileIndex >= 0) {
      files.value[fileIndex] = res.data
    }
    linkingFile.value = null
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '关联失败')
  } finally {
    linking.value = false
  }
}

// 显示修改关联弹窗
async function showAssociationDialog(file: TenderFile) {
  assocFile.value = file
  assocForm.value = {
    file_category: (file.file_category || 'tender_file') as 'tender_file' | 'attachment' | 'clarification',
    main_file_id: file.main_file ?? null,
  }
  showAssocDialog.value = true

  // 加载可选主文件（同标段招标文件；无标段时取项目下全部招标文件），排除自身
  assocMainFileLoading.value = true
  try {
    const res = await listTenderFiles({
      project_id: props.projectId,
      lot_id: file.lot ?? undefined,
      file_category: 'tender_file',
    })
    assocMainFileOptions.value = normalizeList<TenderFile>(res).filter(f => f.id !== file.id)
  } catch (err) {
    console.error('加载主文件列表失败:', err)
    assocMainFileOptions.value = []
  } finally {
    assocMainFileLoading.value = false
  }
}

// 执行修改关联
async function handleUpdateAssociation() {
  if (!assocFile.value) return
  assocSaving.value = true
  try {
    await updateFileAssociation(assocFile.value.id, {
      file_category: assocForm.value.file_category,
      main_file_id: assocNeedsMainFile.value ? assocForm.value.main_file_id : null,
    })
    ElMessage.success('关联已更新')
    showAssocDialog.value = false
    assocFile.value = null
    loadFiles()
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '修改关联失败')
  } finally {
    assocSaving.value = false
  }
}

// 状态样式
function getStatusType(status: string) {
  const map: Record<string, string> = {
    uploading: 'info',
    parse_pending: 'warning',
    parsing: 'warning',
    parsed: 'success',
    chunked: 'success',
    requirement_extracted: 'success',
    parse_failed: 'danger',
  }
  return map[status] || 'info'
}

// 时间格式化
function formatDateTime(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// 监听项目变化
watch(() => props.projectId, () => {
  loadFiles()
})

onMounted(() => {
  loadLots()
  loadFiles()
})

onUnmounted(() => {
  stopPolling()
})
</script>

<style scoped>
.project-files {
  padding: 0;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.toolbar-left {
  display: flex;
  gap: 12px;
}

.file-name {
  display: flex;
  align-items: center;
  gap: 8px;
}

.error-message {
  background: #fef0f0;
  padding: 12px;
  border-radius: 4px;
  white-space: pre-wrap;
  word-break: break-all;
  font-family: monospace;
  font-size: 13px;
  color: #f56c6c;
}

/* 上传弹窗样式 */
.upload-dialog :deep(.el-dialog__body) {
  overflow: hidden;
  padding: 20px;
}

.upload-form {
  width: 100%;
  max-width: 100%;
}

.upload-form :deep(.el-form-item__content) {
  min-width: 0;
  max-width: 100%;
}

.upload-area {
  width: 100%;
  max-width: 100%;
  overflow: hidden;
}

.upload-area :deep(.el-upload) {
  width: 100%;
  max-width: 100%;
}

.upload-area :deep(.el-upload-dragger) {
  width: 100%;
  max-width: 100%;
  height: 160px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.upload-area :deep(.el-upload-dragger .el-icon--upload) {
  margin-bottom: 8px;
}

.upload-tip {
  margin-top: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.selected-file-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding: 8px 12px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
  max-width: 100%;
  overflow: hidden;
}

.selected-file-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 13px;
  color: var(--el-text-color-primary);
}
</style>
