<!-- frontend/src/views/knowledge/components/KnowledgeChunkViewer.vue -->
<template>
  <el-dialog
    :model-value="modelValue"
    title="分块详情"
    width="700px"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <template v-if="chunk">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="标题">{{ chunk.title || '-' }}</el-descriptions-item>
        <el-descriptions-item label="类型">{{ chunk.chunk_type_display }}</el-descriptions-item>
        <el-descriptions-item label="章节路径" :span="2">{{ chunk.section_path || '-' }}</el-descriptions-item>
        <el-descriptions-item label="页码">
          {{ chunk.page_start ? `第 ${chunk.page_start} 页` : '-' }}
          <template v-if="chunk.page_end && chunk.page_end !== chunk.page_start">
            - 第 {{ chunk.page_end }} 页
          </template>
        </el-descriptions-item>
        <el-descriptions-item label="Token">{{ chunk.token_count }}</el-descriptions-item>
      </el-descriptions>

      <div class="chunk-content">
        <h4>内容</h4>
        <pre>{{ chunk.content }}</pre>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import type { KnowledgeChunk } from '@/api/knowledge'

defineProps<{
  modelValue: boolean
  chunk: KnowledgeChunk | null
}>()

defineEmits<{
  'update:modelValue': [value: boolean]
}>()
</script>

<style scoped>
.chunk-content {
  margin-top: 16px;
}

.chunk-content h4 {
  margin-bottom: 8px;
}

.chunk-content pre {
  background: #f5f7fa;
  padding: 12px;
  border-radius: 4px;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 400px;
  overflow-y: auto;
}
</style>