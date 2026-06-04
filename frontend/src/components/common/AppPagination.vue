<template>
  <div
    v-if="shouldShow"
    class="app-pagination"
    :class="[`app-pagination--${align}`]"
  >
    <el-pagination
      :current-page="page"
      :page-size="pageSize"
      :page-sizes="pageSizes"
      :total="total"
      :layout="layout"
      :background="background"
      :disabled="disabled"
      :hide-on-single-page="hideOnSinglePage"
      :small="small"
      @size-change="handleSizeChange"
      @current-change="handleCurrentChange"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  /** 当前页码 */
  page: number
  /** 每页数量 */
  pageSize: number
  /** 总数 */
  total: number
  /** 每页数量选项 */
  pageSizes?: number[]
  /** 分页布局 */
  layout?: string
  /** 是否使用背景色 */
  background?: boolean
  /** 是否禁用 */
  disabled?: boolean
  /** 单页时是否隐藏 */
  hideOnSinglePage?: boolean
  /** 是否使用小型分页 */
  small?: boolean
  /** 对齐方式 */
  align?: 'left' | 'center' | 'right' | 'between'
  /** 是否自动滚动 */
  autoScroll?: boolean
  /** 滚动目标选择器 */
  scrollTarget?: string
}

const props = withDefaults(defineProps<Props>(), {
  page: 1,
  pageSize: 10,
  total: 0,
  pageSizes: () => [10, 20, 50, 100],
  layout: 'total, sizes, prev, pager, next, jumper',
  background: true,
  disabled: false,
  hideOnSinglePage: false,
  small: false,
  align: 'right',
  autoScroll: true,
  scrollTarget: '',
})

const emit = defineEmits<{
  (e: 'update:page', page: number): void
  (e: 'update:pageSize', pageSize: number): void
  (e: 'change', payload: { page: number; pageSize: number }): void
  (e: 'size-change', pageSize: number): void
  (e: 'current-change', page: number): void
}>()

/**
 * 是否显示分页
 */
const shouldShow = computed(() => {
  if (props.hideOnSinglePage) {
    return props.total > props.pageSize
  }
  return true
})

/**
 * 处理页码变化
 */
function handleCurrentChange(page: number) {
  emit('update:page', page)
  emit('current-change', page)
  emit('change', { page, pageSize: props.pageSize })

  // 自动滚动
  scrollToTop()
}

/**
 * 处理每页数量变化
 */
function handleSizeChange(pageSize: number) {
  // 切换 pageSize 时回到第一页
  emit('update:page', 1)
  emit('update:pageSize', pageSize)
  emit('size-change', pageSize)
  emit('change', { page: 1, pageSize })

  // 自动滚动
  scrollToTop()
}

/**
 * 滚动到顶部
 */
function scrollToTop() {
  if (!props.autoScroll) return

  try {
    if (props.scrollTarget) {
      // 滚动到指定元素
      const element = document.querySelector(props.scrollTarget)
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    } else {
      // 滚动到页面顶部
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  } catch {
    // 忽略滚动错误
  }
}
</script>

<style scoped>
.app-pagination {
  display: flex;
  margin-top: 16px;
}

.app-pagination--left {
  justify-content: flex-start;
}

.app-pagination--center {
  justify-content: center;
}

.app-pagination--right {
  justify-content: flex-end;
}

.app-pagination--between {
  justify-content: space-between;
}
</style>