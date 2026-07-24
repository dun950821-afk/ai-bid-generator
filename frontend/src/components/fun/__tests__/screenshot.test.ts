import { describe, it, expect, vi, beforeEach } from 'vitest'
import { captureApp } from '../doomsday/screenshot'

vi.mock('html2canvas', () => ({
  default: vi.fn().mockResolvedValue({
    width: 200,
    height: 100,
    getContext: () => ({
      getImageData: () => ({ data: new Uint8ClampedArray(200 * 100 * 4) }),
    }),
  }),
}))

describe('screenshot', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"><p>hello</p></div>'
  })

  it('captureApp 返回 ScreenshotResult 包含 imageData', async () => {
    const result = await captureApp('#app', {})
    expect(result.imageData).toBeDefined()
    expect(result.width).toBe(200)
    expect(result.height).toBe(100)
    expect(result.canvas).toBeDefined()
  })

  it('captureApp 把 #app 设为 visibility: hidden', async () => {
    const app = document.getElementById('app')!
    expect(app.style.visibility).not.toBe('hidden')
    await captureApp('#app', {})
    expect(app.style.visibility).toBe('hidden')
  })

  it('captureApp 隐藏 .el-message 等浮层并在截图后恢复', async () => {
    const message = document.createElement('div')
    message.className = 'el-message'
    message.style.display = 'block'
    document.body.appendChild(message)

    await captureApp('#app', {})

    expect(message.style.display).toBe('block')
  })

  it('captureApp 超时 1s 抛 Error', async () => {
    const html2canvas = (await import('html2canvas')).default as unknown as ReturnType<typeof vi.fn>
    html2canvas.mockImplementationOnce(
      () => new Promise(() => {}) as unknown as Promise<HTMLCanvasElement>
    )

    await expect(captureApp('#app', {})).rejects.toThrow('截图超时')
  })

  it('html2canvas 抛错时 captureApp reject', async () => {
    const html2canvas = (await import('html2canvas')).default as unknown as ReturnType<typeof vi.fn>
    html2canvas.mockRejectedValueOnce(new Error('network error'))

    await expect(captureApp('#app', {})).rejects.toThrow('network error')
  })
})
