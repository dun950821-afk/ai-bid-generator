<!-- frontend/src/views/knowledge/components/RagContextPreview.vue -->
<template>
  <el-card shadow="never">
    <template #header>
      <span>RAG 上下文预览</span>
      <el-button
        v-if="ragContext"
        text
        type="primary"
        size="small"
        @click="$emit('copy')"
      >
        复制上下文
      </el-button>
    </template>

    <el-empty v-if="!ragContext" description="暂无上下文" />

    <template v-else>
      <div class="context-stats">
        <span>Token 数: {{ ragContext.token_count }}</span>
        <span>来源数: {{ ragContext.chunk_count }}</span>
      </div>

      <div class="context-text">
        <pre>{{ ragContext.text }}</pre>
      </div>

      <div class="sources">
        <h4>来源列表</h4>
        <div
          v-for="(source, index) in ragContext.sources"
          :key="source.chunk_id"
          class="source-item"
          :class="{ highlighted: selectedSourceIndex === index }"
        >
          <span class="source-index">{{ index + 1 }}.</span>
          <span class="source-title">{{ source.document_title }}</span>
          <span v-if="source.section_path" class="source-section">{{ source.section_path }}</span>
        </div>
      </div>
    </template>
  </el-card>
</template>

<script setup lang="ts">
import type { RagContext } from '@/api/knowledge'

defineProps<{
  ragContext: RagContext | null
  selectedSourceIndex: number
}>()

defineEmits<{
  copy: []
}>()
</script>

<style scoped>
.context-stats {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
  font-size: 13px;
  color: #666;
}

.context-text {
  background: #f5f7fa;
  padding: 12px;
  border-radius: 4px;
  margin-bottom: 16px;
}

.context-text pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13px;
  line-height: 1.6;
  max-height: 200px;
  overflow-y: auto;
}

.sources h4 {
  margin-bottom: 8px;
  font-size: 14px;
}

.source-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 4px;
  font-size: 13px;
  transition: background 0.2s;
}

.source-item.highlighted {
  background: #fef0f0;
}

.source-index {
  color: #909399;
}

.source-title {
  font-weight: 500;
}

.source-section {
  color: #666;
  font-size: 12px;
}
</style>