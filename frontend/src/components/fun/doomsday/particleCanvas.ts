import { MAX_PARTICLES, PARTICLE_SIZE, type Particle } from './types'

export class ParticleCanvas {
  private particles: Particle[] = []
  private rafId: number | null = null
  private startTime = 0
  private durationMs = 0
  private ctx: CanvasRenderingContext2D

  constructor(
    canvas: HTMLCanvasElement,
    imageData: ImageData,
    private originX: number,
    private originY: number,
    private particleSize: number = PARTICLE_SIZE
  ) {
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Canvas 2D 上下文不可用')
    }
    this.ctx = ctx
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

        particles.push({
          x: x + size / 2,
          y: y + size / 2,
          startX: x + size / 2,
          startY: y + size / 2,
          vx: 0,
          vy: 0,
          rotation: 0,
          rotationSpeed: (Math.random() - 0.5) * 0.4,
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
    const t = elapsed / 1000
    for (const p of this.particles) {
      if (!p.alive) continue
      const dx = this.originX - p.x
      const dy = this.originY - p.y
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist < 30) {
        p.alive = false
        continue
      }

      const gravity = (1 / Math.max(dist, 50)) * 5000
      p.vx += (dx / dist) * gravity * dt
      p.vy += (dy / dist) * gravity * dt

      const perpX = -dy / dist
      const perpY = dx / dist
      const curve = Math.sin(t * 0.5 + p.phase) * 30
      p.vx += perpX * curve * dt
      p.vy += perpY * curve * dt

      p.x += p.vx * dt * 10
      p.y += p.vy * dt * 10
      p.rotation += p.rotationSpeed
      p.scale = Math.max(0.05, dist / 500)
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
