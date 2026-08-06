import axios, { AxiosError } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'

// 把 router 替换成无副作用 stub：拦截器会 router.push('/login') /
// '/change-password'，测试里不需要真正路由。
const pushMock = vi.fn()
vi.mock('@/router', () => ({
  default: { push: (...args: unknown[]) => pushMock(...args) },
}))

function makeRejectingAdapter(status: number, data: any) {
  // axios 在 adapter return 路径不会主动按 validateStatus 转 reject；最稳妥
  // 的造模拟响应的方式是直接抛 AxiosError，复刻真实非 2xx 走到响应错误
  // 拦截器的链路。
  return async (config: any) => {
    const response = {
      data,
      status,
      statusText: String(status),
      headers: {},
      config,
    }
    throw new AxiosError(
      `Request failed with status code ${status}`,
      String(status),
      config,
      undefined,
      response as any,
    )
  }
}

// 可编程 adapter：按请求配置（url / _isRefresh 标记）决定响应。
function makeScriptedAdapter(
  handler: (config: any) => { status: number; data: any },
) {
  return async (config: any) => {
    const { status, data } = handler(config)
    if (status >= 200 && status < 300) {
      return { data, status, statusText: String(status), headers: {}, config }
    }
    const response = {
      data,
      status,
      statusText: String(status),
      headers: {},
      config,
    }
    throw new AxiosError(
      `Request failed with status code ${status}`,
      String(status),
      config,
      undefined,
      response as any,
    )
  }
}

