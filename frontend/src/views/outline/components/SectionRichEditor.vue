<!-- frontend/src/views/outline/components/SectionRichEditor.vue -->
<template>
  <div class="editor-container">
    <!-- 简洁工具栏 -->
    <div class="editor-toolbar" v-if="!isSourceMode">
      <!-- 历史操作 -->
      <el-tooltip content="撤销" placement="top">
        <el-button link :disabled="!editor?.can().undo()" @click="editor?.chain().focus().undo().run()">
          <el-icon><RefreshLeft /></el-icon>
        </el-button>
      </el-tooltip>
      <el-tooltip content="重做" placement="top">
        <el-button link :disabled="!editor?.can().redo()" @click="editor?.chain().focus().redo().run()">
          <el-icon><RefreshRight /></el-icon>
        </el-button>
      </el-tooltip>

      <el-divider direction="vertical" />

      <!-- 标题样式 -->
      <el-dropdown trigger="click" @command="handleHeading">
        <el-button link class="toolbar-btn">
          <el-icon><Heading /></el-icon>
          <span class="btn-text">标题</span>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="1">H1 一级标题</el-dropdown-item>
            <el-dropdown-item command="2">H2 二级标题</el-dropdown-item>
            <el-dropdown-item command="3">H3 三级标题</el-dropdown-item>
            <el-dropdown-item command="0" divided>正文</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>

      <el-divider direction="vertical" />

      <!-- 基础格式 -->
      <el-tooltip content="加粗" placement="top">
        <el-button link :type="editor?.isActive('bold') ? 'primary' : ''" @click="editor?.chain().focus().toggleBold().run()">
          <el-icon><Bold /></el-icon>
        </el-button>
      </el-tooltip>
      <el-tooltip content="斜体" placement="top">
        <el-button link :type="editor?.isActive('italic') ? 'primary' : ''" @click="editor?.chain().focus().toggleItalic().run()">
          <el-icon><Italic /></el-icon>
        </el-button>
      </el-tooltip>
      <el-tooltip content="下划线" placement="top">
        <el-button link :type="editor?.isActive('underline') ? 'primary' : ''" @click="editor?.chain().focus().toggleUnderline().run()">
          <el-icon><Underline /></el-icon>
        </el-button>
      </el-tooltip>

      <el-divider direction="vertical" />

      <!-- 列表 -->
      <el-tooltip content="无序列表" placement="top">
        <el-button link :type="editor?.isActive('bulletList') ? 'primary' : ''" @click="editor?.chain().focus().toggleBulletList().run()">
          <el-icon><List /></el-icon>
        </el-button>
      </el-tooltip>
      <el-tooltip content="有序列表" placement="top">
        <el-button link :type="editor?.isActive('orderedList') ? 'primary' : ''" @click="editor?.chain().focus().toggleOrderedList().run()">
          <el-icon><OrderedList /></el-icon>
        </el-button>
      </el-tooltip>

      <el-divider direction="vertical" />

      <!-- 插入 -->
      <el-tooltip content="插入表格" placement="top">
        <el-button link @click="handleTableAction('insert')">
          <el-icon><Grid /></el-icon>
        </el-button>
      </el-tooltip>
      <el-tooltip content="插入图片" placement="top">
        <el-button link @click="imageDialogVisible = true">
          <el-icon><Picture /></el-icon>
        </el-button>
      </el-tooltip>

      <el-divider direction="vertical" />

      <!-- 源码模式 -->
      <el-tooltip content="查看源码" placement="top">
        <el-button link @click="toggleSourceMode">
          <el-icon><Document /></el-icon>
        </el-button>
      </el-tooltip>

      <!-- 保存状态 -->
      <div class="toolbar-right">
        <span v-if="dirty" class="dirty-badge">未保存</span>
        <el-button type="primary" size="small" :loading="saving" :disabled="!dirty" @click="handleSave">
          <el-icon><Check /></el-icon>
          保存
        </el-button>
      </div>
    </div>

    <!-- Markdown 源码模式 -->
    <div v-if="isSourceMode" class="source-mode">
      <div class="source-header">
        <span class="source-title">Markdown 源码</span>
        <div class="source-actions">
          <el-button size="small" @click="toggleSourceMode">返回编辑器</el-button>
          <el-button type="primary" size="small" :loading="saving" :disabled="!dirty" @click="handleSaveFromSource">
            保存
          </el-button>
        </div>
      </div>
      <el-input
        v-model="sourceContent"
        type="textarea"
        :rows="20"
        placeholder="Markdown 源码"
        class="source-textarea"
        @input="onSourceChange"
      />
    </div>

    <!-- 富文本编辑区 -->
    <div v-else class="editor-content">
      <EditorContent :editor="editor" />
    </div>

    <!-- 插入图片对话框（公司库 / 知识库 / 本地上传） -->
    <ImageInsertDialog
      v-model="imageDialogVisible"
      :section-id="sectionId"
      :outline-id="outlineId"
      @insert="insertImages"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, h, watch, onBeforeUnmount } from 'vue'
