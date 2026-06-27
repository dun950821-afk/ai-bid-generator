<!-- frontend/src/components/outline/MatrixProgressDialog.vue -->
<template>
  <el-dialog
    v-model="visible"
    title="矩阵生成进度"
    width="500px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    @close="handleClose"
  >
    <div class="progress-content">
      <!-- 总体进度 -->
      <el-progress
        :percentage="overallPercentage"
        :status="progressStatus"
        :stroke-width="20"
      />

      <div class="progress-stats">
        <span>总计: {{ task.total_count }}</span>
        <span>成功: {{ task.success_count }}</span>
        <span>失败: {{ task.failed_count }}</span>
      </div>

      <!-- 当前处理章节 -->
      <div v-if="task.status === 'running'" class="current-section">
        <el-icon class="is-loading"><Loading /></el-icon>
        <span>正在处理: {{ task.current_section_title || '准备中...' }}</span>
      </div>

      <!-- 取消中 -->
      <div v-if="task.status === 'cancel_requested'" class="current-section">
        <el-icon class="is-loading"><Loading /></el-icon>
        <span>正在取消任务，等待当前章节处理结束...</span>
      </div>

      <!-- 状态消息 -->
      <el-alert
        v-if="task.status === 'failed'"
        type="error"
        :title="`生成失败: ${task.error_message}`"
        :closable="false"
        show-icon
      />

      <el-alert
        v-if="task.status === 'partial_success'"
        type="warning"
        :title="`部分成功: 成功 ${task.success_count}, 失败 ${task.failed_count}`"
        :closable="false"
        show-icon
      />

      <el-alert
        v-if="task.status === 'success'"
        type="success"
        title="矩阵生成完成"
        :closable="false"
        show-icon
      />

      <el-alert
        v-if="task.status === 'cancelled'"
        type="info"
        title="任务已取消"
        :closable="false"
        show-icon
      />
    </div>

    <template #footer>
      <el-button
        v-if="task.status === 'running'"
        type="danger"
        @click="handleCancel"
        :loading="canceling"
      >
        取消任务
      </el-button>
      <el-button
        v-if="['success', 'failed', 'partial_success', 'cancelled'].includes(task.status)"
        type="primary"
        @click="handleClose"
      >
        关闭
      </el-button>
      <el-button
        v-if="task.status === 'failed' || task.status === 'partial_success'"
        @click="handleRetry"
      >
        重试失败
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import {
  getGenerationTask,
  cancelGenerationTask,
  retryMatrixFailed,
  subscribeGenerationTaskProgress,
  type GenerationTask,
  type SSEGenerationTaskProgress,
} from '@/api/outline'

const props = defineProps<{
  taskId: number
  outlineId: number
}>()

const visible = defineModel<boolean>('visible')
const canceling = ref(false)

const emit = defineEmits<{
  completed: []
  close: []
}>()

const task = ref<GenerationTask>({
  id: 0,
  task_type: '',
  status: 'pending',
  total_count: 0,
  success_count: 0,
  failed_count: 0,
  skipped_count: 0,
  current_section_id: null,
  current_section_title: null,
  error_message: '',
  created_at: '',
  updated_at: '',
  finished_at: null,
  params: {},
  result: {},
})

let eventSource: EventSource | null = null

const overallPercentage = computed(() => {
  if (task.value.total_count === 0) return 0
  const completed = task.value.success_count + task.value.failed_count + task.value.skipped_count
  return Math.round((completed / task.value.total_count) * 100)
})

const progressStatus = computed(() => {
  if (task.value.status === 'success') return 'success'
  if (task.value.status === 'failed') return 'exception'
  return undefined
})

// 启动 SSE 监听
function startSSE() {
  if (eventSource) {
    eventSource.close()
  }

  eventSource = subscribeGenerationTaskProgress(props.taskId, {
    onMessage: (data: SSEGenerationTaskProgress) => {
      updateTaskFromSSE(data)
    },
    onDone: (data: SSEGenerationTaskProgress) => {
      updateTaskFromSSE(data)
      stopSSE()
      // 显示完成提示
      showCompletionMessage()
      emit('completed')
    },
    onError: (error: string) => {
      console.error('SSE 连接错误:', error)
      // SSE 失败时降级到轮询
      startPollingFallback()
    },
    onTimeout: () => {
      // 超时时降级到轮询
      startPollingFallback()
    },
  })
}

