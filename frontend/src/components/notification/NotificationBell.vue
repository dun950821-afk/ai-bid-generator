<!-- 通知铃铛：未读角标 + 通知列表（30s 轮询） -->
<template>
  <el-popover
    placement="bottom-end"
    :width="360"
    trigger="click"
    popper-class="notification-popover"
    @show="handleOpen"
  >
    <template #reference>
      <div class="bell-wrapper">
        <el-badge :value="unreadCount" :hidden="unreadCount === 0" :max="99" class="bell-badge">
          <el-icon :size="20" class="bell-icon"><Bell /></el-icon>
        </el-badge>
      </div>
    </template>

    <div class="notification-panel">
      <div class="panel-header">
        <span class="panel-title">通知</span>
        <el-button
          v-if="unreadCount > 0"
          text
          size="small"
          type="primary"
          :loading="markingAll"
          @click="handleReadAll"
        >
          全部已读
        </el-button>
      </div>

      <div v-loading="loading" class="notification-list">
        <template v-if="notifications.length > 0">
          <div
            v-for="item in notifications"
            :key="item.id"
            class="notification-item"
            :class="{ unread: !item.is_read }"
            @click="handleRead(item)"
          >
            <el-icon
              class="kind-icon"
              :class="item.kind === 'system' ? 'is-system' : ''"
            >
              <component :is="item.kind === 'system' ? InfoFilled : Promotion" />
            </el-icon>
            <div class="item-body">
              <div class="item-title">
                {{ item.title }}
                <span v-if="!item.is_read" class="unread-dot" />
              </div>
              <div v-if="item.message" class="item-message">{{ item.message }}</div>
              <div class="item-time">{{ formatRelativeTime(item.created_at) }}</div>
            </div>
          </div>
        </template>
        <el-empty v-else description="暂无通知" :image-size="60" />
      </div>
    </div>
  </el-popover>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Bell, Promotion, InfoFilled } from '@element-plus/icons-vue'
import {
  listNotifications,
  getUnreadCount,
  markAllRead,
  markRead,
  type NotificationItem,
} from '@/api/notifications'
import { useAuthStore } from '@/stores/auth'

const POLL_INTERVAL_MS = 30_000
const LIST_LIMIT = 20

const auth = useAuthStore()
const unreadCount = ref(0)
const notifications = ref<NotificationItem[]>([])
const loading = ref(false)
const markingAll = ref(false)

let pollTimer: ReturnType<typeof setInterval> | null = null

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  if (diff < minute) return '刚刚'
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`
  return new Date(dateStr).toLocaleDateString('zh-CN')
}

async function refreshUnread() {
  if (!auth.isAuthenticated) return
  try {
    const res = await getUnreadCount()
    unreadCount.value = res.data.unread_count
  } catch {
    // 轮询失败静默，下轮再试
  }
}

async function loadList() {
  if (!auth.isAuthenticated) return
  loading.value = true
  try {
    const res = await listNotifications({ limit: LIST_LIMIT })
    notifications.value = res.data.results
    unreadCount.value = res.data.unread_count
  } catch {
    // 打开弹层时网络失败，保留上次列表
  } finally {
    loading.value = false
  }
}

function handleOpen() {
  loadList()
}

async function handleRead(item: NotificationItem) {
  if (item.is_read) return
  try {
    await markRead(item.id)
    item.is_read = true
    if (unreadCount.value > 0) unreadCount.value -= 1
  } catch {
    ElMessage.error('操作失败，请重试')
  }
}

async function handleReadAll() {
  markingAll.value = true
  try {
    await markAllRead()
    notifications.value.forEach((item) => (item.is_read = true))
    unreadCount.value = 0
    ElMessage.success('已全部标记为已读')
  } catch {
    ElMessage.error('操作失败，请重试')
  } finally {
    markingAll.value = false
  }
}

onMounted(() => {
  refreshUnread()
  pollTimer = setInterval(refreshUnread, POLL_INTERVAL_MS)
})

onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer)
})
</script>

<style scoped>
.bell-wrapper {
  display: inline-flex;
  align-items: center;
  padding: 4px;
  cursor: pointer;
  color: var(--el-text-color-primary);
}

.bell-wrapper:hover {
  color: var(--el-color-primary);
}

.bell-badge {
  display: inline-flex;
}

.notification-panel {
  display: flex;
  flex-direction: column;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px 8px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.panel-title {
  font-weight: 600;
  font-size: 14px;
}

.notification-list {
  max-height: 380px;
  overflow-y: auto;
  min-height: 60px;
}

.notification-item {
  display: flex;
  gap: 10px;
  padding: 10px 4px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  cursor: pointer;
}

.notification-item:hover {
  background: var(--el-fill-color-light);
}

.notification-item:last-child {
  border-bottom: none;
}

.kind-icon {
  margin-top: 2px;
  color: var(--el-color-primary);
  font-size: 18px;
}

.kind-icon.is-system {
  color: var(--el-color-warning);
}

.item-body {
  flex: 1;
  min-width: 0;
}

.item-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  display: flex;
  align-items: center;
  gap: 6px;
}

.item-message {
  font-size: 12px;
  color: var(--el-text-color-regular);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-time {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}

.unread .item-title {
  font-weight: 700;
}

.unread-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--el-color-danger);
  flex-shrink: 0;
}
</style>