import { logError } from '@/utils/logger'
import { ElMessage } from 'element-plus'
import {
  RefreshLeft,
  RefreshRight,
  Picture,
  Document,
  Check,
  Grid,
  List,
} from '@element-plus/icons-vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import UnderlineExt from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import Placeholder from '@tiptap/extension-placeholder'
import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'
import TurndownService from 'turndown'
import { uploadEditorImage, updateSectionContent } from '@/api/sectionContent'
import { ResizableImage } from './resizableImage'
import ImageInsertDialog from './ImageInsertDialog.vue'

// 自定义图标组件（element-plus 图标库无对应图标）。
// 必须用 render 函数实现：生产构建是 runtime-only 的 Vue，
// { template } 运行时模板对象无法编译，会导致按钮图标不显示。
const Heading = () =>
  h('svg', { viewBox: '0 0 24 24', width: '16', height: '16' }, [
    h('path', { fill: 'currentColor', d: 'M6 4v16h2v-6h8v6h2V4h-2v6H8V4H6z' }),
  ])
const Bold = () =>
  h('svg', { viewBox: '0 0 24 24', width: '16', height: '16' }, [
    h('path', { fill: 'currentColor', d: 'M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z' }),
  ])
const Italic = () =>
  h('svg', { viewBox: '0 0 24 24', width: '16', height: '16' }, [
    h('path', { fill: 'currentColor', d: 'M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z' }),
  ])
const Underline = () =>
  h('svg', { viewBox: '0 0 24 24', width: '16', height: '16' }, [
    h('path', { fill: 'currentColor', d: 'M12 17c3.31 0 6-2.69 6-6V3h-2.5v8c0 1.93-1.57 3.5-3.5 3.5S8.5 12.93 8.5 11V3H6v8c0 3.31 2.69 6 6 6zm-7 2v2h14v-2H5z' }),
  ])
const OrderedList = () =>
  h('svg', { viewBox: '0 0 24 24', width: '16', height: '16' }, [
    h('path', { fill: 'currentColor', d: 'M2 17h2v.5H3v1h1v.5H2v1h3v-4H2v1zm1-9h1V4H2v1h1v3zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2v1zm5-6v2h14V5H7zm0 14h14v-2H7v2zm0-6h14v-2H7v2z' }),
  ])

// Props
const props = defineProps<{
  modelValue: string
  sectionId: number
  outlineId: number
  readonly?: boolean
}>()

// Emits
const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'saved', data: { content: string; version: number }): void
  (e: 'dirty-change', dirty: boolean): void
}>()

// Markdown 解析
const md = new MarkdownIt({
  html: true,
  breaks: true,
  linkify: true,
})

// XSS 防护：MarkdownIt 开启 html:true 后，源码模式可粘贴任意原始 HTML，
// md.render() 的输出在进入 Tiptap / 提交后端前必须用 DOMPurify 消毒。
// 白名单策略：允许常规排版标签和 img（含 width/height/src/alt），
// 禁 script/iframe/object 等嵌入标签与事件属性（DOMPurify 默认剥离 on*），
// URI 协议限 http/https/mailto，相对路径（本站上传的图片）保留。
const ALLOWED_URI_REGEXP = /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i

