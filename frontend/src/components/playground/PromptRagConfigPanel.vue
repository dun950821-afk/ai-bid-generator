<!-- frontend/src/components/playground/PromptRagConfigPanel.vue -->
<script setup lang="ts">
/**
 * RAG 配置面板组件。
 */

import { ref, onMounted } from 'vue'
import { ElSwitch, ElInput, ElInputNumber, ElSelect, ElOption, ElFormItem } from 'element-plus'
import { http } from '@/api/http'

interface KnowledgeBase {
  id: number
  name: string
  kb_type: string
  is_active: boolean
}

export interface RagConfig {
  enabled: boolean
  knowledge_base_ids?: number[]
  query?: string
  top_k?: number
  max_context_tokens?: number
  filters?: Record<string, unknown>
}

const props = defineProps<{
  modelValue: RagConfig
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: RagConfig): void
}>()

const knowledgeBases = ref<KnowledgeBase[]>([])
const loading = ref(false)

async function loadKnowledgeBases() {
  loading.value = true
  try {
    const res = await http.get<{ results: KnowledgeBase[] }>('/api/knowledge/knowledge-bases/', {
      params: { is_active: true },
    })
    knowledgeBases.value = res.data.results || res.data as unknown as KnowledgeBase[]
  } catch (e) {
    console.error('加载知识库失败', e)
  } finally {
    loading.value = false
  }
}

function updateConfig<K extends keyof RagConfig>(key: K, value: RagConfig[K]) {
  emit('update:modelValue', {
    ...props.modelValue,
    [key]: value,
  })
}

function onKbChange(ids: number[]) {
  updateConfig('knowledge_base_ids', ids)
}

function onEnabledChange(val: string | number | boolean) {
  updateConfig('enabled', Boolean(val))
}

function onQueryChange(val: string) {
  updateConfig('query', val)
}

function onTopKChange(val: number | undefined) {
  updateConfig('top_k', val ?? 5)
}

function onMaxTokensChange(val: number | undefined) {
  updateConfig('max_context_tokens', val ?? 4000)
}

onMounted(() => {
  loadKnowledgeBases()
})
</script>

<template>
  <div class="rag-config-panel">
    <div class="config-header">
      <span>RAG 配置</span>
      <el-switch
        :model-value="modelValue.enabled"
        @update:model-value="onEnabledChange"
        active-text="启用"
        inactive-text="禁用"
      />
    </div>

    <template v-if="modelValue.enabled">
      <el-form-item label="知识库" required>
        <el-select
          :model-value="modelValue.knowledge_base_ids"
          @update:model-value="onKbChange"
          multiple
          collapse-tags
          collapse-tags-tooltip
          placeholder="选择知识库"
          :loading="loading"
          style="width: 100%"
        >
          <el-option
            v-for="kb in knowledgeBases"
            :key="kb.id"
            :value="kb.id"
            :label="kb.name"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="检索查询" required>
        <el-input
          :model-value="modelValue.query"
          @update:model-value="onQueryChange"
          placeholder="输入检索查询文本"
        />
      </el-form-item>

      <el-form-item label="Top K">
        <el-input-number
          :model-value="modelValue.top_k"
          @update:model-value="onTopKChange"
          :min="1"
          :max="20"
        />
      </el-form-item>

      <el-form-item label="最大上下文 Tokens">
        <el-input-number
          :model-value="modelValue.max_context_tokens"
          @update:model-value="onMaxTokensChange"
          :min="500"
          :max="16000"
          :step="1000"
        />
      </el-form-item>
    </template>
  </div>
</template>

<style scoped>
.rag-config-panel {
  padding: 12px;
}

.config-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
</style>