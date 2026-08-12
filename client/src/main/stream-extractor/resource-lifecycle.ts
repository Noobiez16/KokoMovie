interface ExtractionWindowLike {
  isDestroyed(): boolean
  destroy(): void
  once(event: 'closed', listener: () => void): unknown
}

interface ActiveWindowSetLike<T> {
  delete(window: T): unknown
}

interface ExtractionSessionLike {
  clearStorageData(): Promise<unknown>
}

/** Keeps limiter accounting aligned with real Electron resources even when teardown partly fails. */
export async function teardownExtractionResources<T extends ExtractionWindowLike>(
  window: T,
  activeWindows: ActiveWindowSetLike<T>,
  providerSession: ExtractionSessionLike,
): Promise<void> {
  if (!window.isDestroyed()) {
    const closed = new Promise<void>((resolve) => {
      window.once('closed', resolve)
    })
    try {
      window.destroy()
    } catch { /* Chromium may still emit `closed`, so keep the slot quarantined below. */ }
    if (!window.isDestroyed()) await closed
  }

  activeWindows.delete(window)
  try {
    await providerSession.clearStorageData()
  } catch { /* ephemeral storage will also disappear when Electron exits */ }
}
