<!-- frontend/src/views/knowledge/components/KnowledgeChunkTable.vue -->
<template>
  <div>
    <el-input
      v-model="searchText"
      placeholder="搜索分块内容"
      style="width: 300px; margin-bottom: 16px"
      clearable
      @input="handleSearch"
    />

    <el-table :data="chunks" v-loading="loading" stripe>
      <el-table-column prop="chunk_index" label="序号" width="60" />
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

    <KnowledgeChunkViewer
      v-model="showViewer"
      :chunk="selectedChunk"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { listChunks, type KnowledgeChunk } from '@/api/knowledge'
import KnowledgeChunkViewer from './KnowledgeChunkViewer.vue'

const props = defineProps<{
  knowledgeBaseId: number
}>()

const loading = ref(false)
const chunks = ref<KnowledgeChunk[]>([])
const searchText = ref('')
const showViewer = ref(false)
const selectedChunk = ref<KnowledgeChunk | null>(null)

const fetchChunks = async () => {
  loading.value = true
  try {
    // 获取知识库下所有文档的分块
    // 简化实现：这里需要后端支持按知识库查询分块
    // 暂时返回空数组
    chunks.value = []
  } catch (e) {
    ElMessage.error('获取分块列表失败')
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  // 搜索逻辑
}

const showChunkDetail = (chunk: KnowledgeChunk) => {
  selectedChunk.value = chunk
  showViewer.value = true
}

onMounted(() => {
  fetchChunks()
})
</script>

<style scoped>
.content-preview {
  color: #666;
}
</style>