<!-- frontend/src/views/workflow/components/tabs/OverviewTab.vue -->
<template>
  <div class="overview-tab">
    <el-descriptions :column="1" border>
      <el-descriptions-item label="节点名称">{{ node?.name }}</el-descriptions-item>
      <el-descriptions-item label="状态">
        <el-tag :type="getStatusType(node?.status)" size="small">
          {{ getStatusLabel(node?.status) }}
        </el-tag>
      </el-descriptions-item>
      <el-descriptions-item label="进度">{{ node?.progress || 0 }}%</el-descriptions-item>
      <el-descriptions-item label="开始时间">{{ formatTime(node?.started_at) }}</el-descriptions-item>
      <el-descriptions-item label="完成时间">{{ formatTime(node?.completed_at) }}</el-descriptions-item>
      <el-descriptions-item v-if="node?.failure_reason" label="失败原因">
        <span class="error-text">{{ node.failure_reason }}</span>
      </el-descriptions-item>
    </el-descriptions>

    <!-- 操作按钮 -->
    <div v-if="canOperate" class="actions">
      <el-button
        v-if="node?.status === 'in_progress'"
        type="success"
        @click="handleComplete"
      >
        完成节点
      </el-button>
      <el-button
        v-if="node?.status === 'failed'"
        type="primary"
        @click="handleRetry"
      >
        重试
      </el-button>
      <template v-if="node?.status === 'waiting_approval'">
        <el-button type="success" @click="handleApprove">通过</el-button>
        <el-button type="danger" @click="handleReject">驳回</el-button>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ElMessageBox } from 'element-plus'
import type { WorkflowNodeInstance } from '@/api/workflow'
import { useWorkflowStore } from '@/stores/workflow'

const props = defineProps<{
  node: WorkflowNodeInstance | null
}>()

const workflowStore = useWorkflowStore()

const canOperate = computed(() => {
  return props.node?.status === 'in_progress' || props.node?.status === 'failed' || props.node?.status === 'waiting_approval'
})

function getStatusType(status?: string) {
  const map: Record<string, string> = {
    pending: 'info',
    in_progress: 'primary',
    completed: 'success',
    failed: 'danger',
    waiting_approval: 'warning',
    blocked: 'info',
    skipped: 'info',
  }
  return map[status || ''] || 'info'
}

function getStatusLabel(status?: string) {
  const map: Record<string, string> = {
    pending: '待执行',
    in_progress: '执行中',
    completed: '已完成',
    failed: '已失败',
    waiting_approval: '待审批',
    blocked: '已阻塞',
    skipped: '已跳过',
  }
  return map[status || ''] || status || '-'
}

function formatTime(time?: string) {
  if (!time) return '-'
  return new Date(time).toLocaleString('zh-CN')
}

async function handleComplete() {
  await ElMessageBox.confirm('确认完成此节点？', '完成节点', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'success',
  })
  if (props.node) {
    await workflowStore.completeNode(props.node.id)
  }
}

async function handleRetry() {
  const { value } = await ElMessageBox.prompt('请输入重试原因', '重试节点', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    inputPlaceholder: '可选',
  })
  if (props.node) {
    await workflowStore.retryNode(props.node.id, value || '')
  }
}

async function handleApprove() {
  const { value } = await ElMessageBox.prompt('审批意见（可选）', '审批通过', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    inputPlaceholder: '可选',
  })
  if (props.node) {
    await workflowStore.approveNode(props.node.id, value || '')
  }
}

async function handleReject() {
  const { value } = await ElMessageBox.prompt('请输入驳回原因', '审批驳回', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    inputPlaceholder: '请输入驳回原因',
    inputValidator: (val) => !!val || '请输入驳回原因',
  })
  if (props.node) {
    await workflowStore.rejectNode(props.node.id, value)
  }
}
</script>

<style scoped>
.overview-tab {
  padding: 16px;
}

.actions {
  margin-top: 16px;
  display: flex;
  gap: 8px;
}

.error-text {
  color: #f56c6c;
}
</style>