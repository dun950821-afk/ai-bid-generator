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

// 扩展的请求配置（带重试标记）
interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean
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

    if (!response || originalRequest?._retry) {
      return Promise.reject(error)
    }

    const code = response.data?.code
    if (response.status === 401 && code === 'token_expired') {
      if (originalRequest) {
        originalRequest._retry = true
      }
      try {
        const access = await refreshAccessTokenOnce()
        const auth = useAuthStore()
        auth.setAccessToken(access)
        if (originalRequest) {
          originalRequest.headers = originalRequest.headers || {}
          originalRequest.headers.Authorization = `Bearer ${access}`
          return http(originalRequest)
        }
      } catch (refreshError) {
        const auth = useAuthStore()
        auth.clearSession()
        router.push('/login')
        return Promise.reject(refreshError)
      }
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

function markHandled(error: AxiosError<ApiErrorResponse>, code: string): HandledError {
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
      .post<{ access: string }>('/api/auth/refresh')
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
