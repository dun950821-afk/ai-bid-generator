<!-- frontend/src/views/knowledge/components/KnowledgeDocumentStatusTag.vue -->
<template>
  <el-tag :type="tagType" size="small">
    {{ statusText }}
  </el-tag>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { KnowledgeDocument } from '@/api/knowledge'

const props = defineProps<{
  document: KnowledgeDocument
}>()

const tagType = computed(() => {
  if (props.document.status === 'ready') return 'success'
  if (props.document.status === 'failed') return 'danger'
  if (props.document.status === 'processing') return 'warning'
  return 'info'
})

const statusText = computed(() => {
  if (props.document.status === 'processing') {
    if (props.document.parse_status === 'parsing') return '解析中'
    if (props.document.chunk_status === 'chunking') return '分块中'
    if (props.document.index_status === 'indexing') return '索引中'
  }
  return props.document.status_display
})
</script>