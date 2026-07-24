import { TIMELINE } from './types'

export { TIMELINE }

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
