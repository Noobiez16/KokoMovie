# Changelog

All notable changes to KokoMovie PC are documented here.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).  
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.1.5-beta] — 2026-06-04 — Persistent PiP, Resilient Playback & Library Refinements

### Changed
- **Unified Viewing History**: Collapsed the History page's separate **In Progress** / **Completed** / **All** tabs into a single streamlined **Viewing History** list, sorted newest-first by last-viewed timestamp. Completion is now a per-row **status badge** — a green "✓ Completed" pill, or a violet "In Progress · N%" pill (with the existing progress bar and a Continue button) — driven by each item's completion / progress. The saved Watchlist remains as a separate "My List" tab.

### Added
- **Back Button on Detail Pages**: Movie/series detail pages now have a themed "Back" button overlaying the top-left of the backdrop, so users can return to where they came from without relying on the sidebar.
- **Remove from Continue Watching**: Continue Watching cards now show a hover **×** button (top-right). Clicking it doesn't start playback — it removes the title immediately (optimistic UI), then cascade-deletes every **in-progress** position record for that content, so it also disappears from **Viewing History → In Progress**. Completed-episode history is preserved. New `library:position:delete-content` IPC + `playbackApi.removeFromContinueWatching`; the Browse row updates the React Query cache instantly and invalidates the history query.
- **Auto-Update Controls (Settings → Preferences → Application Updates)**: The auto-updater (shipped in 1.0.4) had no user control — it always checked, downloaded, and installed on quit. Added:
  - An **"Automatic Updates" switch** to turn it off. The preference is authoritative in the **main process** (persisted to `update-prefs.json` in userData) so it's honoured **at startup** — when off, the updater genuinely stops checking/auto-downloading/auto-installing, not just hides the toast.
  - A **"Check for Updates" → Check Now** button so users don't have to wait for the 4-hour cycle; it reports "checking / up to date / update found — downloading / error" inline. An explicit check downloads even when auto-update is off (clear user intent), so the install prompt still appears.
  - A new reusable **accessible `ToggleSwitch`** component (`role="switch"`, `aria-checked`, keyboard-operable with a focus-visible ring, disabled state, smooth Tailwind slide + colour transition).
  - New IPC: `app:get-auto-update` / `app:set-auto-update` / `app:check-for-updates`.
- **Themed Update Notification + Changelog Link**: Restyled the update toast to the app's violet-glass theme (gradient surface, violet ring, gradient **"Install Update"** button + **"Later"**), and it now always shows a **"What's new"** link to that version's GitHub release notes (opens in the system browser).
- **In-App Picture-in-Picture (Persistent Player)**: The video player's lifecycle was lifted out of the `/player` route into a global, always-mounted `PlayerHost` (rendered at the app root, outside `<Routes>`) driven by a new `usePlayerStore` (Zustand). Playback now **persists across navigation** — a new "Picture-in-Picture" control (next to fullscreen) shrinks the player into a **draggable, resizable, themed floating overlay** while the main router outlet stays fully interactive, so you can browse Home / Movies / Series / Library while the video keeps playing. The box is anchored to the bottom-right corner (so it stays put when the window toggles fullscreen instead of drifting to the centre) and can be **resized via a top-left grip** (16:9-locked, anchored bottom-right). The single `VideoPlayer` instance is keyed so toggling full ⇄ PiP only repositions it (no remount, no lost progress). **Clicking anywhere in the PiP body returns to fullscreen** (rather than pausing the video), and the draggable title bar (title + expand/close, violet-glass themed) **fades in only while the pointer is over the PiP**. (PiP chrome is layered above the player's `z-50` surface so it stays visible and clickable.) `pages/Player.tsx` is now a thin launcher that feeds the store; `VideoPlayer` gained `embedded` (PiP layout) and `onPip` props. To keep startup light, `VideoPlayer` (which pulls in hls.js) is lazy-loaded by the host — the ~570 kB chunk is only fetched on first playback, so the main bundle is unchanged for users who are just browsing.
- **Audio Language Menu (Scaffold)**: Added an "Audio" section to the player's unified settings gear (alongside Source · Subtitles · Quality), so the menu now covers both audio and subtitle language selection. It's a forward-looking scaffold: a modular `AudioTrackOption` structure + `audioTracks` / `currentAudioTrack` / `onAudioTrackChange` props on `PlayerControls`, with the "Original" (stream default) option always available and a placeholder "No additional audio tracks for this title" state. No real languages are wired yet — the empty `audioTracks` array is ready to be populated from hls.js audio renditions later. Also: the settings overlay now **auto-closes when playback resumes** (paused → playing), in addition to the existing click-away dismissal.
- **Reusable "Next Episode" Button**: New `NextEpisodeButton` component wired into the player controls — a compact skip-to-next icon beside play/pause, plus a prominent "Next Episode ›" button over the end credits (replacing a dead placeholder). It's driven by the existing cross-season `nextEpisode` computation in `Player.tsx`, so it hides automatically for movies and shows an "all caught up" end-of-series state on the season finale. Selecting it now **extracts a fresh stream for the next episode and plays it directly** (with a "Loading next episode…" spinner), instead of the old `handleNextEpisode` behaviour that dropped the user back on the content detail page. Falls back to the detail page only if no stream can be found.
- **Auto-Rebuffer-to-Goal Playback**: Provider CDNs that deliver segments at (or below) real-time used to produce a stutter-storm — play a second, freeze, play a second — forcing the user to manually pause and "let it load" (notably MovieAPI on certain episodes). The player now does this automatically: when the buffer runs dry it **pauses once and resumes only after a healthy forward cushion has built** (8s to start, growing up to 30s on repeated stalls, then decaying back after a smooth stretch). This turns a freeze-loop into a single deliberate wait and is bandwidth-agnostic — ABR still picks the quality, this only governs when playback is allowed to run. Lives in `VideoPlayer.tsx` (`startRebuffer`/`endRebuffer`).
- **HLS Decryption-Key Failure Fallback**: A `keyLoadError` / `keyLoadTimeOut` (the HLS AES key URI failing to load) means segments can never be decrypted — quality capping or nudging can't help. After a couple of failures the player now **auto-switches to the next collected source** instead of stalling forever (unless the source is user-pinned, in which case it keeps retrying).

