/**
 * 分页组合式函数
 *
 * 统一管理分页列表的状态和请求逻辑
 */
import { ref, reactive, onMounted, type Ref } from 'vue'

/**
 * 分页查询参数
 */
export interface PaginationParams {
  page: number
  page_size: number
  [key: string]: unknown
}

/**
 * usePagination 配置选项
 */
export interface UsePaginationOptions<T, Q extends Record<string, unknown>> {
  /** 请求函数 */
  request: (params: PaginationParams & Q) => Promise<{ data: unknown }>
  /** 默认查询条件 */
  defaultQuery?: Q
  /** 默认页码 */
  defaultPage?: number
  /** 默认每页数量 */
  defaultPageSize?: number
  /** 是否立即加载 */
  immediate?: boolean
  /** 响应数据中列表字段路径 */
  listField?: string
  /** 响应数据中总数字段路径 */
  totalField?: string
  /** 参数转换函数 */
  transformParams?: (query: Q & { page: number; pageSize: number }) => Record<string, unknown>
  /** 响应转换函数 */
  transformResponse?: (response: unknown) => { list: T[]; total: number }
  /** 成功回调 */
  onSuccess?: (data: { list: T[]; total: number }) => void
  /** 错误回调 */
  onError?: (error: Error) => void
}

/**
 * usePagination 返回值
 */
export interface UsePaginationReturn<T, Q extends Record<string, unknown>> {
  /** 列表数据 */
  list: Ref<T[]>
  /** 加载状态 */
  loading: Ref<boolean>
  /** 总数 */
  total: Ref<number>
  /** 查询参数 */
  query: Q & { page: number; pageSize: number }
  /** 错误信息 */
  error: Ref<Error | null>
  /** 获取列表 */
  fetchList: () => Promise<void>
  /** 搜索（回到第一页） */
  search: () => void
  /** 重置查询条件 */
  reset: () => void
  /** 刷新当前页 */
  refresh: () => void
  /** 处理分页变化 */
  handlePageChange: (page: number, pageSize?: number) => void
  /** 设置页码 */
  setPage: (page: number) => void
  /** 设置每页数量 */
  setPageSize: (pageSize: number) => void
}

/**
 * 从对象中根据路径获取值
 */
function getValueByPath(obj: unknown, path: string): unknown {
  if (!obj || typeof obj !== 'object') return undefined

  const keys = path.split('.')
  let current: unknown = obj

  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = (current as Record<string, unknown>)[key]
    } else {
      return undefined
    }
  }

  return current
}

/**
 * 解析响应数据
 */
function parseResponse<T>(
  response: unknown,
  listField?: string,
  totalField?: string
): { list: T[]; total: number } {
  // 如果指定了字段路径，优先使用
  if (listField && totalField) {
    const list = getValueByPath(response, listField)
    const total = getValueByPath(response, totalField)
    return {
      list: Array.isArray(list) ? list : [],
      total: typeof total === 'number' ? total : 0,
    }
  }

  // DRF 标准格式: { count, results }
  if (
    response &&
    typeof response === 'object' &&
    'results' in response &&
    'count' in response
  ) {
    const data = response as { results: unknown; count: unknown }
    return {
      list: Array.isArray(data.results) ? data.results : [],
      total: typeof data.count === 'number' ? data.count : 0,
    }
  }

  // { total, list } 格式
  if (
    response &&
    typeof response === 'object' &&
    'list' in response &&
    'total' in response
  ) {
    const data = response as { list: unknown; total: unknown }
    return {
      list: Array.isArray(data.list) ? data.list : [],
      total: typeof data.total === 'number' ? data.total : 0,
    }
  }

  // { data: { results, count } } 格式
  if (
    response &&
    typeof response === 'object' &&
    'data' in response
  ) {
    const inner = (response as { data: unknown }).data
    if (inner && typeof inner === 'object') {
      // { data: { results, count } }
      if ('results' in inner && 'count' in inner) {
        const data = inner as { results: unknown; count: unknown }
        return {
          list: Array.isArray(data.results) ? data.results : [],
          total: typeof data.count === 'number' ? data.count : 0,
        }
      }
      // { data: { items, total } }
      if ('items' in inner && 'total' in inner) {
        const data = inner as { items: unknown; total: unknown }
        return {
          list: Array.isArray(data.items) ? data.items : [],
          total: typeof data.total === 'number' ? data.total : 0,
        }
      }
      // { data: { list, total } }
      if ('list' in inner && 'total' in inner) {
        const data = inner as { list: unknown; total: unknown }
        return {
          list: Array.isArray(data.list) ? data.list : [],
          total: typeof data.total === 'number' ? data.total : 0,
        }
      }
    }
  }

  // 默认返回空
  return { list: [], total: 0 }
}

