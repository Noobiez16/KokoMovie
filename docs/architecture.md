# KokoMovie PC — Architecture

**Version:** 1.1.6-beta (Fully Local Architecture)  
**Date:** June 2026  
**Status:** Current

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture Decision Records](#2-architecture-decision-records)
3. [System Architecture](#3-system-architecture)
4. [Client Architecture — Electron + React](#4-client-architecture--electron--react)
5. [Providers Framework](#5-providers-framework)
6. [DEPRECATED Backend Microservices](#6-deprecated-backend-microservices)
7. [Data Architecture — Local SQLite](#7-data-architecture--local-sqlite)
8. [Security Architecture](#8-security-architecture)
9. [Infrastructure](#9-infrastructure)
10. [IPC Bridge & API Contracts](#10-ipc-bridge--api-contracts)

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

**Decision:** Electron 31  
**Rationale:** Cross-platform (Linux/Windows/macOS) execution, integrated Chromium shell for `hls.js` HLS playback, Node.js main process context for sandboxed browser-based stream extraction, and native OS keychain access.

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
  → Renderer calls TMDB directly via ipcRenderer (CORS bypassed by Main proxy)
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
│   ├── api:request — CORS-free TMDB API proxy
│   ├── library:* — watchlist, history, position CRUD
│   ├── providers:* — provider preferences & scrape
│   └── download:* — offline HLS downloader
├── Stream Extractor (Hidden BrowserWindows)
└── Local Stream Proxy (bypasses browser CORS & rewrites manifests)

Renderer Process (Chromium)
└── React app (HashRouter)
    ├── Pages: Browse, Search, ContentDetail, Player, Settings, Downloads, ...
    ├── API clients → window.electronAPI (contextBridge IPC calls)
    └── Stores: auth (Zustand, seeds local identity), queryClient (TanStack Query)
```

---

## 5. Providers Framework

The client races multiple streaming providers in parallel. Refer to the provider registry and hidden window extraction logic outlined in standard repository developer documentation.

---

## 6. [DEPRECATED] Backend Microservices

All services in the `services/` directory (Auth, User, Catalog, Playback, Recommendation) and their associated Docker container setup (`docker-compose.yml`) are **deprecated and completely unused**. 

All database operations and business logic are now integrated directly inside the main and renderer processes of the Electron application.

---

## 7. Data Architecture — Local SQLite

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

## 8. Security Architecture

- **Context Isolation**: Enabled in all windows. Renderer processes communicate only through whitelisted IPC channels in the preload script.
- **Keychain Storage**: API keys are saved in the OS keychain via `keytar` to prevent raw exposure on disk or in standard localStorage.
- **Local SQLite DB**: The SQLite file lives in the system's protected user data folders.
- **Offline AES-256-GCM**: Downloaded segments are encrypted on-the-fly using AES-256-GCM keys dynamically derived from a device hardware fingerprint, preventing unauthorized sharing or raw file access.

---

## 9. Infrastructure

No hosting infrastructure or local Docker orchestration is required. The application only requires the local desktop runtime.

---

## 10. IPC Bridge & API Contracts

All transactions between the UI and backend logic are defined by the IPC contracts exposed in `client/src/main/preload.ts` under the global `window.electronAPI` bridge:

- `electronAPI.getTmdbApiKey(accountId)` / `setTmdbApiKey(accountId, key)`
- `electronAPI.watchlistGet(profileId)` / `watchlistAdd(contentId, type, profileId)` / `watchlistRemove(contentId, profileId)`
- `electronAPI.positionGet(contentId, episodeId, profileId)` / `positionSave(contentId, episodeId, type, pos, dur, completedAt, profileId)`
- `electronAPI.preferencesGet(profileId)` / `preferencesSave(prefs, profileId)`
