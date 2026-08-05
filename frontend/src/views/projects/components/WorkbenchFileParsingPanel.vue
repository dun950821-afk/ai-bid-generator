<template>
  <WorkbenchPanelShell
    title="文件解析"
    :desc="summaryText"
    :icon="Document"
    :theme-color="STEP_THEME.file_parsing.color"
    :theme-bg-color="STEP_THEME.file_parsing.bgColor"
  >
    <!-- 进度概览 -->
    <div v-if="files.length" class="parse-overview">
      <div class="overview-stats">
        <div class="stat-item ready">
          <span class="stat-value">{{ readyCount }}</span>
          <span class="stat-label">已就绪</span>
        </div>
        <div class="stat-item parsing">
          <span class="stat-value">{{ parsingCount }}</span>
          <span class="stat-label">解析中</span>
        </div>
        <div class="stat-item failed">
          <span class="stat-value">{{ failedCount }}</span>
          <span class="stat-label">失败</span>
        </div>
        <div class="stat-item total">
          <span class="stat-value">{{ files.length }}</span>
          <span class="stat-label">总计</span>
        </div>
      </div>
      <div class="overview-bar">
        <div class="bar-segment ready" :style="{ width: readyPercent + '%' }" />
        <div class="bar-segment parsing" :style="{ width: parsingPercent + '%' }" />
        <div class="bar-segment failed" :style="{ width: failedPercent + '%' }" />
      </div>
    </div>

    <!-- 完成态引导 -->
    <el-alert
      v-if="allReady"
      title="全部文件解析完成"
      type="success"
      :closable="false"
      show-icon
      class="completion-alert"
    >
      <template #default>
        可前往「大纲生成」步骤生成投标文件大纲
      </template>
    </el-alert>

    <!-- 解析文件列表 -->
    <div v-if="files.length" class="file-list">
      <div v-for="file in files" :key="file.id" class="parse-file-card">
        <div class="file-main">
          <div class="file-status-icon" :class="`is-${file.display_status}`">
            <el-icon v-if="file.display_status === 'parsing'" class="is-loading" :size="18"><Loading /></el-icon>
            <el-icon v-else-if="file.display_status === 'ready'" :size="18"><Check /></el-icon>
            <el-icon v-else :size="18"><Close /></el-icon>
          </div>
          <div class="file-detail">
            <div class="file-name">{{ file.name }}</div>
            <div class="file-status-line">
              <span>{{ statusText(file.display_status) }}</span>
              <span v-if="file.display_status === 'ready' && file.requirement_count === 0" class="warn-text">
                · 未抽到条款
              </span>
              <span v-else-if="file.display_status === 'ready' && file.requirement_count > 0" class="count-text">
                · 已抽取 {{ file.requirement_count }} 条
              </span>
            </div>
          </div>
          <div class="file-actions">
            <el-button
              v-if="file.display_status === 'failed'"
              size="small"
              type="warning"
              :loading="retryingId === file.id"
              @click="handleRetry(file.id)"
            >重试</el-button>
            <el-button size="small" type="primary" plain @click="viewDetail(file.id)">详情</el-button>
          </div>
        </div>

        <!-- 实时进度 -->
        <div v-if="file.async_task && file.async_task.status !== 'success' && file.async_task.status !== 'failed'" class="live-progress">
          <div class="live-progress-header">
            <span class="live-step">{{ file.async_task.current_step || '处理中…' }}</span>
            <span class="live-percent">{{ file.async_task.progress || 0 }}%</span>
          </div>
          <el-progress
            :percentage="file.async_task.progress || 0"
            :stroke-width="6"
            :show-text="false"
            color="var(--el-color-warning)"
          />
        </div>

        <!-- 流水线阶段 -->
        <div v-if="file.pipeline && file.pipeline.length" class="pipeline">
          <div
            v-for="(stage, idx) in file.pipeline"
            :key="stage.stage"
            class="pipeline-stage"
            :class="[`is-${stage.status}`, { 'is-empty-warn': stage.stage === 'requirement_extract' && stage.status === 'succeeded' && file.requirement_count === 0 }]"
          >
            <div class="pipeline-track">
              <div class="pipeline-node">
                <el-icon v-if="stage.status === 'running'" class="is-loading" :size="12"><Loading /></el-icon>
                <el-icon v-else-if="stage.status === 'succeeded'" :size="12"><Check /></el-icon>
                <el-icon v-else-if="stage.status === 'failed'" :size="12"><Close /></el-icon>
                <span v-else-if="stage.status === 'skipped'" class="pipeline-skip">—</span>
                <span v-else class="pipeline-index">{{ idx + 1 }}</span>
              </div>
              <div v-if="idx < file.pipeline.length - 1" class="pipeline-line" />
            </div>
            <div class="pipeline-info">
              <div class="pipeline-label">{{ stage.stage_display }}</div>
              <div class="pipeline-status">
                {{ stage.status_display }}
                <span
                  v-if="stage.stage === 'requirement_extract' && stage.status === 'succeeded' && file.requirement_count === 0"
                  class="pipeline-warn-hint"
                >（未抽到）</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <el-empty v-else description="暂无文件，请先在「招标文件」步骤上传" :image-size="80" />
  </WorkbenchPanelShell>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Document, Loading, Check, Close } from '@element-plus/icons-vue'
