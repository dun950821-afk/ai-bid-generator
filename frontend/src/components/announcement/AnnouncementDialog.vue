<!-- 系统公告弹窗：登录后首次展示待确认公告
  右上角两个按钮：不再提示（dismiss，永久隐藏）/ 关闭（seen，本次会话关闭）
  多条公告依次展示；全部处理完（或列表为空）后 emit finished 由父组件关闭 -->
<template>
  <el-dialog
    :model-value="visible"
    :show-close="false"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    width="560px"
    class="announcement-dialog"
    append-to-body
  >
    <template #header>
      <div class="announcement-header">
        <div class="announcement-title-wrap">
          <el-icon :size="20" class="announcement-icon"><BellFilled /></el-icon>
          <span class="announcement-title">系统公告</span>
          <span v-if="announcements.length > 1" class="announcement-count">
            {{ currentIndex + 1 }} / {{ announcements.length }}
          </span>
        </div>
        <div class="announcement-actions">
          <el-button size="small" plain @click="handleDismiss">不再提示</el-button>
          <el-button size="small" type="primary" @click="handleClose">关闭</el-button>
        </div>
      </div>
    </template>

    <div class="announcement-body" v-loading="acting">
      <template v-if="current">
        <h3 class="announcement-item-title">{{ current.title }}</h3>
        <div class="announcement-content">{{ current.content }}</div>
        <div class="announcement-meta">
          <span v-if="current.published_at">发布时间：{{ formatTime(current.published_at) }}</span>
        </div>
      </template>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { BellFilled } from '@element-plus/icons-vue'
import { ackAnnouncement, type AnnouncementItem } from '@/api/announcement'

const props = defineProps<{
  announcements: AnnouncementItem[]
}>()

const emit = defineEmits<{
  (e: 'finished'): void
}>()

const currentIndex = ref(0)
const acting = ref(false)

const current = computed(() => props.announcements[currentIndex.value])

// 列表变化（如登录后拉取）时从头开始
watch(
  () => props.announcements.length,
  () => {
    currentIndex.value = 0
  },
)

const visible = computed(() => props.announcements.length > 0 && currentIndex.value < props.announcements.length)

function formatTime(value: string | null): string {
  if (!value) return ''
  const d = new Date(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function handleDismiss() {
  const item = current.value
  if (!item) return
  acting.value = true
  try {
    await ackAnnouncement(item.id, 'dismiss')
  } catch {
    // 失败不阻塞：直接跳过当前公告，避免反复弹窗卡死
  } finally {
    acting.value = false
    advance()
  }
}

async function handleClose() {
  const item = current.value
  if (!item) return
  acting.value = true
  try {
    await ackAnnouncement(item.id, 'seen')
  } catch {
    // 同上
  } finally {
    acting.value = false
    advance()
  }
}

function advance() {
  if (currentIndex.value + 1 >= props.announcements.length) {
    emit('finished')
  } else {
    currentIndex.value += 1
  }
}
</script>

<style scoped>
.announcement-dialog :deep(.el-dialog__header) {
  padding-bottom: 4px;
}

.announcement-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding-right: 8px;
}

.announcement-title-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.announcement-icon {
  color: #e6a23c;
}

.announcement-title {
  font-size: 16px;
  font-weight: 600;
}

.announcement-count {
  font-size: 12px;
  color: #909399;
  background: #f4f4f5;
  border-radius: 8px;
  padding: 1px 8px;
}

.announcement-body {
  min-height: 120px;
  max-height: 45vh;
  overflow-y: auto;
  padding: 4px 2px;
}

.announcement-item-title {
  margin: 0 0 10px;
  font-size: 15px;
  color: #303133;
}

.announcement-content {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.7;
  color: #606266;
  font-size: 14px;
}

.announcement-meta {
  margin-top: 12px;
  font-size: 12px;
  color: #c0c4cc;
  text-align: right;
}
</style>
