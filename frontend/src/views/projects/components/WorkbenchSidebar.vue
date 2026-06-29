<template>
  <div class="workbench-sidebar">
    <div class="sidebar-section">
      <div class="section-header">
        <span>📄 招标文件</span>
        <el-button type="primary" size="small" link @click="$emit('uploadClick')">+ 上传</el-button>
      </div>
      <div v-if="files.length" class="item-list">
        <div v-for="file in files" :key="file.id" class="sidebar-item">
          <span class="item-name">{{ file.name }}</span>
          <el-tag :type="getDisplayTagType(file.display_status)" size="small">
            {{ getDisplayLabel(file.display_status) }}
          </el-tag>
        </div>
      </div>
      <div v-else class="empty">暂无文件</div>
    </div>

    <div class="sidebar-section">
      <div class="section-header">
        <span>📝 大纲</span>
        <el-button type="primary" size="small" link @click="$emit('createOutlineClick')">+ 新建</el-button>
      </div>
      <div v-if="outlines.length" class="item-list">
        <div
          v-for="outline in outlines"
          :key="outline.id"
          class="sidebar-item clickable"
          :class="{ 'is-current': outline.is_current }"
          @click="$emit('selectOutline', outline.id)"
        >
          <span class="item-name">{{ outline.name }}</span>
          <el-tag v-if="outline.is_current" type="success" size="small">当前</el-tag>
        </div>
      </div>
      <div v-else class="empty">暂无大纲</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  mapFileDisplayStatus,
  DISPLAY_STATUS_LABEL,
  DISPLAY_STATUS_TAG_TYPE,
} from '@/utils/fileStatusMap'
import type { WorkbenchStatus } from '@/api/workbench'

const props = defineProps<{
  status: WorkbenchStatus | null
}>()

defineEmits<{
  selectOutline: [outlineId: number]
  uploadClick: []
  createOutlineClick: []
}>()

const files = computed(() => props.status?.steps.tender_file.files ?? [])
const outlines = computed(() => props.status?.steps.outline_generation.outlines ?? [])

function getDisplayLabel(status: string): string {
  return DISPLAY_STATUS_LABEL[mapFileDisplayStatus(status)]
}

function getDisplayTagType(status: string): string {
  return DISPLAY_STATUS_TAG_TYPE[mapFileDisplayStatus(status)]
}
</script>

<style scoped>
.workbench-sidebar {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
}

.sidebar-section {
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  overflow: hidden;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: var(--el-fill-color-light);
  font-size: 13px;
  font-weight: 500;
}

.item-list {
  display: flex;
  flex-direction: column;
}

.sidebar-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-top: 1px solid var(--el-border-color-lighter);
  gap: 8px;
}

.sidebar-item.clickable {
  cursor: pointer;
}

.sidebar-item.clickable:hover {
  background: var(--el-fill-color-light);
}

.sidebar-item.is-current {
  background: var(--el-color-primary-light-9);
}

.item-name {
  font-size: 13px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

.empty {
  padding: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  text-align: center;
}
</style>
