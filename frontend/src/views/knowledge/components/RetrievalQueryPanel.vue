<!-- frontend/src/views/knowledge/components/RetrievalQueryPanel.vue -->
<template>
  <el-card shadow="never">
    <template #header>查询输入</template>

    <el-input
      :model-value="query"
      type="textarea"
      :rows="4"
      placeholder="请输入查询内容..."
      @update:model-value="$emit('update:query', $event)"
    />

    <div class="options">
      <span>Top K:</span>
      <el-input-number v-model="localTopK" :min="1" :max="50" size="small" />
    </div>

    <el-button
      type="primary"
      :loading="loading"
      style="width: 100%; margin-top: 16px"
      @click="$emit('search')"
    >
      执行检索
    </el-button>
  </el-card>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  query: string
  topK: number
  knowledgeBaseId: number
  loading: boolean
}>()

const emit = defineEmits<{
  'update:query': [value: string]
  'update:topK': [value: number]
  search: []
}>()

const localTopK = ref(props.topK)

watch(localTopK, (val) => {
  emit('update:topK', val)
})
</script>

<style scoped>
.options {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}
</style>