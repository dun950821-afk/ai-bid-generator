<!-- frontend/src/views/outline/components/SectionRichEditor.vue -->
<template>
  <div class="content-editor-shell">
    <!-- 工具栏 -->
    <div class="editor-toolbar" v-if="!isSourceMode">
      <el-button-group>
        <el-button :disabled="!editor || !editor.can().undo()" @click="editor?.chain().focus().undo().run()" size="small">
          <el-icon><RefreshLeft /></el-icon>
        </el-button>
        <el-button :disabled="!editor || !editor.can().redo()" @click="editor?.chain().focus().redo().run()" size="small">
          <el-icon><RefreshRight /></el-icon>
        </el-button>
      </el-button-group>

      <el-divider direction="vertical" />

      <el-dropdown trigger="click" @command="handleHeading">
        <el-button size="small">
          标题 <el-icon class="el-icon--right"><ArrowDown /></el-icon>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="1">H1 一级标题</el-dropdown-item>
            <el-dropdown-item command="2">H2 二级标题</el-dropdown-item>
            <el-dropdown-item command="3">H3 三级标题</el-dropdown-item>
            <el-dropdown-item command="0">正文</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>

      <el-divider direction="vertical" />

      <el-button-group>
        <el-button :disabled="!editor" @click="editor?.chain().focus().toggleBold().run()" :type="editor?.isActive('bold') ? 'primary' : ''" size="small">
          <el-icon><svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z"/></svg></el-icon>
        </el-button>
        <el-button :disabled="!editor" @click="editor?.chain().focus().toggleItalic().run()" :type="editor?.isActive('italic') ? 'primary' : ''" size="small">
          <el-icon><svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z"/></svg></el-icon>
        </el-button>
        <el-button :disabled="!editor" @click="editor?.chain().focus().toggleUnderline().run()" :type="editor?.isActive('underline') ? 'primary' : ''" size="small">
          <el-icon><svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M12 17c3.31 0 6-2.69 6-6V3h-2.5v8c0 1.93-1.57 3.5-3.5 3.5S8.5 12.93 8.5 11V3H6v8c0 3.31 2.69 6 6 6zm-7 2v2h14v-2H5z"/></svg></el-icon>
        </el-button>
      </el-button-group>

      <el-divider direction="vertical" />

      <el-button-group>
        <el-button :disabled="!editor" @click="editor?.chain().focus().toggleBulletList().run()" :type="editor?.isActive('bulletList') ? 'primary' : ''" size="small">
          <el-icon><svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z"/></svg></el-icon>
        </el-button>
        <el-button :disabled="!editor" @click="editor?.chain().focus().toggleOrderedList().run()" :type="editor?.isActive('orderedList') ? 'primary' : ''" size="small">
          <el-icon><svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M2 17h2v.5H3v1h1v.5H2v1h3v-4H2v1zm1-9h1V4H2v1h1v3zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2v1zm5-6v2h14V5H7zm0 14h14v-2H7v2zm0-6h14v-2H7v2z"/></svg></el-icon>
        </el-button>
        <el-button :disabled="!editor" @click="editor?.chain().focus().toggleBlockquote().run()" :type="editor?.isActive('blockquote') ? 'primary' : ''" size="small">
          <el-icon><svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z"/></svg></el-icon>
        </el-button>
      </el-button-group>

      <el-divider direction="vertical" />

      <el-button-group>
        <el-button :disabled="!editor" @click="editor?.chain().focus().setTextAlign('left').run()" :type="editor?.isActive({ textAlign: 'left' }) ? 'primary' : ''" size="small">
          左
        </el-button>
        <el-button :disabled="!editor" @click="editor?.chain().focus().setTextAlign('center').run()" :type="editor?.isActive({ textAlign: 'center' }) ? 'primary' : ''" size="small">
          中
        </el-button>
        <el-button :disabled="!editor" @click="editor?.chain().focus().setTextAlign('right').run()" :type="editor?.isActive({ textAlign: 'right' }) ? 'primary' : ''" size="small">
          右
        </el-button>
      </el-button-group>

      <el-divider direction="vertical" />

      <el-dropdown trigger="click" @command="handleTableAction">
        <el-button size="small">
          表格 <el-icon class="el-icon--right"><ArrowDown /></el-icon>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="insert">插入表格</el-dropdown-item>
            <el-dropdown-item command="addRow" :disabled="!editor?.isActive('table')">添加行</el-dropdown-item>
            <el-dropdown-item command="deleteRow" :disabled="!editor?.isActive('table')">删除行</el-dropdown-item>
            <el-dropdown-item command="addCol" :disabled="!editor?.isActive('table')">添加列</el-dropdown-item>
            <el-dropdown-item command="deleteCol" :disabled="!editor?.isActive('table')">删除列</el-dropdown-item>
            <el-dropdown-item command="deleteTable" :disabled="!editor?.isActive('table')">删除表格</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>

      <el-divider direction="vertical" />

      <el-button :disabled="!editor" @click="handleImageUpload" size="small">
        <el-icon><Picture /></el-icon>
        图片
      </el-button>

      <el-divider direction="vertical" />

      <el-button @click="toggleSourceMode" size="small">
        <el-icon><Document /></el-icon>
        {{ isSourceMode ? '富文本' : '源码' }}
      </el-button>

      <el-divider direction="vertical" />

      <el-button type="primary" :loading="saving" :disabled="!dirty" @click="handleSave" size="small">
        <el-icon><Check /></el-icon>
        保存
      </el-button>

      <span v-if="dirty" class="dirty-status">未保存</span>
    </div>

    <!-- Markdown 源码模式 -->
    <div v-if="isSourceMode" class="source-editor">
      <div class="source-toolbar">
        <el-button @click="toggleSourceMode" size="small">返回富文本</el-button>
        <el-button type="primary" :loading="saving" :disabled="!dirty" @click="handleSaveFromSource" size="small">
          保存
        </el-button>
        <span v-if="dirty" class="dirty-status">未保存</span>
      </div>
      <el-input
        v-model="sourceContent"
        type="textarea"
        :rows="20"
        placeholder="Markdown 源码"
        @input="onSourceChange"
      />
    </div>

    <!-- 富文本编辑器 -->
    <div v-else class="editor-paper">
      <EditorContent :editor="editor" />
    </div>

    <!-- 隐藏的图片上传 input -->
    <input
      type="file"
      ref="imageInput"
      accept="image/png,image/jpeg,image/webp"
      style="display: none"
      @change="handleImageFileChange"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
