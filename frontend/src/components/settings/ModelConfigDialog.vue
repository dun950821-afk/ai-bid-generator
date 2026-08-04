<template>
  <el-dialog
    :model-value="visible"
    :title="isEdit ? '编辑模型' : '添加模型'"
    width="500px"
    @update:model-value="emit('close')"
  >
    <el-form :model="form" label-width="100px">
      <el-form-item label="供应商">
        <el-input :value="provider?.name" disabled />
      </el-form-item>
      <el-form-item label="模型名称" required>
        <el-select v-model="form.model_name" style="width: 100%" filterable allow-create default-first-option>
          <el-option-group v-if="provider?.provider_type === 'deepseek'" label="DeepSeek 模型">
            <el-option label="deepseek-v4-flash (推荐)" value="deepseek-v4-flash" />
            <el-option label="deepseek-v4-pro (高质量)" value="deepseek-v4-pro" />
            <el-option label="deepseek-chat" value="deepseek-chat" />
            <el-option label="deepseek-reasoner" value="deepseek-reasoner" />
          </el-option-group>
          <el-option-group v-if="provider?.provider_type === 'mock'" label="Mock 模型">
            <el-option label="mock-model" value="mock-model" />
          </el-option-group>
          <el-option-group label="其他">
            <el-option label="自定义模型名称" value="" />
          </el-option-group>
        </el-select>
        <div class="form-hint">可输入或选择模型名称</div>
      </el-form-item>
      <el-form-item label="显示名称">
        <el-input v-model="form.display_name" placeholder="如: DeepSeek V4 Flash" />
      </el-form-item>
      <el-form-item label="模型类型" required>
        <el-select v-model="form.model_type" style="width: 100%">
          <el-option label="Chat (对话)" value="chat" />
          <el-option label="Embedding (向量)" value="embedding" />
          <el-option label="Rerank (重排序)" value="rerank" />
        </el-select>
      </el-form-item>
      <el-form-item label="Temperature">
        <el-slider v-model="form.temperature" :min="0" :max="2" :step="0.1" show-input />
      </el-form-item>
      <el-form-item label="Max Tokens">
        <el-input-number v-model="form.max_tokens" :min="256" :max="128000" :step="256" style="width: 100%" />
        <div class="form-hint">max_tokens 是单次输出上限</div>
      </el-form-item>
      <el-form-item label="Context Length">
        <el-input-number v-model="form.context_length" :min="1024" :max="1000000" :step="1024" style="width: 100%" />
        <div class="form-hint">context_length 是模型输入窗口（DeepSeek V4 为 128000），决定抽取时全文截断预算</div>
      </el-form-item>
      <el-form-item label="Top P">
        <el-slider v-model="form.top_p" :min="0" :max="1" :step="0.1" show-input />
      </el-form-item>
      <el-form-item v-if="provider?.provider_type === 'deepseek'" label="思考模式">
        <el-switch v-model="form.enable_thinking" />
        <span class="form-hint">启用 DeepSeek V4 思考模式（推理增强）</span>
      </el-form-item>
      <el-form-item v-if="form.enable_thinking" label="推理强度">
        <el-select v-model="form.reasoning_effort" style="width: 100%">
          <el-option label="低" value="low" />
          <el-option label="中" value="medium" />
          <el-option label="高" value="high" />
        </el-select>
      </el-form-item>
      <el-form-item label="设为默认">
        <el-switch v-model="form.is_default" />
      </el-form-item>
      <el-form-item label="启用">
        <el-switch v-model="form.is_active" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('close')">取消</el-button>
      <el-button type="primary" :loading="loading" @click="handleSave">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { ModelProvider, ModelConfig } from '@/api/systemConfig'

const props = defineProps<{
  visible: boolean
  provider: ModelProvider | null
  model: ModelConfig | null
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save', data: {
    provider: number
    model_name: string
    model_type: 'chat' | 'embedding' | 'rerank'
    display_name: string
    temperature: number
    max_tokens: number
    context_length: number
    top_p: number
    enable_thinking: boolean
    reasoning_effort: string
    is_default: boolean
    is_active: boolean
  }): void
}>()

const isEdit = ref(false)

const defaultForm = {
  model_name: 'deepseek-v4-flash',
  model_type: 'chat' as 'chat' | 'embedding' | 'rerank',
  display_name: '',
  temperature: 0.7,
  max_tokens: 4096,
  context_length: 128000,
  top_p: 0.9,
  enable_thinking: false,
  reasoning_effort: '',
  is_default: false,
  is_active: true,
}

const form = ref({ ...defaultForm })

watch(() => props.visible, (visible) => {
  if (visible) {
    if (props.model) {
      isEdit.value = true
      form.value = {
        model_name: props.model.model_name,
        model_type: props.model.model_type,
        display_name: props.model.display_name || '',
        temperature: props.model.temperature,
        max_tokens: props.model.max_tokens,
        context_length: props.model.context_length ?? 128000,
        top_p: props.model.top_p,
        enable_thinking: props.model.enable_thinking || false,
        reasoning_effort: props.model.reasoning_effort || '',
        is_default: props.model.is_default,
        is_active: props.model.is_active,
      }
    } else {
      isEdit.value = false
      form.value = { ...defaultForm }
      // DeepSeek 默认用 v4-flash
      if (props.provider?.provider_type === 'deepseek') {
        form.value.model_name = 'deepseek-v4-flash'
      } else if (props.provider?.provider_type === 'mock') {
        form.value.model_name = 'mock-model'
      }
    }
  }
})

function handleSave() {
  if (!form.value.model_name || !form.value.model_type) {
    return
  }
  emit('save', {
    provider: props.provider!.id,
    model_name: form.value.model_name,
    model_type: form.value.model_type,
    display_name: form.value.display_name || form.value.model_name,
    temperature: form.value.temperature,
    max_tokens: form.value.max_tokens,
    context_length: form.value.context_length,
    top_p: form.value.top_p,
    enable_thinking: form.value.enable_thinking,
    reasoning_effort: form.value.reasoning_effort,
    is_default: form.value.is_default,
    is_active: form.value.is_active,
  })
}
</script>

<style scoped>
.form-hint {
  margin-top: 4px;
  color: #909399;
  font-size: 12px;
}
</style>