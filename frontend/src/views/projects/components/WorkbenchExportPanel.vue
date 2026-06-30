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

    <div v-if="documents.length" class="doc-cards">
      <div v-for="doc in documents" :key="doc.id" class="doc-card">
        <div class="doc-icon">
          <el-icon :size="20"><Document /></el-icon>
        </div>
        <div class="doc-info">
          <div class="doc-title">{{ doc.title }}</div>
          <div class="doc-meta">
            <el-tag :type="getDocStatusType(doc.status)" size="small" effect="plain">
              {{ getDocStatusLabel(doc.status) }}
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
import { Document, Files } from '@element-plus/icons-vue'
import type { WorkbenchStatus } from '@/api/workbench'

const props = defineProps<{
  lotId: number
  status: WorkbenchStatus | null
}>()

const router = useRouter()
const documents = computed(() => props.status?.steps.export.documents ?? [])

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
