<!-- frontend/src/views/knowledge/components/DocumentTab.vue -->
<template>
  <div class="document-tab">
    <div class="toolbar">
      <el-button type="primary" @click="showUploadDialog = true">上传文档</el-button>
    </div>

    <KnowledgeDocumentTable
      :documents="documents"
      :loading="loading"
      @view-chunks="viewChunks"
      @delete="handleDelete"
    />

    <KnowledgeUploadDialog
      v-model="showUploadDialog"
      :knowledge-base-id="knowledgeBaseId"
      @uploaded="handleUploaded"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { listDocuments, deleteDocument, getDocument, type KnowledgeDocument } from '@/api/knowledge'
import KnowledgeDocumentTable from './KnowledgeDocumentTable.vue'
import KnowledgeUploadDialog from './KnowledgeUploadDialog.vue'

// 文档状态常量
const INCOMPLETE_STATUSES = ['uploading', 'uploaded', 'processing', 'pending', 'chunking']
const COMPLETE_STATUSES = ['ready', 'failed', 'cancelled']
const POLLING_INTERVAL = 30000 // 30秒
const MAX_POLLING_ERRORS = 5

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

// 轮询状态
const pollingTimer = ref<number | null>(null)
const pollingErrorCount = ref(0)
const pendingDocumentIds = ref<Set<number>>(new Set())

const fetchDocuments = async () => {
  loading.value = true
  try {
    const res = await listDocuments(props.knowledgeBaseId)
    documents.value = res.data.results
  } catch (e) {
    ElMessage.error('获取文档列表失败')
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

      // 刷新文档列表
      await fetchDocuments()
      pollingErrorCount.value = 0

      // 所有文档都完成，停止轮询
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
  // 立即刷新文档列表
  fetchDocuments()
  // 将新文档加入轮询队列
  pendingDocumentIds.value.add(documentId)
  // 启动轮询
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
    // 用户取消
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

.toolbar {
  margin-bottom: 16px;
}
</style>
