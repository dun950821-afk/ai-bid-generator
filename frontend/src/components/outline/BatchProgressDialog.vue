<!-- frontend/src/components/outline/BatchProgressDialog.vue -->
<template>
  <el-dialog
    v-model="visible"
    title="批量生成进度"
    width="600px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    @close="handleClose"
  >
    <div class="progress-content">
      <!-- 总体进度 -->
      <el-progress
        :percentage="progress.progress_percent"
        :status="progressStatus"
        :stroke-width="20"
      />

      <div class="progress-stats">
        <span>总计: {{ progress.total }}</span>
        <span class="success">成功: {{ progress.success }}</span>
        <span class="failed">失败: {{ progress.failed }}</span>
        <span class="skipped">跳过: {{ progress.skipped }}</span>
        <span v-if="progress.cancelled > 0" class="cancelled">取消: {{ progress.cancelled }}</span>
      </div>

      <!-- 当前处理章节 -->
      <div v-if="progress.status === 'running'" class="current-section">
        <el-icon class="is-loading"><Loading /></el-icon>
        <span>正在生成: {{ progress.current_section?.title || '准备中...' }}</span>
      </div>

      <!-- 暂停状态 -->
      <div v-if="progress.status === 'pause_requested'" class="current-section">
        <el-icon class="is-loading"><Loading /></el-icon>
        <span>正在暂停...（等待当前章节完成）</span>
      </div>

      <div v-if="progress.status === 'paused'" class="paused-info">
        <el-icon><VideoPause /></el-icon>
        <span>任务已暂停，已完成 {{ progress.success }}/{{ progress.total }} 个章节</span>
      </div>

      <!-- 状态消息 -->
      <el-alert
        v-if="progress.status === 'failed'"
        type="error"
        :title="`生成失败: ${progress.error_message}`"
        :closable="false"
        show-icon
      />

      <el-alert
        v-if="progress.status === 'partial_success'"
        type="warning"
        :title="`部分成功: 成功 ${progress.success}, 失败 ${progress.failed}`"
        :closable="false"
        show-icon
      />

      <el-alert
        v-if="progress.status === 'completed'"
        type="success"
        :title="`批量生成完成，共成功 ${progress.success} 个章节`"
        :closable="false"
        show-icon
      />

      <el-alert
        v-if="progress.status === 'cancelled'"
        type="info"
        title="任务已取消"
        :closable="false"
        show-icon
      />

      <!-- 章节列表 -->
      <div class="section-list">
        <el-collapse>
          <el-collapse-item title="查看章节详情">
            <div
              v-for="section in progress.sections"
              :key="section.id"
              class="section-item"
            >
              <span class="section-title">{{ section.title }}</span>
              <el-tag
                :type="getSectionTagType(section.status)"
                size="small"
              >
                {{ getSectionStatusText(section.status) }}
              </el-tag>
              <span v-if="section.word_count > 0" class="word-count">
                {{ section.word_count }} 字
              </span>
              <span v-if="section.error" class="error-text">
                {{ section.error }}
              </span>
            </div>
          </el-collapse-item>
        </el-collapse>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <!-- 运行中：暂停 + 取消 -->
        <el-button
          v-if="progress.status === 'running'"
          type="warning"
          @click="handlePause"
          :loading="pausing"
        >
          暂停任务
        </el-button>
        <el-button
          v-if="progress.status === 'running'"
          type="danger"
          @click="handleCancel"
          :loading="canceling"
        >
          取消任务
        </el-button>

        <!-- 已暂停：恢复 + 取消 -->
        <el-button
          v-if="progress.status === 'paused'"
          type="primary"
          @click="handleResume"
          :loading="resuming"
        >
          继续生成
        </el-button>
        <el-button
          v-if="progress.status === 'paused'"
          type="danger"
          @click="handleCancel"
          :loading="canceling"
        >
          取消任务
        </el-button>

        <!-- 完成/失败/取消：关闭 + 重试 -->
        <el-button
          v-if="['completed', 'failed', 'partial_success', 'cancelled'].includes(progress.status)"
          type="primary"
          @click="handleClose"
        >
          关闭
        </el-button>
        <el-button
          v-if="progress.status === 'failed' || progress.status === 'partial_success'"
          type="success"
          @click="handleRetryFailed"
          :loading="retrying"
        >
          重试失败章节
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Loading, VideoPause } from '@element-plus/icons-vue'
import {
  getBatchGenerateProgress,
  pauseGenerationTask,
  resumeGenerationTask,
  cancelGenerationTask,
  retryFailedSections,
  subscribeGenerationTaskProgress,
  type BatchGenerationProgress,
  type SSEGenerationTaskProgress,
} from '@/api/outline'

const props = defineProps<{
  taskId: number
}>()

const visible = defineModel<boolean>('visible')
const pausing = ref(false)
const resuming = ref(false)
const canceling = ref(false)
const retrying = ref(false)

const emit = defineEmits<{
  completed: []
  close: []
  retry: [taskId: number]
}>()

const progress = ref<BatchGenerationProgress>({
  task_id: 0,
  status: 'pending',
  total: 0,
  success: 0,
  failed: 0,
  skipped: 0,
  running: 0,
  pending: 0,
  cancelled: 0,
  progress_percent: 0,
  current_section: null,
  sections: [],
  error_message: '',
  started_at: null,
  finished_at: null,
  paused_at_index: 0,
})

let eventSource: EventSource | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null

const progressStatus = computed(() => {
  if (progress.value.status === 'completed') return 'success'
  if (progress.value.status === 'failed') return 'exception'
  return undefined
})

function getSectionTagType(status: string) {
  switch (status) {
    case 'success': return 'success'
    case 'failed': return 'danger'
    case 'running': return 'warning'
    case 'skipped': return 'info'
    case 'cancelled': return 'info'
    default: return ''
  }
}

