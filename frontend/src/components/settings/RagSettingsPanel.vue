<template>
  <el-card shadow="never">
    <el-form :model="localSettings" label-width="160px" v-loading="saving">
      <el-form-item label="检索模式">
        <el-select v-model="localSettings.retrieval_mode">
          <el-option label="PostgreSQL 全文检索" value="postgres_fulltext" />
          <el-option label="向量检索" value="vector" />
          <el-option label="混合检索" value="hybrid" />
        </el-select>
        <div class="form-tip">
          全文检索适合关键词匹配，向量检索适合语义相似，混合检索结合两者
        </div>
      </el-form-item>

      <el-form-item label="Embedding 模型">
        <el-select
          v-model="localSettings.embedding_config"
          placeholder="选择 Embedding 配置"
          clearable
          :disabled="!hasEmbeddingConfigs"
        >
          <el-option
            v-for="config in embeddingConfigs"
            :key="config.id"
            :label="config.name"
            :value="config.id"
          >
            <span>{{ config.name }}</span>
            <el-tag v-if="config.is_default" type="success" size="small" style="margin-left: 8px">
              默认
            </el-tag>
          </el-option>
        </el-select>
        <div v-if="!hasEmbeddingConfigs" class="form-tip warning">
          请先在「Embedding 配置」中添加模型
        </div>
      </el-form-item>

      <el-form-item label="默认返回数量">
        <el-input-number v-model="localSettings.top_k" :min="1" :max="100" />
        <span class="form-tip">检索时返回的最大文档数</span>
      </el-form-item>

      <el-form-item label="上下文最大 Token">
        <el-input-number v-model="localSettings.max_context_tokens" :min="500" :max="16000" :step="500" />
        <span class="form-tip">拼接到提示词的最大 Token 数</span>
      </el-form-item>

      <el-form-item label="启用向量检索">
        <el-switch
          v-model="localSettings.enable_vector_search"
          :disabled="!canEnableVectorSearch"
        />
        <div v-if="!canEnableVectorSearch" class="form-tip warning">
          请先选择 Embedding 配置
        </div>
      </el-form-item>

      <el-form-item label="启用重排序">
        <el-switch v-model="localSettings.enable_rerank" />
        <div class="form-tip">对检索结果进行重排序优化（需要配置 Rerank 模型）</div>
      </el-form-item>

      <el-form-item>
        <el-button type="primary" @click="handleSave">保存配置</el-button>
      </el-form-item>
    </el-form>
  </el-card>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import {
  getRagSettings,
  updateRagSettings,
  listEmbeddingConfigs,
  type RagSettings,
  type EmbeddingConfig,
} from '@/api/systemConfig'
import { normalizeList } from '@/utils/normalize'

const props = defineProps<{
  modelValue?: RagSettings
}>()

const emit = defineEmits<{
  'update:modelValue': [value: RagSettings]
  save: []
}>()

const saving = ref(false)
const embeddingConfigs = ref<EmbeddingConfig[]>([])

const defaultSettings: RagSettings = {
  retrieval_mode: 'postgres_fulltext',
  embedding_config: null,
  top_k: 10,
  max_context_tokens: 4000,
  enable_vector_search: false,
  enable_rerank: false,
}

const localSettings = ref<RagSettings>({ ...defaultSettings })

const hasEmbeddingConfigs = computed(() => embeddingConfigs.value.length > 0)

const canEnableVectorSearch = computed(() => {
  return localSettings.value.embedding_config !== null || hasEmbeddingConfigs.value
})

watch(() => props.modelValue, (val) => {
  if (val) {
    localSettings.value = { ...val }
  }
}, { deep: true, immediate: true })

async function loadEmbeddingConfigs() {
  try {
    const res = await listEmbeddingConfigs()
    embeddingConfigs.value = normalizeList<EmbeddingConfig>(res)
  } catch {
    console.error('加载 Embedding 配置失败')
  }
}

async function loadRagSettings() {
  try {
    const res = await getRagSettings()
    localSettings.value = res.data
    emit('update:modelValue', localSettings.value)
  } catch {
    console.error('加载 RAG 设置失败')
  }
}

async function handleSave() {
  saving.value = true
  try {
    const res = await updateRagSettings(localSettings.value)
    localSettings.value = res.data
    emit('update:modelValue', localSettings.value)
    emit('save')
    ElMessage.success('保存成功')
  } catch (error) {
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  loadEmbeddingConfigs()
  if (!props.modelValue) {
    loadRagSettings()
  }
})
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