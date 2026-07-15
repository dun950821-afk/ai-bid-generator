<!-- frontend/src/views/knowledge/components/RetrievalQueryPanel.vue -->
<template>
  <el-card shadow="never">
    <template #header>查询输入</template>

    <el-input
      :model-value="query"
      type="textarea"
      :rows="4"
      placeholder="请输入查询内容...（Ctrl+Enter 检索）"
      @update:model-value="$emit('update:query', $event)"
      @keydown.ctrl.enter.prevent="$emit('search')"
      @keydown.meta.enter.prevent="$emit('search')"
    />

    <div class="options">
      <div class="option-row">
        <span class="option-label">Top K:</span>
        <el-input-number v-model="localTopK" :min="1" :max="50" size="small" />
      </div>

      <div class="option-row">
        <span class="option-label">检索模式:</span>
        <el-select v-model="localMode" size="small" style="width: 160px">
          <el-option
            v-for="opt in RETRIEVAL_MODE_OPTIONS"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          >
            <span>{{ opt.label }}</span>
            <span class="option-desc">{{ opt.desc }}</span>
          </el-option>
        </el-select>
      </div>
    </div>

    <el-button
      type="primary"
      :loading="loading"
      :disabled="!query.trim()"
      style="width: 100%; margin-top: 16px"
      @click="$emit('search')"
    >
      执行检索
    </el-button>

    <div v-if="history.length > 0" class="history">
      <div class="history-title">最近查询</div>
      <div
        v-for="(item, idx) in history"
        :key="idx"
        class="history-item"
        @click="$emit('use-history', item)"
      >
        <span class="history-text">{{ item.query }}</span>
        <span class="history-meta">{{ item.mode }} · {{ item.latencyMs }}ms · {{ item.resultCount }}条</span>
      </div>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { RETRIEVAL_MODE_OPTIONS, type RetrievalMode } from '@/api/knowledge'

export interface RetrievalHistoryItem {
  query: string
  mode: string
  latencyMs: number
  resultCount: number
}

const props = defineProps<{
  query: string
  topK: number
  retrievalMode: RetrievalMode
  knowledgeBaseId: number
  loading: boolean
  history: RetrievalHistoryItem[]
}>()

const emit = defineEmits<{
  'update:query': [value: string]
  'update:topK': [value: number]
  'update:retrievalMode': [value: RetrievalMode]
  search: []
  'use-history': [item: RetrievalHistoryItem]
}>()

const localTopK = ref(props.topK)
const localMode = ref<RetrievalMode>(props.retrievalMode)

watch(localTopK, (val) => emit('update:topK', val))
watch(localMode, (val) => emit('update:retrievalMode', val))

watch(
  () => props.retrievalMode,
  (val) => {
    localMode.value = val
  }
)
</script>

<style scoped>
.options {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.option-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.option-label {
  width: 70px;
  font-size: 13px;
  color: #606266;
}

.option-desc {
  font-size: 11px;
  color: #909399;
  margin-left: 8px;
  float: right;
}

.history {
  margin-top: 16px;
  border-top: 1px dashed #ebeef5;
  padding-top: 12px;
}

.history-title {
  font-size: 12px;
  color: #909399;
  margin-bottom: 8px;
}

.history-item {
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s;
}

.history-item:hover {
  background: #f5f7fa;
}

.history-text {
  display: block;
  font-size: 13px;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-meta {
  display: block;
  font-size: 11px;
  color: #909399;
  margin-top: 2px;
}
</style>
