<template>
  <el-container class="app-shell">
    <aside class="sidebar" :class="{ collapsed: sidebarCollapsed }">
      <div class="sidebar-logo">
        <template v-if="!sidebarCollapsed">
          <img src="/brand/logo.png" alt="国舜" class="logo-img" />
          <div class="logo-text">
            <strong>AI 标书生成平台</strong>
          </div>
        </template>
        <img v-else src="/brand/gs-icon.svg" alt="国舜" class="logo-icon-collapsed" />
      </div>

      <nav class="sidebar-nav">
        <template v-if="Array.isArray(auth.menuTree) && auth.menuTree.length">
          <div
            v-for="group in auth.menuTree"
            :key="group.group || 'main'"
            class="sidebar-group"
          >
            <div v-if="group.groupTitle && !sidebarCollapsed" class="sidebar-group-title">
              {{ group.groupTitle }}
            </div>
            <div v-else-if="group.groupTitle" class="sidebar-group-divider" />

            <RouterLink
              v-for="item in group.items"
              :key="item.key"
              :to="item.route"
              class="sidebar-menu-item"
              :class="{ active: isActive(item.route) }"
              :title="sidebarCollapsed ? item.title : undefined"
            >
              <el-icon class="menu-icon">
                <component :is="getIcon(item.icon)" />
              </el-icon>
              <span v-show="!sidebarCollapsed">{{ item.title }}</span>
            </RouterLink>
          </div>
        </template>
        <template v-else>
          <RouterLink to="/dashboard" class="sidebar-menu-item" :class="{ active: isActive('/dashboard') }">
            <el-icon class="menu-icon"><House /></el-icon>
            <span v-show="!sidebarCollapsed">工作台</span>
          </RouterLink>
        </template>
      </nav>

      <div class="sidebar-collapse" @click="toggleSidebar">
        <el-icon>
          <Expand v-if="sidebarCollapsed" />
          <Fold v-else />
        </el-icon>
        <span v-show="!sidebarCollapsed">收起菜单</span>
      </div>
    </aside>

    <el-container>
      <el-header class="header">
        <div class="breadcrumb">当前位置：{{ $route.meta.title || '工作台' }}</div>
        <div class="user-area">
          <DoomsdayButton />
          <NotificationBell />
          <el-dropdown trigger="click" @command="handleUserCommand">
            <span class="username">
              {{ auth.user?.real_name || auth.user?.username }}
              <el-icon class="el-icon--right"><ArrowDown /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="profile">
                  <el-icon><User /></el-icon>个人信息
                </el-dropdown-item>
                <el-dropdown-item command="password">
                  <el-icon><Lock /></el-icon>修改密码
                </el-dropdown-item>
                <el-dropdown-item divided command="logout">
                  <el-icon><SwitchButton /></el-icon>退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <el-main class="main">
        <RouterView />
      </el-main>
    </el-container>

    <ProfileEditDialog
      v-model:visible="showProfileDialog"
      :username="auth.user?.username || ''"
      :real-name="auth.user?.real_name"
      :email="auth.user?.email"
      :phone="auth.user?.phone"
      :department="auth.user?.department"
      @saved="handleProfileSaved"
    />
    <PasswordChangeDialog
      v-model:visible="showPasswordDialog"
      :username="auth.user?.username || ''"
    />
    <AnnouncementDialog
      :announcements="announcements"
      @finished="handleAnnouncementsFinished"
    />
  </el-container>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElNotification } from 'element-plus'
import { logout } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
import DoomsdayButton from '@/components/fun/DoomsdayButton.vue'
import NotificationBell from '@/components/notification/NotificationBell.vue'
import ProfileEditDialog from '@/components/user/ProfileEditDialog.vue'
import PasswordChangeDialog from '@/components/user/PasswordChangeDialog.vue'
import AnnouncementDialog from '@/components/announcement/AnnouncementDialog.vue'
import { getActiveAnnouncements, type AnnouncementItem } from '@/api/announcement'
import {
  House,
  Folder,
  Operation,
  FolderOpened,
  User,
  Lock,
  EditPen,
  Document,
  Setting,
  Odometer,
  Timer,
  Collection,
  ArrowDown,
  SwitchButton,
  DocumentCopy,
  OfficeBuilding,
  Notebook,
  Fold,
  Expand,
} from '@element-plus/icons-vue'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const showProfileDialog = ref(false)
const showPasswordDialog = ref(false)

const iconMap: Record<string, any> = {
  Odometer,
  House,
  Folder,
  Operation,
  FolderOpened,
  User,
  Lock,
  EditPen,
  Document,
  Setting,
  Timer,
  Collection,
  DocumentCopy,
  OfficeBuilding,
  Notebook,
}

// ============ 侧边栏折叠(状态持久化) ============
const SIDEBAR_COLLAPSED_KEY = 'sidebar-collapsed'
const sidebarCollapsed = ref(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1')

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value
  localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed.value ? '1' : '0')
}

function getIcon(iconName?: string) {
  if (!iconName) return House
  return iconMap[iconName] || House
}

function isActive(itemRoute: string) {
  const currentPath = route.path
  // 完全匹配
  if (currentPath === itemRoute) return true
  // 子路由匹配：排除其他相似前缀（如 /admin/users 不应匹配 /admin/audit）
  if (currentPath.startsWith(itemRoute + '/')) return true
  return false
}

