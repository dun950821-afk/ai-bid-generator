// frontend/src/utils/errors.ts
/** 统一提取后端错误信息。后端响应格式：{code, message, detail} */

interface ApiErrorPayload {
  code?: string
  message?: string
  detail?: unknown
  /** 老接口约定（如 outline.views.generate_from_tender 校验失败）直接返回字符串错误 */
  error?: string
}

// 校验错误 detail 是 {字段名: [错误]}，字段名翻译为中文便于阅读
const FIELD_LABELS: Record<string, string> = {
  username: '用户名',
  password: '密码',
  old_password: '旧密码',
  new_password: '新密码',
  confirm_password: '确认密码',
  real_name: '姓名',
  email: '邮箱',
  phone: '手机号',
  department: '部门',
  captcha_token: '验证码',
  captcha_answer: '验证码答案',
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
      if (text) parts.push(`${FIELD_LABELS[key] || key}: ${text}`)
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
    if (typeof data.error === 'string' && data.error) return data.error
    if (typeof data.detail === 'string') return data.detail
    const formatted = formatDetail(data.detail)
    if (formatted) return formatted
  }
  const message = (err as Error)?.message
  if (message) return message
  return fallback
}
