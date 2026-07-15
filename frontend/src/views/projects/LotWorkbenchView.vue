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

    <!-- 主工作区（浅色，按阶段渲染差异化面板） -->
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
import { useRoute } from 'vue-router'
import { http } from '@/api/http'
import { useWorkbenchPolling } from '@/composables/useWorkbenchPolling'
import type { StepKey } from '@/api/workbench'
import WorkbenchStepNav from './components/WorkbenchStepNav.vue'
import WorkbenchFileUploadPanel from './components/WorkbenchFileUploadPanel.vue'
import WorkbenchFileParsingPanel from './components/WorkbenchFileParsingPanel.vue'
import WorkbenchOutlineGenPanel from './components/WorkbenchOutlineGenPanel.vue'
import WorkbenchContentEditingPanel from './components/WorkbenchContentEditingPanel.vue'
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
    // 后端已修复：有进行中 generate_outline 任务时强制停留 outline_generation。
    // 前端再加一层保护：当存在 generating 状态的 outline 时，不切到 content_editing，
    // 避免任何边界场景下用户看到空大纲编辑面板
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

.workbench-main {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 24px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  background: var(--el-fill-color-blank);
}
</style>
