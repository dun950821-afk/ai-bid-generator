import type { VisualElements } from './types'

export type VisualElementsWithRestart = VisualElements & {
  showRestartButton: (onClick: () => void) => void
}

/** 动画关键帧(注入一次, overlay 销毁时一并移除) */
const KEYFRAMES_ID = 'doomsday-keyframes'
const KEYFRAMES_CSS = `
@keyframes doomsday-shake {
  0%, 100% { transform: translate(0, 0) rotate(0deg); }
  20% { transform: translate(-4px, 2px) rotate(-0.3deg); }
  40% { transform: translate(4px, -2px) rotate(0.3deg); }
  60% { transform: translate(-3px, -2px) rotate(-0.2deg); }
  80% { transform: translate(3px, 2px) rotate(0.2deg); }
}
.doomsday-shaking {
  animation: doomsday-shake 0.45s linear infinite;
}
@keyframes doomsday-spin {
  from { transform: translate(-50%, -50%) rotate(0deg); }
  to { transform: translate(-50%, -50%) rotate(360deg); }
}
@keyframes doomsday-pulse {
  0%, 100% { box-shadow: 0 0 30px 8px rgba(167, 139, 250, 0.7), 0 0 80px 24px rgba(109, 40, 217, 0.45); }
  50% { box-shadow: 0 0 50px 16px rgba(167, 139, 250, 0.95), 0 0 120px 40px rgba(109, 40, 217, 0.6); }
}
@keyframes doomsday-stamp {
  0% { transform: translate(-50%, -50%) scale(3.2) rotate(-14deg); opacity: 0; }
  60% { transform: translate(-50%, -50%) scale(0.92) rotate(-8deg); opacity: 1; }
  100% { transform: translate(-50%, -50%) scale(1) rotate(-8deg); opacity: 1; }
}
@keyframes doomsday-flicker {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.75; }
}
`