import { logError } from '@/utils/logger'
import { ElMessage } from 'element-plus'
import { RefreshLeft, RefreshRight, ArrowDown, Picture, Document, Check } from '@element-plus/icons-vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import Image from '@tiptap/extension-image'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import Placeholder from '@tiptap/extension-placeholder'
import MarkdownIt from 'markdown-it'
import TurndownService from 'turndown'
import { uploadEditorImage, updateSectionContent } from '@/api/sectionContent'

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

// Markdown 解析和转换
const md = new MarkdownIt({
  html: true,
  breaks: true,
  linkify: true,
})

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
})

// 确保 table 正确转换为 Markdown 表格
turndownService.addRule('table', {
  filter: 'table',
  replacement: function (content: string, node: HTMLElement) {
    const rows = node.querySelectorAll('tr')
    if (rows.length === 0) return content

    let result = ''
    const headerRow = rows[0]
    const cells = headerRow.querySelectorAll('th, td')
    const colCount = cells.length

    // Header row
    result += '|'
    cells.forEach((cell: Element) => {
      result += ` ${cell.textContent?.trim() || ''} |`
    })
    result += '\n'

    // Separator
    result += '|'
    for (let i = 0; i < colCount; i++) {
      result += ' --- |'
    }
    result += '\n'

    // Body rows
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

// State
const isHydrating = ref(false)
const dirty = ref(false)
const saving = ref(false)
const isSourceMode = ref(false)
const sourceContent = ref('')
const lastSavedMarkdown = ref('')
const currentMarkdown = ref('')
const imageInput = ref<HTMLInputElement | null>(null)

// Normalize markdown for comparison
function normalizeMarkdown(value?: string) {
  return (value || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .trim()
}

// Load markdown into editor without triggering dirty
function loadMarkdownToEditor(markdown: string) {
  isHydrating.value = true
  const html = md.render(markdown || '')
  editor.value?.commands.setContent(html)
  lastSavedMarkdown.value = normalizeMarkdown(markdown)
  currentMarkdown.value = normalizeMarkdown(markdown)
  dirty.value = false
  emit('dirty-change', false)
  // Delay releasing hydrating flag to ensure onUpdate from setContent is suppressed
  setTimeout(() => {
    isHydrating.value = false
  }, 50)
}

// Editor
const editor = useEditor({
  content: md.render(props.modelValue || ''),
  extensions: [
    StarterKit.configure({
      heading: {
        levels: [1, 2, 3],
      },
    }),
    Underline,
    Placeholder.configure({
      placeholder: '请输入章节内容...',
    }),
    TextAlign.configure({
      types: ['heading', 'paragraph'],
    }),
    Image.configure({
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

    // Only mark dirty if content actually changed
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

// Initialize lastSavedMarkdown after editor is created
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

  switch (action) {
    case 'insert':
      editor.value.chain().focus().insertTable({ rows: 3, cols: 4, withHeaderRow: true }).run()
      break
    case 'addRow':
      editor.value.chain().focus().addRowAfter().run()
      break
    case 'deleteRow':
      editor.value.chain().focus().deleteRow().run()
      break
    case 'addCol':
      editor.value.chain().focus().addColumnAfter().run()
      break
    case 'deleteCol':
      editor.value.chain().focus().deleteColumn().run()
      break
    case 'deleteTable':
      editor.value.chain().focus().deleteTable().run()
      break
  }
}

function handleImageUpload() {
  imageInput.value?.click()
}

function handleImageFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) {
    uploadAndInsertImage(file)
    target.value = '' // 清空以便再次选择
  }
}

async function uploadAndInsertImage(file: File) {
  try {
    const res = await uploadEditorImage(file, props.sectionId, props.outlineId)
    const url = res.data.url

    editor.value?.chain().focus().setImage({ src: url }).run()
    ElMessage.success('图片上传成功')
  } catch (err) {
    logError('图片上传失败:', err)
    ElMessage.error('图片上传失败')
  }
}

function toggleSourceMode() {
  if (isSourceMode.value) {
    // 从源码模式切换回富文本
    const html = md.render(sourceContent.value)
    editor.value?.commands.setContent(html)
    emit('update:modelValue', sourceContent.value)
    isSourceMode.value = false
  } else {
    // 从富文本切换到源码模式
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

    // Reset dirty state after successful save
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
    const html = md.render(sourceContent.value)

    const res = await updateSectionContent(props.sectionId, {
      content: sourceContent.value,
      content_html: html,
    })

    // Reset dirty state after successful save
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

// Watch for section changes - reset editor content
watch(
  () => props.sectionId,
  () => {
    // Use loadMarkdownToEditor to reset content without triggering dirty
    loadMarkdownToEditor(props.modelValue)

    // Reset source mode
    isSourceMode.value = false
    sourceContent.value = ''
  }
)

// Watch for external content changes
watch(
  () => props.modelValue,
  (newContent) => {
    // Only update if not dirty and not in source mode
    if (!dirty.value && !isSourceMode.value) {
      // Check if content actually changed (normalized comparison)
      const normalizedNew = normalizeMarkdown(newContent)
      if (normalizedNew !== lastSavedMarkdown.value) {
        loadMarkdownToEditor(newContent)
      }
    }
  }
)

// Cleanup
onBeforeUnmount(() => {
  editor.value?.destroy()
})

// Expose dirty state for parent component
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
.content-editor-shell {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #f5f7fa;
}

/* ========== Sticky 工具栏 ========== */
.editor-toolbar {
  position: sticky;
  top: 0;
  z-index: 20;
  background: #fff;
  border-bottom: 1px solid #ebeef5;
  padding: 10px 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
}

.editor-toolbar .el-divider--vertical {
  height: 20px;
  margin: 0 4px;
}

.dirty-status {
  color: #e6a23c;
  font-size: 12px;
  margin-left: 8px;
  font-weight: 500;
}

/* ========== 源码编辑模式 ========== */
.source-editor {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.source-toolbar {
  padding: 10px 16px;
  background: #fff;
  border-bottom: 1px solid #ebeef5;
  display: flex;
  align-items: center;
  gap: 8px;
}

.source-editor .el-textarea {
  flex: 1;
}

.source-editor .el-textarea__inner {
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 14px;
  line-height: 1.6;
  border: none;
  border-radius: 0;
}

/* ========== 白色纸张编辑区 ========== */
.editor-paper {
  flex: 1;
  overflow-y: auto;
  padding: 24px 16px;
  background: #f5f7fa;
}

.editor-paper :deep(.ProseMirror) {
  max-width: 900px;
  min-height: 700px;
  margin: 0 auto 32px;
  padding: 48px 56px;
  background: #fff;
  border: 1px solid #e4e7ed;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
  border-radius: 2px;
}

/* ========== ProseMirror 编辑器内容样式 ========== */
.ProseMirror {
  outline: none;
  color: #1f2937;
  font-size: 15px;
  line-height: 1.85;
}

.ProseMirror:empty::before {
  content: attr(data-placeholder);
  color: #909399;
  pointer-events: none;
}

.ProseMirror h1 {
  font-size: 28px;
  font-weight: 700;
  margin: 0 0 24px;
  color: #1f2937;
  line-height: 1.3;
}

.ProseMirror h2 {
  font-size: 22px;
  font-weight: 700;
  margin: 28px 0 16px;
  color: #1f2937;
  line-height: 1.35;
}

.ProseMirror h3 {
  font-size: 18px;
  font-weight: 700;
  margin: 22px 0 12px;
  color: #1f2937;
  line-height: 1.4;
}

.ProseMirror p {
  margin: 10px 0;
}

.ProseMirror ul,
.ProseMirror ol {
  margin: 10px 0;
  padding-left: 28px;
}

.ProseMirror li {
  margin: 4px 0;
}

.ProseMirror blockquote {
  margin: 12px 0;
  padding: 12px 20px;
  border-left: 4px solid #dcdfe6;
  background: #f9fafb;
  color: #606266;
  border-radius: 0 4px 4px 0;
}

.ProseMirror table {
  border-collapse: collapse;
  width: 100%;
  margin: 16px 0;
}

.ProseMirror td,
.ProseMirror th {
  border: 1px solid #dcdfe6;
  padding: 10px 14px;
  min-width: 80px;
  vertical-align: top;
}

.ProseMirror th {
  background: #f5f7fa;
  font-weight: 700;
  color: #303133;
}

.ProseMirror img {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 16px auto;
  border-radius: 4px;
}

.ProseMirror .selectedCell {
  background: #ecf5ff;
}

/* 表格 resize 样式 */
.ProseMirror table .column-resize-handle {
  position: absolute;
  right: -2px;
  top: 0;
  bottom: 0;
  width: 4px;
  background: #409eff;
  pointer-events: none;
}
</style>