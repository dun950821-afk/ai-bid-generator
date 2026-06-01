<template>
  <div class="extract-toolbar">
    <!-- 无 published 版本时的警告 -->
    <el-alert
      v-if="promptVersions.length === 0 && !loadingVersions"
      type="warning"
      title="未找到已发布的条款抽取提示词版本"
      :closable="false"
      show-icon
      class="version-alert"
    >
      <template #default>
        请先发布条款抽取提示词版本。
        <router-link to="/admin/prompts" class="alert-link">
          前往提示词管理
        </router-link>
      </template>
    </el-alert>

    <div class="toolbar-row">
      <div class="toolbar-left">
        <!-- 模型选择 -->
        <el-select
          v-model="selectedModelId"
          placeholder="选择模型"
          style="width: 200px"
          :disabled="loading"
        >
          <el-option
            v-for="model in models"
            :key="model.id"
            :label="model.display_name"
            :value="model.id"
          >
            <span>{{ model.display_name }}</span>
            <el-tag v-if="model.is_default" size="small" type="success" style="margin-left: 8px">默认</el-tag>
          </el-option>
        </el-select>

        <!-- 提示词版本选择 -->
        <el-select
          v-model="selectedPromptVersionId"
          placeholder="选择提示词版本"
          style="width: 200px"
          :disabled="loading || promptVersions.length === 0"
        >
          <el-option
            v-for="pv in promptVersions"
            :key="pv.id"
            :label="`${pv.version}`"
            :value="pv.id"
          >
            <span>{{ pv.version }}</span>
            <span style="color: var(--el-text-color-secondary); margin-left: 8px; font-size: 12px">
              {{ pv.changelog }}
            </span>
          </el-option>
        </el-select>

        <!-- RAG 开关 -->
        <el-checkbox v-model="ragEnabled" :disabled="loading">启用 RAG</el-checkbox>
      </div>

      <div class="toolbar-right">
        <el-button
          type="primary"
          :loading="loading"
          :disabled="!canExtract"
          @click="handleExtract(false)"
        >
          开始抽取
        </el-button>
        <el-button
          :loading="loading"
          :disabled="!canExtract"
          @click="handleExtract(true)"
        >
          强制重新抽取
        </el-button>
      </div>
    </div>

    <!-- RAG 配置面板 -->
    <div v-if="ragEnabled" class="rag-config">
      <el-form inline size="small">
        <el-form-item label="知识库">
          <el-select
            v-model="ragConfig.knowledge_base_ids"
            multiple
            placeholder="选择知识库"
            style="width: 300px"
          >
            <el-option
              v-for="kb in knowledgeBases"
              :key="kb.id"
              :label="kb.name"
              :value="kb.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="Top K">
          <el-input-number v-model="ragConfig.top_k" :min="1" :max="20" />
        </el-form-item>
        <el-form-item label="最大 Tokens">
          <el-input-number v-model="ragConfig.max_context_tokens" :min="500" :max="8000" step="500" />
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { http } from '@/api/http'
import { promptVersionApi, type PromptVersionLite } from '@/api/prompt'

interface ModelConfig {
  id: number
  display_name: string
  model_name: string
  is_default: boolean
}

interface KnowledgeBase {
  id: number
  name: string
}

interface ExtractPayload {
  force: boolean
  modelConfigId: number | null
  promptVersionId: number | null
  ragOptions: {
    enabled: boolean
    knowledge_base_ids: number[]
    query: string
    top_k: number
    max_context_tokens: number
  }
}

defineProps<{
  loading: boolean
  parsedDocumentId: number | null
}>()

const emit = defineEmits<{
  extract: [payload: ExtractPayload]
}>()

// 模型选择
const selectedModelId = ref<number | null>(null)
const models = ref<ModelConfig[]>([])
const loadingModels = ref(false)

// 提示词版本选择
const selectedPromptVersionId = ref<number | null>(null)
const promptVersions = ref<PromptVersionLite[]>([])
const loadingVersions = ref(false)

// RAG 配置
const ragEnabled = ref(false)
const ragConfig = ref({
  knowledge_base_ids: [] as number[],
  query: '',
  top_k: 5,
  max_context_tokens: 2000,
})
const knowledgeBases = ref<KnowledgeBase[]>([])

// 计算属性：是否可以抽取
const canExtract = computed(() => {
  return selectedModelId.value !== null && selectedPromptVersionId.value !== null
})

// 加载模型列表
async function loadModels() {
  loadingModels.value = true
  try {
    const res = await http.get<{ results: ModelConfig[] }>('/api/generation/model-configs/', {
      params: { is_active: true, model_type: 'chat' }
    })
    models.value = res.data?.results || []
    // 优先选择默认模型
    if (models.value.length > 0) {
      const defaultModel = models.value.find(m => m.is_default)
      selectedModelId.value = defaultModel?.id || models.value[0].id
    }
  } catch (err) {
    console.error('加载模型列表失败:', err)
  } finally {
    loadingModels.value = false
  }
}

// 加载提示词版本列表
async function loadPromptVersions() {
  loadingVersions.value = true
  try {
    const res = await promptVersionApi.listByScenario({
      scenario: 'requirement_extraction',
      status: 'published'
    })
    promptVersions.value = res.data || []
    // 默认选中第一个 published 版本
    if (promptVersions.value.length > 0) {
      selectedPromptVersionId.value = promptVersions.value[0].id
    }
  } catch (err) {
    console.error('加载提示词版本失败:', err)
  } finally {
    loadingVersions.value = false
  }
}

// 加载知识库列表
async function loadKnowledgeBases() {
  try {
    const res = await http.get<{ results: KnowledgeBase[] }>('/api/knowledge/bases/', {
      params: { is_active: true }
    })
    knowledgeBases.value = res.data?.results || []
  } catch (err) {
    console.error('加载知识库列表失败:', err)
  }
}

// 触发抽取
function handleExtract(force: boolean) {
  if (!canExtract.value) return

  emit('extract', {
    force,
    modelConfigId: selectedModelId.value,
    promptVersionId: selectedPromptVersionId.value,
    ragOptions: {
      enabled: ragEnabled.value,
      knowledge_base_ids: ragConfig.value.knowledge_base_ids,
      query: ragConfig.value.query,
      top_k: ragConfig.value.top_k,
      max_context_tokens: ragConfig.value.max_context_tokens,
    },
  })
}

onMounted(() => {
  loadModels()
  loadPromptVersions()
  loadKnowledgeBases()
})
</script>

<style scoped>
.extract-toolbar {
  padding: 12px 16px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
}

.version-alert {
  margin-bottom: 12px;
}

.alert-link {
  color: var(--el-color-primary);
  text-decoration: underline;
}

.toolbar-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.toolbar-left {
  display: flex;
  gap: 12px;
  align-items: center;
}

.toolbar-right {
  display: flex;
  gap: 12px;
}

.rag-config {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--el-border-color-light);
}
</style>