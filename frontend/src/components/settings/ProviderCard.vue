<template>
  <div class="provider-card" :class="{ 'is-mock': provider.provider_type === 'mock' }">
    <!-- Provider Header -->
    <div class="provider-header">
      <div class="provider-info">
        <div class="provider-title-row">
          <h3 class="provider-name">{{ provider.name }}</h3>
          <el-tag :type="getProviderTypeTag(provider.provider_type)" size="small">
            {{ provider.provider_type }}
          </el-tag>
        </div>
        <div class="provider-status">
          <el-tag v-if="provider.has_api_key" type="success" size="small">
            <el-icon><CircleCheck /></el-icon>
            API Key 已配置
          </el-tag>
          <el-tag v-else type="warning" size="small">
            <el-icon><Warning /></el-icon>
            API Key 未配置
          </el-tag>
          <el-tag v-if="provider.provider_type === 'deepseek'" type="info" size="small" effect="plain">
            OpenAI 兼容 · JSON Output · 思考模式
          </el-tag>
        </div>
        <div v-if="provider.base_url" class="provider-base-url">
          Base URL: <code>{{ provider.base_url }}</code>
        </div>
      </div>
      <div class="provider-actions">
        <el-button size="small" @click="handleConfig">
          <el-icon><Setting /></el-icon>
          配置供应商
        </el-button>
        <el-button size="small" type="primary" @click="handleAddModel">
          <el-icon><Plus /></el-icon>
          添加模型
        </el-button>
      </div>
    </div>

    <!-- Models List -->
    <div class="provider-models">
      <div v-if="models.length === 0" class="no-models">
        <span>暂无模型配置</span>
      </div>
      <ModelCard
        v-for="model in models"
        :key="model.id"
        :model="model"
        :provider-type="provider.provider_type"
        :testing="testingModelId === model.id"
        @test="handleTest"
        @set-default="handleSetDefault"
        @edit="handleEdit"
        @delete="handleDelete"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { CircleCheck, Warning, Setting, Plus } from '@element-plus/icons-vue'
import ModelCard from './ModelCard.vue'
import type { ModelProvider, ModelConfig } from '@/api/systemConfig'

const props = defineProps<{
  provider: ModelProvider
  models: ModelConfig[]
  testingModelId?: number | null
}>()

const emit = defineEmits<{
  (e: 'config', provider: ModelProvider): void
  (e: 'addModel', provider: ModelProvider): void
  (e: 'testModel', model: ModelConfig): void
  (e: 'setDefaultModel', model: ModelConfig): void
  (e: 'editModel', model: ModelConfig): void
  (e: 'deleteModel', model: ModelConfig): void
}>()

function getProviderTypeTag(type: string) {
  const map: Record<string, string> = {
    deepseek: 'primary',
    openai_compatible: 'success',
    dashscope: 'warning',
    mock: 'info',
  }
  return map[type] || 'info'
}

function handleConfig() {
  emit('config', props.provider)
}

function handleAddModel() {
  emit('addModel', props.provider)
}

function handleTest(model: ModelConfig) {
  emit('testModel', model)
}

function handleSetDefault(model: ModelConfig) {
  emit('setDefaultModel', model)
}

function handleEdit(model: ModelConfig) {
  emit('editModel', model)
}

function handleDelete(model: ModelConfig) {
  emit('deleteModel', model)
}
</script>

<style scoped>
.provider-card {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.provider-card.is-mock {
  background: #fafafa;
  border-color: #d1d5db;
}

.provider-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
}

.provider-info {
  flex: 1;
}

.provider-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.provider-name {
  font-size: 18px;
  font-weight: 600;
  color: #111827;
  margin: 0;
}

.provider-status {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.provider-status .el-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.provider-base-url {
  margin-top: 8px;
  font-size: 13px;
  color: #6b7280;
}

.provider-base-url code {
  background: #f3f4f6;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
}

.provider-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.provider-models {
  border-top: 1px solid #e5e7eb;
  padding-top: 16px;
}

.no-models {
  padding: 20px;
  text-align: center;
  color: #9ca3af;
  font-size: 14px;
}

@media (max-width: 640px) {
  .provider-header {
    flex-direction: column;
    gap: 12px;
  }

  .provider-actions {
    width: 100%;
    justify-content: flex-end;
  }
}
</style>