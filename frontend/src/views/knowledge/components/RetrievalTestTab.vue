<!-- frontend/src/views/knowledge/components/RetrievalTestTab.vue -->
<template>
  <div class="retrieval-test-tab">
    <el-row :gutter="20">
      <el-col :span="10">
        <RetrievalQueryPanel
          v-model:query="query"
          v-model:topK="topK"
          :knowledge-base-id="knowledgeBaseId"
          :loading="loading"
          @search="handleSearch"
        />
      </el-col>

      <el-col :span="14">
        <RetrievalResultPanel
          :results="results"
          :latency-ms="latencyMs"
          :selected-index="selectedIndex"
          @select="handleSelectResult"
        />
      </el-col>
    </el-row>

    <el-divider />

    <RagContextPreview
      :rag-context="ragContext"
      :selected-source-index="selectedIndex"
      :selected-chunk-id="selectedChunkId"
      @copy="handleCopyContext"
      @select-source="handleSelectSource"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { testRetrieval, type RetrievalChunk, type RagContext } from '@/api/knowledge'
import RetrievalQueryPanel from './RetrievalQueryPanel.vue'
import RetrievalResultPanel from './RetrievalResultPanel.vue'
import RagContextPreview from './RagContextPreview.vue'

const props = defineProps<{
  knowledgeBaseId: number
}>()

const query = ref('')
const topK = ref(10)
const loading = ref(false)
const results = ref<RetrievalChunk[]>([])
const latencyMs = ref(0)
const ragContext = ref<RagContext | null>(null)
const selectedIndex = ref(-1)
const selectedChunkId = ref<number | null>(null)

const handleSearch = async () => {
  if (!query.value.trim()) {
    ElMessage.warning('请输入查询内容')
    return
  }

  loading.value = true
  try {
    const res = await testRetrieval({
      query: query.value,
      knowledge_base_ids: [props.knowledgeBaseId],
      top_k: topK.value,
    })

    results.value = res.data.results
    latencyMs.value = res.data.latency_ms
    ragContext.value = res.data.rag_context || null
    selectedIndex.value = -1
    selectedChunkId.value = null
  } catch (e) {
    ElMessage.error('检索失败')
  } finally {
    loading.value = false
  }
}

const handleSelectResult = (index: number) => {
  selectedIndex.value = index
  selectedChunkId.value = results.value[index]?.chunk_id ?? null
}

const handleSelectSource = (index: number) => {
  // 点击来源时，找到对应的检索结果索引
  const chunkId = ragContext.value?.sources[index]?.chunk_id
  if (chunkId) {
    const resultIndex = results.value.findIndex(r => r.chunk_id === chunkId)
    if (resultIndex >= 0) {
      selectedIndex.value = resultIndex
      selectedChunkId.value = chunkId
    }
  }
}

const handleCopyContext = async () => {
  if (!ragContext.value) return

  try {
    await navigator.clipboard.writeText(ragContext.value.text)
    ElMessage.success('已复制到剪贴板')
  } catch (e) {
    ElMessage.error('复制失败')
  }
}
</script>

<style scoped>
.retrieval-test-tab {
  padding: 0;
}
</style>