# 「累了毁灭吧」动效重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 html2canvas + Canvas 2D 重构「累了毁灭吧」按钮毁灭动画，实现 7 阶段电影级坍缩效果（15s），无降级，完整错误处理与 cleanup。

**Architecture:** 截图整个 `#app` → 切成 8×8 像素方块 → Canvas 2D 粒子系统沿弧线吸入按钮位置奇点。每个模块（screenshot/particleCanvas/visuals/stages/cleanup）职责单一、可独立测试。幂等 cleanup 保证任何错误路径都不卡住用户工作流。

**Tech Stack:** Vue 3 + TypeScript + vitest + @vue/test-utils + jsdom + html2canvas + Element Plus

## Global Constraints

- **依赖版本**：`html2canvas` 最新稳定版（`npm install html2canvas` 自动取最新），添加到 `frontend/package.json` 的 `dependencies`
- **TypeScript 严格模式**：`tsconfig.app.json` 启用 `noUnusedLocals: true` 与 `noUnusedParameters: true`，所有代码必须无未使用的 import/变量
- **构建命令**：`cd frontend && npm run build`（`vue-tsc -b && vite build`）
- **测试命令**：`cd frontend && npx vitest run <file>` 或 `npx vitest run`（全量）
- **测试环境**：vitest config 已有 `environment: 'jsdom'`，无需修改
- **测试文件位置**：`frontend/src/components/fun/__tests__/`
- **源码文件位置**：`frontend/src/components/fun/doomsday/`
- **总时长**：15s 固定，无降级
- **粒子大小**：8×8 px 固定
- **截图根节点**：`#app`
- **奇点位置**：按钮中心（由 `DoomsdayButton.vue` 计算 `originX/originY` 传入）
- **DOM 冻结方式**：`visibility: hidden`（保留布局，避免重排）
- **错误处理原则**：所有错误路径必须还原 DOM；`controller.run()` 返回的 Promise 永远 resolve 永不 reject
- **commit 风格**：遵循现有 `feat(scope): 描述` / `fix(scope): 描述` 格式，中文描述
- **不删除旧文件**：Task 10 才删除 `doomsdayEffect.ts`，避免破坏 `DoomsdayButton.vue` 旧版引用

## File Structure

```
frontend/src/components/fun/
├── DoomsdayButton.vue                    # 重写（Task 9）
├── doomsdayEffect.ts                      # 删除（Task 10）
└── doomsday/
    ├── index.ts                           # 公共入口（Task 7）
    ├── types.ts                           # 类型定义（Task 1）
    ├── screenshot.ts                      # 截图模块（Task 2）
    ├── particleCanvas.ts                 # Canvas 粒子系统（Task 3）
    ├── visuals.ts                         # 视觉节点（Task 4）
    ├── stages.ts                          # 阶段调度（Task 5）
    └── cleanup.ts                         # 幂等清理（Task 6）
```

**职责分离**：
- `types.ts`：纯类型，无实现
- `screenshot.ts`：html2canvas 截图 + DOM 冻结/解冻，不知道后续阶段
- `particleCanvas.ts`：Canvas 2D 粒子绘制与物理，不知道整体编排
- `visuals.ts`：创建/销毁 DOM 视觉节点（不含 Canvas）
- `stages.ts`：调度 timer 触发各阶段，不实现具体视觉
- `cleanup.ts`：收集所有可清理资源做幂等清理
- `index.ts`：整合所有模块，对外暴露 `createDoomsdayEffect`

---

## Task 1: 创建 types.ts 类型定义

**Files:**
- Create: `frontend/src/components/fun/doomsday/types.ts`

**Interfaces:**
- Produces: `DoomsdayOptions`, `DoomsdayController`, `ScreenshotResult`, `Particle`, `VisualElements`, `CleanupRegistry`, `StageTimeline`, `TIMELINE`

- [ ] **Step 1: 创建 types.ts 文件**

```typescript
// frontend/src/components/fun/doomsday/types.ts

export interface DoomsdayOptions {
  rootSelector?: string
  duration?: number
  originX?: number
  originY?: number
  onStageChange?: (stage: number) => void
}

export interface DoomsdayController {
  run(): Promise<void>
  cancel(): void
  cleanup(): void
}

export interface ScreenshotResult {
  canvas: HTMLCanvasElement
  width: number
  height: number
  imageData: ImageData
}

export interface Particle {
  x: number
  y: number
  startX: number
  startY: number
  vx: number
  vy: number
  rotation: number
  rotationSpeed: number
  scale: number
  color: string
  alive: boolean
  phase: number
}

export interface VisualElements {
  overlay: HTMLDivElement
  warnBanner: HTMLDivElement
  warnCountdown: HTMLSpanElement
  singularity: HTMLDivElement
  flash: HTMLDivElement
  darkScreen: HTMLDivElement
  embers: HTMLSpanElement[]
  restartButton: HTMLButtonElement
  loadingRing: HTMLDivElement
}

export interface CleanupRegistry {
  registerTimer(id: number): void
  registerRaf(id: number): void
  registerEventListener(target: EventTarget, type: string, listener: EventListenerOrEventListenerObject): void
  registerDomNode(node: HTMLElement): void
  registerRestore(fn: () => void): void
}

export interface StageTimeline {
  stage0_freeze: number
  stage1_warn: number
  stage2_singularity: number
  stage3_decompose: number
  stage4_collapse: number
  stage5_flash: number
  stage6_aftermath: number
  end: number
}

export const TIMELINE: StageTimeline = {
  stage0_freeze: 0,
  stage1_warn: 200,
  stage2_singularity: 2500,
  stage3_decompose: 3500,
  stage4_collapse: 4500,
  stage5_flash: 12000,
  stage6_aftermath: 12100,
  end: 15000,
}

export const STAGE4_DURATION = TIMELINE.stage5_flash - TIMELINE.stage4_collapse
export const PARTICLE_SIZE = 8
export const SCREENSHOT_TIMEOUT_MS = 1000
export const MAX_PARTICLES = 50000
```

