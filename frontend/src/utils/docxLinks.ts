// frontend/src/utils/docxLinks.ts
/**
 * docx 预览超链接协议白名单（XSS 加固）。
 * docx-preview 的 renderHyperlink 直接使用 docx 外部链接 Target 作为 href，
 * 恶意文档可注入 javascript: 链接（点击触发），在管理员会话上下文执行。
 * 渲染完成后遍历预览容器，剥离非 http(s) 链接的 href。
 */
export function sanitizeDocxLinks(root: HTMLElement | null | undefined): void {
  if (!root) return
  root.querySelectorAll('a[href]').forEach((el) => {
    const a = el as HTMLAnchorElement
    const href = a.getAttribute('href') || ''
    if (/^https?:\/\//i.test(href)) return
    a.removeAttribute('href')
    a.title = '链接地址不受支持，已停用'
  })
}
