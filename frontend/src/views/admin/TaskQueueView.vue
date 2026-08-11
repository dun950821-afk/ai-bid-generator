<!-- 队列管理：统一任务列表（强制结束）+ 失效/回收机制参数维护 -->
<template>
  <div class="queue-page">
    <!-- 页头 -->
    <header class="page-header">
      <div class="page-header-text">
        <h1 class="page-title">队列管理</h1>
        <p class="page-subtitle">生成与异步任务的统一监控、强制结束与回收参数维护</p>
      </div>
      <div class="page-header-right">
        <el-switch
          v-model="autoRefresh"
          active-text="自动刷新"
          @change="handleAutoRefreshChange"
        />
      </div>
    </header>

    <el-tabs v-model="activeTab" class="queue-tabs">
      <!-- ==================== 任务队列 ==================== -->
      <el-tab-pane label="任务队列" name="tasks">
        <section class="panel">
          <!-- 筛选栏 -->
          <div class="filter-bar">
            <el-radio-group v-model="statusFilter" size="small" @change="onFilterChange">
              <el-radio-button value="all">全部</el-radio-button>
              <el-radio-button value="running">进行中</el-radio-button>
              <el-radio-button value="pending">排队中</el-radio-button>
            </el-radio-group>

            <el-select v-model="kindFilter" size="small" style="width: 120px" @change="onFilterChange">
              <el-option label="全部任务" value="all" />
              <el-option label="生成任务" value="generation" />
              <el-option label="异步任务" value="async" />
            </el-select>

            <el-select
              v-model="taskTypeFilter"
              size="small"
              clearable
              filterable
              placeholder="任务类型"
              style="width: 180px"
              @change="onFilterChange"
            >
              <el-option v-for="t in taskTypeOptions" :key="t.value" :label="t.label" :value="t.value" />
            </el-select>

            <div class="filter-spacer" />

            <el-button size="small" :icon="Refresh" :loading="loading" @click="loadTasks">
              刷新
            </el-button>
            <el-button
              size="small"
              type="danger"
              plain
              :disabled="selectedTasks.length === 0"
              @click="handleBatchForceStop"
            >
              批量强制结束{{ selectedTasks.length ? `（${selectedTasks.length}）` : '' }}
            </el-button>
          </div>

          <el-table
            ref="tableRef"
            :data="items"
            v-loading="loading"
            style="width: 100%"
            @selection-change="handleSelectionChange"
          >
            <el-table-column type="selection" width="42" :selectable="canForceStop" />
            <el-table-column label="任务" min-width="260">
              <template #default="{ row }">
                <div class="task-cell">
                  <el-tag
                    size="small"
                    effect="plain"
                    round
                    :type="row.kind === 'generation' ? 'primary' : 'success'"
                    class="kind-tag"
                  >
                    {{ row.kind === 'generation' ? '生成' : '异步' }}
                  </el-tag>
                  <div class="task-title">
                    <div class="task-title-main">{{ row.title || '（无标题）' }}</div>
                    <div class="task-title-sub">{{ row.task_type_display }}</div>
                  </div>
                </div>
              </template>
            </el-table-column>

            <el-table-column label="状态" width="140">
              <template #default="{ row }">
                <el-tooltip
                  v-if="row.error_message && ['failed', 'cancelled'].includes(row.status)"
                  :content="row.error_message"
                  placement="top"
                  popper-class="error-tip"
                >
                  <el-tag size="small" effect="light" round :type="statusTagTypeFor(row)">
                    {{ statusDisplay(row) }}
                  </el-tag>
                </el-tooltip>
                <el-tooltip
                  v-else-if="statusDisplay(row) === '排队中'"
                  content="任务已提交，正在排队等待 worker 执行，请耐心等待"
                  placement="top"
                >
                  <el-tag size="small" effect="light" round :type="statusTagTypeFor(row)">
                    {{ statusDisplay(row) }}
                  </el-tag>
                </el-tooltip>
                <el-tag v-else size="small" effect="light" round :type="statusTagTypeFor(row)">
                  {{ statusDisplay(row) }}
                </el-tag>
                <el-tag v-if="row.force_stopped" size="small" type="danger" effect="plain" round class="force-tag">
                  已强制结束
                </el-tag>
              </template>
            </el-table-column>

            <el-table-column label="进度" width="150">
              <template #default="{ row }">
                <el-progress :percentage="row.progress" :stroke-width="6" />
              </template>
            </el-table-column>

            <el-table-column label="执行时间" width="110" align="center">
              <template #default="{ row }">
                {{ formatDuration(row.duration_seconds, row.status) }}
              </template>
            </el-table-column>

            <el-table-column label="Worker" width="90" align="center">
              <template #default="{ row }">
                <el-tooltip
                  :content="row.celery_state ? (row.celery_state === 'active' ? 'worker 正在执行' : 'worker 排队中') : '状态未知（worker 未响应，以数据库为准）'"
                  placement="top"
                >
                  <el-tag size="small" effect="plain" round :type="celeryTagType(row.celery_state)">
                    {{ row.celery_state === 'active' ? '执行中' : row.celery_state === 'reserved' ? '排队中' : '未知' }}
                  </el-tag>
                </el-tooltip>
              </template>
            </el-table-column>

            <el-table-column label="发起人" width="100">
              <template #default="{ row }">
                {{ row.created_by.real_name || row.created_by.username || '-' }}
              </template>
            </el-table-column>

            <el-table-column label="创建时间" width="150">
              <template #default="{ row }">
                {{ formatTime(row.created_at) }}
              </template>
            </el-table-column>

            <el-table-column label="操作" width="80" fixed="right" align="center">
              <template #default="{ row }">
                <el-tooltip v-if="canForceStop(row)" content="强制结束" placement="top">
                  <el-button class="row-action row-action-danger" text @click="handleForceStop(row)">
                    <el-icon><CircleClose /></el-icon>
                  </el-button>
                </el-tooltip>
              </template>
            </el-table-column>

            <template #empty>
              <el-empty description="暂无任务" :image-size="80" />
            </template>
          </el-table>

          <div class="pagination-bar" v-if="total > 0">
            <el-pagination
              layout="total, prev, pager, next"
              :total="total"
              :page-size="pageSize"
              :current-page="page"
              background
              @current-change="handlePageChange"
            />
          </div>
        </section>
      </el-tab-pane>

      <!-- ==================== 系统参数 ==================== -->
      <el-tab-pane label="系统参数" name="config">
        <section class="panel">
          <div class="config-toolbar">
            <span class="config-hint">参数保存后立即生效；标注「重启生效」的参数需重启 worker 后生效</span>
            <el-button type="primary" size="small" :loading="savingConfig" @click="handleSaveConfig">
              保存参数
            </el-button>
          </div>

          <el-table :data="configItems" v-loading="configLoading" style="width: 100%">
            <el-table-column prop="label" label="参数名" min-width="180" />
            <el-table-column label="当前值" width="160">
              <template #default="{ row }">
                <el-input-number
                  v-model="configValues[row.key]"
                  :min="row.min"
                  :max="row.max"
                  size="small"
                  controls-position="right"
                />
              </template>
            </el-table-column>
            <el-table-column prop="unit" label="单位" width="80" />
            <el-table-column label="生效方式" width="110">
              <template #default="{ row }">
                <el-tag v-if="row.needs_restart" size="small" type="warning" effect="light" round>重启生效</el-tag>
                <el-tag v-else size="small" type="success" effect="light" round>即时生效</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="description" label="说明" min-width="320" />
          </el-table>
        </section>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, CircleClose } from '@element-plus/icons-vue'
