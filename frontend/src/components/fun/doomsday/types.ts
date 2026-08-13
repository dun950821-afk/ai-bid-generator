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
  doomText: HTMLDivElement
  restartButton: HTMLButtonElement
  rippleContainer: HTMLDivElement
  rebuildText: HTMLDivElement
}

export interface CleanupRegistry {
  registerTimer(id: number): void
  registerRaf(id: number): void
  registerEventListener(target: EventTarget, type: string, listener: EventListenerOrEventListenerObject): void
  registerDomNode(node: HTMLElement): void
  registerRestore(fn: () => void): void
}

export interface StageTimeline {
  stage0_warn: number
  stage1_singularity: number
  stage2_collapse: number
  stage3_flash: number
  stage4_aftermath: number
  stage5_ripple: number
  end: number
}

/**
 * 重构后的 11s 编排:
 * 0.0s 预警(页面震动+渐暗+倒计时, 后台截图)
 * 1.7s 奇点凝聚(页面进一步变暗模糊)
 * 2.8s 崩解吸入(真页面隐藏, 截图粒子化吸入奇点, 4s)
 * 6.8s 闪光湮灭 → 黑屏 + "世界已毁灭"印章
 * 8.2s 水波重建(点击"重启世界"可提前)
 * 11.2s 清理还原
 */
export const TIMELINE: StageTimeline = {
  stage0_warn: 0,
  stage1_singularity: 1700,
  stage2_collapse: 2800,
  stage3_flash: 6800,
  stage4_aftermath: 6950,
  stage5_ripple: 8200,
  end: 11200,
}

export const STAGE2_DURATION = TIMELINE.stage3_flash - TIMELINE.stage2_collapse
export const STAGE5_DURATION = TIMELINE.end - TIMELINE.stage5_ripple
export const PARTICLE_SIZE = 24
export const SCREENSHOT_TIMEOUT_MS = 1000
export const MAX_PARTICLES = 50000
