<template>
  <div class="project-overview">
    <el-row :gutter="20">
      <el-col :span="16">
        <el-card shadow="never">
          <template #header>基本信息</template>
          <el-descriptions :column="2" border>
            <el-descriptions-item label="项目名称">{{ project?.name }}</el-descriptions-item>
            <el-descriptions-item label="状态">
              <el-tag :type="getStatusTagType(project?.status)" size="small">
                {{ getStatusLabel(project?.status) }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="创建人">{{ project?.created_by_name }}</el-descriptions-item>
            <el-descriptions-item label="创建时间">{{ formatDate(project?.created_at) }}</el-descriptions-item>
            <el-descriptions-item label="描述" :span="2">
              {{ project?.description || '暂无描述' }}
            </el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card shadow="never">
          <template #header>统计</template>
          <el-statistic title="标段数量" :value="project?.lot_count || 0" />
          <el-statistic title="成员数量" :value="project?.member_count || 0" style="margin-top: 20px" />
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import type { Project } from '@/api/project'

defineProps<{
  project: Project | null
  permissions: string[]
}>()

function getStatusLabel(status?: string) {
  const map: Record<string, string> = {
    active: '进行中',
    archived: '已归档',
    closed: '已关闭',
  }
  return status ? map[status] || status : '-'
}

function getStatusTagType(status?: string) {
  const map: Record<string, string> = {
    active: 'primary',
    archived: 'info',
    closed: 'danger',
  }
  return status ? map[status] || 'info' : 'info'
}

function formatDate(dateStr?: string) {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}
</script>

<style scoped>
.project-overview {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
</style>
