import { me, refresh } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'

let bootstrapPromise: Promise<void> | null = null

export async function bootstrapAuth() {
  const auth = useAuthStore()
  if (auth.initialized) return
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      try {
        const refreshRes = await refresh()
        const access = refreshRes.data.access
        // 必须在 me() 之前写入 token，否则 http.ts attachAuth 读不到，me() 401 被踢回登录页。
        auth.setAccessToken(access)
        const meRes = await me()
        auth.setSession({
          access,
          user: meRes.data.user,
          global_permissions: meRes.data.global_permissions,
          menu_tree: meRes.data.menu_tree,
          must_change_password: meRes.data.user.must_change_password,
        })
      } catch {
        auth.clearSession()
      }
    })().finally(() => {
      bootstrapPromise = null
    })
  }
  await bootstrapPromise
}
