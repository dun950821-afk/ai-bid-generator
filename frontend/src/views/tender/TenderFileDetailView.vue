<template>
  <div class="tender-file-detail" v-loading="pageLoading">
    <!-- 页面头部 -->
    <div class="page-header">
      <div class="header-breadcrumb">
        <el-button link class="back-btn" @click="router.back()">
          <el-icon><ArrowLeft /></el-icon>
          返回
        </el-button>
      </div>
      <div class="header-main">
        <div class="header-left">
          <div class="file-icon">
            <el-icon :size="24"><Document /></el-icon>
          </div>
          <div class="file-title">
            <h1>{{ tenderFile?.original_name || '文件详情' }}</h1>
            <div class="file-subtitle" v-if="tenderFile">
              <el-tag :type="getStatusType(tenderFile.status)" size="small" effect="light">
                {{ tenderFile.status_display }}
              </el-tag>
              <span class="file-id">ID: {{ tenderFile.id }}</span>
            </div>
          </div>
        </div>
        <div class="header-right">
          <el-button
            v-if="canReparse"
            type="primary"
            :loading="reparseLoading"
            :disabled="isProcessing"
            @click="handleReparse"
          >
            <el-icon><Refresh /></el-icon>
            重新解析
          </el-button>
          <el-button
            v-if="canResponseTemplate"
            :type="responseTemplate ? 'success' : 'primary'"
            :loading="responseTemplateLoading"
            @click="goResponseTemplate"
          >
            <el-icon><DocumentCopy /></el-icon>
            {{ responseTemplate ? '进入响应模板' : '识别响应模板' }}
          </el-button>
        </div>
      </div>
    </div>

    <!-- 文件元信息卡片 -->
    <div v-if="tenderFile" class="meta-cards">
      <div class="meta-card">
        <div class="meta-icon size">
          <el-icon :size="18"><FolderOpened /></el-icon>
        </div>
        <div class="meta-content">
          <div class="meta-label">文件大小</div>
          <div class="meta-value">{{ tenderFile.file_size_mb }} MB</div>
        </div>
      </div>
      <div class="meta-card">
        <div class="meta-icon type">
          <el-icon :size="18"><Files /></el-icon>
        </div>
        <div class="meta-content">
          <div class="meta-label">文件类型</div>
          <div class="meta-value">{{ formatFileType(tenderFile.content_type) }}</div>
        </div>
      </div>
      <div class="meta-card" v-if="tenderFile.lot_name">
        <div class="meta-icon lot">
          <el-icon :size="18"><Collection /></el-icon>
        </div>
        <div class="meta-content">
          <div class="meta-label">所属标段</div>
          <div class="meta-value">{{ tenderFile.lot_name }}</div>
        </div>
      </div>
      <div class="meta-card">
        <div class="meta-icon time">
          <el-icon :size="18"><Clock /></el-icon>
        </div>
        <div class="meta-content">
          <div class="meta-label">上传时间</div>
          <div class="meta-value">{{ formatDateTime(tenderFile.created_at) }}</div>
        </div>
      </div>
      <div class="meta-card" v-if="tenderFile.outline_count">
        <div class="meta-icon outline">
          <el-icon :size="18"><Connection /></el-icon>
        </div>
        <div class="meta-content">
          <div class="meta-label">关联大纲</div>
          <div class="meta-value">{{ tenderFile.outline_count }} 份</div>
        </div>
      </div>
      <!-- 响应文件状态卡片 -->
      <div class="meta-card response-card" v-if="canResponseTemplate">
        <div class="meta-icon response">
          <el-icon :size="18"><DocumentCopy /></el-icon>
        </div>
        <div class="meta-content">
          <div class="meta-label">响应文件</div>
          <div class="meta-value" v-if="responseTemplate">
            <el-tag :type="responseStatusType" size="small">
              {{ responseTemplate.status_display }}
            </el-tag>
            <span v-if="responseTemplate.confidence != null" class="rt-conf">
              置信度 {{ (responseTemplate.confidence * 100).toFixed(0) }}%
            </span>
            <el-button size="small" type="primary" link @click="goResponseTemplate">
              进入工作台 →
            </el-button>
          </div>
          <div class="meta-value" v-else>
            <span class="gray">未创建, 点击右上角"识别响应模板"开始</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 错误信息 -->
    <el-alert
      v-if="tenderFile?.error_message"
      type="error"
      :title="tenderFile.error_message"
      :closable="false"
      show-icon
      class="file-error-alert"
    />

    <!-- 任务进度条 -->
    <TaskProgress
      v-if="currentTaskId"
      :task-id="currentTaskId"
      :poll-interval="2000"
      @completed="handleTaskCompleted"
      @failed="handleTaskFailed"
      @refresh="loadPageData"
      @dismiss="currentTaskId = null"
    />

    <!-- 解析中状态 -->
    <div v-if="tenderFile && isProcessing" class="processing-card">
      <div class="processing-content">
        <div class="processing-icon">
          <el-icon class="is-loading" :size="32"><Loading /></el-icon>
        </div>
        <div class="processing-text">
          <div class="processing-title">文件解析中</div>
          <div class="processing-desc">系统正在解析文件内容，请稍后刷新查看结果</div>
        </div>
        <el-button type="primary" plain @click="loadPageData">刷新状态</el-button>
      </div>
    </div>

    <!-- 文件未解析空状态 -->
    <el-empty
      v-if="!pageLoading && !parsedDoc && tenderFile && !isProcessing"
      description="文档尚未解析完成，请稍后刷新页面查看"
    >
      <el-button type="primary" @click="loadPageData">刷新状态</el-button>
    </el-empty>

    <!-- 标段文件组 -->
    <div v-if="tenderFile?.lot" class="section-card">
      <div class="section-header">
        <div class="section-title">
          <el-icon :size="18"><Folder /></el-icon>
          <span>标段文件</span>
          <el-tag size="small" type="info" effect="plain">{{ lotFiles.length }} 个</el-tag>
        </div>
        <div class="section-actions">
          <el-button size="small" :loading="attachUploading" @click="attachmentInput?.click()">
            <el-icon><Upload /></el-icon>
            上传附件
          </el-button>
          <el-button
            size="small"
            type="primary"
            :loading="mergeLoading"
            :disabled="selectedAttachmentIds.length === 0"
            @click="handleMergeParse"
          >
            <el-icon><Merge /></el-icon>
            合并解析
          </el-button>
        </div>
      </div>
      <input ref="attachmentInput" type="file" accept=".docx,.doc,.pdf,.txt,.md" multiple style="display: none" @change="handleAttachmentChange" />
      <el-table ref="lotFilesTableRef" :data="lotFiles" class="lot-files-table" @selection-change="(rows: TenderFile[]) => selectedAttachmentIds = rows.filter(r => r.file_category === 'attachment').map(r => r.id)">
        <el-table-column type="selection" :selectable="(row: TenderFile) => row.file_category === 'attachment'" width="48" />
        <el-table-column label="文件名" min-width="240">
          <template #default="{ row }">
            <div class="file-name-cell">
              <el-icon :size="16" class="file-type-icon"><Document /></el-icon>
              <span class="name-text" :title="row.original_name">{{ row.original_name }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="类别" width="120">
          <template #default="{ row }">
            <el-tag size="small" :type="row.file_category === 'attachment' ? 'warning' : 'primary'" effect="plain">
              {{ row.file_category_display }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="所属主文件" min-width="160">
          <template #default="{ row }">
            <el-tag v-if="row.main_file_name" size="small" type="info" effect="plain">
              {{ row.main_file_name }}
            </el-tag>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="解析状态" width="140">
          <template #default="{ row }">
            <div class="status-cell">
              <span class="status-dot" :class="getStatusDotClass(row.status)" />
              <span class="status-text">{{ row.status_display || row.status }}</span>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- Tab 内容区 -->
    <div v-if="parsedDoc && !isProcessing" class="content-card">
      <div class="tabs-header">
        <el-tabs v-model="activeTab" class="content-tabs" @tab-change="handleTabChange">
          <el-tab-pane label="条款管理" name="requirements" />
          <el-tab-pane label="解析分块" name="chunks" />
          <el-tab-pane label="版本历史" name="versions" />
        </el-tabs>
        <el-button
          class="refresh-btn"
          size="small"
          :loading="refreshing"
          @click="handleRefresh"
        >
          <el-icon><Refresh /></el-icon>
          刷新数据
        </el-button>
      </div>
      <div class="tabs-content">
        <RequirementTab
          v-if="activeTab === 'requirements' && parsedDoc"
          :key="`requirements-${refreshKey}`"
          :tender-file-id="fileId"
          :tender-file-ids="allRelatedFileIds"
          :parsed-document-id="parsedDoc.id"
          :can-manage="canManage"
          :lot-id="tenderFile?.lot ?? null"
        />
        <ChunkTab
          v-if="activeTab === 'chunks' && parsedDoc"
          :key="`chunks-${refreshKey}`"
          :parsed-document-id="parsedDoc.id"
        />
        <VersionTab
          v-if="activeTab === 'versions'"
          :key="`versions-${refreshKey}`"
          :tender-file-id="fileId"
          :current-version-id="parsedDoc?.id"
          @activated="handleVersionActivated"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ArrowLeft,
  Loading,
  Document,
  Refresh,
  DocumentCopy,
  FolderOpened,
  Files,
  Collection,
  Clock,
  Connection,
  Folder,
  Upload,
} from '@element-plus/icons-vue'
import { logError } from '@/utils/logger'
import { normalizeList } from '@/utils/normalize'
import { useAuthStore } from '@/stores/auth'
import {
  getTenderFile,
  getParsedDocumentByFile,
  smartReparse,
  listTenderFiles,
  mergeParseTenderFile,
  directUpload,
  type TenderFile,
  type ParsedDocument,
} from '@/api/tender'
import RequirementTab from '@/components/requirements/RequirementTab.vue'
import ChunkTab from '@/components/tender/ChunkTab.vue'
import { useResponseTemplateEntry } from '@/composables/useResponseTemplateEntry'
import VersionTab from '@/components/tender/VersionTab.vue'
import TaskProgress from '@/components/tender/TenderPipelineProgress.vue'
import { getCurrentTask } from '@/api/task'
import { getTask } from '@/api/tasks'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const fileId = ref(Number(route.params.fileId))
const pageLoading = ref(false)
const reparseLoading = ref(false)

const tenderFile = ref<TenderFile | null>(null)
const parsedDoc = ref<ParsedDocument | null>(null)
const activeTab = ref('requirements')
const currentTaskId = ref<number | null>(null)
const refreshing = ref(false)
const refreshKey = ref(0)

// 标段文件组
const lotFiles = ref<TenderFile[]>([])
const selectedAttachmentIds = ref<number[]>([])
const mergeLoading = ref(false)
const attachUploading = ref(false)
const attachmentInput = ref<HTMLInputElement | null>(null)
const lotFilesTableRef = ref()
// 每个文件只默认勾选一次其关联附件，之后以用户手动勾选为准
const attachmentDefaultsApplied = ref(false)

// 轮询定时器
let pollTimer: ReturnType<typeof setInterval> | null = null
let mergePollTimer: ReturnType<typeof setInterval> | null = null

// 计算属性
const isProcessing = computed(() => {
  if (!tenderFile.value) return false
  return ['parsing', 'chunking', 'processing', 'parse_pending'].includes(tenderFile.value.status)
})

// 与后端 ALLOWED_REPARSE_STATUSES 对齐，避免按钮显示但接口 400
const canReparse = computed(() => {
  if (!tenderFile.value) return false
  return ['parsed', 'chunked', 'ready', 'requirement_extracted', 'indexed', 'parse_failed'].includes(tenderFile.value.status)
})

// 响应模板入口: 招标文件已解析后可用
const canResponseTemplate = computed(() => {
  if (!tenderFile.value) return false
  return ['parsed', 'chunked', 'ready', 'requirement_extracted', 'indexed'].includes(tenderFile.value.status)
})

// 响应模板状态(幂等: 同文件一个模板, 逻辑复用 composable)
const {
  loading: responseTemplateLoading,
  loadByFile,
  templateOf,
  enter: enterResponseTemplate,
  statusType: rtStatusType,
} = useResponseTemplateEntry()

const responseTemplate = computed(() =>
  tenderFile.value ? templateOf(tenderFile.value.id) : null,
)

const responseStatusType = computed(() => rtStatusType(responseTemplate.value?.status))

async function loadResponseTemplate() {
  if (!tenderFile.value || !canResponseTemplate.value) return
  await loadByFile(tenderFile.value.id)
}

async function goResponseTemplate() {
  if (!tenderFile.value) return
  await enterResponseTemplate(tenderFile.value.id)
}

const canManage = computed(() => {
  if (!tenderFile.value) return false
  return auth.hasGlobalPermission('tender.manage')
})

// 所有相关文件ID（主文件 + 附件），用于合并条款展示
const allRelatedFileIds = computed(() => {
  if (!lotFiles.value.length) return [fileId.value]
  return lotFiles.value.map(f => f.id)
})

// 加载页面数据
async function loadPageData() {
  pageLoading.value = true
  try {
    const fileRes = await getTenderFile(fileId.value)
    tenderFile.value = fileRes.data

    await loadLotFiles()
    await loadResponseTemplate()

    if (tenderFile.value && !isProcessing.value) {
      try {
        const docRes = await getParsedDocumentByFile(fileId.value)
        if (docRes.data && docRes.data.id) {
          parsedDoc.value = docRes.data
        } else {
          parsedDoc.value = null
        }
      } catch (err: any) {
        if (err.response?.status !== 404) {
          logError('加载解析文档失败:', err)
        }
        parsedDoc.value = null
      }
      stopPolling()
    } else {
      parsedDoc.value = null
      if (tenderFile.value && isProcessing.value) {
        startPolling()
      }
    }

    checkCurrentTask()
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || err.response?.data?.detail || '加载失败')
    router.back()
  } finally {
    pageLoading.value = false
  }
}

