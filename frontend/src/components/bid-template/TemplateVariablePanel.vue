<!-- frontend/src/components/bid-template/TemplateVariablePanel.vue -->
<template>
  <div class="variable-panel">
    <div class="panel-header">
      <span class="panel-title">模板变量</span>
      <el-input
        v-model="search"
        placeholder="搜索变量……"
        clearable
        size="small"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
    </div>

    <div v-if="!editorReady" class="editor-hint">
      编辑器加载完成后可点击插入变量
    </div>

    <el-collapse v-model="activeGroups" class="variable-groups">
      <el-collapse-item
        v-for="group in filteredGroups"
        :key="group.category"
        :name="group.category"
        :title="group.category_name"
      >
        <div
          v-for="variable in group.variables"
          :key="variable.key"
          class="variable-item"
          :class="{ disabled: !editorReady }"
          @click="handleInsert(variable)"
        >
          <div class="variable-main">
            <span class="variable-name">{{ variable.name }}</span>
            <el-tag v-if="variable.required" size="small" type="danger" effect="plain">必填</el-tag>
            <el-tag v-if="variable.control_type !== 'var'" size="small" type="warning" effect="plain">
              {{ controlTypeLabel(variable.control_type) }}
            </el-tag>
          </div>
          <div class="variable-desc">{{ variable.description || variable.source }}</div>
        </div>
      </el-collapse-item>
    </el-collapse>

    <el-empty
      v-if="filteredGroups.length === 0"
      description="没有匹配的变量"
      :image-size="60"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import {
  listTemplateVariables,
  type TemplateVariable,
  type TemplateVariableGroup,
} from '@/api/bidTemplate'
import { insertContentControl } from '@/utils/onlyofficeConnector'

const props = defineProps<{
  /** DocumentEditor 组件的 id（DocEditor.instances 的 key） */
  editorId: string
  /** 编辑器是否已就绪（api.js 加载 + onDocumentReady） */
  editorReady: boolean
}>()

const search = ref('')
const groups = ref<TemplateVariableGroup[]>([])
const activeGroups = ref<string[]>([
  'project',
  'company',
  'system',
  'document',
  'special',
])

const filteredGroups = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  if (!keyword) return groups.value
  return groups.value
    .map(group => ({
      ...group,
      variables: group.variables.filter(
        v =>
          v.name.toLowerCase().includes(keyword) ||
          v.key.toLowerCase().includes(keyword) ||
          (v.description || '').toLowerCase().includes(keyword),
      ),
    }))
    .filter(group => group.variables.length > 0)
})

function controlTypeLabel(controlType: string) {
  return {
    slot: '插槽',
    image: '图片',
    material: '材料',
  }[controlType] || controlType
}

async function handleInsert(variable: TemplateVariable) {
  if (!props.editorReady) {
    ElMessage.warning('编辑器尚未就绪，请稍候')
    return
  }

  let tag = variable.control_tag

  // 材料控件需要指定用途标识（usage_key）
  if (variable.control_type === 'material') {
    try {
      const { value } = await ElMessageBox.prompt(
        '请输入材料用途标识（英文小写，如 business_license、qualification_certificate）',
        `插入${variable.name}`,
        {
          confirmButtonText: '插入',
          cancelButtonText: '取消',
          inputPattern: /^[a-z][a-z0-9_]*$/,
          inputErrorMessage: '只能包含小写字母、数字和下划线，且以字母开头',
        },
      )
      tag = `bid.material:${value}`
    } catch {
      return
    }
  }

  try {
    await insertContentControl(props.editorId, {
      tag,
      alias: variable.name,
      block: variable.control_type === 'slot',
    })
    ElMessage.success(`已插入「${variable.name}」`)
  } catch (err: any) {
    ElMessage.error(err?.message || '插入失败，请确认编辑器已就绪')
  }
}

onMounted(async () => {
  try {
    const res = await listTemplateVariables()
    groups.value = res.data.groups
  } catch (err) {
    ElMessage.error('加载变量列表失败')
  }
})
</script>

<style scoped>
.variable-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.panel-header {
  padding: 12px;
  border-bottom: 1px solid #e4e7ed;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

.panel-title {
  font-weight: 600;
  font-size: 14px;
}

.editor-hint {
  padding: 8px 12px;
  color: #e6a23c;
  font-size: 12px;
  background: #fdf6ec;
  flex-shrink: 0;
}

.variable-groups {
  flex: 1;
  overflow-y: auto;
  border-top: none;
}

.variable-item {
  padding: 8px 12px;
  cursor: pointer;
  border-bottom: 1px solid #f2f6fc;
}

.variable-item:hover {
  background: #ecf5ff;
}

.variable-item.disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.variable-main {
  display: flex;
  align-items: center;
  gap: 6px;
}

.variable-name {
  font-size: 13px;
  color: #303133;
}

.variable-desc {
  font-size: 12px;
  color: #909399;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
