<template>
  <div class="requirement-card" @click="$emit('view', requirement)">
    <div class="card-header">
      <span class="card-title" v-if="requirement.title">{{ requirement.title }}</span>
      <el-tag v-if="requirement.requirement_no" size="small" type="info">
        {{ requirement.requirement_no }}
      </el-tag>
    </div>
    <div class="card-content">{{ truncatedContent }}</div>
    <div class="card-footer">
      <div class="card-tags">
        <el-tag size="small" :type="mandatoryTag">{{ mandatoryLabel }}</el-tag>
        <el-tag size="small" :type="riskTag">{{ riskLabel }}</el-tag>
      </div>
      <div class="card-actions" v-if="canManage">
        <el-button size="small" link type="primary" @click.stop="$emit('edit', requirement)">
          编辑
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Requirement } from '@/api/requirements'

const props = defineProps<{
  requirement: Requirement
  canManage?: boolean
}>()

defineEmits<{
  view: [requirement: Requirement]
  edit: [requirement: Requirement]
}>()

// 内容摘要 - 有标题时显示150字，无标题时显示200字并突出重点
const truncatedContent = computed(() => {
  const maxLen = props.requirement.title ? 150 : 200
  return truncate(props.requirement.content, maxLen)
})

function truncate(text: string, length: number): string {
  if (!text) return ''
  return text.length > length ? text.slice(0, length) + '...' : text
}

// 强制程度
const mandatoryLabel = computed(() => {
  const map: Record<string, string> = {
    mandatory: '强制',
    important: '重要',
    optional: '可选',
    unknown: '未知',
  }
  return map[props.requirement.mandatory_level] || '未知'
})

const mandatoryTag = computed(() => {
  const map: Record<string, string> = {
    mandatory: 'danger',
    important: 'warning',
    optional: '',
    unknown: 'info',
  }
  return map[props.requirement.mandatory_level] || 'info'
})

// 风险等级
const riskLabel = computed(() => {
  const map: Record<string, string> = {
    high: '高风险',
    medium: '中风险',
    low: '低风险',
    unknown: '未知',
  }
  return map[props.requirement.risk_level] || '未知'
})

const riskTag = computed(() => {
  const map: Record<string, string> = {
    high: 'danger',
    medium: 'warning',
    low: 'success',
    unknown: 'info',
  }
  return map[props.requirement.risk_level] || 'info'
})
</script>

<style scoped>
.requirement-card {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s;
}

.requirement-card:hover {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
  gap: 8px;
}

.card-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  line-height: 1.4;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.card-content {
  font-size: 13px;
  color: var(--el-text-color-regular);
  line-height: 1.6;
  margin-bottom: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}

/* 无标题时内容更突出 */
.card-header:empty + .card-content,
.card-content:first-child {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  -webkit-line-clamp: 4;
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-tags {
  display: flex;
  gap: 8px;
}

.card-actions {
  display: flex;
  gap: 8px;
}
</style>