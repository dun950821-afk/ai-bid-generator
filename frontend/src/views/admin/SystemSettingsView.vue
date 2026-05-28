<template>
  <div class="system-settings-view">
    <!-- 面包屑导航 -->
    <el-breadcrumb separator="/">
      <el-breadcrumb-item :to="{ path: '/dashboard' }">系统管理</el-breadcrumb-item>
      <el-breadcrumb-item>系统设置</el-breadcrumb-item>
    </el-breadcrumb>

    <div class="page-header">
      <h1>系统设置</h1>
      <p class="page-desc">配置平台 AI 模型、知识库检索、文件存储和安全策略</p>
    </div>

    <!-- 配置状态概览 -->
    <el-card shadow="never" class="status-card">
      <template #header>当前配置状态</template>
      <div class="status-grid">
        <div class="status-item">
          <span class="status-label">Chat 模型</span>
          <el-tag :type="models.chat ? 'success' : 'warning'" size="small">
            {{ models.chat ? '已配置' : '未配置' }}
          </el-tag>
        </div>
        <div class="status-item">
          <span class="status-label">Embedding 模型</span>
          <el-tag :type="models.embedding ? 'success' : 'warning'" size="small">
            {{ models.embedding ? '已配置' : '未配置' }}
          </el-tag>
        </div>
        <div class="status-item">
          <span class="status-label">MinIO 存储</span>
          <el-tag type="success" size="small">连接正常</el-tag>
        </div>
        <div class="status-item">
          <span class="status-label">上传模式</span>
          <el-tag type="info" size="small">
            {{ settings.upload_mode === 'backend_proxy' ? '后端代理上传' : 'MinIO 直传' }}
          </el-tag>
        </div>
      </div>
    </el-card>

    <!-- Tab 页签 -->
    <el-tabs v-model="activeTab" class="settings-tabs">
      <!-- 大模型设置 -->
      <el-tab-pane label="大模型设置" name="models">
        <ModelSettingsPanel
          :providers="providers"
          :model-configs="modelConfigs"
          @refresh="loadData"
        />
      </el-tab-pane>

      <!-- 知识库 / RAG 设置 -->
      <el-tab-pane label="知识库 / RAG" name="rag">
        <RagSettingsPanel
          v-model="settings"
          :has-embedding-model="!!models.embedding"
          :has-rerank-model="!!models.rerank"
          :model-configs="modelConfigs"
          @save="saveSettings"
        />
      </el-tab-pane>

      <!-- 对象存储 MinIO -->
      <el-tab-pane label="对象存储" name="storage">
        <StorageSettingsPanel
          :configs="storageConfigs"
          @refresh="loadData"
        />
      </el-tab-pane>

      <!-- 上传策略与 CORS -->
      <el-tab-pane label="上传策略" name="upload">
        <UploadCorsSettingsPanel
          v-model="settings"
          :storage-configs="storageConfigs"
          @save="saveSettings"
        />
      </el-tab-pane>

      <!-- 安全与审计 -->
      <el-tab-pane label="安全与审计" name="security">
        <SecurityAuditSettingsPanel
          v-model="settings"
          @save="saveSettings"
        />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { ElMessage } from 'element-plus'
import {
  getSystemSettings,
  updateSystemSettings,
  listStorageConfigs,
  listModelProviders,
  listModelConfigs,
  type SystemSettings,
  type StorageConfig,
  type ModelProvider,
  type ModelConfig,
} from '@/api/systemConfig'
import { normalizeList } from '@/utils/normalize'
import ModelSettingsPanel from '@/components/settings/ModelSettingsPanel.vue'
import RagSettingsPanel from '@/components/settings/RagSettingsPanel.vue'
import StorageSettingsPanel from '@/components/settings/StorageSettingsPanel.vue'
import UploadCorsSettingsPanel from '@/components/settings/UploadCorsSettingsPanel.vue'
import SecurityAuditSettingsPanel from '@/components/settings/SecurityAuditSettingsPanel.vue'

const activeTab = ref('models')
const loading = ref(false)

// 数据
const settings = ref<SystemSettings>({
  retrieval_mode: 'hybrid',
  top_k: 10,
  max_context_tokens: 4000,
  enable_vector_search: true,
  enable_rerank: false,
  embedding_model_config_id: null,
  rerank_model_config_id: null,
  chat_model_config_id: null,
  upload_mode: 'backend_proxy',
  max_upload_size_mb: 100,
  enable_audit_log: true,
  enable_prompt_log: false,
  enable_rag_log: false,
  mask_secrets: true,
  login_fail_lock_count: 5,
})

const storageConfigs = ref<StorageConfig[]>([])
const providers = ref<ModelProvider[]>([])
const modelConfigs = ref<ModelConfig[]>([])

// 计算属性
const models = computed(() => ({
  chat: modelConfigs.value.find(m => m.model_type === 'chat' && m.is_default) || null,
  embedding: modelConfigs.value.find(m => m.model_type === 'embedding' && m.is_default) || null,
  rerank: modelConfigs.value.find(m => m.model_type === 'rerank' && m.is_default) || null,
}))

async function loadData() {
  loading.value = true
  try {
    const [settingsRes, storageRes, providersRes, configsRes] = await Promise.all([
      getSystemSettings(),
      listStorageConfigs(),
      listModelProviders(),
      listModelConfigs(),
    ])
    settings.value = settingsRes.data
    storageConfigs.value = normalizeList<StorageConfig>(storageRes)
    providers.value = normalizeList<ModelProvider>(providersRes)
    modelConfigs.value = normalizeList<ModelConfig>(configsRes)
  } catch (e) {
    ElMessage.error('加载配置失败')
  } finally {
    loading.value = false
  }
}

async function saveSettings() {
  try {
    const res = await updateSystemSettings(settings.value)
    settings.value = res.data
    ElMessage.success('保存成功')
  } catch (e) {
    ElMessage.error('保存失败')
  }
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.system-settings-view {
  padding: 20px;
  max-width: 1400px;
  margin: 0 auto;
}

.el-breadcrumb {
  margin-bottom: 16px;
}

.page-header {
  margin-bottom: 24px;
}

.page-header h1 {
  font-size: 24px;
  margin: 0 0 8px 0;
}

.page-desc {
  color: var(--el-text-color-secondary);
  margin: 0;
}

.status-card {
  margin-bottom: 24px;
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}

.status-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
}

.status-label {
  font-size: 14px;
}

.settings-tabs {
  margin-top: 0;
}
</style>
