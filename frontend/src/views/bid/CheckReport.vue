<!-- frontend/src/views/bid/CheckReport.vue -->
<!-- 废标检查报告（借鉴 OpenBidKit rejectionCheckTask） -->
<template>
  <div class="check-report">
    <!-- 顶部操作 -->
    <div class="report-header">
      <div class="header-info">
        <span class="title">废标检查</span>
        <el-tag v-if="task" size="small" :type="statusTagType(task.status)">
          {{ task.status_display }}
        </el-tag>
      </div>
      <div class="header-actions">
        <el-input
          v-model="customCheckItems"
          type="textarea"
          :rows="2"
          placeholder="自定义检查项（可选，如：重点核对资质有效期）"
          class="custom-input"
          :disabled="checking"
        />
        <el-button type="primary" :loading="checking" @click="handleStartCheck">
          {{ task && task.status === 'success' ? '重新检查' : '开始检查' }}
        </el-button>
      </div>
    </div>

    <!-- 进度 -->
    <el-alert
      v-if="checking || errorMsg"
      :title="errorMsg || `正在检查：${currentStep}（${progress}%）`"
      :type="errorMsg ? 'error' : 'info'"
      :closable="false"
      show-icon
      class="progress-alert"
    >
      <el-progress v-if="!errorMsg" :percentage="progress" :stroke-width="6" :show-text="false" />
    </el-alert>

    <!-- 摘要统计 -->
    <div v-if="findings.length > 0" class="summary-cards">
      <el-card shadow="never" class="summary-card high">
        <div class="count">{{ summary.high }}</div>
        <div class="label">高风险</div>
      </el-card>
      <el-card shadow="never" class="summary-card medium">
        <div class="count">{{ summary.medium }}</div>
        <div class="label">中风险</div>
      </el-card>
      <el-card shadow="never" class="summary-card low">
        <div class="count">{{ summary.low }}</div>
        <div class="label">低风险</div>
      </el-card>
    </div>

    <!-- 过滤 -->
    <div v-if="findings.length > 0" class="filter-bar">
      <el-radio-group v-model="filterSeverity" size="small" @change="loadFindings">
        <el-radio-button label="">全部</el-radio-button>
        <el-radio-button label="high">高</el-radio-button>
        <el-radio-button label="medium">中</el-radio-button>
        <el-radio-button label="low">低</el-radio-button>
      </el-radio-group>
      <el-radio-group v-model="filterType" size="small" @change="loadFindings">
        <el-radio-button label="">全部类型</el-radio-button>
        <el-radio-button label="invalidBid">无效标</el-radio-button>
        <el-radio-button label="rejectionItem">废标项</el-radio-button>
      </el-radio-group>
    </div>

    <!-- 发现项列表 -->
    <div v-loading="loading" class="findings-list">
      <el-empty v-if="!loading && findings.length === 0 && !checking" description="暂无检查结果，请先开始检查" />

      <el-card
        v-for="finding in findings"
        :key="finding.id"
        shadow="never"
        :class="['finding-card', `sev-${finding.severity}`, { resolved: finding.resolved }]"
      >
        <template #header>
          <div class="finding-header">
            <div class="finding-title">
              <el-tag :type="severityTagType(finding.severity)" size="small">
                {{ finding.severity_display }}
              </el-tag>
              <el-tag :type="finding.type === 'invalidBid' ? 'danger' : 'warning'" size="small" effect="plain">
                {{ finding.type_display }}
              </el-tag>
              <span class="title-text">{{ finding.title }}</span>
            </div>
            <div class="finding-actions">
              <el-button
                size="small"
                link
                :type="finding.resolved ? 'success' : ''"
                @click="toggleResolve(finding)"
              >
                {{ finding.resolved ? '已处理' : '标记已处理' }}
              </el-button>
            </div>
          </div>
        </template>

        <el-descriptions :column="1" size="small" border>
          <el-descriptions-item label="风险摘要">{{ finding.summary }}</el-descriptions-item>
          <el-descriptions-item label="检查依据">{{ finding.requirement || '-' }}</el-descriptions-item>
          <el-descriptions-item label="投标文件证据">{{ finding.bid_evidence || '-' }}</el-descriptions-item>
          <el-descriptions-item label="风险原因">{{ finding.risk_reason || '-' }}</el-descriptions-item>
          <el-descriptions-item label="处理建议">{{ finding.suggestion || '-' }}</el-descriptions-item>
        </el-descriptions>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import {
  startBidCheck,
  getBidCheckTask,
  getBidCheckFindings,
  resolveFinding,
  unresolveFinding,
  getAsyncTask,
  getCurrentAsyncTask,
  type BidCheckFinding,
  type BidCheckTask,
} from '@/api/bidCheck'

const props = defineProps<{ outlineId: number; bidDocumentId: number }>()

const task = ref<BidCheckTask | null>(null)
const findings = ref<BidCheckFinding[]>([])
const checking = ref(false)
const loading = ref(false)
const errorMsg = ref('')
const currentStep = ref('')
const progress = ref(0)
const customCheckItems = ref('')
const filterSeverity = ref('')
const filterType = ref('')

let pollTimer: ReturnType<typeof setTimeout> | null = null

const summary = computed(() => {
  const s = task.value?.findings_summary || {}
  return { high: s.high || 0, medium: s.medium || 0, low: s.low || 0 }
})

const RUNNING_STATUSES = ['pending', 'extracting', 'analyzing', 'inspecting', 'finalizing']

