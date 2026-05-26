<!-- frontend/src/views/knowledge/components/KnowledgeDocumentTable.vue -->
<template>
  <el-table :data="documents" v-loading="loading" stripe>
    <el-table-column prop="file_name" label="文件名" min-width="200" />

    <el-table-column label="状态" width="100">
      <template #default="{ row }">
        <KnowledgeDocumentStatusTag :document="row" />
      </template>
    </el-table-column>

    <el-table-column prop="chunk_count" label="分块数" width="80" />

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

    <el-table-column label="操作" width="150" fixed="right">
      <template #default="{ row }">
        <el-button text type="primary" @click="$emit('viewChunks', row)">查看分块</el-button>
        <el-button text type="danger" @click="$emit('delete', row)">删除</el-button>
      </template>
    </el-table-column>
  </el-table>
</template>

<script setup lang="ts">
import type { KnowledgeDocument } from '@/api/knowledge'
import KnowledgeDocumentStatusTag from './KnowledgeDocumentStatusTag.vue'

defineProps<{
  documents: KnowledgeDocument[]
  loading: boolean
}>()

defineEmits<{
  viewChunks: [doc: KnowledgeDocument]
  delete: [doc: KnowledgeDocument]
}>()

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const formatDateTime = (date: string) => {
  return new Date(date).toLocaleString('zh-CN')
}
</script>