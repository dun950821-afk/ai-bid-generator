import { TIMELINE } from './types'

export { TIMELINE }

export interface StageController {
  startWarn(): void
  startSingularity(): void
  startCollapse(): void
  startFlash(): void
  startAftermath(): void
  startRipple(): void
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

  controller.startWarn()
  onStageStart(0)

  timerIds.push(
    window.setTimeout(() => {
      controller.startSingularity()
      onStageStart(1)
    }, TIMELINE.stage1_singularity)
  )

  timerIds.push(
    window.setTimeout(() => {
      controller.startCollapse()
      onStageStart(2)
    }, TIMELINE.stage2_collapse)
  )

  timerIds.push(
    window.setTimeout(() => {
      controller.startFlash()
      onStageStart(3)
    }, TIMELINE.stage3_flash)
  )

  timerIds.push(
    window.setTimeout(() => {
      controller.startAftermath()
      onStageStart(4)
    }, TIMELINE.stage4_aftermath)
  )

  timerIds.push(
    window.setTimeout(() => {
      controller.startRipple()
      onStageStart(5)
    }, TIMELINE.stage5_ripple)
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