// 加载同标段文件组
async function loadLotFiles() {
  if (!tenderFile.value?.project || !tenderFile.value?.lot) {
    lotFiles.value = []
    return
  }
  try {
    const res = await listTenderFiles({
      project_id: tenderFile.value.project,
      lot_id: tenderFile.value.lot,
    })
    lotFiles.value = normalizeList<TenderFile>(res.data)
    // 初始默认勾选已关联到当前文件的附件（用户仍可手动调整）
    if (!attachmentDefaultsApplied.value) {
      await nextTick()
      if (lotFilesTableRef.value) {
        attachmentDefaultsApplied.value = true
        const defaults = lotFiles.value.filter(
          f => f.file_category === 'attachment' && f.main_file === fileId.value
        )
        defaults.forEach(row => lotFilesTableRef.value.toggleRowSelection(row, true))
      }
    }
  } catch (err) {
    logError('加载标段文件失败:', err)
  }
}

// 上传附件（上传成功后自动触发合并解析，无需手动勾选）
async function handleAttachmentChange(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  input.value = ''
  if (!files.length || !tenderFile.value) return
  attachUploading.value = true
  try {
    for (const file of files) {
      await directUpload(file, {
        project_id: tenderFile.value.project,
        lot_id: tenderFile.value.lot ?? undefined,
        file_category: 'attachment',
        main_file_id: tenderFile.value.id,
      })
    }
    ElMessage.success(`已上传 ${files.length} 个附件，自动执行合并解析`)
    await loadLotFiles()
    await handleAutoMergeParse()
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '附件上传失败')
  } finally {
    attachUploading.value = false
  }
}

