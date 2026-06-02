<!-- frontend/src/views/knowledge/components/ChunkTab.vue -->
<template>
  <div class="chunk-tab">
    <KnowledgeChunkTable :knowledge-base-id="knowledgeBaseId" :refresh-key="refreshKey" />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  knowledgeBaseId: number
  refreshKey?: number
}>()
</script>

<style scoped>
.chunk-tab {
  padding: 0;
}
</style>
