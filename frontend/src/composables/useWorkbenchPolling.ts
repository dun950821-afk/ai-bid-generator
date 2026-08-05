import { ref, onMounted, onBeforeUnmount } from 'vue'
import { getWorkbenchStatus, type WorkbenchStatus } from '@/api/workbench'

const STORAGE_KEY = 'workbench:active_lots'

/** 读取 localStorage 中进行中的标段。 */
function readActiveLots(): Record<number, { step: string; since: number }> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

/** 写入进行中标段。 */
function writeActiveLot(lotId: number, step: string | null) {
  const lots = readActiveLots()
  if (step) {
    lots[lotId] = { step, since: Date.now() }
  } else {
    delete lots[lotId]
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lots))
}

/** 查询某标段是否在 localStorage 进行中（跨页面感知）。 */
export function isLotActive(lotId: number): boolean {
  return lotId in readActiveLots()
}

/** 工作台状态轮询 composable。 */
export function useWorkbenchPolling(lotId: () => number) {
  const status = ref<WorkbenchStatus | null>(null)
  const isPolling = ref(false)
  const loading = ref(false)
  const POLL_INTERVAL = 3000
  let timer: ReturnType<typeof setTimeout> | null = null

  function hasDoingStep(s: WorkbenchStatus | null): boolean {
    if (!s) return false
    const stepDoing = (Object.values(s.steps) as Array<{ status: string }>).some(
      (step) => step.status === 'doing'
    )
    if (stepDoing) return true
    // 文件解析面板：即使步骤已 done，仍可能有进行中的 AsyncTask（如手动重新抽取）
    const fileAsyncRunning = (s.steps.tender_file.files || []).some(
      (f) => f.async_task && ['pending', 'running', 'retrying'].includes(f.async_task.status)
    )
    if (fileAsyncRunning) return true
    // 大纲生成面板：有进行中的 generate_outline 任务时必须继续轮询，
    // 否则 outline 落库后会被误判为 done 停止轮询，进度条消失
    const outlineTaskRunning = (s.steps.outline_generation.tasks || []).some(
      (t) => ['pending', 'running', 'retrying'].includes(t.status)
    )
    return outlineTaskRunning
  }

  async function fetchOnce() {
    const id = lotId()
    if (!id) return
    try {
      status.value = await getWorkbenchStatus(id)
      writeActiveLot(id, hasDoingStep(status.value) ? status.value.current_step : null)
    } catch (err) {
      console.error('工作台状态获取失败:', err)
    }
  }

  function clearTimer() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  /**
   * 轮询节拍：等待上一次请求完成后再排下一次（链式 setTimeout），
   * 避免 setInterval 在请求耗时超过间隔时叠加并发请求。
   */
  async function tick() {
    timer = null
    await fetchOnce()
    if (!isPolling.value) return
    if (hasDoingStep(status.value)) {
      timer = setTimeout(tick, POLL_INTERVAL)
    } else {
      stop()
    }
  }

  function start() {
    const id = lotId()
    if (!id) return
    clearTimer()
    isPolling.value = true
    loading.value = true
    fetchOnce().finally(() => {
      loading.value = false
      // 首次拉取完成后若仍在进行中且未有计时器（如 tick 未排上），兜底排一次
      if (isPolling.value && !timer && hasDoingStep(status.value)) {
        timer = setTimeout(tick, POLL_INTERVAL)
      }
    })
    timer = setTimeout(tick, POLL_INTERVAL)
  }

  function stop() {
    clearTimer()
    isPolling.value = false
  }

  /** 页面可见性变化处理：隐藏时暂停轮询，恢复时按需重启。 */
  function handleVisibilityChange() {
    if (document.hidden) {
      clearTimer()
    } else if (isPolling.value && hasDoingStep(status.value)) {
      // 恢复可见时立即刷新一次并重启轮询
      if (!timer) {
        timer = setTimeout(tick, POLL_INTERVAL)
      }
      fetchOnce()
    }
  }

  onMounted(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange)
    start()
  })

  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    stop()
  })

  return { status, isPolling, loading, start, stop, fetchOnce }
}