// 自动合并解析（无需勾选附件，后端自动带主文件全部附件）
async function handleAutoMergeParse() {
  mergeLoading.value = true
  try {
    const res = await mergeParseTenderFile(fileId.value)
    await pollMergeTask(res.data.task_id)
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '自动合并解析失败')
  } finally {
    mergeLoading.value = false
  }
}

// 合并解析
async function handleMergeParse() {
  if (selectedAttachmentIds.value.length === 0) {
    ElMessage.warning('请先勾选要合并的附件')
    return
  }
  try {
    await ElMessageBox.confirm(
      '合并解析将把主文件与所选附件合并为统一文档并重新分块，历史解析版本保留。是否继续？',
      '确认合并解析',
      { type: 'warning' }
    )
  } catch {
    return
  }
  mergeLoading.value = true
  try {
    const res = await mergeParseTenderFile(fileId.value, selectedAttachmentIds.value)
    ElMessage.success('已提交合并解析任务')
    await pollMergeTask(res.data.task_id)
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '提交合并解析失败')
  } finally {
    mergeLoading.value = false
  }
}

function pollMergeTask(taskId: number) {
  return new Promise<void>((resolve) => {
    mergePollTimer = setInterval(async () => {
      try {
        const res = await getTask(taskId)
        const task = res.data
        if (task.status === 'success') {
          clearInterval(mergePollTimer!)
          mergeLoading.value = false
          ElMessage.success('合并解析完成，可重新执行条款抽取/大纲生成')
          await loadPageData()
          resolve()
        } else if (task.status === 'failed') {
          clearInterval(mergePollTimer!)
          mergeLoading.value = false
          ElMessage.error(`合并解析失败: ${task.error_message || ''}`)
          resolve()
        }
      } catch (err) {
        logError('轮询合并任务失败:', err)
        clearInterval(mergePollTimer!)
        mergeLoading.value = false
        resolve()
      }
    }, 2000)
  })
}

