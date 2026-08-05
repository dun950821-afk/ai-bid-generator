<template>
  <WorkbenchPanelShell
    title="文件解析"
    :desc="summaryText"
    :icon="Document"
    :theme-color="STEP_THEME.file_parsing.color"
    :theme-bg-color="STEP_THEME.file_parsing.bgColor"
  >
    <!-- 进度概览 -->
    <div v-if="fileGroups.length" class="parse-overview">
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
          <span class="stat-value">{{ fileGroups.length }}</span>
          <span class="stat-label">文件组</span>
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

    <!-- 文件组列表（主文件 + 附件合并显示） -->
    <div v-if="fileGroups.length" class="file-groups">
      <div
        v-for="group in fileGroups"
        :key="group.mainFile.id"
        class="file-group"
        :class="{ 'is-expanded': expandedGroups.has(group.mainFile.id) }"
      >
        <!-- 主文件行 -->
        <div class="group-main" @click="toggleGroup(group.mainFile.id)">
          <div class="group-expand" v-if="group.attachments.length > 0">
            <el-icon :size="14" :class="{ 'is-expanded': expandedGroups.has(group.mainFile.id) }">
              <ArrowRight />
            </el-icon>
          </div>
          <div class="group-icon" :class="`is-${group.mainFile.display_status}`">
            <el-icon v-if="group.mainFile.display_status === 'parsing'" class="is-loading" :size="18"><Loading /></el-icon>
            <el-icon v-else-if="group.mainFile.display_status === 'ready'" :size="18"><Check /></el-icon>
            <el-icon v-else :size="18"><Close /></el-icon>
          </div>
          <div class="group-info">
            <div class="group-name">
              <span class="name-text">{{ group.mainFile.name }}</span>
              <el-tag v-if="group.attachments.length > 0" size="small" type="warning" effect="plain">
                +{{ group.attachments.length }} 附件
              </el-tag>
            </div>
            <div class="group-meta">
              <span>{{ statusText(group.mainFile.display_status) }}</span>
              <span v-if="group.mainFile.display_status === 'ready' && group.totalRequirementCount > 0" class="count-text">
                · 共 {{ group.totalRequirementCount }} 条条款
              </span>
              <span v-else-if="group.mainFile.display_status === 'ready' && group.totalRequirementCount === 0" class="warn-text">
                · 未抽到条款
              </span>
            </div>
          </div>
          <div class="group-actions" @click.stop>
            <el-button
              v-if="group.mainFile.display_status === 'failed'"
              size="small"
              type="warning"
              :loading="retryingId === group.mainFile.id"
              @click="handleRetry(group.mainFile.id)"
            >重试</el-button>
            <el-button size="small" type="primary" plain @click="viewDetail(group.mainFile.id)">详情</el-button>
          </div>
        </div>

        <!-- 实时进度（主文件） -->
        <div v-if="group.mainFile.async_task && group.mainFile.async_task.status !== 'success' && group.mainFile.async_task.status !== 'failed'" class="live-progress">
          <div class="live-progress-header">
            <span class="live-step">{{ group.mainFile.async_task.current_step || '处理中…' }}</span>
            <span class="live-percent">{{ group.mainFile.async_task.progress || 0 }}%</span>
          </div>
          <el-progress
            :percentage="group.mainFile.async_task.progress || 0"
            :stroke-width="6"
            :show-text="false"
            color="var(--el-color-warning)"
          />
        </div>

        <!-- 流水线阶段（主文件） -->
        <div v-if="group.mainFile.pipeline && group.mainFile.pipeline.length" class="pipeline">
          <div
            v-for="(stage, idx) in group.mainFile.pipeline"
            :key="stage.stage"
            class="pipeline-stage"
            :class="[`is-${stage.status}`, { 'is-empty-warn': stage.stage === 'requirement_extract' && stage.status === 'succeeded' && group.mainFile.requirement_count === 0 }]"
          >
            <div class="pipeline-track">
              <div class="pipeline-node">
                <el-icon v-if="stage.status === 'running'" class="is-loading" :size="12"><Loading /></el-icon>
                <el-icon v-else-if="stage.status === 'succeeded'" :size="12"><Check /></el-icon>
                <el-icon v-else-if="stage.status === 'failed'" :size="12"><Close /></el-icon>
                <span v-else-if="stage.status === 'skipped'" class="pipeline-skip">—</span>
                <span v-else class="pipeline-index">{{ idx + 1 }}</span>
              </div>
              <div v-if="idx < group.mainFile.pipeline.length - 1" class="pipeline-line" />
            </div>
            <div class="pipeline-info">
              <div class="pipeline-label">{{ stage.stage_display }}</div>
              <div class="pipeline-status">{{ stage.status_display }}</div>
            </div>
          </div>
        </div>

        <!-- 附件列表（展开时显示） -->
        <div v-if="expandedGroups.has(group.mainFile.id) && group.attachments.length > 0" class="group-attachments">
          <div
            v-for="attachment in group.attachments"
            :key="attachment.id"
            class="attachment-item"
            @click="viewDetail(attachment.id)"
          >
            <div class="attachment-icon">
              <el-icon :size="14"><Document /></el-icon>
            </div>
            <div class="attachment-info">
              <div class="attachment-name">{{ attachment.name }}</div>
              <div class="attachment-meta">
                <span class="status-dot" :class="`is-${attachment.display_status}`" />
                <span class="status-text">{{ statusText(attachment.display_status) }}</span>
                <span v-if="attachment.requirement_count > 0" class="req-count">
                  {{ attachment.requirement_count }} 条
                </span>
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
import { Document, Loading, Check, Close, ArrowRight } from '@element-plus/icons-vue'
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
const expandedGroups = ref<Set<number>>(new Set())

