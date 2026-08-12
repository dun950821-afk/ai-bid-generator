<template>
  <div class="lot-workbench" v-loading="loading">
    <!-- 顶部：面包屑 + 标题 + 进度 -->
    <div class="workbench-header">
      <el-breadcrumb separator="/" class="header-breadcrumb">
        <el-breadcrumb-item :to="{ path: `/projects/${projectId}` }">{{ projectName }}</el-breadcrumb-item>
        <el-breadcrumb-item>{{ lotName }}</el-breadcrumb-item>
      </el-breadcrumb>
      <div class="header-main">
        <div class="header-left">
          <h1 class="page-title">{{ lotName }}</h1>
          <el-tag v-if="currentStepLabel" :type="currentStepTagType" size="small" effect="light">
            {{ currentStepLabel }}
          </el-tag>
        </div>
        <div class="header-right">
          <div class="progress-info">
            <span class="progress-label">整体进度</span>
            <el-progress
              :percentage="overallProgress"
              :stroke-width="6"
              :show-text="false"
              class="progress-bar"
            />
            <span class="progress-value">{{ overallProgress }}%</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 步骤导航 -->
    <WorkbenchStepNav
      :current-step="activeStep"
      :status="status"
      @select="handleStepSelect"
    />

    <!-- 响应文件入口(招标响应模板工作台) -->
    <el-card v-if="rtTemplates.length" shadow="never" class="rt-entry mb16">
      <div class="rt-entry-inner">
        <span class="rt-entry-title">📄 响应文件</span>
        <template v-for="t in rtTemplates" :key="t.id">
          <el-tag size="small" class="rt-tag">{{ t.source_file_name }}</el-tag>
          <el-tag :type="rtStatusType(t.status)" size="small" class="rt-tag">
            {{ t.status_display }}
          </el-tag>
          <span v-if="t.confidence != null" class="rt-conf">
            置信度 {{ (t.confidence * 100).toFixed(0) }}%
          </span>
          <el-button size="small" type="primary" class="rt-btn" @click="goWorkbench(t.id)">
            进入工作台 →
          </el-button>
        </template>
      </div>
    </el-card>

    <!-- 主工作区 -->
    <div class="workbench-main">
      <WorkbenchFileUploadPanel
        v-if="activeStep === 'tender_file'"
        :lot-id="lotId"
        :project-id="projectId"
        :status="status"
        @uploaded="fetchOnce"
      />
      <WorkbenchFileParsingPanel
        v-else-if="activeStep === 'file_parsing'"
        :lot-id="lotId"
        :status="status"
        @uploaded="fetchOnce"
      />
      <WorkbenchOutlineGenPanel
        v-else-if="activeStep === 'outline_generation'"
        :lot-id="lotId"
        :project-id="projectId"
        :status="status"
        @uploaded="fetchOnce"
      />
      <WorkbenchContentEditingPanel
        v-else-if="activeStep === 'content_editing'"
        :lot-id="lotId"
        :project-id="projectId"
        :status="status"
      />
      <WorkbenchExportPanel
        v-else-if="activeStep === 'export'"
        :lot-id="lotId"
        :status="status"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { http } from '@/api/http'
import { listResponseTemplates } from '@/api/responseTemplate'
import { useWorkbenchPolling } from '@/composables/useWorkbenchPolling'
import type { StepKey } from '@/api/workbench'
import WorkbenchStepNav from './components/WorkbenchStepNav.vue'
import WorkbenchFileUploadPanel from './components/WorkbenchFileUploadPanel.vue'
import WorkbenchFileParsingPanel from './components/WorkbenchFileParsingPanel.vue'
import WorkbenchOutlineGenPanel from './components/WorkbenchOutlineGenPanel.vue'
import WorkbenchContentEditingPanel from './components/WorkbenchContentEditingPanel.vue'
import WorkbenchExportPanel from './components/WorkbenchExportPanel.vue'

const route = useRoute()
const router = useRouter()
const lotId = computed(() => Number(route.params.lotId))
const projectId = computed(() => Number(route.params.projectId))
const lotName = ref('')
const projectName = ref('')

