<!-- 队列管理：统一任务列表（强制结束）+ 失效/回收机制参数维护 -->
<template>
  <div class="task-queue-view">
    <el-tabs v-model="activeTab">
      <!-- ==================== 任务队列 ==================== -->
      <el-tab-pane label="任务队列" name="tasks">
        <div class="toolbar">
          <div class="toolbar-left">
            <el-radio-group v-model="statusFilter" size="small" @change="loadTasks">
              <el-radio-button value="all">全部</el-radio-button>
              <el-radio-button value="running">进行中</el-radio-button>
              <el-radio-button value="pending">排队中</el-radio-button>
            </el-radio-group>

            <el-select v-model="kindFilter" size="small" style="width: 130px" @change="loadTasks">
              <el-option label="全部任务" value="all" />
              <el-option label="生成任务" value="generation" />
              <el-option label="异步任务" value="async" />
            </el-select>

            <el-select v-model="taskTypeFilter" size="small" clearable placeholder="任务类型" style="width: 170px" @change="loadTasks">
              <el-option v-for="t in taskTypeOptions" :key="t.value" :label="t.label" :value="t.value" />
            </el-select>
          </div>

          <div class="toolbar-right">
            <el-button
              size="small"
              type="danger"
              :disabled="selectedTasks.length === 0"
              @click="handleBatchForceStop"
            >
              批量强制结束{{ selectedTasks.length ? `（${selectedTasks.length}）` : '' }}
            </el-button>
            <el-switch
              v-model="autoRefresh"
              active-text="自动刷新"
              @change="handleAutoRefreshChange"
            />
            <el-button size="small" :icon="Refresh" :loading="loading" @click="loadTasks">
              刷新
            </el-button>
          </div>
        </div>

        <el-table ref="tableRef" :data="items" v-loading="loading" size="small" empty-text="暂无任务" @selection-change="handleSelectionChange">
          <el-table-column type="selection" width="40" :selectable="canForceStop" />
          <el-table-column label="任务" min-width="220">
            <template #default="{ row }">
              <div class="task-cell">
                <el-tag size="small" :type="row.kind === 'generation' ? 'primary' : 'success'">
                  {{ row.kind === 'generation' ? '生成' : '异步' }}
                </el-tag>
                <div class="task-title">
                  <div class="task-title-main">{{ row.title || '（无标题）' }}</div>
                  <div class="task-title-sub">{{ row.task_type_display }}</div>
                </div>
              </div>
            </template>
          </el-table-column>

          <el-table-column label="状态" width="150">
            <template #default="{ row }">
              <el-tooltip
                v-if="row.error_message && ['failed', 'cancelled'].includes(row.status)"
                :content="row.error_message"
                placement="top"
                popper-class="error-tip"
              >
                <el-tag size="small" :type="statusTagType(row.status)">
                  {{ row.status_display }}
                </el-tag>
              </el-tooltip>
              <el-tag v-else size="small" :type="statusTagType(row.status)">
                {{ row.status_display }}
              </el-tag>
              <el-tag v-if="row.force_stopped" size="small" type="danger" class="force-tag">
                已强制结束
              </el-tag>
            </template>
          </el-table-column>

          <el-table-column label="进度" width="140">
            <template #default="{ row }">
              <el-progress :percentage="row.progress" :stroke-width="6" />
            </template>
          </el-table-column>

          <el-table-column label="执行时间" width="110">
            <template #default="{ row }">
              {{ formatDuration(row.duration_seconds, row.status) }}
            </template>
          </el-table-column>

          <el-table-column label="Celery" width="100">
            <template #default="{ row }">
              <el-tooltip
                :content="row.celery_state ? (row.celery_state === 'active' ? 'worker 正在执行' : 'worker 排队中') : '状态未知（worker 未响应，以数据库为准）'"
                placement="top"
              >
                <el-tag size="small" :type="celeryTagType(row.celery_state)">
                  {{ row.celery_state === 'active' ? '执行中' : row.celery_state === 'reserved' ? '排队' : '未知' }}
                </el-tag>
              </el-tooltip>
            </template>
          </el-table-column>

          <el-table-column label="发起人" width="110">
            <template #default="{ row }">
              {{ row.created_by.real_name || row.created_by.username || '-' }}
            </template>
          </el-table-column>

          <el-table-column label="创建时间" width="160">
            <template #default="{ row }">
              {{ formatTime(row.created_at) }}
            </template>
          </el-table-column>

          <el-table-column label="操作" width="110" fixed="right">
            <template #default="{ row }">
              <el-button
                v-if="canForceStop(row)"
                size="small"
                type="danger"
                link
                @click="handleForceStop(row)"
              >
                强制结束
              </el-button>
            </template>
          </el-table-column>
        </el-table>

        <div class="pagination">
          <el-pagination
            layout="total, prev, pager, next"
            :total="total"
            :page-size="pageSize"
            :current-page="page"
            @current-change="handlePageChange"
          />
        </div>
      </el-tab-pane>

      <!-- ==================== 系统参数 ==================== -->
      <el-tab-pane label="系统参数" name="config">
        <div class="config-toolbar">
          <span class="config-hint">参数保存后立即生效；标注「重启生效」的参数需重启 worker 后生效</span>
          <el-button type="primary" size="small" :loading="savingConfig" @click="handleSaveConfig">
            保存参数
          </el-button>
        </div>

        <el-table :data="configItems" v-loading="configLoading" size="small">
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
              <el-tag v-if="row.needs_restart" size="small" type="warning">重启生效</el-tag>
              <el-tag v-else size="small" type="success">即时生效</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="description" label="说明" min-width="320" />
        </el-table>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import {
  batchForceStopTasks,
  forceStopAsyncTask,
  forceStopGenerationTask,
  getTaskQueueConfigs,
  listTasks,
  saveTaskQueueConfigs,
  type QueueTaskItem,
  type TaskQueueConfigItem,
} from '@/api/queue'

