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
        <div class="label">高风险（未修复）</div>
      </el-card>
      <el-card shadow="never" class="summary-card medium">
        <div class="count">{{ result.by_severity.medium }}</div>
        <div class="label">中风险（未修复）</div>
      </el-card>
      <el-card shadow="never" class="summary-card low">
        <div class="count">{{ result.by_severity.low }}</div>
        <div class="label">低风险（未修复）</div>
      </el-card>
      <el-card shadow="never" class="summary-card resolved">
        <div class="count">{{ result.total_resolved || 0 }}</div>
        <div class="label">已修复</div>
      </el-card>
    </div>

    <!-- 批量修复按钮 -->
    <div v-if="result && result.total_unresolved > 0 && !auditing" class="batch-repair-bar">
      <el-button type="warning" :loading="repairing" @click="handleBatchRepair">
        批量修复全部（{{ result.total_unresolved }} 处未修复）
      </el-button>
    </div>

    <!-- 冲突列表 -->
    <div v-loading="loading" class="conflicts-list">
      <el-empty
        v-if="!loading && (!result || result.conflicts.length === 0) && !auditing"
        :description="emptyDescription"
      />

      <!-- 待修复区 -->
      <div v-if="unresolvedSections.length > 0" class="conflict-group unresolved-group">
        <div class="group-header">
          <span class="group-title">待修复</span>
          <el-tag size="small" type="danger">{{ result?.total_unresolved }} 处</el-tag>
        </div>
        <el-card
          v-for="section in unresolvedSections"
          :key="section.section_id"
          shadow="never"
          class="section-card unresolved"
        >
          <template #header>
            <div class="section-header">
              <span class="section-title">{{ section.section_number }} {{ section.section_title }}</span>
              <el-tag size="small" type="danger">{{ section.unresolved_count }} 处未修复</el-tag>
            </div>
          </template>

          <div
            v-for="(conflict, idx) in section.conflicts.filter(c => !c.resolved)"
            :key="idx"
            :class="['conflict-item', `sev-${conflict.severity}`]"
          >
            <div class="conflict-header">
              <el-tag :type="severityTagType(conflict.severity)" size="small">
                {{ severityLabel(conflict.severity) }}
              </el-tag>
              <span class="fact-title">{{ conflict.fact_title }}</span>
            </div>
            <div class="conflict-detail">
              <div><b>正文证据：</b>{{ conflict.evidence }}</div>
              <div><b>冲突原因：</b>{{ conflict.reason }}</div>
            </div>
            <div class="conflict-action">
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

      <!-- 已修复区（默认折叠） -->
      <div v-if="resolvedSections.length > 0" class="conflict-group resolved-group">
        <div class="group-header clickable" @click="resolvedCollapsed = !resolvedCollapsed">
          <span class="group-title">已修复</span>
          <el-tag size="small" type="success">{{ result?.total_resolved }} 处</el-tag>
          <el-icon class="collapse-icon" :class="{ rotated: !resolvedCollapsed }">
            <ArrowRight />
          </el-icon>
          <span class="collapse-hint">{{ resolvedCollapsed ? '点击展开' : '点击收起' }}</span>
        </div>

        <el-collapse-transition>
          <div v-show="!resolvedCollapsed">
            <el-card
              v-for="section in resolvedSections"
              :key="section.section_id"
              shadow="never"
              class="section-card resolved"
            >
              <template #header>
                <div class="section-header">
                  <span class="section-title">{{ section.section_number }} {{ section.section_title }}</span>
                  <el-tag size="small" type="success">{{ section.resolved_count }} 处已修复</el-tag>
                </div>
              </template>

              <div
                v-for="(conflict, idx) in section.conflicts.filter(c => c.resolved)"
                :key="idx"
                class="conflict-item resolved"
              >
                <div class="conflict-header">
                  <el-tag :type="severityTagType(conflict.severity)" size="small">
                    {{ severityLabel(conflict.severity) }}
                  </el-tag>
                  <span class="fact-title">{{ conflict.fact_title }}</span>
                  <el-tag size="small" type="success">已修复</el-tag>
                  <span v-if="conflict.repaired_at" class="repaired-time">
                    {{ formatTime(conflict.repaired_at) }}
                  </span>
                </div>
                <div class="conflict-detail">
                  <div><b>原证据：</b>{{ conflict.evidence }}</div>
                </div>
                <div class="diff-action">
                  <el-button
                    size="small"
                    text
                    type="primary"
                    @click="toggleDiff(`${section.section_id}-${idx}`)"
                  >
                    {{ diffExpanded[`${section.section_id}-${idx}`] ? '收起对比' : '查看修复前后对比' }}
                  </el-button>
                </div>
                <el-collapse-transition>
                  <div v-show="diffExpanded[`${section.section_id}-${idx}`]" class="diff-view">
                    <div v-if="conflict.repaired_diff">
                      <div class="diff-row">
                        <span class="diff-label">修复前：</span>
                        <pre class="diff-content before">{{ conflict.repaired_diff.before || '（空）' }}</pre>
                      </div>
                      <div class="diff-row">
                        <span class="diff-label">修复后：</span>
                        <pre class="diff-content after">{{ conflict.repaired_diff.after || '（空）' }}</pre>
                      </div>
                      <div v-if="conflict.repaired_diff.note" class="diff-note">
                        提示：{{ conflict.repaired_diff.note }}
                      </div>
                    </div>
                    <div v-else class="diff-empty">无修复前后对比数据</div>
                  </div>
                </el-collapse-transition>
              </div>
            </el-card>
          </div>
        </el-collapse-transition>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowRight } from '@element-plus/icons-vue'
