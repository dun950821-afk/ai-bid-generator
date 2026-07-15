<!-- frontend/src/views/knowledge/components/RetrievalResultPanel.vue -->
<template>
  <el-card shadow="never">
    <template #header>
      <div class="result-header">
        <span>检索结果</span>
        <el-tag v-if="latencyMs > 0" :type="latencyTagType" size="small" effect="plain">
          {{ latencyMs }}ms · {{ results.length }} 条
        </el-tag>
      </div>
    </template>

    <el-empty
      v-if="results.length === 0 && !searched"
      description="输入查询内容后点击「执行检索」"
    />
    <el-empty
      v-else-if="results.length === 0 && searched"
      description="未匹配到相关结果"
    />

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
          <span class="score">分数 {{ result.score.toFixed(2) }}</span>
        </div>

        <div class="result-meta">
          <el-tag size="small">{{ result.knowledge_base_name }}</el-tag>
          <span v-if="result.section_path" class="section">{{ result.section_path }}</span>
        </div>

        <div class="result-content">{{ result.content_preview }}</div>
      </div>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { RetrievalChunk } from '@/api/knowledge'

const props = defineProps<{
  results: RetrievalChunk[]
  latencyMs: number
  selectedIndex: number
  searched: boolean
}>()

defineEmits<{
  select: [index: number]
}>()

const latencyTagType = computed(() => {
  if (props.latencyMs < 200) return 'success'
  if (props.latencyMs < 1000) return 'info'
  if (props.latencyMs < 3000) return 'warning'
  return 'danger'
})
</script>

<style scoped>
.result-header {
  display: flex;
  align-items: center;
  gap: 8px;
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
