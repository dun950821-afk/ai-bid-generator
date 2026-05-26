<template>
  <el-container class="app-shell">
    <el-aside width="248px" class="sidebar">
      <div class="logo">
        <div class="logo-mark">AI</div>
        <div>
          <strong>AI 标书生成系统</strong>
          <span>Bid Platform</span>
        </div>
      </div>

      <el-menu router :default-active="$route.path" class="menu">
        <template v-if="Array.isArray(auth.menuTree) && auth.menuTree.length">
          <el-menu-item v-for="item in auth.menuTree" :key="item.key" :index="item.route">
            {{ item.title }}
          </el-menu-item>
        </template>
        <template v-else>
          <!-- 菜单必须由后端 menu_tree 驱动；fallback 写死 /projects、
               /tender/upload 会绕过权限控制，故只保留 /dashboard。 -->
          <el-menu-item index="/dashboard">工作台</el-menu-item>
        </template>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="header">
        <div class="breadcrumb">当前位置：{{ $route.meta.title || '工作台' }}</div>
        <div class="user-area">
          <span>{{ auth.user?.real_name || auth.user?.username }}</span>
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
import { useRouter } from 'vue-router'
import { logout } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()

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
  background: #ffffff;
  border-right: 1px solid var(--app-border);
  padding: 18px 12px;
}
.logo {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 10px 12px 24px;
}
.logo-mark {
  width: 40px;
  height: 40px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  background: var(--app-primary);
  color: white;
  font-weight: 800;
}
.logo span {
  display: block;
  color: var(--app-text-secondary);
  font-size: 12px;
  margin-top: 2px;
}
.menu {
  border-right: 0;
}
.header {
  background: rgba(255, 255, 255, 0.86);
  border-bottom: 1px solid var(--app-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  backdrop-filter: blur(16px);
}
.breadcrumb {
  color: var(--app-text-secondary);
}
.user-area {
  display: flex;
  align-items: center;
  gap: 12px;
}
.main {
  background: var(--app-bg);
  padding: 24px;
}
</style>
