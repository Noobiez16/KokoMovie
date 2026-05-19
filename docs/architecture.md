# KokoMovie PC — Architecture

**Version:** 2.0.0  
**Date:** May 2026  
**Status:** Current

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture Decision Records](#2-architecture-decision-records)
3. [System Architecture](#3-system-architecture)
4. [Client Architecture — Electron + React](#4-client-architecture--electron--react)
5. [Providers Framework](#5-providers-framework)
6. [Backend Microservices](#6-backend-microservices)
7. [Data Architecture](#7-data-architecture)
8. [Security Architecture](#8-security-architecture)
9. [Infrastructure](#9-infrastructure)
10. [API Contracts](#10-api-contracts)

---

## 1. Project Overview

### What KokoMovie PC Is

KokoMovie PC is a **desktop content aggregator** — not a self-hosted streaming service. It browses real movie and TV show metadata from [TMDB](https://www.themoviedb.org/) and streams content via third-party providers (VidSrc, 2Embed, SuperEmbed). No self-hosted video, no CDN, no DRM, no subscriptions.

The mental model: KokoMovie is like Stremio or Infuse — it finds streams, it does not host them.

### What it is NOT

- Not a self-hosted Netflix (no S3 video, no MediaConvert, no CloudFront media CDN)
- Not a subscription service (billing removed)
- Not a cloud-dependent application (runs entirely on localhost with 3 Docker containers)

### Personas

| Persona | Key Jobs |
|---|---|
| Casual Viewer | Browse TMDB catalog, pick a provider, watch |
| Power User | Manage providers, download for offline, multiple profiles |

---

## 2. Architecture Decision Records

### ADR-001 — Electron for cross-platform desktop

**Decision:** Electron 33  
**Rationale:** Cross-platform (Linux/Windows/macOS), embedded Chromium for hls.js HLS playback, Node.js main process for hidden BrowserWindow stream extraction, OS keychain access via `keytar`.

### ADR-002 — Content aggregator model (v2.0 pivot from self-hosted)

**Decision:** TMDB metadata + third-party providers instead of self-hosted VOD  
**Rationale:** Eliminates infrastructure cost (S3, CloudFront, MediaConvert), DRM licensing complexity, and content licensing requirements. Providers supply streams on-demand. The TMDB free tier provides complete metadata for all mainstream titles.  
**Trade-off:** Stream availability depends on provider uptime. Multiple providers mitigate this.

### ADR-003 — Hidden BrowserWindow stream extraction

**Decision:** Load provider embed pages in a hidden `BrowserWindow`, intercept `.m3u8` via Electron's `webRequest.onSendHeaders`  
**Rationale:** Providers protect streams behind JavaScript challenges that require a real browser context. `onSendHeaders` fires with both URL and request headers simultaneously, giving us the stream URL and any required auth headers (Referer, Origin) in one callback.  
**Alternative considered:** Playwright/Puppeteer — too heavy, adds 150MB+ to bundle; `onBeforeRequest` — fires before headers are set so headers are empty.

### ADR-004 — Persistent provider sessions

**Decision:** `session.fromPartition('persist:provider-{name}')` per provider  
**Rationale:** Providers that use cookie/localStorage anti-bot checks (re-captcha gates, access tokens) will succeed on repeat visits because session state is preserved. Ephemeral sessions fail after the first use on such providers.

### ADR-005 — Deterministic UUIDs for TMDB content IDs

**Decision:** `tmdbContentId(type, id)` generates a stable UUID from `tmdb:{type}:{id}`  
**Rationale:** Allows the client to compute the content UUID before the row exists in the DB, enabling optimistic navigation. The UUID is stable across the entire system — the same TMDB movie always gets the same UUID.

### ADR-006 — JWT RS256 for stateless auth

**Decision:** RS4096 asymmetric JWT, 15-min access token, 30-day refresh token  
**Rationale:** Services verify tokens with the public key only — no network call to Auth service per request. RS256 is preferred over HS256 because downstream services never need the signing secret.

### ADR-007 — HLS via hls.js with header injection

**Decision:** hls.js in Renderer process; Electron `webRequest.onBeforeSendHeaders` injects captured headers  
**Rationale:** hls.js runs in the Renderer (Chromium) and cannot add arbitrary cross-origin headers due to CORS. The Main process intercepts all outbound requests and injects provider-captured headers (Referer, etc.) transparently before CORS enforcement.

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
│  │   React 18 + Vite            │  │   Providers Registry    │   │
│  │   TanStack Query             │  │   Stream Extractor      │   │
│  │   Zustand                    │◄─┤   IPC Handlers          │   │
│  │   hls.js (video player)      │  │   keytar (keychain)     │   │
│  │   React Router (HashRouter)  │  │   Header Injector       │   │
│  └──────────────┬───────────────┘  └────────────────────────┘   │
└─────────────────┼───────────────────────────────────────────────┘
                  │ HTTP (via Electron net.fetch proxy)
                  │
     ┌────────────┼────────────────────────────────┐
     │            │                                │
┌────▼──┐  ┌──────▼──┐  ┌──────────┐  ┌────────┐  ┌────────────┐
│ Auth  │  │ Catalog  │  │ Playback │  │  User  │  │   Rec.     │
│ :3001 │  │  :3002   │  │  :3003   │  │  :3004 │  │   :3005    │
└────┬──┘  └────┬─────┘  └────┬─────┘  └───┬────┘  └─────┬──────┘
     │          │              │             │              │
┌────▼──────────▼──────────────▼─────────────▼──────────────▼────┐
│                         Data Layer                               │
│   PostgreSQL 16 · Redis 7 · DynamoDB Local                      │
└─────────────────────────────────────────────────────────────────┘

                         ┌──────────────────┐
                         │   TMDB API       │  (catalog metadata)
                         │   themoviedb.org │
                         └──────────────────┘

                         ┌──────────────────┐
                         │   Providers      │  (streams)
                         │   vidsrc.to      │
                         │   vidsrc.me      │
                         │   2embed.cc      │
                         │   multiembed.mov │
                         └──────────────────┘
```

### Data Flow: Browsing

```
User opens app
  → Renderer calls GET /catalog/browse/home
  → Catalog service calls TMDB API (trending + popular by genre)
  → Returns ContentSummary[] with TMDB poster URLs, titles, IDs
  → React renders genre rows + hero banner
```

### Data Flow: Watching

```
User clicks Watch on a title
  → ContentDetail calls POST /catalog/sync (TMDB full detail → DB)
  → Source picker modal opens
  → User picks provider (e.g. VidSrc)
  → IPC: providers:getStream(providerId, { imdbId, tmdbId, type, season?, episode? })
  → Main process creates hidden BrowserWindow with persistent provider session
  → Hidden window loads embed URL (e.g. https://vidsrc.to/embed/movie/tt1234567)
  → webRequest.onSendHeaders intercepts first *.m3u8 request
  → Stream URL + headers returned to Renderer
  → Player page opens with directStreamUrl in navigation state
  → VideoPlayer creates HLS.js instance, loads manifest
  → webRequest.onBeforeSendHeaders injects provider headers on segment requests
  → Video plays
```

---

## 4. Client Architecture — Electron + React

### Process Model

```
Main Process (Node.js)
├── BrowserWindow (main app, HashRouter)
├── IPC handlers
│   ├── keychain:* — OS keychain via keytar
│   ├── api:request — CORS proxy (net.fetch)
│   ├── providers:* — provider registry + stream extraction
│   └── download:* — offline HLS download queue
├── initStreamHeaderInjector() — permanent webRequest interceptor
├── Stream Extractor
│   └── Hidden BrowserWindows (per extraction, persistent sessions)
└── Provider Registry
    └── provider-prefs.json (userData dir)

Renderer Process (Chromium)
└── React app (HashRouter, prevents black screen on Ctrl+R from file://)
    ├── Pages: Browse, Search, ContentDetail, Player, Providers, Downloads, ...
    ├── Components: AppLayout, VideoPlayer, PlayerControls, ContentCard, ...
    ├── API clients → window.electronAPI (contextBridge IPC)
    └── Stores: auth (Zustand), queryClient (TanStack Query)
```

### Key Security Settings

```typescript
new BrowserWindow({
  webPreferences: {
    contextIsolation: true,   // isolates renderer from Node.js
    nodeIntegration: false,   // no Node.js in renderer
    sandbox: true,
    preload: preloadPath,
  }
})
```

All renderer ↔ main communication goes through `contextBridge.exposeInMainWorld('electronAPI', {...})`. The preload script whitelists each IPC channel explicitly.

### Content Security Policy (dev)

```
default-src 'self'
script-src 'self'
style-src 'self' 'unsafe-inline'
media-src 'self' blob: https:
connect-src 'self' http://localhost:* ws://localhost:* https:
img-src 'self' data: https:
frame-src 'none'
```

### State Management

| Layer | Tool | What |
|---|---|---|
| Server state | TanStack Query | Catalog data, watchlists, playback positions |
| Auth/UI state | Zustand | Active profile, authenticated user |
| Navigation state | React Router | TMDB IDs passed between Browse → Detail → Player |

---

## 5. Providers Framework

### Provider Interface

```typescript
interface Provider {
  readonly id: string
  readonly name: string
  readonly sessionName: string        // persistent Electron session partition key
  getEmbedUrl(req: StreamRequest): string | null
}

interface StreamRequest {
  imdbId?: string; tmdbId?: number
  type: 'movie' | 'tv'
  season?: number; episode?: number
  title?: string
}
```

### Registered Providers

| ID | Name | Source | ID type |
|---|---|---|---|
| `vidsrc` | VidSrc | vidsrc.to | IMDB ID preferred, TMDB fallback |
| `vidsrc-me` | VidSrc.me | vidsrc.me | TMDB ID |
| `2embed` | 2Embed | 2embed.cc | IMDB ID preferred, TMDB fallback |
| `superembed` | SuperEmbed | multiembed.mov | TMDB ID |

### Stream Extraction Pipeline

```
extractStreamWithRetry(embedUrl, { sessionName, maxAttempts: 2, timeoutMs: 30s })
  → extractStream(embedUrl, options)
      → BrowserWindow (show: false, persistent session)
      → webRequest.onSendHeaders: detect *.m3u8 URL → capture URL + headers
      → webRequest.onHeadersReceived: detect by Content-Type (fallback)
      → webRequest.onBeforeRequest: block ads/trackers
      → loadURL(embedUrl, { httpReferrer: origin })
      → resolve({ url, headers }) or null on timeout
```

### Header Injection

Provider streams often require a `Referer` or custom auth header. Since hls.js runs in the Renderer and can't add cross-origin headers, the Main process intercepts all outbound requests:

```typescript
// initStreamHeaderInjector() — called once on app startup
session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['*://*/*'] }, (details, callback) => {
  const host = new URL(details.url).host
  const headers = streamHeadersRegistry.get(host)  // keyed by URL host
  if (headers) { callback({ requestHeaders: { ...details.requestHeaders, ...headers } }); return }
  callback({ requestHeaders: details.requestHeaders })
})
```

Headers are registered via `providers:registerStreamHeaders` IPC with a 4-hour expiry.

---

## 6. Backend Microservices

All services run as Node.js 22 + Fastify 5 + TypeScript 5.5 (strict). JWT RS256 authentication on all endpoints via `authenticate` middleware (verifies against `GET /auth/public-key`).

### 6.1 Auth Service (port 3001)

Handles identity, sessions, OAuth. JWT RS4096 with 15-min access tokens, 30-day refresh tokens. Tokens stored in OS keychain via `keytar`, never `localStorage`.

| Method | Path | Description |
|---|---|---|
| POST | `/auth/register` | Email/password registration |
| POST | `/auth/login` | Login, returns JWT pair |
| POST | `/auth/refresh` | Refresh token rotation |
| POST | `/auth/logout` | Revoke refresh token |
| GET | `/auth/oauth/google` | Google OAuth2 flow |
| POST | `/auth/mfa/setup` | TOTP setup |
| POST | `/auth/mfa/verify` | TOTP verification |
| GET | `/auth/public-key` | RS4096 public key (used by all services) |

**Data:** PostgreSQL (accounts, sessions) + Redis (token denylist)

### 6.2 Catalog Service (port 3002)

Manages content metadata. Primary source is TMDB. Local PostgreSQL DB is populated on-demand as users browse. Fully functional with an empty DB as long as a TMDB API key is configured.

| Method | Path | Description |
|---|---|---|
| GET | `/catalog/browse/home` | Genre rows + featured + trending (TMDB) |
| GET | `/catalog/browse` | Paginated browse with genre/type/year filters |
| GET | `/catalog/trending` | Trending content (TMDB) |
| GET | `/catalog/content/:id` | Full detail: genres, cast, seasons, episodes |
| GET | `/catalog/search` | Full-text search (TMDB `/search/multi`) |
| POST | `/catalog/sync` | Sync a TMDB item into local DB (fetch imdbId, cast, episodes) |
| POST | `/catalog/ingest` | Manual content ingestion |

**TMDB sync flow:**
1. Browse/trending returns lightweight `ContentSummary` with `tmdbId` embedded
2. When user opens detail, client calls `POST /catalog/sync` to fully hydrate the row (imdbId, cast, all season episodes)
3. `GET /catalog/content/:id` serves from DB; lazily syncs any seasons still missing episodes

**Data:** PostgreSQL (content, seasons, episodes, cast) + Redis (1hr–30min cache per endpoint)

### 6.3 Playback Service (port 3003)

Manages playback sessions and watch positions. No video hosting — sessions reference the provider stream URL. Continue Watching and position heartbeats work the same regardless of stream source.

| Method | Path | Description |
|---|---|---|
| POST | `/playback/session` | Create session (records start, returns sessionId) |
| PUT | `/playback/position` | Heartbeat every 10s |
| GET | `/playback/position/:contentId` | Resume position |
| GET | `/playback/continue-watching` | In-progress content (5–95% complete) |
| POST | `/playback/quality-report` | ABR quality telemetry |

**Data:** DynamoDB Local (sessions with 24hr TTL, positions with 90-day TTL)

### 6.4 User Service (port 3004)

Profiles, watchlists, history, preferences, GDPR export.

| Method | Path | Description |
|---|---|---|
| GET/POST/PUT/DELETE | `/user/profiles` | Profile CRUD (max 5) |
| GET/POST/DELETE | `/user/watchlist/:contentId` | Watchlist management |
| GET | `/user/history` | Paginated viewing history |
| GET/PUT | `/user/preferences` | Profile preferences |
| GET | `/user/export` | GDPR data export |

**Data:** PostgreSQL (accounts, profiles, preferences) + DynamoDB Local (watchlists, history)

### 6.5 Recommendation Service (port 3005)

Generates homepage rows, similar content, and trending. Falls back gracefully when catalog data is sparse.

| Method | Path | Description |
|---|---|---|
| GET | `/recommendations/home` | Personalised rows (A/B tested row order) |
| GET | `/recommendations/similar/:contentId` | "More Like This" |
| GET | `/recommendations/trending` | Trending by segment |

**Data:** Redis (2-min cache) + DynamoDB Local (A/B experiment assignments)

---

## 7. Data Architecture

### PostgreSQL Schema (Catalog + Auth + User)

```sql
-- catalog schema
content(id, title, type, tmdb_id, imdb_id, backdrop_url, s3_thumbnail, ...)
seasons(id, content_id, season_number, ...)
episodes(id, season_id, content_id, episode_number, ...)
genres, content_genres, cast_members, content_cast

-- auth schema
accounts(id, email, password_hash, ...)
sessions(id, account_id, refresh_token_hash, ...)

-- user schema
accounts_ext(id, ...)
profiles(id, account_id, name, avatar_url, ...)
```

### DynamoDB Local Tables

```
playback_sessions   PK: sessionId         TTL: 24hr
playback_positions  PK: profileId  SK: contentId#episodeId  TTL: 90d
watchlists          PK: profileId  SK: contentId
viewing_history     PK: profileId  SK: watchedAt#contentId  TTL: 90d
ab_experiments      PK: experimentId
ab_assignments      PK: profileId  SK: experimentId
```

### Redis Cache Keys

| Key | TTL | Contents |
|---|---|---|
| `browse:home` | 1hr | Homepage rows from TMDB |
| `browse:{params}` | 30min | Filtered browse results |
| `trending:global` | 1hr | Trending 20 items |
| `content:{id}` | 30min | Full content detail |
| `genres:all` | 24hr | Genre list |
| `rec:{profileId}:{variant}` | 2min | Recommendation rows |

---

## 8. Security Architecture

### Electron Security

| Setting | Value | Why |
|---|---|---|
| `contextIsolation` | `true` | Isolates renderer from Node.js APIs |
| `nodeIntegration` | `false` | Renderer cannot access Node.js directly |
| `sandbox` | `true` | OS-level process sandboxing |
| `webSecurity` | `true` (main), `false` (extractor) | Extractor needs cross-origin for providers |
| preload | contextBridge only | Whitelist-only IPC surface |

The stream extractor `BrowserWindow` uses `webSecurity: false` specifically to allow cross-origin embed loading. The main window always has `webSecurity: true`.

### Auth Security

- **Passwords:** bcrypt cost 12
- **JWT:** RS4096 asymmetric, 15-min access token TTL
- **Refresh tokens:** SHA-256 hashed before storage, rotated on every use
- **Storage:** OS keychain via `keytar` — never `localStorage`
- **Token denylist:** Redis (for logout + device revocation)
- **MFA:** TOTP with brute-force protection (5 attempts / 5 min via Redis)

### CORS / Network

All renderer HTTP calls go through the `api:request` IPC channel → `net.fetch` in Main process. This bypasses Chromium CORS restrictions for the local microservices and any external API.

---

## 9. Infrastructure

### Local Development (Docker Compose)

Three containers are required. No cloud accounts needed.

```yaml
services:
  db:           # PostgreSQL 16 — port 5432
  redis:        # Redis 7 — port 6379
  dynamodb-local: # DynamoDB Local — port 8000
```

### Microservice Ports

| Service | Port |
|---|---|
| Auth | 3001 |
| Catalog | 3002 |
| Playback | 3003 |
| User | 3004 |
| Recommendation | 3005 |

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `TMDB_API_KEY` | Yes (for catalog) | Free key from themoviedb.org |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | Redis connection string |
| `DYNAMODB_*` | Yes | DynamoDB Local endpoint + fake credentials |
| `JWT_PRIVATE_KEY` | Yes (auth) | RSA-4096 private key (generate with `scripts/generate-keys.mjs`) |
| `JWT_PUBLIC_KEY` | Yes (other services) | RSA-4096 public key |

### Electron Build Targets

| Platform | Format | Command |
|---|---|---|
| Linux | `.AppImage` + `.deb` | `cd client && npm run dist:linux` |
| Windows | NSIS installer | `cd client && npm run dist:win` |
| macOS | `.dmg` | `cd client && npm run dist:mac` |

---

## 10. API Contracts

### Authentication Header

All authenticated endpoints require:
```
Authorization: Bearer <access_token>
X-Profile-Id: <profile_uuid>
```

### Standard Response Envelope

```json
{
  "success": true,
  "data": { ... },
  "meta": { "requestId": "uuid", "timestamp": "ISO8601" }
}
```

### Error Response

```json
{
  "success": false,
  "error": { "code": "CONTENT_NOT_FOUND", "message": "..." },
  "meta": { "requestId": "uuid", "timestamp": "ISO8601" }
}
```

### Error Codes

| Code | HTTP | Description |
|---|---|---|
| `AUTH_TOKEN_EXPIRED` | 401 | Refresh required |
| `AUTH_TOKEN_INVALID` | 401 | Malformed JWT |
| `CONTENT_NOT_FOUND` | 404 | Content ID does not exist |
| `PROFILE_LIMIT_REACHED` | 422 | Account has 5 profiles |
| `VALIDATION_ERROR` | 400 | Request body/query schema failed |
| `NO_TMDB` | 503 | Catalog service has no TMDB API key |
| `SYNC_ERROR` | 500 | TMDB sync failed |
| `RATE_LIMITED` | 429 | Too many requests |

---

*Architecture v2.0.0 — Aggregator model. Replaces v1.0.0 (self-hosted Netflix / AWS architecture). May 2026.*
