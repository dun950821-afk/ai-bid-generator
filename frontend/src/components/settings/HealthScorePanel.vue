<!-- frontend/src/components/settings/HealthScorePanel.vue -->
<template>
  <div class="score-panel">
    <div class="score-header">
      <span class="score-label">配置健康度评分</span>
      <span class="score-value">{{ status.total_score }}/{{ status.total_max }}</span>
      <el-tag v-if="status.pending_count > 0" type="warning" size="small">
        {{ status.pending_count }} 项待修复
      </el-tag>
    </div>
    <div class="score-items">
      <div
        v-for="item in scoreItems"
        :key="item.key"
        data-testid="score-item"
        class="score-item"
        @click="emit('navigate', item.tab)"
      >
        <div class="score-item-header">
          <span class="score-item-title">{{ item.title }}</span>
          <span class="score-item-value">{{ item.score }}/{{ item.score_max }}</span>
        </div>
        <el-progress
          :percentage="item.percentage"
          :status="item.status === 'ok' ? 'success' : item.status === 'warning' ? 'warning' : item.status === 'error' ? 'exception' : undefined"
          :show-text="false"
          :stroke-width="8"
        />
        <div class="score-item-impact">{{ item.impact_hint }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { HealthStatusResponse } from '@/api/settings'

const props = defineProps<{
  status: HealthStatusResponse
}>()

const emit = defineEmits<{
  navigate: [tab: string]
}>()

const scoreItems = computed(() => {
  const items = [
    { key: 'chat_model', title: 'Chat 模型', tab: 'llm', ...props.status.chat_model },
    { key: 'embedding_model', title: 'Embedding 模型', tab: 'knowledge', ...props.status.embedding_model },
    { key: 'rag_search', title: '向量检索', tab: 'knowledge', ...props.status.rag_search },
    { key: 'file_storage', title: '文件存储', tab: 'storage', ...props.status.file_storage },
    { key: 'security_audit', title: '安全审计', tab: 'security', ...props.status.security_audit },
  ]
  return items.map(item => ({
    ...item,
    percentage: item.score_max > 0 ? Math.round((item.score / item.score_max) * 100) : 0,
  }))
})
</script>

<style scoped>
.score-panel {
  padding: 16px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  background: var(--el-fill-color-blank);
}

.score-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.score-label {
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.score-value {
  font-size: 20px;
  font-weight: 600;
}

.score-items {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;
}

.score-item {
  cursor: pointer;
  padding: 8px;
  border-radius: 4px;
  transition: background 0.2s;
}

.score-item:hover {
  background: var(--el-fill-color-light);
}

.score-item-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
}

.score-item-title {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.score-item-value {
  font-size: 12px;
  font-weight: 600;
}

.score-item-impact {
  margin-top: 4px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  line-height: 1.4;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
</style>
