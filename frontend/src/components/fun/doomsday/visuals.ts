import type { VisualElements } from './types'

export type VisualElementsWithRestart = VisualElements & {
  showRestartButton: (onClick: () => void) => void
}

export function createVisuals(originX: number, originY: number): VisualElementsWithRestart {
  const overlay = document.createElement('div')
  overlay.className = 'doomsday-overlay'
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:999999;pointer-events:none;overflow:hidden;'

  const loadingRing = document.createElement('div')
  loadingRing.className = 'doomsday-loading-ring'
  loadingRing.style.cssText =
    `position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:80px;height:80px;` +
    `border:4px solid rgba(167,139,250,0.3);border-top-color:#a78bfa;border-radius:50%;` +
    `animation:doomsday-spin 1s linear infinite;`

  const warnBanner = document.createElement('div')
  warnBanner.className = 'doomsday-warn-banner'
  warnBanner.style.cssText =
    `position:absolute;top:12%;left:50%;transform:translateX(-50%);padding:12px 28px;` +
    `background:linear-gradient(90deg,#d97706,#fbbf24,#d97706);color:#fff;` +
    `border-radius:999px;font-weight:800;letter-spacing:1px;box-shadow:0 8px 32px rgba(217,119,6,0.5);` +
    `transition:opacity 0.3s ease,transform 0.5s cubic-bezier(0.2,0.9,0.3,1.2);`

  const warnCountdown = document.createElement('span')
  warnCountdown.textContent = '2.3s'
  warnBanner.innerHTML = '⚠ 毁灭程序已启动，倒计时 '
  warnBanner.appendChild(warnCountdown)

  const singularity = document.createElement('div')
  singularity.className = 'doomsday-singularity'
  singularity.style.cssText =
    `position:absolute;left:${originX}px;top:${originY}px;` +
    `transform:translate(-50%,-50%) scale(0);width:80px;height:80px;border-radius:50%;` +
    `background:radial-gradient(circle,#fff 0%,#a78bfa 30%,#1e1b4b 70%,transparent 100%);` +
    `transition:transform 1s ease-out;animation:doomsday-spin 10s linear infinite reverse;`

  const flash = document.createElement('div')
  flash.className = 'doomsday-flash'
  flash.style.cssText =
    'position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;'

  const darkScreen = document.createElement('div')
  darkScreen.className = 'doomsday-dark-screen'
  darkScreen.style.cssText =
    'position:absolute;inset:0;background:#000;opacity:0;transition:opacity 0.2s ease;pointer-events:none;'

  const embers: HTMLSpanElement[] = []
  for (let i = 0; i < 6; i += 1) {
    const ember = document.createElement('span')
    ember.className = 'doomsday-ember'
    ember.textContent = '✦'
    ember.style.cssText =
      `position:absolute;left:${originX + (Math.random() - 0.5) * 40}px;top:${originY}px;` +
      `color:#fb923c;text-shadow:0 0 6px rgba(251,146,60,0.8);font-size:${10 + Math.random() * 12}px;` +
      `opacity:0;pointer-events:none;`
    embers.push(ember)
  }

  const restartButton = document.createElement('button')
  restartButton.className = 'doomsday-restart-btn'
  restartButton.textContent = '重启世界'
  restartButton.style.cssText =
    `position:absolute;left:${originX}px;top:${originY}px;transform:translate(-50%,-50%) scale(0.8);` +
    `display:none;padding:12px 32px;border:2px solid #a78bfa;background:rgba(30,27,75,0.8);` +
    `color:#fff;border-radius:999px;cursor:pointer;font-weight:700;pointer-events:auto;` +
    `box-shadow:0 0 32px rgba(167,139,250,0.6);transition:opacity 0.3s ease,transform 0.3s ease;`

  overlay.appendChild(loadingRing)
  overlay.appendChild(warnBanner)
  overlay.appendChild(singularity)
  overlay.appendChild(flash)
  overlay.appendChild(darkScreen)
  embers.forEach((e) => overlay.appendChild(e))
  overlay.appendChild(restartButton)
  document.body.appendChild(overlay)

  return {
    overlay,
    warnBanner,
    warnCountdown,
    singularity,
    flash,
    darkScreen,
    embers,
    restartButton,
    loadingRing,
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
}
