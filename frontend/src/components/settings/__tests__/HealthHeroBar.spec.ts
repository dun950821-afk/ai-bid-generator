// frontend/src/components/settings/__tests__/HealthHeroBar.spec.ts
import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import HealthHeroBar from '../HealthHeroBar.vue'
import type { HealthStatusResponse } from '@/api/settings'

const mockStatus: HealthStatusResponse = {
  chat_model: {
    status: 'ok',
    label: 'deepseek-chat',
    sublabel: 'DeepSeek · 真实可用',
    impact_hint: '影响说明 1',
    score: 30,
    score_max: 30,
    provider_type: 'deepseek',
    is_default: true,
    is_mock: false,
    last_probe_at: null,
    last_probe_ok: null,
  },
  embedding_model: {
    status: 'error',
    label: '未配置',
    impact_hint: '影响说明 2',
    score: 0,
    score_max: 20,
  },
  rag_search: {
    status: 'warning',
    label: '混合检索',
    sublabel: '已启用但无可用 embedding',
    impact_hint: '影响说明 3',
    score: 10,
    score_max: 20,
  },
  file_storage: {
    status: 'ok',
    label: 'MinIO',
    sublabel: '163.7.6.60:9000',
    impact_hint: '影响说明 4',
    score: 20,
    score_max: 20,
  },
  security_audit: {
    status: 'ok',
    label: '已启用',
    audit_log_enabled: true,
    impact_hint: '影响说明 5',
    score: 10,
    score_max: 10,
  },
  mock_warning: null,
  total_score: 70,
  total_max: 100,
  pending_count: 2,
}

describe('HealthHeroBar', () => {
  it('renders 5 status badges', () => {
    const wrapper = mount(HealthHeroBar, {
      props: { status: mockStatus },
    })
    const badges = wrapper.findAll('[data-testid="status-badge"]')
    expect(badges).toHaveLength(5)
  })

  it('shows red mock banner when mock_warning.show is true', () => {
    const wrapper = mount(HealthHeroBar, {
      props: {
        status: {
          ...mockStatus,
          mock_warning: {
            show: true,
            level: 'chat',
            message: '当前默认 Chat 模型指向 Mock Provider',
            model_config_id: 1,
            provider_id: 2,
          },
        },
      },
    })
    expect(wrapper.find('[data-testid="mock-warning-banner"]').exists()).toBe(true)
  })

  it('hides mock banner when show is false', () => {
    const wrapper = mount(HealthHeroBar, {
      props: { status: mockStatus },
    })
    expect(wrapper.find('[data-testid="mock-warning-banner"]').exists()).toBe(false)
  })

  it('emits refresh event on button click', async () => {
    const wrapper = mount(HealthHeroBar, {
      props: { status: mockStatus },
    })
    await wrapper.find('[data-testid="refresh-btn"]').trigger('click')
    expect(wrapper.emitted('refresh')).toBeTruthy()
  })

  it('emits diagnose event on button click', async () => {
    const wrapper = mount(HealthHeroBar, {
      props: { status: mockStatus },
    })
    await wrapper.find('[data-testid="diagnose-btn"]').trigger('click')
    expect(wrapper.emitted('diagnose')).toBeTruthy()
  })

  it('emits wizard event on button click', async () => {
    const wrapper = mount(HealthHeroBar, {
      props: { status: mockStatus },
    })
    await wrapper.find('[data-testid="wizard-btn"]').trigger('click')
    expect(wrapper.emitted('wizard')).toBeTruthy()
  })

  it('emits navigate with tab name on badge click', async () => {
    const wrapper = mount(HealthHeroBar, {
      props: { status: mockStatus },
    })
    const badges = wrapper.findAll('[data-testid="status-badge"]')
    await badges[0].trigger('click')  // chat_model
    expect(wrapper.emitted('navigate')).toBeTruthy()
    expect(wrapper.emitted('navigate')![0]).toEqual(['llm'])
  })
})