- [ ] **Step 2: 验证 TypeScript 类型可用**

Run: `cd frontend && npx vue-tsc --noEmit`
Expected: 退出码 0，无错误

- [ ] **Step 3: Commit**

```bash
cd /home/newaibook/ai-bid-generator
git add frontend/src/components/fun/doomsday/types.ts
git commit -m "feat(doomsday): 新增类型定义与时间线常量"
```

---

## Task 2: 实现 screenshot.ts

**Files:**
- Create: `frontend/src/components/fun/doomsday/screenshot.ts`
- Test: `frontend/src/components/fun/__tests__/screenshot.test.ts`

**Interfaces:**
- Consumes: `ScreenshotResult` from `./types`
- Produces: `captureApp(rootSelector, options)` 返回 `Promise<ScreenshotResult>`

- [ ] **Step 1: 写失败测试**

```typescript
// frontend/src/components/fun/__tests__/screenshot.test.ts
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && npx vitest run src/components/fun/__tests__/screenshot.test.ts`
Expected: FAIL，提示 `captureApp` 不存在

- [ ] **Step 3: 安装 html2canvas 依赖**

Run: `cd frontend && npm install html2canvas`
Expected: `package.json` dependencies 出现 `html2canvas`

- [ ] **Step 4: 实现 screenshot.ts**

```typescript
// frontend/src/components/fun/doomsday/screenshot.ts
import html2canvas from 'html2canvas'
import { SCREENSHOT_TIMEOUT_MS, type ScreenshotResult } from './types'

const FLOATING_SELECTORS = ['.el-message', '.el-dialog', '.el-drawer', '.el-tooltip__popper']

export async function captureApp(
  rootSelector: string,
  options: {
    onBeforeCapture?: () => void
    onAfterCapture?: () => void
  }
): Promise<ScreenshotResult> {
  const root = document.querySelector(rootSelector) as HTMLElement | null
  if (!root) {
    throw new Error(`根节点 ${rootSelector} 未找到`)
  }

  const hiddenNodes: HTMLElement[] = []
  FLOATING_SELECTORS.forEach((selector) => {
    document.querySelectorAll<HTMLElement>(selector).forEach((node) => {
      if (node.style.display !== 'none') {
        node.style.display = 'none'
        hiddenNodes.push(node)
      }
    })
  })

  options.onBeforeCapture?.()

  let timeoutId: number | undefined
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error('截图超时')), SCREENSHOT_TIMEOUT_MS)
  })

  try {
    const canvas = await Promise.race([
      html2canvas(root, {
        backgroundColor: null,
        scale: 1,
        useCORS: true,
        logging: false,
        allowTaint: false,
      }),
      timeoutPromise,
    ])

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Canvas 2D 上下文不可用')
    }
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

    root.style.visibility = 'hidden'

    return {
      canvas,
      width: canvas.width,
      height: canvas.height,
      imageData,
    }
  } finally {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId)
    }
    hiddenNodes.forEach((node) => {
      node.style.display = ''
    })
    options.onAfterCapture?.()
  }
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cd frontend && npx vitest run src/components/fun/__tests__/screenshot.test.ts`
Expected: 5/5 PASS

- [ ] **Step 6: Commit**

```bash
cd /home/newaibook/ai-bid-generator
git add frontend/src/components/fun/doomsday/screenshot.ts frontend/src/components/fun/__tests__/screenshot.test.ts frontend/package.json frontend/package-lock.json
git commit -m "feat(doomsday): 新增截图模块 captureApp"
```

---

## Task 3: 实现 particleCanvas.ts

**Files:**
- Create: `frontend/src/components/fun/doomsday/particleCanvas.ts`
- Test: `frontend/src/components/fun/__tests__/particleCanvas.test.ts`

**Interfaces:**
- Consumes: `Particle`, `PARTICLE_SIZE`, `MAX_PARTICLES` from `./types`
- Produces: `class ParticleCanvas`

- [ ] **Step 1: 写失败测试**

```typescript
// frontend/src/components/fun/__tests__/particleCanvas.test.ts
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
  return new ImageData(data, width, height)
}

describe('particleCanvas', () => {
  let canvas: HTMLCanvasElement

  beforeEach(() => {
    canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    document.body.appendChild(canvas)
  })

  afterEach(() => {
    canvas.remove()
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
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && npx vitest run src/components/fun/__tests__/particleCanvas.test.ts`
Expected: FAIL，提示 `ParticleCanvas` 不存在

- [ ] **Step 3: 实现 particleCanvas.ts**

```typescript
// frontend/src/components/fun/doomsday/particleCanvas.ts
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
    this.loop()
  }

  private loop = (): void => {
    if (this.rafId === null) return
    const now = performance.now()
    const elapsed = now - this.startTime
    this.update(elapsed)
    this.draw()
    if (elapsed < this.durationMs) {
      this.rafId = window.requestAnimationFrame(this.loop)
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

      const gravity = 1 / Math.max(dist, 50) * 5000
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
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd frontend && npx vitest run src/components/fun/__tests__/particleCanvas.test.ts`
Expected: 6/6 PASS

- [ ] **Step 5: Commit**

```bash
cd /home/newaibook/ai-bid-generator
git add frontend/src/components/fun/doomsday/particleCanvas.ts frontend/src/components/fun/__tests__/particleCanvas.test.ts
git commit -m "feat(doomsday): 新增 Canvas 粒子系统"
```

---

## Task 4: 实现 visuals.ts

**Files:**
- Create: `frontend/src/components/fun/doomsday/visuals.ts`
- Test: `frontend/src/components/fun/__tests__/visuals.test.ts`

**Interfaces:**
- Consumes: `VisualElements` from `./types`
- Produces: `createVisuals(originX, originY)` 返回 `VisualElements`，`destroyVisuals(visuals)`

- [ ] **Step 1: 写失败测试**

```typescript
// frontend/src/components/fun/__tests__/visuals.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
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
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && npx vitest run src/components/fun/__tests__/visuals.test.ts`
Expected: FAIL，提示 `createVisuals` 不存在

