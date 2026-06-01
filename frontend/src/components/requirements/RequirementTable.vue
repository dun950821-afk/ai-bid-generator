<template>
  <el-table
    :data="requirements"
    v-loading="loading"
    empty-text="暂无条款数据"
    :max-height="600"
    @row-click="handleRowClick"
  >
    <el-table-column prop="requirement_no" label="编号" width="100" />
    <el-table-column prop="requirement_type_display" label="类型" width="100">
      <template #default="{ row }">
        <el-tag size="small" :type="getTypeTag(row.requirement_type)">
          {{ row.requirement_type_display }}
        </el-tag>
      </template>
    </el-table-column>
    <el-table-column prop="title" label="标题" min-width="150">
      <template #default="{ row }">
        <span class="title-text">{{ row.title || truncate(row.content, 50) }}</span>
      </template>
    </el-table-column>
    <el-table-column prop="mandatory_level_display" label="强制程度" width="90">
      <template #default="{ row }">
        <el-tag
          size="small"
          :type="getMandatoryTag(row.mandatory_level)"
        >
          {{ row.mandatory_level_display }}
        </el-tag>
      </template>
    </el-table-column>
    <el-table-column prop="risk_level_display" label="风险" width="80">
      <template #default="{ row }">
        <el-tag
          size="small"
          :type="getRiskTag(row.risk_level)"
        >
          {{ row.risk_level_display }}
        </el-tag>
      </template>
    </el-table-column>
    <el-table-column prop="response_strategy_display" label="响应策略" width="100">
      <template #default="{ row }">
        <span>{{ row.response_strategy_display }}</span>
      </template>
    </el-table-column>
    <el-table-column prop="owner_role_display" label="负责人" width="90" />
    <el-table-column prop="source_section_path" label="来源章节" min-width="120">
      <template #default="{ row }">
        <span class="section-text">{{ row.source_section_path || '-' }}</span>
      </template>
    </el-table-column>
    <el-table-column prop="is_active" label="状态" width="80">
      <template #default="{ row }">
        <el-tag size="small" :type="row.is_active ? 'success' : 'info'">
          {{ row.is_active ? '活跃' : '已停用' }}
        </el-tag>
      </template>
    </el-table-column>
    <el-table-column label="操作" width="160" fixed="right">
      <template #default="{ row }">
        <el-button size="small" link @click.stop="$emit('view', row)">
          详情
        </el-button>
        <el-button
          v-if="canManage"
          size="small"
          link
          type="primary"
          @click.stop="$emit('edit', row)"
        >
          编辑
        </el-button>
        <el-button
          v-if="canManage && row.is_active"
          size="small"
          link
          type="warning"
          @click.stop="$emit('deactivate', row)"
        >
          停用
        </el-button>
        <el-button
          v-if="canManage && !row.is_active"
          size="small"
          link
          type="success"
          @click.stop="$emit('reactivate', row)"
        >
          启用
        </el-button>
      </template>
    </el-table-column>
  </el-table>
</template>

<script setup lang="ts">
import type { Requirement } from '@/api/requirements'

defineProps<{
  requirements: Requirement[]
  loading: boolean
  canManage?: boolean
}>()

defineEmits<{
  view: [requirement: Requirement]
  edit: [requirement: Requirement]
  deactivate: [requirement: Requirement]
  reactivate: [requirement: Requirement]
}>()

function handleRowClick(_row: Requirement) {
  // 点击行时触发详情查看（暂不实现）
}

function truncate(text: string, length: number): string {
  if (!text) return ''
  return text.length > length ? text.slice(0, length) + '...' : text
}

function getTypeTag(type: string): string {
  const map: Record<string, string> = {
    qualification: 'danger',
    tech_req: 'primary',
    scoring: 'success',
    commercial: 'warning',
    legal: 'danger',
    submission: 'info',
    schedule: 'info',
    material: '',
    format: '',
    clarification: 'warning',
    other: '',
  }
  return map[type] || ''
}

function getMandatoryTag(level: string): string {
  const map: Record<string, string> = {
    mandatory: 'danger',
    important: 'warning',
    optional: '',
    unknown: 'info',
  }
  return map[level] || 'info'
}

function getRiskTag(level: string): string {
  const map: Record<string, string> = {
    high: 'danger',
    medium: 'warning',
    low: 'success',
    unknown: 'info',
  }
  return map[level] || 'info'
}
</script>

<style scoped>
.title-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.section-text {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>