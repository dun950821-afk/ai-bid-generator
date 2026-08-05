<template>
  <div class="project-overview">
    <!-- 标段进度看板 -->
    <div class="lots-dashboard">
      <div class="dashboard-header">
        <div class="header-left">
          <h3>标段进度</h3>
          <span class="lot-count">{{ lots.length }} 个标段</span>
        </div>
        <span class="dashboard-hint">点击标段进入工作台</span>
      </div>
      <div v-if="lots.length" class="lot-cards">
        <div
          v-for="lot in lots"
          :key="lot.id"
          class="lot-card"
          :class="{ 'is-active': isLotActive(lot.id) }"
          @click="goWorkbench(lot.id)"
        >
          <div class="lot-card-header">
            <div class="lot-title">
              <span class="lot-name">{{ lot.name }}</span>
              <el-tag v-if="lot.code" size="small" type="info" effect="plain">{{ lot.code }}</el-tag>
            </div>
            <el-tag v-if="isLotActive(lot.id)" type="warning" size="small" effect="light">进行中</el-tag>
          </div>

          <!-- 5 步缩略进度 -->
          <div class="lot-progress-section">
            <div class="progress-header">
              <span class="progress-label">当前步骤</span>
              <span class="progress-percent">{{ getProgressPercent(lot) }}%</span>
            </div>
            <div class="lot-progress">
              <div
                v-for="(step, idx) in stepOrder"
                :key="step"
                class="progress-step"
                :class="getStepClass(lot, step)"
              >
                <div class="progress-dot" />
                <div class="progress-label">{{ getStepShortLabel(step) }}</div>
                <div v-if="idx < stepOrder.length - 1" class="progress-connector" />
              </div>
            </div>
            <div class="lot-current-step">
              {{ getCurrentStepLabel(lot) }}
            </div>
          </div>
        </div>
      </div>
      <el-empty v-else description="暂无标段" :image-size="80" />
    </div>

    <!-- 原有项目信息区 -->
    <el-row :gutter="20">
      <el-col :span="16">
        <el-card shadow="never">
          <template #header>基本信息</template>
          <el-descriptions :column="2" border>
            <el-descriptions-item label="项目名称">{{ project?.name }}</el-descriptions-item>
            <el-descriptions-item label="状态">
              <el-tag :type="getStatusTagType(project?.status)" size="small">
                {{ getStatusLabel(project?.status) }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="创建人">{{ project?.created_by_name }}</el-descriptions-item>
            <el-descriptions-item label="创建时间">{{ formatDate(project?.created_at) }}</el-descriptions-item>
            <el-descriptions-item label="描述" :span="2">
              {{ project?.description || '暂无描述' }}
            </el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card shadow="never">
          <template #header>统计</template>
          <el-statistic title="标段数量" :value="project?.lot_count || 0" />
          <el-statistic title="成员数量" :value="project?.member_count || 0" style="margin-top: 20px" />
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { http } from '@/api/http'
import { isLotActive } from '@/composables/useWorkbenchPolling'
import type { LotWithProgress, StepKey } from '@/api/workbench'
import { STEP_ORDER, STEP_SHORT_LABEL } from './components/workbenchTheme'
import type { Project } from '@/api/project'

const props = defineProps<{
  project: Project | null
  permissions: string[]
}>()

const router = useRouter()
const lots = ref<LotWithProgress[]>([])
const stepOrder = STEP_ORDER
const stepShortLabel = STEP_SHORT_LABEL

async function loadLots() {
  if (!props.project?.id) return
  try {
    const res = await http.get<LotWithProgress[]>(
      `/api/projects/${props.project.id}/lots/`
    )
    lots.value = res.data
  } catch (err) {
    console.error('加载标段失败:', err)
  }
}

function goWorkbench(lotId: number) {
  router.push(`/projects/${props.project?.id}/lots/${lotId}`)
}

const CURRENT_STEP_LABEL: Record<StepKey, string> = {
  tender_file: '上传招标文件',
  file_parsing: '文件解析中',
  outline_generation: '生成大纲',
  content_editing: '编辑内容',
  export: '导出文档',
}

function getCurrentStepLabel(lot: LotWithProgress): string {
  return CURRENT_STEP_LABEL[lot.current_step] || lot.current_step
}

function getStepShortLabel(step: StepKey): string {
  return stepShortLabel[step]
}

function getStepStatus(lot: LotWithProgress, step: StepKey): string {
  return lot.step_summary?.[step] || 'pending'
}

function getStepClass(lot: LotWithProgress, step: StepKey): string {
  const st = getStepStatus(lot, step)
  if (st === 'done') return 'is-done'
  if (st === 'doing') return 'is-doing'
  if (st === 'failed') return 'is-failed'
  return 'is-pending'
}

function getProgressPercent(lot: LotWithProgress): number {
  const steps = stepOrder
  const doneCount = steps.filter((s) => getStepStatus(lot, s) === 'done').length
  const doingCount = steps.filter((s) => getStepStatus(lot, s) === 'doing').length
  const percent = Math.round(((doneCount + doingCount * 0.5) / steps.length) * 100)
  return Math.min(percent, 100)
}

function getStatusLabel(status?: string) {
  const map: Record<string, string> = {
    active: '进行中',
    archived: '已归档',
    closed: '已关闭',
  }
  return status ? map[status] || status : '-'
}

function getStatusTagType(status?: string) {
  const map: Record<string, string> = {
    active: 'primary',
    archived: 'info',
    closed: 'danger',
  }
  return status ? map[status] || 'info' : 'info'
}

function formatDate(dateStr?: string) {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

onMounted(loadLots)

// project 异步加载完成后重新拉取标段
watch(() => props.project?.id, (id) => {
  if (id) loadLots()
})
</script>

<style scoped>
.project-overview {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.lots-dashboard {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.dashboard-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.lot-count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
  padding: 2px 8px;
  border-radius: 10px;
}

.dashboard-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.lot-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.lot-card {
  padding: 18px;
  border: 1px solid var(--el-border-color);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  background: var(--el-bg-color);
}

.lot-card:hover {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  transform: translateY(-2px);
}

.lot-card.is-active {
  border-color: var(--el-color-warning);
  background: var(--el-color-warning-light-9);
}

.lot-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.lot-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.lot-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.lot-progress-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.progress-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.progress-percent {
  font-size: 14px;
  font-weight: 700;
  color: var(--el-color-primary);
}

.lot-progress {
  display: flex;
  align-items: flex-start;
}

.progress-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  flex: 1;
  position: relative;
}

.progress-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--el-border-color);
  flex-shrink: 0;
  transition: all 0.2s ease;
  border: 2px solid var(--el-border-color);
}

