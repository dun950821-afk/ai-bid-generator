<!-- frontend/src/components/outline/MatrixStatusBadge.vue -->
<template>
  <el-tooltip :content="tooltipContent" placement="top">
    <span class="matrix-status-badge" :class="statusClass">
      <el-icon v-if="status === 'generating'" class="is-loading">
        <Loading />
      </el-icon>
      <el-icon v-else-if="status === 'generated'">
        <Check />
      </el-icon>
      <el-icon v-else-if="status === 'edited'">
        <Edit />
      </el-icon>
      <el-icon v-else-if="status === 'failed'">
        <Close />
      </el-icon>
      <el-icon v-else>
        <Clock />
      </el-icon>
      <span class="status-text">{{ statusDisplay }}</span>
    </span>
  </el-tooltip>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Loading, Check, Edit, Close, Clock } from '@element-plus/icons-vue'

const props = defineProps<{
  status: string
  error?: string
}>()

const statusMap: Record<string, { display: string; class: string; tooltip: string }> = {
  pending: { display: '待生成', class: 'status-pending', tooltip: '尚未生成内容责任矩阵' },
  generating: { display: '生成中', class: 'status-generating', tooltip: '正在 AI 生成矩阵' },
  generated: { display: '已生成', class: 'status-generated', tooltip: 'AI 已生成矩阵，可编辑确认' },
  edited: { display: '已编辑', class: 'status-edited', tooltip: '用户已手动编辑矩阵' },
  failed: { display: '失败', class: 'status-failed', tooltip: '矩阵生成失败' },
}

const statusClass = computed(() => statusMap[props.status]?.class || 'status-pending')
const statusDisplay = computed(() => statusMap[props.status]?.display || '未知')
const tooltipContent = computed(() => {
  const base = statusMap[props.status]?.tooltip || ''
  if (props.error) {
    return `${base}\n错误: ${props.error}`
  }
  return base
})
</script>

<style scoped>
.matrix-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.status-pending {
  background: #f0f0f0;
  color: #909399;
}

.status-generating {
  background: #e6f7ff;
  color: #1890ff;
}

.status-generated {
  background: #f6ffed;
  color: #52c41a;
}

.status-edited {
  background: #fff7e6;
  color: #fa8c16;
}

.status-failed {
  background: #fff2f0;
  color: #ff4d4f;
}

.is-loading {
  animation: rotate 1s linear infinite;
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
