import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
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
  let timer: ReturnType<typeof setInterval> | null = null

  function hasDoingStep(s: WorkbenchStatus | null): boolean {
    if (!s) return false
    return (Object.values(s.steps) as Array<{ status: string }>).some(
      (step) => step.status === 'doing'
    )
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

  function start() {
    const id = lotId()
    if (!id) return
    if (timer) clearInterval(timer)
    isPolling.value = true
    loading.value = true
    fetchOnce().finally(() => {
      loading.value = false
    })
    timer = setInterval(fetchOnce, 3000)
  }

  function stop() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    isPolling.value = false
  }

  watch(
    () => status.value,
    (s) => {
      if (!isPolling.value) return
      if (!hasDoingStep(s)) {
        stop()
      }
    },
    { deep: true }
  )

  onMounted(start)
  onBeforeUnmount(stop)

  return { status, isPolling, loading, start, stop, fetchOnce }
}