async function loadLatestTask() {
  try {
    const res = await import('@/api/bidCheck').then(m => m.listBidCheckTasks({
      outline_id: props.outlineId,
      bid_document_id: props.bidDocumentId,
    }))
    if (!res.data.results || res.data.results.length === 0) return
    task.value = res.data.results[0]

    // 任务还在运行中 → 查关联 AsyncTask 恢复进度并重启轮询
    if (RUNNING_STATUSES.includes(task.value.status)) {
      const asyncRes = await getCurrentAsyncTask(task.value.id)
      const at = asyncRes.data
      if (at && (at.status === 'pending' || at.status === 'running' || at.status === 'retrying')) {
        checking.value = true
        progress.value = at.progress
        currentStep.value = at.current_step
        pollTask(at.id)
        return
      }
      // AsyncTask 已结束但 BidCheckTask 状态未同步 → 视为失败
      if (at && at.status === 'failed') {
        errorMsg.value = at.error_message || '检查失败'
      }
      return
    }

    if (task.value.status === 'success' || task.value.status === 'partial_success') {
      await loadFindings()
    } else if (task.value.status === 'failed') {
      errorMsg.value = task.value.error_message || '检查失败'
    }
  } catch (e) {
    // 忽略
  }
}

async function loadFindings() {
  if (!task.value) return
  loading.value = true
  try {
    const params: Record<string, string> = {}
    if (filterSeverity.value) params.severity = filterSeverity.value
    if (filterType.value) params.type = filterType.value
    const res = await getBidCheckFindings(task.value.id, params)
    findings.value = res.data.results
  } catch (e: any) {
    ElMessage.error(e?.message || '加载发现项失败')
  } finally {
    loading.value = false
  }
}

async function handleStartCheck() {
  checking.value = true
  errorMsg.value = ''
  progress.value = 0
  currentStep.value = '提交中'
  try {
    const res = await startBidCheck({
      outline: props.outlineId,
      bid_document: props.bidDocumentId,
      custom_check_items: customCheckItems.value,
    })
    pollTask(res.data.task_id)
  } catch (e: any) {
    checking.value = false
    errorMsg.value = e?.message || '提交检查任务失败'
  }
}

function pollTask(asyncTaskId: number) {
  const poll = async () => {
    try {
      const res = await getAsyncTask(asyncTaskId)
      const at = res.data
      progress.value = at.progress
      currentStep.value = at.current_step
      if (at.status === 'success') {
        checking.value = false
        ElMessage.success('废标检查完成')
        // 加载最新任务详情和发现项
        const relatedId = at.result_payload?.bid_check_task_id
        if (relatedId) {
          const taskRes = await getBidCheckTask(Number(relatedId))
          task.value = taskRes.data
          await loadFindings()
        }
        return
      }
      if (at.status === 'failed') {
        checking.value = false
        errorMsg.value = at.error_message || '检查失败'
        return
      }
      pollTimer = setTimeout(poll, 2500)
    } catch (e: any) {
      checking.value = false
      errorMsg.value = e?.message || '查询任务状态失败'
    }
  }
  poll()
}

async function toggleResolve(finding: BidCheckFinding) {
  try {
    const res = finding.resolved
      ? await unresolveFinding(finding.id)
      : await resolveFinding(finding.id)
    const idx = findings.value.findIndex(f => f.id === finding.id)
    if (idx >= 0) findings.value[idx] = res.data
  } catch (e: any) {
    ElMessage.error(e?.message || '操作失败')
  }
}

function statusTagType(status: string): 'success' | 'warning' | 'info' | 'danger' {
  if (status === 'success') return 'success'
  if (status === 'failed') return 'danger'
  if (['extracting', 'analyzing', 'inspecting', 'finalizing'].includes(status)) return 'warning'
  return 'info'
}

function severityTagType(severity: string): 'danger' | 'warning' | 'info' {
  if (severity === 'high') return 'danger'
  if (severity === 'medium') return 'warning'
  return 'info'
}

onMounted(loadLatestTask)
onUnmounted(() => {
  if (pollTimer) clearTimeout(pollTimer)
})
</script>

<style scoped>
.check-report {
  padding: 12px 0;
}
.report-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
  gap: 12px;
}
.header-info {
  display: flex;
  align-items: center;
  gap: 8px;
}
.header-info .title {
  font-weight: 600;
  font-size: 15px;
}
.header-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-end;
  flex: 1;
  max-width: 480px;
}
.custom-input {
  width: 100%;
}
.progress-alert {
  margin-bottom: 12px;
}
.summary-cards {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
}
.summary-card {
  flex: 1;
  text-align: center;
}
.summary-card .count {
  font-size: 28px;
  font-weight: 700;
}
.summary-card .label {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.summary-card.high .count { color: var(--el-color-danger); }
.summary-card.medium .count { color: var(--el-color-warning); }
.summary-card.low .count { color: var(--el-color-info); }
.filter-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
}
.findings-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.finding-card {
  border-left: 3px solid var(--el-border-color);
}
.finding-card.sev-high { border-left-color: var(--el-color-danger); }
.finding-card.sev-medium { border-left-color: var(--el-color-warning); }
.finding-card.sev-low { border-left-color: var(--el-color-info); }
.finding-card.resolved { opacity: 0.6; }
.finding-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.finding-title {
  display: flex;
  align-items: center;
  gap: 6px;
}
.title-text {
  font-weight: 600;
}
</style>
