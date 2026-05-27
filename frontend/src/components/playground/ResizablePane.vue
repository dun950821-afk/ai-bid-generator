<!-- frontend/src/components/playground/ResizablePane.vue -->
<script setup lang="ts">
/**
 * 可调整大小的面板组件。
 * 支持拖拽调整宽度，CSS Grid 响应式布局。
 */

import { ref, computed, onMounted, onUnmounted } from 'vue'

const props = defineProps<{
  initialWidth?: string  // e.g. '300px' or '30%'
  minWidth?: string      // e.g. '200px'
  maxWidth?: string      // e.g. '500px'
  side?: 'left' | 'right' // 拖拽手柄位置
}>()

const emit = defineEmits<{
  (e: 'resize', width: number): void
}>()

const paneRef = ref<HTMLElement | null>(null)
const width = ref<number>(0)
const isDragging = ref(false)

// 解析宽度字符串为像素值
function parseWidth(w: string): number {
  if (w.endsWith('px')) {
    return parseInt(w.slice(0, -2), 10)
  }
  if (w.endsWith('%') && paneRef.value?.parentElement) {
    const parentWidth = paneRef.value.parentElement.offsetWidth
    return parentWidth * parseInt(w.slice(0, -1), 10) / 100
  }
  return parseInt(w, 10)
}

const minWidthPx = computed(() => props.minWidth ? parseWidth(props.minWidth) : 150)
const maxWidthPx = computed(() => props.maxWidth ? parseWidth(props.maxWidth) : 800)

onMounted(() => {
  if (paneRef.value) {
    const initial = props.initialWidth || '300px'
    width.value = parseWidth(initial)
    paneRef.value.style.width = `${width.value}px`
  }
})

function startDrag(e: MouseEvent) {
  isDragging.value = true
  e.preventDefault()
}

function onDrag(e: MouseEvent) {
  if (!isDragging.value || !paneRef.value?.parentElement) return

  const parentRect = paneRef.value.parentElement.getBoundingClientRect()
  let newWidth: number

  if (props.side === 'left') {
    newWidth = e.clientX - parentRect.left
  } else {
    newWidth = parentRect.right - e.clientX
  }

  // 限制范围
  newWidth = Math.max(minWidthPx.value, Math.min(maxWidthPx.value, newWidth))

  width.value = newWidth
  paneRef.value.style.width = `${newWidth}px`
  emit('resize', newWidth)
}

function stopDrag() {
  isDragging.value = false
}

onMounted(() => {
  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
})

onUnmounted(() => {
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
})
</script>

<template>
  <div
    ref="paneRef"
    class="resizable-pane"
    :class="{ dragging: isDragging }"
  >
    <slot />
    <div
      class="resize-handle"
      :class="[side || 'right']"
      @mousedown="startDrag"
    />
  </div>
</template>

<style scoped>
.resizable-pane {
  position: relative;
  overflow: auto;
  background: var(--el-bg-color);
}

.resizable-pane.dragging {
  user-select: none;
}

.resize-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 4px;
  cursor: col-resize;
  background: transparent;
  transition: background 0.2s;
}

.resize-handle:hover,
.resize-handle.left:hover {
  background: var(--el-color-primary-light-5);
}

.resize-handle.right {
  right: 0;
}

.resize-handle.left {
  left: 0;
}
</style>