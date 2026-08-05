<template>
  <WorkbenchPanelShell
    title="导出 Word 文档"
    :desc="exportSummary"
    :icon="Files"
    :theme-color="STEP_THEME.export.color"
    :theme-bg-color="STEP_THEME.export.bgColor"
  >
    <!-- 当前大纲提示 -->
    <div v-if="currentOutlineName" class="outline-banner success">
      <el-icon :size="18"><CircleCheckFilled /></el-icon>
      <span class="banner-label">当前默认大纲：</span>
      <span class="banner-name">{{ currentOutlineName }}</span>
      <el-tag type="success" size="small" effect="light">当前版本</el-tag>
    </div>
    <div v-else-if="hasOutlinesButNoCurrent" class="outline-banner warning">
      <el-icon :size="18"><WarningFilled /></el-icon>
      <span>存在多个大纲但未指定当前版本，请到「大纲生成」步骤点「设为当前」</span>
    </div>

    <!-- 文档列表 -->
    <div v-if="documents.length" class="document-section">
      <div class="section-header">
        <span class="section-title">生成文档</span>
        <span class="section-count">{{ documents.length }} 个</span>
      </div>
      <div class="document-list">
        <div
          v-for="doc in documents"
          :key="doc.id"
          class="document-item"
          :class="{ 'is-current': doc.outline_is_current }"
        >
          <div class="doc-icon">
            <el-icon :size="22"><Document /></el-icon>
          </div>
          <div class="doc-info">
            <div class="doc-title">{{ doc.title }}</div>
            <div class="doc-meta">
              <el-tag :type="getDocStatusType(doc.status)" size="small" effect="plain">
                {{ getDocStatusLabel(doc.status) }}
              </el-tag>
              <el-tag
                v-if="doc.outline_name"
                :type="doc.outline_is_current ? 'success' : 'info'"
                size="small"
                :effect="doc.outline_is_current ? 'light' : 'plain'"
              >
                {{ doc.outline_is_current ? '当前版本' : '历史版本' }} · {{ doc.outline_name }}
              </el-tag>
              <span v-if="doc.created_at" class="doc-time">{{ formatDateTime(doc.created_at) }}</span>
            </div>
          </div>
          <el-button type="primary" size="small" @click="openWordEditor(doc.id)">
            打开编辑器
          </el-button>
        </div>
      </div>
    </div>
    <el-empty v-else description="暂无 Word 文档" :image-size="80">
      <template #description>
        <p>暂无 Word 文档</p>
        <p class="empty-tip">请在「内容编辑」步骤完成正文后生成文档</p>
      </template>
    </el-empty>
  </WorkbenchPanelShell>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { Document, Files, CircleCheckFilled, WarningFilled } from '@element-plus/icons-vue'
import type { WorkbenchStatus } from '@/api/workbench'
import WorkbenchPanelShell from './WorkbenchPanelShell.vue'
import { STEP_THEME } from './workbenchTheme'

const props = defineProps<{
  lotId: number
  status: WorkbenchStatus | null
}>()

const router = useRouter()

const documents = computed(() => props.status?.steps.export.documents ?? [])
const outlines = computed(() => props.status?.steps.outline_generation.outlines ?? [])
const currentOutlineName = computed(() => {
  const cur = outlines.value.find(o => o.is_current)
  return cur?.name || ''
})
const hasOutlinesButNoCurrent = computed(
  () => outlines.value.length > 0 && !outlines.value.some(o => o.is_current),
)

const exportSummary = computed(() => {
  const n = documents.value.length
  return n ? `${n} 个文档` : '暂无文档'
})

function openWordEditor(docId: number) {
  const url = router.resolve(`/bid-documents/${docId}/word-editor`).href
  window.open(url, '_blank')
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function getDocStatusType(status: string): string {
  const map: Record<string, string> = {
    draft: 'info', active: 'success', archived: 'info', ready: 'success',
  }
  return map[status] || 'info'
}

function getDocStatusLabel(status: string): string {
  const map: Record<string, string> = {
    draft: '草稿', active: '活跃', archived: '已归档', ready: '就绪',
  }
  return map[status] || status
}
</script>

<style scoped>
.outline-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-radius: 10px;
  font-size: 13px;
}

.outline-banner.success {
  background: var(--el-color-success-light-9);
  border: 1px solid var(--el-color-success-light-5);
  color: var(--el-color-success);
}

.outline-banner.warning {
  background: var(--el-color-warning-light-9);
  border: 1px solid var(--el-color-warning-light-5);
  color: var(--el-color-warning);
}

.banner-label {
  color: var(--el-text-color-secondary);
}

.banner-name {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.document-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.section-count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.document-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.document-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border: 1px solid var(--el-border-color);
  border-radius: 10px;
  background: var(--el-bg-color);
  transition: all 0.2s ease;
}

.document-item:hover {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
}

.document-item.is-current {
  border-color: var(--el-color-success-light-5);
  background: var(--el-color-success-light-9);
}

.doc-icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  background: var(--el-color-success-light-9);
  color: var(--el-color-success);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.doc-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.doc-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.doc-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.doc-time {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.empty-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}
</style>
