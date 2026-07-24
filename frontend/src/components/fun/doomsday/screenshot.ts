import html2canvas from 'html2canvas'
import { SCREENSHOT_TIMEOUT_MS, type ScreenshotResult } from './types'

const FLOATING_SELECTORS = ['.el-message', '.el-dialog', '.el-drawer', '.el-tooltip__popper']

export async function captureApp(
  rootSelector: string,
  options: {
    onBeforeCapture?: () => void
    onAfterCapture?: () => void
  }
): Promise<ScreenshotResult> {
  const root = document.querySelector(rootSelector) as HTMLElement | null
  if (!root) {
    throw new Error(`根节点 ${rootSelector} 未找到`)
  }

  const hiddenNodes: Array<{ node: HTMLElement; prev: string }> = []
  FLOATING_SELECTORS.forEach((selector) => {
    document.querySelectorAll<HTMLElement>(selector).forEach((node) => {
      if (node.style.display !== 'none') {
        const prev = node.style.display
        node.style.display = 'none'
        hiddenNodes.push({ node, prev })
      }
    })
  })

  options.onBeforeCapture?.()

  let timeoutId: number | undefined
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error('截图超时')), SCREENSHOT_TIMEOUT_MS)
  })

  try {
    const canvas = await Promise.race([
      html2canvas(root, {
        backgroundColor: null,
        scale: 1,
        useCORS: true,
        logging: false,
        allowTaint: false,
      }),
      timeoutPromise,
    ])

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Canvas 2D 上下文不可用')
    }
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

    root.style.visibility = 'hidden'

    return {
      canvas,
      width: canvas.width,
      height: canvas.height,
      imageData,
    }
  } finally {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId)
    }
    hiddenNodes.forEach(({ node, prev }) => {
      node.style.display = prev
    })
    options.onAfterCapture?.()
  }
}
