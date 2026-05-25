<!-- frontend/src/views/workflow/components/tabs/LogTab.vue -->
<template>
  <div class="log-tab" v-loading="loading">
    <el-empty v-if="logs.length === 0" description="暂无日志" />
    <div v-else class="log-list">
      <div v-for="log in logs" :key="log.id" class="log-item">
        <div class="log-header">
          <el-tag :type="getActionType(log.action)" size="small">
            {{ getActionLabel(log.action) }}
          </el-tag>
          <span class="log-time">{{ formatTime(log.created_at) }}</span>
        </div>
        <div class="log-content">
          <span class="status-change">
            {{ log.previous_status }} → {{ log.new_status }}
          </span>
          <span v-if="log.operator_name" class="operator">
            操作人：{{ log.operator_name }}
          </span>
          <p v-if="log.reason" class="reason">{{ log.reason }}</p>
          <p v-if="log.error_message" class="error">{{ log.error_message }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { workflowApi, type AuditLog } from '@/api/workflow'

const props = defineProps<{
  nodeId: number
}>()

const loading = ref(false)
const logs = ref<AuditLog[]>([])

async function loadLogs() {
  loading.value = true
  try {
    const res = await workflowApi.getNodeLogs(props.nodeId)
    logs.value = res.data.results
  } finally {
    loading.value = false
  }
}

function getActionType(action: string) {
  const map: Record<string, string> = {
    start: 'primary',
    complete: 'success',
    fail: 'danger',
    retry: 'warning',
    approve: 'success',
    reject: 'danger',
    skip: 'info',
  }
  return map[action] || 'info'
}

function getActionLabel(action: string) {
  const map: Record<string, string> = {
    start: '开始',
    complete: '完成',
    fail: '失败',
    retry: '重试',
    approve: '通过',
    reject: '驳回',
    skip: '跳过',
  }
  return map[action] || action
}

function formatTime(time: string) {
  return new Date(time).toLocaleString('zh-CN')
}

onMounted(() => {
  loadLogs()
})
</script>

<style scoped>
.log-tab {
  padding: 16px;
}

.log-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.log-item {
  padding: 12px;
  background: #f5f7fa;
  border-radius: 6px;
}

.log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.log-time {
  font-size: 12px;
  color: #909399;
}

.log-content {
  font-size: 13px;
}

.status-change {
  font-family: monospace;
  color: #606266;
}

.operator {
  margin-left: 12px;
  color: #909399;
}

.reason {
  margin: 8px 0 0;
  color: #606266;
}

.error {
  margin: 8px 0 0;
  color: #f56c6c;
}
</style>