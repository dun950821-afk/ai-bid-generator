<!-- frontend/src/views/knowledge/components/DocumentTab.vue -->
<template>
  <div class="document-tab">
    <div class="status-cards">
      <el-card v-for="card in statusCards" :key="card.key" shadow="never" class="status-card">
        <div class="status-card-body">
          <div class="status-count" :class="card.cls">{{ card.count }}</div>
          <div class="status-label">{{ card.label }}</div>
        </div>
      </el-card>
    </div>

    <div class="toolbar">
      <el-button type="primary" @click="showUploadDialog = true">
        <el-icon class="mr-4"><Upload /></el-icon>上传文档
      </el-button>
      <el-input
        v-model="searchKeyword"
        placeholder="搜索文件名"
        clearable
        class="search-input"
      />
      <el-button @click="fetchDocuments" :loading="loading">
        <el-icon><Refresh /></el-icon>
      </el-button>
    </div>

    <KnowledgeDocumentTable
      :documents="filteredDocuments"
      :loading="loading"
      @view-chunks="viewChunks"
      @delete="handleDelete"
      @view-error="handleViewError"
      @reprocess="handleReprocess"
    />

    <div v-if="total > pageSize" class="pagination">
      <el-pagination
        v-model:current-page="currentPage"
        :page-size="pageSize"
        :total="total"
        layout="prev, pager, next, total"
        @current-change="fetchDocuments"
      />
    </div>

    <KnowledgeUploadDialog
      v-model="showUploadDialog"
      :knowledge-base-id="knowledgeBaseId"
      @uploaded="handleUploaded"
    />

    <el-dialog v-model="errorDialogVisible" title="错误详情" width="600px">
      <el-alert
        v-if="errorDialogDoc"
        :title="errorDialogDoc.file_name"
        type="error"
        :closable="false"
        show-icon
      />
      <pre class="error-pre">{{ errorDialogDoc?.error_message || '无错误信息' }}</pre>
      <template #footer>
        <el-button @click="errorDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Upload, Refresh } from '@element-plus/icons-vue'
import { listDocuments, deleteDocument, getDocument, reprocessDocument, type KnowledgeDocument } from '@/api/knowledge'
import { extractApiError } from '@/utils/errors'
import KnowledgeDocumentTable from './KnowledgeDocumentTable.vue'
import KnowledgeUploadDialog from './KnowledgeUploadDialog.vue'

const COMPLETE_STATUSES = ['ready', 'failed']
const POLLING_INTERVAL = 5000 // 5 秒，原 30s 太慢
const MAX_POLLING_ERRORS = 5
const pageSize = 20

const props = defineProps<{
  knowledgeBaseId: number
}>()

const emit = defineEmits<{
  documentStatusChanged: [doc: KnowledgeDocument]
  viewChunks: [doc: KnowledgeDocument]
}>()

const loading = ref(false)
const documents = ref<KnowledgeDocument[]>([])
const showUploadDialog = ref(false)
const searchKeyword = ref('')
const currentPage = ref(1)
const total = ref(0)

const errorDialogVisible = ref(false)
const errorDialogDoc = ref<KnowledgeDocument | null>(null)

const pollingTimer = ref<number | null>(null)
const pollingErrorCount = ref(0)
const pendingDocumentIds = ref<Set<number>>(new Set())

const statusCards = computed(() => {
  const counts = {
    uploading: 0,
    processing: 0,
    ready: 0,
    failed: 0,
  }
  for (const doc of documents.value) {
    if (doc.status === 'uploading') counts.uploading += 1
    else if (doc.status === 'processing') counts.processing += 1
    else if (doc.status === 'ready') counts.ready += 1
    else if (doc.status === 'failed') counts.failed += 1
  }
  return [
    { key: 'uploading', label: '上传中', count: counts.uploading, cls: 'info' },
    { key: 'processing', label: '处理中', count: counts.processing, cls: 'warning' },
    { key: 'ready', label: '可用', count: counts.ready, cls: 'success' },
    { key: 'failed', label: '失败', count: counts.failed, cls: 'danger' },
  ]
})

const filteredDocuments = computed(() => {
  if (!searchKeyword.value) return documents.value
  const kw = searchKeyword.value.toLowerCase()
  return documents.value.filter((d) => d.file_name.toLowerCase().includes(kw))
})