import { retryParse } from '@/api/tender'
import { mapFileDisplayStatus, DISPLAY_STATUS_LABEL } from '@/utils/fileStatusMap'
import type { WorkbenchStatus, WorkbenchFile } from '@/api/workbench'
import WorkbenchPanelShell from './WorkbenchPanelShell.vue'
import { STEP_THEME } from './workbenchTheme'

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

const totalCount = computed(() => files.value.length)
const readyPercent = computed(() => totalCount.value ? Math.round((readyCount.value / totalCount.value) * 100) : 0)
const parsingPercent = computed(() => totalCount.value ? Math.round((parsingCount.value / totalCount.value) * 100) : 0)
const failedPercent = computed(() => totalCount.value ? Math.round((failedCount.value / totalCount.value) * 100) : 0)

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
.parse-overview {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: var(--el-fill-color-lighter);
  border-radius: 10px;
}

.overview-stats {
  display: flex;
  gap: 24px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.stat-value {
  font-size: 20px;
  font-weight: 700;
  line-height: 1;
}

.stat-item.ready .stat-value { color: var(--el-color-success); }
.stat-item.parsing .stat-value { color: var(--el-color-warning); }
.stat-item.failed .stat-value { color: var(--el-color-danger); }
.stat-item.total .stat-value { color: var(--el-text-color-primary); }

.stat-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.overview-bar {
  display: flex;
  height: 8px;
  border-radius: 4px;
  overflow: hidden;
  background: var(--el-border-color-lighter);
  gap: 1px;
}

.bar-segment {
  height: 100%;
  transition: width 0.3s ease;
}

.bar-segment.ready { background: var(--el-color-success); }
.bar-segment.parsing { background: var(--el-color-warning); }
.bar-segment.failed { background: var(--el-color-danger); }

.completion-alert {
  border-radius: 10px;
}

.file-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.parse-file-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--el-border-color);
  border-radius: 10px;
  background: var(--el-bg-color);
  transition: box-shadow 0.2s ease;
}

.parse-file-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
}

.file-main {
  display: flex;
  align-items: center;
  gap: 12px;
}

.file-status-icon {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.file-status-icon.is-parsing {
  color: var(--el-color-warning);
  background: var(--el-color-warning-light-9);
}

.file-status-icon.is-ready {
  color: var(--el-color-success);
  background: var(--el-color-success-light-9);
}

.file-status-icon.is-failed {
  color: var(--el-color-danger);
  background: var(--el-color-danger-light-9);
}

.file-detail {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.file-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.file-status-line {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.warn-text { color: var(--el-color-warning); font-weight: 600; }
.count-text { color: var(--el-text-color-secondary); }

.file-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.live-progress {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  background: var(--el-color-warning-light-9);
  border-radius: 8px;
}

.live-progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.live-step {
  font-size: 12px;
  color: var(--el-text-color-primary);
}

.live-percent {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-color-warning);
}

.pipeline {
  display: flex;
  align-items: flex-start;
  padding-top: 12px;
  border-top: 1px dashed var(--el-border-color-lighter);
}

.pipeline-stage {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
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
  font-size: 11px;
  font-weight: 600;
  border: 1.5px solid var(--el-border-color);
  background: var(--el-bg-color);
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

.pipeline-stage.is-running .pipeline-node {
  color: var(--el-color-warning);
  border-color: var(--el-color-warning);
  background: var(--el-color-warning-light-9);
  animation: pulse 1.5s ease-in-out infinite;
}

.pipeline-stage.is-succeeded .pipeline-node {
  color: var(--el-color-success);
  border-color: var(--el-color-success);
  background: var(--el-color-success-light-9);
}

.pipeline-stage.is-succeeded .pipeline-line {
  background: var(--el-color-success);
}

.pipeline-stage.is-failed .pipeline-node {
  color: var(--el-color-danger);
  border-color: var(--el-color-danger);
  background: var(--el-color-danger-light-9);
}

.pipeline-stage.is-skipped .pipeline-node {
  color: var(--el-text-color-placeholder);
  border-color: var(--el-border-color-light);
  background: var(--el-fill-color-light);
}

.pipeline-skip {
  font-size: 14px;
  font-weight: 600;
}

.pipeline-stage.is-skipped .pipeline-status {
  color: var(--el-text-color-placeholder);
}

.pipeline-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.pipeline-label {
  font-size: 12px;
  font-weight: 500;
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

.pipeline-stage.is-running .pipeline-status { color: var(--el-color-warning); }
.pipeline-stage.is-succeeded .pipeline-status { color: var(--el-color-success); }
.pipeline-stage.is-failed .pipeline-status { color: var(--el-color-danger); }
.pipeline-stage.is-empty-warn .pipeline-status { color: var(--el-color-warning); }

.pipeline-warn-hint {
  color: var(--el-color-warning);
  font-weight: 600;
}

@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(230, 162, 60, 0.4); }
  50% { box-shadow: 0 0 0 4px rgba(230, 162, 60, 0); }
}
</style>
