<!-- frontend/src/views/knowledge/components/KnowledgeBaseCard.vue -->
<template>
  <el-card class="kb-card" shadow="hover" @click="$emit('click')">
    <div class="card-header">
      <el-icon :size="24"><FolderOpened /></el-icon>
      <span class="kb-name">{{ knowledgeBase.name }}</span>
    </div>

    <div class="card-body">
      <div class="kb-type">
        <el-tag size="small">{{ knowledgeBase.kb_type_display }}</el-tag>
      </div>

      <div class="stats">
        <span>文档: {{ knowledgeBase.document_count }}</span>
        <span>分块: {{ knowledgeBase.chunk_count }}</span>
      </div>

      <div class="time">
        更新: {{ formatDate(knowledgeBase.updated_at) }}
      </div>
    </div>

    <div class="card-actions" @click.stop>
      <el-button text type="primary" @click="$emit('click')">进入</el-button>
      <el-button text @click="$emit('edit')">编辑</el-button>
      <el-button text type="danger" @click="$emit('delete')">删除</el-button>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { FolderOpened } from '@element-plus/icons-vue'
import type { KnowledgeBase } from '@/api/knowledge'

defineProps<{
  knowledgeBase: KnowledgeBase
}>()

defineEmits<{
  click: []
  edit: []
  delete: []
}>()

const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString('zh-CN')
}
</script>

<style scoped>
.kb-card {
  cursor: pointer;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.kb-name {
  font-weight: 500;
  font-size: 16px;
}

.card-body {
  margin-bottom: 12px;
}

.kb-type {
  margin-bottom: 8px;
}

.stats {
  display: flex;
  gap: 16px;
  font-size: 13px;
  color: #666;
  margin-bottom: 4px;
}

.time {
  font-size: 12px;
  color: #999;
}

.card-actions {
  display: flex;
  gap: 8px;
  border-top: 1px solid #eee;
  padding-top: 12px;
}
</style>