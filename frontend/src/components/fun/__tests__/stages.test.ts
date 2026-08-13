import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TIMELINE, runStages, type StageController } from '../doomsday/stages'

describe('stages', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('TIMELINE 常量符合 11.2s 时间线', () => {
    expect(TIMELINE.stage0_warn).toBe(0)
    expect(TIMELINE.stage1_singularity).toBe(1700)
    expect(TIMELINE.stage2_collapse).toBe(2800)
    expect(TIMELINE.stage3_flash).toBe(6800)
    expect(TIMELINE.stage4_aftermath).toBe(6950)
    expect(TIMELINE.stage5_ripple).toBe(8200)
    expect(TIMELINE.end).toBe(11200)
  })

  function makeController(): StageController & Record<string, ReturnType<typeof vi.fn>> {
    return {
      startWarn: vi.fn(),
      startSingularity: vi.fn(),
      startCollapse: vi.fn(),
      startFlash: vi.fn(),
      startAftermath: vi.fn(),
      startRipple: vi.fn(),
      finalize: vi.fn(),
    }
  }

  it('阶段 0 立即执行（无 timer）', () => {
    const controller = makeController()
    runStages(controller, () => {})
    expect(controller.startWarn).toHaveBeenCalled()
  })

  it('阶段 1 在 1700ms 触发', () => {
    const controller = makeController()
    runStages(controller, () => {})
    vi.advanceTimersByTime(1700)
    expect(controller.startSingularity).toHaveBeenCalled()
  })

  it('阶段 2 在 2800ms 触发', () => {
    const controller = makeController()
    runStages(controller, () => {})
    vi.advanceTimersByTime(2800)
    expect(controller.startCollapse).toHaveBeenCalled()
  })

  it('阶段 3 在 6800ms 触发', () => {
    const controller = makeController()
    runStages(controller, () => {})
    vi.advanceTimersByTime(6800)
    expect(controller.startFlash).toHaveBeenCalled()
  })

  it('阶段 5 在 8200ms 触发', () => {
    const controller = makeController()
    runStages(controller, () => {})
    vi.advanceTimersByTime(8200)
    expect(controller.startRipple).toHaveBeenCalled()
  })

  it('11.2s 后触发 finalize', () => {
    const controller = makeController()
    runStages(controller, () => {})
    vi.advanceTimersByTime(11200)
    expect(controller.finalize).toHaveBeenCalled()
  })

  it('onStageStart 在每个阶段开始时调用', () => {
    const controller = makeController()
    const onStageStart = vi.fn()
    runStages(controller, onStageStart)
    expect(onStageStart).toHaveBeenCalledWith(0)
    vi.advanceTimersByTime(1700)
    expect(onStageStart).toHaveBeenCalledWith(1)
    vi.advanceTimersByTime(1100)
    expect(onStageStart).toHaveBeenCalledWith(2)
  })

  it('cancelTimers 取消所有未触发的 timer', () => {
    const controller = makeController()
    const scheduled = runStages(controller, () => {})
    scheduled.cancelTimers()
    vi.advanceTimersByTime(20000)
    expect(controller.startSingularity).not.toHaveBeenCalled()
    expect(controller.finalize).not.toHaveBeenCalled()
  })
})