describe('http handled error contract', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    pushMock.mockReset()
    vi.resetModules()
  })

  afterEach(() => {
    vi.resetModules()
    vi.useRealTimers()
  })

  it('must_change_password rejection carries isHandled=true', async () => {
    const { http, isHandledError } = await import('@/api/http')
    http.defaults.adapter = makeRejectingAdapter(403, {
      code: 'must_change_password',
      message: '需要修改密码',
    })

    let captured: any = null
    try {
      await http.get('/api/anything')
      throw new Error('should have rejected')
    } catch (err) {
      captured = err
    }

    expect(isHandledError(captured)).toBe(true)
    expect(captured.handledCode).toBe('must_change_password')
    expect(pushMock).toHaveBeenCalledWith('/change-password')
  })

  it('401 token_invalid on business request clears session and redirects', async () => {
    const { http, isHandledError } = await import('@/api/http')
    http.defaults.adapter = makeRejectingAdapter(401, {
      code: 'token_invalid',
      message: '令牌无效',
    })

    let captured: any = null
    try {
      await http.get('/api/anything')
      throw new Error('should have rejected')
    } catch (err) {
      captured = err
    }

    expect(isHandledError(captured)).toBe(true)
    expect(pushMock).toHaveBeenCalledWith('/login')
  })

  it('plain 500 stays unhandled so caller can show its own toast', async () => {
    const { http, isHandledError } = await import('@/api/http')
    http.defaults.adapter = makeRejectingAdapter(500, { message: '服务器错误' })

    let captured: any = null
    try {
      await http.get('/api/anything')
      throw new Error('should have rejected')
    } catch (err) {
      captured = err
    }

    expect(captured).toBeInstanceOf(Error)
    expect(isHandledError(captured)).toBe(false)
  })

  it('retries original request after a successful silent refresh', async () => {
    const { http } = await import('@/api/http')
    let businessCalls = 0
    http.defaults.adapter = makeScriptedAdapter((config: any) => {
      if (config._isRefresh) {
        return { status: 200, data: { access: 'NEW_ACCESS' } }
      }
      businessCalls += 1
      if (businessCalls === 1) {
        return { status: 401, data: { code: 'token_expired', message: '过期' } }
      }
      return { status: 200, data: { ok: true } }
    })

    const res = await http.get('/api/anything')

    expect(res.data).toEqual({ ok: true })
    expect(useAuthStore().accessToken).toBe('NEW_ACCESS')
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('does not recursively retry when refresh itself returns token_expired', async () => {
    const { http } = await import('@/api/http')
    let refreshCalls = 0
    http.defaults.adapter = makeScriptedAdapter((config: any) => {
      if (config._isRefresh) {
        refreshCalls += 1
        return { status: 401, data: { code: 'token_expired', message: '过期' } }
      }
      return { status: 401, data: { code: 'token_expired', message: '过期' } }
    })

    let captured: any = null
    try {
      await http.get('/api/anything')
    } catch (err) {
      captured = err
    }

    // 只发了一次 refresh，没有无限递归；失败进入冷却，不踢出。
    expect(refreshCalls).toBe(1)
    expect(pushMock).not.toHaveBeenCalled()
    expect(captured).toBeInstanceOf(Error)
  })

  it('first refresh failure keeps session (backoff, no kick)', async () => {
    const { http } = await import('@/api/http')
    let refreshCalls = 0
    http.defaults.adapter = makeScriptedAdapter((config: any) => {
      if (config._isRefresh) {
        refreshCalls += 1
        // 模拟多 tab 并发刷新被 BLACKLIST_AFTER_ROTATION 拉黑
        return { status: 401, data: { code: 'token_invalid', message: '已拉黑' } }
      }
      return { status: 401, data: { code: 'token_expired', message: '过期' } }
    })

    try {
      await http.get('/api/anything')
    } catch {
      /* expected */
    }

    expect(refreshCalls).toBe(1)
    expect(pushMock).not.toHaveBeenCalled()
    expect(useAuthStore().accessToken).toBe('') // 未登录态下无 token 可清，重点是没被踢
  })

  it('respects backoff window: no refresh attempts during cooldown', async () => {
    vi.useFakeTimers()
    const { http } = await import('@/api/http')
    let refreshCalls = 0
    http.defaults.adapter = makeScriptedAdapter((config: any) => {
      if (config._isRefresh) {
        refreshCalls += 1
        return { status: 401, data: { code: 'token_invalid', message: '已拉黑' } }
      }
      return { status: 401, data: { code: 'token_expired', message: '过期' } }
    })

    const attempt = async () => {
      try {
        await http.get('/api/anything')
      } catch {
        /* expected */
      }
    }

    await attempt() // 第 1 次失败 → 冷却 30s
    expect(refreshCalls).toBe(1)
    await attempt() // 冷却期内：直接拒绝，不再尝试 refresh
    expect(refreshCalls).toBe(1)
    vi.advanceTimersByTime(31_000)
    await attempt() // 冷却结束：再试 refresh → 第 2 次失败
    expect(refreshCalls).toBe(2)
  })

  it('redirects to login only after repeated refresh failures', async () => {
    vi.useFakeTimers()
    const { http, isHandledError } = await import('@/api/http')
    http.defaults.adapter = makeScriptedAdapter((config: any) => {
      if (config._isRefresh) {
        return { status: 401, data: { code: 'token_invalid', message: '已拉黑' } }
      }
      return { status: 401, data: { code: 'token_expired', message: '过期' } }
    })

    const attempt = async () => {
      let captured: any = null
      try {
        await http.get('/api/anything')
      } catch (err) {
        captured = err
      }
      return captured
    }

    const captured1 = await attempt() // fail 1
    expect(pushMock).not.toHaveBeenCalled()
    vi.advanceTimersByTime(31_000)
    const captured2 = await attempt() // fail 2
    expect(pushMock).not.toHaveBeenCalled()
    vi.advanceTimersByTime(31_000)
    const captured3 = await attempt() // fail 3 → 踢出

    expect(pushMock).toHaveBeenCalledTimes(1)
    expect(pushMock).toHaveBeenCalledWith('/login')
    expect(isHandledError(captured1)).toBe(false)
    expect(isHandledError(captured2)).toBe(false)
    expect(isHandledError(captured3)).toBe(true)
    expect(captured3.handledCode).toBe('session_expired')
  })
})

// 保留对 axios 引用，避免 TS 把 import 当 unused 删掉。
void axios
