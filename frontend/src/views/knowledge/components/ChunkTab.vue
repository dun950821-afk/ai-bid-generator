<!-- frontend/src/views/knowledge/components/ChunkTab.vue -->
<template>
  <div class="chunk-tab">
    <KnowledgeChunkTable :knowledge-base-id="knowledgeBaseId" />
  </div>
</template>

<script setup lang="ts">
import KnowledgeChunkTable from './KnowledgeChunkTable.vue'

defineProps<{
  knowledgeBaseId: number
}>()
</script>