<!-- frontend/src/views/outline/components/SectionTreePanel.vue -->
<template>
  <div class="section-tree-wrapper">
    <div ref="panelRef" class="section-tree-panel" :style="{ width: `${panelWidth}px` }">
      <div class="panel-header">
        <span class="panel-title">章节目录</span>
        <el-button type="primary" link size="small" @click="emit('add')">
          <el-icon><Plus /></el-icon>
          新增
        </el-button>
      </div>

      <!-- 搜索框 -->
      <div class="tree-search">
        <el-input
          v-model="searchKeyword"
          placeholder="搜索章节..."
          clearable
          :prefix-icon="Search"
          size="small"
        />
      </div>

      <!-- 章节树 -->
      <div class="tree-content">
        <el-tree
          :data="filteredSections"
          :props="treeProps"
          node-key="id"
          highlight-current
          :expand-on-click-node="false"
          default-expand-all
          @node-click="(data: SectionTreeItem) => emit('select', data)"
        >
          <template #default="{ data }">
            <div
              class="tree-node"
              :class="{ 'is-current': selectedId === data.id }"
              @contextmenu.prevent="handleContextMenu($event, data)"
            >
              <div class="node-title">
                <el-icon class="node-icon">
                  <Folder v-if="hasChildren(data)" />
                  <Document v-else />
                </el-icon>
                <span v-if="getSectionNumber(data)" class="section-number">
                  {{ getSectionNumber(data) }}
                </span>
                <span class="title-text" :title="getFullTitle(data)">
                  {{ stripNumberPrefix(data.title) }}
                </span>
              </div>
              <div class="node-right" @click.stop>
                <el-tooltip :content="getNodeDisplayStatus(data).text" placement="top">
                  <span class="status-dot" :class="getNodeDisplayStatus(data).className" />
                </el-tooltip>
                <el-dropdown trigger="click" placement="bottom-end" @command="(cmd: string) => onNodeCommand(cmd, data)">
                  <span class="more-btn">
                    <el-icon><MoreFilled /></el-icon>
                  </span>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item command="select">
                        <el-icon><View /></el-icon>查看详情
                      </el-dropdown-item>
                      <el-dropdown-item command="generate" v-if="!hasChildren(data)">
                        <el-icon><MagicStick /></el-icon>AI 生成正文
                      </el-dropdown-item>
                      <el-dropdown-item command="edit_matrix" v-if="data.content_matrix_status === 'generated' || data.content_matrix_status === 'edited'">
                        <el-icon><Edit /></el-icon>编辑内容责任矩阵
                      </el-dropdown-item>
                      <el-dropdown-item command="add_child" divided>
                        <el-icon><Plus /></el-icon>添加子章节
                      </el-dropdown-item>
                      <el-dropdown-item command="delete" class="danger-item">
                        <el-icon><Delete /></el-icon>删除章节
                      </el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </div>
            </div>
          </template>
        </el-tree>
        <el-empty
          v-if="filteredSections.length === 0 && !loading"
          description="暂无章节，点击右上角「新增」创建第一个章节"
          :image-size="60"
        />
      </div>
    </div>
    <!-- 拖拽调整宽度手柄 -->
    <div class="resize-handle" @mousedown="startResize" />

    <!-- 右键菜单 -->
    <div
      v-if="contextMenuVisible"
      class="context-menu"
      :style="{ left: `${contextMenuX}px`, top: `${contextMenuY}px` }"
      @click.stop
    >
      <div class="context-menu-item" @click="onNodeCommand('select', contextMenuTarget!)">
        <el-icon><View /></el-icon>查看详情
      </div>
      <div class="context-menu-item" @click="onNodeCommand('generate', contextMenuTarget!)">
        <el-icon><MagicStick /></el-icon>AI 生成正文
      </div>
      <div class="context-menu-item" @click="onNodeCommand('edit_matrix', contextMenuTarget!)">
        <el-icon><Edit /></el-icon>编辑内容责任矩阵
      </div>
      <div class="context-menu-divider" />
      <div class="context-menu-item" @click="onNodeCommand('add_child', contextMenuTarget!)">
        <el-icon><Plus /></el-icon>添加子章节
      </div>
      <div class="context-menu-item danger" @click="onNodeCommand('delete', contextMenuTarget!)">
        <el-icon><Delete /></el-icon>删除章节
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import {
  Search,
  Folder,
  Document,
  MoreFilled,
  View,
  MagicStick,
  Edit,
  Plus,
  Delete,
} from '@element-plus/icons-vue'
import type { SectionTreeItem } from '@/api/outline'

