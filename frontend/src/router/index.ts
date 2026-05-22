import { createRouter, createWebHistory } from 'vue-router'
import { me, refresh } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'

const routes = [
  { path: '/login', name: 'login', component: () => import('@/views/login/LoginView.vue'), meta: { public: true } },
  { path: '/change-password', name: 'change-password', component: () => import('@/views/auth/ChangePasswordView.vue') },
  { path: '/', redirect: '/dashboard' },
  { path: '/dashboard', name: 'dashboard', component: () => import('@/views/dashboard/DashboardView.vue') },
  {
    path: '/projects',
    name: 'projects',
    component: () => import('@/views/projects/ProjectListView.vue'),
    meta: { permission: 'project.create', allowAuthenticated: true },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

// 刷新页面后用 httpOnly Cookie 里的 refresh token 静默恢复会话；
// 用 module 级 promise 做 single-flight，避免并发导航重复 bootstrap。
let bootstrapPromise: Promise<void> | null = null

async function bootstrapAuth() {
  const auth = useAuthStore()
  if (auth.initialized) {
    return
  }
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      try {
        const refreshRes = await refresh()
        const access = refreshRes.data.access
        const meRes = await me()
        // /api/auth/me 不返回顶层 must_change_password，但 user 内嵌该字段。
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
    })()
  }
  await bootstrapPromise
}

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  if (!auth.initialized) {
    await bootstrapAuth()
  }

  if (to.meta.public) {
    return true
  }

  if (!auth.isAuthenticated) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }

  if (auth.mustChangePassword && to.path !== '/change-password') {
    return { path: '/change-password' }
  }

  const requiredPermission = to.meta.permission as string | undefined
  if (requiredPermission && !auth.hasGlobalPermission(requiredPermission) && !to.meta.allowAuthenticated) {
    return { path: '/dashboard' }
  }

  return true
})

export default router