/**
 * 分页组合式函数
 *
 * @example
 * ```ts
 * const { list, loading, total, query, fetchList, search, reset } = usePagination({
 *   request: getTenderFileList,
 *   defaultQuery: { keyword: '', status: '' },
 * })
 * ```
 */
export function usePagination<
  T,
  Q extends Record<string, unknown> = Record<string, unknown>
>(options: UsePaginationOptions<T, Q>): UsePaginationReturn<T, Q> {
  const {
    request,
    defaultQuery = {} as Q,
    defaultPage = 1,
    defaultPageSize = 10,
    immediate = true,
    listField,
    totalField,
    transformParams,
    transformResponse,
    onSuccess,
    onError,
  } = options

  // 状态
  const list = ref<T[]>([]) as Ref<T[]>
  const loading = ref(false)
  const total = ref(0)
  const error = ref<Error | null>(null)

  // 查询参数（使用 reactive 以便在模板中直接绑定）
  const query = reactive({
    ...defaultQuery,
    page: defaultPage,
    pageSize: defaultPageSize,
  }) as Q & { page: number; pageSize: number }

  // 竞态保护
  let requestSeq = 0

  /**
   * 获取列表
   */
  async function fetchList(): Promise<void> {
    const currentSeq = ++requestSeq
    loading.value = true
    error.value = null

    try {
      // 构建请求参数
      let params: Record<string, unknown>
      if (transformParams) {
        params = transformParams(query)
      } else {
        params = {
          ...query,
          page: query.page,
          page_size: query.pageSize,
        }
      }

      const response = await request(params as PaginationParams & Q)

      // 竞态检查：如果这不是最新的请求，忽略结果
      if (currentSeq !== requestSeq) {
        return
      }

      // 解析响应
      let result: { list: T[]; total: number }
      if (transformResponse) {
        result = transformResponse(response.data)
      } else {
        result = parseResponse<T>(response.data, listField, totalField)
      }

      list.value = result.list
      total.value = result.total

      onSuccess?.({ list: result.list, total: result.total })
    } catch (err) {
      // 竞态检查
      if (currentSeq !== requestSeq) {
        return
      }

      const errorObj = err instanceof Error ? err : new Error(String(err))
      error.value = errorObj
      onError?.(errorObj)
    } finally {
      // 只有当前请求才更新 loading
      if (currentSeq === requestSeq) {
        loading.value = false
      }
    }
  }

  /**
   * 搜索（回到第一页）
   */
  function search(): void {
    query.page = 1
    fetchList()
  }

  /**
   * 重置查询条件
   */
  function reset(): void {
    // 重置查询条件
    Object.keys(defaultQuery).forEach((key) => {
      ;(query as Record<string, unknown>)[key] = defaultQuery[key]
    })
    // 重置分页
    query.page = defaultPage
    query.pageSize = defaultPageSize
    // 重新加载
    fetchList()
  }

  /**
   * 刷新当前页
   */
  function refresh(): void {
    fetchList()
  }

  /**
   * 处理分页变化
   */
  function handlePageChange(page: number, pageSize?: number): void {
    query.page = page
    if (pageSize !== undefined && pageSize !== query.pageSize) {
      query.pageSize = pageSize
      query.page = 1 // 切换 pageSize 时回到第一页
    }
    fetchList()
  }

  /**
   * 设置页码
   */
  function setPage(page: number): void {
    query.page = page
  }

  /**
   * 设置每页数量
   */
  function setPageSize(pageSize: number): void {
    query.pageSize = pageSize
    query.page = 1
  }

  // 立即加载
  if (immediate) {
    onMounted(() => {
      fetchList()
    })
  }

  return {
    list,
    loading,
    total,
    query,
    error,
    fetchList,
    search,
    reset,
    refresh,
    handlePageChange,
    setPage,
    setPageSize,
  }
}
