// frontend/src/components/settings/__tests__/ModelCard.spec.ts
import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import ModelCard from '../ModelCard.vue'
import type { ModelConfig } from '@/api/systemConfig'

// 透明 stub：el-button 必须透传 disabled/data-testid 等 fallthrough attrs，
// 字符串 stub 会忽略这些属性，导致断言失败。
const transparentStubs = {
  ElButton: {
    name: 'ElButton',
    props: ['loading', 'type', 'size', 'disabled'],
    emits: ['click'],
    template: `<button class="el-button-stub" :disabled="disabled" @click="$emit('click')"><slot /></button>`,
  },
  ElIcon: { template: '<span class="el-icon-stub"><slot /></span>' },
  ElTag: {
    name: 'ElTag',
    props: ['type', 'size', 'effect'],
    template: '<span class="el-tag-stub"><slot /></span>',
  },
}

const baseMockModel: ModelConfig = {
  id: 1,
  provider: 1,
  provider_name: 'mock',
  model_name: 'mock-chat',
  model_type: 'chat',
  display_name: '',
  temperature: 0.7,
  max_tokens: 2048,
  top_p: 1,
  timeout_seconds: 60,
  retry_count: 2,
  enable_thinking: false,
  reasoning_effort: '',
  is_default: false,
  is_active: true,
}

describe('ModelCard mock restriction', () => {
  it('disables set-default button when provider is mock', () => {
    const wrapper = mount(ModelCard, {
      props: {
        model: { ...baseMockModel, id: 1, model_name: 'mock-chat' },
        providerType: 'mock',
      },
      global: {
        stubs: transparentStubs,
      },
    })
    const setDefaultBtn = wrapper.find('[data-testid="set-default-btn"]')
    expect(setDefaultBtn.attributes('disabled')).toBeDefined()
  })

  it('enables set-default button when provider is real', () => {
    const wrapper = mount(ModelCard, {
      props: {
        model: { ...baseMockModel, id: 2, model_name: 'deepseek-chat' },
        providerType: 'deepseek',
      },
      global: {
        stubs: transparentStubs,
      },
    })
    const setDefaultBtn = wrapper.find('[data-testid="set-default-btn"]')
    expect(setDefaultBtn.attributes('disabled')).toBeUndefined()
  })
})
