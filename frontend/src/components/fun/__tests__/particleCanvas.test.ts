import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ParticleCanvas } from '../doomsday/particleCanvas'
import { PARTICLE_SIZE } from '../doomsday/types'

function createMockImageData(width: number, height: number, alpha: number = 255): ImageData {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = 255
    data[i * 4 + 1] = 0
    data[i * 4 + 2] = 0
    data[i * 4 + 3] = alpha
  }
  return { data, width, height, colorSpace: 'srgb' } as unknown as ImageData
}

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

describe('particleCanvas', () => {
  let canvas: HTMLCanvasElement
  let originalGetContext: any

  beforeEach(() => {
    originalGetContext = HTMLCanvasElement.prototype.getContext
    ;(HTMLCanvasElement.prototype as any).getContext = vi.fn(() => mockCtx as unknown as CanvasRenderingContext2D)
    canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    document.body.appendChild(canvas)
  })

  afterEach(() => {
    ;(HTMLCanvasElement.prototype as any).getContext = originalGetContext
    canvas.remove()
    vi.clearAllMocks()
  })

  it('粒子生成正确数量（64x64 区域 8px 切块 = 64 粒子）', () => {
    const imageData = createMockImageData(64, 64)
    const pc = new ParticleCanvas(canvas, imageData, 32, 32, PARTICLE_SIZE)
    expect(pc.getParticleCount()).toBe(64)
  })

  it('完全透明的方块被跳过', () => {
    const imageData = createMockImageData(64, 64, 0)
    const pc = new ParticleCanvas(canvas, imageData, 32, 32, PARTICLE_SIZE)
    expect(pc.getParticleCount()).toBe(0)
  })

  it('start 启动 raf 循环', () => {
    const imageData = createMockImageData(64, 64)
    const pc = new ParticleCanvas(canvas, imageData, 32, 32, PARTICLE_SIZE)
    const spy = vi.spyOn(window, 'requestAnimationFrame')
    pc.start(1000)
    expect(spy).toHaveBeenCalled()
    pc.stop()
  })

  it('stop 取消 raf', () => {
    const imageData = createMockImageData(64, 64)
    const pc = new ParticleCanvas(canvas, imageData, 32, 32, PARTICLE_SIZE)
    const spy = vi.spyOn(window, 'cancelAnimationFrame')
    pc.start(1000)
    pc.stop()
    expect(spy).toHaveBeenCalled()
  })

  it('粒子接近奇点时 alive 设为 false', () => {
    const imageData = createMockImageData(64, 64)
    const pc = new ParticleCanvas(canvas, imageData, 32, 32, PARTICLE_SIZE)
    pc.start(1000)
    pc.forceAbsorbAll()
    expect(pc.getAliveCount()).toBe(0)
    pc.stop()
  })

  it('粒子总数不超过 MAX_PARTICLES', () => {
    const imageData = createMockImageData(2000, 2000)
    const pc = new ParticleCanvas(canvas, imageData, 1000, 1000, PARTICLE_SIZE)
    expect(pc.getParticleCount()).toBeLessThanOrEqual(50000)
  })
})
