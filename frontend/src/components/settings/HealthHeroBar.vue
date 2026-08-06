<!-- frontend/src/components/settings/HealthHeroBar.vue -->
<template>
  <div class="hero-bar">
    <div class="hero-topline">
      <div class="hero-heading">
        <div class="hero-title">系统设置</div>
        <div class="hero-subtitle">模型、知识库、存储与安全审计的集中配置与健康状况</div>
      </div>
      <div class="hero-actions">
        <el-button type="primary" plain size="small" data-testid="wizard-btn" @click="emit('wizard')">
          <el-icon><MagicStick /></el-icon>
          <span>配置向导</span>
        </el-button>
        <el-button size="small" data-testid="refresh-btn" :loading="loading" @click="emit('refresh')">
          <el-icon><Refresh /></el-icon>
          <span>刷新</span>
        </el-button>
        <el-button size="small" data-testid="diagnose-btn" :loading="diagnoseLoading" @click="emit('diagnose')">
          <el-icon><Monitor /></el-icon>
          <span>一键诊断</span>
        </el-button>
      </div>
    </div>

    <el-alert
      v-if="status.mock_warning?.show"
      data-testid="mock-warning-banner"
      :title="status.mock_warning.message"
      type="error"
      :closable="false"
      show-icon
    />

    <div class="badge-row">
      <div
        v-for="item in badges"
        :key="item.key"
        data-testid="status-badge"
        class="badge"
        :class="`is-${item.status}`"
        @click="emit('navigate', item.tab)"
      >
        <el-tooltip placement="bottom" :show-after="300">
          <template #content>
            <div class="tooltip-content">
              <div>{{ item.label }}</div>
              <div v-if="item.sublabel" class="tooltip-sub">{{ item.sublabel }}</div>
              <div class="tooltip-impact">未配置影响：{{ item.impact_hint }}</div>
            </div>
          </template>
          <div class="badge-inner">
            <div class="badge-icon">
              <el-icon v-if="item.status === 'ok'" color="#10b981"><CircleCheckFilled /></el-icon>
              <el-icon v-else-if="item.status === 'warning'" color="#f59e0b"><WarningFilled /></el-icon>
              <el-icon v-else-if="item.status === 'error'" color="#ef4444"><CircleCloseFilled /></el-icon>
              <el-icon v-else color="#94a3b8"><QuestionFilled /></el-icon>
            </div>
            <div class="badge-text">
              <div class="badge-title">{{ item.title }}</div>
              <div class="badge-label">{{ item.label }}</div>
            </div>
          </div>
        </el-tooltip>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  Refresh,
  Monitor,
  MagicStick,
  CircleCheckFilled,
  CircleCloseFilled,
  WarningFilled,
  QuestionFilled,
} from '@element-plus/icons-vue'
import type { HealthStatusResponse } from '@/api/settings'

const props = defineProps<{
  status: HealthStatusResponse
  loading?: boolean
  diagnoseLoading?: boolean
}>()

const emit = defineEmits<{
  refresh: []
  diagnose: []
  wizard: []
  navigate: [tab: string]
}>()

const badges = computed(() => [
  { key: 'chat_model', title: 'Chat 模型', tab: 'llm', ...props.status.chat_model },
  { key: 'embedding_model', title: 'Embedding 模型', tab: 'knowledge', ...props.status.embedding_model },
  { key: 'rag_search', title: '向量检索', tab: 'knowledge', ...props.status.rag_search },
  { key: 'file_storage', title: '文件存储', tab: 'storage', ...props.status.file_storage },
  { key: 'security_audit', title: '安全审计', tab: 'security', ...props.status.security_audit },
])
</script>

<style scoped>
.hero-bar {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 18px 22px;
  background: var(--app-card, #fff);
  border: 1px solid var(--app-border, #e5e7eb);
  border-radius: var(--app-radius, 16px);
}

.hero-topline {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.hero-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--app-text-primary, #111827);
}

.hero-subtitle {
  font-size: 13px;
  color: var(--app-text-secondary, #6b7280);
  margin-top: 4px;
}

.hero-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.badge-row {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;
}

.badge {
  display: flex;
  flex-direction: column;
  padding: 12px 14px;
  border: 1px solid var(--app-border, #e5e7eb);
  border-radius: 12px;
  cursor: pointer;
  transition: transform 0.18s, box-shadow 0.18s, border-color 0.18s;
}

.badge:hover {
  transform: translateY(-2px);
  box-shadow: var(--app-shadow, 0 16px 40px rgba(15, 23, 42, 0.08));
}

.badge.is-ok {
  background: #ecfdf5;
  border-color: #a7f3d0;
}

.badge.is-ok:hover {
  border-color: #10b981;
}

.badge.is-warning {
  background: #fffbeb;
  border-color: #fde68a;
}

.badge.is-warning:hover {
  border-color: #f59e0b;
}

.badge.is-error {
  background: #fef2f2;
  border-color: #fecaca;
}

.badge.is-error:hover {
  border-color: #ef4444;
}

.badge-inner {
  display: flex;
  align-items: center;
  gap: 10px;
}

.badge-icon {
  font-size: 24px;
  flex-shrink: 0;
  display: flex;
}

.badge-text {
  min-width: 0;
}

.badge-title {
  font-size: 12px;
  color: var(--app-text-secondary, #6b7280);
}

.badge-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--app-text-primary, #111827);
  margin-top: 2px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.tooltip-content {
  max-width: 280px;
}

.tooltip-sub {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin-top: 4px;
}

.tooltip-impact {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.2);
}

@media (max-width: 1200px) {
  .badge-row {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 768px) {
  .badge-row {
    grid-template-columns: repeat(2, 1fr);
  }
  .hero-topline {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
