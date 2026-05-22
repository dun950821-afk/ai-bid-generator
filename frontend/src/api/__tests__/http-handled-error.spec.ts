import axios, { AxiosError } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

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

describe('http handled error contract', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    pushMock.mockReset()
    vi.resetModules()
  })

  afterEach(() => {
    vi.resetModules()
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

  it('401 token_invalid rejection carries isHandled=true', async () => {
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
})

// 保留对 axios 引用，避免 TS 把 import 当 unused 删掉。
void axios
