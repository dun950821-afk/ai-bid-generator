import axios from 'axios'
import type { AxiosError, InternalAxiosRequestConfig } from 'axios'
import router from '@/router'
import { useAuthStore } from '@/stores/auth'
import { getCookie } from '@/utils/cookie'

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
  async (error: AxiosError<any>) => {
    const response = error.response
    const originalRequest: any = error.config

    if (!response || originalRequest?._retry) {
      return Promise.reject(error)
    }

    const code = response.data?.code
    if (response.status === 401 && code === 'token_expired') {
      originalRequest._retry = true
      try {
        const access = await refreshAccessTokenOnce()
        const auth = useAuthStore()
        auth.setAccessToken(access)
        originalRequest.headers = originalRequest.headers || {}
        originalRequest.headers.Authorization = `Bearer ${access}`
        return http(originalRequest)
      } catch (refreshError) {
        const auth = useAuthStore()
        auth.clearSession()
        router.push('/login')
        return Promise.reject(refreshError)
      }
    }

    if (response.status === 403 && code === 'must_change_password') {
      router.push('/change-password')
      // 拦截器已经做了路由跳转，调用方再 ElMessage.error 就是双重提示。
      // 标记 isHandled 让上层用 isHandledError 静默忽略；继续 reject 是
      // 因为业务调用方仍需要终止 await 链。
      return Promise.reject(markHandled(error, 'must_change_password'))
    }

    if (response.status === 401 && code !== 'token_expired') {
      const auth = useAuthStore()
      auth.clearSession()
      router.push('/login')
      // 同理：登出 + /login 跳转已由拦截器完成。
      return Promise.reject(markHandled(error, code || 'unauthorized'))
    }

    return Promise.reject(error)
  },
)

function markHandled(error: AxiosError<any>, code: string): AxiosError<any> {
  ;(error as any).isHandled = true
  ;(error as any).handledCode = code
  return error
}

export function isHandledError(err: unknown): boolean {
  return Boolean((err as any)?.isHandled)
}

async function refreshAccessTokenOnce(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = http
      .post('/api/auth/refresh')
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
