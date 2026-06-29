/**
 * 「累了毁灭吧」网页毁灭动画 —— 多阶段戏剧化编排。
 *
 * 阶段：
 *   1. 警告开场（红光闪烁 + 警告横幅）
 *   2. 冲击波爆发（径向闪光从触发点扩散）
 *   3. 文字碎裂飞散（带重力 + 旋转 + 模糊）
 *   4. 余烬飘落 + 屏幕渐暗
 *   5. 淡入还原
 */

interface DoomsdayOptions {
  rootSelector?: string
  duration?: number
  maxParticles?: number
  hideSourceText?: boolean
  /** 冲击波原点（屏幕坐标），默认屏幕中央。 */
  originX?: number
  originY?: number
}

interface TextFragment {
  text: string
  rect: DOMRect
  style: CSSStyleDeclaration
  sourceElement: HTMLElement
}

const IGNORED_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'IFRAME',
  'CANVAS',
  'SVG',
  'INPUT',
  'TEXTAREA',
  'SELECT',
])

const FALLBACK_WORDS = [
  '累了',
  '毁灭吧',
  'AI生成',
  '标书制作',
  '章节目录',
  '内容责任矩阵',
  'Word编辑',
  '下载Word',
  '版本记录',
  '保存',
  '提交',
  '解析中',
]

const EMBER_CHARS = ['灰', '烬', '余', '·', '✦', '×', '—']