// 检查是否有进行中的任务
async function checkCurrentTask() {
  try {
    const res = await getCurrentTask({
      related_object_type: 'TenderFile',
      related_object_id: fileId.value,
    })
    currentTaskId.value = res.data?.id || null
  } catch (err) {
    logError('检查当前任务失败:', err)
  }
}

// 任务完成回调
function handleTaskCompleted(result: Record<string, unknown>) {
  if (result.task_type === 'requirement_extraction_v2') {
    ElMessage.success(`条款抽取完成，共 ${result.total_count || 0} 条`)
  } else if (result.task_type === 'tender_merge_parse') {
    ElMessage.success('合并解析完成，可重新执行条款抽取/大纲生成')
  } else {
    ElMessage.success('任务完成')
  }
  loadPageData()
  // requirement_extraction_v2 / requirement_dedup 由 RequirementTab 内部轮询并自行刷新；
  // 其余任务（如 tender_parse 重新解析，其尾部会联动条款抽取）需要强制重挂载各 Tab，
  // 否则条款/分块列表会继续展示旧数据
  if (!['requirement_extraction_v2', 'requirement_dedup'].includes(result.task_type as string)) {
    refreshKey.value++
  }
}

// 任务失败回调
function handleTaskFailed(error: string) {
  ElMessage.error(`任务失败: ${error}`)
}

