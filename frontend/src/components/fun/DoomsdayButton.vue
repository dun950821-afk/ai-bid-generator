<template>
  <el-button
    class="doomsday-btn"
    size="small"
    type="danger"
    plain
    :disabled="running"
    @click="handleClick($event)"
  >
    累了毁灭吧
  </el-button>
</template>

<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import { createDoomsdayEffect } from './doomsdayEffect'

const running = ref(false)

// 触发时由按钮事件注入原点（默认屏幕顶部中央）
let doomsday = createDoomsdayEffect({
  rootSelector: '#app',
  duration: 4200,
  maxParticles: 700,
  hideSourceText: true,
})

async function handleClick(ev: MouseEvent) {
  if (running.value) return

  running.value = true
  ElMessage.warning('毁灭程序启动中……')

  // 以按钮位置为冲击波原点
  const target = ev.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  doomsday = createDoomsdayEffect({
    rootSelector: '#app',
    duration: 4200,
    maxParticles: 700,
    hideSourceText: true,
    originX: rect.left + rect.width / 2,
    originY: rect.top + rect.height / 2,
  })

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
/* ========== 按钮本体强化 ========== */
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

.doomsday-btn::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(120deg, transparent 30%, rgba(255, 77, 79, 0.25) 50%, transparent 70%);
  transform: translateX(-100%);
  transition: transform 0.5s ease;
}

.doomsday-btn:hover:not(:disabled) {
  color: #fff;
  background: #ff4d4f;
  border-color: #ff4d4f;
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(255, 77, 79, 0.45);
}

.doomsday-btn:hover:not(:disabled)::before {
  transform: translateX(100%);
}

.doomsday-btn:active:not(:disabled) {
  transform: translateY(0);
  box-shadow: 0 2px 6px rgba(255, 77, 79, 0.4);
}

.doomsday-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

/* ========== 毁灭动画总容器 ========== */
.doomsday-overlay {
  position: fixed;
  inset: 0;
  z-index: 999999;
  pointer-events: none;
  overflow: hidden;
}

.doomsday-layer {
  position: absolute;
  inset: 0;
}

/* ========== 阶段 1：警告横幅 ========== */
.doomsday-warn-banner {
  position: absolute;
  top: 12%;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 28px;
  font-size: 18px;
  font-weight: 800;
  color: #fff;
  background: linear-gradient(90deg, #cf1322, #ff4d4f, #cf1322);
  border-radius: 999px;
  box-shadow: 0 8px 32px rgba(207, 19, 34, 0.5), 0 0 0 2px rgba(255, 255, 255, 0.4) inset;
  letter-spacing: 1px;
  white-space: nowrap;
  animation: doomsday-warn-in 0.5s cubic-bezier(0.2, 0.9, 0.3, 1.2) both,
    doomsday-warn-pulse 0.8s ease-in-out 0.5s infinite alternate;
}

.doom-warn-icon {
  font-size: 22px;
  animation: doomsday-warn-shake 0.3s linear infinite;
}

@keyframes doomsday-warn-in {
  0% { opacity: 0; transform: translateX(-50%) translateY(-40px) scale(0.7); }
  100% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
}

@keyframes doomsday-warn-pulse {
  0% { box-shadow: 0 8px 32px rgba(207, 19, 34, 0.5), 0 0 0 2px rgba(255, 255, 255, 0.4) inset; }
  100% { box-shadow: 0 8px 48px rgba(207, 19, 34, 0.85), 0 0 0 3px rgba(255, 255, 255, 0.7) inset; }
}

@keyframes doomsday-warn-shake {
  0%, 100% { transform: rotate(0); }
  25% { transform: rotate(-8deg); }
  75% { transform: rotate(8deg); }
}

/* ========== 阶段 2：冲击波（闪光 + 环） ========== */
.doomsday-flash {
  position: absolute;
  width: 0;
  height: 0;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.95), rgba(255, 77, 79, 0.6) 40%, transparent 70%);
  transform: translate(-50%, -50%);
  animation: doomsday-flash 0.7s ease-out forwards;
}

.doomsday-ring {
  position: absolute;
  width: 0;
  height: 0;
  border-radius: 50%;
  border: 4px solid rgba(255, 77, 79, 0.8);
  transform: translate(-50%, -50%);
  animation: doomsday-ring 0.9s cubic-bezier(0.1, 0.7, 0.2, 1) forwards;
}

