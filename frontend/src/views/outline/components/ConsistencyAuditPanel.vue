<!-- frontend/src/views/outline/components/ConsistencyAuditPanel.vue -->
<!-- 一致性审计抽屉（借鉴 OpenBidKit auditing 阶段） -->
<template>
  <div class="audit-panel">
    <!-- 顶部操作 -->
    <div class="panel-header">
      <div class="header-info">
        <span class="title">一致性审计</span>
        <el-tag v-if="taskStatus" size="small" :type="statusTagType">{{ taskStatusLabel }}</el-tag>
      </div>
      <el-button type="primary" :loading="auditing" @click="handleAudit">
        {{ result && result.total_conflicts >= 0 ? '重新审计' : '开始审计' }}
      </el-button>
    </div>

    <!-- 进度 -->
    <el-alert
      v-if="auditing || repairing || errorMsg"
      :title="errorMsg || `正在处理：${currentStep}（${progress}%）`"
      :type="errorMsg ? 'error' : 'info'"
      :closable="false"
      show-icon
      class="progress-alert"
    >
      <el-progress v-if="!errorMsg" :percentage="progress" :stroke-width="6" :show-text="false" />
    </el-alert>

    <!-- 摘要 -->
    <div v-if="result && !auditing" class="summary-cards">
      <el-card shadow="never" class="summary-card high">
        <div class="count">{{ result.by_severity.high }}</div>
        <div class="label">高风险冲突</div>
      </el-card>
      <el-card shadow="never" class="summary-card medium">
        <div class="count">{{ result.by_severity.medium }}</div>
        <div class="label">中风险冲突</div>
      </el-card>
      <el-card shadow="never" class="summary-card low">
        <div class="count">{{ result.by_severity.low }}</div>
        <div class="label">低风险冲突</div>
      </el-card>
    </div>

    <!-- 批量修复按钮 -->
    <div v-if="result && result.total_conflicts > 0 && !auditing" class="batch-repair-bar">
      <el-button type="warning" :loading="repairing" @click="handleBatchRepair">
        批量修复全部（{{ result.total_conflicts }} 处冲突）
      </el-button>
    </div>

    <!-- 冲突列表 -->
    <div v-loading="loading" class="conflicts-list">
      <el-empty v-if="!loading && (!result || result.conflicts.length === 0) && !auditing" description="暂无冲突，请先审计" />

      <el-card
        v-for="section in result?.conflicts || []"
        :key="section.section_id"
        shadow="never"
        class="section-card"
      >
        <template #header>
          <div class="section-header">
            <span class="section-title">{{ section.section_number }} {{ section.section_title }}</span>
            <el-tag size="small" type="danger">{{ section.conflict_count }} 处冲突</el-tag>
          </div>
        </template>

        <div
          v-for="(conflict, idx) in section.conflicts"
          :key="idx"
          :class="['conflict-item', `sev-${conflict.severity}`, { resolved: conflict.resolved }]"
        >
          <div class="conflict-header">
            <el-tag :type="severityTagType(conflict.severity)" size="small">
              {{ severityLabel(conflict.severity) }}
            </el-tag>
            <span class="fact-title">{{ conflict.fact_title }}</span>
            <el-tag v-if="conflict.resolved" size="small" type="success">已修复</el-tag>
          </div>
          <div class="conflict-detail">
            <div><b>正文证据：</b>{{ conflict.evidence }}</div>
            <div><b>冲突原因：</b>{{ conflict.reason }}</div>
          </div>
          <div class="conflict-action" v-if="!conflict.resolved">
            <el-button
              size="small"
              type="primary"
              :loading="repairingSectionId === section.section_id"
              @click="handleRepairSection(section.section_id)"
            >
              按事实修复本章
            </el-button>
          </div>
        </div>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import {
  startConsistencyAudit,
  getConsistencyAuditResult,
  startConsistencyRepair,
  repairSectionConsistency,
  getAsyncTask,
  type ConsistencyAuditResult,
} from '@/api/consistencyAudit'

const props = defineProps<{ outlineId: number }>()

const loading = ref(false)
const auditing = ref(false)
const repairing = ref(false)
const repairingSectionId = ref<number | null>(null)
const errorMsg = ref('')
const currentStep = ref('')
const progress = ref(0)
const result = ref<ConsistencyAuditResult | null>(null)
const auditTaskId = ref<number | null>(null)
let pollTimer: ReturnType<typeof setTimeout> | null = null

