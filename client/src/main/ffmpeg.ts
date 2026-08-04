import { app } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'

// ───────────────────────────────────────────────────────────────────────────
// Locates the LGPL FFmpeg executable KokoMovie ships.
//
// This replaces the former `ffmpeg-static` dependency, whose binary is configured with
// --enable-gpl --enable-version3 and therefore forced a GPL-3.0 obligation onto every
// distributed installer. The vendored build (see scripts/fetch-ffmpeg.mjs) is LGPL-3.0 and is
// spawned as a separate executable, never linked into the app.
//
// FFmpeg is no longer inside node_modules, so the old `app.asar` → `app.asar.unpacked` path
// rewrite does not apply. electron-builder copies the per-target binary through extraResources,
// which lands outside the asar archive already and can be spawned directly.
// ───────────────────────────────────────────────────────────────────────────

const BINARY = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'

function candidatePaths(): string[] {
  const target = `${process.platform}-${process.arch}`
  return [
    // Packaged: extraResources places the binary at <resources>/ffmpeg/ffmpeg[.exe].
    join(process.resourcesPath ?? '', 'ffmpeg', BINARY),
    // Development: the vendor tree produced by `npm run vendor:ffmpeg`.
    join(app.getAppPath(), 'vendor', 'ffmpeg', target, BINARY),
    join(app.getAppPath(), '..', 'client', 'vendor', 'ffmpeg', target, BINARY),
  ]
}

function resolveFfmpeg(): string | null {
  for (const candidate of candidatePaths()) {
    try {
      if (candidate && existsSync(candidate)) return candidate
    } catch {
      // An unreadable candidate is simply not a match.
    }
  }
  return null
}

// Resolved once at startup: the location cannot change while the app runs, and both the torrent
// remuxer and the download finalizer need a synchronous answer on their hot paths.
export const FFMPEG_BIN: string | null = resolveFfmpeg()

if (!FFMPEG_BIN) {
  console.warn('[ffmpeg] No bundled FFmpeg executable found; torrent remuxing and download finalization are unavailable.')
}
