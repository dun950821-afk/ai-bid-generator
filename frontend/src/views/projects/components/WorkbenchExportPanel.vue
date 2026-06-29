<template>
  <div class="workbench-export-panel">
    <div class="section">
      <h4>本标段 Word 文档</h4>
      <div v-if="documents.length" class="doc-list">
        <div v-for="doc in documents" :key="doc.id" class="doc-item">
          <el-icon><Document /></el-icon>
          <div class="doc-info">
            <div class="doc-title">{{ doc.title }}</div>
            <div class="doc-meta">
              <span>{{ formatDateTime(doc.created_at) }}</span>
            </div>
          </div>
          <el-button type="primary" size="small" @click="openWordEditor(doc.id)">
            打开编辑器
          </el-button>
        </div>
      </div>
      <el-empty v-else description="暂无 Word 文档，请在「内容编辑」步骤生成" :image-size="60" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { Document } from '@element-plus/icons-vue'
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
</script>

<style scoped>
.workbench-export-panel .section h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.doc-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  margin-bottom: 8px;
}

.doc-info {
  flex: 1;
}

.doc-title {
  font-size: 14px;
}

.doc-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}
</style>
