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
        path: 'tender/files/:fileId',
        name: 'tender-file-detail',
        component: () => import('@/views/tender/TenderFileDetailView.vue'),
        meta: { title: '文件详情' },
      },
      {
        path: 'tender/files/:fileId/parsed',
        redirect: '/tender/files/:fileId',
      },
      {
        path: 'lots/:id/workflow',
        name: 'lot-workflow',
        component: () => import('@/views/workflow/WorkflowBoard.vue'),
        meta: { title: '工作流' },
      },
      {
        path: 'workflows/templates',
        name: 'workflow-templates',
        component: () => import('@/views/workflow/TemplateListView.vue'),
        meta: { title: '流程模板' },
      },
      {
        path: 'workflows/templates/:id',
        name: 'workflow-template-edit',
        component: () => import('@/views/workflow/TemplateEditView.vue'),
        meta: { title: '编辑模板' },
      },
      {
        path: 'admin/users',
        name: 'admin-users',
        component: () => import('@/views/admin/UserListView.vue'),
        meta: { title: '用户管理', permission: 'user.manage' },
      },
      {
        path: 'admin/roles',
        name: 'admin-roles',
        component: () => import('@/views/admin/RoleListView.vue'),
        meta: { title: '角色权限', permission: 'role.manage' },
      },
      {
        path: 'admin/prompts',
        name: 'admin-prompts',
        component: () => import('@/views/admin/PromptListView.vue'),
        meta: { title: '提示词管理', permission: 'prompt_template.manage' },
      },
      {
        path: 'admin/prompts/:id',
        name: 'admin-prompt-detail',
        component: () => import('@/views/admin/PromptVersionView.vue'),
        meta: { title: '版本管理', permission: 'prompt_template.manage' },
      },
      {
        path: 'knowledge',
        name: 'knowledge-list',
        component: () => import('@/views/knowledge/KnowledgeBaseListView.vue'),
        meta: { title: '知识库管理', permission: 'knowledge.manage' },
      },
      {
        path: 'knowledge/:id',
        name: 'knowledge-detail',
        component: () => import('@/views/knowledge/KnowledgeBaseDetailView.vue'),
        meta: { title: '知识库详情', permission: 'knowledge.manage' },
      },
      {
        path: 'admin/audit',
        name: 'admin-audit',
        component: () => import('@/views/admin/AuditLogView.vue'),
        meta: { title: '操作审计', permission: 'audit.view' },
      },
      {
        path: 'admin/settings',
        name: 'admin-settings',
        component: () => import('@/views/admin/SystemSettingsView.vue'),
        meta: { title: '系统设置', permission: 'system_settings.manage' },
      },
      {
        path: 'playground',
        name: 'playground',
        component: () => import('@/views/playground/PromptPlaygroundView.vue'),
        meta: { title: 'Prompt Playground', permission: 'prompt_template.manage' },
      },
      {
        path: 'playground/runs',
        name: 'playground-runs',
        component: () => import('@/views/playground/PromptRunListView.vue'),
        meta: { title: '运行记录', permission: 'prompt_template.manage' },
      },
      {
        path: 'playground/runs/:id',
        name: 'playground-run-detail',
        component: () => import('@/views/playground/PromptRunDetailView.vue'),
        meta: { title: '运行详情', permission: 'prompt_template.manage' },
      },
      {
        path: 'outlines',
        name: 'outlines',
        component: () => import('@/views/outline/OutlineListView.vue'),
        meta: { title: '大纲管理', permission: 'outline.view' },
      },
      {
        path: 'outlines/:outlineId',
        name: 'outline-detail',
        component: () => import('@/views/outline/OutlineDetailView.vue'),
        meta: { title: '大纲详情', permission: 'outline.view' },
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
