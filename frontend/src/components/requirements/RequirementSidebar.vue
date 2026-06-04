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

// 11类固定列表定义
const CATEGORY_DEFINITIONS = [
  { value: 'qualification', label: '资格要求' },
  { value: 'tech_req', label: '技术要求' },
  { value: 'scoring', label: '评分项' },
  { value: 'commercial', label: '商务条款' },
  { value: 'legal', label: '合同法律' },
  { value: 'submission', label: '投标递交' },
  { value: 'schedule', label: '履约周期' },
  { value: 'material', label: '材料要求' },
  { value: 'format', label: '文件格式' },
  { value: 'clarification', label: '澄清补遗' },
  { value: 'other', label: '其他' },
]

// 合并定义和数量
const categories = computed(() => {
  return CATEGORY_DEFINITIONS.map((def) => {
    const cat = props.categories.find((c) => c.value === def.value)
    return {
      ...def,
      count: cat?.count || 0,
    }
  })
})
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