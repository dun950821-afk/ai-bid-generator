import { ElMessage } from 'element-plus'
import { captureApp } from './screenshot'
import { ParticleCanvas } from './particleCanvas'
import { createVisuals, destroyVisuals, type VisualElementsWithRestart } from './visuals'
import { runStages, type StageController, type ScheduledTimers } from './stages'
import { createCleanupRegistry, cleanup, type CleanupRegistryHandle } from './cleanup'
import {
  TIMELINE,
  STAGE4_DURATION,
  PARTICLE_SIZE,
  type DoomsdayOptions,
  type DoomsdayController,
} from './types'

interface InternalState {
  registry: CleanupRegistryHandle
  scheduled: ScheduledTimers | null
  particleCanvas: ParticleCanvas | null
  visuals: VisualElementsWithRestart | null
  resizeListener: (() => void) | null
  resolveFn: (() => void) | null
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
    resizeListener: null,
    resolveFn: null,
    finished: false,
    started: false,
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
    document.body.classList.remove('doomsday-active')
    const root = document.querySelector(rootSelector) as HTMLElement | null
    if (root) {
      root.style.visibility = ''
    }
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
    async startFreeze() {
      try {
        const result = await captureApp(rootSelector, {})
        state.visuals = createVisuals(originX, originY)
        document.body.classList.add('doomsday-active')

        const canvas = document.createElement('canvas')
        canvas.width = result.width
        canvas.height = result.height
        canvas.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:999998;'
        state.visuals.overlay.appendChild(canvas)

        state.particleCanvas = new ParticleCanvas(canvas, result.imageData, originX, originY, PARTICLE_SIZE)
        state.registry.registerDomNode(state.visuals.overlay)
      } catch {
        if (!state.visuals) {
          state.visuals = createVisuals(originX, originY)
          state.registry.registerDomNode(state.visuals.overlay)
        }
      }

      state.resizeListener = () => {
        ElMessage.info('窗口大小变化已取消毁灭')
        finalize()
      }
      state.registry.registerEventListener(window, 'resize', state.resizeListener)
    },
    startWarn() {
      if (state.visuals) {
        let remaining = 2.3
        const countdownId = window.setInterval(() => {
          remaining -= 0.1
          if (state.visuals && remaining > 0) {
            state.visuals.warnCountdown.textContent = `${remaining.toFixed(1)}s`
          }
        }, 100)
        state.registry.registerTimer(countdownId)
      }
    },
    startSingularity() {
      if (state.visuals) {
        state.visuals.warnBanner.style.opacity = '0'
        state.visuals.singularity.style.transform = 'translate(-50%,-50%) scale(1)'
      }
    },
    startDecompose() {
      // 粒子已就绪，等待阶段 4 启动
    },
    startCollapse() {
      if (state.particleCanvas) {
        state.particleCanvas.start(STAGE4_DURATION)
      }
    },
    startFlash() {
      if (state.visuals) {
        state.visuals.flash.style.transition = 'opacity 0.03s ease'
        state.visuals.flash.style.opacity = '1'
        const flashOffId = window.setTimeout(() => {
          if (state.visuals) {
            state.visuals.flash.style.transition = 'opacity 0.05s ease'
            state.visuals.flash.style.opacity = '0'
          }
        }, 30)
        state.registry.registerTimer(flashOffId)
      }
      if (state.particleCanvas) {
        state.particleCanvas.forceAbsorbAll()
      }
    },
    startAftermath() {
      if (state.visuals) {
        state.visuals.darkScreen.style.opacity = '1'
        const restartDelayId = window.setTimeout(() => {
          if (state.visuals) {
            state.visuals.showRestartButton(() => {
              ElMessage.success('已重启世界')
              finalize()
            })
          }
        }, 1000)
        state.registry.registerTimer(restartDelayId)
      }
    },
    finalize() {
      finalize()
    },
  }

  function run(): Promise<void> {
    return new Promise<void>((resolve) => {
      state.resolveFn = resolve
      state.started = true
      void state.registry
      void TIMELINE
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
