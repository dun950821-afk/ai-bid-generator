<template>
  <el-card shadow="never">
    <el-form :model="localSettings" label-width="160px" v-loading="saving">
      <el-form-item label="检索模式">
        <el-select v-model="localSettings.retrieval_mode">
          <el-option label="关键词检索" value="keyword" />
          <el-option label="语义检索" value="semantic" />
          <el-option label="混合检索" value="hybrid" />
        </el-select>
      </el-form-item>

      <el-form-item label="默认返回数量">
        <el-input-number v-model="localSettings.top_k" :min="1" :max="100" />
      </el-form-item>

      <el-form-item label="上下文最大 Token">
        <el-input-number v-model="localSettings.max_context_tokens" :min="500" :max="16000" :step="500" />
      </el-form-item>

      <el-form-item label="启用向量检索">
        <el-switch
          v-model="localSettings.enable_vector_search"
          :disabled="!hasEmbeddingModel"
        />
        <div v-if="!hasEmbeddingModel" class="form-tip warning">
          请先在「大模型设置」中配置 Embedding 模型
        </div>
      </el-form-item>

      <el-form-item label="启用重排序">
        <el-switch
          v-model="localSettings.enable_rerank"
          :disabled="!hasRerankModel"
        />
        <div v-if="!hasRerankModel" class="form-tip warning">
          请先配置 Rerank 模型
        </div>
      </el-form-item>

      <el-form-item label="默认 Embedding 模型">
        <el-select
          v-model="localSettings.embedding_model_config_id"
          placeholder="选择模型"
          clearable
        >
          <el-option
            v-for="m in embeddingModels"
            :key="m.id"
            :label="m.display_name || m.model_name"
            :value="m.id"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="默认 Rerank 模型">
        <el-select
          v-model="localSettings.rerank_model_config_id"
          placeholder="选择模型"
          clearable
        >
          <el-option
            v-for="m in rerankModels"
            :key="m.id"
            :label="m.display_name || m.model_name"
            :value="m.id"
          />
        </el-select>
      </el-form-item>

      <el-form-item>
        <el-button type="primary" @click="handleSave">保存配置</el-button>
      </el-form-item>
    </el-form>
  </el-card>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { SystemSettings, ModelConfig } from '@/api/systemConfig'

const props = defineProps<{
  modelValue: SystemSettings
  hasEmbeddingModel: boolean
  hasRerankModel: boolean
  modelConfigs: ModelConfig[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: SystemSettings]
  save: []
}>()

const saving = ref(false)
const localSettings = ref({ ...props.modelValue })

watch(() => props.modelValue, (val) => {
  localSettings.value = { ...val }
}, { deep: true })

const embeddingModels = computed(() =>
  props.modelConfigs.filter(m => m.model_type === 'embedding' && m.is_active)
)

const rerankModels = computed(() =>
  props.modelConfigs.filter(m => m.model_type === 'rerank' && m.is_active)
)

function handleSave() {
  emit('update:modelValue', localSettings.value)
  emit('save')
}
</script>

<style scoped>
.form-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}

.form-tip.warning {
  color: var(--el-color-warning);
}
</style>