export function createDoomsdayEffect(options: DoomsdayOptions = {}) {
  const duration = options.duration ?? 4200
  const maxParticles = options.maxParticles ?? 700
  const rootSelector = options.rootSelector ?? '#app'
  const hideSourceText = options.hideSourceText ?? true
  const originX = options.originX ?? window.innerWidth / 2
  const originY = options.originY ?? 80

  let overlay: HTMLDivElement | null = null
  let timer: number | null = null
  let hiddenElements: HTMLElement[] = []
  let layers: HTMLDivElement[] = []

  function run() {
    return new Promise<void>((resolve) => {
      cleanup()

      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        resolve()
        return
      }

      const root =
        (document.querySelector(rootSelector) as HTMLElement | null) ||
        document.body

      const fragments = collectVisibleTextFragments(root).slice(0, maxParticles)

      overlay = document.createElement('div')
      overlay.className = 'doomsday-overlay'
      document.body.appendChild(overlay)

      // 层级容器：暗化层 / 冲击波层 / 警告层 / 粒子层 / 灰烬层
      const darkenLayer = createLayer('doomsday-darken')
      const shockwaveLayer = createLayer('doomsday-shockwave-layer')
      const warnLayer = createLayer('doomsday-warn-layer')
      const particleLayer = createLayer('doomsday-particle-layer')
      const emberLayer = createLayer('doomsday-ember-layer')
      layers = [darkenLayer, shockwaveLayer, warnLayer, particleLayer, emberLayer]
      layers.forEach((l) => overlay!.appendChild(l))

      document.body.classList.add('doomsday-active')

      // 阶段 1：警告开场
      spawnWarning(warnLayer)

      // 阶段 2：冲击波（延迟 380ms，配合警告横幅）
      window.setTimeout(() => {
        spawnShockwave(shockwaveLayer, originX, originY)
      }, 380)

      // 阶段 3：文字碎裂飞散（延迟 600ms，冲击波扩散后）
      window.setTimeout(() => {
        if (hideSourceText) hideSourceElements(fragments)
        if (fragments.length) {
          fragments.forEach((item, index) => createParticle(particleLayer, item, index))
        } else {
          createFallbackParticles(particleLayer)
        }
      }, 600)

      // 阶段 4：灰烬飘落（延迟 1.6s，飞散高潮后）
      window.setTimeout(() => {
        spawnEmbers(emberLayer)
        darkenLayer.classList.add('is-active')
      }, 1600)

      timer = window.setTimeout(() => {
        cleanup()
        resolve()
      }, duration + 700)
    })
  }

  function createLayer(className: string): HTMLDivElement {
    const layer = document.createElement('div')
    layer.className = `doomsday-layer ${className}`
    return layer
  }

  function spawnWarning(layer: HTMLDivElement) {
    const banner = document.createElement('div')
    banner.className = 'doomsday-warn-banner'
    banner.innerHTML = '<span class="doom-warn-icon">⚠</span> 毁灭程序已启动，正在拆解页面…'
    layer.appendChild(banner)
  }

  function spawnShockwave(layer: HTMLDivElement, x: number, y: number) {
    // 径向闪光
    const flash = document.createElement('div')
    flash.className = 'doomsday-flash'
    flash.style.left = `${x}px`
    flash.style.top = `${y}px`
    layer.appendChild(flash)

    // 两层冲击环
    for (let i = 0; i < 2; i += 1) {
      const ring = document.createElement('div')
      ring.className = 'doomsday-ring'
      ring.style.left = `${x}px`
      ring.style.top = `${y}px`
      ring.style.animationDelay = `${i * 0.18}s`
      layer.appendChild(ring)
    }
  }

  function spawnEmbers(layer: HTMLDivElement) {
    const count = 60
    for (let i = 0; i < count; i += 1) {
      const ember = document.createElement('span')
      ember.className = 'doomsday-ember'
      ember.textContent = EMBER_CHARS[i % EMBER_CHARS.length]
      ember.style.left = `${Math.random() * window.innerWidth}px`
      ember.style.top = `${-20 - Math.random() * 100}px`
      ember.style.fontSize = `${randomBetween(10, 22)}px`
      ember.style.animationDuration = `${randomBetween(2.2, 3.8)}s`
      ember.style.animationDelay = `${Math.random() * 1.2}s`
      ember.style.opacity = `${randomBetween(0.3, 0.8)}`
      layer.appendChild(ember)
    }
  }

  function cleanup() {
    if (timer) {
      window.clearTimeout(timer)
      timer = null
    }

    document.body.classList.remove('doomsday-active')

    hiddenElements.forEach((el) => {
      el.classList.remove('doomsday-source-hidden')
    })
    hiddenElements = []

    layers = []

    if (overlay) {
      overlay.remove()
      overlay = null
    }
  }

  function hideSourceElements(fragments: TextFragment[]) {
    const set = new Set<HTMLElement>()
    fragments.forEach((item) => set.add(item.sourceElement))
    hiddenElements = Array.from(set)
    hiddenElements.forEach((el) => el.classList.add('doomsday-source-hidden'))
  }

  function createParticle(layer: HTMLDivElement, item: TextFragment, index: number) {
    const particle = document.createElement('span')
    particle.className = 'doomsday-particle'
    particle.textContent = item.text

    particle.style.left = `${item.rect.left}px`
    particle.style.top = `${item.rect.top}px`
    particle.style.minWidth = `${Math.max(item.rect.width, 16)}px`
    particle.style.minHeight = `${item.rect.height}px`
    particle.style.fontSize = item.style.fontSize
    particle.style.fontWeight = item.style.fontWeight
    particle.style.fontFamily = item.style.fontFamily
    particle.style.color = item.style.color
    particle.style.animationDuration = `${duration}ms`
    particle.style.animationDelay = `${Math.random() * 0.4}s`

    if (index % 11 === 0) {
      particle.classList.add('is-accent')
    }

    applyPhysicsMotion(particle)
    layer.appendChild(particle)
  }

  function createFallbackParticles(layer: HTMLDivElement) {
    for (let i = 0; i < 140; i += 1) {
      const particle = document.createElement('span')
      particle.className = 'doomsday-fallback-particle'
      particle.textContent = FALLBACK_WORDS[i % FALLBACK_WORDS.length]

      particle.style.left = `${Math.random() * window.innerWidth}px`
      particle.style.top = `${Math.random() * window.innerHeight}px`
      particle.style.fontSize = `${randomBetween(12, 26)}px`
      particle.style.animationDuration = `${duration}ms`
      particle.style.animationDelay = `${Math.random() * 0.4}s`

      applyPhysicsMotion(particle)
      layer.appendChild(particle)
    }
  }

  return {
    run,
    cleanup,
  }
}

