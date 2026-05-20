# KokoMovie PC

An advanced, cross-platform desktop streaming aggregator engineered for Linux, Windows, and macOS. Built with a modern technology stack encompassing Electron, React, and Fastify, the application seamlessly aggregates real-time metadata from TMDB and bridges it with dynamic third-party video delivery networks (e.g., VidSrc, VidLink, SuperEmbed). It provides a frictionless, zero-configuration viewing experience—bypassing subscriptions, complex self-hosting requirements, and restrictive DRM.

---

## How It Works

KokoMovie PC is **not** a self-hosted Netflix. It is a content aggregator:

1. **Catalog**: Real metadata (titles, posters, cast, genres, ratings) from [TMDB](https://www.themoviedb.org/) — the same free database behind Letterboxd, Plex, and Infuse.
2. **Streams**: When you click Watch, a provider picker appears. Select a provider (e.g. VidSrc), and KokoMovie opens a hidden browser window, loads the embed page, intercepts the `.m3u8` video URL, and feeds it to the built-in HLS player — similar to how Stremio or browser extensions work.
3. **Profile data**: Watch history, continue watching, and watchlists are stored locally (PostgreSQL + DynamoDB Local). No cloud account needed.

---

## Features

- Real movie and TV show catalog from TMDB (trending, genre rows, search)
- Multiple stream providers — VidSrc, 2Embed, SuperEmbed — with per-provider toggle
- Built-in HLS player with quality selection, subtitles, Picture-in-Picture, and keyboard shortcuts
- Watchlist and continue watching across multiple profiles
- Multi-profile support per account
- Offline download queue (HLS segments, AES-128 encrypted)
- Works on Linux, Windows, macOS

---

## Getting Started

### Prerequisites

- Node.js 22+, npm 10+
- Docker (for PostgreSQL, Redis, DynamoDB Local)
- A free [TMDB API key](https://www.themoviedb.org/settings/api)

### 1. Clone and Install

```bash
git clone https://github.com/Noobiez16/KokoMovie
cd kokomovie-pc
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and add your TMDB API key:

```env
TMDB_API_KEY=your_key_here
```

All other defaults (database URLs, ports) work out of the box for local development.

### 3. Start Everything

```bash
npm run dev
```

This command:
1. Starts Docker containers (PostgreSQL, Redis, DynamoDB Local)
2. Runs database migrations
3. Starts all microservices (auth, user, catalog, playback, recommendation)
4. Starts the Electron app + Vite dev server

On first launch, create an account, then select or create a profile. The Home page populates immediately from TMDB if your API key is set.

> **No TMDB key?** You can still use the app — the catalog will be empty on a fresh install until you ingest content manually via `POST /catalog/ingest`.

---

## Watching Content

1. Browse the Home page, Movies, or Series to find something to watch
2. Click any poster to open the content detail page
3. Click **Watch** — KokoMovie races all enabled providers in parallel and collects every working stream
4. The highest-quality stream wins and playback starts automatically
5. Inside the player, open **Select Source** (bottom controls) to switch to any alternative provider — sources confirmed working for this title show a green **A** badge; sources that returned nothing show a dimmed red **S** badge. Switching to an **A** source is instant; **S** sources trigger a fresh extraction attempt

To manage which providers are active, go to **Providers** in the left sidebar.

---

## Project Structure

```
kokomovie-pc/
├── client/                        # Electron app
│   └── src/
│       ├── main/                  # Electron main process (Node.js)
│       │   ├── providers/         # Stream provider definitions (VidSrc, 2Embed, SuperEmbed)
│       │   ├── stream-extractor/  # Hidden BrowserWindow-based stream URL interceptor
│       │   └── ipc/               # IPC handlers (auth, downloads, providers, API proxy)
│       └── renderer/              # React app (Vite)
│           ├── pages/             # Route-level pages
│           ├── components/        # Shared UI components
│           └── api/               # Service API clients
│
├── services/
│   ├── auth/            # JWT auth, refresh tokens, OAuth
│   ├── user/            # Profiles, watchlist, preferences
│   ├── catalog/         # TMDB integration, content metadata, search
│   ├── playback/        # Session management, watch position tracking
│   └── recommendation/  # Home rows, similar content, A/B experiments
│
├── scripts/             # DB init SQL, dev setup script
└── docker-compose.yml   # PostgreSQL, Redis, DynamoDB Local
```

---

## Stream Providers

Providers are configured at **Providers** in the app sidebar. All enabled providers participate in a staggered parallel race — the first one to return a working stream wins. Available providers:

| Provider | Domain | ID Required |
|---|---|---|
| VidBinge | `vidbinge.com` | IMDB ID |
| VidSrc | `vidsrc.to` | IMDB ID preferred, TMDB fallback |
| VidSrc.su | `vidsrc.su` | TMDB ID |
| VidSrc.pm | `vidsrc.pm` | TMDB ID |
| VidSrc.in (vsrc.su) | `vsrc.su` | IMDB or TMDB ID |
| VidLink | `vidlink.pro` | TMDB ID |
| VidSrc.cc | `vidsrc.cc` | IMDB ID |
| MultiEmbed | `multiembed.mov` | TMDB ID |
| VidSrc.pro | `vidsrc.pro` | TMDB ID |
| VidSrc.rip | `vidsrc.rip` | TMDB ID |
| AutoEmbed | `autoembed.cc` | TMDB ID |
| SuperEmbed | `multiembed.mov` | TMDB ID |
| VidSrc.me (vidsrcme) | `vidsrcme.su` | TMDB ID |
| 2Embed | `2embed.cc` | IMDB ID preferred |
| SmashyStream | `smashystream.com` | TMDB ID |
| MoviesAPI | `moviesapi.to` | TMDB ID |
| EmbedSu | `embed.su` | TMDB ID |

**How it works**: Each provider has an embed URL pattern. KokoMovie opens the embed page in a hidden Electron `BrowserWindow` with a persistent session, monitors outbound network requests via `webRequest.onSendHeaders`, and captures the first `.m3u8` or `.mp4` URL it finds. That URL is then passed to a built-in local HTTP proxy server running in the main process (`http://localhost:PORT`), which fetches segments using a custom Node-level fetcher (`fetchNode`) to bypass Electron's forbidden headers restriction (like Referer/Origin) and Chromium's strict CORS enforcement, before feeding the stream to `hls.js` in the main window. Providers are raced in parallel batches of 4, staggered 1.5 seconds apart.

**To add a new provider**: implement the `Provider` interface in `client/src/main/providers/` and register it in `registry.ts`.

---

## TMDB API Key

Get a free API key at [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api) — no credit card required. Without a key, the catalog is empty on a fresh install.

---

## Infrastructure

Only 3 Docker services required (PostgreSQL, Redis, DynamoDB Local):

```bash
npm run docker:up
```

| Service | Port | Purpose |
|---|---|---|
| PostgreSQL 16 | 5432 | User accounts, profiles, catalog metadata |
| Redis 7 | 6379 | Response cache (catalog, trending) |
| DynamoDB Local | 8000 | Playback sessions, watch history, A/B experiments |

---

## Microservice Ports

| Service | Port |
|---|---|
| Auth | 3001 |
| Catalog | 3002 |
| Playback | 3003 |
| User | 3004 |
| Recommendation | 3005 |

---

## Development Commands

| Command | Description |
|---|---|
| `npm run dev` | Start everything (Docker + services + Electron) |
| `npm run dev:services` | Start only the backend services |
| `npm run dev:client` | Start only the Electron/Vite client |
| `npm run docker:up` | Start infrastructure containers |
| `npm run docker:down` | Stop containers |
| `npm run migrate:all` | Run DB migrations for all services |
| `npm run build` | Build all packages |
| `npm run lint` | Run ESLint |

---

## Building for Distribution

### Linux

```bash
sudo apt install build-essential python3 libsecret-1-dev
cd client && npm run dist:linux
# Output: client/release/linux/ (.AppImage + .deb)
```

### Windows

Build on a Windows machine or via CI (GitHub Actions `electron-release.yml`):

```bash
cd client && npm run dist:win
# Output: client/release/windows/
```

### macOS

Requires a Mac or `macos-latest` GitHub Actions runner (for code signing + notarization):

```bash
cd client && npm run dist:mac
# Output: client/release/mac/ (.dmg)
```

Push a version tag to trigger parallel builds on all three platforms:

```bash
git tag v1.0.0 && git push origin v1.0.0
```

---

## Tech Stack

**Client**
- Electron 31 (main: Node.js, renderer: Chromium)
- React 19 + Vite 5 + TypeScript
- TailwindCSS 3
- TanStack Query v5 (data fetching + cache)
- Zustand v5 (auth/UI state)
- hls.js v1.5 (HLS player)

**Services**
- Fastify 5 (HTTP framework)
- Drizzle ORM + PostgreSQL 16
- ioredis (Redis client)
- AWS SDK v3 (DynamoDB Local)
- Zod (runtime validation)
- Jose (JWT RS256)

**Infrastructure**
- Docker Compose (local dev)
- PostgreSQL 16
- Redis 7
- DynamoDB Local

---

## Legal Notice

KokoMovie PC does not host, store, or distribute any video content. All streams are located by loading third-party embed pages in a sandboxed browser context, at the user's explicit request. This is equivalent to a user visiting those pages in their own browser. Use of third-party streaming sites is subject to their terms of service and applicable law in your jurisdiction. This project is for personal and educational use only.
