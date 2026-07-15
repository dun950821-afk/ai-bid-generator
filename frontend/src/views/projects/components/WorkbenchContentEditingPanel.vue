<template>
  <div class="panel">
    <div class="panel-topline" style="--step-color: #FA8C16" />

    <div class="panel-header">
      <div class="panel-title">
        <el-icon :size="20" color="#FA8C16"><Edit /></el-icon>
        <span>内容编辑</span>
      </div>
      <div class="panel-desc">{{ visibleOutlines.length }} 个大纲</div>
    </div>

    <!-- 当前大纲高亮卡片 -->
    <div v-if="currentOutline" class="current-card">
      <div class="current-head">
        <el-icon :size="18" color="#FA8C16"><Edit /></el-icon>
        <span class="current-label">当前编辑大纲</span>
      </div>
      <div class="current-name">{{ currentOutline.name }}</div>
      <div class="current-tags">
        <el-tag type="success" size="small" effect="light">当前版本</el-tag>
        <el-tag :type="getStatusType(currentOutline.status)" size="small" effect="plain">
          {{ getStatusLabel(currentOutline.status) }}
        </el-tag>
      </div>
      <el-button type="primary" @click="goEdit(currentOutline.id)">进入编辑</el-button>
    </div>

    <!-- 其他大纲列表 -->
    <div v-if="otherOutlines.length" class="other-section">
      <div class="section-title">其他大纲</div>
      <div class="other-list">
        <div v-for="outline in otherOutlines" :key="outline.id" class="other-item">
          <div class="other-info">
            <span class="other-name">{{ outline.name }}</span>
            <el-tag :type="getStatusType(outline.status)" size="small" effect="plain">
              {{ getStatusLabel(outline.status) }}
            </el-tag>
          </div>
          <el-button size="small" link @click="goEdit(outline.id)">编辑</el-button>
        </div>
      </div>
    </div>

    <el-empty
      v-if="!currentOutline && !otherOutlines.length"
      description="暂无大纲，请先在「大纲生成」步骤创建"
      :image-size="60"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { Edit } from '@element-plus/icons-vue'
import type { WorkbenchStatus, WorkbenchOutline } from '@/api/workbench'

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
.panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.panel-topline {
  height: 2px;
  background: var(--step-color, var(--el-color-primary));
  border-radius: 1px;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
}

.panel-desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.current-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px;
  border: 1px solid #FA8C16;
  border-left: 4px solid #FA8C16;
  border-radius: 8px;
  background: var(--el-color-warning-light-9);
}

.current-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #FA8C16;
  font-weight: 500;
}

.current-name {
  font-size: 18px;
  font-weight: 600;
}

.current-tags {
  display: flex;
  gap: 8px;
}

.other-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-title {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.other-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.other-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  background: var(--el-fill-color-blank);
}

.other-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.other-name {
  font-size: 14px;
}
</style>
