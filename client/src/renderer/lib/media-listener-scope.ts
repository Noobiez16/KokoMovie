export interface MediaListenerScope {
  listen(type: string, listener: EventListener, options?: boolean | AddEventListenerOptions): void
  clear(): void
}

export function createMediaListenerScope(target: EventTarget): MediaListenerScope {
  const listeners: Array<{ type: string; listener: EventListener; options?: boolean | AddEventListenerOptions }> = []
  return {
    listen(type, listener, options) {
      target.addEventListener(type, listener, options)
      listeners.push({ type, listener, options })
    },
    clear() {
      for (const { type, listener, options } of listeners.splice(0)) {
        target.removeEventListener(type, listener, options)
      }
    },
  }
}
