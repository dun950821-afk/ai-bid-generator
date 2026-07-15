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
      // 在 fetchOnce 完成后直接根据状态决定启停，避免依赖 watch 异步触发
      // （watch 在 stop 后因 status 不再变化而成为死代码）
      if (hasDoingStep(status.value)) {
        if (!isPolling.value || !timer) {
          start()
        }
      } else if (isPolling.value) {
        stop()
      }
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
      // 兜底：极端情况下 status 变化但 fetchOnce 未触发启停（例如外部直接赋值 status）
      // 才走这里的兜底启停。正常路径已在 fetchOnce 内完成启停判断。
      if (!isPolling.value) {
        if (hasDoingStep(s)) {
          start()
        }
        return
      }
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
