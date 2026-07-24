<template>
  <el-button
    class="doomsday-btn"
    size="small"
    type="danger"
    plain
    :disabled="running"
    @click="handleClick"
  >
    累了毁灭吧
  </el-button>
</template>

<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import { createDoomsdayEffect } from './doomsday'
import type { DoomsdayController } from './doomsday/types'

const running = ref(false)
let controller: DoomsdayController | null = null

async function handleClick(event: MouseEvent) {
  if (running.value) return

  running.value = true
  ElMessage.warning('毁灭程序启动中……')

  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()

  controller = createDoomsdayEffect({
    rootSelector: '#app',
    originX: rect.left + rect.width / 2,
    originY: rect.top + rect.height / 2,
  })

  try {
    await controller.run()
  } finally {
    running.value = false
    controller = null
  }
}

onBeforeUnmount(() => {
  if (controller) {
    controller.cleanup()
    controller = null
  }
})
</script>

<style scoped>
.doomsday-btn {
  position: relative;
  border-color: #ffccc7;
  color: #cf1322;
  background: #fff1f0;
  font-weight: 700;
  letter-spacing: 0.5px;
  overflow: hidden;
  transition: all 0.2s ease;
}

.doomsday-btn:hover:not(:disabled) {
  color: #fff;
  background: #ff4d4f;
  border-color: #ff4d4f;
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(255, 77, 79, 0.45);
}

.doomsday-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