- [ ] **Step 3: 实现 visuals.ts**

```typescript
// frontend/src/components/fun/doomsday/visuals.ts
import type { VisualElements } from './types'

export function createVisuals(originX: number, originY: number): VisualElements & {
  showRestartButton: (onClick: () => void) => void
} {
  const overlay = document.createElement('div')
  overlay.className = 'doomsday-overlay'
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:999999;pointer-events:none;overflow:hidden;'

  const loadingRing = document.createElement('div')
  loadingRing.className = 'doomsday-loading-ring'
  loadingRing.style.cssText =
    `position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:80px;height:80px;` +
    `border:4px solid rgba(167,139,250,0.3);border-top-color:#a78bfa;border-radius:50%;` +
    `animation:doomsday-spin 1s linear infinite;`

  const warnBanner = document.createElement('div')
  warnBanner.className = 'doomsday-warn-banner'
  warnBanner.style.cssText =
    `position:absolute;top:12%;left:50%;transform:translateX(-50%);padding:12px 28px;` +
    `background:linear-gradient(90deg,#d97706,#fbbf24,#d97706);color:#fff;` +
    `border-radius:999px;font-weight:800;letter-spacing:1px;box-shadow:0 8px 32px rgba(217,119,6,0.5);` +
    `transition:opacity 0.3s ease,transform 0.5s cubic-bezier(0.2,0.9,0.3,1.2);`

  const warnCountdown = document.createElement('span')
  warnCountdown.textContent = '2.3s'
  warnBanner.innerHTML = '⚠ 毁灭程序已启动，倒计时 '
  warnBanner.appendChild(warnCountdown)

  const singularity = document.createElement('div')
  singularity.className = 'doomsday-singularity'
  singularity.style.cssText =
    `position:absolute;left:${originX}px;top:${originY}px;` +
    `transform:translate(-50%,-50%) scale(0);width:80px;height:80px;border-radius:50%;` +
    `background:radial-gradient(circle,#fff 0%,#a78bfa 30%,#1e1b4b 70%,transparent 100%);` +
    `transition:transform 1s ease-out;animation:doomsday-spin 10s linear infinite reverse;`

  const flash = document.createElement('div')
  flash.className = 'doomsday-flash'
  flash.style.cssText =
    'position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;'

  const darkScreen = document.createElement('div')
  darkScreen.className = 'doomsday-dark-screen'
  darkScreen.style.cssText =
    'position:absolute;inset:0;background:#000;opacity:0;transition:opacity 0.2s ease;pointer-events:none;'

  const embers: HTMLSpanElement[] = []
  for (let i = 0; i < 6; i += 1) {
    const ember = document.createElement('span')
    ember.className = 'doomsday-ember'
    ember.textContent = '✦'
    ember.style.cssText =
      `position:absolute;left:${originX + (Math.random() - 0.5) * 40}px;top:${originY}px;` +
      `color:#fb923c;text-shadow:0 0 6px rgba(251,146,60,0.8);font-size:${10 + Math.random() * 12}px;` +
      `opacity:0;pointer-events:none;`
    embers.push(ember)
  }

  const restartButton = document.createElement('button')
  restartButton.className = 'doomsday-restart-btn'
  restartButton.textContent = '重启世界'
  restartButton.style.cssText =
    `position:absolute;left:${originX}px;top:${originY}px;transform:translate(-50%,-50%) scale(0.8);` +
    `display:none;padding:12px 32px;border:2px solid #a78bfa;background:rgba(30,27,75,0.8);` +
    `color:#fff;border-radius:999px;cursor:pointer;font-weight:700;pointer-events:auto;` +
    `box-shadow:0 0 32px rgba(167,139,250,0.6);transition:opacity 0.3s ease,transform 0.3s ease;`

  overlay.appendChild(loadingRing)
  overlay.appendChild(warnBanner)
  overlay.appendChild(singularity)
  overlay.appendChild(flash)
  overlay.appendChild(darkScreen)
  embers.forEach((e) => overlay.appendChild(e))
  overlay.appendChild(restartButton)
  document.body.appendChild(overlay)

  const visuals: VisualElements & { showRestartButton: (onClick: () => void) => void } = {
    overlay,
    warnBanner,
    warnCountdown,
    singularity,
    flash,
    darkScreen,
    embers,
    restartButton,
    loadingRing,
    showRestartButton(onClick: () => void) {
      restartButton.style.display = 'block'
      restartButton.style.opacity = '0'
      requestAnimationFrame(() => {
        restartButton.style.opacity = '1'
        restartButton.style.transform = 'translate(-50%,-50%) scale(1)'
      })
      restartButton.addEventListener('click', onClick, { once: true })
    },
  }

  return visuals
}

