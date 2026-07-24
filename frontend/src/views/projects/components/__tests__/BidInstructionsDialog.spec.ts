import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BidInstructionsDialog from '../BidInstructionsDialog.vue'

describe('BidInstructionsDialog', () => {
  function mountWith(modelValue: boolean) {
    return mount(BidInstructionsDialog, {
      props: { modelValue },
      global: {
        stubs: {
          // 让 el-dialog 透传 default/footer slot 到 DOM，便于断言
          ElDialog: {
            name: 'ElDialog',
            props: ['modelValue'],
            template: `
              <div v-if="modelValue" class="el-dialog-stub">
                <div class="el-dialog__body"><slot /></div>
                <div class="el-dialog__footer"><slot name="footer" /></div>
              </div>
            `,
          },
          ElAlert: { template: '<div class="el-alert-stub"><slot /></div>' },
          ElButton: {
            name: 'ElButton',
            emits: ['click'],
            template: '<button @click="$emit(\'click\')"><slot /></button>',
          },
        },
      },
    })
  }

  it('modelValue=false 时不渲染对话框', () => {
    const wrapper = mountWith(false)
    expect(wrapper.find('.el-dialog-stub').exists()).toBe(false)
  })

  it('modelValue=true 时渲染 5 个步骤', () => {
    const wrapper = mountWith(true)
    const titles = wrapper.findAll('.step-title').map(w => w.text())
    expect(titles).toEqual([
      '招标文件上传',
      'AI 解析文件',
      '大纲生成',
      '内容编辑（最核心写作环节，约 20 分钟）',
      '导出',
    ])
  })

  it('第 2 步渲染 4 个编号子阶段', () => {
    const wrapper = mountWith(true)
    const orderedItems = wrapper.findAll('.step-card')[1].findAll('.step-ordered li')
    expect(orderedItems).toHaveLength(4)
    const texts = orderedItems.map(li => li.text())
    expect(texts[0]).toContain('文档解析')
    expect(texts[1]).toContain('语义分块')
    expect(texts[2]).toContain('条款抽取')
    expect(texts[3]).toContain('向量嵌入')
  })

  it('渲染底部流程模板提示', () => {
    const wrapper = mountWith(true)
    expect(wrapper.find('.el-alert-stub').text()).toContain('流程模板')
  })

  it('点击「我知道了」emit update:modelValue 为 false', async () => {
    const wrapper = mountWith(true)
    await wrapper.find('.el-dialog__footer button').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')![0]).toEqual([false])
  })
})