import {
  batchForceStopTasks,
  forceStopAsyncTask,
  forceStopGenerationTask,
  getTaskQueueConfigs,
  listTasks,
  listTaskTypes,
  saveTaskQueueConfigs,
  type QueueTaskItem,
  type TaskQueueConfigItem,
  type TaskTypeOption,
} from '@/api/queue'
import { logError } from '@/utils/logger'

const activeTab = ref('tasks')

// ==================== 任务列表 ====================

const TERMINAL_STATUSES = ['completed', 'failed', 'cancelled', 'partial_success', 'success']

const statusFilter = ref('all')
const kindFilter = ref('all')
const taskTypeFilter = ref('')

// 类型选项由后端动态下发（近 30 天实际出现过的类型），不再硬编码
const taskTypeOptions = ref<TaskTypeOption[]>([])

const items = ref<QueueTaskItem[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const loading = ref(false)

const AUTO_REFRESH_KEY = 'taskQueueAutoRefresh'
const autoRefresh = ref(localStorage.getItem(AUTO_REFRESH_KEY) !== 'false')
let refreshTimer: ReturnType<typeof setInterval> | null = null

async function loadTasks() {
  loading.value = true
  try {
    const res = await listTasks({
      status: statusFilter.value,
      kind: kindFilter.value,
      task_type: taskTypeFilter.value,
      page: page.value,
      page_size: pageSize,
    })
    items.value = res.data.items
    total.value = res.data.total
  } catch (err) {
    logError('加载任务列表失败', err)
    ElMessage.error('加载任务列表失败')
  } finally {
    loading.value = false
  }
}

async function loadTaskTypes() {
  try {
    const res = await listTaskTypes()
    taskTypeOptions.value = res.data.items
  } catch (err) {
    logError('加载任务类型失败', err)
  }
}

function onFilterChange() {
  page.value = 1
  loadTasks()
}

function handleAutoRefreshChange(checked: boolean) {
  localStorage.setItem(AUTO_REFRESH_KEY, String(checked))
  if (checked) {
    refreshTimer = setInterval(() => loadTasks(), 10000)
  } else if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}

function handlePageChange(newPage: number) {
  page.value = newPage
  loadTasks()
}

function canForceStop(row: QueueTaskItem): boolean {
  return !TERMINAL_STATUSES.includes(row.status) && !row.force_stopped
}

async function handleForceStop(row: QueueTaskItem) {
  try {
    const { value: reason } = await ElMessageBox.prompt(
      `确认强制结束「${row.title || row.task_type_display}」？\n将终止 worker 中的任务并释放关联状态，任务可重新发起。`,
      '强制结束任务',
      {
        confirmButtonText: '强制结束',
        cancelButtonText: '取消',
        inputPlaceholder: '原因（可选）',
        inputType: 'textarea',
        type: 'warning',
        confirmButtonClass: 'el-button--danger',
      }
    )

    const api = row.kind === 'generation' ? forceStopGenerationTask : forceStopAsyncTask
    const res = await api(row.id, reason || '')
    if (res.data.success) {
      ElMessage.success('任务已被强制结束')
      loadTasks()
    }
  } catch (err: any) {
    // 用户取消对话框
    if (err === 'cancel' || err === 'close') return
    const message = err?.response?.data?.message
    ElMessage.error(message || '强制结束失败')
  }
}

const tableRef = ref<{ clearSelection: () => void } | null>(null)
const selectedTasks = ref<QueueTaskItem[]>([])

function handleSelectionChange(rows: QueueTaskItem[]) {
  selectedTasks.value = rows
}

async function handleBatchForceStop() {
  try {
    const { value: reason } = await ElMessageBox.prompt(
      `确认强制结束选中的 ${selectedTasks.value.length} 个任务？\n将终止 worker 中的任务并释放关联状态，任务可重新发起。`,
      '批量强制结束',
      {
        confirmButtonText: '强制结束',
        cancelButtonText: '取消',
        inputPlaceholder: '原因（可选）',
        inputType: 'textarea',
        type: 'warning',
        confirmButtonClass: 'el-button--danger',
      }
    )

    const res = await batchForceStopTasks(
      selectedTasks.value.map((r) => ({ kind: r.kind, id: r.id })),
      reason || ''
    )
    const { success_count, failed_count } = res.data
    if (failed_count === 0) {
      ElMessage.success(`已强制结束 ${success_count} 个任务`)
    } else {
      const firstMessage = res.data.items.find((i) => !i.success)?.message || '任务可能已结束'
      if (success_count === 0) {
        ElMessage.error(`强制结束失败 ${failed_count} 个（${firstMessage}）`)
      } else {
        ElMessage.warning(`已强制结束 ${success_count} 个，失败 ${failed_count} 个（${firstMessage}）`)
      }
    }
    tableRef.value?.clearSelection()
    loadTasks()
  } catch (err: any) {
    // 用户取消对话框
    if (err === 'cancel' || err === 'close') return
    const message = err?.response?.data?.message
    ElMessage.error(message || '强制结束失败')
  }
}

// 状态列合并 worker 快照：worker 已预取未执行（reserved）或 DB 尚未开始（pending）的任务
// 统一显示「排队中」，避免任务实际在队列中却显示「执行中」让人误以为卡住
function statusDisplay(row: QueueTaskItem): string {
  if (row.celery_state === 'reserved') return '排队中'
  if (row.celery_state === 'active') return row.status_display
  if (row.status === 'pending') return '排队中'
  return row.status_display
}

function statusTagTypeFor(row: QueueTaskItem): 'success' | 'warning' | 'info' | 'danger' | 'primary' {
  if (statusDisplay(row) === '排队中') return 'warning'
  return statusTagType(row.status)
}

function statusTagType(status: string): 'success' | 'warning' | 'info' | 'danger' | 'primary' {
  if (['completed', 'partial_success', 'success'].includes(status)) return 'success'
  if (['running', 'pending', 'paused', 'pause_requested', 'cancel_requested', 'retrying'].includes(status)) return 'warning'
  if (['failed', 'cancelled'].includes(status)) return 'danger'
  return 'info'
}

function celeryTagType(state: string | null): 'success' | 'warning' | 'info' {
  if (state === 'active') return 'success'
  if (state === 'reserved') return 'warning'
  return 'info'
}

function formatTime(iso: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatDuration(seconds: number | null, status: string): string {
  if (seconds == null || seconds < 0) return '-'
  const prefix = status === 'running' ? '已执行 ' : ''
  const s = Math.floor(seconds)
  if (s < 60) return `${prefix}${s}秒`
  const m = Math.floor(s / 60)
  const sec = s % 60
  if (m < 60) return `${prefix}${m}分${sec > 0 ? `${sec}秒` : ''}`
  const h = Math.floor(m / 60)
  const min = m % 60
  return `${prefix}${h}小时${min > 0 ? `${min}分` : ''}`
}

// ==================== 系统参数 ====================

const configItems = ref<TaskQueueConfigItem[]>([])
const configValues = ref<Record<string, number>>({})
const configLoading = ref(false)
const savingConfig = ref(false)

async function loadConfigs() {
  configLoading.value = true
  try {
    const res = await getTaskQueueConfigs()
    configItems.value = res.data.items
    configValues.value = {}
    for (const item of res.data.items) {
      configValues.value[item.key] = item.value
    }
  } catch (err) {
    logError('加载系统参数失败', err)
    ElMessage.error('加载系统参数失败')
  } finally {
    configLoading.value = false
  }
}

async function handleSaveConfig() {
  savingConfig.value = true
  try {
    await saveTaskQueueConfigs({ ...configValues.value })
    ElMessage.success('参数已保存')
    const needsRestart = configItems.value.filter((i) => i.needs_restart).length
    if (needsRestart > 0) {
      ElMessage.warning('部分参数需重启 worker 后生效')
    }
    loadConfigs()
  } catch (err: any) {
    const errors = err?.response?.data?.errors
    if (errors) {
      const firstKey = Object.keys(errors)[0]
      ElMessage.error(errors[firstKey] || '参数校验失败')
    } else {
      ElMessage.error('保存参数失败')
    }
  } finally {
    savingConfig.value = false
  }
}

onMounted(() => {
  loadTasks()
  loadTaskTypes()
  loadConfigs()
  if (autoRefresh.value) {
    refreshTimer = setInterval(() => loadTasks(), 10000)
  }
})

onBeforeUnmount(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
})
</script>

<style scoped>
.queue-page {
  padding: 20px;
  background: var(--app-bg, #f6f8fb);
  min-height: calc(100vh - 60px);
}

/* 页头 */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  padding: 18px 22px;
  background: var(--app-card, #fff);
  border: 1px solid var(--app-border, #e5e7eb);
  border-radius: var(--app-radius, 16px);
  margin-bottom: 16px;
}

.page-title {
  margin: 0 0 4px;
  font-size: 20px;
  font-weight: 600;
  color: var(--app-text-primary, #111827);
}

.page-subtitle {
  margin: 0;
  font-size: 13px;
  color: var(--app-text-secondary, #6b7280);
}

.page-header-right {
  display: flex;
  align-items: center;
  gap: 14px;
}

/* 页签与面板 */
.queue-tabs {
  margin-top: 12px;
}

.queue-tabs :deep(.el-tabs__header) {
  margin-bottom: 12px;
}

.panel {
  background: var(--app-card, #fff);
  border: 1px solid var(--app-border, #e5e7eb);
  border-radius: var(--app-radius, 16px);
  overflow: hidden;
}

/* 筛选栏 */
.filter-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 14px 18px;
  border-bottom: 1px solid var(--app-border, #e5e7eb);
}

.filter-spacer {
  flex: 1;
}

/* 任务单元格 */
.task-cell {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.kind-tag {
  flex-shrink: 0;
  margin-top: 2px;
}

.task-title-main {
  font-weight: 500;
  color: var(--app-text-primary, #111827);
  line-height: 1.4;
}

.task-title-sub {
  font-size: 12px;
  color: var(--app-text-secondary, #9ca3af);
}

.force-tag {
  margin-left: 6px;
}

/* 行内操作按钮 */
.row-action {
  margin: 0;
  padding: 6px;
  height: auto;
  border-radius: 6px;
  font-size: 16px;
  color: var(--app-text-secondary, #6b7280);
}

.row-action-danger:hover {
  color: var(--el-color-danger);
  background: #fef2f2;
}

.pagination-bar {
  display: flex;
  justify-content: flex-end;
  padding: 14px 18px;
  border-top: 1px solid var(--app-border, #e5e7eb);
}

/* 系统参数 */
.config-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--app-border, #e5e7eb);
}

.config-hint {
  font-size: 13px;
  color: var(--app-text-secondary, #6b7280);
}

:deep(.error-tip) {
  max-width: 360px;
  white-space: normal;
  line-height: 1.5;
}
</style>
