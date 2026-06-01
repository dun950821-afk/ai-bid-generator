<template>
  <el-dialog
    :model-value="visible"
    :title="isEdit ? '配置供应商' : '新增供应商'"
    width="500px"
    @update:model-value="emit('close')"
  >
    <el-form :model="form" label-width="100px">
      <el-form-item v-if="!isEdit" label="标识键" required>
        <el-input v-model="form.key" placeholder="如: deepseek, openai" />
      </el-form-item>
      <el-form-item v-if="!isEdit" label="名称" required>
        <el-input v-model="form.name" placeholder="如: DeepSeek" />
      </el-form-item>
      <el-form-item v-if="!isEdit" label="类型" required>
        <el-select v-model="form.provider_type" style="width: 100%">
          <el-option label="DeepSeek" value="deepseek" />
          <el-option label="OpenAI Compatible" value="openai_compatible" />
          <el-option label="DashScope (阿里百炼)" value="dashscope" />
          <el-option label="Mock (测试)" value="mock" />
        </el-select>
      </el-form-item>
      <el-form-item label="Base URL">
        <el-input v-model="form.base_url" placeholder="https://api.deepseek.com" />
        <div class="form-hint">DeepSeek 默认: https://api.deepseek.com</div>
      </el-form-item>
      <el-form-item label="API Key">
        <el-input
          v-model="form.api_key"
          type="password"
          show-password
          :placeholder="isEdit && provider?.has_api_key ? '留空保持原值' : '请输入 API Key'"
        />
      </el-form-item>
      <el-form-item label="环境变量名">
        <el-input v-model="form.api_key_env" placeholder="可选，如 DEEPSEEK_API_KEY" />
        <div class="form-hint">也可通过环境变量提供 API Key</div>
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
import type { ModelProvider } from '@/api/systemConfig'

const props = defineProps<{
  visible: boolean
  provider: ModelProvider | null
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save', data: {
    key?: string
    name?: string
    provider_type?: string
    base_url: string
    api_key: string
    api_key_env: string
    is_active: boolean
  }): void
}>()

const isEdit = ref(false)

const defaultForm = {
  key: '',
  name: '',
  provider_type: 'deepseek',
  base_url: '',
  api_key: '',
  api_key_env: '',
  is_active: true,
}

const form = ref({ ...defaultForm })

watch(() => props.visible, (visible) => {
  if (visible) {
    if (props.provider) {
      isEdit.value = true
      form.value = {
        key: props.provider.key,
        name: props.provider.name,
        provider_type: props.provider.provider_type,
        base_url: props.provider.base_url || '',
        api_key: '',
        api_key_env: props.provider.api_key_env || '',
        is_active: props.provider.is_active,
      }
    } else {
      isEdit.value = false
      form.value = { ...defaultForm }
    }
  }
})

function handleSave() {
  if (!isEdit.value && (!form.value.key || !form.value.name || !form.value.provider_type)) {
    return
  }
  emit('save', form.value)
}
</script>

<style scoped>
.form-hint {
  margin-top: 4px;
  color: #909399;
  font-size: 12px;
}
</style>