@keyframes doomsday-flash {
  0% { width: 0; height: 0; opacity: 1; }
  60% { opacity: 0.9; }
  100% { width: 180vmax; height: 180vmax; opacity: 0; }
}

@keyframes doomsday-ring {
  0% { width: 0; height: 0; opacity: 1; border-width: 6px; }
  100% { width: 160vmax; height: 160vmax; opacity: 0; border-width: 1px; }
}

/* ========== 阶段 3：文字碎裂飞散（带重力） ========== */
.doomsday-particle {
  position: fixed;
  display: inline-block;
  white-space: nowrap;
  line-height: 1.2;
  padding: 1px 3px;
  border-radius: 3px;
  transform-origin: center center;
  animation: doomsday-shatter cubic-bezier(0.34, 0.1, 0.4, 1) forwards;
  will-change: transform, opacity, filter;
}

.doomsday-particle.is-accent {
  background: rgba(255, 241, 240, 0.75);
  border: 1px solid rgba(255, 77, 79, 0.25);
  box-shadow: 0 2px 6px rgba(255, 77, 79, 0.2);
}

.doomsday-fallback-particle {
  position: fixed;
  display: inline-block;
  white-space: nowrap;
  font-weight: 900;
  color: #ff4d4f;
  background: rgba(255, 241, 240, 0.9);
  border: 1px solid rgba(255, 77, 79, 0.25);
  border-radius: 8px;
  padding: 3px 8px;
  animation: doomsday-shatter cubic-bezier(0.34, 0.1, 0.4, 1) forwards;
  will-change: transform, opacity, filter;
}

@keyframes doomsday-shatter {
  0% {
    opacity: 1;
    transform: translate3d(0, 0, 0) rotate(0deg) scale(1);
    filter: blur(0);
  }
  15% {
    transform: translate3d(calc(var(--doom-x) * 0.2), var(--doom-up), 0) rotate(calc(var(--doom-rotate) * 0.15)) scale(1.05);
    filter: blur(0.5px);
  }
  50% {
    opacity: 1;
    transform: translate3d(calc(var(--doom-x) * 0.7), calc(var(--doom-up) * 0.5), 0) rotate(calc(var(--doom-rotate) * 0.5)) scale(var(--doom-scale));
    filter: blur(1px);
  }
  100% {
    opacity: 0;
    transform: translate3d(var(--doom-x), var(--doom-fall), 0) rotate(var(--doom-rotate)) scale(calc(var(--doom-scale) * 0.6));
    filter: blur(3px);
  }
}

.doomsday-source-hidden {
  color: transparent !important;
  -webkit-text-fill-color: transparent !important;
  text-shadow: none !important;
}

/* 页面震颤：冲击波后强化抖动 */
body.doomsday-active .outline-workspace,
body.doomsday-active .workspace,
body.doomsday-active .app-main,
body.doomsday-active .el-main {
  animation: doomsday-shake 0.12s linear 0.4s 10;
}

@keyframes doomsday-shake {
  0%, 100% { transform: translate3d(0, 0, 0); }
  20% { transform: translate3d(-3px, 2px, 0); }
  40% { transform: translate3d(3px, -2px, 0); }
  60% { transform: translate3d(-2px, -3px, 0); }
  80% { transform: translate3d(2px, 3px, 0); }
}

/* ========== 阶段 4：暗化层 + 灰烬 ========== */
.doomsday-darken {
  background: transparent;
  transition: background 1.4s ease-in;
  pointer-events: none;
}

.doomsday-darken.is-active {
  background: radial-gradient(circle at 50% 30%, rgba(60, 10, 10, 0.4), rgba(10, 5, 5, 0.78));
}

.doomsday-ember {
  position: absolute;
  display: inline-block;
  color: #ff7a45;
  text-shadow: 0 0 6px rgba(255, 122, 69, 0.8);
  animation: doomsday-ember-fall linear forwards;
  will-change: transform, opacity;
}

@keyframes doomsday-ember-fall {
  0% {
    opacity: 0;
    transform: translateY(0) rotate(0);
  }
  15% { opacity: var(--ember-opacity, 0.6); }
  100% {
    opacity: 0;
    transform: translateY(calc(100vh + 120px)) rotate(540deg);
  }
}
</style>