### Changed
- **Stall Recovery Reworked — Build Buffer, Don't Drop Quality**: Non-fatal `bufferStalledError` / `fragLoadTimeOut` errors are now handled by kicking the loader and handing off to the auto-rebuffer controller, rather than force-capping the bitrate down. On a provider-bound stall (where the client has bandwidth to spare — e.g. 400 Mbps), dropping quality doesn't help and just degrades the picture; building a buffer does. ABR is left to adapt quality to the measured throughput on its own.
- **User-Pinned Source Is Never Auto-Abandoned**: When the user explicitly picks a source (e.g. the only mirror with the black-and-white cut of a series), the player now *pins* it — the auto-fallback watchdog will keep trying to recover that source instead of silently switching to a different one. Previously a slow/encrypted source the user chose deliberately could be swapped out from under them mid-watch.
- **Player Starts in Pure AUTO**: Removed the `hls.nextLevel = highest` override on `MANIFEST_PARSED` that forced the first fragment to the top resolution. On slow providers that guaranteed an immediate buffer stall on startup. The player now starts in AUTO and lets ABR ramp quality up from a safe level once throughput proves out. (Supersedes the "start at highest via `nextLevel`" guidance in DN-011 — see DN-035.)
- **Deeper Forward Buffer & More Patient Retries**: `maxMaxBufferLength` raised 120s → 600s, added a stall watchdog (`highBufferWatchdogPeriod`, `nudgeOffset`, `nudgeMaxRetry`) to slip past tiny gaps, and made fragment loading more patient (8 retries, 30s timeout, exponential backoff). `maxBufferLength` (60s) and `maxBufferSize` (180 MB) preserved per DN-021.
- **Source-Switch Watchdog Is Now Progress-Aware**: The 25s "stuck → switch source" safety net no longer fires while a source is *slowly but steadily* filling its buffer — it only falls back when the buffered end makes **no progress for 20s** (a genuinely dead source). This stops the player from yanking the user off a deliberately-chosen source (e.g. the only black-and-white mirror) just because it's slow.

