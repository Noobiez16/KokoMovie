// Automatic subtitle synchronization via audio energy VAD + cross-correlation.
//
// Third-party subtitles are timed to a *specific* rip, so on some sources they're a
// few seconds off. This estimates the right offset automatically:
//   1. Tap the playing audio non-invasively (captureStream → AnalyserNode) — this does
//      NOT reroute the element's own output, so it can never mute playback.
//   2. Sample short-frame RMS energy for a window of real playback and threshold it into
//      a binary "speech active" timeline (a lightweight VAD).
//   3. Build the subtitle "cue active" timeline (original timing) on the same grid.
//   4. Cross-correlate the two; the lag that maximizes overlap is the offset to apply.
// This mirrors how tools like ffsubsync align subtitles. It returns a confidence score
// and bails (returns null) when it can't find a trustworthy match, so it never applies
// a confidently-wrong offset.

export interface SubCue {
  start: number
  end: number
}

export interface AutoSyncResult {
  offset: number
  confidence: number
}

export interface AutoSyncOptions {
  windowMs?: number
  maxLagSec?: number
  onProgress?: (pct: number) => void
  signal?: AbortSignal
}

const SAMPLE_DT = 0.1 // seconds between energy samples (10 Hz)

export async function autoSyncSubtitles(
  video: HTMLVideoElement,
  cues: SubCue[],
  opts: AutoSyncOptions = {},
): Promise<AutoSyncResult | null> {
  const windowMs = opts.windowMs ?? 28000
  const maxLagSec = opts.maxLagSec ?? 15

  if (!cues.length) return null

  // 1. Non-invasive audio tap.
  const capture: MediaStream | undefined =
    (video as any).captureStream?.() ?? (video as any).mozCaptureStream?.()
  if (!capture || capture.getAudioTracks().length === 0) return null

  const Ctx: typeof AudioContext | undefined =
    window.AudioContext || (window as any).webkitAudioContext
  if (!Ctx) return null

  const ctx = new Ctx()
  let source: MediaStreamAudioSourceNode
  try {
    source = ctx.createMediaStreamSource(capture)
  } catch {
    await ctx.close().catch(() => {})
    return null
  }
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 2048
  analyser.smoothingTimeConstant = 0.3
  source.connect(analyser) // intentionally NOT connected to destination (no double audio)
  const freq = new Uint8Array(analyser.frequencyBinCount)
  // Measure energy only in the human voice band (~300–3400 Hz). Raw loudness flags
  // music/score and explosions as "speech"; band-limiting to voice frequencies makes
  // the VAD far more selective so it doesn't sync to a soundtrack.
  const binHz = ctx.sampleRate / analyser.fftSize
  const loBin = Math.max(1, Math.floor(300 / binHz))
  const hiBin = Math.min(analyser.frequencyBinCount - 1, Math.ceil(3400 / binHz))

  const cleanup = async () => {
    try { source.disconnect() } catch { /* noop */ }
    try { analyser.disconnect() } catch { /* noop */ }
    try { capture.getTracks().forEach((t) => t.stop()) } catch { /* noop */ }
    await ctx.close().catch(() => {})
  }

  try {
    await ctx.resume().catch(() => {})

    // 2. Collect energy samples tagged with media time for the analysis window.
    const samples: Array<{ t: number; energy: number }> = []
    await new Promise<void>((resolve, reject) => {
      const startWall = performance.now()
      const timer = setInterval(() => {
        if (opts.signal?.aborted) { clearInterval(timer); reject(new Error('aborted')); return }
        analyser.getByteFrequencyData(freq)
        let sum = 0
        for (let i = loBin; i <= hiBin; i++) sum += freq[i]!
        samples.push({ t: video.currentTime, energy: sum / (hiBin - loBin + 1) })
        const elapsed = performance.now() - startWall
        opts.onProgress?.(Math.min(1, elapsed / windowMs))
        if (elapsed >= windowMs) { clearInterval(timer); resolve() }
      }, SAMPLE_DT * 1000)
    })

    if (samples.length < 50) return null
    const tStart = samples[0]!.t
    const tEnd = samples[samples.length - 1]!.t
    // Media must have actually advanced (i.e. it was playing, not paused/buffering).
    if (tEnd - tStart < (windowMs / 1000) * 0.5) return null

    const n = Math.floor((tEnd - tStart) / SAMPLE_DT)
    if (n < 50) return null

    // 3a. Resample energy onto a uniform media-time grid.
    const energyGrid = new Float32Array(n)
    let si = 0
    for (let k = 0; k < n; k++) {
      const t = tStart + k * SAMPLE_DT
      while (si + 1 < samples.length && samples[si + 1]!.t <= t) si++
      energyGrid[k] = samples[si]!.energy
    }

    // 3b. Adaptive threshold → binary speech track.
    const sorted = Array.from(energyGrid).sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]!
    const p90 = sorted[Math.floor(sorted.length * 0.9)]!
    const threshold = median + (p90 - median) * 0.4
    const speech = new Float32Array(n)
    let speechCount = 0
    for (let k = 0; k < n; k++) {
      speech[k] = energyGrid[k]! > threshold ? 1 : 0
      speechCount += speech[k]!
    }
    // Need both speech and silence present, otherwise correlation is meaningless.
    if (speechCount < n * 0.05 || speechCount > n * 0.95) return null

    // 3c. Subtitle cue-activity track on the same grid (original timing).
    const cue = new Float32Array(n)
    let cueCount = 0
    for (let k = 0; k < n; k++) {
      const t = tStart + k * SAMPLE_DT
      let active = 0
      for (const c of cues) {
        if (c.start <= t && t < c.end) { active = 1; break }
      }
      cue[k] = active
      cueCount += active
    }
    if (cueCount < n * 0.02) return null // basically no dialogue cues in this window

    // 4. Cross-correlate (zero-meaned) over ±maxLag; pick the best lag.
    const maxLag = Math.round(maxLagSec / SAMPLE_DT)
    const meanS = speechCount / n
    const meanC = cueCount / n
    let bestLag = 0
    let bestScore = -Infinity
    const scores: number[] = []
    for (let L = -maxLag; L <= maxLag; L++) {
      let s = 0
      for (let k = 0; k < n; k++) {
        const j = k - L
        if (j < 0 || j >= n) continue
        s += (speech[k]! - meanS) * (cue[j]! - meanC)
      }
      scores.push(s)
      if (s > bestScore) { bestScore = s; bestLag = L }
    }

    // Confidence = how far the peak stands above the noise floor of all lags.
    const meanScore = scores.reduce((a, b) => a + b, 0) / scores.length
    const variance = scores.reduce((a, b) => a + (b - meanScore) ** 2, 0) / scores.length
    const std = Math.sqrt(variance) || 1
    const confidence = (bestScore - meanScore) / std

    // Ambiguity guard: if a competing lag (≥1s away from the winner) scores almost as
    // high, the correlation is not distinctive — applying it risks the wrong offset
    // (exactly what happened on music-heavy intros). Demand a clear winner.
    const minLagGap = Math.round(1 / SAMPLE_DT)
    let runnerUp = -Infinity
    for (let i = 0; i < scores.length; i++) {
      const L = i - maxLag
      if (Math.abs(L - bestLag) >= minLagGap && scores[i]! > runnerUp) runnerUp = scores[i]!
    }
    const peakMargin = (bestScore - meanScore) / (Math.abs(runnerUp - meanScore) || 1)

    // Stricter than before: a real speech/subtitle alignment produces a sharp, dominant
    // peak. Otherwise return null so the caller leaves subtitles untouched.
    if (confidence < 4 || peakMargin < 1.3) return null

    // cue[k - L] is the cue originally at time t - L·dt, so to move cues onto the speech
    // they must be shifted by +L·dt.
    const offset = Math.round(bestLag * SAMPLE_DT * 10) / 10
    return { offset, confidence }
  } catch {
    return null
  } finally {
    await cleanup()
  }
}