.progress-step.is-done .progress-dot {
  background: var(--el-color-success);
  border-color: var(--el-color-success);
}

.progress-step.is-doing .progress-dot {
  background: var(--el-color-warning);
  border-color: var(--el-color-warning);
  box-shadow: 0 0 0 4px var(--el-color-warning-light-8);
  animation: pulse-dot 1.5s ease-in-out infinite;
}

.progress-step.is-failed .progress-dot {
  background: var(--el-color-danger);
  border-color: var(--el-color-danger);
}

.progress-step.is-pending .progress-dot {
  background: var(--el-fill-color);
  border-color: var(--el-border-color);
}

.progress-label {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

.progress-step.is-done .progress-label {
  color: var(--el-color-success);
}

.progress-step.is-doing .progress-label {
  color: var(--el-color-warning);
  font-weight: 600;
}

.progress-step.is-failed .progress-label {
  color: var(--el-color-danger);
}

.progress-connector {
  position: absolute;
  top: 5px;
  left: calc(50% + 10px);
  right: calc(-50% + 10px);
  height: 2px;
  background: var(--el-border-color);
}

.progress-step.is-done .progress-connector {
  background: var(--el-color-success);
}

.lot-current-step {
  font-size: 13px;
  color: var(--el-text-color-primary);
  font-weight: 500;
  padding: 8px 12px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
  text-align: center;
}

@keyframes pulse-dot {
  0%, 100% {
    box-shadow: 0 0 0 4px var(--el-color-warning-light-8);
  }
  50% {
    box-shadow: 0 0 0 6px var(--el-color-warning-light-9);
  }
}
</style>
