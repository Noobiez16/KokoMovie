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

  // Always link the release notes / changelog. Point at the exact version's GitHub release
  // when known, otherwise the releases index.
  const REPO = 'https://github.com/Noobiez16/KokoMovie'
  const changelogUrl = version ? `${REPO}/releases/tag/v${version}` : `${REPO}/releases`

  return (
    <div className="fixed bottom-6 right-6 z-[100] w-80 max-w-[calc(100vw-3rem)] animate-slide-up">
      <div className="rounded-2xl bg-gradient-to-br from-[#1a1230]/95 to-[#120d24]/95 border border-violet-500/30 ring-1 ring-violet-500/20 p-4 shadow-2xl shadow-violet-950/40 backdrop-blur-xl">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600/30 to-fuchsia-600/20 text-violet-300 ring-1 ring-violet-500/20">
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
                <a
                  href={changelogUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-violet-300 hover:text-violet-200 transition-colors"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  </svg>
                  What's new
                </a>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={handleInstall}
                    disabled={installing}
                    className="rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 py-1.5 text-xs font-semibold text-white shadow-md shadow-violet-600/20 transition-all hover:from-violet-500 hover:to-fuchsia-500 hover:scale-[1.02] active:scale-95 disabled:opacity-60"
                  >
                    {installing ? 'Restarting…' : 'Install Update'}
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
                <a
                  href={changelogUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-violet-300 hover:text-violet-200 transition-colors"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  </svg>
                  What's new
                </a>
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
