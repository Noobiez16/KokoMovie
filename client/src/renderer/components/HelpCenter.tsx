import { useCallback, useEffect, useMemo, useState } from 'react'
import changelog from '../../../../docs/changelog.md?raw'

type HelpView = 'documentation' | 'feedback'
type FeedbackKind = 'Bug' | 'Feature' | 'Improvement' | 'Other'

interface TrackedFeedback {
  id: string
  title: string
  createdAt: string
  notified?: boolean
}

interface GitHubIssue {
  html_url: string
  state: 'open' | 'closed'
  state_reason?: string | null
  body?: string | null
  comments_url: string
  pull_request?: unknown
}

interface GitHubComment { body?: string | null; html_url: string }

const REPO = 'Noobiez16/KokoMovie'
const TRACKING_KEY = 'km_feedback_tracking_v1'
const LAST_CHECK_KEY = 'km_feedback_last_check_v1'
const CHECK_INTERVAL_MS = 15 * 60 * 1000
const TRACKING_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000
const DONE_PATTERN = /\[DONE\]\s*([\s\S]+)/i
const VERSION_PATTERN = /\bv(\d+\.\d+\.\d+(?:[-\w.]*)?)/i

function readTracked(): TrackedFeedback[] {
  try { return JSON.parse(localStorage.getItem(TRACKING_KEY) ?? '[]') as TrackedFeedback[] } catch { return [] }
}

function saveTracked(items: TrackedFeedback[]): void {
  localStorage.setItem(TRACKING_KEY, JSON.stringify(items))
}

function markdownLines(source: string) {
  return source.split('\n').map((line, index) => {
    if (line.startsWith('## ')) return <h2 key={index} className="mt-7 text-xl font-bold text-white">{line.slice(3)}</h2>
    if (line.startsWith('### ')) return <h3 key={index} className="mt-5 text-sm font-bold uppercase tracking-wider text-violet-300">{line.slice(4)}</h3>
    if (line.startsWith('- ')) return <div key={index} className="ml-1 mt-2 flex gap-2 text-sm leading-6 text-white/75"><span className="text-violet-400">•</span><span>{line.slice(2).replace(/\*\*/g, '')}</span></div>
    if (!line.trim() || line === '---') return <div key={index} className="h-2" />
    if (line.startsWith('# ')) return null
    return <p key={index} className="mt-2 text-sm leading-6 text-white/65">{line.replace(/\*\*/g, '')}</p>
  })
}