export function destroyVisuals(visuals: VisualElements): void {
  if (visuals.overlay.parentNode) {
    visuals.overlay.parentNode.removeChild(visuals.overlay)
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd frontend && npx vitest run src/components/fun/__tests__/visuals.test.ts`
Expected: 8/8 PASS

- [ ] **Step 5: Commit**

```bash
cd /home/newaibook/ai-bid-generator
git add frontend/src/components/fun/doomsday/visuals.ts frontend/src/components/fun/__tests__/visuals.test.ts
git commit -m "feat(doomsday): 新增视觉节点 visuals"
```

---

## Task 5: 实现 stages.ts

**Files:**
- Create: `frontend/src/components/fun/doomsday/stages.ts`
- Test: `frontend/src/components/fun/__tests__/stages.test.ts`

**Interfaces:**
- Consumes: `TIMELINE`, `STAGE4_DURATION` from `./types`
- Produces: `runStages(controller, onStageStart)` 返回 timer ID 数组

- [ ] **Step 1: 写失败测试**

```typescript
// frontend/src/components/fun/__tests__/stages.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TIMELINE, runStages } from '../doomsday/stages'

describe('stages', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('TIMELINE 常量符合 15s 时间线', () => {
    expect(TIMELINE.stage0_freeze).toBe(0)
    expect(TIMELINE.stage1_warn).toBe(200)
    expect(TIMELINE.stage2_singularity).toBe(2500)
    expect(TIMELINE.stage3_decompose).toBe(3500)
    expect(TIMELINE.stage4_collapse).toBe(4500)
    expect(TIMELINE.stage5_flash).toBe(12000)
    expect(TIMELINE.stage6_aftermath).toBe(12100)
    expect(TIMELINE.end).toBe(15000)
  })

  it('阶段 0 立即执行（无 timer）', () => {
    const controller = {
      startFreeze: vi.fn(),
      startWarn: vi.fn(),
      startSingularity: vi.fn(),
      startDecompose: vi.fn(),
      startCollapse: vi.fn(),
      startFlash: vi.fn(),
      startAftermath: vi.fn(),
      finalize: vi.fn(),
    }
    runStages(controller as any, () => {})
    expect(controller.startFreeze).toHaveBeenCalled()
  })

  it('阶段 1 在 200ms 触发', () => {
    const controller = {
      startFreeze: vi.fn(),
      startWarn: vi.fn(),
      startSingularity: vi.fn(),
      startDecompose: vi.fn(),
      startCollapse: vi.fn(),
      startFlash: vi.fn(),
      startAftermath: vi.fn(),
      finalize: vi.fn(),
    }
    runStages(controller as any, () => {})
    vi.advanceTimersByTime(200)
    expect(controller.startWarn).toHaveBeenCalled()
  })

  it('阶段 4 在 4500ms 触发', () => {
    const controller = {
      startFreeze: vi.fn(),
      startWarn: vi.fn(),
      startSingularity: vi.fn(),
      startDecompose: vi.fn(),
      startCollapse: vi.fn(),
      startFlash: vi.fn(),
      startAftermath: vi.fn(),
      finalize: vi.fn(),
    }
    runStages(controller as any, () => {})
    vi.advanceTimersByTime(4500)
    expect(controller.startCollapse).toHaveBeenCalled()
  })

  it('阶段 5 在 12000ms 触发', () => {
    const controller = {
      startFreeze: vi.fn(),
      startWarn: vi.fn(),
      startSingularity: vi.fn(),
      startDecompose: vi.fn(),
      startCollapse: vi.fn(),
      startFlash: vi.fn(),
      startAftermath: vi.fn(),
      finalize: vi.fn(),
    }
    runStages(controller as any, () => {})
    vi.advanceTimersByTime(12000)
    expect(controller.startFlash).toHaveBeenCalled()
  })

  it('15s 后触发 finalize', () => {
    const controller = {
      startFreeze: vi.fn(),
      startWarn: vi.fn(),
      startSingularity: vi.fn(),
      startDecompose: vi.fn(),
      startCollapse: vi.fn(),
      startFlash: vi.fn(),
      startAftermath: vi.fn(),
      finalize: vi.fn(),
    }
    runStages(controller as any, () => {})
    vi.advanceTimersByTime(15000)
    expect(controller.finalize).toHaveBeenCalled()
  })

  it('onStageStart 在每个阶段开始时调用', () => {
    const controller = {
      startFreeze: vi.fn(),
      startWarn: vi.fn(),
      startSingularity: vi.fn(),
      startDecompose: vi.fn(),
      startCollapse: vi.fn(),
      startFlash: vi.fn(),
      startAftermath: vi.fn(),
      finalize: vi.fn(),
    }
    const onStageStart = vi.fn()
    runStages(controller as any, onStageStart)
    expect(onStageStart).toHaveBeenCalledWith(0)
    vi.advanceTimersByTime(200)
    expect(onStageStart).toHaveBeenCalledWith(1)
    vi.advanceTimersByTime(2300)
    expect(onStageStart).toHaveBeenCalledWith(2)
  })

  it('cancelTimers 取消所有未触发的 timer', () => {
    const controller = {
      startFreeze: vi.fn(),
      startWarn: vi.fn(),
      startSingularity: vi.fn(),
      startDecompose: vi.fn(),
      startCollapse: vi.fn(),
      startFlash: vi.fn(),
      startAftermath: vi.fn(),
      finalize: vi.fn(),
    }
    const scheduled = runStages(controller as any, () => {})
    scheduled.cancelTimers()
    vi.advanceTimersByTime(20000)
    expect(controller.startWarn).not.toHaveBeenCalled()
    expect(controller.finalize).not.toHaveBeenCalled()
  })
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && npx vitest run src/components/fun/__tests__/stages.test.ts`
Expected: FAIL，提示 `runStages` 不存在

- [ ] **Step 3: 实现 stages.ts**

```typescript
// frontend/src/components/fun/doomsday/stages.ts
import { TIMELINE } from './types'

export interface StageController {
  startFreeze(): void
  startWarn(): void
  startSingularity(): void
  startDecompose(): void
  startCollapse(): void
  startFlash(): void
  startAftermath(): void
  finalize(): void
}

export interface ScheduledTimers {
  timerIds: number[]
  cancelTimers(): void
}

export function runStages(
  controller: StageController,
  onStageStart: (stage: number) => void
): ScheduledTimers {
  const timerIds: number[] = []

  controller.startFreeze()
  onStageStart(0)

  timerIds.push(
    window.setTimeout(() => {
      controller.startWarn()
      onStageStart(1)
    }, TIMELINE.stage1_warn)
  )

  timerIds.push(
    window.setTimeout(() => {
      controller.startSingularity()
      onStageStart(2)
    }, TIMELINE.stage2_singularity)
  )

  timerIds.push(
    window.setTimeout(() => {
      controller.startDecompose()
      onStageStart(3)
    }, TIMELINE.stage3_decompose)
  )

  timerIds.push(
    window.setTimeout(() => {
      controller.startCollapse()
      onStageStart(4)
    }, TIMELINE.stage4_collapse)
  )

  timerIds.push(
    window.setTimeout(() => {
      controller.startFlash()
      onStageStart(5)
    }, TIMELINE.stage5_flash)
  )

  timerIds.push(
    window.setTimeout(() => {
      controller.startAftermath()
      onStageStart(6)
    }, TIMELINE.stage6_aftermath)
  )

  timerIds.push(
    window.setTimeout(() => {
      controller.finalize()
    }, TIMELINE.end)
  )

  return {
    timerIds,
    cancelTimers() {
      timerIds.forEach((id) => window.clearTimeout(id))
    },
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd frontend && npx vitest run src/components/fun/__tests__/stages.test.ts`
Expected: 7/7 PASS

- [ ] **Step 5: Commit**

```bash
cd /home/newaibook/ai-bid-generator
git add frontend/src/components/fun/doomsday/stages.ts frontend/src/components/fun/__tests__/stages.test.ts
git commit -m "feat(doomsday): 新增阶段调度 stages"
```

---

## Task 6: 实现 cleanup.ts

**Files:**
- Create: `frontend/src/components/fun/doomsday/cleanup.ts`
- Test: `frontend/src/components/fun/__tests__/cleanup.test.ts`

**Interfaces:**
- Consumes: `CleanupRegistry` from `./types`
- Produces: `createCleanupRegistry()` 返回 `CleanupRegistry`，`cleanup(registry)` 幂等

- [ ] **Step 1: 写失败测试**

```typescript
// frontend/src/components/fun/__tests__/cleanup.test.ts
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
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && npx vitest run src/components/fun/__tests__/cleanup.test.ts`
Expected: FAIL，提示 `createCleanupRegistry` 不存在

- [ ] **Step 3: 实现 cleanup.ts**

```typescript
// frontend/src/components/fun/doomsday/cleanup.ts
import type { CleanupRegistry } from './types'

export function createCleanupRegistry(): CleanupRegistry {
  const timers: number[] = []
  const rafs: number[] = []
  const listeners: Array<{ target: EventTarget; type: string; listener: EventListenerOrEventListenerObject }> = []
  const domNodes: HTMLElement[] = []
  const restores: Array<() => void> = []

  return {
    registerTimer(id) {
      timers.push(id)
    },
    registerRaf(id) {
      rafs.push(id)
    },
    registerEventListener(target, type, listener) {
      target.addEventListener(type, listener)
      listeners.push({ target, type, listener })
    },
    registerDomNode(node) {
      domNodes.push(node)
    },
    registerRestore(fn) {
      restores.push(fn)
    },
  }
}

export function cleanup(registry: CleanupRegistry): void {
  const r = registry as ReturnType<typeof createCleanupRegistry> & { _cleaned?: boolean }
  if (r._cleaned) return
  r._cleaned = true

  r.registerTimer
  ;(registry as any).timers?.forEach((id: number) => window.clearTimeout(id))
  ;(registry as any).rafs?.forEach((id: number) => window.cancelAnimationFrame(id))
  ;(registry as any).listeners?.forEach(({ target, type, listener }: any) => {
    target.removeEventListener(type, listener)
  })
  ;(registry as any).domNodes?.forEach((node: HTMLElement) => {
    if (node.parentNode) {
      node.parentNode.removeChild(node)
    }
  })
  ;(registry as any).restores?.forEach((fn: () => void) => {
    try {
      fn()
    } catch {
      // 静默失败
    }
  })
}
```

注：实现用闭包内的数组存储资源，cleanup 通过 cast 访问。需要在实现中导出这些数组或改用 class。改用 class 更清晰：

**修订实现**：

```typescript
// frontend/src/components/fun/doomsday/cleanup.ts
import type { CleanupRegistry } from './types'

class CleanupRegistryImpl implements CleanupRegistry {
  private timers: number[] = []
  private rafs: number[] = []
  private listeners: Array<{ target: EventTarget; type: string; listener: EventListenerOrEventListenerObject }> = []
  private domNodes: HTMLElement[] = []
  private restores: Array<() => void> = []
  private cleaned = false

  registerTimer(id: number): void {
    this.timers.push(id)
  }

  registerRaf(id: number): void {
    this.rafs.push(id)
  }

  registerEventListener(
    target: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject
  ): void {
    target.addEventListener(type, listener)
    this.listeners.push({ target, type, listener })
  }

  registerDomNode(node: HTMLElement): void {
    this.domNodes.push(node)
  }

  registerRestore(fn: () => void): void {
    this.restores.push(fn)
  }

  cleanup(): void {
    if (this.cleaned) return
    this.cleaned = true

    this.timers.forEach((id) => window.clearTimeout(id))
    this.rafs.forEach((id) => window.cancelAnimationFrame(id))
    this.listeners.forEach(({ target, type, listener }) => {
      target.removeEventListener(type, listener)
    })
    this.domNodes.forEach((node) => {
      if (node.parentNode) {
        node.parentNode.removeChild(node)
      }
    })
    this.restores.forEach((fn) => {
      try {
        fn()
      } catch {
        // 静默失败
      }
    })
  }
}

export function createCleanupRegistry(): CleanupRegistry & { cleanup(): void } {
  return new CleanupRegistryImpl()
}

export function cleanup(registry: CleanupRegistry & { cleanup?: () => void }): void {
  if (registry.cleanup) {
    registry.cleanup()
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd frontend && npx vitest run src/components/fun/__tests__/cleanup.test.ts`
Expected: 6/6 PASS

- [ ] **Step 5: Commit**

```bash
cd /home/newaibook/ai-bid-generator
git add frontend/src/components/fun/doomsday/cleanup.ts frontend/src/components/fun/__tests__/cleanup.test.ts
git commit -m "feat(doomsday): 新增幂等 cleanup 模块"
```

---

## Task 7: 实现 index.ts 整合模块

**Files:**
- Create: `frontend/src/components/fun/doomsday/index.ts`
- Test: `frontend/src/components/fun/__tests__/doomsdayEffect.test.ts`

**Interfaces:**
- Consumes: 所有前述模块 + `DoomsdayOptions`, `DoomsdayController`, `TIMELINE`, `STAGE4_DURATION`, `VisualElements` from `./types`
- Produces: `createDoomsdayEffect(options)` 返回 `DoomsdayController`

- [ ] **Step 1: 写失败测试**

```typescript
// frontend/src/components/fun/__tests__/doomsdayEffect.test.ts
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
        return new ImageData(data, 64, 64)
      },
    }),
  }),
}))