function renderMarkdown(markdown: string): string {
  return DOMPurify.sanitize(md.render(markdown || ''), {
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'style', 'form', 'input', 'link', 'meta', 'base'],
    ALLOWED_URI_REGEXP,
  })
}

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
})

// 表格转换规则
turndownService.addRule('table', {
  filter: 'table',
  replacement: function (content: string, node: HTMLElement) {
    const rows = node.querySelectorAll('tr')
    if (rows.length === 0) return content

    let result = ''
    const headerRow = rows[0]
    const cells = headerRow.querySelectorAll('th, td')
    const colCount = cells.length

    result += '|'
    cells.forEach((cell: Element) => {
      result += ` ${cell.textContent?.trim() || ''} |`
    })
    result += '\n|'

    for (let i = 0; i < colCount; i++) {
      result += ' --- |'
    }
    result += '\n'

    for (let i = 1; i < rows.length; i++) {
      const rowCells = rows[i].querySelectorAll('th, td')
      result += '|'
      rowCells.forEach((cell: Element) => {
        result += ` ${cell.textContent?.trim() || ''} |`
      })
      result += '\n'
    }

    return result + '\n'
  },
})

// 带尺寸的图片保留为 HTML（Markdown 语法无法表达宽度，直接丢弃会导致
// 用户调整过的图片尺寸在保存/重新加载后丢失；markdown-it 开启 html:true
// 可原样渲染，TipTap 也能从 width 属性还原）
turndownService.addRule('imgWithSize', {
  filter: (node) =>
    node.nodeName === 'IMG' &&
    !!(node as HTMLElement).getAttribute('width'),
  replacement: (_content, node) => {
    const el = node as HTMLElement
    const src = el.getAttribute('src') || ''
    const width = el.getAttribute('width')
    const alt = el.getAttribute('alt') || ''
    return `<img src="${src}" width="${width}" alt="${alt}">\n`
  },
})

// State
const isHydrating = ref(false)
const dirty = ref(false)
const saving = ref(false)
const isSourceMode = ref(false)
const sourceContent = ref('')
const lastSavedMarkdown = ref('')
const currentMarkdown = ref('')
const imageDialogVisible = ref(false)

function normalizeMarkdown(value?: string) {
  return (value || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .trim()
}

function loadMarkdownToEditor(markdown: string) {
  isHydrating.value = true
  const html = renderMarkdown(markdown)
  editor.value?.commands.setContent(html)
  lastSavedMarkdown.value = normalizeMarkdown(markdown)
  currentMarkdown.value = normalizeMarkdown(markdown)
  dirty.value = false
  emit('dirty-change', false)
  setTimeout(() => {
    isHydrating.value = false
  }, 50)
}

// Editor
const editor = useEditor({
  content: renderMarkdown(props.modelValue),
  extensions: [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
    }),
    UnderlineExt,
    Placeholder.configure({
      placeholder: '请输入章节内容...',
    }),
    TextAlign.configure({
      types: ['heading', 'paragraph'],
    }),
    ResizableImage.configure({
      inline: false,
      allowBase64: false,
    }),
    Table.configure({
      resizable: true,
    }),
    TableRow,
    TableHeader,
    TableCell,
  ],
  editable: !props.readonly,
  onUpdate: ({ editor, transaction }) => {
    if (isHydrating.value) return
    if (!transaction.docChanged) return
    if (isSourceMode.value) return

    const html = editor.getHTML()
    const markdown = normalizeMarkdown(turndownService.turndown(html))
    currentMarkdown.value = markdown

    if (markdown !== lastSavedMarkdown.value) {
      dirty.value = true
      emit('dirty-change', true)
      emit('update:modelValue', turndownService.turndown(html))
    }
  },
  editorProps: {
    handlePaste: (_view: unknown, event: ClipboardEvent) => {
      const items = event.clipboardData?.items
      if (!items) return false

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) {
            uploadAndInsertImage(file)
            return true
          }
        }
      }
      return false
    },
    handleDrop: (_view: unknown, event: DragEvent) => {
      const files = event.dataTransfer?.files
      if (!files?.length) return false

      const imageFile = Array.from(files).find(file => file.type.startsWith('image/'))
      if (imageFile) {
        uploadAndInsertImage(imageFile)
        return true
      }
      return false
    },
  },
})

