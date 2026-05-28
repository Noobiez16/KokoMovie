<div align="center">

<img src="client/src/renderer/assets/logo.png" width="120" alt="KokoMovie logo" />

# KokoMovie

**All your movies and TV shows in one beautiful app — free, no subscriptions, no clutter.**

[![Version](https://img.shields.io/badge/version-1.0.4--beta-8B5CF6?style=for-the-badge)](https://github.com/Noobiez16/KokoMovie/releases)
[![Platforms](https://img.shields.io/badge/Windows%20·%20Linux%20·%20macOS-100B21?style=for-the-badge&labelColor=8B5CF6)](#-download)
[![Auto-Update](https://img.shields.io/badge/updates-automatic-A78BFA?style=for-the-badge)](#-automatic-updates)

</div>

---

## 📥 Download

Pick your system and click to grab the latest version from the
**[Releases page](https://github.com/Noobiez16/KokoMovie/releases/latest)**:

<div align="center">

[![Download for Windows](https://img.shields.io/badge/Windows-Download%20.exe-8B5CF6?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/Noobiez16/KokoMovie/releases/latest)
&nbsp;
[![Download for Linux (.deb)](https://img.shields.io/badge/Linux-Download%20.deb-8B5CF6?style=for-the-badge&logo=debian&logoColor=white)](https://github.com/Noobiez16/KokoMovie/releases/latest)
&nbsp;
[![Download for Linux (AppImage)](https://img.shields.io/badge/Linux-Download%20.AppImage-A78BFA?style=for-the-badge&logo=linux&logoColor=white)](https://github.com/Noobiez16/KokoMovie/releases/latest)

</div>

> **On macOS?** A ready-made installer isn't published yet. You can build the app
> yourself — see [For Developers](#-for-developers) below.

---

## ✨ What is KokoMovie?

KokoMovie is a desktop app that brings movies and TV shows together in one place,
with a clean, modern interface. Search for anything, hit **Watch**, and it finds a
stream for you automatically — no juggling websites, pop-ups, or sign-ups.

- 🎬 **A real catalog** — posters, ratings, cast, and descriptions for thousands of titles
- ▶️ **One-click play** — KokoMovie finds a working stream and starts playing
- 📺 **Built-in player** — quality options, subtitles, Picture-in-Picture, and keyboard shortcuts
- 👤 **Profiles** — separate watchlists and "continue watching" for each person
- ⬇️ **Watch offline** — download titles (securely encrypted) for when you're without internet
- 🔄 **Always up to date** — the app updates itself in the background

---

## 🔄 Automatic Updates

You only download KokoMovie once. After that, it **checks for new versions on its own**
and installs them quietly in the background — the next time you open the app, you're
already on the latest version. No re-downloading, no reinstalling.

> 💡 On Linux, automatic updates work with the **AppImage** version. The `.deb` package
> is updated like other system apps when you reinstall it.

---

## 🚀 Getting Started

1. **Download and install** KokoMovie for your system (buttons above).
2. **Open the app** and create an account, then pick or create a profile.
3. **Add a free TMDB key** so the catalog fills with movies and shows
   (one-time, 2 minutes — see below).
4. **Browse or search**, click any poster, and press **Watch**. That's it.

### Getting your free TMDB key

KokoMovie uses [TMDB](https://www.themoviedb.org/) (the same free movie database behind
many popular apps) to show posters, titles, and details. It's free and takes a minute:

1. Create a free account at [themoviedb.org](https://www.themoviedb.org/).
2. Go to **[Settings → API](https://www.themoviedb.org/settings/api)** and request a key
   (choose "Developer", non-commercial use — it's instant).
3. Copy your **API Key**.
4. In KokoMovie, open **Settings → API Configuration**, paste the key, and click
   **Validate & Save**. Done — your key is stored securely on your device.

---

## ❓ FAQ

**Is it free?** Yes. There are no subscriptions or accounts to pay for.

**Where do the movies come from?** KokoMovie doesn't host any videos. When you press
Watch, it locates a stream from third-party sources — the same ones you'd find browsing
the web — and plays it in its built-in player.

**Do I need the TMDB key?** Yes, to see the catalog. It's free and one-time (steps above).

**Will my data be uploaded anywhere?** No. Your profiles, watchlist, and history stay
on your computer.

---

<details>
<summary><h2>🛠️ For Developers</h2></summary>

KokoMovie is an Electron + React desktop client backed by local Node.js (Fastify)
microservices. Metadata comes from TMDB; streams are located by loading third-party
embed pages in a sandboxed hidden window and intercepting the video URL.

### Prerequisites

- Node.js 22+, npm 10+
- Docker (PostgreSQL, Redis, DynamoDB Local)
- A free [TMDB API key](https://www.themoviedb.org/settings/api)

### Run locally

```bash
git clone https://github.com/Noobiez16/KokoMovie
cd KokoMovie
npm install
cp .env.example .env
npm run dev
```

`npm run dev` starts the Docker containers, runs migrations, launches all services
(auth, user, catalog, playback, recommendation), and opens the Electron app.

### Project structure

```
KokoMovie/
├── client/                 # Electron app
│   └── src/
│       ├── main/           # Main process (Node.js): providers, stream-extractor, ipc, updater
│       └── renderer/       # React app (Vite): pages, components, api clients
├── services/
│   ├── auth/               # JWT auth, refresh tokens, OAuth
│   ├── user/               # Profiles, watchlist, preferences
│   ├── catalog/            # TMDB integration, metadata, search
│   ├── playback/           # Sessions, watch position
│   └── recommendation/     # Home rows, similar content
├── scripts/                # DB init, dev setup
└── docker-compose.yml      # PostgreSQL, Redis, DynamoDB Local
```

### Development commands

| Command | Description |
|---|---|
| `npm run dev` | Start everything (Docker + services + Electron) |
| `npm run dev:services` | Start only the backend services |
| `npm run dev:client` | Start only the Electron/Vite client |
| `npm run docker:up` / `docker:down` | Start / stop infrastructure |
| `npm run migrate:all` | Run DB migrations for all services |
| `npm run build` | Build all packages |
| `npm run lint` | Run ESLint |

### Building installers

```bash
# Linux (.AppImage + .deb)  →  client/release/linux/
sudo apt install build-essential python3 libsecret-1-dev
cd client && npm run dist:linux

# Windows (.exe)  →  client/release/windows/   (run on Windows)
cd client && npm run dist:win

# macOS (.dmg)  →  client/release/mac/   (run on a Mac; needs Apple signing for notarization)
cd client && npm run dist:mac
```

### Releasing (auto-update pipeline)

Releases are built by GitHub Actions (`.github/workflows/electron-release.yml`) on any
`v*` tag. The workflow builds Windows + Linux, then publishes the installers **plus the
`latest.yml` / `latest-linux.yml` and `.blockmap` files** to a GitHub Release. Those
metadata files are what `electron-updater` reads to deliver automatic updates, so they
must be attached to every release.

```bash
git tag v1.0.4-beta
git push origin v1.0.4-beta
```

Auto-update is configured in `client/src/main/updater.ts` and the `publish:` block of
each `client/electron-builder.*.yml` (GitHub provider → `Noobiez16/KokoMovie`).

### Stream providers

Providers live in `client/src/main/providers/` and are registered in `registry.ts`.
Each enabled provider joins a staggered parallel race; the first to return a working
stream wins. To add one, implement the `Provider` interface and register it. Manage
active providers in the app under **Providers**.

### Tech stack

**Client:** Electron 31 · React 19 · Vite 5 · TypeScript · TailwindCSS 3 · TanStack Query v5 · Zustand v5 · hls.js v1.5
**Services:** Fastify 5 · Drizzle ORM · PostgreSQL 16 · ioredis · AWS SDK v3 (DynamoDB Local) · Zod · Jose (JWT RS256)
**Infra:** Docker Compose · PostgreSQL 16 · Redis 7 · DynamoDB Local

</details>

---

## ⚖️ Legal Notice

KokoMovie does not host, store, or distribute any video content. All streams are located
by loading third-party embed pages in a sandboxed browser context, at the user's explicit
request — equivalent to visiting those pages in your own browser. Use of third-party
streaming sites is subject to their terms of service and the law in your jurisdiction.
This project is for personal and educational use only.
