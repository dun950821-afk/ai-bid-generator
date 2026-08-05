<template>
  <div class="workbench-panel">
    <div class="panel-header">
      <div class="panel-title-wrap">
        <div class="panel-icon" :style="{ background: themeBgColor, color: themeColor }">
          <el-icon :size="20"><component :is="icon" /></el-icon>
        </div>
        <div class="panel-title-text">
          <h3 class="panel-title">{{ title }}</h3>
          <p v-if="desc" class="panel-desc">{{ desc }}</p>
        </div>
      </div>
      <div v-if="$slots.actions" class="panel-actions">
        <slot name="actions" />
      </div>
    </div>
    <div class="panel-body">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Component } from 'vue'

defineProps<{
  title: string
  desc?: string
  icon: Component
  themeColor: string
  themeBgColor: string
}>()
</script>

<style scoped>
.workbench-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.panel-title-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.panel-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.panel-title-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.panel-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  line-height: 1.3;
}

.panel-desc {
  margin: 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  line-height: 1.4;
}

.panel-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.panel-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
}
</style>
