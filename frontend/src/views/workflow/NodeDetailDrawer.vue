<!-- frontend/src/views/workflow/NodeDetailDrawer.vue -->
<template>
  <el-drawer
    :model-value="visible"
    direction="rtl"
    size="480px"
    @close="handleClose"
  >
    <template #header>
      <div class="drawer-header">
        <span class="node-name">{{ node?.name }}</span>
        <el-tag :type="getStatusType(node?.status)" size="small">
          {{ getStatusLabel(node?.status) }}
        </el-tag>
      </div>
    </template>

    <el-tabs v-model="activeTab">
      <el-tab-pane label="概览" name="overview">
        <OverviewTab :node="node" />
      </el-tab-pane>
      <el-tab-pane label="产物" name="artifact">
        <ArtifactTab v-if="nodeId" :node-id="nodeId" />
      </el-tab-pane>
      <el-tab-pane label="日志" name="log">
        <LogTab v-if="nodeId" :node-id="nodeId" />
      </el-tab-pane>
    </el-tabs>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { WorkflowNodeInstance } from '@/api/workflow'
import OverviewTab from './components/tabs/OverviewTab.vue'
import ArtifactTab from './components/tabs/ArtifactTab.vue'
import LogTab from './components/tabs/LogTab.vue'

const props = defineProps<{
  node: WorkflowNodeInstance | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const activeTab = ref('overview')

const visible = computed(() => !!props.node)
const nodeId = computed(() => props.node?.id)

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

function handleClose() {
  emit('close')
}
</script>

<style scoped>
.drawer-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.node-name {
  font-size: 16px;
  font-weight: 500;
}
</style>