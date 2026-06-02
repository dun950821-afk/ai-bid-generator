<!-- frontend/src/views/knowledge/components/KnowledgeChunkTable.vue -->
<template>
  <div>
    <div class="toolbar">
      <el-input
        v-model="keyword"
        placeholder="搜索分块内容"
        style="width: 300px"
        clearable
        @keyup.enter="handleSearch"
      />
      <el-button type="primary" @click="handleSearch" style="margin-left: 8px">搜索</el-button>
      <el-button v-if="filterDocumentId" @click="clearFilter" style="margin-left: 8px">
        清除筛选
      </el-button>
    </div>

    <el-table :data="chunks" v-loading="loading" stripe>
      <el-table-column prop="chunk_index" label="序号" width="60" />
      <el-table-column prop="document_title" label="文档" min-width="150" />
      <el-table-column prop="title" label="标题" min-width="150" />
      <el-table-column prop="section_path" label="章节路径" min-width="150" />
      <el-table-column label="内容" min-width="300">
        <template #default="{ row }">
          <span class="content-preview">{{ row.content.slice(0, 100) }}...</span>
        </template>
      </el-table-column>
      <el-table-column prop="token_count" label="Token" width="80" />
      <el-table-column prop="chunk_type_display" label="类型" width="80" />

      <el-table-column label="操作" width="100" fixed="right">
        <template #default="{ row }">
          <el-button text type="primary" @click="showChunkDetail(row)">查看</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      v-if="total > 0"
      class="pagination"
      :current-page="currentPage"
      :page-size="pageSize"
      :total="total"
      layout="total, prev, pager, next"
      @current-change="handlePageChange"
    />

    <KnowledgeChunkViewer
      v-model="showViewer"
      :chunk="selectedChunk"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { listChunksByKnowledgeBase, type KnowledgeChunk } from '@/api/knowledge'
import KnowledgeChunkViewer from './KnowledgeChunkViewer.vue'

const props = defineProps<{
  knowledgeBaseId: number
  refreshKey?: number
  filterDocumentId?: number
}>()

const loading = ref(false)
const chunks = ref<KnowledgeChunk[]>([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(20)
const keyword = ref('')
const showViewer = ref(false)
const selectedChunk = ref<KnowledgeChunk | null>(null)

const fetchChunks = async () => {
  loading.value = true
  try {
    const res = await listChunksByKnowledgeBase(props.knowledgeBaseId, {
      page: currentPage.value,
      page_size: pageSize.value,
      document_id: props.filterDocumentId,
      keyword: keyword.value || undefined,
    })
    chunks.value = res.data.results
    total.value = res.data.count
  } catch (e) {
    ElMessage.error('获取分块列表失败')
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  currentPage.value = 1
  fetchChunks()
}

const handlePageChange = (page: number) => {
  currentPage.value = page
  fetchChunks()
}

const clearFilter = () => {
  currentPage.value = 1
  // 通过 emit 通知父组件清除筛选
  keyword.value = ''
  fetchChunks()
}

const showChunkDetail = (chunk: KnowledgeChunk) => {
  selectedChunk.value = chunk
  showViewer.value = true
}

// 监听 refreshKey 变化，重新加载数据
watch(() => props.refreshKey, (newKey) => {
  if (newKey !== undefined && newKey > 0) {
    currentPage.value = 1
    fetchChunks()
  }
})

// 监听 filterDocumentId 变化
watch(() => props.filterDocumentId, () => {
  currentPage.value = 1
  fetchChunks()
})

onMounted(() => {
  fetchChunks()
})
</script>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  margin-bottom: 16px;
}

.content-preview {
  color: #666;
}

.pagination {
  margin-top: 16px;
  justify-content: flex-end;
}
</style>
