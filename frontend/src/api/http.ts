import axios from 'axios'
import type { AxiosError, InternalAxiosRequestConfig } from 'axios'
import router from '@/router'
import { useAuthStore } from '@/stores/auth'
import { getCookie } from '@/utils/cookie'

// API 错误响应类型
interface ApiErrorResponse {
  code?: string
  message?: string
  detail?: string
}

// 扩展的请求配置（带重试/refresh 标记）
interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean
  _isRefresh?: boolean
}

// 扩展的错误类型（带处理标记）
interface HandledError extends AxiosError<ApiErrorResponse> {
  isHandled?: boolean
  handledCode?: string
}

export const http = axios.create({
  baseURL: '',
  withCredentials: true,
  timeout: 30000,
})

let refreshPromise: Promise<string> | null = null
// 静默刷新失败后的冷却窗口：窗口内不再尝试刷新，避免请求风暴；
// 连续失败达到阈值才判定会话失效踢出登录。多 tab 并发刷新时后到者的
// refresh 会被 BLACKLIST_AFTER_ROTATION 拉黑而失败，冷却重试可自愈。
let refreshBackoffUntil = 0
let refreshFailCount = 0
const REFRESH_BACKOFF_MS = 30_000
const REFRESH_MAX_FAILURES = 3

function attachAuth(config: InternalAxiosRequestConfig) {
  const auth = useAuthStore()
  if (auth.accessToken) {
    config.headers.Authorization = `Bearer ${auth.accessToken}`
  }

  const csrfToken = getCookie('csrf_token')
  if (csrfToken) {
    config.headers['X-CSRF-Token'] = csrfToken
  }

  return config
}

http.interceptors.request.use(attachAuth)

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorResponse>) => {
    const response = error.response
    const originalRequest = error.config as RetryableRequestConfig | undefined

    // refresh 自身失败不递归处理（_isRefresh），交给 handleTokenExpired
    // 统一降级；_retry 重试请求再次失败同样直接透传。
    if (!response || originalRequest?._retry || originalRequest?._isRefresh) {
      return Promise.reject(error)
    }

    const code = response.data?.code
    if (response.status === 401 && code === 'token_expired') {
      return handleTokenExpired(error, originalRequest)
    }

    if (response.status === 403 && code === 'must_change_password') {
      router.push('/change-password')
      return Promise.reject(markHandled(error, 'must_change_password'))
    }

    if (response.status === 401 && code !== 'token_expired') {
      const auth = useAuthStore()
      auth.clearSession()
      router.push('/login')
      return Promise.reject(markHandled(error, code || 'unauthorized'))
    }

    return Promise.reject(error)
  },
)

async function handleTokenExpired(
  error: AxiosError<ApiErrorResponse>,
  originalRequest: RetryableRequestConfig | undefined,
): Promise<never> {
  if (!refreshAllowed()) {
    // 冷却期内：不清会话、不刷新，请求失败交由页面层处理，避免请求风暴。
    return Promise.reject(error)
  }
  if (originalRequest) {
    originalRequest._retry = true
  }
  try {
    const access = await refreshAccessTokenOnce()
    refreshFailCount = 0
    refreshBackoffUntil = 0
    const auth = useAuthStore()
    auth.setAccessToken(access)
    if (originalRequest) {
      originalRequest.headers = originalRequest.headers || {}
      originalRequest.headers.Authorization = `Bearer ${access}`
      return http(originalRequest)
    }
    return Promise.reject(error)
  } catch (refreshError) {
    refreshFailCount += 1
    refreshBackoffUntil = Date.now() + REFRESH_BACKOFF_MS
    if (refreshFailCount >= REFRESH_MAX_FAILURES) {
      const auth = useAuthStore()
      auth.clearSession()
      router.push('/login')
      return Promise.reject(markHandled(refreshError, 'session_expired'))
    }
    return Promise.reject(refreshError)
  }
}

function refreshAllowed(): boolean {
  return Date.now() >= refreshBackoffUntil
}

function markHandled(error: unknown, code: string): HandledError {
  const handledError = error as HandledError
  handledError.isHandled = true
  handledError.handledCode = code
  return handledError
}

export function isHandledError(err: unknown): boolean {
  return Boolean((err as HandledError)?.isHandled)
}

export function getHandledCode(err: unknown): string | undefined {
  return (err as HandledError)?.handledCode
}

async function refreshAccessTokenOnce(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = http
      .post<{ access: string }>('/api/auth/refresh', null, { _isRefresh: true } as RetryableRequestConfig)
      .then((res) => {
        const access = res.data.access
        if (!access) {
          throw new Error('refresh response missing access')
        }
        return access
      })
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}