export function HelpCenter() {
  const [view, setView] = useState<HelpView | null>(null)
  const [kind, setKind] = useState<FeedbackKind>('Bug')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [completion, setCompletion] = useState<{ text: string; version?: string; url: string } | null>(null)
  const renderedChangelog = useMemo(() => markdownLines(changelog), [])

  const checkFeedback = useCallback(async () => {
    const now = Date.now()
    const lastCheck = Number(localStorage.getItem(LAST_CHECK_KEY) ?? 0)
    if (now - lastCheck < CHECK_INTERVAL_MS) return
    localStorage.setItem(LAST_CHECK_KEY, String(now))
    const tracked = readTracked().filter((entry) => now - new Date(entry.createdAt).getTime() < TRACKING_MAX_AGE_MS)
    let changed = false
    for (const item of tracked.filter((entry) => !entry.notified).slice(0, 5)) {
      try {
        const query = encodeURIComponent(`repo:${REPO} is:issue \"${item.id}\"`)
        const result = await window.electronAPI?.apiRequest({
          url: `https://api.github.com/search/issues?q=${query}&per_page=5`, method: 'GET',
          headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
        })
        if (!result?.ok) continue
        const issue = (JSON.parse(result.body).items as GitHubIssue[] | undefined)?.find((candidate) => !candidate.pull_request)
        if (!issue || issue.state !== 'closed') continue
        let doneSource = issue.body ?? ''
        let doneUrl = issue.html_url
        const comments = await window.electronAPI?.apiRequest({
          url: issue.comments_url, method: 'GET',
          headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
        })
        if (comments?.ok) {
          const doneComment = (JSON.parse(comments.body) as GitHubComment[]).reverse().find((comment) => DONE_PATTERN.test(comment.body ?? ''))
          if (doneComment) { doneSource = doneComment.body ?? ''; doneUrl = doneComment.html_url }
        }
        const done = doneSource.match(DONE_PATTERN)
        if (!done) continue
        const version = doneSource.match(VERSION_PATTERN)?.[1]
        item.notified = true
        changed = true
        setCompletion({ text: done[1].trim(), version, url: doneUrl })
        break
      } catch { /* GitHub may be offline or rate-limited; retry on the next app session. */ }
    }
    if (changed || tracked.length !== readTracked().length) saveTracked(tracked)
  }, [])

  useEffect(() => {
    const off = window.electronAPI?.onHelpAction(setView)
    void checkFeedback()
    const onFocus = () => { void checkFeedback() }
    window.addEventListener('focus', onFocus)
    return () => { off?.(); window.removeEventListener('focus', onFocus) }
  }, [checkFeedback])

  const submitFeedback = async () => {
    if (!title.trim() || description.trim().length < 10) return
    const id = `KMF-${crypto.randomUUID()}`
    const version = await window.electronAPI?.getAppVersion().catch(() => 'unknown') ?? 'unknown'
    const platform = await window.electronAPI?.getPlatform().catch(() => 'unknown') ?? 'unknown'
    const body = [
      description.trim(), '', '---', `Feedback ID: ${id}`, `KokoMovie: v${version}`, `Platform: ${platform}`,
      '', '> Maintainer: when resolved, close this issue and add a comment beginning `[DONE]`. Include the changelog version and a short user-facing explanation so the app can notify this installation.',
    ].join('\n')
    saveTracked([...readTracked(), { id, title: title.trim(), createdAt: new Date().toISOString() }].slice(-20))
    const url = `https://github.com/${REPO}/issues/new?title=${encodeURIComponent(`[${kind}] ${title.trim()}`)}&body=${encodeURIComponent(body)}`
    window.open(url, '_blank', 'noopener,noreferrer')
    setView(null); setTitle(''); setDescription(''); setKind('Bug')
  }

  return (
    <>
      {view && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 p-5 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) setView(null) }}>
        <section className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#100d1c] shadow-2xl">
          <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
            <div><p className="text-lg font-bold text-white">{view === 'documentation' ? 'Documentation & Changelog' : 'Send Feedback'}</p><p className="text-xs text-white/45">{view === 'documentation' ? 'What changed in every KokoMovie release' : 'Submit securely through GitHub Issues'}</p></div>
            <button onClick={() => setView(null)} className="rounded-lg p-2 text-white/50 hover:bg-white/10 hover:text-white" aria-label="Close">✕</button>
          </header>
          {view === 'documentation' ? <div className="overflow-y-auto px-7 pb-8">{renderedChangelog}</div> :
            <div className="space-y-5 overflow-y-auto p-6">
              <div className="rounded-xl border border-violet-500/20 bg-violet-500/10 p-4 text-xs leading-5 text-violet-200">GitHub will open in your browser for review and submission. KokoMovie never receives your GitHub password or stores an access token.</div>
              <label className="block text-sm font-medium text-white/80">Category<select value={kind} onChange={(e) => setKind(e.target.value as FeedbackKind)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-violet-500">{['Bug', 'Feature', 'Improvement', 'Other'].map((value) => <option key={value}>{value}</option>)}</select></label>
              <label className="block text-sm font-medium text-white/80">Title<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Briefly describe your feedback" className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none placeholder:text-white/25 focus:border-violet-500" /></label>
              <label className="block text-sm font-medium text-white/80">Details<textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={7} placeholder="What happened, what did you expect, and how could KokoMovie improve?" className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none placeholder:text-white/25 focus:border-violet-500" /></label>
              <div className="flex justify-end gap-3"><button onClick={() => setView(null)} className="rounded-xl px-4 py-2.5 text-sm text-white/60 hover:text-white">Cancel</button><button onClick={() => void submitFeedback()} disabled={!title.trim() || description.trim().length < 10} className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40">Review on GitHub</button></div>
            </div>}
        </section>
      </div>}
      {completion && <div className="fixed bottom-6 right-6 z-[130] w-96 max-w-[calc(100vw-3rem)] rounded-2xl border border-emerald-400/25 bg-[#101b18]/95 p-5 shadow-2xl backdrop-blur-xl">
        <div className="flex gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300">✓</div><div className="min-w-0 flex-1"><p className="font-semibold text-white">Your feedback was completed</p><p className="mt-1 text-sm leading-5 text-white/65">{completion.text}</p>{completion.version && <p className="mt-2 text-xs font-medium text-emerald-300">Documented in changelog v{completion.version}</p>}<div className="mt-3 flex gap-3"><a href={completion.url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-violet-300 hover:text-violet-200">View resolution</a><button onClick={() => setCompletion(null)} className="text-xs text-white/45 hover:text-white">Dismiss</button></div></div></div>
      </div>}
    </>
  )
}