const files = computed<WorkbenchFile[]>(() => props.status?.steps.tender_file.files ?? [])

// 文件分组：主文件 + 其附件
// 策略：同一标段的所有文件视为一组，第一个文件（或名称不含"附件"的）作为主文件
interface FileGroup {
  mainFile: WorkbenchFile
  attachments: WorkbenchFile[]
  totalRequirementCount: number
}

const fileGroups = computed<FileGroup[]>(() => {
  if (!files.value.length) return []

  // 找主文件：名称不含"附件"的文件，或第一个文件
  const mainFile = files.value.find(f => !f.name.includes('附件')) || files.value[0]
  const attachments = files.value.filter(f => f.id !== mainFile.id)

  const totalRequirementCount = files.value.reduce((sum, f) => sum + (f.requirement_count || 0), 0)

  return [{
    mainFile,
    attachments,
    totalRequirementCount,
  }]
})

// 统计
const readyCount = computed(() => fileGroups.value.filter(g => g.mainFile.display_status === 'ready').length)
const parsingCount = computed(() => fileGroups.value.filter(g => g.mainFile.display_status === 'parsing').length)
const failedCount = computed(() => fileGroups.value.filter(g => g.mainFile.display_status === 'failed').length)
const allReady = computed(() => fileGroups.value.length > 0 && readyCount.value === fileGroups.value.length)

const totalCount = computed(() => fileGroups.value.length)
const readyPercent = computed(() => totalCount.value ? Math.round((readyCount.value / totalCount.value) * 100) : 0)
const parsingPercent = computed(() => totalCount.value ? Math.round((parsingCount.value / totalCount.value) * 100) : 0)
const failedPercent = computed(() => totalCount.value ? Math.round((failedCount.value / totalCount.value) * 100) : 0)

const summaryText = computed(() => {
  if (!fileGroups.value.length) return '暂无文件'
  if (allReady.value) return `全部 ${fileGroups.value.length} 个文件组已就绪`
  if (parsingCount.value > 0) return `${parsingCount.value} 个解析中，${readyCount.value} 个已就绪`
  if (failedCount.value > 0) return `${failedCount.value} 个解析失败`
  return `${fileGroups.value.length} 个文件组`
})

function toggleGroup(mainFileId: number) {
  if (expandedGroups.value.has(mainFileId)) {
    expandedGroups.value.delete(mainFileId)
  } else {
    expandedGroups.value.add(mainFileId)
  }
}

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

/* 文件组样式 */
.file-groups {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.file-group {
  border: 1px solid var(--el-border-color);
  border-radius: 10px;
  background: var(--el-bg-color);
  overflow: hidden;
  transition: box-shadow 0.2s ease;
}

.file-group:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.group-main {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  cursor: pointer;
}

.group-expand {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-secondary);
  transition: transform 0.2s ease;
}

.group-expand .is-expanded {
  transform: rotate(90deg);
}

.group-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.group-icon.is-ready {
  background: var(--el-color-success-light-9);
  color: var(--el-color-success);
}

.group-icon.is-parsing {
  background: var(--el-color-warning-light-9);
  color: var(--el-color-warning);
}

.group-icon.is-failed {
  background: var(--el-color-danger-light-9);
  color: var(--el-color-danger);
}

.group-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.group-name {
  display: flex;
  align-items: center;
  gap: 8px;
}

.name-text {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.group-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.warn-text { color: var(--el-color-warning); font-weight: 600; }
.count-text { color: var(--el-color-success); }

.group-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

/* 实时进度 */
.live-progress {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 16px;
  margin: 0 16px 12px;
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

/* 流水线 */
.pipeline {
  display: flex;
  align-items: flex-start;
  padding: 12px 16px;
  margin: 0 16px 12px;
  border-top: 1px dashed var(--el-border-color-lighter);
}

.pipeline-stage {
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
  height: 20px;
}

.pipeline-node {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 600;
  border: 1.5px solid var(--el-border-color);
  background: var(--el-bg-color);
  color: var(--el-text-color-secondary);
}

.pipeline-index {
  font-size: 10px;
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
  font-size: 12px;
  font-weight: 600;
}

.pipeline-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.pipeline-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.pipeline-status {
  font-size: 10px;
  color: var(--el-text-color-secondary);
}

.pipeline-stage.is-running .pipeline-status { color: var(--el-color-warning); }
.pipeline-stage.is-succeeded .pipeline-status { color: var(--el-color-success); }
.pipeline-stage.is-failed .pipeline-status { color: var(--el-color-danger); }

/* 附件列表 */
.group-attachments {
  background: var(--el-fill-color-lighter);
  border-top: 1px dashed var(--el-border-color-lighter);
}

.attachment-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px 10px 48px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.attachment-item:hover {
  background: var(--el-fill-color);
}

.attachment-item + .attachment-item {
  border-top: 1px solid var(--el-border-color-lighter);
}

.attachment-icon {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: var(--el-color-warning-light-9);
  color: var(--el-color-warning);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.attachment-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.attachment-name {
  font-size: 13px;
  color: var(--el-text-color-primary);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.attachment-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-dot.is-ready { background: var(--el-color-success); }
.status-dot.is-parsing { background: var(--el-color-warning); }
.status-dot.is-failed { background: var(--el-color-danger); }

.status-text {
  color: var(--el-text-color-secondary);
}

.req-count {
  color: var(--el-color-success);
  font-weight: 500;
}

@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(230, 162, 60, 0.4); }
  50% { box-shadow: 0 0 0 4px rgba(230, 162, 60, 0); }
}
</style>