// Initialize
lastSavedMarkdown.value = normalizeMarkdown(props.modelValue)
currentMarkdown.value = normalizeMarkdown(props.modelValue)

// Methods
function handleHeading(level: string) {
  if (!editor.value) return
  if (level === '0') {
    editor.value.chain().focus().setParagraph().run()
  } else {
    editor.value.chain().focus().toggleHeading({ level: parseInt(level) as 1 | 2 | 3 }).run()
  }
}

function handleTableAction(action: string) {
  if (!editor.value) return
  if (action === 'insert') {
    editor.value.chain().focus().insertTable({ rows: 3, cols: 4, withHeaderRow: true }).run()
  }
}

/** 从插图对话框批量插入图片 URL */
function insertImages(urls: string[]) {
  if (!editor.value || !urls.length) return
  // 注意：不能循环链式 setImage——块级图片插入后选区是落在该图上的
  // NodeSelection，再次 insertContent 会把上一张替换掉（表现为只显示一张）。
  // 一次 insertContent 传入节点数组，作为同一文档片段插入。
  const content = urls.flatMap((url) => [
    { type: 'image', attrs: { src: url } },
    { type: 'paragraph' },
  ])
  editor.value.chain().focus().insertContent(content).run()
}

async function uploadAndInsertImage(file: File) {
  try {
    const res = await uploadEditorImage(file, props.sectionId, props.outlineId)
    editor.value?.chain().focus().setImage({ src: res.data.url }).run()
    ElMessage.success('图片上传成功')
  } catch (err) {
    logError('图片上传失败:', err)
    ElMessage.error('图片上传失败')
  }
}

function toggleSourceMode() {
  if (isSourceMode.value) {
    const html = renderMarkdown(sourceContent.value)
    editor.value?.commands.setContent(html)
    emit('update:modelValue', sourceContent.value)
    isSourceMode.value = false
  } else {
    const html = editor.value?.getHTML() || ''
    sourceContent.value = turndownService.turndown(html)
    isSourceMode.value = true
  }
}

function onSourceChange() {
  dirty.value = true
  emit('dirty-change', true)
  emit('update:modelValue', sourceContent.value)
}

async function handleSave() {
  if (!editor.value) return
  saving.value = true
  try {
    const html = editor.value.getHTML()
    const markdown = turndownService.turndown(html)

    const res = await updateSectionContent(props.sectionId, {
      content: markdown,
      content_html: html,
    })

    lastSavedMarkdown.value = normalizeMarkdown(markdown)
    currentMarkdown.value = normalizeMarkdown(markdown)
    dirty.value = false
    emit('dirty-change', false)
    emit('saved', { content: markdown, version: res.data.version })
    ElMessage.success('内容已保存')
  } catch (err) {
    logError('保存失败:', err)
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

async function handleSaveFromSource() {
  saving.value = true
  try {
    const html = renderMarkdown(sourceContent.value)

    const res = await updateSectionContent(props.sectionId, {
      content: sourceContent.value,
      content_html: html,
    })

    lastSavedMarkdown.value = normalizeMarkdown(sourceContent.value)
    currentMarkdown.value = normalizeMarkdown(sourceContent.value)
    dirty.value = false
    emit('dirty-change', false)
    emit('saved', { content: sourceContent.value, version: res.data.version })
    ElMessage.success('内容已保存')
  } catch (err) {
    logError('保存失败:', err)
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

// Watchers
watch(
  () => props.sectionId,
  () => {
    loadMarkdownToEditor(props.modelValue)
    isSourceMode.value = false
    sourceContent.value = ''
  }
)

watch(
  () => props.modelValue,
  (newContent) => {
    if (!dirty.value && !isSourceMode.value) {
      const normalizedNew = normalizeMarkdown(newContent)
      if (normalizedNew !== lastSavedMarkdown.value) {
        loadMarkdownToEditor(newContent)
      }
    }
  }
)

onBeforeUnmount(() => {
  editor.value?.destroy()
})

defineExpose({
  dirty,
  handleSave,
  isDirty: () => dirty.value,
  save: handleSave,
  resetDirty: () => {
    lastSavedMarkdown.value = currentMarkdown.value
    dirty.value = false
    emit('dirty-change', false)
  },
})
</script>

<style scoped>
.editor-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--el-fill-color-lighter);
}

/* 简洁工具栏 */
.editor-toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 8px 12px;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-lighter);
  flex-wrap: wrap;
}

