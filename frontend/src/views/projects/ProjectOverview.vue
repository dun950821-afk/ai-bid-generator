<template>
  <div class="project-overview">
    <!-- 标段进度看板 -->
    <div class="lots-dashboard">
      <div class="dashboard-header">
        <h3>标段进度</h3>
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
            <span class="lot-name">{{ lot.name }}</span>
            <el-tag v-if="isLotActive(lot.id)" type="warning" size="small">进行中</el-tag>
          </div>
          <!-- 5 步缩略进度 -->
          <div class="lot-progress">
            <div
              v-for="(step, idx) in stepOrder"
              :key="step"
              class="progress-dot"
              :class="getDotClass(lot, step)"
              :title="`${idx + 1}. ${stepShortLabel[step]}`"
            />
          </div>
          <div class="lot-current-step">
            当前：{{ getCurrentStepLabel(lot) }}
          </div>
        </div>
      </div>
      <el-empty v-else description="暂无标段" :image-size="60" />
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
import {
  type LotWithProgress,
  type StepKey,
  STEP_ORDER,
  STEP_SHORT_LABEL,
} from '@/api/workbench'
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
  tender_file: '①上传文件',
  file_parsing: '②解析中',
  outline_generation: '③生成大纲',
  content_editing: '④编辑内容',
  export: '⑤导出',
}

function getCurrentStepLabel(lot: LotWithProgress): string {
  return CURRENT_STEP_LABEL[lot.current_step] || lot.current_step
}

function getDotClass(lot: LotWithProgress, step: StepKey): string {
  const st = lot.step_summary?.[step]
  if (st === 'done') return 'is-done'
  if (st === 'doing') return 'is-doing'
  if (st === 'failed') return 'is-failed'
  return ''
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
  background: var(--el-fill-color-blank);
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  padding: 16px;
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.dashboard-header h3 {
  margin: 0;
  font-size: 16px;
}

.dashboard-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.lot-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}

.lot-card {
  padding: 16px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
}

.lot-card:hover {
  border-color: var(--el-color-primary);
}

.lot-card.is-active {
  border-color: var(--el-color-warning);
  background: var(--el-color-warning-light-9);
}

.lot-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.lot-name {
  font-size: 15px;
  font-weight: 500;
}

.lot-progress {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.progress-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--el-fill-color-dark);
  flex-shrink: 0;
  transition: background 0.2s;
}

.progress-dot.is-done {
  background: var(--el-color-success);
}

.progress-dot.is-doing {
  background: var(--el-color-warning);
  box-shadow: 0 0 0 3px var(--el-color-warning-light-9);
}

.progress-dot.is-failed {
  background: var(--el-color-danger);
}

.lot-current-step {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
</style>
