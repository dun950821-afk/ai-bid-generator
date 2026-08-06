import { me } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'

let bootstrapPromise: Promise<void> | null = null

export async function bootstrapAuth() {
  const auth = useAuthStore()
  if (auth.initialized) return
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      // 如果没有持久化的 token，直接返回
      if (!auth.accessToken) {
        auth.initialized = true
        return
      }
      // 先用现有 access token 验证会话；过期时 http.ts 拦截器会静默刷新
      // 并重试 me()，成功后 accessToken 已被更新。
      try {
        const meRes = await me()
        auth.setSession({
          access: auth.accessToken,
          user: meRes.data.user,
          global_permissions: meRes.data.global_permissions,
          menu_tree: meRes.data.menu_tree,
          must_change_password: meRes.data.user.must_change_password,
        })
      } catch {
        // 保留现有登录态：网络抖动/后端重启等偶发失败不踢人；
        // 401 语义由 http.ts 拦截器处理（刷新 / 会话真正失效才踢出）。
        auth.initialized = true
      }
    })().finally(() => {
      bootstrapPromise = null
    })
  }
  await bootstrapPromise
}