const props = defineProps<{
  sections: SectionTreeItem[]
  selectedId: number | null
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'select', data: SectionTreeItem): void
  (e: 'command', command: string, data: SectionTreeItem): void
  (e: 'add'): void
}>()

// UI 状态
const searchKeyword = ref('')

// 拖拽宽度
const panelRef = ref<HTMLElement | null>(null)
const panelWidth = ref(340)
const resizing = ref(false)

// 右键菜单
const contextMenuVisible = ref(false)
const contextMenuX = ref(0)
const contextMenuY = ref(0)
const contextMenuTarget = ref<SectionTreeItem | null>(null)

const treeProps = {
  children: 'children',
  label: 'title',
}

// 计算属性
const filteredSections = computed(() => {
  if (!searchKeyword.value) return props.sections
  const keyword = searchKeyword.value.toLowerCase()
  const filterTree = (items: SectionTreeItem[]): SectionTreeItem[] => {
    return items.reduce((acc: SectionTreeItem[], item) => {
      const match = item.title.toLowerCase().includes(keyword)
      const children = item.children ? filterTree(item.children) : []
      if (match || children.length > 0) {
        acc.push({ ...item, children })
      }
      return acc
    }, [])
  }
  return filterTree(props.sections)
})

// 状态聚合函数
interface NodeDisplayStatus {
  type: string
  text: string
  className: string
}

function getNodeDisplayStatus(data: SectionTreeItem): NodeDisplayStatus {
  const contentStatus = data.content_generation_status
  const matrixStatus = data.content_matrix_status

  if (contentStatus === 'failed') {
    return { type: 'content-failed', text: '正文生成失败', className: 'failed' }
  }
  if (contentStatus === 'running') {
    return { type: 'content-running', text: '正文生成中', className: 'running' }
  }
  if (matrixStatus === 'failed') {
    return { type: 'matrix-failed', text: '矩阵生成失败', className: 'failed' }
  }
  if (matrixStatus === 'generating') {
    return { type: 'matrix-generating', text: '矩阵生成中', className: 'running' }
  }
  if (matrixStatus === 'edited') {
    return { type: 'matrix-edited', text: '矩阵已编辑', className: 'edited' }
  }
  if (contentStatus === 'success') {
    return {
      type: 'content-success',
      text: data.content_word_count ? `正文已生成，${data.content_word_count}字` : '正文已生成',
      className: 'success',
    }
  }
  if (matrixStatus === 'generated') {
    return { type: 'matrix-generated', text: '矩阵已生成', className: 'matrix-generated' }
  }
  return { type: 'pending', text: '待处理', className: 'pending' }
}

// 节点辅助函数
function hasChildren(data: SectionTreeItem) {
  return Boolean(data.children?.length || data.children_count)
}

function getSectionNumber(data: SectionTreeItem) {
  // 优先使用后端计算的 section_number_display
  return data.section_number_display || data.section_number || ''
}

function stripNumberPrefix(title: string) {
  if (!title) return ''
  return title
    .replace(/^第?[一二三四五六七八九十百千万]+[、.．]\s*/, '')
    .replace(/^\d+(\.\d+)*[、.．]?\s*/, '')
    .replace(/^（[一二三四五六七八九十]+）\s*/, '')
    .replace(/^\([一二三四五六七八九十]+\)\s*/, '')
    .trim()
}

function getFullTitle(data: SectionTreeItem) {
  // 使用 section_number_display + 清洗后的标题
  const number = getSectionNumber(data)
  const cleanTitle = stripNumberPrefix(data.title)
  if (number) {
    return `${number}${cleanTitle}`
  }
  return cleanTitle
}

// 拖拽宽度相关函数
function startResize(event: MouseEvent) {
  resizing.value = true
  document.addEventListener('mousemove', handleResize)
  document.addEventListener('mouseup', stopResize)
  event.preventDefault()
}

