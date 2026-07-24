import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TIMELINE, runStages, type StageController } from '../doomsday/stages'

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

  function makeController(): StageController & Record<string, ReturnType<typeof vi.fn>> {
    return {
      startFreeze: vi.fn(),
      startWarn: vi.fn(),
      startSingularity: vi.fn(),
      startDecompose: vi.fn(),
      startCollapse: vi.fn(),
      startFlash: vi.fn(),
      startAftermath: vi.fn(),
      finalize: vi.fn(),
    }
  }

  it('阶段 0 立即执行（无 timer）', () => {
    const controller = makeController()
    runStages(controller, () => {})
    expect(controller.startFreeze).toHaveBeenCalled()
  })

  it('阶段 1 在 200ms 触发', () => {
    const controller = makeController()
    runStages(controller, () => {})
    vi.advanceTimersByTime(200)
    expect(controller.startWarn).toHaveBeenCalled()
  })

  it('阶段 4 在 4500ms 触发', () => {
    const controller = makeController()
    runStages(controller, () => {})
    vi.advanceTimersByTime(4500)
    expect(controller.startCollapse).toHaveBeenCalled()
  })

  it('阶段 5 在 12000ms 触发', () => {
    const controller = makeController()
    runStages(controller, () => {})
    vi.advanceTimersByTime(12000)
    expect(controller.startFlash).toHaveBeenCalled()
  })

  it('15s 后触发 finalize', () => {
    const controller = makeController()
    runStages(controller, () => {})
    vi.advanceTimersByTime(15000)
    expect(controller.finalize).toHaveBeenCalled()
  })

  it('onStageStart 在每个阶段开始时调用', () => {
    const controller = makeController()
    const onStageStart = vi.fn()
    runStages(controller, onStageStart)
    expect(onStageStart).toHaveBeenCalledWith(0)
    vi.advanceTimersByTime(200)
    expect(onStageStart).toHaveBeenCalledWith(1)
    vi.advanceTimersByTime(2300)
    expect(onStageStart).toHaveBeenCalledWith(2)
  })

  it('cancelTimers 取消所有未触发的 timer', () => {
    const controller = makeController()
    const scheduled = runStages(controller, () => {})
    scheduled.cancelTimers()
    vi.advanceTimersByTime(20000)
    expect(controller.startWarn).not.toHaveBeenCalled()
    expect(controller.finalize).not.toHaveBeenCalled()
  })
})
