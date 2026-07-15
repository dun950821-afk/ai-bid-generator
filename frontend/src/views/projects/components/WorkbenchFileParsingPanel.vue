<template>
  <div class="panel">
    <div class="panel-topline" style="--step-color: #722ED1" />

    <div class="panel-header">
      <div class="panel-title">
        <el-icon :size="20" color="#722ED1"><Document /></el-icon>
        <span>文件解析</span>
      </div>
      <div class="panel-desc">{{ summaryText }}</div>
    </div>

    <!-- 比例条 -->
    <div v-if="files.length" class="ratio-bar">
      <div class="ratio-seg is-ready" :style="{ flex: readyCount }" />
      <div class="ratio-seg is-parsing" :style="{ flex: parsingCount }" />
      <div class="ratio-seg is-failed" :style="{ flex: failedCount }" />
    </div>
    <div v-if="files.length" class="ratio-legend">
      <span class="legend-item"><i class="dot is-ready" />已就绪 {{ readyCount }}</span>
      <span class="legend-item"><i class="dot is-parsing" />解析中 {{ parsingCount }}</span>
      <span class="legend-item"><i class="dot is-failed" />失败 {{ failedCount }}</span>
    </div>

    <!-- 完成态引导 -->
    <el-alert
      v-if="allReady"
      title="全部文件解析完成"
      type="success"
      :closable="false"
      show-icon
    >
      <template #default>
        可前往「大纲生成」步骤生成投标文件大纲
      </template>
    </el-alert>

    <!-- 解析中文件列表 -->
    <div v-if="files.length" class="file-rows">
      <div v-for="file in files" :key="file.id" class="file-row">
        <div class="row-main">
          <div class="row-icon" :class="`is-${file.display_status}`">
            <el-icon v-if="file.display_status === 'parsing'" class="is-loading"><Loading /></el-icon>
            <el-icon v-else-if="file.display_status === 'ready'"><Check /></el-icon>
            <el-icon v-else><Close /></el-icon>
          </div>
          <div class="row-info">
            <div class="row-name">{{ file.name }}</div>
            <div class="row-status">{{ statusText(file.display_status) }}</div>
          </div>
          <el-button
            v-if="file.display_status === 'failed'"
            size="small"
            type="warning"
            :loading="retryingId === file.id"
            @click="handleRetry(file.id)"
          >重试</el-button>
          <el-button size="small" link @click="viewDetail(file.id)">详情</el-button>
        </div>

        <!-- 流水线阶段进度 -->
        <div v-if="file.pipeline && file.pipeline.length" class="pipeline">
          <div
            v-for="(stage, idx) in file.pipeline"
            :key="stage.stage"
            class="pipeline-step"
            :class="`is-${stage.status}`"
          >
            <div class="pipeline-track">
              <div class="pipeline-node">
                <el-icon v-if="stage.status === 'running'" class="is-loading"><Loading /></el-icon>
                <el-icon v-else-if="stage.status === 'succeeded'"><Check /></el-icon>
                <el-icon v-else-if="stage.status === 'failed'"><Close /></el-icon>
                <span v-else-if="stage.status === 'skipped'" class="pipeline-skip">—</span>
                <span v-else class="pipeline-index">{{ idx + 1 }}</span>
              </div>
              <div v-if="idx < file.pipeline.length - 1" class="pipeline-line" />
            </div>
            <div class="pipeline-label">{{ stage.stage_label }}</div>
            <div class="pipeline-status">{{ stage.status_label }}</div>
          </div>
        </div>

        <!-- 实时进度（解析中显示 AsyncTask 当前步骤与百分比） -->
        <div v-if="file.async_task && file.async_task.status !== 'success' && file.async_task.status !== 'failed'" class="live-progress">
          <el-progress
            :percentage="file.async_task.progress || 0"
            :status="file.async_task.status === 'failed' ? 'exception' : undefined"
            :stroke-width="6"
          />
          <div class="live-step">{{ file.async_task.current_step || '处理中…' }}</div>
        </div>
      </div>
    </div>
    <el-empty v-else description="暂无文件，请先在「招标文件」步骤上传" :image-size="60" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Document, Loading, Check, Close } from '@element-plus/icons-vue'
import { retryParse } from '@/api/tender'
import { mapFileDisplayStatus, DISPLAY_STATUS_LABEL } from '@/utils/fileStatusMap'
import type { WorkbenchStatus, WorkbenchFile } from '@/api/workbench'

const props = defineProps<{
  lotId: number
  status: WorkbenchStatus | null
}>()

const emit = defineEmits<{ uploaded: [] }>()

const router = useRouter()
const retryingId = ref<number | null>(null)