export function createVisuals(originX: number, originY: number): VisualElementsWithRestart {
  const styleEl = document.createElement('style')
  styleEl.id = KEYFRAMES_ID
  styleEl.textContent = KEYFRAMES_CSS
  document.head.appendChild(styleEl)

  const overlay = document.createElement('div')
  overlay.className = 'doomsday-overlay'
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:999999;pointer-events:none;overflow:hidden;'

  const warnBanner = document.createElement('div')
  warnBanner.className = 'doomsday-warn-banner'
  warnBanner.style.cssText =
    `position:absolute;top:10%;left:50%;transform:translateX(-50%);padding:12px 28px;` +
    `background:linear-gradient(90deg,#b45309,#f59e0b,#b45309);color:#fff;` +
    `border-radius:999px;font-weight:800;letter-spacing:1px;font-size:15px;` +
    `box-shadow:0 8px 32px rgba(217,119,6,0.55);transition:opacity 0.3s ease;`

  const warnCountdown = document.createElement('span')
  warnCountdown.textContent = '1.6s'
  warnBanner.innerHTML = '⚠ 毁灭程序已启动，倒计时 '
  warnBanner.appendChild(warnCountdown)

  const singularity = document.createElement('div')
  singularity.className = 'doomsday-singularity'
  singularity.style.cssText =
    `position:absolute;left:${originX}px;top:${originY}px;` +
    `transform:translate(-50%,-50%) scale(0);width:90px;height:90px;border-radius:50%;` +
    `background:radial-gradient(circle,#fff 0%,#c4b5fd 25%,#6d28d9 55%,#1e1b4b 80%,transparent 100%);` +
    `transition:transform 0.9s cubic-bezier(0.34,1.56,0.64,1);` +
    `animation:doomsday-pulse 1.2s ease-in-out infinite;`

  const flash = document.createElement('div')
  flash.className = 'doomsday-flash'
  flash.style.cssText =
    'position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;'

  const darkScreen = document.createElement('div')
  darkScreen.className = 'doomsday-dark-screen'
  darkScreen.style.cssText =
    'position:absolute;inset:0;background:#050508;opacity:0;transition:opacity 0.4s ease;pointer-events:none;'

  const doomText = document.createElement('div')
  doomText.className = 'doomsday-doom-text'
  doomText.textContent = '世界已毁灭'
  doomText.style.cssText =
    `position:absolute;left:50%;top:42%;transform:translate(-50%,-50%) scale(3.2) rotate(-14deg);` +
    `color:#ef4444;font-size:56px;font-weight:900;letter-spacing:10px;opacity:0;` +
    `border:4px solid #ef4444;padding:12px 36px;border-radius:8px;` +
    `text-shadow:0 0 24px rgba(239,68,68,0.6);box-shadow:0 0 40px rgba(239,68,68,0.25) inset;`

  const restartButton = document.createElement('button')
  restartButton.className = 'doomsday-restart-btn'
  restartButton.textContent = '重启世界'
  restartButton.style.cssText =
    `position:absolute;left:50%;top:58%;transform:translate(-50%,-50%) scale(0.85);` +
    `display:none;padding:14px 40px;border:2px solid #a78bfa;background:rgba(30,27,75,0.85);` +
    `color:#fff;border-radius:999px;cursor:pointer;font-weight:800;font-size:16px;letter-spacing:4px;` +
    `pointer-events:auto;box-shadow:0 0 36px rgba(167,139,250,0.65);` +
    `transition:opacity 0.3s ease,transform 0.3s cubic-bezier(0.34,1.56,0.64,1);` +
    `animation:doomsday-flicker 2s ease-in-out infinite;`

  const rippleContainer = document.createElement('div')
  rippleContainer.className = 'doomsday-ripple-container'
  rippleContainer.style.cssText =
    `position:absolute;left:${originX}px;top:${originY}px;` +
    `width:0;height:0;border-radius:50%;pointer-events:none;opacity:0;`
  rippleContainer.innerHTML = `
    <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style="overflow:visible;">
      <defs>
        <filter id="doomsday-ripple-filter" x="-50%" y="-50%" width="200%" height="200%">
          <feTurbulence type="turbulence" baseFrequency="0.02 0.05" numOctaves="2" seed="2"/>
          <feDisplacementMap in="SourceGraphic" scale="6"/>
        </filter>
      </defs>
      <circle cx="50" cy="50" r="48" fill="none" stroke="#a78bfa" stroke-width="2" opacity="0.85" filter="url(#doomsday-ripple-filter)"/>
      <circle cx="50" cy="50" r="46" fill="none" stroke="#c4b5fd" stroke-width="1" opacity="0.5"/>
    </svg>
  `

  const rebuildText = document.createElement('div')
  rebuildText.className = 'doomsday-rebuild-text'
  rebuildText.textContent = '世界重建中…'
  rebuildText.style.cssText =
    `position:absolute;left:${originX}px;top:${originY + 90}px;` +
    `transform:translateX(-50%);color:#c4b5fd;font-size:15px;font-weight:700;` +
    `letter-spacing:3px;opacity:0;transition:opacity 0.5s ease;` +
    `text-shadow:0 0 12px rgba(167,139,250,0.8);`

  overlay.appendChild(warnBanner)
  overlay.appendChild(singularity)
  overlay.appendChild(flash)
  overlay.appendChild(darkScreen)
  overlay.appendChild(doomText)
  overlay.appendChild(restartButton)
  overlay.appendChild(rippleContainer)
  overlay.appendChild(rebuildText)
  document.body.appendChild(overlay)

  return {
    overlay,
    warnBanner,
    warnCountdown,
    singularity,
    flash,
    darkScreen,
    doomText,
    restartButton,
    rippleContainer,
    rebuildText,
    showRestartButton(onClick: () => void) {
      restartButton.style.display = 'block'
      restartButton.style.opacity = '0'
      requestAnimationFrame(() => {
        restartButton.style.opacity = '1'
        restartButton.style.transform = 'translate(-50%,-50%) scale(1)'
      })
      restartButton.addEventListener('click', onClick, { once: true })
    },
  }
}

export function destroyVisuals(visuals: VisualElements): void {
  if (visuals.overlay.parentNode) {
    visuals.overlay.parentNode.removeChild(visuals.overlay)
  }
  document.getElementById(KEYFRAMES_ID)?.remove()
}
