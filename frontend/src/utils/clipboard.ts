// frontend/src/utils/clipboard.ts
/** 剪贴板工具函数。 */

/**
 * 复制文本到剪贴板。
 * 优先使用 navigator.clipboard API，降级使用 document.execCommand。
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  // 现代浏览器 API
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // 失败时降级
    }
  }

  // 降级方案：使用 textarea + execCommand
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.top = '-9999px'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()

  try {
    const success = document.execCommand('copy')
    document.body.removeChild(textarea)
    return success
  } catch {
    document.body.removeChild(textarea)
    return false
  }
}
