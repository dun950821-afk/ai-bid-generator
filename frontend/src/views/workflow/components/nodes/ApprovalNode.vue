<!-- frontend/src/views/workflow/components/nodes/ApprovalNode.vue -->
<template>
  <div :class="['workflow-node', 'approval-node', statusClass]">
    <div class="node-header">
      <span class="node-name">{{ data.label }}</span>
      <el-tag size="small" type="warning">审批</el-tag>
    </div>
    <div class="node-status">
      <span :class="['status-dot', props.data.status]"></span>
      <span class="status-text">{{ statusLabel }}</span>
    </div>
    <div v-if="props.data.approval_status" class="approval-info">
      <el-tag
        :type="props.data.approval_status === 'approved' ? 'success' : 'danger'"
        size="small"
      >
        {{ props.data.approval_status === 'approved' ? '已通过' : '已驳回' }}
      </el-tag>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  data: {
    label: string
    status: string
    approval_status?: string
  }
}>()

const statusClass = computed(() => `status-${props.data.status}`)

const statusLabel = computed(() => {
  const map: Record<string, string> = {
    pending: '待执行',
    in_progress: '执行中',
    completed: '已完成',
    failed: '已失败',
    waiting_approval: '待审批',
    blocked: '已阻塞',
    skipped: '已跳过',
  }
  return map[props.data.status] || props.data.status
})
</script>

<style scoped>
.workflow-node {
  background: #fff;
  border: 2px solid #e4e7ed;
  border-radius: 8px;
  padding: 12px;
  min-width: 180px;
  cursor: pointer;
  transition: all 0.2s;
}

.workflow-node:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.workflow-node.status-waiting_approval {
  border-color: #e6a23c;
  background: #fdf6ec;
}

.node-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.node-name {
  font-weight: 500;
  color: #303133;
}

.node-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #909399;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #c0c4cc;
}

.status-dot.waiting_approval {
  background: #e6a23c;
  animation: pulse 1.5s infinite;
}

.approval-info {
  margin-top: 8px;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
</style>
