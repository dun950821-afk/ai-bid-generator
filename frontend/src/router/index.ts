import { createRouter, createWebHistory } from 'vue-router'
import { bootstrapAuth } from '@/api/bootstrap'
import { useAuthStore } from '@/stores/auth'

const routes = [
  { path: '/login', name: 'login', component: () => import('@/views/login/LoginView.vue'), meta: { public: true } },
  { path: '/change-password', name: 'change-password', component: () => import('@/views/auth/ChangePasswordView.vue') },
  {
    path: '/',
    component: () => import('@/layout/MainLayout.vue'),
    children: [
      { path: '', redirect: '/dashboard' },
      {
        path: 'dashboard',
        name: 'dashboard',
        component: () => import('@/views/dashboard/DashboardView.vue'),
        meta: { title: '工作台' },
      },
      {
        path: 'projects',
        name: 'projects',
        component: () => import('@/views/projects/ProjectListView.vue'),
        meta: { title: '项目管理', permission: 'project.create', allowAuthenticated: true },
      },
      {
        path: 'projects/:id',
        name: 'project-detail',
        component: () => import('@/views/projects/ProjectDetailView.vue'),
        meta: { title: '项目详情' },
      },
      {
        path: 'tender/upload',
        name: 'tender-upload',
        component: () => import('@/views/tender/TenderUploadView.vue'),
        meta: { title: '招标文件上传' },
      },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

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
