<!-- frontend/src/views/workflow/WorkflowHeader.vue -->
<template>
  <div class="workflow-header">
    <div class="header-left">
      <el-button link @click="goBack">
        <el-icon><ArrowLeft /></el-icon>
        返回
      </el-button>
      <h2 class="title">{{ lotName }}</h2>
      <el-tag :type="getStatusType(workflowStatus)" size="small">
        {{ getStatusLabel(workflowStatus) }}
      </el-tag>
      <span v-if="progress > 0" class="progress">进度: {{ progress }}%</span>
    </div>
    <div class="header-right">
      <el-button v-if="canStart" type="primary" @click="handleStart">
        启动流程
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft } from '@element-plus/icons-vue'

const props = defineProps<{
  lotName: string
  workflowStatus: string
  progress: number
}>()

const emit = defineEmits<{
  (e: 'start'): void
}>()

const router = useRouter()

const canStart = computed(() => props.workflowStatus === 'not_started')

function getStatusType(status: string) {
  const map: Record<string, string> = {
    not_started: 'info',
    in_progress: 'primary',
    completed: 'success',
    failed: 'danger',
    paused: 'warning',
  }
  return map[status] || 'info'
}

function getStatusLabel(status: string) {
  const map: Record<string, string> = {
    not_started: '未开始',
    in_progress: '进行中',
    completed: '已完成',
    failed: '已失败',
    paused: '已暂停',
  }
  return map[status] || status
}

function handleStart() {
  emit('start')
}

function goBack() {
  router.back()
}
</script>

<style scoped>
.workflow-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.title {
  margin: 0;
  font-size: 18px;
  font-weight: 500;
}

.progress {
  font-size: 14px;
  color: #909399;
}
</style>