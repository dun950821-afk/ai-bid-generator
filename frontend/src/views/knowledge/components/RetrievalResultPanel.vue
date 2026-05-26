<!-- frontend/src/views/knowledge/components/RetrievalResultPanel.vue -->
<template>
  <el-card shadow="never">
    <template #header>
      <span>检索结果</span>
      <span v-if="latencyMs > 0" class="latency">{{ latencyMs }}ms</span>
    </template>

    <el-empty v-if="results.length === 0" description="暂无结果" />

    <div v-else class="result-list">
      <div
        v-for="(result, index) in results"
        :key="result.chunk_id"
        class="result-item"
        :class="{ selected: selectedIndex === index }"
        @click="$emit('select', index)"
      >
        <div class="result-header">
          <span class="rank">#{{ result.rank }}</span>
          <span class="title">{{ result.title || result.document_title }}</span>
          <span class="score">分数: {{ result.score.toFixed(2) }}</span>
        </div>

        <div class="result-meta">
          <el-tag size="small">{{ result.knowledge_base_name }}</el-tag>
          <span v-if="result.section_path" class="section">{{ result.section_path }}</span>
        </div>

        <div class="result-content">
          {{ result.content_preview }}
        </div>
      </div>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import type { RetrievalChunk } from '@/api/knowledge'

defineProps<{
  results: RetrievalChunk[]
  latencyMs: number
  selectedIndex: number
}>()

defineEmits<{
  select: [index: number]
}>()
</script>

<style scoped>
.latency {
  margin-left: 8px;
  color: #909399;
  font-size: 12px;
}

.result-list {
  max-height: 400px;
  overflow-y: auto;
}

.result-item {
  padding: 12px;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.result-item:hover {
  border-color: #409eff;
}

.result-item.selected {
  border-color: #409eff;
  background: #ecf5ff;
}

.result-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.rank {
  font-weight: 500;
  color: #409eff;
}

.title {
  flex: 1;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.score {
  font-size: 12px;
  color: #909399;
}

.result-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.section {
  font-size: 12px;
  color: #666;
}

.result-content {
  font-size: 13px;
  color: #666;
  line-height: 1.5;
}
</style>