function handleUserCommand(command: string | number | object) {
  if (command === 'profile') {
    showProfileDialog.value = true
  } else if (command === 'password') {
    showPasswordDialog.value = true
  } else if (command === 'logout') {
    handleLogout()
  }
}

function handleProfileSaved(payload: { real_name?: string; email?: string; phone?: string; department?: string }) {
  auth.updateUser(payload)
}

async function handleLogout() {
  try {
    await logout()
  } finally {
    auth.clearSession()
    router.push('/login')
  }
}

// ============ 全局「任务已被强制结束」通知 ============
// 15s 轮询最近 30 分钟被强制结束的任务；sessionStorage 记已提示集合防重复轰炸。
const FORCE_STOP_NOTIFY_KEY = 'q:{kind}:{id}'
let forceStopTimer: ReturnType<typeof setInterval> | null = null

function forceStopSeenKey(kind: string, id: number): string {
  return FORCE_STOP_NOTIFY_KEY.replace('{kind}', kind).replace('{id}', String(id))
}

async function pollForceStoppedTasks() {
  if (!auth.isAuthenticated) return
  try {
    const { getRecentForceStopped } = await import('@/api/queue')
    const res = await getRecentForceStopped(30)
    for (const item of res.data.items) {
      const key = forceStopSeenKey(item.kind, item.id)
      if (sessionStorage.getItem(key)) continue
      sessionStorage.setItem(key, '1')
      ElNotification({
        title: '任务已被强制结束',
        message: `${item.task_type_display}「${item.title}」已被强制结束，可在原页面重新发起任务`,
        type: 'warning',
        duration: 8000,
        onClick: () => router.push('/admin/queue'),
      })
    }
  } catch {
    // 轮询失败静默，下次再试
  }
}

function startForceStopPolling() {
  if (forceStopTimer) return
  pollForceStoppedTasks()
  forceStopTimer = setInterval(pollForceStoppedTasks, 15000)
}

function stopForceStopPolling() {
  if (forceStopTimer) {
    clearInterval(forceStopTimer)
    forceStopTimer = null
  }
}

onMounted(startForceStopPolling)
onBeforeUnmount(stopForceStopPolling)

// ============ 系统公告弹窗（登录后拉取待确认公告） ============
const announcements = ref<AnnouncementItem[]>([])

async function loadAnnouncements() {
  if (!auth.isAuthenticated) return
  try {
    const res = await getActiveAnnouncements()
    announcements.value = res.data.results || []
  } catch {
    // 拉取失败静默：不阻塞主流程
  }
}

function handleAnnouncementsFinished() {
  announcements.value = []
}

onMounted(loadAnnouncements)
</script>

<style scoped>
.app-shell {
  min-height: 100vh;
}

.sidebar {
  width: 180px;
  height: 100vh;
  background: #ffffff;
  border-right: 1px solid var(--app-border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  transition: width 0.2s ease;
}

.sidebar.collapsed {
  width: 64px;
}

.sidebar.collapsed .sidebar-logo {
  align-items: center;
  padding: 16px 0;
}

.sidebar.collapsed .sidebar-menu-item {
  justify-content: center;
  padding: 0;
  margin: 2px 10px;
}

.sidebar-group-divider {
  margin: 12px 16px 6px;
  border-top: 1px solid #f0f2f5;
}

.sidebar-collapse {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 44px;
  margin: 0 12px 12px;
  border-radius: 10px;
  color: #667085;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.18s ease;
  flex-shrink: 0;
}

.sidebar-collapse:hover {
  background: #f5f7fa;
  color: #2563eb;
}

.sidebar-collapse .el-icon {
  font-size: 18px;
}

.sidebar-logo {
  height: 72px;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
  border-bottom: 1px solid #f0f2f5;
}

.logo-img {
  height: 30px;
  width: auto;
  max-width: 100%;
  object-fit: contain;
  object-position: left center;
}

.logo-icon-collapsed {
  width: 34px;
  height: 34px;
  border-radius: 8px;
}

.logo-text {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}

.logo-text strong {
  font-size: 15px;
  color: #101828;
}

.logo-text span {
  margin-top: 3px;
  font-size: 12px;
  color: #98a2b3;
}

.sidebar-nav {
  flex: 1;
  padding: 12px 0;
  overflow-y: auto;
}

.sidebar-group {
  margin-bottom: 8px;
}

.sidebar-group-title {
  margin: 16px 12px 6px;
  font-size: 12px;
  font-weight: 600;
  color: #98a2b3;
  letter-spacing: 0.04em;
}

.sidebar-menu-item {
  height: 42px;
  margin: 2px 10px;
  padding: 0 10px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #344054;
  font-size: 13px;
  font-weight: 500;
  text-decoration: none;
  transition: all 0.18s ease;
  cursor: pointer;
}

.sidebar-menu-item span {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar-menu-item:hover {
  background: #f5f7fa;
  color: #2563eb;
}

.sidebar-menu-item.active {
  background: var(--app-primary-soft);
  color: var(--app-primary);
  font-weight: 600;
}

.sidebar-menu-item .menu-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.header {
  background: rgba(255, 255, 255, 0.86);
  border-bottom: 1px solid var(--app-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  backdrop-filter: blur(16px);
  height: 56px;
  padding: 0 24px;
}

.breadcrumb {
  color: var(--app-text-secondary);
  font-size: 14px;
}

.user-area {
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 14px;
}

.username {
  color: var(--app-text-primary);
  font-weight: 500;
  cursor: pointer;
  outline: none;
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.main {
  background: var(--app-bg);
  padding: 24px;
}
</style>
