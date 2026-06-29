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
        <div class="step-summary">{{ step.summary }}</div>
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

interface StepItem {
  key: StepKey
  title: string
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
    return (Object.keys(STEP_TITLES) as StepKey[]).map((key) => ({
      key,
      title: STEP_TITLES[key],
      status: 'pending' as StepStatus,
      summary: '加载中',
    }))
  }
  return (Object.keys(STEP_TITLES) as StepKey[]).map((key) => {
    const status = props.status!.steps[key].status
    return {
      key,
      title: STEP_TITLES[key],
      status,
      summary: status === 'pending' ? statusLabel(status) : buildSummary(key, props.status!),
    }
  })
})
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
