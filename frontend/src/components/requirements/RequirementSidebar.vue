<template>
  <div class="requirement-sidebar">
    <div class="sidebar-header">
      <span class="header-title">条款分类</span>
    </div>
    <div class="category-list">
      <div
        v-for="cat in categories"
        :key="cat.value"
        :class="['category-item', { active: activeCategory === cat.value }]"
        @click="$emit('select', cat.value)"
      >
        <span class="category-name">{{ cat.label }}</span>
        <span class="category-count">{{ cat.count || 0 }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface CategoryItem {
  value: string
  label: string
  count: number
}

const props = defineProps<{
  categories: CategoryItem[]
  activeCategory: string
}>()

defineEmits<{
  select: [category: string]
}>()

// 分类定义与数量由父组件传入（仅实际抽取的 6 类）
const categories = computed(() => props.categories)
</script>

<style scoped>
.requirement-sidebar {
  width: 200px;
  background: var(--el-fill-color-light);
  border-right: 1px solid var(--el-border-color-light);
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  padding: 16px 12px;
  border-bottom: 1px solid var(--el-border-color-light);
}

.header-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--el-text-color-primary);
}

.category-list {
  flex: 1;
  overflow-y: auto;
}

.category-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  cursor: pointer;
  transition: all 0.2s;
  border-bottom: 1px solid var(--el-border-color-extra-light);
}

.category-item:hover {
  background: var(--el-fill-color);
}

.category-item.active {
  background: var(--el-color-primary-light-9);
  border-left: 3px solid var(--el-color-primary);
}

.category-name {
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.category-item.active .category-name {
  color: var(--el-color-primary);
  font-weight: 500;
}

.category-count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color);
  padding: 2px 8px;
  border-radius: 10px;
}

.category-item.active .category-count {
  background: var(--el-color-primary-light-8);
  color: var(--el-color-primary);
}
</style>