<template>
  <WorkbenchPanelShell
    title="内容编辑"
    :desc="contentSummary"
    :icon="Edit"
    :theme-color="STEP_THEME.content_editing.color"
    :theme-bg-color="STEP_THEME.content_editing.bgColor"
  >
    <!-- 当前大纲 -->
    <div v-if="currentOutline" class="current-outline-card">
      <div class="current-badge">
        <el-icon :size="16"><Edit /></el-icon>
        <span>当前编辑大纲</span>
      </div>
      <div class="current-body">
        <div class="current-icon">
          <el-icon :size="24"><Connection /></el-icon>
        </div>
        <div class="current-info">
          <div class="current-name">{{ currentOutline.name }}</div>
          <div class="current-meta">
            <el-tag :type="getStatusType(currentOutline.status)" size="small" effect="plain">
              {{ getStatusLabel(currentOutline.status) }}
            </el-tag>
            <el-tag type="success" size="small" effect="light">当前版本</el-tag>
          </div>
        </div>
        <el-button type="primary" size="large" @click="goEdit(currentOutline.id)">
          进入编辑器
        </el-button>
      </div>
    </div>

    <!-- 其他大纲 -->
    <div v-if="otherOutlines.length" class="other-outlines">
      <div class="section-header">
        <span class="section-title">其他大纲</span>
        <span class="section-count">{{ otherOutlines.length }} 个</span>
      </div>
      <div class="other-list">
        <div v-for="outline in otherOutlines" :key="outline.id" class="other-item">
          <div class="other-icon">
            <el-icon :size="18"><Connection /></el-icon>
          </div>
          <div class="other-info">
            <div class="other-name">{{ outline.name }}</div>
            <el-tag :type="getStatusType(outline.status)" size="small" effect="plain">
              {{ getStatusLabel(outline.status) }}
            </el-tag>
          </div>
          <el-button size="small" link type="primary" @click="goEdit(outline.id)">编辑</el-button>
        </div>
      </div>
    </div>

    <el-empty
      v-if="!currentOutline && !otherOutlines.length"
      description="暂无大纲，请先在「大纲生成」步骤创建"
      :image-size="80"
    />
  </WorkbenchPanelShell>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { Edit, Connection } from '@element-plus/icons-vue'
import type { WorkbenchStatus, WorkbenchOutline } from '@/api/workbench'
import WorkbenchPanelShell from './WorkbenchPanelShell.vue'
import { STEP_THEME } from './workbenchTheme'

const props = defineProps<{
  lotId: number
  projectId: number
  status: WorkbenchStatus | null
}>()

const router = useRouter()

const outlines = computed<WorkbenchOutline[]>(() => props.status?.steps.outline_generation.outlines ?? [])
// 过滤掉 generating 状态的 outline：章节尚未写入，不应进入编辑
const visibleOutlines = computed(() => outlines.value.filter(o => o.status !== 'generating'))
const currentOutline = computed(() => visibleOutlines.value.find(o => o.is_current) ?? null)
const otherOutlines = computed(() => visibleOutlines.value.filter(o => !o.is_current))

const contentSummary = computed(() => {
  const n = visibleOutlines.value.length
  return n ? `${n} 个大纲` : '暂无大纲'
})

function goEdit(outlineId: number) {
  router.push(`/outlines/${outlineId}`)
}

function getStatusType(status: string): string {
  const map: Record<string, string> = { draft: 'info', active: 'success', archived: 'info' }
  return map[status] || 'info'
}

function getStatusLabel(status: string): string {
  const map: Record<string, string> = { draft: '草稿', active: '活跃', archived: '已归档' }
  return map[status] || status
}
</script>

<style scoped>
.current-outline-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  border: 1px solid var(--el-color-warning-light-5);
  border-left: 4px solid var(--el-color-warning);
  border-radius: 12px;
  background: var(--el-color-warning-light-9);
}

.current-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-color-warning);
}

.current-body {
  display: flex;
  align-items: center;
  gap: 16px;
}

.current-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: var(--el-color-warning-light-7);
  color: var(--el-color-warning);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.current-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.current-name {
  font-size: 18px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.current-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.other-outlines {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.section-count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.other-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.other-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  background: var(--el-bg-color);
  transition: all 0.2s ease;
}

.other-item:hover {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.other-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.other-info {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.other-name {
  font-size: 14px;
  color: var(--el-text-color-primary);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>