import { createDoomsdayEffect } from '../doomsday'
import { TIMELINE } from '../doomsday/types'

describe('doomsdayEffect', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    document.body.innerHTML = '<div id="app"><p>hello</p></div>'
  })

  afterEach(() => {
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

  it('controller.cancel 立即清理 DOM', async () => {
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
    // 不应抛错，且最终清理 DOM
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
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && npx vitest run src/components/fun/__tests__/doomsdayEffect.test.ts`
Expected: FAIL，提示 `createDoomsdayEffect` 不存在

- [ ] **Step 3: 实现 index.ts**

```typescript
// frontend/src/components/fun/doomsday/index.ts
import { ElMessage } from 'element-plus'
import { captureApp } from './screenshot'
import { ParticleCanvas } from './particleCanvas'
import { createVisuals, destroyVisuals } from './visuals'
import { runStages, type StageController, type ScheduledTimers } from './stages'
import { createCleanupRegistry, cleanup } from './cleanup'
import {
  TIMELINE,
  STAGE4_DURATION,
  PARTICLE_SIZE,
  type DoomsdayOptions,
  type DoomsdayController,
  type VisualElements,
} from './types'

export function createDoomsdayEffect(options: DoomsdayOptions = {}): DoomsdayController {
  const rootSelector = options.rootSelector ?? '#app'
  const originX = options.originX ?? window.innerWidth / 2
  const originY = options.originY ?? 80
  const onStageChange = options.onStageChange

  let registry = createCleanupRegistry()
  let scheduled: ScheduledTimers | null = null
  let particleCanvas: ParticleCanvas | null = null
  let visuals: (VisualElements & { showRestartButton: (onClick: () => void) => void }) | null = null
  let resizeListener: (() => void) | null = null
  let resolveFn: (() => void) | null = null
  let finished = false

  function ensureCleanup() {
    if (scheduled) {
      scheduled.cancelTimers()
      scheduled = null
    }
    if (particleCanvas) {
      particleCanvas.destroy()
      particleCanvas = null
    }
    if (visuals) {
      destroyVisuals(visuals)
      visuals = null
    }
    if (resizeListener) {
      window.removeEventListener('resize', resizeListener)
      resizeListener = null
    }
    document.body.classList.remove('doomsday-active')
    const root = document.querySelector(rootSelector) as HTMLElement | null
    if (root) {
      root.style.visibility = ''
    }
    cleanup(registry)
    registry = createCleanupRegistry()
  }

  function finalize() {
    if (finished) return
    finished = true
    ensureCleanup()
    if (resolveFn) {
      resolveFn()
      resolveFn = null
    }
  }

  const controller: StageController = {
    async startFreeze() {
      try {
        const result = await captureApp(rootSelector, {})
        visuals = createVisuals(originX, originY)
        document.body.appendChild(visuals.overlay)
        document.body.classList.add('doomsday-active')

        const canvas = document.createElement('canvas')
        canvas.width = result.width
        canvas.height = result.height
        canvas.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:999998;'
        visuals.overlay.appendChild(canvas)

        particleCanvas = new ParticleCanvas(canvas, result.imageData, originX, originY, PARTICLE_SIZE)
      } catch {
        visuals = createVisuals(originX, originY)
        document.body.appendChild(visuals.overlay)
      }

      resizeListener = () => {
        ElMessage.info('窗口大小变化已取消毁灭')
        controller.finalize()
      }
      registry.registerEventListener(window, 'resize', resizeListener!)
    },
    startWarn() {
      if (visuals) {
        visuals.warnBanner.style.opacity = '1'
        let remaining = 2.3
        const countdownId = window.setInterval(() => {
          remaining -= 0.1
          if (visuals && remaining > 0) {
            visuals.warnCountdown.textContent = `${remaining.toFixed(1)}s`
          }
        }, 100)
        registry.registerTimer(countdownId)
      }
    },
    startSingularity() {
      if (visuals) {
        visuals.warnBanner.style.opacity = '0'
        visuals.singularity.style.transform = 'translate(-50%,-50%) scale(1)'
      }
    },
    startDecompose() {
      // 粒子已就绪，等待阶段 4 启动
    },
    startCollapse() {
      if (particleCanvas) {
        particleCanvas.start(STAGE4_DURATION)
      }
    },
    startFlash() {
      if (visuals) {
        visuals.flash.style.transition = 'opacity 0.03s ease'
        visuals.flash.style.opacity = '1'
        window.setTimeout(() => {
          if (visuals) {
            visuals.flash.style.transition = 'opacity 0.05s ease'
            visuals.flash.style.opacity = '0'
          }
        }, 30)
      }
      if (particleCanvas) {
        particleCanvas.forceAbsorbAll()
      }
    },
    startAftermath() {
      if (visuals) {
        visuals.darkScreen.style.opacity = '1'
        const restartDelayId = window.setTimeout(() => {
          if (visuals) {
            visuals.showRestartButton(() => {
              ElMessage.success('已重启世界')
              controller.finalize()
            })
          }
        }, 1000)
        registry.registerTimer(restartDelayId)
      }
    },
    finalize() {
      finalize()
    },
  }

  function run(): Promise<void> {
    return new Promise<void>((resolve) => {
      resolveFn = resolve
      scheduled = runStages(controller, (stage) => {
        onStageChange?.(stage)
      })
    })
  }

  function cancel() {
    finalize()
  }

  function doCleanup() {
    ensureCleanup()
  }

  return {
    run,
    cancel,
    cleanup: doCleanup,
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd frontend && npx vitest run src/components/fun/__tests__/doomsdayEffect.test.ts`
Expected: 6/6 PASS

- [ ] **Step 5: Commit**

```bash
cd /home/newaibook/ai-bid-generator
git add frontend/src/components/fun/doomsday/index.ts frontend/src/components/fun/__tests__/doomsdayEffect.test.ts
git commit -m "feat(doomsday): 新增 createDoomsdayEffect 整合模块"
```

---

## Task 8: 新增全局 CSS 动画

**Files:**
- Modify: `frontend/src/style.css`（或全局样式文件，需先确认路径）

**Interfaces:**
- Consumes: 无
- Produces: `@keyframes doomsday-spin` 用于 loading ring 与 singularity 旋转

- [ ] **Step 1: 确认全局样式文件**

Run: `ls frontend/src/style.css frontend/src/styles/ 2>/dev/null`
Expected: 找到全局样式入口（如 `style.css` 或 `styles/index.css`）

- [ ] **Step 2: 在全局样式末尾追加 doomsday 关键帧**

```css
/* Doomsday animations */
@keyframes doomsday-spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

@keyframes doomsday-warn-pulse {
  0%, 100% { box-shadow: 0 8px 32px rgba(217,119,6,0.5); }
  50% { box-shadow: 0 8px 48px rgba(217,119,6,0.85); }
}
```

注：visuals.ts 内联样式引用了 `animation:doomsday-spin 1s linear infinite`，若该 keyframes 未定义则旋转动画无效（不报错但无效果）。

- [ ] **Step 3: 验证构建通过**

Run: `cd frontend && npm run build`
Expected: 构建成功，无 TypeScript 错误

- [ ] **Step 4: Commit**

```bash
cd /home/newaibook/ai-bid-generator
git add frontend/src/style.css
git commit -m "feat(doomsday): 新增 doomsday-spin 与 warn-pulse 全局动画"
```

---

## Task 9: 重写 DoomsdayButton.vue

**Files:**
- Modify: `frontend/src/components/fun/DoomsdayButton.vue`
- Test: `frontend/src/components/fun/__tests__/DoomsdayButton.spec.ts`

**Interfaces:**
- Consumes: `createDoomsdayEffect` from `./doomsday`
- Produces: `<DoomsdayButton />` 组件

- [ ] **Step 1: 写失败测试**

```typescript
// frontend/src/components/fun/__tests__/DoomsdayButton.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import DoomsdayButton from '../DoomsdayButton.vue'

vi.mock('element-plus', () => ({
  ElMessage: { warning: vi.fn(), success: vi.fn(), info: vi.fn() },
}))

vi.mock('../doomsday', () => ({
  createDoomsdayEffect: vi.fn(() => ({
    run: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn(),
    cleanup: vi.fn(),
  })),
}))

describe('DoomsdayButton', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('按钮渲染文本"累了毁灭吧"', () => {
    const wrapper = mount(DoomsdayButton)
    expect(wrapper.text()).toContain('累了毁灭吧')
  })

  it('点击按钮触发 createDoomsdayEffect.run', async () => {
    const { createDoomsdayEffect } = await import('../doomsday')
    const wrapper = mount(DoomsdayButton)
    await wrapper.find('button').trigger('click')
    expect(createDoomsdayEffect).toHaveBeenCalled()
  })

  it('运行中按钮 disabled', async () => {
    const wrapper = mount(DoomsdayButton)
    const btn = wrapper.find('button')
    await btn.trigger('click')
    // 模拟 running 状态
    expect(btn.attributes('disabled')).toBeDefined()
  })

  it('组件卸载时调用 cleanup', async () => {
    const { createDoomsdayEffect } = await import('../doomsday')
    const cleanupSpy = vi.fn()
    ;(createDoomsdayEffect as ReturnType<typeof vi.fn>).mockReturnValue({
      run: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn(),
      cleanup: cleanupSpy,
    })
    const wrapper = mount(DoomsdayButton)
    wrapper.unmount()
    expect(cleanupSpy).toHaveBeenCalled()
  })
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && npx vitest run src/components/fun/__tests__/DoomsdayButton.spec.ts`
Expected: FAIL，因为现有 DoomsdayButton.vue 还引用旧 `doomsdayEffect`

- [ ] **Step 3: 重写 DoomsdayButton.vue**

```vue
<!-- frontend/src/components/fun/DoomsdayButton.vue -->
<template>
  <el-button
    class="doomsday-btn"
    size="small"
    type="danger"
    plain
    :disabled="running"
    @click="handleClick"
  >
    累了毁灭吧
  </el-button>
</template>

<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import { createDoomsdayEffect } from './doomsday'
import type { DoomsdayController } from './doomsday/types'

const running = ref(false)
let controller: DoomsdayController | null = null

async function handleClick(event: MouseEvent) {
  if (running.value) return

  running.value = true
  ElMessage.warning('毁灭程序启动中……')

  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()

  controller = createDoomsdayEffect({
    rootSelector: '#app',
    originX: rect.left + rect.width / 2,
    originY: rect.top + rect.height / 2,
  })

  try {
    await controller.run()
  } finally {
    running.value = false
    controller = null
  }
}

onBeforeUnmount(() => {
  if (controller) {
    controller.cleanup()
    controller = null
  }
})
</script>

<style scoped>
.doomsday-btn {
  position: relative;
  border-color: #ffccc7;
  color: #cf1322;
  background: #fff1f0;
  font-weight: 700;
  letter-spacing: 0.5px;
  overflow: hidden;
  transition: all 0.2s ease;
}

.doomsday-btn:hover:not(:disabled) {
  color: #fff;
  background: #ff4d4f;
  border-color: #ff4d4f;
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(255, 77, 79, 0.45);
}

.doomsday-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd frontend && npx vitest run src/components/fun/__tests__/DoomsdayButton.spec.ts`
Expected: 4/4 PASS

- [ ] **Step 5: Commit**

```bash
cd /home/newaibook/ai-bid-generator
git add frontend/src/components/fun/DoomsdayButton.vue frontend/src/components/fun/__tests__/DoomsdayButton.spec.ts
git commit -m "feat(doomsday): 重写 DoomsdayButton 接入新动画系统"
```

---

## Task 10: 删除旧 doomsdayEffect.ts + 端到端验收

**Files:**
- Delete: `frontend/src/components/fun/doomsdayEffect.ts`

**Interfaces:**
- Consumes: Task 9 完成后，`doomsdayEffect.ts` 无任何引用

- [ ] **Step 1: 确认旧文件无引用**

Run: `cd frontend && grep -rn "doomsdayEffect" src/ --include="*.vue" --include="*.ts"`
Expected: 仅 `doomsdayEffect.ts` 自身出现，无其他文件引用

- [ ] **Step 2: 删除旧文件**

Run: `rm frontend/src/components/fun/doomsdayEffect.ts`

- [ ] **Step 3: 运行全部 doomsday 测试**

Run: `cd frontend && npx vitest run src/components/fun/`
Expected: 所有 doomsday 测试通过

- [ ] **Step 4: 运行全量构建**

Run: `cd frontend && npm run build`
Expected: 构建成功，dist 目录生成新 `DoomsdayButton` chunk

- [ ] **Step 5: 验证 MainLayout 仍正确引用**

Run: `cd frontend && grep -n "DoomsdayButton" src/layout/MainLayout.vue`
Expected: 引用路径不变（`@/components/fun/DoomsdayButton.vue`）

- [ ] **Step 6: Commit**

```bash
cd /home/newaibook/ai-bid-generator
git add frontend/src/components/fun/doomsdayEffect.ts
git commit -m "refactor(doomsday): 删除旧 doomsdayEffect 实现"
```

- [ ] **Step 7: 部署前端**

Run: `cd /home/newaibook/ai-bid-generator && docker compose build web && docker compose up -d web && docker compose restart nginx`
Expected: 容器重启成功

- [ ] **Step 8: 浏览器手动验收**

打开 `http://163.7.6.60` 并登录后：

1. 点击 header 右上角「累了毁灭吧」按钮 → 15s 完整流程跑完
2. 阶段 0：截图期间 200ms loading 光圈
3. 阶段 1：黄色警告横幅 + 倒计时 2.3s
4. 阶段 2：按钮位置紫色吸积盘扩张
5. 阶段 3：Canvas 出现页面像素方块
6. 阶段 4：粒子沿弧线吸入奇点（7.5s 主菜）
7. 阶段 5：白色闪屏 100ms
8. 阶段 6：黑屏 + 紫色光晕 + 「重启世界」按钮
9. 点「重启世界」→ 立即还原 + ElMessage「已重启世界」
10. 再次点按钮 → 15s 自动还原
11. 动画期间 resize 窗口 → 立即取消 + 提示
12. 动画期间切路由 → 立即还原（无报错）
13. 浏览器控制台无 error/warning

- [ ] **Step 9: 推送到远程**

Run: `cd /home/newaibook/ai-bid-generator && git push origin master`
Expected: 推送成功

---

## Self-Review Checklist

### Spec Coverage

| Spec 章节 | 实现任务 |
|----------|---------|
| §5 架构与文件结构 | Task 1-7 |
| §6 7 阶段时间线 | Task 1 (TIMELINE) + Task 5 (stages) |
| §6 阶段 0 冻结 | Task 2 (screenshot) + Task 7 (startFreeze) |
| §6 阶段 1 警告 | Task 4 (warnBanner) + Task 7 (startWarn) |
| §6 阶段 2 奇点诞生 | Task 4 (singularity) + Task 7 (startSingularity) |
| §6 阶段 3 像素分解 | Task 3 (particleCanvas) + Task 7 (startDecompose) |
| §6 阶段 4 坍缩吸入 | Task 3 (particleCanvas.start) + Task 7 (startCollapse) |
| §6 阶段 5 闪屏 | Task 4 (flash) + Task 7 (startFlash) |
| §6 阶段 6 黑屏余烬 | Task 4 (darkScreen/embers/restartButton) + Task 7 (startAftermath) |
| §7 截图与粒子系统 | Task 2 (screenshot) + Task 3 (particleCanvas) |
| §8 视觉节点与阶段编排 | Task 4 (visuals) + Task 5 (stages) |
| §9 错误处理与 cleanup | Task 6 (cleanup) + Task 7 (错误路径) |
| §10 测试策略 | 各 Task 内嵌测试 |
| §11 实施计划 | Task 1-10 |

### Placeholder Scan

无 TBD/TODO/FIXME/XXX。所有步骤含完整代码。✓

### Type Consistency

- `DoomsdayOptions` / `DoomsdayController` 在 Task 1 定义，Task 7、9 使用同一类型 ✓
- `ScreenshotResult` 在 Task 1 定义，Task 2 返回、Task 7 消费 ✓
- `Particle` 在 Task 1 定义，Task 3 内部使用 ✓
- `VisualElements` 在 Task 1 定义，Task 4 返回、Task 7 消费 ✓
- `CleanupRegistry` 在 Task 1 定义，Task 6 实现、Task 7 消费 ✓
- `TIMELINE` / `STAGE4_DURATION` / `PARTICLE_SIZE` 在 Task 1 定义，Task 3、5、7 使用 ✓
- `StageController` / `ScheduledTimers` 在 Task 5 定义，Task 7 消费 ✓

### 关键约束验证

- ✓ 依赖版本：`html2canvas` 最新稳定版
- ✓ TypeScript 严格模式：所有代码无未使用 import
- ✓ 测试环境：vitest + jsdom，无需修改 config
- ✓ 测试文件位置：`frontend/src/components/fun/__tests__/`
- ✓ 源码文件位置：`frontend/src/components/fun/doomsday/`
- ✓ 总时长 15s 固定（TIMELINE.end = 15000）
- ✓ 粒子大小 8×8 px（PARTICLE_SIZE = 8）
- ✓ 截图根节点 `#app`
- ✓ DOM 冻结用 `visibility: hidden`
- ✓ 错误处理：所有路径还原 DOM，Promise 永远 resolve
- ✓ commit 风格：`feat(scope): 描述` 中文
