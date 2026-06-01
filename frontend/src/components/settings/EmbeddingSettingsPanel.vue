<template>
  <el-card shadow="never">
    <!-- Embedding 配置列表 -->
    <div class="section-header">
      <span class="section-title">Embedding 模型配置</span>
      <el-button type="primary" size="small" @click="showCreateDialog">
        新增配置
      </el-button>
    </div>

    <el-table :data="configs" border v-loading="loading" style="margin-bottom: 20px">
      <el-table-column prop="name" label="名称" width="150" />
      <el-table-column prop="provider" label="供应商" width="100">
        <template #default="{ row }">
          <el-tag size="small">{{ row.provider === 'bailian' ? '阿里百炼' : 'OpenAI' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="model_name" label="模型" width="150" />
      <el-table-column prop="dimension" label="维度" width="80" />
      <el-table-column prop="batch_size" label="批大小" width="80" />
      <el-table-column label="API Key" width="120">
        <template #default="{ row }">
          <el-tag v-if="row.has_api_key" type="success" size="small">
            {{ row.api_key_masked }}
          </el-tag>
          <el-tag v-else type="warning" size="small">未配置</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="默认" width="70">
        <template #default="{ row }">
          <el-tag v-if="row.is_default" type="success" size="small">是</el-tag>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="70">
        <template #default="{ row }">
          <el-tag :type="row.is_active ? 'success' : 'info'" size="small">
            {{ row.is_active ? '启用' : '禁用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200">
        <template #default="{ row }">
          <el-button-group>
            <el-button size="small" @click="showEditDialog(row)">编辑</el-button>
            <el-button size="small" @click="handleTest(row)">测试</el-button>
            <el-button
              size="small"
              :disabled="row.is_default"
              @click="handleSetDefault(row)"
            >
              设为默认
            </el-button>
            <el-button
              size="small"
              type="danger"
              :disabled="row.is_default"
              @click="handleDelete(row)"
            >
              删除
            </el-button>
          </el-button-group>
        </template>
      </el-table-column>
    </el-table>

    <!-- 创建/编辑对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEditing ? '编辑 Embedding 配置' : '新增 Embedding 配置'"
      width="600px"
    >
      <el-form :model="formData" label-width="140px">
        <el-form-item label="配置名称" required>
          <el-input v-model="formData.name" placeholder="如：百炼-生产环境" />
        </el-form-item>

        <el-form-item label="供应商" required>
          <el-select v-model="formData.provider" @change="handleProviderChange">
            <el-option label="阿里百炼" value="bailian" />
            <el-option label="OpenAI" value="openai" />
          </el-select>
        </el-form-item>

        <el-form-item label="API 模式">
          <el-select v-model="formData.api_mode">
            <el-option label="OpenAI 兼容接口" value="openai_compatible" />
            <el-option label="DashScope 原生接口" value="dashscope_native" />
          </el-select>
        </el-form-item>

        <el-form-item label="模型名称" required>
          <el-input v-model="formData.model_name" placeholder="text-embedding-v4" />
        </el-form-item>

        <el-form-item label="向量维度">
          <el-input-number v-model="formData.dimension" :min="256" :max="4096" :step="256" />
        </el-form-item>

        <el-form-item label="Base URL">
          <el-input v-model="formData.base_url" placeholder="自动填充，可修改" />
        </el-form-item>

        <el-form-item label="API Key" :required="!isEditing">
          <el-input
            v-model="formData.api_key"
            type="password"
            show-password
            :placeholder="isEditing ? '留空保持原值' : '请输入 API Key'"
          />
        </el-form-item>

        <el-form-item label="环境变量名">
          <el-input
            v-model="formData.api_key_env"
            placeholder="可选，如 BAILIAN_API_KEY"
          />
        </el-form-item>

        <el-form-item label="批大小">
          <el-input-number v-model="formData.batch_size" :min="1" :max="50" />
          <span class="form-tip">单次请求最大文本数</span>
        </el-form-item>

        <el-form-item label="单文本最大 Token">
          <el-input-number v-model="formData.max_tokens_per_text" :min="512" :max="32768" />
        </el-form-item>

        <el-form-item label="超时时间（秒）">
          <el-input-number v-model="formData.timeout_seconds" :min="10" :max="300" />
        </el-form-item>

        <el-form-item label="设为默认">
          <el-switch v-model="formData.is_default" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSave" :loading="saving">保存</el-button>
      </template>
    </el-dialog>

    <!-- 测试结果对话框 -->
    <el-dialog v-model="testDialogVisible" title="Embedding 测试结果" width="400px">
      <el-result
        v-if="testResult"
        :icon="testResult.success ? 'success' : 'error'"
        :title="testResult.success ? '测试成功' : '测试失败'"
        :sub-title="testResult.message"
      >
        <template #extra v-if="testResult.success">
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="向量维度">{{ testResult.dimension }}</el-descriptions-item>
            <el-descriptions-item label="向量数量">{{ testResult.vector_count }}</el-descriptions-item>
            <el-descriptions-item label="Token 数">{{ testResult.token_count }}</el-descriptions-item>
            <el-descriptions-item label="耗时">{{ testResult.latency_ms }}ms</el-descriptions-item>
          </el-descriptions>
        </template>
      </el-result>
      <template #footer>
        <el-button type="primary" @click="testDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  listEmbeddingConfigs,
  createEmbeddingConfig,
  updateEmbeddingConfig,
  deleteEmbeddingConfig,
  setDefaultEmbeddingConfig,
  testEmbeddingConfig,
  type EmbeddingConfig,
  type CreateEmbeddingConfigParams,
  type UpdateEmbeddingConfigParams,
  type EmbeddingTestResult,
} from '@/api/systemConfig'
import { normalizeList } from '@/utils/normalize'

const emit = defineEmits<{
  refresh: []
}>()

const loading = ref(false)
const saving = ref(false)
const configs = ref<EmbeddingConfig[]>([])
const dialogVisible = ref(false)
const testDialogVisible = ref(false)
const isEditing = ref(false)
const editingId = ref<number | null>(null)
const testResult = ref<EmbeddingTestResult | null>(null)

const defaultFormData = {
  name: '',
  provider: 'bailian',
  api_mode: 'openai_compatible',
  model_name: 'text-embedding-v4',
  dimension: 1024,
  base_url: '',
  api_key: '',
  api_key_env: '',
  batch_size: 10,
  max_tokens_per_text: 8192,
  timeout_seconds: 60,
  is_default: false,
}

const formData = ref<typeof defaultFormData>({ ...defaultFormData })

async function loadData() {
  loading.value = true
  try {
    const res = await listEmbeddingConfigs()
    configs.value = normalizeList<EmbeddingConfig>(res)
  } catch {
    ElMessage.error('加载 Embedding 配置失败')
  } finally {
    loading.value = false
  }
}

function handleProviderChange() {
  if (formData.value.provider === 'bailian') {
    formData.value.base_url = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
    formData.value.model_name = 'text-embedding-v4'
  } else if (formData.value.provider === 'openai') {
    formData.value.base_url = 'https://api.openai.com/v1'
    formData.value.model_name = 'text-embedding-3-small'
  }
}

function showCreateDialog() {
  isEditing.value = false
  editingId.value = null
  formData.value = { ...defaultFormData }
  handleProviderChange()
  dialogVisible.value = true
}

function showEditDialog(config: EmbeddingConfig) {
  isEditing.value = true
  editingId.value = config.id
  formData.value = {
    name: config.name,
    provider: config.provider,
    api_mode: config.api_mode,
    model_name: config.model_name,
    dimension: config.dimension,
    base_url: config.base_url,
    api_key: '',
    api_key_env: config.api_key_env || '',
    batch_size: config.batch_size,
    max_tokens_per_text: config.max_tokens_per_text,
    timeout_seconds: config.timeout_seconds,
    is_default: config.is_default,
  }
  dialogVisible.value = true
}

async function handleSave() {
  if (!formData.value.name) {
    ElMessage.warning('请输入配置名称')
    return
  }
  if (!isEditing.value && !formData.value.api_key) {
    ElMessage.warning('请输入 API Key')
    return
  }

  saving.value = true
  try {
    if (isEditing.value && editingId.value) {
      const params: UpdateEmbeddingConfigParams = {
        name: formData.value.name,
        provider: formData.value.provider as 'bailian' | 'openai',
        api_mode: formData.value.api_mode as 'openai_compatible' | 'dashscope_native',
        model_name: formData.value.model_name,
        dimension: formData.value.dimension,
        base_url: formData.value.base_url,
        batch_size: formData.value.batch_size,
        max_tokens_per_text: formData.value.max_tokens_per_text,
        timeout_seconds: formData.value.timeout_seconds,
        is_default: formData.value.is_default,
      }
      if (formData.value.api_key) {
        params.api_key = formData.value.api_key
      }
      if (formData.value.api_key_env) {
        params.api_key_env = formData.value.api_key_env
      }
      await updateEmbeddingConfig(editingId.value, params)
      ElMessage.success('更新成功')
    } else {
      const params: CreateEmbeddingConfigParams = {
        name: formData.value.name,
        provider: formData.value.provider as 'bailian' | 'openai',
        api_mode: formData.value.api_mode as 'openai_compatible' | 'dashscope_native',
        model_name: formData.value.model_name,
        dimension: formData.value.dimension,
        base_url: formData.value.base_url,
        api_key: formData.value.api_key,
        api_key_env: formData.value.api_key_env,
        batch_size: formData.value.batch_size,
        max_tokens_per_text: formData.value.max_tokens_per_text,
        timeout_seconds: formData.value.timeout_seconds,
        is_default: formData.value.is_default,
      }
      await createEmbeddingConfig(params)
      ElMessage.success('创建成功')
    }
    dialogVisible.value = false
    loadData()
    emit('refresh')
  } catch {
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

async function handleTest(config: EmbeddingConfig) {
  if (!config.has_api_key) {
    ElMessage.warning('请先配置 API Key')
    return
  }

  try {
    const res = await testEmbeddingConfig(config.id, ['测试文本'])
    testResult.value = res.data
    testDialogVisible.value = true
  } catch {
    ElMessage.error('测试失败')
  }
}

async function handleSetDefault(config: EmbeddingConfig) {
  try {
    await setDefaultEmbeddingConfig(config.id)
    ElMessage.success('已设为默认')
    loadData()
    emit('refresh')
  } catch {
    ElMessage.error('设置失败')
  }
}

async function handleDelete(config: EmbeddingConfig) {
  try {
    await ElMessageBox.confirm('确定删除该 Embedding 配置？', '删除确认', {
      type: 'warning',
    })
    await deleteEmbeddingConfig(config.id)
    ElMessage.success('删除成功')
    loadData()
    emit('refresh')
  } catch {
    if (config.is_default) {
      ElMessage.warning('默认配置不能删除')
    }
  }
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.section-title {
  font-size: 16px;
  font-weight: 500;
}

.form-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-left: 8px;
}
</style>