// frontend/src/views/outline/components/resizableImage.ts
/**
 * 可拖拽缩放的图片扩展。
 *
 * 在 @tiptap/extension-image 基础上：
 * - 增加 width 属性（px），解析/渲染时与 <img width> / style 互转，
 *   配合 turndown 的 img 规则可在 Markdown 往返中保留尺寸；
 * - 自定义 NodeView：选中图片后右下角显示拖拽手柄，拖动实时调整宽度。
 */
import Image from '@tiptap/extension-image'
import type { Node as PMNode } from '@tiptap/pm/model'

const MIN_WIDTH = 60

export const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const raw = element.getAttribute('width') || element.style.width
          const parsed = raw ? parseInt(raw, 10) : NaN
          return Number.isFinite(parsed) ? parsed : null
        },
        renderHTML: (attributes: Record<string, any>) => {
          if (!attributes.width) return {}
          return {
            width: attributes.width,
            style: `width: ${attributes.width}px; height: auto;`,
          }
        },
      },
    }
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      let currentNode = node

      const dom = document.createElement('span')
      dom.className = 'resizable-image'

      const img = document.createElement('img')
      img.src = node.attrs.src
      if (node.attrs.alt) img.alt = node.attrs.alt
      if (node.attrs.width) img.style.width = `${node.attrs.width}px`
      dom.appendChild(img)

      const handle = document.createElement('span')
      handle.className = 'image-resize-handle'
      dom.appendChild(handle)

      handle.addEventListener('mousedown', (e: MouseEvent) => {
        if (!editor.isEditable) return
        e.preventDefault()
        e.stopPropagation()

        const startX = e.clientX
        const startWidth = img.getBoundingClientRect().width
        let finalWidth = startWidth

        const onMove = (ev: MouseEvent) => {
          finalWidth = Math.max(MIN_WIDTH, startWidth + ev.clientX - startX)
          img.style.width = `${finalWidth}px`
        }
        const onUp = () => {
          window.removeEventListener('mousemove', onMove)
          window.removeEventListener('mouseup', onUp)
          const pos = typeof getPos === 'function' ? getPos() : null
          if (pos == null) return
          editor
            .chain()
            .command(({ tr }) => {
              tr.setNodeMarkup(pos, undefined, {
                ...currentNode.attrs,
                width: Math.round(finalWidth),
              })
              return true
            })
            .run()
        }
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
      })

      return {
        dom,
        update(updatedNode: PMNode) {
          if (updatedNode.type.name !== 'image') return false
          currentNode = updatedNode
          img.src = updatedNode.attrs.src
          img.style.width = updatedNode.attrs.width ? `${updatedNode.attrs.width}px` : ''
          return true
        },
        selectNode() {
          dom.classList.add('is-selected')
        },
        deselectNode() {
          dom.classList.remove('is-selected')
        },
      }
    }
  },
})
