<!-- frontend/src/views/knowledge/components/KnowledgeBaseCard.vue -->
<template>
  <div
    class="kb-card"
    :class="{ inactive: !knowledgeBase.is_active }"
    @click="$emit('click')"
  >
    <div class="card-header">
      <div class="kb-icon" :style="{ background: typeStyle.bg, color: typeStyle.color }">
        <el-icon :size="22"><FolderOpened /></el-icon>
      </div>
      <div class="kb-heading">
        <div class="kb-name" :title="knowledgeBase.name">{{ knowledgeBase.name }}</div>
        <div class="kb-tags">
          <el-tag size="small" effect="light" round>{{ knowledgeBase.kb_type_display }}</el-tag>
          <el-tag size="small" type="info" effect="plain" round>{{ knowledgeBase.visibility_display }}</el-tag>
          <el-tag v-if="!knowledgeBase.is_active" size="small" type="info" round>已停用</el-tag>
        </div>
      </div>
    </div>

    <div class="kb-desc" :title="knowledgeBase.description">
      {{ knowledgeBase.description || '暂无描述' }}
    </div>

    <div class="kb-stats">
      <span class="stat">
        <el-icon><Document /></el-icon>
        {{ knowledgeBase.document_count }} 文档
      </span>
      <span class="stat">
        <el-icon><Collection /></el-icon>
        {{ knowledgeBase.chunk_count }} 分块
      </span>
      <span class="stat stat-time">更新于 {{ formatDate(knowledgeBase.updated_at) }}</span>
    </div>

    <div class="card-actions" @click.stop>
      <el-button text type="primary" @click="$emit('click')">进入</el-button>
      <el-button text @click="$emit('edit')">编辑</el-button>
      <el-button text type="danger" @click="$emit('delete')">删除</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { FolderOpened, Document, Collection } from '@element-plus/icons-vue'
import type { KnowledgeBase } from '@/api/knowledge'

const props = defineProps<{
  knowledgeBase: KnowledgeBase
}>()

defineEmits<{
  click: []
  edit: []
  delete: []
}>()

// 按知识库类型区分图标配色
const TYPE_COLORS: Record<string, { color: string; bg: string }> = {
  company_profile: { color: '#2563eb', bg: '#dbeafe' },
  case_library: { color: '#10b981', bg: '#d1fae5' },
  qualification: { color: '#f59e0b', bg: '#fef3c7' },
  product: { color: '#8b5cf6', bg: '#ede9fe' },
  bid_history: { color: '#0ea5e9', bg: '#e0f2fe' },
  technical_solution: { color: '#ef4444', bg: '#fee2e2' },
}

const typeStyle = computed(
  () => TYPE_COLORS[props.knowledgeBase.kb_type] || { color: '#64748b', bg: '#f1f5f9' }
)

const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString('zh-CN')
}
</script>

<style scoped>
.kb-card {
  display: flex;
  flex-direction: column;
  padding: 16px 18px;
  background: var(--app-card, #fff);
  border: 1px solid var(--app-border, #e5e7eb);
  border-radius: var(--app-radius, 16px);
  cursor: pointer;
  transition: transform 0.18s, box-shadow 0.18s, border-color 0.18s;
}

.kb-card:hover {
  transform: translateY(-2px);
  border-color: var(--app-primary, #2563eb);
  box-shadow: var(--app-shadow, 0 16px 40px rgba(15, 23, 42, 0.08));
}

.kb-card.inactive {
  opacity: 0.65;
}

.card-header {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 12px;
}

.kb-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.kb-heading {
  flex: 1;
  min-width: 0;
}

.kb-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--app-text-primary, #111827);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: 6px;
}

.kb-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.kb-desc {
  font-size: 13px;
  color: var(--app-text-secondary, #6b7280);
  line-height: 1.5;
  height: 39px;
  margin-bottom: 12px;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.kb-stats {
  display: flex;
  align-items: center;
  gap: 14px;
  font-size: 12px;
  color: var(--app-text-secondary, #6b7280);
  margin-bottom: 12px;
}

.stat {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.stat-time {
  margin-left: auto;
  color: #9ca3af;
}

.card-actions {
  display: flex;
  gap: 8px;
  border-top: 1px solid var(--app-border, #e5e7eb);
  padding-top: 10px;
  margin-top: auto;
}
</style>
