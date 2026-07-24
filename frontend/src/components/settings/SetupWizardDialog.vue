<!-- frontend/src/components/settings/SetupWizardDialog.vue -->
<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    title="配置向导"
    width="70%"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
  >
    <div class="wizard-body">
      <div class="wizard-steps">
        <div
          v-for="(step, idx) in steps"
          :key="step.key"
          data-testid="step-indicator"
          class="step"
          :class="{
            'is-active': currentStep === idx,
            'is-done': currentStep > idx,
            'is-skipped': skippedSteps.has(step.key),
          }"
        >
          <div class="step-index">{{ idx + 1 }}</div>
          <div class="step-title">{{ step.title }}</div>
        </div>
      </div>

      <div class="step-content">
        <!-- Step 1: Chat 模型 -->
        <div v-if="currentStep === 0">
          <el-alert
            type="info"
            :closable="false"
            show-icon
            title="为系统配置默认 Chat 大模型，用于大纲生成、条款抽取等核心 LLM 调用"
          />
          <el-form label-width="120px" class="step-form">
            <el-form-item label="Provider 类型" required>
              <el-select
                v-model="chatForm.provider_type"
                data-testid="provider-type-select"
                placeholder="选择 Provider"
              >
                <el-option label="DeepSeek" value="deepseek" />
                <el-option label="百炼" value="bailian" />
                <el-option label="OpenAI" value="openai" />
                <!-- 无 mock 选项 -->
              </el-select>
            </el-form-item>
            <el-form-item label="Base URL" required>
              <el-input v-model="chatForm.base_url" placeholder="https://api.deepseek.com" />
            </el-form-item>
            <el-form-item label="API Key" required>
              <el-input v-model="chatForm.api_key" type="password" show-password />
            </el-form-item>
            <el-form-item label="模型名" required>
              <el-input v-model="chatForm.model_name" placeholder="deepseek-chat" />
            </el-form-item>
            <el-form-item>
              <el-button :loading="testing" @click="handleTestChat">测试连接</el-button>
              <el-checkbox v-model="chatForm.set_default" disabled>设为默认 Chat 模型</el-checkbox>
            </el-form-item>
            <el-alert v-if="testResult" :type="testResult.ok ? 'success' : 'error'" :title="testResult.detail" :closable="false" show-icon />
          </el-form>
        </div>

        <!-- Step 2: Embedding 模型 -->
        <div v-else-if="currentStep === 1">
          <el-alert
            type="info"
            :closable="false"
            show-icon
            title="为系统配置默认 Embedding 模型，用于知识库向量化与 RAG 检索"
          />
          <el-form label-width="120px" class="step-form">
            <el-form-item label="Provider 类型" required>
              <el-select v-model="embeddingForm.provider_type" data-testid="embedding-provider-select">
                <el-option label="百炼" value="bailian" />
                <el-option label="OpenAI" value="openai" />
              </el-select>
            </el-form-item>
            <el-form-item label="Base URL" required>
              <el-input v-model="embeddingForm.base_url" placeholder="https://dashscope.aliyuncs.com" />
            </el-form-item>
            <el-form-item label="API Key" required>
              <el-input v-model="embeddingForm.api_key" type="password" show-password />
            </el-form-item>
            <el-form-item label="模型名" required>
              <el-input v-model="embeddingForm.model_name" placeholder="text-embedding-v3" />
            </el-form-item>
            <el-form-item>
              <el-button :loading="testing" @click="handleTestEmbedding">测试连接</el-button>
              <el-checkbox v-model="embeddingForm.set_default" disabled>设为默认 Embedding 模型</el-checkbox>
            </el-form-item>
            <el-alert v-if="testResult" :type="testResult.ok ? 'success' : 'error'" :title="testResult.detail" :closable="false" show-icon />
          </el-form>
        </div>

        <!-- Step 3: 向量检索 -->
        <div v-else-if="currentStep === 2">
          <el-alert
            type="info"
            :closable="false"
            show-icon
            title="启用 RAG 检索以在生成内容时引用知识库"
          />
          <el-form label-width="120px" class="step-form">
            <el-form-item label="检索模式">
              <el-radio-group v-model="ragForm.retrieval_mode">
                <el-radio value="postgres_fulltext">关闭</el-radio>
                <el-radio value="hybrid">混合检索</el-radio>
                <el-radio value="vector">仅向量</el-radio>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="Top K">
              <el-input v-model.number="ragForm.top_k" type="number" />
            </el-form-item>
          </el-form>
        </div>

        <!-- Step 4: 文件存储 -->
        <div v-else-if="currentStep === 3">
          <el-alert
            type="info"
            :closable="false"
            show-icon
            title="配置文件存储后端（当前仅支持 MinIO）"
          />
          <el-form label-width="120px" class="step-form">
            <el-form-item label="Endpoint" required>
              <el-input v-model="storageForm.endpoint" placeholder="minio:9000" />
            </el-form-item>
            <el-form-item label="Public Endpoint">
              <el-input v-model="storageForm.public_endpoint" placeholder="163.7.6.60:9000" />
            </el-form-item>
            <el-form-item label="Access Key" required>
              <el-input v-model="storageForm.access_key" />
            </el-form-item>
            <el-form-item label="Secret Key" required>
              <el-input v-model="storageForm.secret_key" type="password" show-password />
            </el-form-item>
            <el-form-item label="Bucket" required>
              <el-input v-model="storageForm.bucket" placeholder="bid-files" />
            </el-form-item>
            <el-form-item label="上传模式">
              <el-radio-group v-model="storageForm.upload_mode">
                <el-radio value="backend_proxy">后端代理上传</el-radio>
                <el-radio value="presigned_direct">浏览器直传 + CORS</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-form>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button data-testid="cancel-btn" @click="handleCancel">退出向导</el-button>
        <el-button v-if="currentStep > 0" @click="handlePrev">上一步</el-button>
        <el-button data-testid="skip-btn" @click="handleSkip">跳过此步</el-button>
        <el-button v-if="currentStep < 3" type="primary" data-testid="next-btn" @click="handleNext">下一步</el-button>
        <el-button v-else type="primary" :loading="submitting" data-testid="finish-btn" @click="handleSubmit">完成</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import {
  submitWizard,
  testConnection,
  type SetupWizardPayload,
  type TestConnectionResponse,
} from '@/api/settings'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  submitted: []
}>()

