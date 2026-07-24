<!-- frontend/src/components/settings/HealthHeroBar.vue -->
<template>
  <div class="hero-bar">
    <div class="hero-topline">
      <div class="hero-title">系统设置</div>
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
              <el-icon v-if="item.status === 'ok'" color="#67C23A"><CircleCheckFilled /></el-icon>
              <el-icon v-else-if="item.status === 'warning'" color="#E6A23C"><WarningFilled /></el-icon>
              <el-icon v-else-if="item.status === 'error'" color="#F56C6C"><CircleCloseFilled /></el-icon>
              <el-icon v-else color="#909399"><QuestionFilled /></el-icon>
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
  gap: 12px;
}

.hero-topline {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.hero-title {
  font-size: 18px;
  font-weight: 600;
}

.hero-actions {
  display: flex;
  gap: 8px;
}

.badge-row {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;
}

.badge {
  display: flex;
  flex-direction: column;
  padding: 12px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.badge:hover {
  border-color: var(--el-color-primary);
  transform: translateY(-1px);
}

.badge-inner {
  display: flex;
  align-items: center;
  gap: 8px;
}

.badge-icon {
  font-size: 24px;
}

.badge-title {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.badge-label {
  font-size: 14px;
  font-weight: 600;
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
</style>