function updateTaskFromSSE(data: SSEGenerationTaskProgress) {
  task.value = {
    id: data.task_id,
    task_type: 'matrix_generation',
    status: data.status,
    total_count: data.total,
    success_count: data.success,
    failed_count: data.failed,
    skipped_count: data.skipped,
    current_section_id: data.current_section?.id || null,
    current_section_title: data.current_section?.title || null,
    error_message: data.error_message,
    created_at: '',
    updated_at: '',
    finished_at: data.finished_at || null,
    params: {},
    result: {},
  }
}

function stopSSE() {
  if (eventSource) {
    eventSource.close()
    eventSource = null
  }
}

// 轮询降级方案
let pollTimer: ReturnType<typeof setInterval> | null = null

async function pollTaskStatus() {
  try {
    const res = await getGenerationTask(props.taskId)
    task.value = res.data as GenerationTask

    // 如果任务完成，停止轮询并通知父组件
    if (['success', 'failed', 'partial_success', 'cancelled'].includes(task.value.status)) {
      stopPolling()
      stopSSE()
      // 显示完成提示
      showCompletionMessage()
      emit('completed')
    }
  } catch (err) {
    console.error('查询任务状态失败:', err)
  }
}

function startPollingFallback() {
  if (pollTimer) return
  pollTaskStatus()
  pollTimer = setInterval(pollTaskStatus, 3000)
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

// 显示完成提示
function showCompletionMessage() {
  if (task.value.status === 'success') {
    ElMessage.success(`矩阵生成完成，共 ${task.value.success_count} 个章节`)
  } else if (task.value.status === 'partial_success') {
    ElMessage.warning(`矩阵生成部分完成：成功 ${task.value.success_count}，失败 ${task.value.failed_count}`)
  } else if (task.value.status === 'failed') {
    ElMessage.error(`矩阵生成失败：${task.value.error_message || '未知错误'}`)
  } else if (task.value.status === 'cancelled') {
    ElMessage.info(`矩阵生成已取消：成功 ${task.value.success_count}，失败 ${task.value.failed_count}`)
  }
}

// 取消任务
async function handleCancel() {
  canceling.value = true
  try {
    const res = await cancelGenerationTask(props.taskId)
    if (res.data.success) {
      ElMessage.success('已请求取消任务，等待当前章节处理结束...')
      task.value.status = 'cancel_requested'
      // 不关闭订阅：后端会先把状态推到 cancel_requested，
      // Celery 主循环检测到后再改为 cancelled，届时 SSE/轮询会收到 done 事件
      if (!eventSource) {
        startPollingFallback()
      }
    } else {
      ElMessage.warning(res.data.message || '取消失败')
    }
  } catch (err) {
    console.error('取消任务失败:', err)
    ElMessage.error('取消失败')
  } finally {
    canceling.value = false
  }
}

// 重试失败
async function handleRetry() {
  try {
    const res = await retryMatrixFailed(props.outlineId)
    if (res.data.retry_count > 0) {
      ElMessage.success(`已提交重试，共 ${res.data.retry_count} 个章节`)
      visible.value = false
      emit('close')
    } else {
      ElMessage.info('没有需要重试的章节')
    }
  } catch (err) {
    console.error('重试失败:', err)
    ElMessage.error('重试提交失败')
  }
}

function handleClose() {
  stopSSE()
  stopPolling()
  visible.value = false
  emit('close')
}

// 监听对话框打开
watch(visible, (val) => {
  if (val && props.taskId) {
    task.value = {
      id: props.taskId,
      task_type: 'matrix_generation',
      status: 'pending',
      total_count: 0,
      success_count: 0,
      failed_count: 0,
      skipped_count: 0,
      current_section_id: null,
      current_section_title: null,
      error_message: '',
      created_at: '',
      updated_at: '',
      finished_at: null,
      params: {},
      result: {},
    }
    startSSE()
  } else {
    stopSSE()
    stopPolling()
  }
})

// 清理
onUnmounted(() => {
  stopSSE()
  stopPolling()
})
</script>

<style scoped>
.progress-content {
  padding: 20px 0;
}

.progress-stats {
  display: flex;
  justify-content: space-around;
  margin-top: 16px;
  font-size: 14px;
  color: #606266;
}

.current-section {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
  color: #409eff;
}

.is-loading {
  animation: rotate 1s linear infinite;
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>