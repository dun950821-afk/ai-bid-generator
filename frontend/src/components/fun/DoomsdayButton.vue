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
import { createDoomsdayEffect } from './doomsdayEffect'

const running = ref(false)

const doomsday = createDoomsdayEffect({
  rootSelector: '#app',
  duration: 3800,
  maxParticles: 650,
  hideSourceText: true,
})

async function handleClick() {
  if (running.value) return

  running.value = true
  ElMessage.warning('毁灭程序启动中……')

  try {
    await doomsday.run()
  } finally {
    running.value = false
  }
}

onBeforeUnmount(() => {
  doomsday.cleanup()
})
</script>

<style>
.doomsday-btn {
  border-color: #ffccc7;
  color: #cf1322;
  background: #fff1f0;
  font-weight: 700;
}

.doomsday-btn:hover:not(:disabled) {
  color: #fff;
  background: #ff4d4f;
  border-color: #ff4d4f;
}

.doomsday-btn:disabled {
  opacity: 0.5;
}

/* ========== 毁灭动画样式 ========== */
.doomsday-overlay {
  position: fixed;
  inset: 0;
  z-index: 999999;
  pointer-events: none;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.03);
}

.doomsday-particle {
  position: fixed;
  display: inline-block;
  white-space: nowrap;
  line-height: 1.2;
  padding: 1px 2px;
  border-radius: 3px;
  transform-origin: center center;
  animation: doomsday-fly cubic-bezier(0.16, 0.8, 0.2, 1) forwards;
  will-change: transform, opacity, filter;
}

.doomsday-fallback-particle {
  position: fixed;
  display: inline-block;
  white-space: nowrap;
  font-weight: 900;
  color: #ff4d4f;
  background: rgba(255, 241, 240, 0.86);
  border: 1px solid rgba(255, 77, 79, 0.2);
  border-radius: 8px;
  padding: 3px 8px;
  animation: doomsday-fly cubic-bezier(0.16, 0.8, 0.2, 1) forwards;
  will-change: transform, opacity, filter;
}

.doomsday-source-hidden {
  color: transparent !important;
  -webkit-text-fill-color: transparent !important;
  text-shadow: none !important;
}

body.doomsday-active .outline-workspace,
body.doomsday-active .workspace,
body.doomsday-active .app-main {
  animation: doomsday-shake 0.18s linear 0s 8;
}

@keyframes doomsday-fly {
  0% {
    opacity: 1;
    transform: translate3d(0, 0, 0) rotate(0deg) scale(1);
    filter: blur(0);
  }

  45% {
    opacity: 1;
    filter: blur(0);
  }

  100% {
    opacity: 0;
    transform:
      translate3d(var(--doom-x), var(--doom-y), 0)
      rotate(var(--doom-rotate))
      scale(var(--doom-scale));
    filter: blur(2px);
  }
}

@keyframes doomsday-shake {
  0%,
  100% {
    transform: translate3d(0, 0, 0);
  }

  20% {
    transform: translate3d(-2px, 1px, 0);
  }

  40% {
    transform: translate3d(2px, -1px, 0);
  }

  60% {
    transform: translate3d(-1px, -2px, 0);
  }

  80% {
    transform: translate3d(1px, 2px, 0);
  }
}
</style>
