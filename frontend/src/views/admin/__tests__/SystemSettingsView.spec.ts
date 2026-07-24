// frontend/src/views/admin/__tests__/SystemSettingsView.spec.ts
import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'

// Mock API
vi.mock('@/api/settings', () => ({
  getHealthStatus: vi.fn().mockResolvedValue({
    chat_model: { status: 'error', label: '未配置', impact_hint: '说明', score: 0, score_max: 30 },
    embedding_model: { status: 'error', label: '未配置', impact_hint: '说明', score: 0, score_max: 20 },
    rag_search: { status: 'warning', label: '已启用', impact_hint: '说明', score: 10, score_max: 20 },
    file_storage: { status: 'error', label: '未配置', impact_hint: '说明', score: 0, score_max: 20 },
    security_audit: { status: 'ok', label: '已启用', audit_log_enabled: true, impact_hint: '说明', score: 10, score_max: 10 },
    mock_warning: null,
    total_score: 20,
    total_max: 100,
    pending_count: 3,
  }),
  diagnoseAll: vi.fn(),
  testConnection: vi.fn(),
  submitWizard: vi.fn(),
}))

// Mock systemConfig API（StorageSettingsPanel / UploadCorsSettingsPanel / SecurityAuditSettingsPanel 依赖）
vi.mock('@/api/systemConfig', () => ({
  getSystemSettings: vi.fn().mockResolvedValue({ data: { upload_mode: 'backend_proxy', max_upload_size_mb: 100, enable_audit_log: true, mask_secrets: true, login_fail_lock_count: 5 } }),
  updateSystemSettings: vi.fn(),
  listStorageConfigs: vi.fn().mockResolvedValue({ data: [] }),
}))

// Mock 子组件避免复杂渲染
vi.mock('@/components/settings/HealthHeroBar.vue', () => ({
  default: { template: '<div data-testid="hero-bar"></div>' },
}))
vi.mock('@/components/settings/HealthScorePanel.vue', () => ({
  default: { template: '<div data-testid="score-panel"></div>' },
}))
vi.mock('@/components/settings/SetupWizardDialog.vue', () => ({
  default: { template: '<div data-testid="wizard-dialog"></div>' },
}))
vi.mock('@/components/settings/ModelSettingsPanel.vue', () => ({
  default: { template: '<div data-testid="model-panel"></div>' },
}))
vi.mock('@/components/settings/EmbeddingSettingsPanel.vue', () => ({
  default: { template: '<div data-testid="embedding-panel"></div>' },
}))
vi.mock('@/components/settings/RagSettingsPanel.vue', () => ({
  default: { template: '<div data-testid="rag-panel"></div>' },
}))
vi.mock('@/components/settings/StorageSettingsPanel.vue', () => ({
  default: { template: '<div data-testid="storage-panel"></div>' },
}))
vi.mock('@/components/settings/UploadCorsSettingsPanel.vue', () => ({
  default: { template: '<div data-testid="upload-cors-panel"></div>' },
}))
vi.mock('@/components/settings/SecurityAuditSettingsPanel.vue', () => ({
  default: { template: '<div data-testid="security-panel"></div>' },
}))

import SystemSettingsView from '../SystemSettingsView.vue'

describe('SystemSettingsView', () => {
  it('renders hero bar, score panel, and 4 tabs', async () => {
    const wrapper = mount(SystemSettingsView, {
      global: {
        stubs: ['el-tabs', 'el-tab-pane', 'router-view'],
        renderStubDefaultSlot: true,
      },
    })
    await flushPromises()

    expect(wrapper.find('[data-testid="hero-bar"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="score-panel"]').exists()).toBe(true)
    const tabs = wrapper.findAll('[data-testid="main-tab"]')
    expect(tabs).toHaveLength(4)
  })

  it('loads health status on mount', async () => {
    const { getHealthStatus } = await import('@/api/settings')
    mount(SystemSettingsView, {
      global: {
        stubs: ['el-tabs', 'el-tab-pane', 'router-view'],
        renderStubDefaultSlot: true,
      },
    })
    await flushPromises()
    expect(getHealthStatus).toHaveBeenCalled()
  })
})
