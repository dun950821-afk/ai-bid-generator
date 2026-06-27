<template>
  <el-container class="app-shell">
    <aside class="sidebar">
      <div class="sidebar-logo">
        <div class="logo-mark">AI</div>
        <div class="logo-text">
          <strong>AI 标书生成平台</strong>
          <span>Bid Generator</span>
        </div>
      </div>

      <nav class="sidebar-nav">
        <template v-if="Array.isArray(auth.menuTree) && auth.menuTree.length">
          <div
            v-for="group in auth.menuTree"
            :key="group.group || 'main'"
            class="sidebar-group"
          >
            <div v-if="group.groupTitle" class="sidebar-group-title">
              {{ group.groupTitle }}
            </div>

            <RouterLink
              v-for="item in group.items"
              :key="item.key"
              :to="item.route"
              class="sidebar-menu-item"
              :class="{ active: isActive(item.route) }"
            >
              <el-icon class="menu-icon">
                <component :is="getIcon(item.icon)" />
              </el-icon>
              <span>{{ item.title }}</span>
            </RouterLink>
          </div>
        </template>
        <template v-else>
          <RouterLink to="/dashboard" class="sidebar-menu-item" :class="{ active: isActive('/dashboard') }">
            <el-icon class="menu-icon"><House /></el-icon>
            <span>工作台</span>
          </RouterLink>
        </template>
      </nav>
    </aside>

    <el-container>
      <el-header class="header">
        <div class="breadcrumb">当前位置：{{ $route.meta.title || '工作台' }}</div>
        <div class="user-area">
          <DoomsdayButton />
          <span class="username">{{ auth.user?.real_name || auth.user?.username }}</span>
          <el-button text @click="handleLogout">退出</el-button>
        </div>
      </el-header>

      <el-main class="main">
        <RouterView />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { useRouter, useRoute } from 'vue-router'
import { logout } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
import DoomsdayButton from '@/components/fun/DoomsdayButton.vue'
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
} from '@element-plus/icons-vue'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

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

async function handleLogout() {
  try {
    await logout()
  } finally {
    auth.clearSession()
    router.push('/login')
  }
}
</script>

<style scoped>
.app-shell {
  min-height: 100vh;
}

.sidebar {
  width: 240px;
  height: 100vh;
  background: #ffffff;
  border-right: 1px solid var(--app-border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.sidebar-logo {
  height: 72px;
  padding: 16px 18px;
  display: flex;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid #f0f2f5;
}

.logo-mark {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: linear-gradient(135deg, #2563eb, #36cfc9);
  color: #fff;
  font-weight: 700;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
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
  margin: 16px 18px 6px;
  font-size: 12px;
  font-weight: 600;
  color: #98a2b3;
  letter-spacing: 0.04em;
}

.sidebar-menu-item {
  height: 42px;
  margin: 2px 12px;
  padding: 0 14px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  color: #344054;
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
  transition: all 0.18s ease;
  cursor: pointer;
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
}

.main {
  background: var(--app-bg);
  padding: 24px;
}
</style>
