// frontend/src/components/settings/__tests__/HealthScorePanel.spec.ts
import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import HealthScorePanel from '../HealthScorePanel.vue'
import type { HealthStatusResponse } from '@/api/settings'

const mockStatus: HealthStatusResponse = {
  chat_model: { status: 'ok', label: 'deepseek-chat', impact_hint: '说明 1', score: 30, score_max: 30 },
  embedding_model: { status: 'error', label: '未配置', impact_hint: '说明 2', score: 0, score_max: 20 },
  rag_search: { status: 'warning', label: '混合检索', impact_hint: '说明 3', score: 10, score_max: 20 },
  file_storage: { status: 'ok', label: 'MinIO', impact_hint: '说明 4', score: 20, score_max: 20 },
  security_audit: { status: 'ok', label: '已启用', audit_log_enabled: true, impact_hint: '说明 5', score: 10, score_max: 10 },
  mock_warning: null,
  total_score: 70,
  total_max: 100,
  pending_count: 2,
}

describe('HealthScorePanel', () => {
  it('renders total score', () => {
    const wrapper = mount(HealthScorePanel, {
      props: { status: mockStatus },
    })
    expect(wrapper.text()).toContain('70')
    expect(wrapper.text()).toContain('100')
  })

  it('renders 5 score items', () => {
    const wrapper = mount(HealthScorePanel, {
      props: { status: mockStatus },
    })
    const items = wrapper.findAll('[data-testid="score-item"]')
    expect(items).toHaveLength(5)
  })

  it('renders impact hint for each item', () => {
    const wrapper = mount(HealthScorePanel, {
      props: { status: mockStatus },
    })
    expect(wrapper.text()).toContain('说明 1')
    expect(wrapper.text()).toContain('说明 2')
  })

  it('emits navigate with tab name on item click', async () => {
    const wrapper = mount(HealthScorePanel, {
      props: { status: mockStatus },
    })
    const items = wrapper.findAll('[data-testid="score-item"]')
    await items[0].trigger('click')
    expect(wrapper.emitted('navigate')).toBeTruthy()
    expect(wrapper.emitted('navigate')![0]).toEqual(['llm'])
  })
})
