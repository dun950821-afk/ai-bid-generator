<template>
  <div class="model-card" :class="{ 'is-default': model.is_default, 'is-mock': isMock }">
    <div class="model-card-main">
      <div class="model-card-header">
        <div class="model-title-row">
          <span class="model-display-name">{{ model.display_name || model.model_name }}</span>
          <el-tag v-if="model.is_default" type="success" size="small">默认</el-tag>
          <el-tag v-if="recommendTag" :type="recommendTag.type" size="small">{{ recommendTag.label }}</el-tag>
          <el-tag v-if="isMock" type="info" size="small">测试模型</el-tag>
        </div>
        <div class="model-name">{{ model.model_name }}</div>
      </div>
      <div class="model-card-meta">
        <el-tag :type="getModelTypeTag(model.model_type)" size="small" effect="plain">
          {{ getModelTypeLabel(model.model_type) }}
        </el-tag>
        <template v-if="providerType === 'deepseek'">
          <el-tag v-if="model.enable_thinking" type="primary" size="small" effect="plain">
            思考模式: {{ model.reasoning_effort || '启用' }}
          </el-tag>
          <el-tag v-else type="info" size="small" effect="plain">思考模式: 关闭</el-tag>
        </template>
        <el-tag type="info" size="small" effect="plain">
          Temp: {{ model.temperature }}
        </el-tag>
        <el-tag type="info" size="small" effect="plain">
          Max: {{ model.max_tokens }}
        </el-tag>
      </div>
    </div>
    <div class="model-card-actions">
      <el-button size="small" :loading="testing" @click="handleTest">
        测试
      </el-button>
      <el-button v-if="!model.is_default" size="small" @click="handleSetDefault">
        设为默认
      </el-button>
      <el-button size="small" @click="handleEdit">
        编辑
      </el-button>
      <el-button size="small" type="danger" @click="handleDelete">
        删除
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ModelConfig } from '@/api/systemConfig'

const props = defineProps<{
  model: ModelConfig
  providerType: string
  testing?: boolean
}>()

const emit = defineEmits<{
  (e: 'test', model: ModelConfig): void
  (e: 'setDefault', model: ModelConfig): void
  (e: 'edit', model: ModelConfig): void
  (e: 'delete', model: ModelConfig): void
}>()

const isMock = computed(() => props.providerType === 'mock')

const recommendTag = computed(() => {
  if (isMock.value) return null
  if (props.model.model_name === 'deepseek-v4-flash') {
    return { type: 'success' as const, label: '推荐' }
  }
  if (props.model.model_name === 'deepseek-v4-pro') {
    return { type: 'warning' as const, label: '高质量' }
  }
  return null
})

function getModelTypeTag(type: string) {
  const map: Record<string, string> = {
    chat: 'primary',
    embedding: 'success',
    rerank: 'warning',
  }
  return map[type] || 'info'
}

function getModelTypeLabel(type: string) {
  const map: Record<string, string> = {
    chat: 'Chat',
    embedding: 'Embedding',
    rerank: 'Rerank',
  }
  return map[type] || type
}

function handleTest() {
  emit('test', props.model)
}

function handleSetDefault() {
  emit('setDefault', props.model)
}

function handleEdit() {
  emit('edit', props.model)
}

function handleDelete() {
  emit('delete', props.model)
}
</script>

<style scoped>
.model-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  background: #fafbfc;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  margin-bottom: 12px;
  transition: all 0.2s;
}

.model-card:hover {
  border-color: #d1d5db;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.model-card.is-default {
  background: #f0fdf4;
  border-color: #86efac;
}

.model-card.is-mock {
  opacity: 0.85;
}

.model-card-main {
  flex: 1;
  min-width: 0;
}

.model-card-header {
  margin-bottom: 8px;
}

.model-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.model-display-name {
  font-size: 15px;
  font-weight: 500;
  color: #111827;
}

.model-name {
  font-size: 13px;
  color: #6b7280;
  font-family: monospace;
  margin-top: 2px;
}

.model-card-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.model-card-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 16px;
  flex-shrink: 0;
}

@media (max-width: 768px) {
  .model-card {
    flex-direction: column;
    align-items: stretch;
  }

  .model-card-actions {
    margin-left: 0;
    margin-top: 12px;
    justify-content: flex-end;
  }
}
</style>
