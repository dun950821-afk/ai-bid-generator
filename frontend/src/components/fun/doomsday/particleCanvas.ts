import { MAX_PARTICLES, PARTICLE_SIZE, type Particle } from './types'

/**
 * 崩解粒子画布(重构版):
 * - 起手各粒子带随机初速度向外微散 + 自旋(崩解感)
 * - 随后引力持续加速拉向奇点, 带切向旋涡, 接近奇点缩小湮灭
 */
export class ParticleCanvas {
  private particles: Particle[] = []
  private rafId: number | null = null
  private startTime = 0
  private durationMs = 0
  private ctx: CanvasRenderingContext2D
  private originX: number
  private originY: number
  private particleSize: number

  constructor(
    canvas: HTMLCanvasElement,
    imageData: ImageData,
    originX: number,
    originY: number,
    particleSize: number = PARTICLE_SIZE
  ) {
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Canvas 2D 上下文不可用')
    }
    this.ctx = ctx
    this.originX = originX
    this.originY = originY
    this.particleSize = particleSize
    this.particles = this.buildParticles(imageData)
  }

  private buildParticles(imageData: ImageData): Particle[] {
    const { width, height, data } = imageData
    const size = this.particleSize
    const particles: Particle[] = []

    for (let y = 0; y < height; y += size) {
      for (let x = 0; x < width; x += size) {
        const color = this.averageColor(data, x, y, width, size)
        if (color === null) continue

        // 初始微散速度(崩解感): 随机方向 20~80 px/s
        const angle = Math.random() * Math.PI * 2
        const speed = 20 + Math.random() * 60
        particles.push({
          x: x + size / 2,
          y: y + size / 2,
          startX: x + size / 2,
          startY: y + size / 2,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          rotation: 0,
          rotationSpeed: (Math.random() - 0.5) * 0.5,
          scale: 1,
          color,
          alive: true,
          phase: Math.random() * Math.PI * 2,
        })

        if (particles.length >= MAX_PARTICLES) {
          return particles
        }
      }
    }
    return particles
  }

  private averageColor(
    data: Uint8ClampedArray,
    x0: number,
    y0: number,
    width: number,
    size: number
  ): string | null {
    let r = 0
    let g = 0
    let b = 0
    let a = 0
    let count = 0

    for (let dy = 0; dy < size; dy += 1) {
      for (let dx = 0; dx < size; dx += 1) {
        const px = x0 + dx
        const py = y0 + dy
        if (px >= width) continue
        const idx = (py * width + px) * 4
        if (idx + 3 >= data.length) continue
        r += data[idx]
        g += data[idx + 1]
        b += data[idx + 2]
        a += data[idx + 3]
        count += 1
      }
    }

    if (count === 0) return null
    r = Math.floor(r / count)
    g = Math.floor(g / count)
    b = Math.floor(b / count)
    a = Math.floor(a / count)

    if (a === 0) return null
    return `rgba(${r},${g},${b},${(a / 255).toFixed(3)})`
  }

  start(durationMs: number): void {
    this.durationMs = durationMs
    this.startTime = performance.now()
    this.rafId = window.requestAnimationFrame(this.loop)
  }

  private loop = (): void => {
    if (this.rafId === null) return
    const now = performance.now()
    const elapsed = now - this.startTime
    this.update(elapsed)
    this.draw()
    if (elapsed < this.durationMs) {
      this.rafId = window.requestAnimationFrame(this.loop)
    } else {
      this.rafId = null
    }
  }

  private update(elapsed: number): void {
    const dt = 0.016
    const progress = Math.min(1, elapsed / this.durationMs)
    // 引力随时间增强(起手微散, 之后加速吸入)
    const gravity = 300 + 3200 * progress * progress
    const t = elapsed / 1000

    for (const p of this.particles) {
      if (!p.alive) continue
      const dx = this.originX - p.x
      const dy = this.originY - p.y
      const dist = Math.sqrt(dx * dx + dy * dy) || 1

      if (dist < 24) {
        p.alive = false
        continue
      }

      // 引力(向心)
      p.vx += (dx / dist) * gravity * dt
      p.vy += (dy / dist) * gravity * dt

      // 切向旋涡(绕奇点盘旋)
      const swirl = Math.sin(t * 3 + p.phase) * 60 * progress
      p.vx += (-dy / dist) * swirl * dt
      p.vy += (dx / dist) * swirl * dt

      // 阻尼, 防止速度发散
      p.vx *= 0.985
      p.vy *= 0.985

      p.x += p.vx * dt
      p.y += p.vy * dt
      p.rotation += p.rotationSpeed
      // 越接近奇点越小(被压缩湮灭)
      p.scale = Math.max(0.05, Math.min(1, dist / 350))
    }
  }

  private draw(): void {
    this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height)
    const half = this.particleSize / 2
    for (const p of this.particles) {
      if (!p.alive) continue
      this.ctx.save()
      this.ctx.translate(p.x, p.y)
      this.ctx.rotate(p.rotation)
      this.ctx.scale(p.scale, p.scale)
      this.ctx.fillStyle = p.color
      this.ctx.fillRect(-half, -half, this.particleSize, this.particleSize)
      this.ctx.restore()
    }
  }

  stop(): void {
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  forceAbsorbAll(): void {
    for (const p of this.particles) {
      p.alive = false
    }
  }

  getParticleCount(): number {
    return this.particles.length
  }

  getAliveCount(): number {
    return this.particles.filter((p) => p.alive).length
  }

  destroy(): void {
    this.stop()
    this.particles = []
  }
}