function getSectionStatusText(status: string) {
  switch (status) {
    case 'pending': return '待生成'
    case 'running': return '生成中'
    case 'success': return '成功'
    case 'failed': return '失败'
    case 'skipped': return '跳过'
    case 'cancelled': return '取消'
    default: return status
  }
}

// SSE 监听
function startSSE() {
  if (eventSource) {
    eventSource.close()
  }

  eventSource = subscribeGenerationTaskProgress(props.taskId, {
    onMessage: (data: SSEGenerationTaskProgress) => {
      updateProgressFromSSE(data)
    },
    onDone: (data: SSEGenerationTaskProgress) => {
      updateProgressFromSSE(data)
      stopSSE()
      showCompletionMessage()
      emit('completed')
    },
    onError: () => {
      startPollingFallback()
    },
    onTimeout: () => {
      startPollingFallback()
    },
  })
}

function updateProgressFromSSE(data: SSEGenerationTaskProgress) {
  progress.value = {
    ...progress.value,
    task_id: data.task_id,
    status: data.status,
    total: data.total,
    success: data.success,
    failed: data.failed,
    skipped: data.skipped,
    running: data.running,
    pending: data.pending,
    cancelled: progress.value.cancelled,
    progress_percent: data.progress_percent,
    current_section: data.current_section,
    error_message: data.error_message,
    finished_at: data.finished_at,
  }
}

function stopSSE() {
  if (eventSource) {
    eventSource.close()
    eventSource = null
  }
}

// 轮询降级
async function pollTaskStatus() {
  try {
    const res = await getBatchGenerateProgress(props.taskId)
    progress.value = res.data

    if (['completed', 'failed', 'partial_success', 'cancelled'].includes(progress.value.status)) {
      stopPolling()
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
  pollTimer = setInterval(pollTaskStatus, 2000)
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function showCompletionMessage() {
  if (progress.value.status === 'completed') {
    ElMessage.success(`批量生成完成，共 ${progress.value.success} 个章节`)
  } else if (progress.value.status === 'partial_success') {
    ElMessage.warning(`部分完成：成功 ${progress.value.success}，失败 ${progress.value.failed}`)
  } else if (progress.value.status === 'failed') {
    ElMessage.error(`批量生成失败：${progress.value.error_message || '未知错误'}`)
  } else if (progress.value.status === 'cancelled') {
    ElMessage.info('任务已取消')
  }
}

// 暂停
async function handlePause() {
  pausing.value = true
  try {
    const res = await pauseGenerationTask(props.taskId)
    if (res.data.success) {
      ElMessage.success('已请求暂停')
      progress.value.status = 'pause_requested'
    } else {
      ElMessage.error(res.data.message)
    }
  } catch (err) {
    console.error('暂停失败:', err)
    ElMessage.error('暂停请求失败')
  } finally {
    pausing.value = false
  }
}

// 恢复
async function handleResume() {
  resuming.value = true
  try {
    const res = await resumeGenerationTask(props.taskId)
    if (res.data.success) {
      ElMessage.success('任务已恢复')
      progress.value.status = 'running'
      // 重新启动 SSE
      startSSE()
    } else {
      ElMessage.error(res.data.message)
    }
  } catch (err) {
    console.error('恢复失败:', err)
    ElMessage.error('恢复请求失败')
  } finally {
    resuming.value = false
  }
}

// 取消
async function handleCancel() {
  canceling.value = true
  try {
    const res = await cancelGenerationTask(props.taskId)
    if (res.data.success) {
      ElMessage.success('任务已取消')
      progress.value.status = 'cancelled'
      stopSSE()
      stopPolling()
    } else {
      ElMessage.error(res.data.message)
    }
  } catch (err) {
    console.error('取消失败:', err)
    ElMessage.error('取消请求失败')
  } finally {
    canceling.value = false
  }
}

// 重试失败
async function handleRetryFailed() {
  retrying.value = true
  try {
    const res = await retryFailedSections(props.taskId)
    if (res.data.success) {
      ElMessage.success(`已重试 ${res.data.retried_count} 个失败章节`)
      emit('retry', res.data.retried_count)
      // 关闭当前对话框，等待新的任务启动
      visible.value = false
    } else {
      ElMessage.info(res.data.message)
    }
  } catch (err) {
    console.error('重试失败:', err)
    ElMessage.error('重试请求失败')
  } finally {
    retrying.value = false
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
    // 初始化
    progress.value = {
      task_id: props.taskId,
      status: 'pending',
      total: 0,
      success: 0,
      failed: 0,
      skipped: 0,
      running: 0,
      pending: 0,
      cancelled: 0,
      progress_percent: 0,
      current_section: null,
      sections: [],
      error_message: '',
      started_at: null,
      finished_at: null,
      paused_at_index: 0,
    }
    startSSE()
  } else {
    stopSSE()
    stopPolling()
  }
})

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

.progress-stats .success {
  color: #67c23a;
}

.progress-stats .failed {
  color: #f56c6c;
}

.progress-stats .skipped {
  color: #909399;
}

.progress-stats .cancelled {
  color: #909399;
}

.current-section {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
  color: #409eff;
}

.paused-info {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
  color: #e6a23c;
}

.is-loading {
  animation: rotate 1s linear infinite;
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.section-list {
  margin-top: 20px;
}

.section-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid #eee;
}

.section-title {
  flex: 1;
  font-size: 13px;
}

.word-count {
  color: #909399;
  font-size: 12px;
}

.error-text {
  color: #f56c6c;
  font-size: 12px;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dialog-footer {
  display: flex;
  gap: 12px;
}
</style>