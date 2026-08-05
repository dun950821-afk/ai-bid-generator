<template>
  <div class="extract-toolbar">
    <!-- 无 published 版本时的警告（仅在确认加载完成且无数据时显示） -->
    <el-alert
      v-if="showEmptyWarning"
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
        <el-button size="small" link type="primary" @click="loadPromptVersions" class="retry-btn">
          重新加载
        </el-button>
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
            :label="`${pv.version}（${scenarioLabel(pv.template_scenario || '')}）`"
            :value="pv.id"
          >
            <span>{{ pv.version }}（{{ scenarioLabel(pv.template_scenario || '') }}）</span>
            <span style="color: var(--el-text-color-secondary); margin-left: 8px; font-size: 12px">
              {{ pv.changelog }}
            </span>
          </el-option>
        </el-select>
      </div>

      <div class="toolbar-scenes">
        <el-checkbox-group v-model="selectedTypes" size="small">
          <el-checkbox
            v-for="s in EXTRACTION_SCENARIOS"
            :key="s.key"
            :value="s.key"
          >
            {{ s.label }}
          </el-checkbox>
        </el-checkbox-group>
      </div>

      <div class="toolbar-right">
        <el-button
          type="primary"
          :loading="loading"
          :disabled="!canExtract || selectedTypes.length === 0"
          @click="handleExtract(false)"
        >
          提取所选场景
        </el-button>
        <el-button
          :loading="loading"
          :disabled="!canExtract || selectedTypes.length === 0"
          @click="handleExtract(true)"
        >
          强制重新抽取
        </el-button>
      </div>
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

interface ExtractPayload {
  force: boolean
  extractionTypes: string[]
  modelConfigId: number | null
  promptVersionId: number | null
}

// 实际抽取的 6 个场景（后端按场景自动查找 published 版本，旧版 requirement_extraction 场景已废弃）
const EXTRACTION_SCENARIOS = [
  { key: 'scoring', value: 'requirement_extraction_scoring', label: '评分项' },
  { key: 'mandatory', value: 'requirement_extraction_mandatory', label: '强制条款' },
  { key: 'qualification', value: 'requirement_extraction_qualification', label: '资格要求' },
  { key: 'commercial', value: 'requirement_extraction_commercial', label: '商务条款' },
  { key: 'technical', value: 'requirement_extraction_technical', label: '技术要求' },
  { key: 'submission', value: 'requirement_extraction_submission', label: '投标递交' },
]

// 勾选场景（默认全选）
const selectedTypes = ref<string[]>(EXTRACTION_SCENARIOS.map((s) => s.key))

const scenarioLabel = (scenario: string): string =>
  EXTRACTION_SCENARIOS.find((s) => s.value === scenario)?.label || scenario

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
const hasLoadAttempted = ref(false)

// 计算属性：是否可以抽取
const canExtract = computed(() => {
  return selectedModelId.value !== null && selectedPromptVersionId.value !== null
})

// 计算属性：是否显示空警告（防止加载中或闪烁时显示）
const showEmptyWarning = computed(() => {
  return promptVersions.value.length === 0 && !loadingVersions.value && hasLoadAttempted.value
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

// 加载提示词版本列表（查询实际抽取的 6 个场景）
async function loadPromptVersions() {
  loadingVersions.value = true
  try {
    const res = await promptVersionApi.listByScenario({
      scenario: EXTRACTION_SCENARIOS.map((s) => s.value),
      status: 'published'
    })
    promptVersions.value = res.data || []
    // 默认选中第一个 published 版本
    if (promptVersions.value.length > 0) {
      selectedPromptVersionId.value = promptVersions.value[0].id
    }
  } catch (err) {
    console.error('加载提示词版本失败:', err)
    // 加载失败时不清空已有数据，避免闪烁
  } finally {
    loadingVersions.value = false
    hasLoadAttempted.value = true
  }
}

// 触发抽取
function handleExtract(force: boolean) {
  if (!canExtract.value || selectedTypes.value.length === 0) return

  emit('extract', {
    force,
    extractionTypes: [...selectedTypes.value],
    modelConfigId: selectedModelId.value,
    promptVersionId: selectedPromptVersionId.value,
  })
}

onMounted(() => {
  loadModels()
  loadPromptVersions()
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

.retry-btn {
  margin-left: 8px;
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

.toolbar-scenes {
  display: flex;
  align-items: center;
  gap: 4px;
}

.toolbar-right {
  display: flex;
  gap: 12px;
}
</style>