// Tab 切换
function handleTabChange(_tabName: string) {
  // Tab 组件内部会自行处理数据加载
}

// 重新解析（有附件时自动合并解析，无需手动勾选）
async function handleReparse() {
  const attachmentCount = lotFiles.value.filter(
    (f) => f.file_category === 'attachment' || f.file_category === 'clarification'
  ).length
  try {
    await ElMessageBox.confirm(
      attachmentCount > 0
        ? `将把主文件与 ${attachmentCount} 个附件合并为统一文档并重新解析，历史解析版本会保留。是否继续？`
        : '重新解析将生成新的解析版本，并设为当前版本。历史解析版本会保留。是否继续？',
      attachmentCount > 0 ? '确认合并解析' : '确认重新解析',
      { type: 'warning' }
    )
    reparseLoading.value = true
    const res = await smartReparse(fileId.value)
    ElMessage.success(res.data?.message || '已提交解析任务')
    if (tenderFile.value) {
      tenderFile.value.status = res.data?.status || 'parsing'
    }
    loadPageData()
  } catch (err: any) {
    if (err !== 'cancel') {
      ElMessage.error(err.response?.data?.message || '操作失败')
    }
  } finally {
    reparseLoading.value = false
  }
}

// 版本激活后刷新
function handleVersionActivated() {
  loadPageData()
}

// 手动刷新当前 Tab 数据
async function handleRefresh() {
  refreshing.value = true
  try {
    await loadPageData()
    // 强制重新渲染当前 Tab 组件
    refreshKey.value++
    ElMessage.success('数据已刷新')
  } finally {
    refreshing.value = false
  }
}