// 响应文件入口: 该标段下的响应模板
const rtTemplates = ref<Array<{ id: number; source_file_name: string; status: string; status_display: string; confidence: number | null }>>([])

function rtStatusType(s: string): 'success' | 'warning' | 'danger' | 'info' | 'primary' {
  if (s === 'generated') return 'success'
  if (s === 'failed') return 'danger'
  if (s === 'confirmed' || s === 'analyzed') return 'warning'
  return 'info'
}

async function loadRtTemplates() {
  try {
    const { data } = await listResponseTemplates({ lot_id: lotId.value })
    rtTemplates.value = (data.results || []).map((t) => ({
      id: t.id,
      source_file_name: t.source_file_name,
      status: t.status,
      status_display: t.status_display,
      confidence: t.confidence,
    }))
  } catch (e) {
    // 静默
  }
}

function goWorkbench(id: number) {
  router.push(`/response-templates/${id}`)
}

const { status, loading, fetchOnce } = useWorkbenchPolling(() => lotId.value)

const activeStep = ref<StepKey>('tender_file')

const STEP_LABELS: Record<StepKey, string> = {
  tender_file: '上传招标文件',
  file_parsing: '文件解析中',
  outline_generation: '生成大纲',
  content_editing: '编辑内容',
  export: '导出文档',
}

const currentStepLabel = computed(() => {
  if (!status.value) return ''
  return STEP_LABELS[status.value.current_step]
})

const currentStepTagType = computed(() => {
  if (!status.value) return 'info'
  const st = status.value.steps[status.value.current_step]?.status
  if (st === 'doing') return 'warning'
  if (st === 'failed') return 'danger'
  if (st === 'done') return 'success'
  return 'info'
})

const overallProgress = computed(() => {
  if (!status.value) return 0
  const steps = Object.values(status.value.steps)
  const doneCount = steps.filter((s) => s.status === 'done').length
  const doingCount = steps.filter((s) => s.status === 'doing').length
  const progress = Math.round(((doneCount + doingCount * 0.5) / steps.length) * 100)
  return Math.min(progress, 100)
})

watch(
  () => status.value?.current_step,
  (step) => {
    if (step && step === 'content_editing') {
      const hasGeneratingOutline = (status.value?.steps.outline_generation.outlines || []).some(
        (o) => o.status === 'generating'
      )
      if (hasGeneratingOutline) {
        activeStep.value = 'outline_generation'
        return
      }
    }
    if (step) activeStep.value = step
  }
)

watch(
  () => lotId.value,
  async (id) => {
    if (!id) return
    try {
      const lotRes = await http.get<{ name: string; project: number }>(`/api/lots/${id}/`)
      lotName.value = lotRes.data.name
      const projId = lotRes.data.project
      const projRes = await http.get<{ name: string }>(`/api/projects/${projId}/`)
      projectName.value = projRes.data.name
      await loadRtTemplates()
    } catch (err) {
      console.error('加载标段信息失败:', err)
    }
  },
  { immediate: true }
)

function handleStepSelect(step: StepKey) {
  activeStep.value = step
}
</script>

<style scoped>
.rt-entry { margin-bottom: 16px; }
.rt-entry-inner { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.rt-entry-title { font-weight: 600; margin-right: 4px; }
.rt-tag { margin-right: 4px; }
.rt-conf { color: #909399; font-size: 12px; }
.rt-btn { margin-left: 4px; }
.lot-workbench {
  padding: 20px 24px;
  height: calc(100vh - 60px);
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: var(--el-fill-color-lighter);
}

.workbench-header {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.header-breadcrumb :deep(.el-breadcrumb__item) {
  font-size: 13px;
}

.header-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.page-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.header-right {
  display: flex;
  align-items: center;
}

.progress-info {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 240px;
}

.progress-label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

.progress-bar {
  flex: 1;
}

.progress-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  min-width: 36px;
  text-align: right;
}

.workbench-main {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 20px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  background: var(--el-bg-color);
}
</style>
