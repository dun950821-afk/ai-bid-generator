import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('element-plus', () => ({
  ElMessage: { warning: vi.fn(), success: vi.fn(), info: vi.fn() },
}))

const runMock = vi.fn().mockImplementation(() => new Promise<void>(() => {}))
const cancelMock = vi.fn()
const cleanupMock = vi.fn()

vi.mock('../doomsday', () => ({
  createDoomsdayEffect: vi.fn(() => ({
    run: runMock,
    cancel: cancelMock,
    cleanup: cleanupMock,
  })),
}))

import DoomsdayButton from '../DoomsdayButton.vue'
import { createDoomsdayEffect } from '../doomsday'

describe('DoomsdayButton', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.clearAllMocks()
  })

  it('按钮渲染文本"累了毁灭吧"', () => {
    const wrapper = mount(DoomsdayButton, {
      global: { stubs: { 'el-button': { template: '<button><slot/></button>' } } },
    })
    expect(wrapper.text()).toContain('累了毁灭吧')
  })

  it('点击按钮触发 createDoomsdayEffect.run', async () => {
    const wrapper = mount(DoomsdayButton, {
      global: { stubs: { 'el-button': { template: '<button><slot/></button>' } } },
    })
    await wrapper.find('button').trigger('click')
    expect(createDoomsdayEffect).toHaveBeenCalled()
    expect(runMock).toHaveBeenCalled()
  })

  it('运行中按钮 disabled', async () => {
    const wrapper = mount(DoomsdayButton, {
      global: { stubs: { 'el-button': { template: '<button :disabled="disabled"><slot/></button>', props: ['disabled'] } } },
    })
    const btn = wrapper.find('button')
    await btn.trigger('click')
    expect(btn.attributes('disabled')).toBeDefined()
  })

  it('运行中卸载组件调用 cleanup', async () => {
    const wrapper = mount(DoomsdayButton, {
      global: { stubs: { 'el-button': { template: '<button><slot/></button>' } } },
    })
    await wrapper.find('button').trigger('click')
    wrapper.unmount()
    expect(cleanupMock).toHaveBeenCalled()
  })
})