const activeTab = ref('tasks')

// ==================== 任务列表 ====================

const TERMINAL_STATUSES = ['completed', 'failed', 'cancelled', 'partial_success', 'success']

const statusFilter = ref('all')
const kindFilter = ref('all')
const taskTypeFilter = ref('')

const taskTypeOptions = [
  { value: 'matrix_generation', label: '矩阵生成' },
  { value: 'section_batch_generation', label: '批量正文生成' },
  { value: 'tender_parse', label: '招标文件解析' },
  { value: 'outline_generate', label: '大纲生成' },
  { value: 'outline_refine', label: '目录完善' },
  { value: 'consistency_audit', label: '一致性审计' },
  { value: 'consistency_repair', label: '一致性修复' },
  { value: 'table_cleanup', label: '表格清理' },
  { value: 'mermaid_illustration', label: 'Mermaid 配图' },
  { value: 'image_generation', label: 'AI 生图' },
  { value: 'section_expand', label: '字数补目录' },
  { value: 'section_generate', label: '章节生成' },
  { value: 'global_fact_extract', label: '全局事实提取' },
  { value: 'bid_check', label: '废标检查' },
  { value: 'knowledge.process_document', label: '知识库文档处理' },
]

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
    ElMessage.error('加载任务列表失败')
  } finally {
    loading.value = false
  }
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
.task-queue-view {
  padding: 16px;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  gap: 12px;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.task-cell {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.task-title-main {
  font-weight: 500;
  color: #303133;
  line-height: 1.4;
}

.task-title-sub {
  font-size: 12px;
  color: #909399;
}

.force-tag {
  margin-left: 6px;
}

.pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

.config-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.config-hint {
  font-size: 13px;
  color: #909399;
}

:deep(.error-tip) {
  max-width: 360px;
  white-space: normal;
  line-height: 1.5;
}
</style>
