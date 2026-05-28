import { useEffect, useState } from 'react'

type UpdateState = 'idle' | 'available' | 'downloaded'

/**
 * Global toast that surfaces auto-update progress. The main process
 * (see client/src/main/updater.ts) downloads updates in the background and
 * emits `update:available` while downloading and `update:downloaded` once the
 * new version is staged. We show a subtle notice while downloading and a
 * "Restart & Install" prompt when it's ready.
 */
export function UpdateNotification() {
  const [state, setState] = useState<UpdateState>('idle')
  const [version, setVersion] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    const offAvailable = window.electronAPI?.onUpdateAvailable((v) => {
      if (v) setVersion(v)
      // Don't downgrade a "ready" notice back to "downloading".
      setState((s) => (s === 'downloaded' ? s : 'available'))
      setDismissed(false)
    })
    const offDownloaded = window.electronAPI?.onUpdateDownloaded((v) => {
      if (v) setVersion(v)
      setState('downloaded')
      setDismissed(false)
    })
    return () => {
      offAvailable?.()
      offDownloaded?.()
    }
  }, [])

  if (state === 'idle' || dismissed) return null

  const handleInstall = async () => {
    setInstalling(true)
    try {
      await window.electronAPI?.installUpdate()
    } catch {
      // quitAndInstall normally terminates the app; if it ever rejects, re-enable the button.
      setInstalling(false)
    }
  }

  const isReady = state === 'downloaded'

  return (
    <div className="fixed bottom-6 right-6 z-[100] w-80 max-w-[calc(100vw-3rem)] animate-slide-up">
      <div className="rounded-xl bg-km-surface border border-km-border/70 p-4 shadow-2xl shadow-black/50 backdrop-blur">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-km-accent/15 text-km-accent">
            {isReady ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            ) : (
              <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            )}
          </div>

          <div className="min-w-0 flex-1">
            {isReady ? (
              <>
                <p className="text-sm font-semibold text-white">
                  {version ? `Version ${version} is ready` : 'Update ready to install'}
                </p>
                <p className="mt-0.5 text-xs text-purple-300">
                  A new version of KokoMovie is ready. Restart to update — your place is saved.
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={handleInstall}
                    disabled={installing}
                    className="rounded-lg bg-km-accent px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-km-accent-hover disabled:opacity-60"
                  >
                    {installing ? 'Restarting…' : 'Restart & Install'}
                  </button>
                  <button
                    onClick={() => setDismissed(true)}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-purple-300 transition-colors hover:text-white"
                  >
                    Later
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-white">
                  {version ? `Downloading version ${version}…` : 'Downloading update…'}
                </p>
                <p className="mt-0.5 text-xs text-purple-300">
                  A newer version is downloading in the background. We'll let you know when it's ready.
                </p>
              </>
            )}
          </div>

          {!isReady && (
            <button
              onClick={() => setDismissed(true)}
              aria-label="Dismiss"
              className="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-purple-300 transition-colors hover:text-white"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
