import type { CleanupRegistry } from './types'

export type CleanupRegistryHandle = CleanupRegistry & { cleanup(): void }

class CleanupRegistryImpl implements CleanupRegistryHandle {
  private timers: number[] = []
  private rafs: number[] = []
  private listeners: Array<{ target: EventTarget; type: string; listener: EventListenerOrEventListenerObject }> = []
  private domNodes: HTMLElement[] = []
  private restores: Array<() => void> = []
  private cleaned = false

  registerTimer(id: number): void {
    this.timers.push(id)
  }

  registerRaf(id: number): void {
    this.rafs.push(id)
  }

  registerEventListener(
    target: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject
  ): void {
    target.addEventListener(type, listener)
    this.listeners.push({ target, type, listener })
  }

  registerDomNode(node: HTMLElement): void {
    this.domNodes.push(node)
  }

  registerRestore(fn: () => void): void {
    this.restores.push(fn)
  }

  cleanup(): void {
    if (this.cleaned) return
    this.cleaned = true

    this.timers.forEach((id) => window.clearTimeout(id))
    this.rafs.forEach((id) => window.cancelAnimationFrame(id))
    this.listeners.forEach(({ target, type, listener }) => {
      target.removeEventListener(type, listener)
    })
    this.domNodes.forEach((node) => {
      if (node.parentNode) {
        node.parentNode.removeChild(node)
      }
    })
    this.restores.forEach((fn) => {
      try {
        fn()
      } catch {
        // 静默失败
      }
    })
  }
}

export function createCleanupRegistry(): CleanupRegistryHandle {
  return new CleanupRegistryImpl()
}

export function cleanup(registry: CleanupRegistryHandle): void {
  registry.cleanup()
}