// 状态样式
function getStatusType(status: string): string {
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

// 状态点样式
function getStatusDotClass(status: string): string {
  if (['parsed', 'chunked', 'ready', 'requirement_extracted'].includes(status)) return 'is-success'
  if (['parsing', 'chunking', 'processing', 'parse_pending'].includes(status)) return 'is-warning'
  if (['parse_failed', 'rejected', 'archived'].includes(status)) return 'is-danger'
  return 'is-info'
}

// 文件类型显示
function formatFileType(contentType: string): string {
  const map: Record<string, string> = {
    'application/pdf': 'PDF',
    'application/msword': 'DOC',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
    'text/plain': 'TXT',
    'text/markdown': 'MD',
  }
  return map[contentType] || contentType?.split('/').pop()?.toUpperCase() || '-'
}

// 时间格式化
function formatDateTime(dateStr: string): string {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// 监听路由变化
watch(
  () => route.params.fileId,
  (newId) => {
    if (newId) {
      fileId.value = Number(newId)
      activeTab.value = 'requirements'
      attachmentDefaultsApplied.value = false
      selectedAttachmentIds.value = []
      loadPageData()
    }
  }
)

// 开始轮询
function startPolling() {
  if (pollTimer) return
  pollTimer = setInterval(() => {
    if (isProcessing.value) {
      loadPageData()
    } else {
      stopPolling()
    }
  }, 3000)
}

// 停止轮询
function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

onMounted(() => {
  loadPageData()
})

onUnmounted(() => {
  stopPolling()
  if (mergePollTimer) {
    clearInterval(mergePollTimer)
    mergePollTimer = null
  }
})
</script>

<style scoped>
.tender-file-detail {
  padding: 20px 24px;
  min-width: 0;
  overflow-x: hidden;
  background: var(--el-fill-color-lighter);
  min-height: calc(100vh - 60px);
}

/* 页面头部 */
.page-header {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 20px;
}

.header-breadcrumb {
  display: flex;
  align-items: center;
}

.back-btn {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.header-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.file-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.file-title {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.file-title h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.file-subtitle {
  display: flex;
  align-items: center;
  gap: 10px;
}

.file-id {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

/* 元信息卡片 */
.meta-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}

.meta-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 10px;
  transition: all 0.2s ease;
}

.meta-card:hover {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.meta-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.meta-icon.size { background: var(--el-color-primary-light-9); color: var(--el-color-primary); }
.meta-icon.type { background: var(--el-color-success-light-9); color: var(--el-color-success); }
.meta-icon.lot { background: var(--el-color-warning-light-9); color: var(--el-color-warning); }
.meta-icon.time { background: var(--el-color-info-light-9); color: var(--el-color-info); }
.meta-icon.outline { background: var(--el-color-danger-light-9); color: var(--el-color-danger); }
.meta-icon.response { background: var(--el-color-success-light-9); color: var(--el-color-success); }
.rt-conf { margin-left: 8px; color: #909399; font-size: 12px; }

.meta-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.meta-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.meta-value {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* 错误提示 */
.file-error-alert {
  margin-bottom: 16px;
  border-radius: 8px;
}

/* 解析中状态 */
.processing-card {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 12px;
  padding: 32px;
  margin-bottom: 20px;
}

.processing-content {
  display: flex;
  align-items: center;
  gap: 16px;
}

.processing-icon {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--el-color-warning-light-9);
  color: var(--el-color-warning);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.processing-text {
  flex: 1;
  min-width: 0;
}

.processing-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 4px;
}

.processing-desc {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

/* 通用卡片 */
.section-card {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 12px;
  margin-bottom: 20px;
  overflow: hidden;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-lighter);
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.section-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 文件表格 */
.lot-files-table {
  border: none;
}

.lot-files-table :deep(.el-table__header) {
  background: var(--el-fill-color-light);
}

.lot-files-table :deep(.el-table__row) {
  transition: background 0.15s ease;
}

.lot-files-table :deep(.el-table__row:hover) {
  background: var(--el-fill-color-light);
}

.file-name-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.file-type-icon {
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
}

.name-text {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.status-cell {
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-dot.is-success { background: var(--el-color-success); }
.status-dot.is-warning { background: var(--el-color-warning); }
.status-dot.is-danger { background: var(--el-color-danger); }
.status-dot.is-info { background: var(--el-color-info); }

.status-text {
  font-size: 13px;
  color: var(--el-text-color-regular);
}

/* 内容卡片 */
.content-card {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 12px;
  overflow: hidden;
}

.tabs-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-lighter);
}

.content-tabs {
  flex: 1;
}

.content-tabs :deep(.el-tabs__header) {
  margin-bottom: 0;
  border-bottom: none;
}

.content-tabs :deep(.el-tabs__nav-wrap::after) {
  display: none;
}

.refresh-btn {
  flex-shrink: 0;
}

.tabs-content {
  padding: 20px;
}

/* 响应式 */
@media (max-width: 768px) {
  .header-main {
    flex-direction: column;
    align-items: flex-start;
  }

  .meta-cards {
    grid-template-columns: repeat(2, 1fr);
  }

  .section-header {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
