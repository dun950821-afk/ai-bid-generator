<!-- frontend/src/components/playground/PromptVariableEditor.vue -->
<script setup lang="ts">
/**
 * 变量编辑器组件。
 * 支持动态表单和 JSON 编辑两种模式。
 */

import { ref, computed, watch } from 'vue'
import { ElInput, ElFormItem, ElSwitch, ElAlert } from 'element-plus'

const props = defineProps<{
  variableSchema?: Record<string, unknown>
  modelValue: Record<string, unknown>
  /** 表单模式下隐藏的 schema 键（如已被输入面板独占的 document_text） */
  hiddenKeys?: string[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: Record<string, unknown>): void
}>()

// 编辑模式：form 或 json
const editMode = ref<'form' | 'json'>('json')

// JSON 文本
const jsonText = ref('')

// JSON 解析错误
const jsonError = ref<string | null>(null)

// 是否有 schema 定义
const hasSchema = computed(() => {
  return props.variableSchema?.properties && Object.keys(props.variableSchema.properties).length > 0
})

// Schema 属性列表（hiddenKeys 仅过滤表单模式；JSON 模式保留全部键）
const schemaProperties = computed(() => {
  if (!hasSchema.value) return []
  const hidden = new Set(props.hiddenKeys ?? [])
  const schemaProps = props.variableSchema!.properties as Record<string, Record<string, unknown>>
  return Object.entries(schemaProps)
    .filter(([key]) => !hidden.has(key))
    .map(([key, schema]) => ({
      key,
      type: schema.type as string || 'string',
      title: schema.title as string || key,
      description: schema.description as string || '',
      default: schema.default,
      required: (props.variableSchema!.required as string[] || []).includes(key),
    }))
})

// 同步 JSON 文本
watch(() => props.modelValue, (val) => {
  jsonText.value = JSON.stringify(val, null, 2)
}, { immediate: true })

// JSON 模式：解析并更新
function onJsonChange(val: string) {
  jsonText.value = val
  try {
    const parsed = JSON.parse(val)
    if (typeof parsed === 'object' && !Array.isArray(parsed) && parsed !== null) {
      emit('update:modelValue', parsed)
      jsonError.value = null
    } else {
      jsonError.value = '变量必须是 JSON 对象'
    }
  } catch {
    jsonError.value = 'JSON 格式错误'
  }
}

// 表单模式：更新单个字段
function onFieldChange(key: string, val: unknown) {
  emit('update:modelValue', {
    ...props.modelValue,
    [key]: val,
  })
}
</script>

<template>
  <div class="variable-editor">
    <div class="editor-header">
      <span>变量输入</span>
      <el-switch
        v-if="hasSchema"
        v-model="editMode"
        active-value="form"
        inactive-value="json"
        active-text="表单"
        inactive-text="JSON"
        size="small"
      />
    </div>

    <!-- JSON 编辑模式 -->
    <template v-if="editMode === 'json' || !hasSchema">
      <el-input
        type="textarea"
        :rows="10"
        :model-value="jsonText"
        @update:model-value="onJsonChange"
        placeholder='{"key": "value"}'
      />
      <el-alert v-if="jsonError" type="error" :closable="false" style="margin-top: 8px">
        {{ jsonError }}
      </el-alert>
    </template>

    <!-- 表单编辑模式 -->
    <template v-else>
      <div class="form-fields">
        <el-form-item
          v-for="prop in schemaProperties"
          :key="prop.key"
          :label="prop.title"
          :required="prop.required"
        >
          <template v-if="prop.type === 'string'">
            <el-input
              :model-value="(props.modelValue[prop.key] as string) || ''"
              @update:model-value="onFieldChange(prop.key, $event)"
              :placeholder="prop.description"
            />
          </template>
          <template v-else-if="prop.type === 'number' || prop.type === 'integer'">
            <el-input-number
              :model-value="(props.modelValue[prop.key] as number) || 0"
              @update:model-value="onFieldChange(prop.key, $event)"
            />
          </template>
          <template v-else-if="prop.type === 'boolean'">
            <el-switch
              :model-value="(props.modelValue[prop.key] as boolean) || false"
              @update:model-value="onFieldChange(prop.key, $event)"
            />
          </template>
          <template v-else>
            <el-input
              type="textarea"
              :rows="3"
              :model-value="JSON.stringify(props.modelValue[prop.key] || '')"
              @update:model-value="(val) => onFieldChange(prop.key, JSON.parse(val || 'null'))"
            />
          </template>
        </el-form-item>
      </div>
    </template>
  </div>
</template>

<style scoped>
.variable-editor {
  padding: 12px;
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.form-fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>