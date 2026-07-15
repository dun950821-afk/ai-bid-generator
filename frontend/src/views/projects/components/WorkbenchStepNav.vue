<template>
  <div class="step-nav">
    <template v-for="(step, idx) in stepList" :key="step.key">
      <div
        class="step-item"
        :class="{
          'is-active': step.key === currentStep,
          'is-done': step.status === 'done',
          'is-doing': step.status === 'doing',
          'is-failed': step.status === 'failed',
        }"
        :style="step.key === currentStep ? { '--step-color': step.color } : {}"
        @click="$emit('select', step.key)"
      >
        <div class="step-icon">
          <el-icon v-if="step.status === 'done'"><Check /></el-icon>
          <el-icon v-else-if="step.status === 'failed'"><Close /></el-icon>
          <el-icon v-else :class="{ 'is-loading': step.status === 'doing' }"><component :is="step.icon" /></el-icon>
        </div>
        <div class="step-text">
          <div class="step-title">{{ step.label }}</div>
          <div class="step-summary">{{ step.summary }}</div>
        </div>
      </div>
      <div
        v-if="idx < stepList.length - 1"
        class="step-connector"
        :class="{ 'is-done': step.status === 'done' }"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Check, Close } from '@element-plus/icons-vue'
import type { WorkbenchStatus, StepKey, StepStatus } from '@/api/workbench'
import { STEP_THEME, STEP_ORDER } from './workbenchTheme'

const props = defineProps<{
  currentStep: StepKey
  status: WorkbenchStatus | null
}>()

defineEmits<{
  select: [step: StepKey]
}>()

interface StepItem {
  key: StepKey
  label: string
  icon: typeof STEP_THEME[StepKey]['icon']
  color: string
  status: StepStatus
  summary: string
}

function buildSummary(key: StepKey, s: WorkbenchStatus): string {
  switch (key) {
    case 'tender_file': {
      const n = s.steps.tender_file.file_count
      return n ? `${n} 个文件` : '暂无文件'
    }
    case 'file_parsing': {
      const st = s.steps.file_parsing.status
      if (st === 'doing') return '解析中...'
      if (st === 'failed') return '解析失败'
      if (st === 'done') return '解析完成'
      return '待解析'
    }
    case 'outline_generation': {
      const n = s.steps.outline_generation.outlines.length
      const doing = s.steps.outline_generation.tasks.length > 0
      if (doing) return `生成中 ${s.steps.outline_generation.tasks[0].progress}%`
      return n ? `${n} 个大纲` : '暂无大纲'
    }
    case 'content_editing': {
      const cur = s.steps.content_editing.current_outline_id
      return cur ? '有当前大纲' : '未选定大纲'
    }
    case 'export': {
      const n = s.steps.export.documents.length
      return n ? `${n} 个文档` : '暂无文档'
    }
  }
}

function statusLabel(status: StepStatus): string {
  const map: Record<StepStatus, string> = {
    pending: '待开始',
    doing: '进行中',
    done: '已完成',
    failed: '失败',
  }
  return map[status]
}

const stepList = computed<StepItem[]>(() => {
  if (!props.status) {
    return STEP_ORDER.map((key) => ({
      key,
      label: STEP_THEME[key].label,
      icon: STEP_THEME[key].icon,
      color: STEP_THEME[key].color,
      status: 'pending' as StepStatus,
      summary: '加载中',
    }))
  }
  return STEP_ORDER.map((key) => {
    const status = props.status!.steps[key].status
    return {
      key,
      label: STEP_THEME[key].label,
      icon: STEP_THEME[key].icon,
      color: STEP_THEME[key].color,
      status,
      summary: status === 'pending' ? statusLabel(status) : buildSummary(key, props.status!),
    }
  })
})
</script>

<style scoped>
.step-nav {
  display: flex;
  align-items: center;
  gap: 0;
  padding: 14px 20px;
  background: var(--el-fill-color-blank);
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  margin-bottom: 16px;
  overflow-x: auto;
}

.step-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
  border: 1px solid transparent;
}

.step-item:hover {
  background: var(--el-fill-color-light);
}

.step-item.is-active {
  border-color: var(--step-color, var(--el-color-primary));
  background: var(--el-fill-color-light);
}

.step-icon {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--el-fill-color);
  color: var(--el-text-color-secondary);
  font-size: 16px;
  flex-shrink: 0;
  transition: all 0.2s;
}

.step-item.is-active .step-icon {
  background: var(--step-color, var(--el-color-primary));
  color: #fff;
}

.step-item.is-done .step-icon {
  background: var(--el-color-success);
  color: #fff;
}

.step-item.is-doing .step-icon {
  background: var(--el-color-warning);
  color: #fff;
}

.step-item.is-failed .step-icon {
  background: var(--el-color-danger);
  color: #fff;
}

.step-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.step-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.step-item.is-active .step-title {
  color: var(--step-color, var(--el-color-primary));
  font-weight: 600;
}

.step-summary {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.step-connector {
  flex: 1;
  min-width: 24px;
  height: 1px;
  background: var(--el-border-color);
  margin: 0 4px;
}

.step-connector.is-done {
  background: var(--el-color-success);
}
</style>