### Fixed
- **"Continue Watching" Duplicated The Same Series**: `playback_positions` stores one row per episode, so a show appeared once per watched episode in the carousel (and tripped React's "two children with the same key" warning). Continue Watching now shows **one card per title — the most advanced in-progress episode** (`dedupeByTitle` in `api/playback.ts`).
- **"Viewing History" Duplicated The Same Series**: Same root cause. History now shows **one entry per title — the most advanced episode watched** (e.g. after finishing 1–3 and jumping to 4, it shows a single `S1:E4` row, not four). Season/episode numbers are now populated so the UI labels the episode.
- **"Trending Now" & Genre Rows Duplicated**: `Browse.tsx` rendered the recommendation rows (which already contain Trending + every genre) *and* a standalone Trending row *and* the home genre rows — so each appeared twice. Removed the redundant recommendation block (a duplicate fetch of the same TMDB data). Also added a defensive de-dupe-by-id inside the catalog mapper so a title TMDB returns twice in one result set never renders a duplicate card.
- **Encrypted Streams `keyLoadError` (Root Cause) — Key URL Now Proxied**: The stream proxy's manifest rewriter only rewrote segment URLs that sit on their own line; it missed the AES-128 decryption key, whose URL lives *inside* the `#EXT-X-KEY:...,URI="https://…"` tag. hls.js therefore fetched the key straight from the CDN with no `Referer`/`Origin`/cookies, getting a 403/timeout — the persistent `keyLoadError` that broke MovieAPI's encrypted streams. The proxy now rewrites `URI="…"` attributes on `#EXT-X-KEY` / `#EXT-X-MAP` / `#EXT-X-MEDIA` / `#EXT-X-SESSION-KEY` tags so the key (and init segment / alt-media) load through the proxy with the right headers. Also hardened hls.js's `keyLoadPolicy` (the default retries a timed-out key only **once**) to 8 retries with long timeouts and backoff.

---

## [1.0.4-beta] — 2026-05-28 — Security Hardening, User-Configured TMDB Keys & New Branding Icon

### Added
- **Automatic Updates**: Wired `electron-updater` end-to-end. The app checks for new releases on launch and every 4 hours, downloads them in the background, and shows an in-app notification (`UpdateNotification`) naming the new version with a "Restart & Install" action; updates also install automatically on quit. The release CI now publishes the `latest.yml` / `latest-linux.yml` and `.blockmap` update metadata alongside the installers (without these, updates are never detected), and the GitHub publish target was corrected from `kokomovie-pc` to `KokoMovie`.
- **TMDB v4 Read Token Support**: `tmdbFetch` and the Settings validation now accept both v3 API keys (`api_key` query param) and v4 read access tokens (JWT sent as `Authorization: Bearer`). Previously a pasted v4 token returned 401 on every call, silently degrading the whole catalog to the local database.
- **API Key Required Gate**: When the signed-in account has no TMDB key configured, the catalog pages (Home, Movies, Series) now show a clear "A TMDB API key is required" screen that links to Settings — instead of silently rendering a thin local-only catalog. The key is stored per account in the OS keychain and loaded automatically on reconnect, so it only needs to be entered once per account.
- **Limited-Catalog Indicator**: Catalog responses now report their data source (`meta.source: 'tmdb' | 'local'`). If a key is configured but TMDB can't be reached, a non-blocking banner explains that a limited offline catalog is being shown.
- **Player Loading Overlay**: The video player now shows a "Loading video…" overlay from when a stream begins loading until the first frame actually plays, replacing the brief black screen before playback starts.
- **Unified Player Settings Menu**: The three separate player buttons (subtitles, source, quality) were consolidated behind a single gear icon with a **drill-down layout** like mainstream players — a home list shows each category (Source · Subtitles · Quality) with its current value, and tapping one opens its options with a back arrow. Click-away to dismiss.
- **Automatic Source Fallback**: If the playing source can't actually deliver video — segments never start, buffering hangs past 25s, or hls.js hits repeated fatal network errors — the player now automatically switches to the next collected alternative source instead of spinning on "Loading video…". Sources already tried are remembered per title; when none are left it shows a clear, actionable error. This is the main reliability win for flaky CDNs.
- **Subtitle Size Remembered**: The chosen subtitle size (S / M / L) now persists across titles and sessions via `localStorage`, instead of resetting to Medium for every video.
- **User-Facing README**: Rewrote `README.md` for end users — themed download buttons per platform, plain-language setup/FAQ, and developer docs moved into a collapsible section.

### Fixed
- **"See All" Pagination Regression**: Restored the full TMDB-backed catalog in the category "See All" views. The pages had been showing only the ~2 pages of the local fallback DB; with a valid key they again page through the full TMDB library (hundreds to thousands of pages).
- **Duplicate Titles in "See All"**: Re-added de-duplication by content ID in the Browse/Movies/Series category grids (the grid had dropped the dedup during the rows redesign).
- **Playback Stalls / `ERR_CONTENT_LENGTH_MISMATCH`**: The local stream proxy now streams segments resiliently. Flaky CDNs that close the socket mid-segment (delivering fewer bytes than their advertised `Content-Length`) previously caused Chromium to abort the request and playback to freeze. The proxy now tracks bytes delivered and transparently resumes the missing tail via HTTP Range requests (up to 6 attempts), only finishing the response once every promised byte has been sent — and resets the connection for a clean player retry if it truly can't recover. Hop-by-hop headers (`connection`, `transfer-encoding`, etc.) are no longer forwarded.
- **Subtitle Timing Controls Inverted**: The in-player subtitle sync stepper had its `+`/`−` tooltips reversed (labelled "Advance"/"Delay" backwards relative to the actual offset), so adjusting timing often made it worse. Relabelled to clear "earlier / later" semantics with a hint and a Reset button; steps are rounded to avoid floating-point drift.
- **Seek Freeze With No Feedback**: Seeking on a slow CDN could leave the player on a frozen frame for a long time with no indication anything was happening. Added a debounced buffering overlay (driven by the video `waiting`/`seeking`/`stalled` events) so the user sees a "Loading…" spinner while the new position fetches.
- **`ERR_EMPTY_RESPONSE` On Seek**: A seek that hit a range the CDN answered with an empty `206` previously committed those headers and then reset the socket, surfacing to Chromium as `ERR_EMPTY_RESPONSE`. The segment proxy now defers the response headers until the first body byte arrives, so a zero-byte/early-failed range is retried wholesale (up to 6 attempts) before anything is sent — and returns a clean `502` only if truly exhausted, never an empty `206`. Backpressure is honoured via manual writes + the response `drain` event.
- **"Continue Watching" Out of Sync With History**: Deleting an item from Viewing History left it in the Continue Watching carousel, because the two are backed by separate stores (history in `viewing_history`, resume points in `playback_positions`). Added `DELETE /playback/position/:contentId` and made the history-delete action clear the matching resume position as well, so removing something from history now also removes it from Continue Watching.
- **Automatic Subtitle Sync (VAD)**: New opt-in "Auto-sync subtitles" action in the player's subtitle settings. It taps the playing audio non-invasively (`captureStream` → Web Audio `AnalyserNode`, which never reroutes/mutes playback), runs Voice Activity Detection over a ~28s window measuring energy only in the **human voice band (~300–3400 Hz)** so music/score/SFX aren't mistaken for speech, builds the subtitle cue-activity timeline, and cross-correlates the two to estimate the offset — applied instantly via the in-memory cue shift. It's fail-safe: it only applies an offset when the correlation has a sharp, dominant peak (high confidence **and** a clear winner over competing lags); otherwise it changes nothing and prompts the manual nudge. This prevents music-heavy intros (e.g. stylised shows) from syncing to the soundtrack. Lives in `lib/subtitleAutoSync.ts`.
- **Subtitle Delay Refactor — No More Bleeding / Instant Offset**: The manual subtitle-timing control previously re-fetched the whole VTT through the proxy with a new `&offset=` and remounted the `<track>`, which left residual cues on screen ("bleeding") and made every nudge a network round-trip. Subtitles now load once and the offset is applied **in-memory by shifting each cue's start/end time** — instant, no refetch, no remount, and the browser's native cue lifecycle clears cleanly.
- **Duplicated Subtitles After Switching Source**: Changing the stream source while subtitles were on showed them twice. Each source switch builds a fresh hls.js instance, which auto-enabled an internal subtitle track on top of the selected external one. The player now re-applies the active subtitle choice whenever a new source's tracks load (and when the instance is created), and disables the outgoing instance's track before teardown — so exactly one subtitle layer is ever shown.
- **"Continue Watching" Stuck Loading Forever**: Resuming a title could spin on the loading overlay indefinitely. The provider race (`getFirstStream`) only resolved once every worker drained, so a single worker hung on an inner call (e.g. a stuck resolution probe) blocked the whole search. Added an absolute 40s safety-net timeout in the main process that resolves with the best stream found so far (or `null`), plus a 50s client-side guard on the IPC round-trip — so the resume flow always ends in either playback or a clear error.

### Added (original 1.0.4-beta scope)
- **User-Configurable TMDB API Key**: Integrated a local settings store (`settingsStore` via Zustand/localStorage) and professional API Configuration UI. Users can input and validate their own TMDB API keys directly in the application Settings. This allows zero-config binary execution without requiring local/backend `.env` variables, passing the key dynamically via `X-TMDB-Key` HTTP headers to backend services.
- **Premium Tabbed Settings Dashboard**: Refactored the settings screen into a highly structured, horizontal-tab layout (Preferences, API Configuration, Downloads, and Privacy) and removed all emojis in favor of sleek, custom vector SVG graphics. Includes an interactive Preset Avatar selector featuring 6 theme options (Sunset Palm, Retro Cinema, Voyager, Spotlight, Synthwave, and Peak) to update profile pictures instantly without server load, while preserving custom image uploads.
- **Tropical Branding & Brand Icon**: Recreated the KokoMovie logo and application icon with a fresh theme: a vibrant neon-accented palm tree wrapped in a classic celluloid film strip (styled like a decorated Christmas tree) over a dark-purple glassmorphic background. Rebuilt icons for all platforms (Windows `.ico`, macOS `.icns`, Linux `.png`s).

### Fixed & Hardened (Snyk Vulnerabilities Mitigation)
- **Electron Main Process & IPC Security**:
  - Addressed 51 security issues reported during the repository audit.
  - Implemented strict regex and path resolution validation in the downloader to prevent directory traversal attacks.
  - Restricted provider IPC service listeners to the local loopback (127.0.0.1) and added rate limiting, timeout handling, and request bounds.
  - Restricted the `postMessage` event handlers in `HeroBanner` to target origin `https://www.youtube.com` only.
  - Sanitized backend error responses to prevent internal stack trace or system information leakage.
- **Client & Subtitles Sanity**:
  - Implemented secure URL sanitization for movie trailers and background backdrop images in `ContentDetail` to block open redirects and cross-site scripting (XSS).
  - Validated buffer types in the DRM widevine handler to prevent out-of-bounds memory exposure.
  - Hardened automated unit/integration tests by purging hardcoded authentication passwords and API key secrets.
  - Upgraded dependencies (`drizzle-orm`, `@fastify/jwt`) to resolve upstream CVEs.
  - **Redis Cache Isolation**: Varied Redis cache keys in the catalog microservice by the user's `X-TMDB-Key` API key hash to prevent cross-user cache leakage and resolve catalog pagination UI bugs.
  - **Subtitle Proxy Port Fallback**: Added a local IPC listener to query the dynamic stream proxy port from the Electron main process, restoring sideloaded closed captions/subtitles for unproxied CDN video sources.
  - **Local DB Fallback Home Section**: Restored the "Trending Now" section on the home page when falling back to the local database.
- **Infrastructure Security**:
  - Hardened Terraform AWS modules: configured AWS KMS CMK encryption for S3 buckets, turned on DynamoDB Point-in-Time Recovery (PITR), enabled ECS Container Insights, locked down ECR tags with immutability, and configured AWS VPC flow logs.
  - Established a `.snyk` baseline policy file to track accepted architecture choices.

---

## [1.0.3-beta] — 2026-05-22 — Custom Settings, Offline Support & Downloader Stabilisation

### Added
- **Offline Playback & Custom Protocol**: Registered `offline://` custom protocol scheme to securely fetch and decrypt downloaded segments on-the-fly, enabling smooth video playback without internet access.
- **Custom Download Location**: Added configuration settings to type or browse (via native directory picker) a custom download path, stored persistently in `localStorage`.
- **Viewing History List Tab**: Added a "+ My List" watchlist tab inside the Watch History page to easily browse bookmarked movies and series.
- **Episode-Level & Multi-Season Downloads**: Introduced a 3-dots actions menu next to "+ My List" on movie/series details and next to episode play buttons, enabling download of individual episodes, movies, or all seasons.
- **Watchlist Optimistic Updates**: Implemented React Query optimistic cache mutations for instant visual toggling of "+ My List" / "✓ In My List" buttons.
- **HLS Stream Quality Optimization (1080p Target)**: Master HLS manifest parser now grades and selects standard height 1080p variants first, using standard aspect-ratio mapping (getStandardHeight), before falling back to highest bandwidth or standard resolutions.
- **Startup Queue Auto-Resume**: Interrupted active downloads are automatically reset to 'pending' and resumed on application start.

### Fixed
- **Picture-in-Picture Removal**: Disabled Picture-in-Picture globally in the media player and removed its buttons/handlers to maintain layout integrity.
- **Downloader Timeout & Progress Calculations**: Added a 30-second request timeout to prevent hanging connections, and fixed progress percentage tracking for segments with unknown/chunked HTTP content lengths.
- **Immediate Cancel Deletion**: Updated cancel behavior to instantly abort running segment fetches, delete the corresponding local files/folders, and wipe the sqlite database record.
- **Header Merging & Casing Conflicts**: Merges scraper and custom headers case-insensitively, preventing duplicate cased header keys (e.g. Referer vs referer) that caused CDN 403 Forbidden blocks.
- **Original Protocol Preservation**: Proxy URLs and downloaded segment requests correctly preserve HTTP vs HTTPS protocols, preventing timeouts and socket connection errors on HTTP-only stream variants.

---

## [1.0.2-beta] — 2026-05-20 — Source Switching & Availability Indicators

### Added
- **Source Availability Badges (A/S)**: "Select Source" dropdown now shows a green **A** badge for providers with a confirmed pre-extracted stream, and a dimmed red **S** badge for providers that returned nothing during the initial race. Available sources are listed first above a divider; shut-down entries remain clickable for on-demand re-extraction.

### Fixed
- **Source Switching Broken**: `VideoPlayer` accepted an `allStreams` prop from `Player.tsx` but it was missing from the TypeScript `Props` interface, causing it to be silently dropped. Every source switch triggered a fresh 30s extraction instead of using the pre-collected streams, making nearly all alternative sources appear broken.
- **Instant Source Switching**: `handleSourceChange` now checks `allStreams` first. Providers collected during the initial race switch instantly with no IPC call; only uncached providers fall through to the slow extraction path.
- **Duplicate Movie Keys**: `Movies.tsx` deduplicates entries by ID before rendering, resolving the React `key` warning when the catalog API returns duplicate records.

---

## [1.0.1-beta] — 2026-05-20 — High Quality Streaming Upgrades

### Changed
- **High-Quality Resolution Filtering**: Integrated resolution parsing into the HLS local proxy. The proxy automatically filters out stream variants below 720p (such as 360p or 480p) from HLS manifests, ensuring playback defaults to HD (720p/1080p).
- **Auto 720p/1080p Selection**: Standardized stream levels so the player presents Auto, 720p, and 1080p, and defaults to 1080p when bandwidth is sufficient.

### Fixed
- **VidLink Extraction 404**: Corrected VidLink provider URL mapping by stripping the `/embed` route prefix, restoring instant stream extraction and high-quality 1080p streams.
- **VidSrc.me Domain Update**: Swapped the defunct `vidsrc.me` with the active `vidsrcme.su` domain.
- **VidSrc.in Domain Update**: Swapped the defunct `vidsrc.in` with the active `vsrc.su` domain.

---

## [1.0.0-beta] — 2026-05-19 — UI, UX and Provider Expansion

### Added
- **UI/UX Purple Theme**: Completely redesigned the UI moving away from a Netflix clone to a premium dark-purple aesthetic with dynamic animations, glassmorphism, and updated dropdown components.
- **Hero Trailer Backgrounds**: Added dynamic YouTube background trailers in the HeroBanner. Uses `ResizeObserver` for exact 16:9 full-cover scaling and `postMessage` API for fluid mute/unmute toggling without iframe reloads.
- **Expanded Provider Engine**: Added multiple new active stream providers (`VidSrc.pro`, `VidSrc.rip`, `VidSrc.su`, `VidSrc.pm`, `VidSrc.in`, `VidLink`, `VidSrc.cc`).
- **Direct Video Extraction**: Added `.mp4` and `.webm` format capture in the extraction engine for faster direct-play media link discovery.

### Changed
- **Staggered Parallel Racing**: Sped up provider stream discovery by reducing stagger time to 1.5 seconds and timeout to 8 seconds.
- **Resource Blocking**: Stream extractor headless window now aggressively blocks `.css` and font assets to speed up extraction page loads.

### Fixed
- **"Content Not Found" on Reload**: Implemented reversible UUID encoding for content IDs to allow dynamic on-the-fly TMDB synchronization, eliminating 404s when reloading a content detail page.
- **CAM/TS Quality Filter**: Implemented `isCamStream` detection in the extractor to aggressively reject low-quality theater recordings and prioritize HD streams.
- **TV Season Sync Dropouts**: Forced the synchronization engine to always upsert all episodes for all seasons rather than skipping if some already existed.
- **Search Sync Drift**: Fixed `Search.tsx` state drift by syncing the query parameter in the URL with the local React state via `useEffect`.

---

## [2.0.0] — 2026-05-17 — Aggregator Architecture Pivot

### Breaking Changes

This release is a fundamental architectural pivot from a self-hosted Netflix clone to a **content aggregator**. The application no longer hosts or serves video — it sources streams from third-party providers on demand.

### Removed

- **Billing Service** — Stripe subscriptions, plan tiers (Basic/Standard/Premium 4K), invoice history, billing UI, billing API client. All content is now free to watch.
- **Kafka / Redpanda** — All Kafka brokers, producers, and consumers removed from every service. Playback events and recommendation pipelines were fully decoupled.
- **OpenSearch** — Full-text search replaced with TMDB `/search/multi` endpoint. No local search index required.
- **AWS infrastructure requirement** — No S3, CloudFront, MediaConvert, MSK, Personalize, or ECS required. Docker Compose with 3 containers is sufficient.
- **"AI Search" / Semantic search mode** — UI toggle removed; search now calls TMDB directly. `catalogApi.semanticSearch` kept in API client but not exposed in UI.
- **Plan tier badges** on content cards — `planMinimum` no longer displayed.
- **Billing nav item** — Replaced with Providers.

### Added

#### TMDB Integration

- **Catalog service** now backed by TMDB API (`TMDB_API_KEY` env var)
  - `GET /catalog/browse/home` — live TMDB trending + 12 genre rows from `discoverMovie`/`discoverTv`
  - `GET /catalog/browse` — TMDB `/movie/popular` + `/tv/popular` when no filters applied
  - `GET /catalog/trending` — TMDB `/trending/all/week`
  - `GET /catalog/search` — TMDB `/search/multi`
  - `POST /catalog/sync` — on-demand full sync of a TMDB item: fetches `external_ids.imdb_id`, cast (top 10), and all season episodes into local PostgreSQL DB
- **Deterministic UUIDs** from TMDB type+id (`tmdbContentId()`): stable content IDs across all services, computed client-side before DB sync
- **All seasons synced** — `syncTv()` now fetches episode details for all seasons (up to 8), not just season 1
- **Lazy episode loading** — `serveFromDb()` detects seasons with 0 episodes and fetches them from TMDB on first content detail request, retroactively fixing old synced entries

#### Providers Framework (Electron Main Process)

- **Provider interface** (`client/src/main/providers/interface.ts`) — `Provider`, `StreamRequest`, `ProviderResult`, `StreamSource`
- **Registered providers:**
  - `vidsrc` — vidsrc.to, IMDB ID preferred, TMDB fallback
  - `vidsrc-me` — vidsrc.me, TMDB ID via `?tmdb=` query params
  - `2embed` — 2embed.cc, IMDB ID preferred
  - `superembed` — multiembed.mov, TMDB ID only
- **Provider registry** (`registry.ts`) — persistent JSON prefs in Electron `userData`, enabled by default, survives restarts
- **Stream extractor** (`stream-extractor/index.ts`) — hidden `BrowserWindow` with persistent session, `webRequest.onSendHeaders` as primary stream detector (captures URL + headers simultaneously), `onHeadersReceived` as Content-Type fallback, `onBeforeRequest` for ad blocking; 2-attempt retry; 30s timeout; UA rotation
- **IPC handlers** (`ipc/providers.ts`) — `providers:list`, `providers:toggle`, `providers:getStream`, `providers:getFirstStream`, `providers:registerStreamHeaders`
- **Stream header injector** — `initStreamHeaderInjector()` patches `session.defaultSession.webRequest.onBeforeSendHeaders` on startup; injects provider-captured headers (Referer, etc.) into all HLS segment requests transparently

#### Frontend Updates

- **Source picker modal** in `ContentDetailPage` — shows all enabled providers, per-provider loading spinner, error display, link to Providers settings if none enabled
- **Providers settings page** (`/providers`) — toggle switches per provider with descriptions
- **Player accepts direct stream URLs** — navigation state `{ streamUrl, streamHeaders }` bypasses playback service session creation; synthetic `PlaybackSession` created locally
- **`streamHeaders` prop** on `VideoPlayer` — registers headers with main process header injector on mount
- **HLS.js error recovery** — `NETWORK_ERROR` → `startLoad()`, `MEDIA_ERROR` → `recoverMediaError()`, fatal → error state UI with "Choose Another Source" button
- **HLS.js retry config** — `manifestLoadingMaxRetry: 3`, `fragLoadingMaxRetry: 3`
- **`ContentCard`** passes `{ tmdbId, tmdbType }` in navigation state for TMDB sync on detail view
- **`HeroBanner`** uses `backdropUrl ?? s3Thumbnail`; passes `{ tmdbId, tmdbType }` state
- **`ContentSummary` type** updated: `backdropUrl`, `imdbId`, `tmdbId` fields added
- **`HomeData.featured`** typed as `ContentSummary | null` (TMDB home returns summaries, not full detail)
- **Download button** hidden when content has no `s3HlsKey` (TMDB content has no hosted HLS)

### Fixed

- **Season 2+ empty episode list** — `syncTv` was only fetching episodes for season 1; now syncs all seasons
- **Empty headers on provider streams** — `onBeforeRequest` was firing before headers were set; switched to `onSendHeaders` as primary detector
- **Provider registry crash on first run** — `writeFileSync` failing when `userData` dir didn't exist; added `mkdirSync(dirname(path), { recursive: true })`
- **`billingClient` leftover export** in `api/client.ts` — removed
- **`ContentDetail.backdropUrl` duplicate** in TypeScript interface — removed redundant field declaration from `ContentDetail` (inherited from `ContentSummary`)

### Architecture

- Architecture document (`docs/architecture.md`) rewritten from v1.0.0 (AWS microservices self-hosted Netflix) to v2.0.0 (aggregator model)
- `docker-compose.yml` reduced to 3 services: PostgreSQL, Redis, DynamoDB Local
- README rewritten to reflect aggregator model and new Getting Started flow

---

## [1.0.0] — 2026-05-15 — Phase 5 Complete (Sprint 9) — Production Ready

### Added

#### Epic 9 — DevOps, Infrastructure & Hardening

**Terraform IaC (E9-S1)**
- Full modular Terraform infrastructure under `infra/terraform/`
  - `modules/vpc` — VPC with 3 AZs, 3-tier subnets (public/private/database), 3 NAT Gateways, 5 security groups (ALB, ECS, RDS, Redis, MSK), VPC flow logs to CloudWatch
  - `modules/ecr` — 6 ECR repositories (auth, catalog, playback, user, recommendation, billing) with lifecycle policies (keep 10 tagged + 5 untagged) and `scan_on_push = true`
  - `modules/rds` — Aurora PostgreSQL 16 Global Database, Multi-AZ writer + reader, 35-day automated backups, PITR enabled, enhanced monitoring, Secrets Manager rotation
  - `modules/dynamodb` — 6 tables (playback_sessions, playback_positions, watchlists, viewing_history, ab_experiments, ab_assignments) with Global Tables replication (us-east-1 + us-west-2), TTL, PITR
  - `modules/elasticache` — Redis 7.2 cluster mode (3 shards), TLS + AUTH token, slow logs
  - `modules/msk` — MSK Kafka 3.6.0, SASL/IAM auth, 3 brokers (kafka.m5.large), 4 topics with retention config
  - `modules/s3` — media/assets/ingest buckets, versioning, Intelligent-Tiering, access logging, public access blocked
  - `modules/cloudfront` — 2 distributions (media CDN + API passthrough), OAC for S3 access, WAF v2 (OWASP CRS + rate limit 3k req/5min per IP), custom cache policies
  - `modules/ecs` — ECS Fargate cluster, ALB with HTTPS listener + ACM cert, 6 task definitions, path-based routing, deployment circuit breaker with rollback, Container Insights, auto-scaling at 70% CPU
  - `modules/route53` — A/AAAA alias records, health checks, automatic failover policy to us-west-2
  - Root module: S3 + DynamoDB remote state backend, separate staging/production tfvars
  - `envs/staging.tfvars` — reduced instance sizes for cost (t3.small DB, cache.t3.medium Redis)
  - `envs/production.tfvars` — production sizing (r6g.large Aurora, cache.r7g.large Redis, kafka.m5.large MSK)

**Terraform CI/CD (E9-S2)**
- `.github/workflows/terraform.yml` — OIDC AWS authentication, validate → plan-staging → apply-staging → plan-production → apply-production (manual gate), plan artifacts uploaded, PR comments with plan output

**k6 Load Tests (E9-S4)**
- `load-tests/k6/config.js` — shared BASE_URL, TEST_ACCOUNT, global thresholds (http_req_failed < 1%, p95 < 500ms)
- `load-tests/k6/auth.js` — 200 concurrent logins/min, ramping-arrival-rate, login + refresh rotation; `login_duration_ms` p95 < 500ms threshold
- `load-tests/k6/catalog.js` — 500 req/s total (350 browse + 150 search), constant-arrival-rate; `browse_duration_ms` p95 < 150ms (cached), `search_duration_ms` p95 < 300ms
- `load-tests/k6/streaming.js` — 10,000 concurrent streams (ramping-vus: 5m ramp → 10m sustain → 3m ramp-down), 10s position heartbeats; `session_create_duration` p95 < 300ms, `position_update_duration` p95 < 100ms
- `load-tests/k6/smoke.js` — 1 VU sanity check (auth → refresh → catalog browse/genres/search → playback health → user profiles → billing plans), all checks must pass (rate == 1.0)

**Security Audit (E9-S5)**
- `docs/security-audit.md` — comprehensive security assessment
  - OWASP Top 10 (2021): all 10 categories assessed; A06 (Vulnerable Components) flagged for monthly audit schedule
  - Electron Security Checklist: `contextIsolation`, `nodeIntegration: false`, `sandbox`, `webSecurity`, `contextBridge`-only preload, CSP, certificate pinning — all PASS
  - Authentication audit: bcrypt cost 12, JWT RS256 algorithm pinned, 15-min token TTL, refresh rotation, SHA-256 hash-only refresh storage, Redis denylist, MFA brute-force protection — all PASS
  - API security audit: rate limiting, Zod validation, Drizzle parameterised queries, CORS, Helmet headers, Stripe HMAC — all PASS
  - Offline encryption audit: AES-256-GCM, HKDF-SHA256, device-bound keys, per-segment random IV, GCM auth tag — all PASS
  - Infrastructure audit: VPC private subnets, least-privilege SGs, RDS encryption at rest, S3 public access blocked, CloudFront OAC, WAF OWASP CRS, ECR scan-on-push, Secrets Manager — all PASS
  - GDPR: right to export PASS; right to erasure PARTIAL (hard-delete Lambda not deployed — MEDIUM finding)
  - 3 actionable findings: [MEDIUM] hard-delete Lambda pending; [LOW] COMPUTERNAME fingerprint on shared Windows; [LOW] 2 low-severity npm audit advisories
  - Pen test scope defined: auth service, Electron IPC, DRM license proxy, Stripe webhook, S3 signed URLs, API Gateway

**DR Runbook (E9-S6)**
- `docs/dr-runbook.md` — full failover procedure from us-east-1 to us-west-2
  - Phase 1: Aurora Global Database promotion with replication lag verification and Secrets Manager update
  - Phase 2: DynamoDB Global Tables verification (active-active, no promotion needed)
  - Phase 3: ElastiCache Redis DR cluster scale-up and endpoint update
  - Phase 4: MSK Kafka DR cluster verification
  - Phase 5: ECS Fargate service scale-up (warm standby → production), force new deployment, health check validation
  - Phase 6: Route 53 DNS failover (automatic health-check-triggered + manual override procedure)
  - Post-failover: k6 smoke test + manual verification checklist
  - RTO/RPO measurement commands
  - Failback procedure
  - Quarterly DR drill schedule with logging requirements

### Architecture
- RTO < 15 minutes, RPO < 5 minutes achieved via Aurora Global Database + DynamoDB Global Tables + Route 53 health check failover
- ECS deployment circuit breaker with automatic rollback on health check failure
- All secrets in AWS Secrets Manager (DB password, Redis auth token, Stripe key, JWT private key) — no plaintext environment variables in production

---

## [0.5.0] — 2026-05-15 — Phase 4 Complete (Sprints 7–8)

### Added

#### Epic 7 — Stripe Billing

- Billing Service (`services/billing/`) — Fastify 5, Drizzle ORM, PostgreSQL `billing` schema
  - `billing.subscriptions` — account→plan mapping, Stripe customer/sub IDs, trial/renewal dates
  - `billing.invoices` — per-account invoice records with Stripe PDF URLs
  - `billing.webhook_events` — idempotency table keyed on `stripe_event_id`
  - `GET /billing/plans` — public plan comparison (Basic $9.99, Standard $15.99, Premium 4K $22.99)
  - `POST /billing/subscribe` — create subscription (dev: mock IDs, prod: real Stripe customer + subscription)
  - `PUT /billing/subscribe` — upgrade/downgrade plan (prod: proration via Stripe API)
  - `DELETE /billing/subscribe` — cancel at period end
  - `GET /billing/subscription` — current subscription status + planDetails
  - `GET /billing/invoices` — invoice history
  - `POST /billing/portal` — Stripe Customer Portal session URL
  - `POST /billing/webhook` — Stripe webhook handler with HMAC signature verification (raw body via `addContentTypeParser`), two-layer idempotency (unique index + pre-record), handles `customer.subscription.*`, `invoice.paid`, `invoice.payment_failed`
  - Dev mode bypass: `STRIPE_SECRET_KEY = 'sk_test_placeholder'` skips all Stripe API calls
- Auth Service updated: plan embedded in JWT at login/register/refresh time
  - `services/auth/src/lib/plan.ts` — `getAccountPlan()` queries `billing.subscriptions` cross-schema; returns `'none'` on expired trial, cancelled, or if billing not yet migrated
  - `services/auth/src/lib/billing.ts` — `createTrialSubscription()` inserts 14-day trial at registration with `ON CONFLICT DO NOTHING`
  - Login, register, and refresh handlers now include `plan` claim in access token
- Client Billing UI
  - `BillingPage` (`/billing`) — three-plan grid with price, features, current-plan badge, Subscribe/Switch buttons; trial countdown; cancel with confirmation; error feedback
  - `InvoicesPage` (`/billing/invoices`) — invoice table with date, amount, status, PDF download; Stripe Customer Portal button
  - `api/billing.ts` — full billing API client (getPlans, getSubscription, create/update/cancelSubscription, getInvoices, createPortalSession)
  - AppLayout: added Billing (`/billing`) nav item

#### Epic 8 — Offline Downloads

- Electron main process — offline download engine (`client/src/main/ipc/download.ts`)
  - AES-256-GCM segment encryption: HKDF key derivation from device fingerprint (SHA-256 of userData + platform + COMPUTERNAME) + drmKeyId as salt, info string `kokomovie-offline-v1`
  - Segment layout: `[IV(12 bytes)][GCM AuthTag(16 bytes)][Ciphertext]`
  - HLS manifest parser: fetches master playlist → picks highest-bandwidth variant → downloads all segments
  - Segments encrypted and stored as `.enc` files; manifest rewritten with `offline://downloadId/seg_N.enc` URLs
  - Concurrent download queue: MAX_CONCURRENT=3, SQLite-persisted status (`pending`/`downloading`/`completed`/`cancelled`/`error`)
  - 30-day TTL enforcement: `purgeExpiredDownloads()` called on app startup
- SQLite store (`client/src/main/db/sqlite.ts`) — WAL mode, `downloads` table with all metadata
- Electron `offline://` custom protocol — registered as privileged scheme, decrypts `.enc` segments on-the-fly via `decryptLocalSegment()` and returns `video/mp2t` responses to hls.js
- IPC channels: `download:start`, `download:cancel`, `download:delete`, `download:list`, `download:get-manifest`
- Preload: `downloadContent`, `cancelDownload`, `deleteDownload`, `listDownloads`, `getOfflineManifest` (replaces legacy `downloadSegment`/`getDownloadQueue` shims)
- Client renderer
  - `api/downloads.ts` — renderer-side download API wrapping `window.electronAPI` calls
  - `DownloadsPage` (`/downloads`) — in-progress list with segment progress bars, available-offline grid with expiry countdown, delete/cancel/play buttons
  - `ContentDetailPage` — Download button queues content; shows `✓ Queued` on success
  - `AppLayout` — added Downloads (`/downloads`) nav item
  - `vite-env.d.ts` — full `ElectronAPI` interface declaration (replaces ad-hoc inline declaration in `main.tsx`)
- New routes: `/downloads`, `/billing`, `/billing/invoices`

#### Infrastructure

- `docker-compose.yml` — Billing service: added `STRIPE_PRICE_*` env vars, added `auth` health-check dependency

---

## [0.4.0] — 2026-05-15 — Phase 3 Complete (Sprints 5–6)

### Added

#### Epic 5 — User Features

- User Service DynamoDB tables: `watchlists` (PK=profileId, SK=contentId, GSI contentId-index) and `viewing_history` (PK=profileId, SK=watchedAt#contentId, 90-day TTL)
- `GET /user/watchlist` — list all watchlist items for active profile
- `POST /user/watchlist/:contentId` — add content to watchlist (409 if already added)
- `DELETE /user/watchlist/:contentId` — remove from watchlist
- `GET /user/watchlist/:contentId/check` — check if specific content is in watchlist
- `GET /user/history` — paginated viewing history with cursor-based pagination (base64url encoded DynamoDB LastEvaluatedKey)
- `GET /user/preferences` — fetch profile language, subtitle, autoplay, maturity rating
- `PUT /user/preferences` — update profile preferences (language, subtitleDefault, autoplay, maturityRating)
- `POST /user/avatar/presign` — generate S3 presigned PUT URL for avatar upload (dev: returns mock localhost URL, prod: real AWS S3 presigned URL via dynamic import)
- `PUT /user/avatar/confirm` — confirm avatar upload and persist CloudFront CDN URL to profile
- `GET /user/export` — GDPR data export: returns all profiles + watchlists + viewing history as downloadable JSON

#### Epic 6 — Recommendations & ML

- Recommendation Service full implementation (was scaffold only)
  - DynamoDB tables: `ab_experiments` and `ab_assignments` — auto-provisioned on startup
  - Default A/B experiments seeded: EXP-001 (row order: 80% control/20% ML-first), EXP-002 (autoplay delay: 10s/5s/15s)
  - Deterministic A/B assignment: `hash(profileId + experimentId) % 100` (no database read needed per request)
  - `GET /recommendations/home` — personalised homepage rows with A/B variant; Redis 2-min cache per profileId+variant
  - `GET /recommendations/similar/:contentId` — "More Like This" content; Redis 2-min cache
  - `GET /recommendations/trending` — trending content by segment; Redis 2-min cache
  - AWS Personalize integration (prod): `USER_PERSONALIZATION` campaign via `PERSONALIZE_CAMPAIGN_ARN` env var, `SIMILAR_ITEMS` campaign via `PERSONALIZE_SIMILAR_CAMPAIGN_ARN`; dev falls back to catalog trending
  - Kafka `playback.events` consumer (non-fatal): receives playback events — logs for prod Personalize event tracker forwarding
  - JWT RS256 authentication on all recommendation endpoints

#### Client UI (Epic 5 + Epic 6)

- `BrowsePage` — added Continue Watching row (from Playback Service `GET /playback/continue-watching`) with per-item progress bars; added Recommendation rows from Recommendation Service above catalog genre rows
- `ContentDetailPage` — Watchlist button (+ My List / ✓ In My List) with optimistic TanStack Query invalidation; "More Like This" row at bottom via Recommendation Service
- `HistoryPage` (`/history`) — infinite-scroll paginated viewing history with per-item progress bars, completion badge, thumbnail, navigate-to-detail on click
- `SettingsPage` (`/settings`) — avatar upload (file picker → S3 presigned PUT → confirm), language selector, autoplay toggle, maturity rating selector, subtitle default input, GDPR data export download
- `AppLayout` — added History and Settings nav items with matching icons
- New routes: `/history`, `/settings`
- New API modules: `api/recommendation.ts` (getHomeRows, getSimilar, getTrending)
- Extended `api/user.ts`: watchlist (get/add/remove/check), history, preferences (get/update), avatar (presign/confirm), export
- Extended `api/playback.ts`: `getContinueWatching` endpoint

#### Infrastructure
- `docker-compose.yml` — User service now depends on `dynamodb-local` with full DynamoDB env vars (region, access keys, endpoint, S3 assets bucket)
- `docker-compose.yml` — Recommendation service now depends on `dynamodb-local` and `auth` with DynamoDB + Personalize env vars

---

## [0.3.0] — 2026-05-15 — Phase 2 Complete (Sprints 3–4)

### Added

#### Epic 3 — Content Catalog & Search

- Catalog Service (`services/catalog/`) — Fastify 5, TypeScript 5.5 strict, Zod validation
  - Full PostgreSQL schema: `content`, `genres`, `content_genres`, `cast_members`, `content_cast`, `seasons`, `episodes` in `catalog` schema
  - Migration + seed data (15 genres, 5 sample titles)
  - `GET /catalog/browse` — paginated browse with genre/type/year filters, Redis 1hr cache
  - `GET /catalog/browse/home` — home page rows (6 genre rows + featured hero), Redis 1hr cache
  - `GET /catalog/trending` — trending content ordered by IMDB score, Redis 1hr cache
  - `GET /catalog/genres` — genre taxonomy, Redis 24hr cache
  - `GET /catalog/content/:id` — full content detail with genres, cast, seasons, episodes; Redis 30min cache
  - `GET /catalog/search` — full-text search via OpenSearch BM25 (fuzzy match, multi-field boost)
  - `GET /catalog/search/semantic` — Claude-powered semantic search: `claude-sonnet-4-20250514` query expansion → 5 alternative terms → OpenSearch multi-term query
  - `POST /catalog/ingest` — admin content ingestion: writes to PostgreSQL + indexes to OpenSearch + emits `content.ingested` Kafka event
- OpenSearch 2.12.0 integration: index auto-provisioned on startup, single-node dev config in Docker Compose
- Kafka producer: `content.ingested` topic for downstream DRM key setup

#### Epic 4 — Video Playback Engine

- Playback Service (`services/playback/`) — Fastify 5, DynamoDB Local backend
  - DynamoDB tables: `playback_sessions` (24hr TTL), `playback_positions` (90-day TTL) — auto-created via `ensureTables()`
  - `POST /playback/session` — creates playback session, generates CloudFront signed URL (dev: mock unsigned), emits `playback.events` Kafka `started` event
  - `GET /playback/session/:id` — session lookup
  - `PUT /playback/position` — position heartbeat (every 10s), auto-marks completed at >95%
  - `GET /playback/position/:contentId` — resume position lookup
  - `GET /playback/continue-watching` — profile's in-progress content (5%–95% watched)
  - `GET /playback/drm/license` — Widevine license proxy (dev: mock license bypass, prod: forwards challenge to license server)
  - `POST /playback/quality-report` — ABR quality change telemetry → Kafka `playback.events`
- CloudFront signed URL generation — dev mode returns unsigned mock URL; prod uses key pair ID + RSA signature with 15-min expiry
- DynamoDB Local added to Docker Compose with persistent volume

#### Client UI (Epic 3 + Epic 4)

- `AppLayout` — sidebar nav: Home, Search, Movies, Series; profile avatar; Sign Out
- `BrowsePage` (`/browse`) — hero banner (top IMDB score), genre rows, trending row; TanStack Query with 5-min stale time
- `SearchPage` (`/search`) — keyword (OpenSearch BM25) and AI semantic toggle; debounced 400ms; expanded terms shown for semantic mode
- `ContentDetailPage` (`/content/:id`) — backdrop image, title/meta/genres/cast, season + episode selector, direct play
- `PlayerPage` (`/player/:contentId/:episodeId?`) — creates playback session then launches player
- `VideoPlayer` — hls.js v1.5 with custom ABR config, auto-level, hardware decode in Electron; full keyboard shortcuts (Space, k, ←→ 10s, ↑↓ volume, m mute, f fullscreen, Esc close)
- `PlayerControls` — seek bar (buffered + progress), play/pause, mute/volume slider, CC selector, quality selector (AUTO + per-level), PiP, fullscreen
- `NextEpisodeOverlay` — countdown timer (10s default), auto-advances; dismiss button
- Skip Intro / Skip Credits buttons appear based on timestamp metadata from catalog
- Position heartbeat every 10s → Playback Service → DynamoDB
- Level change reports to Playback Service → Kafka `playback.events`
- All new routes: `/browse`, `/search`, `/content/:id`, `/player/:contentId`, `/player/:contentId/:episodeId`
- `/home` redirects to `/browse`

#### Infrastructure
- Docker Compose: added `opensearch_data` and `dynamodb_data` named volumes
- Catalog and Playback Dockerfiles fixed (EXPOSE port bug from scaffolding)

---

## [0.2.0] — 2026-05-15 — Phase 1 Complete (Sprints 1–2)

### Added

#### Electron Shell (Epic 1)
- Electron 31 + React 19 + Vite 5 + TailwindCSS 3 monorepo (`client/`)
- Main/Renderer IPC bridge via `contextBridge` — whitelisted API surface only (`preload.ts`)
- `electron-updater` auto-update with delta updates; stable/beta release channels
- `electron-builder` packaging config for Windows (NSIS + portable), macOS (DMG + MAS), Linux (AppImage + deb + Snap)
- Certificate pinning for `api.kokomovie.com` — MITM-resistant, skipped in dev (`cert-pinning.ts`)
- Sentry Electron SDK wired for crash reporting
- Content Security Policy enforced via `session.webRequest.onHeadersReceived`
- Electron security hardening: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`

#### Authentication & Profiles (Epic 2)
- Auth Service (`services/auth/`) — Fastify 5, TypeScript 5.5 strict, Zod validation
  - `POST /auth/register` — email/password registration, timing-safe response
  - `POST /auth/login` — credential login with constant-time password comparison
  - `POST /auth/refresh` — refresh token rotation (old token revoked on every use)
  - `POST /auth/logout` — access token Redis denylist + refresh token revocation
  - `GET /auth/oauth/google` / `GET /auth/oauth/google/callback` — Google OAuth2 PKCE-state flow
  - `POST /auth/mfa/setup` — TOTP secret + QR code + 8 backup codes
  - `POST /auth/mfa/verify` — brute-force throttled (5 attempts / 5 min via Redis)
  - `GET /auth/devices` — list active device sessions
  - `DELETE /auth/devices/:id` — remote device revocation
  - `GET /auth/public-key` — RS4096 public key endpoint (used by downstream services for local JWT verification)
- JWT RS256 (RS4096) with `jose` — 15-min access tokens, 30-day refresh tokens
- Refresh tokens stored as SHA-256 hashes in PostgreSQL; plaintext never persisted
- IP addresses SHA-256+salt hashed before storage (data minimisation)
- OS keychain token storage via `keytar` IPC (never `localStorage`)
- User Service (`services/user/`) — Fastify 5, JWT verification via Auth public-key endpoint (stateless)
  - `GET /user/profiles` — list profiles
  - `POST /user/profiles` — create profile (max 5 per account enforced)
  - `PUT /user/profiles/:id` — update name, avatar, maturity rating, language, autoplay
  - `DELETE /user/profiles/:id` — soft delete

#### Client UI
- Login page with MFA step-up flow (token field auto-shown on `AUTH_MFA_REQUIRED`)
- Register page with password confirm validation
- Profile selection page with avatar initials + colour, kids badge, add-profile card
- Home page placeholder (catalog coming in Phase 2)
- Zustand stores: `auth` (account + active profile), `ui` (sidebar, modals), `player` (playback state)
- TanStack Query client with per-service base URLs, silent token refresh on 401
- Lazy-loaded routes via React `Suspense`

#### Infrastructure & CI/CD
- `docker-compose.yml` — PostgreSQL 16, Redis 7, Redpanda (single-node Kafka), all 6 services
- npm workspaces monorepo: `client/`, `services/*`, `packages/shared`
- `packages/shared` — shared TypeScript types (`ApiResponse`, `AuthTokenPair`, `Profile`, error codes)
- DB migration runner (raw SQL, `services/*/src/db/migrations/0000_initial.sql`)
- `scripts/generate-keys.mjs` — RSA-4096 key generation for JWT signing
- `scripts/setup-dev.sh` — full dev environment bootstrap
- `.github/workflows/service-deploy.yml` — parallel matrix test (6 services) → ECR build → staging deploy → production deploy (manual gate)
- `.github/workflows/electron-release.yml` — cross-platform build on `v*` tags (Windows/macOS/Linux)

### Architecture
- `docs/architecture.md` — BMAD master architecture document (ARCH-001 v1.0.0)
- Polyglot persistence: PostgreSQL (auth schema, user schema) + DynamoDB (Phase 3+) + Redis
- ADRs 001–007 documented and accepted

---

## [0.1.0] — 2026-05-14 — Project Initialisation

### Added
- Repository created with `architecture.md` (ARCH-001 v1.0.0)
- BMAD v6 architecture approved covering all 9 epics
- ADRs accepted: Electron (001), HLS (002), PostgreSQL+DynamoDB (003), JWT RS256 (004), AWS Personalize (005), Kafka MSK (006), Terraform (007)

---

## Upcoming Releases

_All planned epics (1–9) are now shipped in v1.0.0._
