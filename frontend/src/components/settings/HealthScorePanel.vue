<!-- frontend/src/components/settings/HealthScorePanel.vue -->
<template>
  <div class="score-panel">
    <div class="score-header">
      <div class="score-heading">
        <span class="score-label">配置健康度评分</span>
        <div class="score-total">
          <span class="score-value">{{ status.total_score }}</span>
          <span class="score-max">/ {{ status.total_max }}</span>
        </div>
      </div>
      <el-tag v-if="status.pending_count > 0" type="warning" effect="light" round>
        {{ status.pending_count }} 项待修复
      </el-tag>
      <el-tag v-else type="success" effect="light" round>全部配置正常</el-tag>
    </div>
    <el-progress
      class="score-overall"
      :percentage="overallPercentage"
      :status="overallPercentage >= 80 ? 'success' : overallPercentage >= 50 ? 'warning' : 'exception'"
      :stroke-width="8"
      :show-text="false"
    />
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

const overallPercentage = computed(() =>
  props.status.total_max > 0
    ? Math.round((props.status.total_score / props.status.total_max) * 100)
    : 0
)

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
  padding: 18px 22px;
  background: var(--app-card, #fff);
  border: 1px solid var(--app-border, #e5e7eb);
  border-radius: var(--app-radius, 16px);
}

.score-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.score-heading {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.score-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--app-text-primary, #111827);
}

.score-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--app-text-primary, #111827);
}

.score-max {
  font-size: 13px;
  color: var(--app-text-secondary, #6b7280);
}

.score-overall {
  margin-bottom: 16px;
}

.score-items {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;
}

.score-item {
  cursor: pointer;
  padding: 10px 12px;
  border: 1px solid var(--app-border, #e5e7eb);
  border-radius: 10px;
  transition: border-color 0.18s, background 0.18s;
}

.score-item:hover {
  border-color: var(--app-primary, #2563eb);
  background: var(--app-bg, #f6f8fb);
}

.score-item-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 6px;
}

.score-item-title {
  font-size: 12px;
  color: var(--app-text-secondary, #6b7280);
}

.score-item-value {
  font-size: 12px;
  font-weight: 600;
  color: var(--app-text-primary, #111827);
}

.score-item-impact {
  margin-top: 6px;
  font-size: 11px;
  color: var(--app-text-secondary, #6b7280);
  line-height: 1.4;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

@media (max-width: 1200px) {
  .score-items {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 768px) {
  .score-items {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
