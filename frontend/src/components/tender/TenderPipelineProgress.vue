<!-- frontend/src/components/tender/TenderPipelineProgress.vue -->
<!-- 招标文件解析流水线进度（解析→分块→抽取→完成） -->
<template>
  <div class="pipeline-progress" v-if="task">
    <div class="pipeline-header">
      <span class="pipeline-title">解析流水线</span>
      <el-tag :type="statusTag" size="small">{{ statusLabel }}</el-tag>
    </div>

    <!-- 步骤条 -->
    <div class="steps">
      <div
        v-for="(step, idx) in steps"
        :key="idx"
        :class="['step', step.state]"
      >
        <div class="step-icon">
          <el-icon v-if="step.state === 'done'" class="done-icon"><CircleCheckFilled /></el-icon>
          <el-icon v-else-if="step.state === 'active'" class="active-icon is-loading"><Loading /></el-icon>
          <el-icon v-else class="pending-icon"><MoreFilled /></el-icon>
        </div>
        <div class="step-label">{{ step.label }}</div>
        <div v-if="idx < steps.length - 1" class="step-connector" :class="step.state" />
      </div>
    </div>

    <!-- 总进度条 -->
    <el-progress
      :percentage="task.progress"
      :status="progressStatus"
      :stroke-width="8"
      class="total-progress"
    />
    <div class="current-step" v-if="task.current_step">{{ task.current_step }}</div>

    <div class="task-error" v-if="task.error_message">
      <el-alert type="error" :title="task.error_message" :closable="false" />
    </div>

    <div class="task-result" v-if="task.status === 'success' && task.result_payload">
      <el-alert type="success" :closable="false">
        <template #title>
          条款抽取完成，共 {{ task.result_payload.total_count || 0 }} 条条款
        </template>
      </el-alert>
    </div>

    <div class="task-actions" v-if="showActions">
      <el-button size="small" type="primary" @click="handleRefresh">刷新数据</el-button>
      <el-button size="small" @click="handleDismiss">关闭</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { CircleCheckFilled, Loading, MoreFilled } from '@element-plus/icons-vue'
import { getTask, type AsyncTask } from '@/api/task'

const props = defineProps<{
  taskId: number | null
  pollInterval?: number
}>()

const emit = defineEmits<{
  completed: [result: Record<string, unknown>]
  failed: [error: string]
  refresh: []
  dismiss: []
}>()

const task = ref<AsyncTask | null>(null)
let pollTimer: ReturnType<typeof setInterval> | null = null

type StepState = 'done' | 'active' | 'pending'

const steps = computed(() => {
  const p = task.value?.progress ?? 0
  const status = task.value?.status ?? 'pending'
  const failed = status === 'failed'

  // 三阶段阈值：解析 0-35，分块 35-65，抽取 65-100
  const parseState: StepState = failed && p < 35 ? 'active' : (p >= 35 ? 'done' : 'active')
  const chunkState: StepState = p < 35 ? 'pending' : (p >= 65 ? 'done' : 'active')
  const extractState: StepState = p < 65 ? 'pending' : (p >= 100 && status === 'success' ? 'done' : 'active')
  const finalState: StepState = status === 'success' ? 'done' : 'pending'

  return [
    { label: '文件解析', state: parseState },
    { label: '语义分块', state: chunkState },
    { label: '条款抽取', state: extractState },
    { label: '完成', state: finalState },
  ]
})

const statusLabel = computed(() => {
  const map: Record<string, string> = {
    pending: '等待中',
    running: '执行中',
    success: '成功',
    failed: '失败',
    cancelled: '已取消',
    retrying: '重试中',
  }
  return map[task.value?.status ?? 'pending'] || task.value?.status || ''
})

const statusTag = computed(() => {
  const map: Record<string, string> = {
    pending: 'info',
    running: 'primary',
    success: 'success',
    failed: 'danger',
    cancelled: 'warning',
    retrying: 'warning',
  }
  return map[task.value?.status ?? 'info'] || 'info'
})

const progressStatus = computed(() => {
  if (!task.value) return ''
  if (task.value.status === 'success') return 'success'
  if (task.value.status === 'failed') return 'exception'
  return ''
})

const showActions = computed(() => {
  if (!task.value) return false
  return ['success', 'failed', 'cancelled'].includes(task.value.status)
})

function startPolling() {
  if (!props.taskId) return
  stopPolling()
  fetchTask()
  pollTimer = setInterval(fetchTask, props.pollInterval || 2000)
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

async function fetchTask() {
  if (!props.taskId) return
  try {
    const res = await getTask(props.taskId)
    task.value = res.data
    if (!task.value) return
    if (['success', 'failed', 'cancelled'].includes(task.value.status)) {
      stopPolling()
      if (task.value.status === 'success') {
        emit('completed', task.value.result_payload || {})
      } else if (task.value.status === 'failed') {
        emit('failed', task.value.error_message || '任务失败')
      }
    }
  } catch (err) {
    console.error('Failed to fetch task:', err)
  }
}

function handleRefresh() {
  emit('refresh')
  emit('dismiss')
}

function handleDismiss() {
  emit('dismiss')
}

watch(() => props.taskId, (newId) => {
  if (newId) {
    startPolling()
  } else {
    stopPolling()
    task.value = null
  }
}, { immediate: true })

onUnmounted(stopPolling)
</script>

<style scoped>
.pipeline-progress {
  padding: 16px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
  margin-bottom: 16px;
}
.pipeline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.pipeline-title {
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.steps {
  display: flex;
  align-items: center;
  margin-bottom: 16px;
}
.step {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  position: relative;
}
.step-icon {
  font-size: 24px;
  margin-bottom: 6px;
}
.step-icon .done-icon {
  color: var(--el-color-success);
}
.step-icon .active-icon {
  color: var(--el-color-primary);
}
.step-icon .pending-icon {
  color: var(--el-text-color-disabled);
}
.step-label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.step.done .step-label {
  color: var(--el-color-success);
  font-weight: 500;
}
.step.active .step-label {
  color: var(--el-color-primary);
  font-weight: 500;
}
.step-connector {
  position: absolute;
  top: 12px;
  left: 50%;
  width: 100%;
  height: 2px;
  background: var(--el-border-color);
  z-index: -1;
}
.step-connector.done {
  background: var(--el-color-success);
}
.total-progress {
  margin-bottom: 8px;
}
.current-step {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.task-error,
.task-result {
  margin-top: 12px;
}
.task-actions {
  margin-top: 16px;
  display: flex;
  gap: 8px;
}
</style>
