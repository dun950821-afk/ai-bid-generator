import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('html2canvas', () => ({
  default: vi.fn().mockResolvedValue({
    width: 64,
    height: 64,
    getContext: () => ({
      getImageData: () => {
        const data = new Uint8ClampedArray(64 * 64 * 4)
        for (let i = 0; i < data.length; i += 4) {
          data[i] = 255
          data[i + 3] = 255
        }
        return { data, width: 64, height: 64, colorSpace: 'srgb' } as unknown as ImageData
      },
    }),
  }),
}))

const mockCtx = {
  canvas: { width: 64, height: 64 },
  clearRect: vi.fn(),
  save: vi.fn(),
  translate: vi.fn(),
  rotate: vi.fn(),
  scale: vi.fn(),
  fillRect: vi.fn(),
  restore: vi.fn(),
  set fillStyle(value: string) { (this as any)._fillStyle = value },
  get fillStyle() { return (this as any)._fillStyle || '' },
}

import { createDoomsdayEffect } from '../doomsday'
import { TIMELINE } from '../doomsday/types'

describe('doomsdayEffect', () => {
  let originalGetContext: any

  beforeEach(() => {
    vi.useFakeTimers()
    document.body.innerHTML = '<div id="app"><p>hello</p></div>'
    originalGetContext = (HTMLCanvasElement.prototype as any).getContext
    ;(HTMLCanvasElement.prototype as any).getContext = vi.fn(() => mockCtx as unknown as CanvasRenderingContext2D)
  })

  afterEach(() => {
    ;(HTMLCanvasElement.prototype as any).getContext = originalGetContext
    vi.useRealTimers()
  })

  it('createDoomsdayEffect 返回 controller', () => {
    const controller = createDoomsdayEffect({ originX: 100, originY: 100 })
    expect(controller.run).toBeDefined()
    expect(controller.cancel).toBeDefined()
    expect(controller.cleanup).toBeDefined()
    controller.cleanup()
  })

  it('controller.run 返回 Promise', () => {
    const controller = createDoomsdayEffect({ originX: 100, originY: 100 })
    const result = controller.run()
    expect(result).toBeInstanceOf(Promise)
    controller.cancel()
  })

  it('controller.cancel 立即清理 DOM', () => {
    const controller = createDoomsdayEffect({ originX: 100, originY: 100 })
    controller.run()
    controller.cancel()
    expect(document.querySelector('.doomsday-overlay')).toBeNull()
    expect(document.getElementById('app')!.style.visibility).not.toBe('hidden')
  })

  it('完整流程后 DOM 还原', async () => {
    const controller = createDoomsdayEffect({ originX: 100, originY: 100 })
    const promise = controller.run()
    vi.advanceTimersByTime(TIMELINE.end + 100)
    await promise
    expect(document.querySelector('.doomsday-overlay')).toBeNull()
    expect(document.getElementById('app')!.style.visibility).not.toBe('hidden')
  })

  it('截图失败时走简化路径（闪屏 + 黑屏）', async () => {
    const html2canvas = (await import('html2canvas')).default as unknown as ReturnType<typeof vi.fn>
    html2canvas.mockRejectedValueOnce(new Error('screenshot failed'))

    const controller = createDoomsdayEffect({ originX: 100, originY: 100 })
    const promise = controller.run()
    vi.advanceTimersByTime(TIMELINE.end + 100)
    await promise
    expect(document.querySelector('.doomsday-overlay')).toBeNull()
  })

  it('15s 后自动 cleanup + resolve', async () => {
    const controller = createDoomsdayEffect({ originX: 100, originY: 100 })
    let resolved = false
    controller.run().then(() => {
      resolved = true
    })
    vi.advanceTimersByTime(TIMELINE.end)
    await Promise.resolve()
    await Promise.resolve()
    expect(resolved).toBe(true)
  })
})