function collectVisibleTextFragments(root: HTMLElement): TextFragment[] {
  const result: TextFragment[] = []

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const text = node.textContent?.trim()
      if (!text) return NodeFilter.FILTER_REJECT

      const parent = node.parentElement
      if (!parent) return NodeFilter.FILTER_REJECT

      if (IGNORED_TAGS.has(parent.tagName)) {
        return NodeFilter.FILTER_REJECT
      }

      if (
        parent.closest('.doomsday-overlay') ||
        parent.closest('.el-message') ||
        parent.closest('.el-tooltip__popper') ||
        parent.closest('.el-dropdown__popper')
      ) {
        return NodeFilter.FILTER_REJECT
      }

      const style = window.getComputedStyle(parent)

      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        Number(style.opacity) === 0
      ) {
        return NodeFilter.FILTER_REJECT
      }

      return NodeFilter.FILTER_ACCEPT
    },
  })

  let node: Node | null

  // eslint-disable-next-line no-cond-assign
  while ((node = walker.nextNode())) {
    const parent = node.parentElement
    if (!parent) continue

    const text = node.textContent || ''
    const chunks = splitTextNodeIntoChunks(text)

    chunks.forEach((chunk) => {
      const range = document.createRange()

      try {
        if (!node) return
        range.setStart(node, chunk.start)
        range.setEnd(node, chunk.end)

        const rects = Array.from(range.getClientRects()).filter((rect) => {
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            rect.bottom >= 0 &&
            rect.right >= 0 &&
            rect.top <= window.innerHeight &&
            rect.left <= window.innerWidth
          )
        })

        if (!rects.length) return

        const style = window.getComputedStyle(parent)

        rects.forEach((rect) => {
          result.push({
            text: chunk.text,
            rect,
            style,
            sourceElement: parent,
          })
        })
      } catch {
        // 忽略异常 range
      } finally {
        range.detach()
      }
    })
  }

  return result
}

function splitTextNodeIntoChunks(text: string) {
  const chunks: Array<{ text: string; start: number; end: number }> = []
  const raw = text || ''
  let index = 0

  while (index < raw.length) {
    while (index < raw.length && /\s/.test(raw[index])) {
      index += 1
    }

    if (index >= raw.length) break

    const start = index
    let end = Math.min(index + randomInt(4, 10), raw.length)

    while (
      end < raw.length &&
      end - start < 14 &&
      !/[，。；、,.!?！？\s]/.test(raw[end])
    ) {
      end += 1
    }

    const chunkText = raw.slice(start, end).trim()

    if (chunkText) {
      chunks.push({ text: chunkText, start, end })
    }

    index = end
  }

  return chunks
}

/** 带重力的物理飞散：向按钮原点反方向爆开 + 下坠 + 旋转。 */
function applyPhysicsMotion(el: HTMLElement) {
  // 水平：朝远离屏幕中心的方向爆开
  const centerX = window.innerWidth / 2
  const elX = parseFloat(el.style.left || '0') || centerX
  const dirX = elX >= centerX ? 1 : -1
  const x = dirX * randomBetween(window.innerWidth * 0.2, window.innerWidth * 0.85)

  // 垂直：先小幅上抛，再大幅下坠（重力感）
  const upLift = randomBetween(-80, -180)
  const fall = randomBetween(window.innerHeight * 0.4, window.innerHeight * 1.1)

  const rotate = randomBetween(-1440, 1440)
  const scale = randomBetween(0.4, 1.8)

  el.style.setProperty('--doom-x', `${x}px`)
  el.style.setProperty('--doom-up', `${upLift}px`)
  el.style.setProperty('--doom-fall', `${fall}px`)
  el.style.setProperty('--doom-rotate', `${rotate}deg`)
  el.style.setProperty('--doom-scale', `${scale}`)
}

function randomBetween(min: number, max: number) {
  return Math.random() * (max - min) + min
}

function randomInt(min: number, max: number) {
  return Math.floor(randomBetween(min, max + 1))
}