.editor-toolbar :deep(.el-button) {
  padding: 6px;
  height: 32px;
  min-width: 32px;
}

.editor-toolbar :deep(.el-button .el-icon) {
  font-size: 16px;
}

.toolbar-btn .btn-text {
  margin-left: 4px;
  font-size: 13px;
}

.editor-toolbar :deep(.el-divider--vertical) {
  height: 20px;
  margin: 0 6px;
}

.toolbar-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

.dirty-badge {
  font-size: 12px;
  color: var(--el-color-warning);
  background: var(--el-color-warning-light-9);
  padding: 2px 8px;
  border-radius: 10px;
}

/* 源码模式 */
.source-mode {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.source-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.source-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.source-actions {
  display: flex;
  gap: 8px;
}

.source-textarea {
  flex: 1;
}

.source-textarea :deep(.el-textarea__inner) {
  font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.6;
  border: none;
  border-radius: 0;
  padding: 16px;
}

/* 编辑内容区 */
.editor-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.editor-content :deep(.ProseMirror) {
  max-width: 800px;
  min-height: 600px;
  margin: 0 auto;
  padding: 40px 48px;
  background: var(--el-bg-color);
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
  outline: none;
}

/* ProseMirror 内容样式 */
.ProseMirror {
  color: var(--el-text-color-primary);
  font-size: 15px;
  line-height: 1.8;
}

.ProseMirror:empty::before {
  content: attr(data-placeholder);
  color: var(--el-text-color-placeholder);
  pointer-events: none;
}

.ProseMirror h1 {
  font-size: 26px;
  font-weight: 700;
  margin: 0 0 20px;
  color: var(--el-text-color-primary);
}

.ProseMirror h2 {
  font-size: 20px;
  font-weight: 600;
  margin: 24px 0 14px;
  color: var(--el-text-color-primary);
}

.ProseMirror h3 {
  font-size: 17px;
  font-weight: 600;
  margin: 20px 0 10px;
  color: var(--el-text-color-primary);
}

.ProseMirror p {
  margin: 8px 0;
}

.ProseMirror ul,
.ProseMirror ol {
  margin: 8px 0;
  padding-left: 24px;
}

.ProseMirror li {
  margin: 4px 0;
}

.ProseMirror blockquote {
  margin: 12px 0;
  padding: 12px 16px;
  border-left: 3px solid var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  color: var(--el-text-color-regular);
  border-radius: 0 6px 6px 0;
}

.ProseMirror table {
  border-collapse: collapse;
  width: 100%;
  margin: 16px 0;
}

.ProseMirror td,
.ProseMirror th {
  border: 1px solid var(--el-border-color);
  padding: 8px 12px;
  min-width: 80px;
}

.ProseMirror th {
  background: var(--el-fill-color-light);
  font-weight: 600;
}

.ProseMirror img {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 16px auto;
  border-radius: 6px;
}

/* 可缩放图片（NodeView 包装） */
.editor-content :deep(.resizable-image) {
  display: block;
  position: relative;
  margin: 16px auto;
  width: fit-content;
  max-width: 100%;
}

.editor-content :deep(.resizable-image img) {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 0;
  border-radius: 6px;
}

.editor-content :deep(.resizable-image.is-selected img) {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 1px;
}

.editor-content :deep(.image-resize-handle) {
  display: none;
  position: absolute;
  right: -7px;
  bottom: -7px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--el-color-primary);
  border: 2px solid #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
  cursor: nwse-resize;
  z-index: 10;
}

.editor-content :deep(.resizable-image.is-selected .image-resize-handle) {
  display: block;
}

.ProseMirror .selectedCell {
  background: var(--el-color-primary-light-9);
}
</style>
