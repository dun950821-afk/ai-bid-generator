// frontend/src/utils/errors.ts
/** 统一提取后端错误信息。后端响应格式：{code, message, detail} */

interface ApiErrorPayload {
  code?: string
  message?: string
  detail?: unknown
}

function formatDetail(detail: unknown): string {
  if (!detail) return ''
  if (typeof detail === 'string') return detail
  if (detail instanceof Error) return detail.message
  if (Array.isArray(detail)) {
    return detail.map((d) => formatDetail(d)).filter(Boolean).join('; ')
  }
  if (typeof detail === 'object') {
    const parts: string[] = []
    for (const [key, value] of Object.entries(detail as Record<string, unknown>)) {
      const text = formatDetail(value)
      if (text) parts.push(`${key}: ${text}`)
    }
    return parts.join('; ')
  }
  return String(detail)
}

export function extractApiError(err: unknown, fallback = '操作失败'): string {
  if (!err) return fallback
  // axios response
  const response = (err as { response?: { data?: ApiErrorPayload } }).response
  const data = response?.data
  if (data) {
    if (data.message && data.detail && typeof data.detail === 'object') {
      const formatted = formatDetail(data.detail)
      return formatted ? `${data.message}：${formatted}` : data.message
    }
    if (data.message) return data.message
    if (typeof data.detail === 'string') return data.detail
    const formatted = formatDetail(data.detail)
    if (formatted) return formatted
  }
  const message = (err as Error)?.message
  if (message) return message
  return fallback
}
