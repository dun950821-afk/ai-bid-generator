<!-- frontend/src/components/playground/PromptModelSelector.vue -->
<script setup lang="ts">
/**
 * 模型选择器组件。
 * 只显示 Chat 类型模型，支持默认值。
 */

import { ref, onMounted, computed } from 'vue'
import { ElSelect, ElOption, ElTag } from 'element-plus'
import { http } from '@/api/http'

interface ModelConfig {
  id: number
  model_name: string
  display_name: string
  model_type: string
  provider: {
    name: string
  }
  is_default: boolean
  is_active: boolean
}

const props = defineProps<{
  modelValue: number | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: number | null): void
}>()

const configs = ref<ModelConfig[]>([])
const loading = ref(false)

// Chat 模型列表
const chatModels = computed(() => {
  return configs.value.filter(c => c.model_type === 'chat' && c.is_active)
})

// 默认模型
const defaultModel = computed(() => {
  return chatModels.value.find(c => c.is_default)
})

async function loadConfigs() {
  loading.value = true
  try {
    const res = await http.get<ModelConfig[]>('/api/generation/model-configs/', {
      params: { model_type: 'chat' },
    })
    configs.value = res.data
  } catch (e) {
    console.error('加载模型配置失败', e)
  } finally {
    loading.value = false
  }
}

function onChange(val: number | null) {
  emit('update:modelValue', val)
}

onMounted(() => {
  loadConfigs()
})
</script>

<template>
  <div class="model-selector">
    <el-select
      :model-value="modelValue"
      @update:model-value="onChange"
      placeholder="选择模型"
      clearable
      :loading="loading"
      style="width: 100%"
    >
      <el-option :value="null" label="使用默认模型">
        <span>使用默认模型</span>
        <el-tag v-if="defaultModel" size="small" type="info" style="margin-left: 8px">
          {{ defaultModel.display_name }}
        </el-tag>
      </el-option>

      <el-option
        v-for="config in chatModels"
        :key="config.id"
        :value="config.id"
        :label="config.display_name"
      >
        <span>{{ config.display_name }}</span>
        <el-tag size="small" type="info" style="margin-left: 8px">{{ config.provider.name }}</el-tag>
        <el-tag v-if="config.is_default" size="small" type="success" style="margin-left: 4px">默认</el-tag>
      </el-option>
    </el-select>
  </div>
</template>

<style scoped>
.model-selector {
  padding: 12px;
}
</style>