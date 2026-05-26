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
      @uploaded="fetchDocuments"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { listDocuments, deleteDocument, type KnowledgeDocument } from '@/api/knowledge'
import KnowledgeDocumentTable from './KnowledgeDocumentTable.vue'
import KnowledgeUploadDialog from './KnowledgeUploadDialog.vue'

const props = defineProps<{
  knowledgeBaseId: number
}>()

const loading = ref(false)
const documents = ref<KnowledgeDocument[]>([])
const showUploadDialog = ref(false)

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

const viewChunks = (_doc: KnowledgeDocument) => {
  // 跳转到分块 Tab 或展开分块列表
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
</script>

<style scoped>
.document-tab {
  padding: 0;
}

.toolbar {
  margin-bottom: 16px;
}
</style>