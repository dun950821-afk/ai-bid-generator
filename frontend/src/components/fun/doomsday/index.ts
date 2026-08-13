import { ElMessage } from 'element-plus'
import { captureApp } from './screenshot'
import { ParticleCanvas } from './particleCanvas'
import { createVisuals, destroyVisuals, type VisualElementsWithRestart } from './visuals'
import { runStages, type StageController, type ScheduledTimers } from './stages'
import { createCleanupRegistry, cleanup, type CleanupRegistryHandle } from './cleanup'
import {
  STAGE2_DURATION,
  STAGE5_DURATION,
  PARTICLE_SIZE,
  type DoomsdayOptions,
  type DoomsdayController,
  type ScreenshotResult,
} from './types'

interface InternalState {
  registry: CleanupRegistryHandle
  scheduled: ScheduledTimers | null
  particleCanvas: ParticleCanvas | null
  visuals: VisualElementsWithRestart | null
  screenshotPromise: Promise<ScreenshotResult> | null
  resizeListener: (() => void) | null
  resolveFn: (() => void) | null
  rippleStarted: boolean
  finished: boolean
  started: boolean
}

export function createDoomsdayEffect(options: DoomsdayOptions = {}): DoomsdayController {
  const rootSelector = options.rootSelector ?? '#app'
  const originX = options.originX ?? window.innerWidth / 2
  const originY = options.originY ?? 80
  const onStageChange = options.onStageChange

  const state: InternalState = {
    registry: createCleanupRegistry(),
    scheduled: null,
    particleCanvas: null,
    visuals: null,
    screenshotPromise: null,
    resizeListener: null,
    resolveFn: null,
    rippleStarted: false,
    finished: false,
    started: false,
  }

  function getRoot(): HTMLElement | null {
    return document.querySelector(rootSelector) as HTMLElement | null
  }

  function restoreRoot(): void {
    const root = getRoot()
    if (root) {
      root.style.visibility = ''
      root.style.clipPath = ''
      ;(root.style as any).webkitClipPath = ''
      root.style.transition = ''
      root.style.filter = ''
      root.style.transform = ''
      root.style.opacity = ''
      root.classList.remove('doomsday-shaking')
    }
  }

  function ensureCleanup(): void {
    if (state.scheduled) {
      state.scheduled.cancelTimers()
      state.scheduled = null
    }
    if (state.particleCanvas) {
      state.particleCanvas.destroy()
      state.particleCanvas = null
    }
    if (state.visuals) {
      destroyVisuals(state.visuals)
      state.visuals = null
    }
    if (state.resizeListener) {
      window.removeEventListener('resize', state.resizeListener)
      state.resizeListener = null
    }
    restoreRoot()
    cleanup(state.registry)
    state.registry = createCleanupRegistry()
  }

  function finalize(): void {
    if (state.finished) return
    state.finished = true
    ensureCleanup()
    if (state.resolveFn) {
      state.resolveFn()
      state.resolveFn = null
    }
  }

  const controller: StageController = {
    // 0.0s 预警: 页面震动+渐暗, 警告条倒计时, 后台开始截图
    startWarn() {
      state.visuals = createVisuals(originX, originY)
      state.registry.registerDomNode(state.visuals.overlay)

      const root = getRoot()
      if (root) {
        root.style.transition = 'filter 1.4s ease'
        root.style.filter = 'saturate(0.6) brightness(0.85)'
        root.classList.add('doomsday-shaking')
      }

      // 后台截图(崩解阶段才用, 失败走降级路径)
      state.screenshotPromise = captureApp(rootSelector, {})

      // 倒计时
      let remaining = 1.6
      const countdownId = window.setInterval(() => {
        remaining -= 0.1
        if (state.visuals && remaining > 0) {
          state.visuals.warnCountdown.textContent = `${remaining.toFixed(1)}s`
        }
      }, 100)
      state.registry.registerTimer(countdownId)

      state.resizeListener = () => {
        ElMessage.info('窗口大小变化已取消毁灭')
        finalize()
      }
      state.registry.registerEventListener(window, 'resize', state.resizeListener)
    },

    // 1.7s 奇点凝聚: 页面进一步变暗模糊, 奇点在按钮处脉冲亮起
    startSingularity() {
      const root = getRoot()
      if (root) {
        root.style.filter = 'saturate(0.35) brightness(0.55) blur(1px)'
      }
      if (state.visuals) {
        state.visuals.warnBanner.style.opacity = '0'
        state.visuals.singularity.style.transform = 'translate(-50%,-50%) scale(1)'
      }
    },

    // 2.8s 崩解吸入: 隐藏真页面, 截图粒子化吸入奇点
    async startCollapse() {
      const root = getRoot()
      root?.classList.remove('doomsday-shaking')

      let result: ScreenshotResult | null = null
      try {
        result = state.screenshotPromise ? await state.screenshotPromise : null
      } catch {
        result = null
      }

      if (state.visuals) {
        state.visuals.darkScreen.style.opacity = '0.75'
      }

      if (result && state.visuals) {
        // 真页面隐藏, 粒子画布接管
        if (root) {
          root.style.visibility = 'hidden'
        }
        const canvas = document.createElement('canvas')
        canvas.width = result.width
        canvas.height = result.height
        canvas.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:999998;'
        state.visuals.overlay.appendChild(canvas)
        try {
          state.particleCanvas = new ParticleCanvas(canvas, result.imageData, originX, originY, PARTICLE_SIZE)
          state.particleCanvas.start(STAGE2_DURATION)
        } catch {
          state.particleCanvas = null
        }
      } else if (root) {
        // 降级: 截图失败 → 页面抖动缩小淡出
        root.style.transition = 'transform 0.9s ease, opacity 0.9s ease, filter 0.9s ease'
        root.style.transform = 'scale(0.9) rotate(-1.2deg)'
        root.style.opacity = '0'
        root.style.filter = 'brightness(0.3)'
      }
    },

    // 6.8s 闪光湮灭 → 全黑
    startFlash() {
      if (state.visuals) {
        // 奇点一同湮灭
        state.visuals.singularity.style.transition = 'opacity 0.15s ease, transform 0.15s ease'
        state.visuals.singularity.style.opacity = '0'
        state.visuals.singularity.style.transform = 'translate(-50%,-50%) scale(0)'
        state.visuals.flash.style.transition = 'opacity 0.04s ease'
        state.visuals.flash.style.opacity = '1'
        const flashOffId = window.setTimeout(() => {
          if (state.visuals) {
            state.visuals.flash.style.transition = 'opacity 0.06s ease'
            state.visuals.flash.style.opacity = '0'
            state.visuals.darkScreen.style.opacity = '1'
          }
        }, 60)
        state.registry.registerTimer(flashOffId)
      }
      if (state.particleCanvas) {
        state.particleCanvas.forceAbsorbAll()
      }
      const root = getRoot()
      if (root) {
        root.style.visibility = 'hidden'
        root.style.opacity = ''
        root.style.transform = ''
      }
    },

    // 6.95s "世界已毁灭"印章 + 重启按钮(点击提前重建)
    startAftermath() {
      if (!state.visuals) return
      const visuals = state.visuals
      visuals.doomText.style.animation = 'doomsday-stamp 0.45s cubic-bezier(0.2,0.9,0.3,1.1) forwards'

      const restartDelayId = window.setTimeout(() => {
        if (state.visuals) {
          state.visuals.showRestartButton(() => {
            ElMessage.success('已重启世界')
            startRippleEarly()
          })
        }
      }, 600)
      state.registry.registerTimer(restartDelayId)
    },

    // 8.2s 水波重建: clip-path 圆形扩张恢复页面
    startRipple() {
      if (state.rippleStarted) return
      state.rippleStarted = true
      doRipple()
    },

    finalize() {
      finalize()
    },
  }

  function startRippleEarly(): void {
    if (state.rippleStarted || state.finished) return
    // 取消后续定时器, 立即重建
    if (state.scheduled) {
      state.scheduled.cancelTimers()
      state.scheduled = null
    }
    state.rippleStarted = true
    doRipple()
    const finalizeId = window.setTimeout(() => finalize(), STAGE5_DURATION)
    state.registry.registerTimer(finalizeId)
  }

  function doRipple(): void {
    if (!state.visuals) return
    const visuals = state.visuals
    const root = getRoot()
    if (!root) return

    visuals.restartButton.style.display = 'none'
    visuals.rebuildText.style.opacity = '1'

    const maxRadius = Math.sqrt(
      Math.pow(window.innerWidth, 2) + Math.pow(window.innerHeight, 2)
    )
    const rippleMs = STAGE5_DURATION - 600

    // 页面从中心圆形扩张恢复(先恢复 visibility 与亮度)
    root.style.visibility = 'visible'
    root.style.filter = ''
    root.style.clipPath = `circle(0 at ${originX}px ${originY}px)`
    ;(root.style as any).webkitClipPath = `circle(0 at ${originX}px ${originY}px)`
    root.style.transition = `clip-path ${rippleMs}ms cubic-bezier(0.22,0.61,0.36,1), -webkit-clip-path ${rippleMs}ms cubic-bezier(0.22,0.61,0.36,1)`

    // 强制 reflow 后设终态(浏览器插值过渡)
    void root.offsetHeight
    root.style.clipPath = `circle(${maxRadius}px at ${originX}px ${originY}px)`
    ;(root.style as any).webkitClipPath = `circle(${maxRadius}px at ${originX}px ${originY}px)`

    // 水波环
    visuals.rippleContainer.style.opacity = '1'
    visuals.rippleContainer.style.transition = `width ${rippleMs}ms linear, height ${rippleMs}ms linear, opacity 0.4s ease`
    visuals.rippleContainer.style.transform = 'translate(-50%,-50%)'
    visuals.rippleContainer.style.width = `${maxRadius * 2}px`
    visuals.rippleContainer.style.height = `${maxRadius * 2}px`

    // 黑屏渐退
    visuals.darkScreen.style.transition = 'opacity 1.2s ease'
    visuals.darkScreen.style.opacity = '0'
    // stamp 动画 forwards 锁定 opacity, 先清动画再淡出
    visuals.doomText.style.animation = 'none'
    visuals.doomText.style.transition = 'opacity 0.4s ease'
    visuals.doomText.style.opacity = '0'

    const textFadeId = window.setTimeout(() => {
      if (state.visuals) {
        state.visuals.rebuildText.style.opacity = '0'
      }
    }, STAGE5_DURATION - 1500)
    state.registry.registerTimer(textFadeId)

    const rippleFadeId = window.setTimeout(() => {
      if (state.visuals) {
        state.visuals.rippleContainer.style.opacity = '0'
      }
    }, STAGE5_DURATION - 700)
    state.registry.registerTimer(rippleFadeId)
  }

  function run(): Promise<void> {
    return new Promise<void>((resolve) => {
      state.resolveFn = resolve
      state.started = true
      state.scheduled = runStages(controller, (stage) => {
        onStageChange?.(stage)
      })
    })
  }

  function cancel(): void {
    finalize()
  }

  function doCleanup(): void {
    ensureCleanup()
  }

  return {
    run,
    cancel,
    cleanup: doCleanup,
  }
}