const files = computed<WorkbenchFile[]>(() => props.status?.steps.tender_file.files ?? [])
const readyCount = computed(() => files.value.filter(f => f.display_status === 'ready').length)
const parsingCount = computed(() => files.value.filter(f => f.display_status === 'parsing').length)
const failedCount = computed(() => files.value.filter(f => f.display_status === 'failed').length)
const allReady = computed(() => files.value.length > 0 && readyCount.value === files.value.length)

const summaryText = computed(() => {
  if (!files.value.length) return '暂无文件'
  if (allReady.value) return `全部 ${files.value.length} 个文件已就绪`
  if (parsingCount.value > 0) return `${parsingCount.value} 个解析中，${readyCount.value} 个已就绪`
  if (failedCount.value > 0) return `${failedCount.value} 个解析失败`
  return `${files.value.length} 个文件`
})

function statusText(status: string): string {
  return DISPLAY_STATUS_LABEL[mapFileDisplayStatus(status)]
}

async function handleRetry(fileId: number) {
  retryingId.value = fileId
  try {
    await retryParse(fileId)
    ElMessage.success('已触发重新解析')
    emit('uploaded')
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '操作失败')
  } finally {
    retryingId.value = null
  }
}

function viewDetail(fileId: number) {
  router.push({ name: 'tender-file-detail', params: { fileId } })
}
</script>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.panel-topline {
  height: 2px;
  background: var(--step-color, var(--el-color-primary));
  border-radius: 1px;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
}

.panel-desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.ratio-bar {
  display: flex;
  height: 8px;
  border-radius: 4px;
  overflow: hidden;
  background: var(--el-fill-color-light);
  gap: 2px;
}

.ratio-seg {
  height: 100%;
  min-width: 0;
}

.ratio-seg.is-ready { background: var(--el-color-success); }
.ratio-seg.is-parsing { background: var(--el-color-warning); }
.ratio-seg.is-failed { background: var(--el-color-danger); }

.ratio-legend {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.dot.is-ready { background: var(--el-color-success); }
.dot.is-parsing { background: var(--el-color-warning); }
.dot.is-failed { background: var(--el-color-danger); }

.file-rows {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.file-row {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 16px;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  background: var(--el-fill-color-blank);
}

.row-main {
  display: flex;
  align-items: center;
  gap: 12px;
}

.row-icon {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.row-icon.is-parsing {
  color: var(--el-color-warning);
  background: var(--el-color-warning-light-9);
}

.row-icon.is-ready {
  color: var(--el-color-success);
  background: var(--el-color-success-light-9);
}

.row-icon.is-failed {
  color: var(--el-color-danger);
  background: var(--el-color-danger-light-9);
}

.row-info {
  flex: 1;
  min-width: 0;
}

.row-name {
  font-size: 14px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.row-status {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}

.pipeline {
  display: flex;
  align-items: flex-start;
  padding: 8px 4px 4px;
  margin: 0 -4px;
  border-top: 1px dashed var(--el-border-color-lighter);
}

.pipeline-step {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.pipeline-track {
  display: flex;
  align-items: center;
  width: 100%;
  height: 24px;
}

.pipeline-node {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  border: 1.5px solid var(--el-border-color);
  background: var(--el-fill-color-blank);
  color: var(--el-text-color-secondary);
}

.pipeline-index {
  font-size: 11px;
}

.pipeline-line {
  flex: 1;
  height: 2px;
  background: var(--el-border-color);
  margin: 0 2px;
}

.pipeline-step.is-running .pipeline-node {
  color: var(--el-color-warning);
  border-color: var(--el-color-warning);
  background: var(--el-color-warning-light-9);
}

.pipeline-step.is-succeeded .pipeline-node {
  color: var(--el-color-success);
  border-color: var(--el-color-success);
  background: var(--el-color-success-light-9);
}

.pipeline-step.is-succeeded .pipeline-line {
  background: var(--el-color-success);
}

.pipeline-step.is-failed .pipeline-node {
  color: var(--el-color-danger);
  border-color: var(--el-color-danger);
  background: var(--el-color-danger-light-9);
}

.pipeline-step.is-skipped .pipeline-node {
  color: var(--el-text-color-placeholder);
  border-color: var(--el-border-color-light);
  background: var(--el-fill-color-light);
}

.pipeline-skip {
  font-size: 14px;
  font-weight: 600;
}

.pipeline-step.is-skipped .pipeline-status {
  color: var(--el-text-color-placeholder);
}

.pipeline-label {
  font-size: 12px;
  color: var(--el-text-color-primary);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.pipeline-status {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.pipeline-step.is-running .pipeline-status {
  color: var(--el-color-warning);
}

.pipeline-step.is-succeeded .pipeline-status {
  color: var(--el-color-success);
}

.pipeline-step.is-failed .pipeline-status {
  color: var(--el-color-danger);
}

.live-progress {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px 4px 0;
}

.live-step {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
