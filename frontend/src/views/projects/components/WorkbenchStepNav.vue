<template>
  <div class="workbench-step-nav">
    <div
      v-for="(step, idx) in stepList"
      :key="step.key"
      class="step-item"
      :class="{
        'is-active': step.key === currentStep,
        'is-done': step.status === 'done',
        'is-doing': step.status === 'doing',
        'is-failed': step.status === 'failed',
      }"
      @click="$emit('select', step.key)"
    >
      <div class="step-index">
        <el-icon v-if="step.status === 'done'"><Check /></el-icon>
        <el-icon v-else-if="step.status === 'doing'" class="is-loading"><Loading /></el-icon>
        <el-icon v-else-if="step.status === 'failed'"><Close /></el-icon>
        <span v-else>{{ idx + 1 }}</span>
      </div>
      <div class="step-label">
        <div class="step-title">{{ step.title }}</div>
        <div class="step-status">{{ getStatusLabel(step.status) }}</div>
      </div>
      <el-icon v-if="idx < stepList.length - 1" class="step-arrow"><ArrowRight /></el-icon>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Check, Close, Loading, ArrowRight } from '@element-plus/icons-vue'
import type { WorkbenchStatus, StepKey, StepStatus } from '@/api/workbench'

const props = defineProps<{
  currentStep: StepKey
  status: WorkbenchStatus | null
}>()

defineEmits<{
  select: [step: StepKey]
}>()

const STEP_TITLES: Record<StepKey, string> = {
  tender_file: '招标文件',
  file_parsing: '文件解析',
  outline_generation: '大纲生成',
  content_editing: '内容编辑',
  export: '导出',
}

const stepList = computed(() => {
  if (!props.status) {
    return (Object.keys(STEP_TITLES) as StepKey[]).map((key) => ({
      key,
      title: STEP_TITLES[key],
      status: 'pending' as StepStatus,
    }))
  }
  return (Object.keys(STEP_TITLES) as StepKey[]).map((key) => ({
    key,
    title: STEP_TITLES[key],
    status: props.status!.steps[key].status,
  }))
})

function getStatusLabel(status: StepStatus): string {
  const map: Record<StepStatus, string> = {
    pending: '待开始',
    doing: '进行中',
    done: '已完成',
    failed: '失败',
  }
  return map[status]
}
</script>

<style scoped>
.workbench-step-nav {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 16px 24px;
  background: var(--el-fill-color-blank);
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  margin-bottom: 16px;
  overflow-x: auto;
}

.step-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;
  white-space: nowrap;
}

.step-item:hover {
  background: var(--el-fill-color-light);
}

.step-item.is-active {
  background: var(--el-color-primary-light-9);
}

.step-index {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--el-fill-color);
  color: var(--el-text-color-secondary);
  font-size: 14px;
  flex-shrink: 0;
}

.step-item.is-done .step-index {
  background: var(--el-color-success);
  color: #fff;
}

.step-item.is-doing .step-index {
  background: var(--el-color-warning);
  color: #fff;
}

.step-item.is-failed .step-index {
  background: var(--el-color-danger);
  color: #fff;
}

.step-label {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.step-title {
  font-size: 14px;
  font-weight: 500;
}

.step-status {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.step-arrow {
  color: var(--el-text-color-placeholder);
  margin-left: 4px;
}
</style>
