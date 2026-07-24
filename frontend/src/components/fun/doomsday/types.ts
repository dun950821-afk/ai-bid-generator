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
  stage0_freeze: number
  stage1_warn: number
  stage2_singularity: number
  stage3_decompose: number
  stage4_collapse: number
  stage5_flash: number
  stage6_aftermath: number
  stage7_ripple: number
  end: number
}

export const TIMELINE: StageTimeline = {
  stage0_freeze: 0,
  stage1_warn: 200,
  stage2_singularity: 2200,
  stage3_decompose: 3400,
  stage4_collapse: 4200,
  stage5_flash: 12200,
  stage6_aftermath: 12350,
  stage7_ripple: 14500,
  end: 18000,
}

export const STAGE4_DURATION = TIMELINE.stage5_flash - TIMELINE.stage4_collapse
export const STAGE7_DURATION = TIMELINE.end - TIMELINE.stage7_ripple
export const PARTICLE_SIZE = 20
export const SCREENSHOT_TIMEOUT_MS = 1000
export const MAX_PARTICLES = 50000
