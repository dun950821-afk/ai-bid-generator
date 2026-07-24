import { describe, it, expect, vi } from 'vitest'
import { createCleanupRegistry, cleanup } from '../doomsday/cleanup'

describe('cleanup', () => {
  it('cleanup 清除所有 timer', () => {
    const registry = createCleanupRegistry()
    const spy = vi.spyOn(window, 'clearTimeout')
    const id = window.setTimeout(() => {}, 1000)
    registry.registerTimer(id)
    cleanup(registry)
    expect(spy).toHaveBeenCalledWith(id)
  })

  it('cleanup 取消所有 raf', () => {
    const registry = createCleanupRegistry()
    const spy = vi.spyOn(window, 'cancelAnimationFrame')
    const id = window.requestAnimationFrame(() => {})
    registry.registerRaf(id)
    cleanup(registry)
    expect(spy).toHaveBeenCalledWith(id)
  })

  it('cleanup 移除所有事件监听', () => {
    const registry = createCleanupRegistry()
    const target = new EventTarget()
    const listener = vi.fn()
    registry.registerEventListener(target, 'test', listener)
    target.dispatchEvent(new Event('test'))
    expect(listener).toHaveBeenCalledTimes(1)
    cleanup(registry)
    target.dispatchEvent(new Event('test'))
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('cleanup 移除所有 DOM 节点', () => {
    const registry = createCleanupRegistry()
    const node = document.createElement('div')
    document.body.appendChild(node)
    registry.registerDomNode(node)
    cleanup(registry)
    expect(document.body.contains(node)).toBe(false)
  })

  it('cleanup 恢复 #app visibility', () => {
    const registry = createCleanupRegistry()
    const app = document.createElement('div')
    app.id = 'app'
    app.style.visibility = 'hidden'
    document.body.appendChild(app)
    registry.registerRestore(() => {
      app.style.visibility = 'visible'
    })
    cleanup(registry)
    expect(app.style.visibility).toBe('visible')
  })

  it('cleanup 幂等：多次调用不报错', () => {
    const registry = createCleanupRegistry()
    const spy = vi.fn()
    registry.registerRestore(spy)
    cleanup(registry)
    cleanup(registry)
    cleanup(registry)
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
