# KokoMovie PC — Architecture

**Version:** 1.5.3 stream-reliability baseline (Fully Local, Multi-Architecture Linux)
**Date:** 2026-08-12
**Status:** Current

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture Decision Records](#2-architecture-decision-records)
3. [System Architecture](#3-system-architecture)
4. [Client Architecture — Electron + React](#4-client-architecture--electron--react)
5. [Providers Framework](#5-providers-framework)
6. [Data Architecture — Local SQLite](#6-data-architecture--local-sqlite)
7. [Security Architecture](#7-security-architecture)
8. [Infrastructure](#8-infrastructure)
9. [IPC Bridge & API Contracts](#9-ipc-bridge--api-contracts)

---

## 1. Project Overview

### What KokoMovie PC Is

KokoMovie PC is a **fully local desktop content aggregator**. It runs entirely on-device with zero server dependencies or active cloud backends. It browses real movie and TV show metadata by communicating directly with the [TMDB](https://www.themoviedb.org/) API and streams content on-demand via third-party providers (VidSrc, VidLink, etc.) in a built-in player.

Watchlists, playback positions, continue-watching lists, and preferences are stored securely on-device. No accounts, login, or cloud databases are required.

### What it is NOT

- Not a hosted streaming service or CDN.
- Not a subscription service.
- Not cloud-dependent (there are no active backend services or Docker requirements).

---

## 2. Architecture Decision Records

### ADR-001 — Electron for cross-platform desktop

**Decision:** Electron 43 (Chromium 150, Node.js 24) — upgraded from Electron 31 in v1.5.1  
**Rationale:** Cross-platform (Linux/Windows/macOS) execution, integrated Chromium shell for `hls.js` HLS playback, Node.js main process context for sandboxed browser-based stream extraction, and native OS keychain access. The 31 → 43 jump carries roughly two years of Chromium and V8 security fixes into the shipped runtime, which matters because the extraction window renders untrusted provider pages.

### ADR-002 — Fully Local Architecture (v3.0.0 Pivot)

**Decision:** Replace all Node.js microservices and local Docker containers with local database storage (SQLite) and direct TMDB client integration.  
**Rationale:** Eliminates local dev orchestration complexity (Postgres, Redis, DynamoDB Local), removes resource usage, protects privacy since user data never leaves their machine, and makes setup a single command: `npm run dev:client`.

### ADR-003 — Hidden BrowserWindow stream extraction

**Decision:** Load provider embed pages in a hidden `BrowserWindow`, intercept `.m3u8` via Electron's `webRequest.onSendHeaders`  
**Rationale:** Providers protect streams behind anti-bot and cookie challenges requiring a real browser engine. Intercepting outbound requests in the main process captures the final media stream along with any required headers (`Referer`, `Origin`).

### ADR-004 — Local SQLite for On-Device Storage

**Decision:** Store watchlists, playback positions (continue watching), downloads, and preferences in a local SQLite 3 database (`better-sqlite3`).  
**Rationale:** High performance, zero administration, single file persistence, and robust transactional integrity for a desktop client.

### ADR-005 — Deterministic Content IDs from TMDB

**Decision:** Derive stable UUIDs deterministically from TMDB IDs: `tmdbContentId(type, id)`  
**Rationale:** Allows the client to reference content IDs before they exist in the local SQLite db. Watchlists and Continue-Watching lists store only IDs; rows are enriched from TMDB on read.

### ADR-006 — OS Keychain for API Keys

**Decision:** Store the user's TMDB API key in the OS keychain via `keytar` associated with account ID `'local'`.  
**Rationale:** API keys are sensitive secrets; they are stored in the OS-level credential manager rather than plaintext configurations or `localStorage`.

---

## 3. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Electron Desktop App                         │
│                                                                 │
│  ┌─────────────────────────────┐  ┌────────────────────────┐   │
│  │   Renderer Process           │  │   Main Process          │   │
│  │   (Chromium)                 │  │   (Node.js)             │   │
│  │                              │  │                         │   │
│  │   React 19 + Vite            │  │   SQLite Database       │   │
│  │   TanStack Query             │  │   IPC Handlers (Library)│   │
│  │   Zustand                    │◄─┤   keytar (keychain)     │   │
│  │   hls.js (video player)      │  │   Providers Registry    │   │
│  │   React Router (HashRouter)  │  │   Stream Extractor      │   │
│  └──────────────┬───────────────┘  └───────────┬────────────┘   │
└─────────────────┼──────────────────────────────┼────────────────┘
                  │ GET /search, /browse         │ getFirstStream
                  ▼                              ▼
         ┌──────────────────┐          ┌──────────────────┐
         │   TMDB API       │          │   Providers      │
         │   themoviedb.org │          │   vidsrc, etc.   │
         └──────────────────┘          └──────────────────┘
```

### Data Flow: Browsing & Metadata

```
User opens app
  → Renderer sends structured TMDB paths and parameters through the preload bridge; Main reads the keychain and owns network access/cache
  → TMDB API returns details (popular, trending, specific titles)
  → React displays catalog content
```

### Data Flow: Playback & Positions

```
User watches content
  → Main process runs scraping race across enabled providers in hidden windows
  → Winner stream URL is sent back; VideoPlayer mounts
  → Every 10s, Player emits position update
  → Main process updates the local SQLite 'playback_positions' table
  → Browse page fetches continue-watching lists directly from SQLite, hydrating details from TMDB
```

---

## 4. Client Architecture — Electron + React

### Process Model

```
Main Process (Node.js)
├── BrowserWindow (main app, HashRouter)
├── SQLite Manager (better-sqlite3)
├── IPC Handlers
│   ├── keychain:* — OS keychain via keytar
│   ├── api:request — restricted GitHub Help Center proxy
│   ├── tmdb:* — keychain-backed repository, JSON cache, cache controls
│   ├── library:* — watchlist, history, position CRUD
│   ├── providers:* — provider preferences & scrape
│   └── download:* — offline HLS downloader
├── Stream Extractor (Hidden BrowserWindows)
└── Local Stream Proxy (bypasses browser CORS & rewrites manifests)

Renderer Process (Chromium)
└── React app (HashRouter)
    ├── Pages: Browse, Search, ContentDetail, Player, Settings, Downloads, ...
    ├── i18next resources: en-US, es-ES, fr-FR
    ├── API clients → window.electronAPI (contextBridge IPC calls)
    └── Stores: auth (Zustand, seeds local identity), queryClient (TanStack Query)
```

The persisted language is read before the renderer mounts. A live change first updates i18next and `document.documentElement.lang`, then persists through the preferences IPC, rebuilds the native Electron menu, and invalidates locale-sensitive TanStack Query data. If persistence fails, the renderer and native menu roll back together. TMDB requests carry the normalized locale and include it in the main-process cache key.

The Electron menu model is build-independent: View always exposes the standard `toggleDevTools` role, while File/Edit/View/Window/Help labels are selected from the same normalized locale family.

---

## 5. Providers Framework

The main process ships a fixed, verified provider registry. Provider definitions remain simple deterministic embed-URL builders and are retained as the rollback/reference implementation. A separate runtime contract declares each provider's allowed HTTPS host, bounded extraction policy, request schema, health state, and diagnostics behavior.

Enabled providers retain their registry order and run through the existing staggered quality-aware race. Cancellation tears down ephemeral extraction windows, provider sessions deny permissions/popups/downloads, and repeated infrastructure failures temporarily open an in-memory circuit without affecting catalog, library, or offline features. Installable packs and remote registries remain deferred until signing, revocation, isolated execution, permission confirmation, and last-known-good rollback are proven.

The HLS proxy listens only on loopback. Initial targets and every redirect reject credentials, unsafe protocols, localhost, private/LAN, link-local, carrier-grade NAT, benchmark, and multicast addresses. Downloads may use only public HTTP(S) targets or the exact active KokoMovie proxy port.

---

## 6. Data Architecture — Local SQLite

Watchlist, playback tracking, preferences, and download queues are managed in a local SQLite database named `kokomovie.db` located inside the Electron app's `userData` directory.

### SQLite Schema

```sql
-- Track offline HLS video segments
CREATE TABLE downloads (
  id              TEXT PRIMARY KEY,
  content_id      TEXT NOT NULL,
  episode_id      TEXT,
  title           TEXT NOT NULL,
  content_type    TEXT NOT NULL DEFAULT 'movie',
  thumbnail_url   TEXT,
  duration_mins   INTEGER,
  s3_hls_key      TEXT NOT NULL,
  drm_key_id      TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',
  progress_percent INTEGER NOT NULL DEFAULT 0,
  download_speed_kbps INTEGER DEFAULT 0,
  total_segments  INTEGER DEFAULT 0,
  completed_segments INTEGER DEFAULT 0,
  local_dir       TEXT NOT NULL,
  manifest_path   TEXT,
  downloaded_at   TEXT,
  expires_at      TEXT NOT NULL,
  error_message   TEXT,
  headers         TEXT
);

-- Bookmark list
CREATE TABLE watchlist (
  content_id   TEXT PRIMARY KEY,
  content_type TEXT NOT NULL DEFAULT 'movie',
  added_at     TEXT NOT NULL
);

-- Position tracking for Continue Watching
CREATE TABLE playback_positions (
  content_id       TEXT NOT NULL,
  episode_id       TEXT NOT NULL DEFAULT '',
  content_type     TEXT NOT NULL DEFAULT 'movie',
  position_seconds INTEGER NOT NULL DEFAULT 0,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  completed_at     TEXT,
  updated_at       TEXT NOT NULL,
  PRIMARY KEY (content_id, episode_id)
);

-- Local app settings
CREATE TABLE preferences (
  id               INTEGER PRIMARY KEY CHECK (id = 1),
  language         TEXT NOT NULL DEFAULT 'en',
  subtitle_default TEXT,
  autoplay         INTEGER NOT NULL DEFAULT 1,
  maturity_rating  TEXT NOT NULL DEFAULT 'TV-MA'
);
```

---

## 7. Security Architecture

- **Context Isolation**: Enabled in all windows. Renderer processes communicate only through whitelisted IPC channels in the preload script.
- **Keychain Storage**: API keys are saved in the OS keychain via `keytar` to prevent raw exposure on disk or in standard localStorage.
- **Local SQLite DB**: The SQLite file lives in the system's protected user data folders.
- **Portable Offline MP4**: Provider segments are protected only while the download is in progress. After transfer, bundled FFmpeg remuxes video and audio without re-encoding into one standard MP4 in the selected Downloads folder; temporary encrypted segments are removed after successful finalization.
- **Torrent Streaming**: Compatible 1080p releases are exposed as one explicit language per source (for example, `Torrent - Spanish-1080P`). MP4, M4V, and WebM use WebTorrent's native seekable byte-range stream; MKV, AVI, and MOV continue through the bounded FFmpeg remux path. HTTP probes are bodyless, stream cleanup follows the outgoing response lifecycle, and each language receives a stable stream token.
- **Torrent Seeking and Audio**: A remux is progressive, so the renderer seeks by reloading the stream token at `?start=…&dur=…`. The stream server maps that time to a byte offset, downloads a forward window of roughly 66 seconds at the release's real bitrate (clamped to 24–256 MiB) before FFmpeg starts, and keeps that read stream flowing — re-arming it if it fails — so WebTorrent keeps prioritizing pieces ahead of the playhead. FFmpeg reads at real time after a short initial burst, so it cannot outrun the download into sparse file data. A window that cannot be fetched in time returns `503` instead of a stream that dies mid-playback. The remux carries a single audible audio stream and no rendition metadata, so the player publishes the requested dub itself as the stream's sole audio entry; HLS sources continue to build their audio list from `AUDIO_TRACKS_UPDATED`.

---

### Bundled FFmpeg

FFmpeg is **not** an npm dependency. `scripts/fetch-ffmpeg.mjs` vendors a checksum-pinned
LGPL-3.0 build (BtbN/FFmpeg-Builds, FFmpeg 8.1) into `client/vendor/ffmpeg/<platform>-<arch>/`,
verifying the SHA-256 of the archive and then reading the configure string back out of the binary
to reject any build carrying `--enable-gpl`, `--enable-nonfree`, `--enable-libx264`,
`--enable-libx265`, or `--enable-libxvid`.

electron-builder copies the per-target binary through `extraResources` to
`resources/ffmpeg/ffmpeg[.exe]`, alongside `LICENSE.txt` and `PROVENANCE.json`. Because it lives
outside the asar archive it is spawned directly and remains user-replaceable, which is what LGPL
§4 requires. `client/src/main/ffmpeg.ts` resolves the path (packaged `resourcesPath` first, then
the development vendor tree) and exports a single `FFMPEG_BIN`; the torrent remuxer and the
download finalizer both consume it. When no binary is present — currently any macOS build — those
two features report a clear error and the rest of the application is unaffected.

This replaced `ffmpeg-static`, whose binary is configured `--enable-gpl --enable-version3` and so
dictated the project's distribution licence. See `docs/LEGAL.md` and `THIRD-PARTY-NOTICES.md`.

---

## 8. Infrastructure

No hosting infrastructure or local Docker orchestration is required. The application only requires the local desktop runtime.

### Linux CPU architectures

Linux packages are produced independently for x64 (`x86_64`) and ARM64 (`aarch64`). Release CI
runs each build on a native GitHub-hosted runner so Electron, `better-sqlite3`, `keytar`, and the
bundled FFmpeg binary all match the package architecture. Since better-sqlite3 v13 the SQLite
addon ships as an ABI-stable N-API prebuild under `prebuilds/<platform>-<arch>.node` rather than
`build/Release/`, so CI names each verified binary explicitly instead of globbing.
The local HTTP proxy and torrent server
bind only to the loopback interface and use Node's architecture-independent socket APIs, so their
IPC and URL contracts are identical on both architectures.

QEMU/binfmt emulation is supported as a development fallback for ARM64 packaging, but emulated
artifacts are not used for releases because native add-ons are safest when installed and rebuilt
on the target CPU architecture.

---

## 9. IPC Bridge & API Contracts

All transactions between the UI and backend logic are defined by the IPC contracts exposed in `client/src/main/preload.ts` under the global `window.electronAPI` bridge:

- `electronAPI.getTmdbApiKey(accountId)` / `setTmdbApiKey(accountId, key)`
- `electronAPI.watchlistGet(profileId)` / `watchlistAdd(contentId, type, profileId)` / `watchlistRemove(contentId, profileId)`
- `electronAPI.positionGet(contentId, episodeId, profileId)` / `positionSave(contentId, episodeId, type, pos, dur, completedAt, profileId)`
- `electronAPI.preferencesGet(profileId)` / `preferencesSave(prefs, profileId)`

## 10. Local Library Portability

Manual portability is implemented entirely in the main process. The renderer can request a native save/open dialog, receive a validation preview, and submit a short-lived import token with an explicit `merge` or `replace` decision; it never receives arbitrary filesystem access.

The versioned JSON format includes watchlist, playback history/positions, preferences, and optional bounded catalog artwork. Credentials, downloaded media, and machine-specific paths are excluded. Imports are strict-schema validated, previewed, backed up with SQLite's online backup API, applied transactionally with timestamp-based conflict rules, and artwork files are restored atomically after extension and signature checks. Cloud and watched-folder sync remain disabled and out of scope.

## 11. Local diagnostics boundary

Diagnostics flow from main-process operational events into a rotating 512 KiB log with three retained generations. Every field is length-bounded and redacted before persistence. Export does not copy arbitrary logs or database rows: it constructs a schema-v1 report from app/platform metadata, aggregate local-library counts, aggregate download states, and the latest redacted events. A trusted-renderer IPC issues a ten-minute preview token; only that reviewed immutable snapshot can be saved.
