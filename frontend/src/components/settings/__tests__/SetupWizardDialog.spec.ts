// frontend/src/components/settings/__tests__/SetupWizardDialog.spec.ts
import { mount } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'
import SetupWizardDialog from '../SetupWizardDialog.vue'

// Mock API
vi.mock('@/api/settings', () => ({
  submitWizard: vi.fn(),
  testConnection: vi.fn(),
}))

// 透明 stub：让 el-dialog/el-form/el-select/el-button 等透传 slot/content，
// 否则简报中的字符串 stub 不渲染 slot 内容，断言无法命中。
const transparentStubs = {
  ElDialog: {
    name: 'ElDialog',
    props: ['modelValue', 'title', 'width', 'closeOnClickModal', 'closeOnPressEscape'],
    template: `<div class="el-dialog-stub"><div class="body"><slot /></div><div class="footer"><slot name="footer" /></div></div>`,
  },
  ElSteps: { template: '<div class="el-steps-stub"><slot /></div>' },
  ElStep: { template: '<div class="el-step-stub"><slot /></div>' },
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
  ElCheckbox: {
    name: 'ElCheckbox',
    props: ['modelValue', 'disabled'],
    emits: ['update:modelValue'],
    template: '<label class="el-checkbox-stub"><slot /></label>',
  },
  ElRadioGroup: {
    name: 'ElRadioGroup',
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<div class="el-radio-group-stub"><slot /></div>',
  },
  ElRadio: {
    name: 'ElRadio',
    props: ['value'],
    template: '<label class="el-radio-stub"><slot /></label>',
  },
  ElAlert: { template: '<div class="el-alert-stub"><slot /></div>' },
}

describe('SetupWizardDialog', () => {
  it('renders 4 step indicators', () => {
    const wrapper = mount(SetupWizardDialog, {
      props: { modelValue: true },
      global: { stubs: transparentStubs },
    })
    const steps = wrapper.findAll('[data-testid="step-indicator"]')
    expect(steps).toHaveLength(4)
  })

  it('step 1 form shows provider_type dropdown without mock option', async () => {
    const wrapper = mount(SetupWizardDialog, {
      props: { modelValue: true },
      global: { stubs: transparentStubs },
    })
    // 等待组件挂载
    await wrapper.vm.$nextTick()
    const select = wrapper.find('[data-testid="provider-type-select"]')
    expect(select.exists()).toBe(true)
    // 验证 mock 选项不存在
    const options = select.findAll('option')
    options.forEach(o => {
      expect(o.text().toLowerCase()).not.toContain('mock')
    })
  })

  it('skip button does not submit current step data', async () => {
    const { submitWizard } = await import('@/api/settings')
    const wrapper = mount(SetupWizardDialog, {
      props: { modelValue: true },
      global: { stubs: transparentStubs },
    })
    await wrapper.vm.$nextTick()
    const skipBtn = wrapper.find('[data-testid="skip-btn"]')
    await skipBtn.trigger('click')
    // 跳过应进入下一步而非提交
    expect(submitWizard).not.toHaveBeenCalled()
  })

  it('next button advances to next step', async () => {
    const wrapper = mount(SetupWizardDialog, {
      props: { modelValue: true },
      global: { stubs: transparentStubs },
    })
    await wrapper.vm.$nextTick()
    const nextBtn = wrapper.find('[data-testid="next-btn"]')
    await nextBtn.trigger('click')
    // 应进入下一步（步骤指示器激活项变化）
    expect(wrapper.find('[data-testid="step-indicator"].is-active').text()).toContain('Embedding')
  })

  it('emits update:modelValue false on cancel', async () => {
    const wrapper = mount(SetupWizardDialog, {
      props: { modelValue: true },
      global: { stubs: transparentStubs },
    })
    await wrapper.vm.$nextTick()
    const cancelBtn = wrapper.find('[data-testid="cancel-btn"]')
    await cancelBtn.trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')![0]).toEqual([false])
  })
})
