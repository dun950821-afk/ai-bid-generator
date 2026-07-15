<!-- frontend/src/views/knowledge/components/KnowledgeDocumentTable.vue -->
<template>
  <el-table :data="documents" v-loading="loading" stripe>
    <el-table-column label="文件名" min-width="240">
      <template #default="{ row }">
        <div class="file-name-cell">
          <el-icon :size="18" class="file-icon"><component :is="getFileIcon(row.file_name)" /></el-icon>
          <span class="file-name" :title="row.file_name">{{ row.file_name }}</span>
        </div>
      </template>
    </el-table-column>

    <el-table-column label="状态" width="110">
      <template #default="{ row }">
        <KnowledgeDocumentStatusTag :document="row" />
      </template>
    </el-table-column>

    <el-table-column prop="chunk_count" label="分块数" width="80" align="center" />

    <el-table-column label="文件大小" width="100">
      <template #default="{ row }">
        {{ formatSize(row.file_size) }}
      </template>
    </el-table-column>

    <el-table-column prop="created_at" label="上传时间" width="160">
      <template #default="{ row }">
        {{ formatDateTime(row.created_at) }}
      </template>
    </el-table-column>

    <el-table-column label="操作" width="280" fixed="right">
      <template #default="{ row }">
        <el-button text type="primary" @click="$emit('viewChunks', row)">查看分块</el-button>
        <el-button v-if="row.status === 'failed' && row.error_message" text type="warning" @click="$emit('viewError', row)">
          查看错误
        </el-button>
        <el-button v-if="row.status === 'failed'" text type="warning" @click="$emit('reprocess', row)">
          重试
        </el-button>
        <el-button text type="danger" @click="$emit('delete', row)">删除</el-button>
      </template>
    </el-table-column>

    <template #empty>
      <el-empty description="暂无文档，点击上方上传按钮添加" />
    </template>
  </el-table>
</template>

<script setup lang="ts">
import { markRaw } from 'vue'
import {
  Document as DocIcon,
  Picture,
  Tickets,
  Files,
} from '@element-plus/icons-vue'
import type { KnowledgeDocument } from '@/api/knowledge'
import KnowledgeDocumentStatusTag from './KnowledgeDocumentStatusTag.vue'

defineProps<{
  documents: KnowledgeDocument[]
  loading: boolean
}>()

defineEmits<{
  viewChunks: [doc: KnowledgeDocument]
  delete: [doc: KnowledgeDocument]
  viewError: [doc: KnowledgeDocument]
  reprocess: [doc: KnowledgeDocument]
}>()

const ICON_MAP: Record<string, ReturnType<typeof markRaw>> = {
  pdf: markRaw(Files),
  doc: markRaw(DocIcon),
  docx: markRaw(DocIcon),
  txt: markRaw(DocIcon),
  md: markRaw(DocIcon),
  markdown: markRaw(DocIcon),
  xls: markRaw(Tickets),
  xlsx: markRaw(Tickets),
  ppt: markRaw(Picture),
  pptx: markRaw(Picture),
}

const getFileIcon = (fileName: string) => {
  const parts = fileName.toLowerCase().split('.')
  const ext = parts.length > 1 ? parts[parts.length - 1] : ''
  return ICON_MAP[ext] || markRaw(DocIcon)
}

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const formatDateTime = (date: string) => {
  return new Date(date).toLocaleString('zh-CN')
}
</script>

<style scoped>
.file-name-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.file-icon {
  color: #409eff;
  flex-shrink: 0;
}

.file-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
