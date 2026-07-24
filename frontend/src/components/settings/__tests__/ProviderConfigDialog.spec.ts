// frontend/src/components/settings/__tests__/ProviderConfigDialog.spec.ts
import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import ProviderConfigDialog from '../ProviderConfigDialog.vue'
import type { ModelProvider } from '@/api/systemConfig'

// 透明 stub：el-dialog / el-form / el-select 等必须透传 slot 内容与 fallthrough attrs
// （如 data-testid），否则字符串 stub 会忽略 slot 内容，断言无法命中。
const transparentStubs = {
  ElDialog: {
    name: 'ElDialog',
    props: ['modelValue', 'title', 'width', 'closeOnClickModal', 'closeOnPressEscape'],
    template: `<div class="el-dialog-stub"><div class="body"><slot /></div><div class="footer"><slot name="footer" /></div></div>`,
  },
  ElForm: { template: '<form class="el-form-stub"><slot /></form>' },
  ElFormItem: { template: '<div class="el-form-item-stub"><slot /></div>' },
  ElInput: {
    name: 'ElInput',
    props: ['modelValue', 'type', 'placeholder', 'showPassword'],
    emits: ['update:modelValue'],
    template: `<input class="el-input-stub" />`,
  },
  ElSelect: {
    name: 'ElSelect',
    props: ['modelValue', 'placeholder'],
    emits: ['update:modelValue'],
    template: `<div class="el-select-stub"><slot /></div>`,
  },
  ElOption: {
    name: 'ElOption',
    props: ['label', 'value'],
    template: '<option class="el-option-stub" :value="value">{{ label }}</option>',
  },
  ElButton: {
    name: 'ElButton',
    props: ['loading', 'type'],
    emits: ['click'],
    template: `<button class="el-button-stub" :disabled="loading" @click="$emit('click')"><slot /></button>`,
  },
  ElSwitch: {
    name: 'ElSwitch',
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<div class="el-switch-stub"></div>',
  },
}

const editProvider: ModelProvider = {
  id: 1,
  key: 'deepseek',
  name: 'DeepSeek',
  provider_type: 'deepseek',
  base_url: 'https://api.deepseek.com',
  api_key_env: '',
  is_active: true,
}

describe('ProviderConfigDialog edit mode', () => {
  it('shows provider_type dropdown in edit mode', () => {
    // 修复 v-if="!isEdit" 后，编辑模式下也显示
    // 组件通过 visible + provider 触发内部 isEdit；brief 中的 modelValue/isEdit
    // 与现有组件 API 不匹配，这里用 visible + provider 驱动编辑模式。
    const wrapper = mount(ProviderConfigDialog, {
      props: {
        visible: true,
        provider: editProvider,
      },
      global: {
        stubs: transparentStubs,
      },
    })
    const typeSelect = wrapper.find('[data-testid="provider-type-field"]')
    expect(typeSelect.exists()).toBe(true)
  })
})
