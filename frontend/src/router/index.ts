import { createRouter, createWebHistory } from 'vue-router'
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

router.beforeEach((to) => {
  const auth = useAuthStore()

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