const steps = [
  { key: 'chat_model', title: 'Chat 模型' },
  { key: 'embedding_model', title: 'Embedding 模型' },
  { key: 'rag_search', title: '向量检索' },
  { key: 'file_storage', title: '文件存储' },
]

const currentStep = ref(0)
const testing = ref(false)
const submitting = ref(false)
const testResult = ref<TestConnectionResponse | null>(null)
const skippedSteps = reactive(new Set<string>())

const chatForm = reactive({
  provider_type: 'deepseek',
  base_url: 'https://api.deepseek.com',
  api_key: '',
  model_name: 'deepseek-chat',
  set_default: true,
})

const embeddingForm = reactive({
  provider_type: 'bailian',
  base_url: 'https://dashscope.aliyuncs.com',
  api_key: '',
  model_name: 'text-embedding-v3',
  set_default: true,
})

const ragForm = reactive({
  retrieval_mode: 'hybrid',
  top_k: 10,
})

const storageForm = reactive({
  endpoint: 'minio:9000',
  public_endpoint: '',
  access_key: '',
  secret_key: '',
  bucket: 'bid-files',
  upload_mode: 'backend_proxy' as 'backend_proxy' | 'presigned_direct',
})

async function handleTestChat() {
  testing.value = true
  testResult.value = null
  try {
    testResult.value = await testConnection({
      provider_type: chatForm.provider_type,
      base_url: chatForm.base_url,
      api_key: chatForm.api_key,
      model_name: chatForm.model_name,
      test_kind: 'chat',
    })
  } finally {
    testing.value = false
  }
}

async function handleTestEmbedding() {
  testing.value = true
  testResult.value = null
  try {
    testResult.value = await testConnection({
      provider_type: embeddingForm.provider_type,
      base_url: embeddingForm.base_url,
      api_key: embeddingForm.api_key,
      model_name: embeddingForm.model_name,
      test_kind: 'embedding',
    })
  } finally {
    testing.value = false
  }
}

function handlePrev() {
  if (currentStep.value > 0) {
    currentStep.value -= 1
    testResult.value = null
  }
}

function handleNext() {
  if (currentStep.value < 3) {
    skippedSteps.delete(steps[currentStep.value].key)
    currentStep.value += 1
    testResult.value = null
  }
}

function handleSkip() {
  if (currentStep.value < 3) {
    skippedSteps.add(steps[currentStep.value].key)
    currentStep.value += 1
    testResult.value = null
  } else {
    // 最后一步跳过 = 取消
    handleCancel()
  }
}

function handleCancel() {
  emit('update:modelValue', false)
}

async function handleSubmit() {
  submitting.value = true
  try {
    const payload: SetupWizardPayload = {
      steps: {
        chat_model: skippedSteps.has('chat_model') ? null : { ...chatForm },
        embedding_model: skippedSteps.has('embedding_model') ? null : { ...embeddingForm },
        rag_search: skippedSteps.has('rag_search') ? null : { ...ragForm },
        file_storage: skippedSteps.has('file_storage') ? null : { ...storageForm },
      },
    }
    await submitWizard(payload)
    ElMessage.success('配置已保存')
    emit('submitted')
    emit('update:modelValue', false)
  } catch (err: any) {
    ElMessage.error(err.response?.data?.detail || '保存失败')
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.wizard-body {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.wizard-steps {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
}

.step {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  padding: 8px;
  border-radius: 4px;
}

.step.is-active {
  background: var(--el-color-primary-light-9);
}

.step.is-done .step-index {
  background: var(--el-color-success);
  color: white;
}

.step.is-skipped .step-index {
  background: var(--el-text-color-placeholder);
}

.step-index {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--el-fill-color-light);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
}

.step.is-active .step-index {
  background: var(--el-color-primary);
  color: white;
}

.step-title {
  font-size: 14px;
}

.step-form {
  margin-top: 16px;
}
</style>
