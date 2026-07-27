<!-- frontend/src/views/knowledge/components/RagContextPreview.vue -->
<template>
  <el-card shadow="never" class="rag-context-card">
    <template #header>
      <div class="card-header">
        <span>RAG 上下文预览</span>
        <el-button
          v-if="ragContext"
          text
          type="primary"
          size="small"
          @click="$emit('copy')"
        >
          复制上下文
        </el-button>
      </div>
    </template>

    <el-empty v-if="!ragContext" description="执行检索后生成上下文" />

    <template v-else>
      <!-- 统计信息 -->
      <div class="context-stats">
        <el-tag size="small" type="info">
          <el-icon><Document /></el-icon>
          {{ ragContext.token_count }} Tokens
        </el-tag>
        <el-tag size="small" type="success">
          <el-icon><FolderOpened /></el-icon>
          {{ ragContext.chunk_count }} 来源片段
        </el-tag>
      </div>

      <!-- 按来源分块显示内容 -->
      <div class="context-blocks">
        <div
          v-for="(source, index) in ragContext.sources"
          :key="source.chunk_id"
          class="context-block"
          :class="{ highlighted: isHighlighted(index, source.chunk_id) }"
          @click="$emit('selectSource', index)"
        >
          <div class="block-header">
            <span class="block-badge">{{ index + 1 }}</span>
            <div class="block-meta">
              <span class="block-title">{{ source.document_title }}</span>
              <span v-if="source.section_path" class="block-section">
                <el-icon><Location /></el-icon>
                {{ source.section_path }}
              </span>
              <span v-if="source.page_start" class="block-page">
                第 {{ source.page_start }}{{ source.page_end ? `-${source.page_end}` : '' }} 页
              </span>
            </div>
          </div>
          <div class="block-content" v-html="getBlockContent(index)"></div>
        </div>
      </div>
    </template>
  </el-card>
</template>

<script setup lang="ts">
import MarkdownIt from 'markdown-it'
import { Document, FolderOpened, Location } from '@element-plus/icons-vue'
import type { RagContext } from '@/api/knowledge'

const props = defineProps<{
  ragContext: RagContext | null
  selectedSourceIndex: number
  selectedChunkId: number | null
}>()

defineEmits<{
  copy: []
  selectSource: [index: number]
}>()

// 单例 md 实例: 默认开启 html:false, 阻止原始 HTML 注入;
// linkify + typographer 关闭, 仅基础渲染
const md = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: false,
  typographer: false,
})

// 根据选中状态判断是否高亮
const isHighlighted = (index: number, chunkId: number) => {
  if (props.selectedChunkId !== null) {
    return props.selectedChunkId === chunkId
  }
  return props.selectedSourceIndex === index
}

// 按来源分割内容
const getBlockContent = (index: number): string => {
  if (!props.ragContext?.text) return ''

  // 按来源分割（### 来源：xxx 标题分割）
  const parts = props.ragContext.text.split(/(?=### 来源：)/g)
  if (index < parts.length) {
    return md.render(parts[index])
  }
  return ''
}
</script>

<style scoped>
.rag-context-card {
  border: 1px solid #e4e7ed;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.context-stats {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.context-stats .el-tag {
  display: flex;
  align-items: center;
  gap: 4px;
}

.context-blocks {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 500px;
  overflow-y: auto;
}

.context-block {
  background: #fafafa;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  padding: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.context-block:hover {
  border-color: #409eff;
  background: #f5f9ff;
}

.context-block.highlighted {
  border-color: #f56c6c;
  background: #fef0f0;
  box-shadow: 0 2px 8px rgba(245, 108, 108, 0.2);
}

.block-header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid #e4e7ed;
}

.block-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: #409eff;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  border-radius: 50%;
  flex-shrink: 0;
}

.context-block.highlighted .block-badge {
  background: #f56c6c;
}

.block-meta {
  flex: 1;
  min-width: 0;
}

.block-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.block-section {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #909399;
  margin-top: 2px;
}

.block-page {
  font-size: 12px;
  color: #67c23a;
  margin-left: 8px;
}

.block-content {
  font-size: 13px;
  line-height: 1.7;
  color: #606266;
  max-height: 200px;
  overflow-y: auto;
}

.block-content :deep(.md-h4) {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 8px 0;
  color: #303133;
}

.block-content :deep(.md-p) {
  margin: 6px 0;
}

.block-content :deep(.md-ul) {
  margin: 6px 0;
  padding-left: 20px;
}

.block-content :deep(.md-li) {
  margin: 4px 0;
  list-style-type: disc;
}

.block-content :deep(strong) {
  color: #409eff;
  font-weight: 600;
}

.block-content :deep(em) {
  color: #67c23a;
}
</style>