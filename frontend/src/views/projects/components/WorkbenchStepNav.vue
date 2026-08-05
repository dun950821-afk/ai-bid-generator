<template>
  <div class="stepper-container">
    <div class="stepper">
      <template v-for="(step, idx) in stepList" :key="step.key">
        <div
          class="step"
          :class="{
            'is-active': step.key === currentStep,
            'is-done': step.status === 'done',
            'is-doing': step.status === 'doing',
            'is-failed': step.status === 'failed',
          }"
          @click="$emit('select', step.key)"
        >
          <div class="step-header">
            <div class="step-circle">
              <el-icon v-if="step.status === 'done'" :size="14"><Check /></el-icon>
              <el-icon v-else-if="step.status === 'failed'" :size="14"><Close /></el-icon>
              <el-icon v-else-if="step.status === 'doing'" class="is-loading" :size="14"><Loading /></el-icon>
              <span v-else class="step-num">{{ idx + 1 }}</span>
            </div>
            <div class="step-title">{{ step.label }}</div>
          </div>
          <div class="step-desc">{{ step.summary }}</div>
        </div>
        <div
          v-if="idx < stepList.length - 1"
          class="step-connector"
          :class="{ 'is-done': step.status === 'done' }"
        />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Check, Close, Loading } from '@element-plus/icons-vue'
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

const stepList = computed<StepItem[]>(() => {
  if (!props.status) {
    return STEP_ORDER.map((key) => ({
      key,
      label: STEP_THEME[key].label,
      status: 'pending' as StepStatus,
      summary: '加载中',
    }))
  }
  return STEP_ORDER.map((key) => {
    const status = props.status!.steps[key].status
    return {
      key,
      label: STEP_THEME[key].label,
      status,
      summary: status === 'pending' ? '待开始' : buildSummary(key, props.status!),
    }
  })
})
</script>

<style scoped>
.stepper-container {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  overflow-x: auto;
}

.stepper {
  display: flex;
  align-items: center;
  padding: 20px 24px;
  min-width: min-content;
}

.step {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 140px;
  cursor: pointer;
  padding: 8px 12px;
  margin: -8px -4px;
  border-radius: 6px;
  transition: background 0.15s ease;
}

.step:hover {
  background: var(--el-fill-color-light);
}

.step.is-active {
  background: var(--el-color-primary-light-9);
}

.step-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.step-circle {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  border: 2px solid var(--el-border-color);
  background: var(--el-bg-color);
  color: var(--el-text-color-secondary);
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.step.is-active .step-circle {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary);
  color: #fff;
  box-shadow: 0 0 0 3px var(--el-color-primary-light-8);
}

.step.is-done .step-circle {
  border-color: var(--el-color-success);
  background: var(--el-color-success);
  color: #fff;
}

.step.is-doing .step-circle {
  border-color: var(--el-color-warning);
  background: var(--el-color-warning);
  color: #fff;
}

.step.is-failed .step-circle {
  border-color: var(--el-color-danger);
  background: var(--el-color-danger);
  color: #fff;
}

.step-num {
  font-size: 13px;
  font-weight: 600;
}

.step-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  white-space: nowrap;
}

.step.is-active .step-title {
  color: var(--el-color-primary);
}

.step-desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  padding-left: 38px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.step-connector {
  width: 40px;
  height: 2px;
  background: var(--el-border-color);
  margin: 0 4px;
  flex-shrink: 0;
  align-self: flex-start;
  margin-top: 20px;
}

.step-connector.is-done {
  background: var(--el-color-success);
}
</style>
