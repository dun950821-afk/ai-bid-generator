<template>
  <div class="lot-workbench" v-loading="loading">
    <!-- 顶部：面包屑 + 标段标题 + 状态 -->
    <div class="workbench-header">
      <el-breadcrumb separator="/">
        <el-breadcrumb-item :to="{ path: `/projects/${projectId}` }">{{ projectName }}</el-breadcrumb-item>
        <el-breadcrumb-item>{{ lotName }}</el-breadcrumb-item>
      </el-breadcrumb>
      <div class="header-title">
        <h2>{{ lotName }}</h2>
        <el-tag v-if="currentStepLabel" type="warning" size="small">{{ currentStepLabel }}</el-tag>
      </div>
    </div>

    <!-- 步骤导航条 -->
    <WorkbenchStepNav
      :current-step="activeStep"
      :status="status"
      @select="handleStepSelect"
    />

    <!-- 主体：左侧栏 + 主工作区 -->
    <div class="workbench-body">
      <div class="workbench-sidebar">
        <WorkbenchSidebar
          :status="status"
          @select-outline="handleSelectOutline"
          @upload-click="activeStep = 'tender_file'"
          @create-outline-click="activeStep = 'outline_generation'"
        />
      </div>
      <div class="workbench-main">
        <WorkbenchFilePanel
          v-if="activeStep === 'tender_file' || activeStep === 'file_parsing'"
          :lot-id="lotId"
          :project-id="projectId"
          :status="status"
          @uploaded="fetchOnce"
        />
        <WorkbenchOutlinePanel
          v-else-if="activeStep === 'outline_generation' || activeStep === 'content_editing'"
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { http } from '@/api/http'
import { useWorkbenchPolling } from '@/composables/useWorkbenchPolling'
import type { StepKey } from '@/api/workbench'
import WorkbenchStepNav from './components/WorkbenchStepNav.vue'
import WorkbenchSidebar from './components/WorkbenchSidebar.vue'
import WorkbenchFilePanel from './components/WorkbenchFilePanel.vue'
import WorkbenchOutlinePanel from './components/WorkbenchOutlinePanel.vue'
import WorkbenchExportPanel from './components/WorkbenchExportPanel.vue'

const route = useRoute()
const lotId = computed(() => Number(route.params.lotId))
const projectId = computed(() => Number(route.params.projectId))
const lotName = ref('')
const projectName = ref('')

const { status, loading, fetchOnce } = useWorkbenchPolling(() => lotId.value)

const activeStep = ref<StepKey>('tender_file')

const currentStepLabel = computed(() => {
  if (!status.value) return ''
  const labels: Record<StepKey, string> = {
    tender_file: '上传招标文件',
    file_parsing: '文件解析中',
    outline_generation: '生成大纲',
    content_editing: '编辑内容',
    export: '导出文档',
  }
  return labels[status.value.current_step]
})

watch(
  () => status.value?.current_step,
  (step) => {
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
    } catch (err) {
      console.error('加载标段信息失败:', err)
    }
  },
  { immediate: true }
)

function handleStepSelect(step: StepKey) {
  activeStep.value = step
}

function handleSelectOutline(_outlineId: number) {
  activeStep.value = 'content_editing'
}
</script>

<style scoped>
.lot-workbench {
  padding: 20px;
  height: calc(100vh - 100px);
  display: flex;
  flex-direction: column;
}

.workbench-header {
  margin-bottom: 16px;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
}

.header-title h2 {
  margin: 0;
  font-size: 20px;
}

.workbench-body {
  display: flex;
  gap: 16px;
  flex: 1;
  min-height: 0;
}

.workbench-sidebar {
  width: 280px;
  flex-shrink: 0;
}

.workbench-main {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 16px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  background: var(--el-fill-color-blank);
}
</style>
