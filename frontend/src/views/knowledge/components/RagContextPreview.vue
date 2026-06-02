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

      <!-- Markdown 渲染区域 -->
      <div class="context-content">
        <div class="content-label">上下文内容</div>
        <div class="markdown-body" v-html="renderedMarkdown"></div>
      </div>

      <!-- 来源列表 -->
      <div class="sources-section">
        <div class="sources-label">引用来源</div>
        <div class="sources-list">
          <div
            v-for="(source, index) in ragContext.sources"
            :key="source.chunk_id"
            class="source-item"
            :class="{ highlighted: selectedSourceIndex === index }"
            @click="$emit('selectSource', index)"
          >
            <span class="source-badge">{{ index + 1 }}</span>
            <div class="source-info">
              <div class="source-title">{{ source.document_title }}</div>
              <div v-if="source.section_path" class="source-path">
                <el-icon><Location /></el-icon>
                {{ source.section_path }}
              </div>
              <div v-if="source.page_start" class="source-page">
                第 {{ source.page_start }}{{ source.page_end ? `-${source.page_end}` : '' }} 页
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </el-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Document, FolderOpened, Location } from '@element-plus/icons-vue'
import type { RagContext } from '@/api/knowledge'

const props = defineProps<{
  ragContext: RagContext | null
  selectedSourceIndex: number
}>()

defineEmits<{
  copy: []
  selectSource: [index: number]
}>()

// 简单的 Markdown 渲染（不依赖外部库）
const renderedMarkdown = computed(() => {
  if (!props.ragContext?.text) return ''

  let text = props.ragContext.text

  // 标题
  text = text.replace(/^### (.+)$/gm, '<h4 class="md-h4">$1</h4>')
  text = text.replace(/^## (.+)$/gm, '<h3 class="md-h3">$1</h3>')
  text = text.replace(/^# (.+)$/gm, '<h2 class="md-h2">$1</h2>')

  // 加粗
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')

  // 斜体
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>')

  // 列表项
  text = text.replace(/^- (.+)$/gm, '<li class="md-li">$1</li>')
  text = text.replace(/^(\d+)\. (.+)$/gm, '<li class="md-li"><span class="md-num">$1.</span> $2</li>')

  // 包裹连续的列表项
  text = text.replace(/(<li class="md-li">.*<\/li>\n?)+/g, '<ul class="md-ul">$&</ul>')

  // 表格（简单处理）
  text = text.replace(/^\|(.+)\|$/gm, (match) => {
    const cells = match.slice(1, -1).split('|').map(c => c.trim())
    return `<div class="md-table-row">${cells.map(c => `<span class="md-cell">${c}</span>`).join('')}</div>`
  })

  // 段落（换行）
  text = text.split('\n\n').map(p => {
    if (!p.startsWith('<h') && !p.startsWith('<ul') && !p.startsWith('<div class="md-table')) {
      return `<p class="md-p">${p}</p>`
    }
    return p
  }).join('\n')

  // 单行换行转为 <br>
  text = text.replace(/\n/g, '<br>')

  return text
})
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

.context-content {
  background: #fafafa;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
}

.content-label {
  font-size: 13px;
  font-weight: 500;
  color: #606266;
  margin-bottom: 12px;
}

.markdown-body {
  font-size: 14px;
  line-height: 1.8;
  color: #303133;
  max-height: 400px;
  overflow-y: auto;
}

.markdown-body :deep(.md-h2) {
  font-size: 18px;
  font-weight: 600;
  margin: 16px 0 8px 0;
  color: #303133;
  border-bottom: 1px solid #e4e7ed;
  padding-bottom: 4px;
}

.markdown-body :deep(.md-h3) {
  font-size: 16px;
  font-weight: 600;
  margin: 12px 0 6px 0;
  color: #303133;
}

.markdown-body :deep(.md-h4) {
  font-size: 14px;
  font-weight: 600;
  margin: 8px 0 4px 0;
  color: #606266;
}

.markdown-body :deep(.md-p) {
  margin: 8px 0;
  text-align: justify;
}

.markdown-body :deep(.md-ul) {
  margin: 8px 0;
  padding-left: 20px;
}

.markdown-body :deep(.md-li) {
  margin: 4px 0;
  list-style-type: disc;
}

.markdown-body :deep(.md-num) {
  color: #409eff;
  font-weight: 500;
}

.markdown-body :deep(.md-table-row) {
  display: flex;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid #ebeef5;
}

.markdown-body :deep(.md-cell) {
  flex: 1;
  font-size: 13px;
}

.markdown-body :deep(strong) {
  color: #409eff;
  font-weight: 600;
}

.markdown-body :deep(em) {
  color: #67c23a;
}

.sources-section {
  background: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  padding: 12px;
}

.sources-label {
  font-size: 13px;
  font-weight: 500;
  color: #606266;
  margin-bottom: 12px;
}

.sources-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 8px;
}

.source-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  background: #f5f7fa;
  cursor: pointer;
  transition: all 0.2s;
}

.source-item:hover {
  background: #ecf5ff;
}

.source-item.highlighted {
  background: #fef0f0;
  border: 1px solid #fbc4c4;
}

.source-badge {
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
}

.source-item.highlighted .source-badge {
  background: #f56c6c;
}

.source-info {
  flex: 1;
  min-width: 0;
}

.source-title {
  font-size: 13px;
  font-weight: 500;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-path {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #909399;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-page {
  font-size: 12px;
  color: #67c23a;
  margin-top: 2px;
}
</style>