import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'

const refreshMock = vi.fn()
const meMock = vi.fn()

vi.mock('@/api/auth', () => ({
  refresh: (...args: unknown[]) => refreshMock(...args),
  me: (...args: unknown[]) => meMock(...args),
}))

describe('bootstrapAuth', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    refreshMock.mockReset()
    meMock.mockReset()
    vi.resetModules()
    // 模拟持久化的 token（bootstrapAuth 在无 token 时直接 return）
    useAuthStore().$patch({ accessToken: 'EXISTING_TOKEN' })
  })

  it('sets accessToken before calling me() so attachAuth sees the Bearer', async () => {
    refreshMock.mockResolvedValue({ data: { access: 'ACCESS_FROM_REFRESH' } })

    let observedTokenAtMeCall = ''
    meMock.mockImplementation(async () => {
      observedTokenAtMeCall = useAuthStore().accessToken
      return {
        data: {
          user: { id: 1, username: 'alice', must_change_password: false },
          global_permissions: [],
          menu_tree: [],
        },
      }
    })

    const { bootstrapAuth } = await import('@/api/bootstrap')
    await bootstrapAuth()

    expect(refreshMock).toHaveBeenCalledTimes(1)
    expect(meMock).toHaveBeenCalledTimes(1)
    expect(observedTokenAtMeCall).toBe('ACCESS_FROM_REFRESH')
    expect(useAuthStore().accessToken).toBe('ACCESS_FROM_REFRESH')
    expect(useAuthStore().initialized).toBe(true)
  })

  it('coalesces concurrent calls with single-flight promise', async () => {
    refreshMock.mockResolvedValue({ data: { access: 'A' } })
    meMock.mockResolvedValue({
      data: {
        user: { id: 1, username: 'a', must_change_password: false },
        global_permissions: [],
        menu_tree: [],
      },
    })
    const { bootstrapAuth } = await import('@/api/bootstrap')
    await Promise.all([bootstrapAuth(), bootstrapAuth(), bootstrapAuth()])
    expect(refreshMock).toHaveBeenCalledTimes(1)
    expect(meMock).toHaveBeenCalledTimes(1)
  })

  it('resets single-flight promise so retry is possible after failure', async () => {
    refreshMock.mockRejectedValueOnce(new Error('network'))
    const { bootstrapAuth } = await import('@/api/bootstrap')
    await bootstrapAuth()
    expect(useAuthStore().initialized).toBe(true) // clearSession sets initialized=true
    expect(useAuthStore().accessToken).toBe('')

    // Second call should be a fresh attempt (initialized check short-circuits unless state cleared first)
    const auth = useAuthStore()
    auth.$patch({ initialized: false })
    // clearSession 已清掉 token，重试前需重新持有持久化 token（模拟用户重新登录或 token 恢复）
    auth.$patch({ accessToken: 'EXISTING_TOKEN' })
    refreshMock.mockResolvedValueOnce({ data: { access: 'RETRY_ACCESS' } })
    meMock.mockResolvedValueOnce({
      data: {
        user: { id: 1, username: 'a', must_change_password: false },
        global_permissions: [],
        menu_tree: [],
      },
    })
    await bootstrapAuth()
    expect(useAuthStore().accessToken).toBe('RETRY_ACCESS')
  })
})
