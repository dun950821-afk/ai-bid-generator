<!-- frontend/src/views/admin/SystemSettingsView.vue -->
<template>
  <div class="system-settings-view">
    <HealthHeroBar
      v-if="healthStatus"
      :status="healthStatus"
      :loading="loading"
      :diagnose-loading="diagnoseLoading"
      @refresh="loadHealth"
      @diagnose="handleDiagnose"
      @wizard="wizardVisible = true"
      @navigate="handleNavigate"
    />

    <HealthScorePanel
      v-if="healthStatus"
      :status="healthStatus"
      @navigate="handleNavigate"
    />

    <el-tabs v-model="activeTab" class="settings-tabs">
      <el-tab-pane label="大模型" name="llm" data-testid="main-tab">
        <ModelSettingsPanel />
      </el-tab-pane>
      <el-tab-pane label="知识库" name="knowledge" data-testid="main-tab">
        <div class="knowledge-tab">
          <EmbeddingSettingsPanel />
          <RagSettingsPanel />
        </div>
      </el-tab-pane>
      <el-tab-pane label="文件存储" name="storage" data-testid="main-tab">
        <div class="storage-tab">
          <StorageSettingsPanel
            :configs="storageConfigs"
            @refresh="loadData"
          />
          <UploadCorsSettingsPanel
            v-model="settings"
            :storage-configs="storageConfigs"
            @save="saveSettings"
          />
        </div>
      </el-tab-pane>
      <el-tab-pane label="安全审计" name="security" data-testid="main-tab">
        <SecurityAuditSettingsPanel
          v-model="settings"
          @save="saveSettings"
        />
      </el-tab-pane>
    </el-tabs>

    <SetupWizardDialog
      v-model="wizardVisible"
      @submitted="loadHealth"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import HealthHeroBar from '@/components/settings/HealthHeroBar.vue'
import HealthScorePanel from '@/components/settings/HealthScorePanel.vue'
import SetupWizardDialog from '@/components/settings/SetupWizardDialog.vue'
import ModelSettingsPanel from '@/components/settings/ModelSettingsPanel.vue'
import EmbeddingSettingsPanel from '@/components/settings/EmbeddingSettingsPanel.vue'
import RagSettingsPanel from '@/components/settings/RagSettingsPanel.vue'
import StorageSettingsPanel from '@/components/settings/StorageSettingsPanel.vue'
import UploadCorsSettingsPanel from '@/components/settings/UploadCorsSettingsPanel.vue'
import SecurityAuditSettingsPanel from '@/components/settings/SecurityAuditSettingsPanel.vue'
import {
  getHealthStatus,
  diagnoseAll,
  type HealthStatusResponse,
} from '@/api/settings'
import {
  getSystemSettings,
  updateSystemSettings,
  listStorageConfigs,
  type SystemSettings,
  type StorageConfig,
} from '@/api/systemConfig'

const healthStatus = ref<HealthStatusResponse | null>(null)
const loading = ref(false)
const diagnoseLoading = ref(false)
const activeTab = ref('llm')
const wizardVisible = ref(false)

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

async function loadHealth() {
  loading.value = true
  try {
    healthStatus.value = await getHealthStatus()
  } catch (err: any) {
    ElMessage.error('加载健康状态失败')
  } finally {
    loading.value = false
  }
}

async function loadData() {
  try {
    const [settingsRes, storageRes] = await Promise.all([
      getSystemSettings(),
      listStorageConfigs(),
    ])
    settings.value = settingsRes.data
    storageConfigs.value = storageRes.data
  } catch (err: any) {
    ElMessage.error('加载配置失败')
  }
}

async function saveSettings() {
  try {
    const res = await updateSystemSettings(settings.value)
    settings.value = res.data
    ElMessage.success('保存成功')
  } catch (err: any) {
    ElMessage.error('保存失败')
  }
}

async function handleDiagnose() {
  diagnoseLoading.value = true
  try {
    healthStatus.value = await diagnoseAll()
    ElMessage.success('诊断完成')
  } catch (err: any) {
    ElMessage.error('诊断失败')
  } finally {
    diagnoseLoading.value = false
  }
}

function handleNavigate(tab: string) {
  activeTab.value = tab
}

onMounted(() => {
  loadHealth()
  loadData()
})
</script>

<style scoped>
.system-settings-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  background: var(--app-bg, #f6f8fb);
  min-height: calc(100vh - 60px);
}

.settings-tabs {
  background: var(--app-card, #fff);
  border: 1px solid var(--app-border, #e5e7eb);
  border-radius: var(--app-radius, 16px);
  padding: 4px 18px 18px;
}

.settings-tabs :deep(.el-tabs__header) {
  margin-bottom: 16px;
}

.settings-tabs :deep(.el-tabs__item) {
  font-size: 14px;
}

.knowledge-tab,
.storage-tab {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
</style>
