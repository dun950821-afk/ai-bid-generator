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

  it('uses existing token for me() without an unconditional refresh', async () => {
    let observedTokenAtMeCall = ''
    meMock.mockImplementation(async () => {
      observedTokenAtMeCall = useAuthStore().accessToken
      return {
        data: {
          user: { id: 1, username: 'alice', must_change_password: false },
          global_permissions: ['project.create'],
          menu_tree: [],
        },
      }
    })

    const { bootstrapAuth } = await import('@/api/bootstrap')
    await bootstrapAuth()

    expect(refreshMock).not.toHaveBeenCalled()
    expect(meMock).toHaveBeenCalledTimes(1)
    expect(observedTokenAtMeCall).toBe('EXISTING_TOKEN')
    expect(useAuthStore().accessToken).toBe('EXISTING_TOKEN')
    expect(useAuthStore().user?.username).toBe('alice')
    expect(useAuthStore().initialized).toBe(true)
  })

  it('coalesces concurrent calls with single-flight promise', async () => {
    meMock.mockResolvedValue({
      data: {
        user: { id: 1, username: 'a', must_change_password: false },
        global_permissions: [],
        menu_tree: [],
      },
    })
    const { bootstrapAuth } = await import('@/api/bootstrap')
    await Promise.all([bootstrapAuth(), bootstrapAuth(), bootstrapAuth()])
    expect(meMock).toHaveBeenCalledTimes(1)
  })

  it('keeps session on transient failure instead of clearing it', async () => {
    meMock.mockRejectedValueOnce(new Error('network'))
    const { bootstrapAuth } = await import('@/api/bootstrap')
    await bootstrapAuth()
    expect(useAuthStore().initialized).toBe(true)
    // 偶发网络失败不再清掉登录态
    expect(useAuthStore().accessToken).toBe('EXISTING_TOKEN')

    // Second call should be a fresh attempt (initialized check short-circuits unless state cleared first)
    const auth = useAuthStore()
    auth.$patch({ initialized: false })
    meMock.mockResolvedValueOnce({
      data: {
        user: { id: 1, username: 'a', must_change_password: false },
        global_permissions: [],
        menu_tree: [],
      },
    })
    await bootstrapAuth()
    expect(useAuthStore().accessToken).toBe('EXISTING_TOKEN')
    expect(useAuthStore().initialized).toBe(true)
  })
})
