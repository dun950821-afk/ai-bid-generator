<template>
  <div class="task-progress" v-if="task">
    <div class="task-header">
      <span class="task-type">{{ taskTypeLabel }}</span>
      <el-tag :type="statusTag" size="small">{{ statusLabel }}</el-tag>
    </div>
    <el-progress
      :percentage="task.progress"
      :status="progressStatus"
      :stroke-width="10"
    />
    <div class="task-step" v-if="task.current_step">
      {{ task.current_step }}
    </div>
    <div class="task-error" v-if="task.error_message">
      <el-alert type="error" :title="task.error_message" :closable="false" />
    </div>
    <div class="task-result" v-if="task.status === 'success' && task.result_payload">
      <el-alert type="success" :closable="false">
        <template #title>
          抽取完成，共 {{ task.result_payload.total_count || 0 }} 条条款
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
import { getTask, type AsyncTask } from '@/api/task'

const TASK_TYPE_LABELS: Record<string, string> = {
  file_parse: '文件解析',
  file_chunk: '语义分块',
  requirement_extraction: '条款抽取',
  requirement_extraction_v2: '条款抽取',
  requirement_dedup: '条款去重',
  outline_generation: '大纲生成',
  section_writing: '章节撰写',
  tender_pipeline: '解析流水线',
  tender_parse: '解析流水线',
  generate_outline: '大纲生成',
}

const STATUS_LABELS: Record<string, string> = {
  pending: '排队中',
  running: '执行中',
  success: '成功',
  failed: '失败',
  cancelled: '已取消',
  retrying: '重试中',
}

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

const taskTypeLabel = computed(() => {
  if (!task.value) return ''
  return TASK_TYPE_LABELS[task.value.task_type] || task.value.task_type
})

const statusLabel = computed(() => {
  if (!task.value) return ''
  return STATUS_LABELS[task.value.status] || task.value.status
})

const statusTag = computed(() => {
  if (!task.value) return 'info'
  const map: Record<string, string> = {
    pending: 'info',
    running: 'primary',
    success: 'success',
    failed: 'danger',
    cancelled: 'warning',
    retrying: 'warning',
  }
  return map[task.value.status] || 'info'
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

    // 任务完成时停止轮询
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
    // 轮询异常不中断，继续尝试
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
.task-progress {
  padding: 16px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
  margin-bottom: 16px;
}

.task-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.task-type {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.task-step {
  margin-top: 8px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.task-error {
  margin-top: 12px;
}

.task-result {
  margin-top: 12px;
}

.task-actions {
  margin-top: 16px;
  display: flex;
  gap: 8px;
}
</style>