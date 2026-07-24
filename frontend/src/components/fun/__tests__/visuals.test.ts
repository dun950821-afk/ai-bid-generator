import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createVisuals, destroyVisuals } from '../doomsday/visuals'

describe('visuals', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('createVisuals 返回所有视觉节点', () => {
    const visuals = createVisuals(100, 100)
    expect(visuals.overlay).toBeDefined()
    expect(visuals.warnBanner).toBeDefined()
    expect(visuals.warnCountdown).toBeDefined()
    expect(visuals.singularity).toBeDefined()
    expect(visuals.flash).toBeDefined()
    expect(visuals.darkScreen).toBeDefined()
    expect(visuals.embers).toHaveLength(6)
    expect(visuals.restartButton).toBeDefined()
    expect(visuals.loadingRing).toBeDefined()
    expect(visuals.rippleContainer).toBeDefined()
    expect(visuals.rebuildText).toBeDefined()
  })

  it('singularity 定位在 originX, originY', () => {
    const visuals = createVisuals(200, 150)
    expect(visuals.singularity.style.left).toContain('200')
    expect(visuals.singularity.style.top).toContain('150')
  })

  it('warnBanner 文本包含"毁灭程序已启动"', () => {
    const visuals = createVisuals(100, 100)
    expect(visuals.warnBanner.textContent).toContain('毁灭程序已启动')
  })

  it('restartButton 点击触发回调', () => {
    const visuals = createVisuals(100, 100)
    const handler = vi.fn()
    visuals.restartButton.addEventListener('click', handler)
    visuals.restartButton.click()
    expect(handler).toHaveBeenCalled()
  })

  it('destroyVisuals 移除所有 DOM 节点', () => {
    const visuals = createVisuals(100, 100)
    expect(document.body.contains(visuals.overlay)).toBe(true)
    destroyVisuals(visuals)
    expect(document.body.contains(visuals.overlay)).toBe(false)
  })

  it('overlay 附加到 document.body', () => {
    const visuals = createVisuals(100, 100)
    expect(document.body.contains(visuals.overlay)).toBe(true)
  })

  it('restartButton 默认隐藏', () => {
    const visuals = createVisuals(100, 100)
    expect(visuals.restartButton.style.display).toBe('none')
  })

  it('showRestartButton 显示按钮', () => {
    const visuals = createVisuals(100, 100)
    visuals.showRestartButton(() => {})
    expect(visuals.restartButton.style.display).not.toBe('none')
  })
})