const fetchDocuments = async () => {
  loading.value = true
  try {
    const res = await listDocuments(props.knowledgeBaseId, {
      page: currentPage.value,
      page_size: pageSize,
    })
    documents.value = res.data.results
    total.value = res.data.count
    // 把仍处理中的文档加入轮询队列
    for (const doc of documents.value) {
      if (!COMPLETE_STATUSES.includes(doc.status)) {
        pendingDocumentIds.value.add(doc.id)
      }
    }
    if (pendingDocumentIds.value.size > 0) {
      startPolling()
    }
  } catch (e) {
    ElMessage.error(extractApiError(e, '获取文档列表失败'))
  } finally {
    loading.value = false
  }
}

const startPolling = () => {
  if (pollingTimer.value) return

  pollingTimer.value = window.setInterval(async () => {
    if (pendingDocumentIds.value.size === 0) {
      stopPolling()
      return
    }

    try {
      const idsToCheck = Array.from(pendingDocumentIds.value)
      for (const docId of idsToCheck) {
        const res = await getDocument(docId)
        const doc = res.data

        if (COMPLETE_STATUSES.includes(doc.status)) {
          pendingDocumentIds.value.delete(docId)
          emit('documentStatusChanged', doc)
        }
      }

      await fetchDocuments()
      pollingErrorCount.value = 0

      if (pendingDocumentIds.value.size === 0) {
        stopPolling()
      }
    } catch (e) {
      pollingErrorCount.value += 1
      if (pollingErrorCount.value >= MAX_POLLING_ERRORS) {
        stopPolling()
        ElMessage.warning('文档状态轮询失败，请手动刷新')
      }
    }
  }, POLLING_INTERVAL)
}

const stopPolling = () => {
  if (pollingTimer.value) {
    clearInterval(pollingTimer.value)
    pollingTimer.value = null
  }
}

const handleUploaded = (documentId: number) => {
  fetchDocuments()
  pendingDocumentIds.value.add(documentId)
  startPolling()
}

const viewChunks = (doc: KnowledgeDocument) => {
  emit('viewChunks', doc)
}

const handleDelete = async (doc: KnowledgeDocument) => {
  try {
    await ElMessageBox.confirm(`确定删除文档「${doc.file_name}」吗？`, '确认删除', {
      type: 'warning',
    })
    await deleteDocument(doc.id)
    ElMessage.success('删除成功')
    fetchDocuments()
  } catch (e) {
    if (e !== 'cancel' && e !== 'close') {
      ElMessage.error(extractApiError(e, '删除失败'))
    }
  }
}

const handleViewError = (doc: KnowledgeDocument) => {
  errorDialogDoc.value = doc
  errorDialogVisible.value = true
}

const handleReprocess = async (doc: KnowledgeDocument) => {
  try {
    await ElMessageBox.confirm(
      `确定重新处理文档「${doc.file_name}」吗？会清理旧分块并重跑解析/分块/嵌入/索引。`,
      '确认重新处理',
      { type: 'warning' }
    )
    const res = await reprocessDocument(doc.id)
    ElMessage.success(`已提交重处理任务 #${res.data.task_id}`)
    pendingDocumentIds.value.add(doc.id)
    fetchDocuments()
  } catch (e) {
    if (e !== 'cancel' && e !== 'close') {
      ElMessage.error(extractApiError(e, '提交重处理失败'))
    }
  }
}

onMounted(() => {
  fetchDocuments()
})

onBeforeUnmount(() => {
  stopPolling()
})
</script>

<style scoped>
.document-tab {
  padding: 0;
}

.status-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}

.status-card {
  text-align: center;
}

.status-card-body {
  padding: 4px 0;
}

.status-count {
  font-size: 24px;
  font-weight: 600;
  line-height: 1.2;
}

.status-count.info { color: #909399; }
.status-count.warning { color: #e6a23c; }
.status-count.success { color: #67c23a; }
.status-count.danger { color: #f56c6c; }

.status-label {
  font-size: 12px;
  color: #666;
  margin-top: 4px;
}

.toolbar {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  align-items: center;
}

.search-input {
  width: 240px;
}

.mr-4 {
  margin-right: 4px;
}

.pagination {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

.error-pre {
  margin-top: 12px;
  padding: 12px;
  background: #fef0f0;
  border-radius: 4px;
  font-family: monospace;
  font-size: 12px;
  color: #f56c6c;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 400px;
  overflow-y: auto;
}
</style>
