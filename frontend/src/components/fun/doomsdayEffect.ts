interface DoomsdayOptions {
  rootSelector?: string
  duration?: number
  maxParticles?: number
  hideSourceText?: boolean
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
]

export function createDoomsdayEffect(options: DoomsdayOptions = {}) {
  const duration = options.duration ?? 3800
  const maxParticles = options.maxParticles ?? 650
  const rootSelector = options.rootSelector ?? '#app'
  const hideSourceText = options.hideSourceText ?? true

  let overlay: HTMLDivElement | null = null
  let timer: number | null = null
  let hiddenElements: HTMLElement[] = []

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

      document.body.classList.add('doomsday-active')

      if (hideSourceText) {
        hideSourceElements(fragments)
      }

      if (fragments.length) {
        fragments.forEach((item, index) => {
          createParticle(item, index)
        })
      } else {
        createFallbackParticles()
      }

      timer = window.setTimeout(() => {
        cleanup()
        resolve()
      }, duration + 650)
    })
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

    if (overlay) {
      overlay.remove()
      overlay = null
    }
  }

  function hideSourceElements(fragments: TextFragment[]) {
    const set = new Set<HTMLElement>()

    fragments.forEach((item) => {
      set.add(item.sourceElement)
    })

    hiddenElements = Array.from(set)

    hiddenElements.forEach((el) => {
      el.classList.add('doomsday-source-hidden')
    })
  }

  function createParticle(item: TextFragment, index: number) {
    if (!overlay) return

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
    particle.style.animationDelay = `${Math.random() * 0.35}s`

    if (index % 14 === 0) {
      particle.style.background = 'rgba(255, 241, 240, 0.7)'
      particle.style.border = '1px solid rgba(255, 77, 79, 0.18)'
    }

    applyRandomMotion(particle)
    overlay.appendChild(particle)
  }

  function createFallbackParticles() {
    if (!overlay) return

    for (let i = 0; i < 120; i += 1) {
      const particle = document.createElement('span')
      particle.className = 'doomsday-fallback-particle'
      particle.textContent = FALLBACK_WORDS[i % FALLBACK_WORDS.length]

      particle.style.left = `${Math.random() * window.innerWidth}px`
      particle.style.top = `${Math.random() * window.innerHeight}px`
      particle.style.fontSize = `${randomBetween(12, 26)}px`
      particle.style.animationDuration = `${duration}ms`
      particle.style.animationDelay = `${Math.random() * 0.4}s`

      applyRandomMotion(particle)
      overlay.appendChild(particle)
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
        // 忽略异常 range，避免影响整体动画
      } finally {
        range.detach()
      }
    })
  }

  return result
}

function splitTextNodeIntoChunks(text: string) {
  const chunks: Array<{
    text: string
    start: number
    end: number
  }> = []

  const raw = text || ''
  let index = 0

  while (index < raw.length) {
    while (index < raw.length && /\s/.test(raw[index])) {
      index += 1
    }

    if (index >= raw.length) break

    const start = index
    let end = Math.min(index + randomInt(4, 10), raw.length)

    // 尽量在中文标点、空格处切开
    while (
      end < raw.length &&
      end - start < 14 &&
      !/[，。；、,.!?！？\s]/.test(raw[end])
    ) {
      end += 1
    }

    const chunkText = raw.slice(start, end).trim()

    if (chunkText) {
      chunks.push({
        text: chunkText,
        start,
        end,
      })
    }

    index = end
  }

  return chunks
}

function applyRandomMotion(el: HTMLElement) {
  const x = randomBetween(-window.innerWidth * 0.95, window.innerWidth * 0.95)
  const y = randomBetween(-window.innerHeight * 0.95, window.innerHeight * 0.95)
  const rotate = randomBetween(-1260, 1260)
  const scale = randomBetween(0.35, 2.35)

  el.style.setProperty('--doom-x', `${x}px`)
  el.style.setProperty('--doom-y', `${y}px`)
  el.style.setProperty('--doom-rotate', `${rotate}deg`)
  el.style.setProperty('--doom-scale', `${scale}`)
}

function randomBetween(min: number, max: number) {
  return Math.random() * (max - min) + min
}

function randomInt(min: number, max: number) {
  return Math.floor(randomBetween(min, max + 1))
}
