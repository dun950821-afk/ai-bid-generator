<!-- frontend/src/components/bid-template/TemplateStylePanel.vue -->
<template>
  <div class="style-panel" v-loading="loading">
    <div class="panel-tip">
      把渲染器使用的逻辑样式映射到模板里的实际样式。不配置时使用 Word 内置样式
      （Heading 1 / 正文等）；模板样式名不同（如「标题 1」）时在此映射。
    </div>

    <el-table :data="rows" border size="small">
      <el-table-column label="逻辑样式" width="140">
        <template #default="{ row }">
          <span class="logical-name">{{ row.label }}</span>
          <div class="logical-key">{{ row.logical }}</div>
        </template>
      </el-table-column>
      <el-table-column label="模板样式" min-width="220">
        <template #default="{ row }">
          <el-select
            v-model="mapping[row.logical]"
            :placeholder="`默认：${styleLabel(row.fallback)}`"
            clearable
            filterable
            :disabled="!canManage"
            style="width: 100%"
          >
            <el-option
              v-for="style in availableStyles"
              :key="style"
              :label="styleLabel(style)"
              :value="style"
            />
          </el-select>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="110">
        <template #default="{ row }">
          <el-tag v-if="mapping[row.logical] && styleExists(mapping[row.logical])" size="small" type="success">
            已映射
          </el-tag>
          <el-tag v-else-if="mapping[row.logical]" size="small" type="danger">
            样式不存在
          </el-tag>
          <el-tag v-else size="small" type="info">默认</el-tag>
        </template>
      </el-table-column>
    </el-table>

    <div v-if="canManage" class="panel-actions">
      <el-button type="primary" :loading="saving" @click="handleSave">
        保存样式映射
      </el-button>
      <span class="save-tip">发布新版本时映射会写入版本快照</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { getTemplateStyles, updateTemplate } from '@/api/bidTemplate'

const props = defineProps<{
  templateId: number
  canManage: boolean
}>()

const LOGICAL_STYLES = [
  { logical: 'heading1', label: '一级标题', fallback: 'Heading 1' },
  { logical: 'heading2', label: '二级标题', fallback: 'Heading 2' },
  { logical: 'heading3', label: '三级标题', fallback: 'Heading 3' },
  { logical: 'heading4', label: '四级标题', fallback: 'Heading 4' },
  { logical: 'body', label: '正文', fallback: 'Normal' },
  { logical: 'list_bullet', label: '无序列表', fallback: 'List Bullet' },
  { logical: 'list_number', label: '有序列表', fallback: 'List Number' },
  { logical: 'table', label: '表格', fallback: 'Table Grid' },
  { logical: 'quote', label: '引用', fallback: 'Intense Quote' },
  { logical: 'image_caption', label: '图注', fallback: 'Caption' },
]

// Word 内置样式英文名的中文对照（模板用中文 Word/WPS 排版时
// styles.xml 里本来就是中文名，无需翻译）
const STYLE_NAME_ZH: Record<string, string> = {
  Normal: '正文',
  'Heading 1': '标题 1',
  'Heading 2': '标题 2',
  'Heading 3': '标题 3',
  'Heading 4': '标题 4',
  'Heading 5': '标题 5',
  'Heading 6': '标题 6',
  Title: '标题',
  Subtitle: '副标题',
  'List Bullet': '项目符号列表',
  'List Number': '编号列表',
  'List Paragraph': '列表段落',
  'Table Grid': '网格型表格',
  Quote: '引用',
  'Intense Quote': '明显引用',
  Caption: '题注',
  'TOC Heading': '目录标题',
  'No Spacing': '无间隔',
  Hyperlink: '超链接',
  FollowedHyperlink: '已访问的超链接',
  // 以下多为默认/系统模板里的辅助样式，一般用不到
  'Body Text': '正文文本',
  'Body Text Indent': '正文文本缩进',
  'Box Text': '文本框',
  'Block Text': '文本块',
  'Placeholder Text': '占位符文本',
  'Default Paragraph Font': '默认段落字体',
  'Table Normal': '普通表格',
  'No List': '无列表',
  Header: '页眉',
  Footer: '页脚',
  'Page Number': '页码',
  'Line Number': '行号',
  'Footnote Text': '脚注文本',
  'Footnote Reference': '脚注引用',
  'Endnote Text': '尾注文本',
  'Endnote Reference': '尾注引用',
  'Comment Text': '批注文本',
  'Comment Subject': '批注主题',
  'Balloon Text': '批注框文本',
  'TOC 1': '目录 1',
  'TOC 2': '目录 2',
  'TOC 3': '目录 3',
  'TOC 4': '目录 4',
  Index: '索引',
  'Index Heading': '索引标题',
  'Table of Contents': '目录',
  'Table of Figures': '图表目录',
  List: '列表',
  'List 2': '列表 2',
  'List 3': '列表 3',
}

function styleLabel(name: string) {
  const zh = STYLE_NAME_ZH[name]
  return zh ? `${zh}（${name}）` : name
}

const rows = LOGICAL_STYLES
const loading = ref(false)
const saving = ref(false)
const availableStyles = ref<string[]>([])
const mapping = reactive<Record<string, string>>({})

function styleExists(name: string) {
  return availableStyles.value.includes(name)
}

async function load() {
  loading.value = true
  try {
    const res = await getTemplateStyles(props.templateId)
    availableStyles.value = res.data.styles
    Object.assign(mapping, res.data.style_mapping || {})
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.error || '加载样式列表失败')
  } finally {
    loading.value = false
  }
}

async function handleSave() {
  saving.value = true
  try {
    const cleaned: Record<string, string> = {}
    for (const [key, value] of Object.entries(mapping)) {
      if (value) cleaned[key] = value
    }
    await updateTemplate(props.templateId, { style_mapping: cleaned } as any)
    ElMessage.success('样式映射已保存')
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.panel-tip {
  color: #909399;
  font-size: 12px;
  margin-bottom: 12px;
  line-height: 1.6;
}

.logical-name {
  font-weight: 600;
  font-size: 13px;
}

.logical-key {
  color: #909399;
  font-size: 12px;
}

.panel-actions {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.save-tip {
  color: #909399;
  font-size: 12px;
}
</style>