function handleResize(event: MouseEvent) {
  if (!resizing.value) return
  const minWidth = 280
  const maxWidth = 460
  const left = panelRef.value?.getBoundingClientRect().left || 0
  panelWidth.value = Math.min(maxWidth, Math.max(minWidth, event.clientX - left))
}

function stopResize() {
  resizing.value = false
  document.removeEventListener('mousemove', handleResize)
  document.removeEventListener('mouseup', stopResize)
}

// 右键菜单处理
function handleContextMenu(event: MouseEvent, data: SectionTreeItem) {
  event.preventDefault()
  contextMenuTarget.value = data
  contextMenuX.value = event.clientX
  contextMenuY.value = event.clientY
  contextMenuVisible.value = true
}

function closeContextMenu() {
  contextMenuVisible.value = false
}

// 节点命令处理：select 直接选中，其余命令上抛给父组件
function onNodeCommand(command: string, data: SectionTreeItem) {
  contextMenuVisible.value = false
  if (command === 'select') {
    emit('select', data)
  } else {
    emit('command', command, data)
  }
}

onMounted(() => {
  document.addEventListener('click', closeContextMenu)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousemove', handleResize)
  document.removeEventListener('mouseup', stopResize)
  document.removeEventListener('click', closeContextMenu)
})
</script>

<style scoped>
.section-tree-wrapper {
  display: flex;
  height: 100%;
  min-width: 0;
}

.section-tree-panel {
  flex-shrink: 0;
  width: 340px;
  min-width: 280px;
  max-width: 460px;
  height: 100%;
  border: 1px solid #e4e7ed;
  border-radius: 10px 0 0 10px;
  background: #fff;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.resize-handle {
  width: 6px;
  cursor: col-resize;
  background: transparent;
  transition: background 0.2s;
  flex-shrink: 0;
}

.resize-handle:hover {
  background: #d9ecff;
}

.panel-header {
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid #ebeef5;
}

.panel-title {
  font-size: 15px;
  font-weight: 700;
  color: #303133;
}

.tree-search {
  flex-shrink: 0;
  padding: 12px 14px;
  border-bottom: 1px solid #f0f2f5;
}

.tree-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px;
}

/* ========== 树节点样式 ========== */
.tree-node {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 36px;
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;
}

.tree-node:hover {
  background: #f5f7fa;
}

.tree-node.is-current {
  background: #ecf5ff;
}

.node-title {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.node-icon {
  font-size: 14px;
  color: #909399;
  flex-shrink: 0;
}

.section-number {
  color: #606266;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
  max-width: 60px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.title-text {
  flex: 1;
  min-width: 0;
  color: #303133;
  font-size: 13px;
  line-height: 20px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-shrink: 0;
  width: 42px;
  margin-left: 6px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-dot.success { background: #67c23a; }
.status-dot.running { background: #409eff; animation: statusPulse 1s infinite; }
.status-dot.failed { background: #f56c6c; }
.status-dot.edited { background: #e6a23c; }
.status-dot.pending { background: #c0c4cc; }
.status-dot.matrix-generated { background: #8cc5ff; }

@keyframes statusPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}

.more-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  color: #909399;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
}

.tree-node:hover .more-btn {
  opacity: 1;
}

.more-btn:hover {
  background: #e4e7ed;
  color: #409eff;
}

/* ========== 右键菜单 ========== */
.context-menu {
  position: fixed;
  min-width: 180px;
  padding: 6px 0;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  background: #fff;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
  z-index: 3000;
}

.context-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 14px;
  color: #303133;
  font-size: 13px;
  cursor: pointer;
}

.context-menu-item:hover {
  background: #f5f7fa;
  color: #409eff;
}

.context-menu-item.danger {
  color: #f56c6c;
}

.context-menu-divider {
  height: 1px;
  margin: 4px 0;
  background: #ebeef5;
}

.danger-item {
  color: #f56c6c;
}

/* ========== Element Plus Tree 覆盖 ========== */
:deep(.el-tree) {
  background: transparent;
}

:deep(.el-tree-node__content) {
  height: auto;
  min-height: 36px;
  padding-right: 4px;
}

:deep(.el-tree-node__content:hover) {
  background: transparent;
}

:deep(.el-tree--highlight-current .el-tree-node.is-current > .el-tree-node__content) {
  background: transparent;
}

:deep(.el-tree-node__expand-icon) {
  color: #909399;
}
</style>
