/**
 * 统一处理 API 返回的列表数据，兼容多种格式。
 */

export interface PageResult<T> {
  count?: number
  next?: string | null
  previous?: string | null
  results?: T[]
}

/**
 * 将 API 返回的数据标准化为数组。
 * 支持：
 * - 直接数组
 * - 分页对象 { count, results }
 * - axios 包装的 response.data
 * - axios 包装的分页对象
 */
export function normalizeList<T>(payload: unknown): T[] {
  // 直接是数组
  if (Array.isArray(payload)) {
    return payload
  }

  // 分页对象 { count, results }
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>

    // { results: [...] }
    if (Array.isArray(obj.results)) {
      return obj.results as T[]
    }

    // axios 包装：{ data: [...] }
    if (Array.isArray(obj.data)) {
      return obj.data as T[]
    }

    // axios 包装分页：{ data: { results: [...] } }
    if (obj.data && typeof obj.data === 'object') {
      const inner = obj.data as Record<string, unknown>
      if (Array.isArray(inner.results)) {
        return inner.results as T[]
      }
    }
  }

  return []
}
