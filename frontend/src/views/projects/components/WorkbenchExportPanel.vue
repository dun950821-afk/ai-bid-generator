<template>
  <div class="panel">
    <div class="panel-topline" style="--step-color: #52C41A" />

    <div class="panel-header">
      <div class="panel-title">
        <el-icon :size="20" color="#52C41A"><Files /></el-icon>
        <span>导出 Word 文档</span>
      </div>
      <div class="panel-desc">{{ documents.length }} 个文档</div>
    </div>

    <!-- 当前大纲提示 -->
    <div v-if="currentOutlineName" class="current-banner">
      <el-icon :size="16" color="#52C41A"><CircleCheckFilled /></el-icon>
      <span class="banner-label">当前默认大纲：</span>
      <span class="banner-name">{{ currentOutlineName }}</span>
      <el-tag type="success" size="small" effect="light">当前版本</el-tag>
    </div>
    <div v-else-if="hasOutlinesButNoCurrent" class="current-banner warn">
      <el-icon :size="16" color="#FA8C16"><WarningFilled /></el-icon>
      <span>存在多个大纲但未指定当前版本，请到「大纲生成」步骤点「设为当前」</span>
    </div>

    <div v-if="documents.length" class="doc-cards">
      <div
        v-for="doc in documents"
        :key="doc.id"
        class="doc-card"
        :class="{ 'is-current': doc.outline_is_current }"
      >
        <div class="doc-icon">
          <el-icon :size="20"><Document /></el-icon>
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
    <el-empty v-else description="暂无 Word 文档" :image-size="60">
      <template #description>
        <p>暂无 Word 文档</p>
        <p class="empty-tip">请在「内容编辑」步骤完成正文后生成文档</p>
      </template>
    </el-empty>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { Document, Files, CircleCheckFilled, WarningFilled } from '@element-plus/icons-vue'
import type { WorkbenchStatus } from '@/api/workbench'

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

.current-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border: 1px solid var(--el-color-success-light-5);
  border-left: 4px solid #52C41A;
  border-radius: 8px;
  background: var(--el-color-success-light-9);
  font-size: 13px;
}

.current-banner.warn {
  border-color: var(--el-color-warning-light-5);
  border-left-color: #FA8C16;
  background: var(--el-color-warning-light-9);
  color: #FA8C16;
}

.banner-label {
  color: var(--el-text-color-secondary);
}

.banner-name {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.doc-cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.doc-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  background: var(--el-fill-color-blank);
  transition: box-shadow 0.2s;
}

.doc-card.is-current {
  border-color: var(--el-color-success-light-5);
  background: var(--el-color-success-light-9);
}

.doc-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.doc-icon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--el-color-success-light-9);
  color: var(--el-color-success);
  flex-shrink: 0;
}

.doc-info {
  flex: 1;
  min-width: 0;
}

.doc-title {
  font-size: 14px;
  font-weight: 500;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.doc-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
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
