<template>
  <div class="model-settings-panel">
    <!-- Header -->
    <div class="panel-header">
      <h2 class="panel-title">大模型 LLM 配置</h2>
      <el-button type="primary" @click="showAddProvider">
        <el-icon><Plus /></el-icon>
        新增供应商
      </el-button>
    </div>

    <!-- Provider Cards -->
    <div v-loading="loading" class="provider-list">
      <template v-if="providers.length > 0">
        <!-- 正式 Provider 优先展示 -->
        <template v-for="provider in realProviders" :key="provider.id">
          <ProviderCard
            :provider="provider"
            :models="getProviderModels(provider.id)"
            :testing-model-id="testingModelId"
            @config="showConfigProvider"
            @add-model="showAddModel"
            @test-model="handleTestModel"
            @set-default-model="handleSetDefaultModel"
            @edit-model="showEditModel"
            @delete-model="handleDeleteModel"
          />
        </template>
        <!-- Mock Provider 放最后 -->
        <template v-for="provider in mockProviders" :key="provider.id">
          <ProviderCard
            :provider="provider"
            :models="getProviderModels(provider.id)"
            :testing-model-id="testingModelId"
            @config="showConfigProvider"
            @add-model="showAddModel"
            @test-model="handleTestModel"
            @set-default-model="handleSetDefaultModel"
            @edit-model="showEditModel"
            @delete-model="handleDeleteModel"
          />
        </template>
      </template>
      <el-empty v-else description="暂无模型供应商配置" />
    </div>

    <!-- Provider Config Dialog -->
    <ProviderConfigDialog
      :visible="providerDialogVisible"
      :provider="editingProvider"
      :loading="saving"
      @close="providerDialogVisible = false"
      @save="handleSaveProvider"
    />

    <!-- Model Config Dialog -->
    <ModelConfigDialog
      :visible="modelDialogVisible"
      :provider="currentProvider"
      :model="editingModel"
      :loading="saving"
      @close="modelDialogVisible = false"
      @save="handleSaveModel"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import ProviderCard from './ProviderCard.vue'
import ProviderConfigDialog from './ProviderConfigDialog.vue'
import ModelConfigDialog from './ModelConfigDialog.vue'
import {
  listModelProviders,
  createModelProvider,
  updateModelProvider,
  listModelConfigs,
  createModelConfig,
  updateModelConfig,
  deleteModelConfig,
  setDefaultModelConfig,
  testModelConnection,
  type ModelProvider,
  type ModelConfig,
} from '@/api/systemConfig'
import { normalizeList } from '@/utils/normalize'

const loading = ref(false)
const saving = ref(false)
const testingModelId = ref<number | null>(null)
const providers = ref<ModelProvider[]>([])
const modelConfigs = ref<ModelConfig[]>([])

const providerDialogVisible = ref(false)
const modelDialogVisible = ref(false)
const editingProvider = ref<ModelProvider | null>(null)
const editingModel = ref<ModelConfig | null>(null)
const currentProvider = ref<ModelProvider | null>(null)

// 正式 Provider（非 mock）
const realProviders = computed(() => {
  return providers.value.filter(p => p.provider_type !== 'mock')
})

// Mock Provider
const mockProviders = computed(() => {
  return providers.value.filter(p => p.provider_type === 'mock')
})

// 获取指定供应商的模型列表
function getProviderModels(providerId: number): ModelConfig[] {
  return modelConfigs.value.filter(m => m.provider === providerId)
}

async function loadData() {
  loading.value = true
  try {
    const [providersRes, modelsRes] = await Promise.all([
      listModelProviders(),
      listModelConfigs(),
    ])
    providers.value = normalizeList<ModelProvider>(providersRes)
    modelConfigs.value = normalizeList<ModelConfig>(modelsRes)
  } catch {
    ElMessage.error('加载数据失败')
  } finally {
    loading.value = false
  }
}

// Provider 操作
function showAddProvider() {
  editingProvider.value = null
  providerDialogVisible.value = true
}

function showConfigProvider(provider: ModelProvider) {
  editingProvider.value = provider
  providerDialogVisible.value = true
}

async function handleSaveProvider(data: {
  key?: string
  name?: string
  provider_type?: string
  base_url: string
  api_key: string
  api_key_env: string
  is_active: boolean
}) {
  saving.value = true
  try {
    if (editingProvider.value) {
      await updateModelProvider(editingProvider.value.id, data)
      ElMessage.success('供应商配置已更新')
    } else {
      await createModelProvider(data as any)
      ElMessage.success('供应商已创建')
    }
    providerDialogVisible.value = false
    loadData()
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

// Model 操作
function showAddModel(provider: ModelProvider) {
  currentProvider.value = provider
  editingModel.value = null
  modelDialogVisible.value = true
}

function showEditModel(model: ModelConfig) {
  const provider = providers.value.find(p => p.id === model.provider)
  if (provider) {
    currentProvider.value = provider
    editingModel.value = model
    modelDialogVisible.value = true
  }
}

async function handleSaveModel(data: {
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
}) {
  saving.value = true
  try {
    if (editingModel.value) {
      await updateModelConfig(editingModel.value.id, data)
      ElMessage.success('模型配置已更新')
    } else {
      await createModelConfig(data)
      ElMessage.success('模型已添加')
    }
    modelDialogVisible.value = false
    loadData()
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function handleTestModel(model: ModelConfig) {
  testingModelId.value = model.id
  try {
    const res = await testModelConnection(model.id)
    const result = res.data
    if (result.success) {
      ElMessage.success(`连接成功！延迟 ${result.latency_ms}ms，Tokens: ${result.prompt_tokens}/${result.completion_tokens}`)
    } else {
      ElMessage.error(result.message || '连接失败')
    }
  } catch (err: any) {
    const message = err.response?.data?.message || '连接测试失败'
    ElMessage.error(message)
  } finally {
    testingModelId.value = null
  }
}

async function handleSetDefaultModel(model: ModelConfig) {
  try {
    await setDefaultModelConfig(model.id)
    ElMessage.success('已设为默认模型')
    loadData()
  } catch {
    ElMessage.error('设置失败')
  }
}

async function handleDeleteModel(model: ModelConfig) {
  try {
    await ElMessageBox.confirm(
      `确定删除模型「${model.display_name || model.model_name}」？`,
      '删除确认',
      { type: 'warning' }
    )
    await deleteModelConfig(model.id)
    ElMessage.success('删除成功')
    loadData()
  } catch {
    // cancelled
  }
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.model-settings-panel {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
  background: #f5f7fb;
  min-height: 100vh;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.panel-title {
  font-size: 20px;
  font-weight: 600;
  color: #111827;
  margin: 0;
}

.provider-list {
  min-height: 200px;
}
</style>