import {
  startConsistencyAudit,
  getConsistencyAuditResult,
  startConsistencyRepair,
  repairSectionConsistency,
  getAsyncTask,
  type ConsistencyAuditResult,
  type BatchRepairResultPayload,
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
const resolvedCollapsed = ref(true)
const diffExpanded = ref<Record<string, boolean>>({})
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

const unresolvedSections = computed(() =>
  (result.value?.conflicts || []).filter(s => s.unresolved_count > 0)
)
const resolvedSections = computed(() =>
  (result.value?.conflicts || []).filter(s => s.resolved_count > 0)
)
// 区分"从未审计"与"审计完成无冲突"：
// - 无 result 或无 last_audit_status → 未审计，引导用户先点开始审计
// - last_audit_status=success 且无冲突 → 审计完成，未发现冲突
// - last_audit_status=failed → 上次审计失败
const emptyDescription = computed(() => {
  if (!result.value) return '请先点击「开始审计」'
  const last = result.value.last_audit_status
  if (last === 'success') return '审计完成，未发现冲突'
  if (last === 'failed') return '上次审计失败，请重新审计'
  return '请先点击「开始审计」'
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
        const wasRepairing = repairing.value
        auditing.value = false
        repairing.value = false
        await loadResult()
        if (wasRepairing) {
          showBatchRepairSummary(t.result_payload as unknown as BatchRepairResultPayload | undefined)
        } else {
          ElMessage.success('审计完成')
        }
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

function showBatchRepairSummary(payload: BatchRepairResultPayload | undefined) {
  if (!payload) {
    ElMessage.success('修复完成')
    return
  }
  const sections = payload.repaired_details?.length || 0
  const repaired = payload.total_repaired || 0
  const remaining = (result.value?.total_unresolved) || 0
  ElMessage.success(
    `本次修复 ${sections} 章 ${repaired} 处${remaining > 0 ? `，剩余 ${remaining} 处未修复` : '，全部完成'}`
  )
  if (repaired > 0) {
    resolvedCollapsed.value = false
  }
}

async function handleBatchRepair() {
  repairing.value = true
  errorMsg.value = ''
  progress.value = 0
  currentStep.value = '提交中'
  diffExpanded.value = {}
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

function toggleDiff(key: string) {
  diffExpanded.value[key] = !diffExpanded.value[key]
}

function formatTime(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
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
.summary-card.resolved .count { color: var(--el-color-success); }
.batch-repair-bar { margin-bottom: 12px; }
.conflicts-list { display: flex; flex-direction: column; gap: 16px; }
.conflict-group { display: flex; flex-direction: column; gap: 8px; }
.group-header {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 0; border-bottom: 1px solid var(--el-border-color-lighter);
}
.group-header.clickable { cursor: pointer; user-select: none; }
.group-header.clickable:hover { color: var(--el-color-primary); }
.group-title { font-weight: 600; font-size: 14px; }
.collapse-icon { transition: transform 0.2s; font-size: 12px; }
.collapse-icon.rotated { transform: rotate(90deg); }
.collapse-hint { font-size: 12px; color: var(--el-text-color-secondary); margin-left: auto; }
.section-card { border-left: 3px solid var(--el-color-danger); }
.section-card.resolved { border-left-color: var(--el-color-success); opacity: 0.85; }
.section-header { display: flex; justify-content: space-between; align-items: center; }
.section-title { font-weight: 600; }
.conflict-item {
  padding: 10px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  margin-bottom: 8px;
}
.conflict-item.sev-high { background: var(--el-color-danger-light-9); }
.conflict-item.sev-medium { background: var(--el-color-warning-light-9); }
.conflict-item.sev-low { background: var(--el-color-info-light-9); }
.conflict-item.resolved {
  opacity: 0.7;
  background: var(--el-color-success-light-9);
  border-color: var(--el-color-success-light-5);
}
.conflict-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; flex-wrap: wrap; }
.fact-title { font-weight: 600; }
.repaired-time { font-size: 12px; color: var(--el-text-color-secondary); margin-left: auto; }
.conflict-detail { font-size: 13px; color: var(--el-text-color-regular); line-height: 1.6; }
.conflict-detail div { margin-bottom: 4px; }
.conflict-action { margin-top: 8px; }
.diff-action { margin-top: 6px; }
.diff-view {
  margin-top: 8px;
  padding: 10px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
  font-size: 12px;
}
.diff-row { display: flex; gap: 8px; margin-bottom: 6px; align-items: flex-start; }
.diff-label { flex-shrink: 0; color: var(--el-text-color-secondary); min-width: 56px; }
.diff-content {
  margin: 0; flex: 1;
  white-space: pre-wrap; word-break: break-word;
  padding: 6px 8px; border-radius: 4px;
  font-family: inherit; font-size: 12px; line-height: 1.5;
  max-height: 160px; overflow-y: auto;
}
.diff-content.before { background: var(--el-color-danger-light-9); color: var(--el-color-danger-dark-2); }
.diff-content.after { background: var(--el-color-success-light-9); color: var(--el-color-success-dark-2); }
.diff-note { color: var(--el-text-color-secondary); font-size: 12px; margin-top: 4px; }
.diff-empty { color: var(--el-text-color-placeholder); text-align: center; padding: 8px; }
</style>