const taskStatus = computed(() => result.value?.task_status || '')
const taskStatusLabel = computed(() => {
  const map: Record<string, string> = {
    pending: '等待中', running: '审计中', success: '已完成', failed: '失败', idle: '空闲',
  }
  return map[taskStatus.value] || taskStatus.value
})
const statusTagType = computed(() => {
  if (taskStatus.value === 'running') return 'primary'
  if (taskStatus.value === 'failed') return 'danger'
  if (taskStatus.value === 'success') return 'success'
  return 'info'
})

async function loadResult() {
  loading.value = true
  try {
    const res = await getConsistencyAuditResult(props.outlineId)
    result.value = res.data
    if (res.data.task_status === 'running' || res.data.task_status === 'pending') {
      auditTaskId.value = res.data.task_id
      auditing.value = true
      if (res.data.task_id) pollTask(res.data.task_id)
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '加载审计结果失败')
  } finally {
    loading.value = false
  }
}

async function handleAudit() {
  auditing.value = true
  errorMsg.value = ''
  progress.value = 0
  currentStep.value = '提交中'
  try {
    const res = await startConsistencyAudit(props.outlineId)
    auditTaskId.value = res.data.task_id
    pollTask(res.data.task_id)
  } catch (e: any) {
    auditing.value = false
    errorMsg.value = e?.message || '提交审计失败'
  }
}

function pollTask(taskId: number) {
  const poll = async () => {
    try {
      const res = await getAsyncTask(taskId)
      const t = res.data
      progress.value = t.progress
      currentStep.value = t.current_step
      if (t.status === 'success') {
        auditing.value = false
        repairing.value = false
        ElMessage.success('任务完成')
        await loadResult()
        return
      }
      if (t.status === 'failed') {
        auditing.value = false
        repairing.value = false
        errorMsg.value = t.error_message || '任务失败'
        return
      }
      pollTimer = setTimeout(poll, 2000)
    } catch (e: any) {
      auditing.value = false
      repairing.value = false
      errorMsg.value = e?.message || '查询任务状态失败'
    }
  }
  poll()
}

async function handleBatchRepair() {
  repairing.value = true
  errorMsg.value = ''
  progress.value = 0
  currentStep.value = '提交中'
  try {
    const res = await startConsistencyRepair(props.outlineId)
    pollTask(res.data.task_id)
  } catch (e: any) {
    repairing.value = false
    errorMsg.value = e?.message || '提交批量修复失败'
  }
}

async function handleRepairSection(sectionId: number) {
  repairingSectionId.value = sectionId
  try {
    await repairSectionConsistency(sectionId)
    ElMessage.success('章节已修复')
    await loadResult()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '修复失败')
  } finally {
    repairingSectionId.value = null
  }
}

function severityLabel(sev: string): string {
  return ({ high: '高', medium: '中', low: '低' } as Record<string, string>)[sev] || sev
}
function severityTagType(sev: string): 'danger' | 'warning' | 'info' {
  return ({ high: 'danger', medium: 'warning', low: 'info' } as Record<string, 'danger' | 'warning' | 'info'>)[sev] || 'info'
}

onMounted(loadResult)
onUnmounted(() => { if (pollTimer) clearTimeout(pollTimer) })
</script>

<style scoped>
.audit-panel { padding: 12px 0; }
.panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.header-info { display: flex; align-items: center; gap: 8px; }
.header-info .title { font-weight: 600; font-size: 15px; }
.progress-alert { margin-bottom: 12px; }
.summary-cards { display: flex; gap: 12px; margin-bottom: 12px; }
.summary-card { flex: 1; text-align: center; }
.summary-card .count { font-size: 28px; font-weight: 700; }
.summary-card .label { color: var(--el-text-color-secondary); font-size: 13px; }
.summary-card.high .count { color: var(--el-color-danger); }
.summary-card.medium .count { color: var(--el-color-warning); }
.summary-card.low .count { color: var(--el-color-info); }
.batch-repair-bar { margin-bottom: 12px; }
.conflicts-list { display: flex; flex-direction: column; gap: 8px; }
.section-card { border-left: 3px solid var(--el-color-danger); }
.section-header { display: flex; justify-content: space-between; align-items: center; }
.section-title { font-weight: 600; }
.conflict-item { padding: 10px; border: 1px solid var(--el-border-color-lighter); border-radius: 6px; margin-bottom: 8px; }
.conflict-item.sev-high { background: var(--el-color-danger-light-9); }
.conflict-item.sev-medium { background: var(--el-color-warning-light-9); }
.conflict-item.sev-low { background: var(--el-color-info-light-9); }
.conflict-item.resolved { opacity: 0.6; }
.conflict-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.fact-title { font-weight: 600; }
.conflict-detail { font-size: 13px; color: var(--el-text-color-regular); line-height: 1.6; }
.conflict-detail div { margin-bottom: 4px; }
.conflict-action { margin-top: 8px; }
</style>
