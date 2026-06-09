# DoNot.md — Lessons Learned (Do Not Repeat)

A living document of bugs that were fixed and **why they worked after the fix**. Before making changes to any of the areas listed below, read the corresponding entry to avoid reintroducing the same bug.

---

## DN-001: VideoPlayer must handle both HLS and direct video URLs

**Date:** 2026-05-19  
**Area:** `client/src/renderer/components/player/VideoPlayer.tsx`  
**Symptom:** Stream found successfully, player opens, but video stays black at 0:00 / 0:00.  
**Root cause:** The stream extractor (`stream-extractor/index.ts`) captures `.mp4` and `.webm` URLs in addition to `.m3u8` manifests. But `VideoPlayer` always fed every URL to hls.js, which can only parse HLS manifests. Feeding it an MP4 caused a silent failure.  
**Fix:** Detect the URL extension before initializing playback. If it ends in `.mp4`, `.webm`, or `.mkv`, set `video.src` directly (native Chromium playback). Only use hls.js for actual HLS streams. Additionally, if hls.js encounters an unrecoverable error, fall back to native `video.src` as a last resort instead of immediately showing an error.

**DO NOT:**
- Remove the `isDirectVideo` check in the HLS init `useEffect`
- Assume all stream URLs are HLS manifests
- Remove the native fallback in the hls.js fatal error handler

---

## DN-002: GitHub Actions `secrets` context cannot be used in job-level `if:`

**Date:** 2026-05-19  
**Area:** `.github/workflows/service-deploy.yml`  
**Symptom:** Workflow fails to parse at all — "Unrecognized named-value: 'secrets'"  
**Root cause:** GitHub Actions only exposes the `secrets` context inside `steps[*].if` and step-level expressions. Using `secrets.AWS_ACCESS_KEY_ID` in a job-level `if:` causes a YAML parse failure before any job runs.  
**Fix:** Removed the build-push and deploy jobs entirely since AWS infrastructure is not provisioned. When AWS is set up, gate with an environment check or `workflow_dispatch`, not job-level `secrets.*`.

**DO NOT:**
- Reference `secrets.*` in job-level `if:` conditions
- Add `continue-on-error: true` as a substitute — it still shows red X marks

---

## DN-003: `billing` service was removed — do not reference it anywhere

**Date:** 2026-05-19  
**Area:** `.github/workflows/`, `infra/terraform/`, `services/`  
**Symptom:** CI test matrix included `billing`, causing `npm ci` to fail because the workspace doesn't exist. Terraform validate failed because ECS/ECR/MSK configs referenced a billing container.  
**Root cause:** The billing service was removed from `services/` but references persisted in CI matrix arrays, Terraform `locals.services`, ECR module service lists, ECS route maps, and MSK topic definitions.  
**Fix:** Grep for `billing` across the entire repo and removed all references.

**DO NOT:**
- Add `billing` back to any CI matrix, Terraform config, or Docker deployment loop
- Create a `services/billing` directory without also adding it to the CI matrix and Terraform configs

---

## DN-004: `package-lock.json` must stay in sync with workspaces

**Date:** 2026-05-19  
**Area:** Root `package.json` + `package-lock.json`  
**Symptom:** All GitHub Actions fail with "npm ci can only install packages when package.json and package-lock.json are in sync"  
**Root cause:** Adding or removing workspaces (e.g., removing billing) without running `npm install` leaves the lockfile referencing packages that no longer exist.  
**Fix:** Always run `npm install` after any workspace change to regenerate the lockfile.

**DO NOT:**
- Push changes that add/remove npm workspaces without running `npm install` first
- Manually edit `package-lock.json`

---

## DN-005: Provider registry order matters for stream racing

**Date:** 2026-05-19  
**Area:** `client/src/main/providers/registry.ts`  
**Symptom:** Slow or no streams found despite having many providers.  
**Root cause:** The `ALL_PROVIDERS` array order determines batch priority. The staggered parallel racer (batches of 4, 1.5s stagger) starts from index 0. If unreliable providers are first, the first batch wastes time.  
**Fix:** Order providers by reliability — VidBinge and VidSrc first, experimental ones last.

**DO NOT:**
- Add new providers at the top of `ALL_PROVIDERS` without testing their reliability
- Reorder providers without understanding the batch racing logic in `ipc/providers.ts`

---

## DN-006: CSP `frame-src` must allow YouTube for hero trailers

**Date:** 2026-05-19  
**Area:** `client/src/main/index.ts` (CSP headers)  
**Symptom:** Hero banner YouTube trailers fail to load silently.  
**Root cause:** Setting `frame-src 'none'` blocks the YouTube embed iframes used for background hero trailers on the browse page.  
**Fix:** Production CSP includes `frame-src 'self' https://*.youtube.com https://*.youtube-nocookie.com https://*.ytimg.com https:`

**DO NOT:**
- Set `frame-src 'none'` in the CSP
- Remove YouTube domains from `frame-src`

---

## DN-007: CAM/Telesync streams must be filtered at the extractor level

**Date:** 2026-05-19  
**Area:** `client/src/main/stream-extractor/index.ts`  
**Symptom:** Low quality theater-recorded (CAM) or telesync audio streams play instead of proper HD releases.  
**Root cause:** Without filtering, the first stream URL found wins — including CAM rips.  
**Fix:** `isCamStream()` checks URL path segments and query params for cam/telesync indicators and skips those URLs. The extractor continues looking for a legitimate stream.

**DO NOT:**
- Remove the `isCamStream()` check
- Add CAM-related patterns to the allowed list

---

## DN-008: Stream URLs MUST use local HTTP proxy — CORS kills playback

**Date:** 2026-05-19  
**Area:** `client/src/main/index.ts`, `client/src/main/ipc/providers.ts`  
**Symptom:** Stream found successfully (extraction log shows SUCCESS + URL), player opens with correct title, but video stays black at 0:00/0:00.  
**Root cause:** Stream CDNs don't return `Access-Control-Allow-Origin` headers. hls.js in the renderer runs inside Chromium with `webSecurity: true`, which enforces CORS. When hls.js fetches the HLS manifest via `XMLHttpRequest`, Chromium blocks it.
**Why custom protocols (`stream://`) didn't work:** Even with `corsEnabled: false`, Chromium's XHR engine (used internally by hls.js) handles custom schemes unreliably and often drops them. Additionally, manifests contain absolute `https://` paths for segments that bypass custom schemes.  
**Fix (Architecture):** 
1. **Local HTTP Proxy:** The main process runs a lightweight HTTP server (`startStreamProxy()` on `localhost:PORT`) before creating the window. The proxy forwards requests using `net.fetch` (Node.js network stack, immune to CORS).
2. **Forbidden Fetch Headers:** The proxy explicitly strips forbidden headers (like `Sec-Fetch-Site`) because `net.fetch` will crash with `net::ERR_INVALID_ARGUMENT` if they are manually injected into the `Headers` object. It also extracts `Referer` to pass it securely as an option.
3. **M3U8 URL Rewriting:** The proxy intercepts `.m3u8` responses and uses regex to rewrite both absolute paths (`/path/seg.ts`) and full URLs (`https://.../seg.ts`) to point back to the local `/proxy/...` endpoint. Without this, hls.js would resolve absolute URLs out to the raw internet, immediately hitting a 404 or CORS block.
4. **CSP:** The renderer's Content Security Policy allows `media-src http://localhost:*`.

**DO NOT:**
- Remove the `startStreamProxy()` startup call in `index.ts`
- Attempt to switch back to a custom `stream://` protocol
- Remove the `.m3u8` text-rewriting logic inside the proxy handler (otherwise manifests with absolute paths will bypass the proxy and trigger CORS)
- Set forbidden fetch headers (like `Referer` or `Sec-*`) directly into the `headers` object of `net.fetch` — they must be filtered out or passed via native `fetch` options.

---

## DN-009: Quality-Aware Racing must be used instead of First-Winner Racing

**Date:** 2026-05-20  
**Area:** `client/src/main/ipc/providers.ts`  
**Symptom:** Quality is poor (360p or 720p) even if high quality providers are enabled and content is available in 1080p.  
**Root cause:** Staggered parallel racing terminates as soon as the first stream is found. While this maximizes speed, fast low-quality mirrors (like VidSrc.pm) return low-resolution streams (max 720p or 360p) and abort slower providers (like VidSrc/VidLink) that have 1080p.  
**Fix:**
1. **Quality Detection:** Use `getMaxResolution` inside the main process to fetch the manifest and inspect resolutions prior to terminating.
2. **Quality-Aware Race:**
   - If a provider returns a stream >= 1080p, resolve immediately.
   - If a provider returns a stream < 1080p (e.g. 720p), save it as `bestResult` and start a 3.5s fallback timer, letting other workers run. If another worker finds a 1080p stream during this window, resolve with the 1080p stream. Otherwise, fall back to the best stream found.
3. **Proxy Manifest Filtering:** Filter out resolutions < 720p from HLS master playlists in the proxy if higher-quality options are available, forcing `hls.js` to play at 720p or 1080p instead of starting at 360p.

**DO NOT:**
- Remove the `getMaxResolution` check or the quality-wait timer in `getFirstStream`
- Return the first stream instantly without checking its quality, unless it's >= 1080p
- Filter out low qualities in the proxy if *only* low qualities are available (the proxy only filters < 720p if resolutions >= 720p are present in the manifest)

---

## DN-010: Aspect-Ratio and Header-Safe Quality Checks (Widescreen + Proxy Fetching via fetchNode)

**Date:** 2026-05-20  
**Area:** `client/src/main/ipc/providers.ts`, `client/src/renderer/components/player/VideoPlayer.tsx`  
**Symptom:** High-quality streams (like VidLink) get assigned `Resolution: 0p` and lose the race, or widescreen streams (e.g. `1280x536` or `1920x800`) are incorrectly filtered out or fail to map to 720p/1080p in the player controls, or proxying segments fails with Cloudflare 403 blocks.
**Root cause:** 
1. **Forbidden Header / CORS Fetch Failure:** Fetching stream URLs directly inside the main process with Electron's `net.fetch` strips forbidden headers like `Referer` and `Origin` from the outgoing headers. CDNs like Cloudflare block these requests with a 403 error.
2. **Session Interceptor Bypass:** While `session.defaultSession.webRequest.onBeforeSendHeaders` can inject headers for renderers, `net.fetch` requests originating in the main process do not trigger these handlers consistently.
3. **Non-Standard Aspect Ratios:** Movies use cinema aspect ratios (e.g., 2.39:1). A 1080p stream might be `1920x800` or `1920x816`, and a 720p stream might be `1280x536`. Strict checks on vertical height (like `height < 720`) mistakenly classify widescreen 720p streams as low-resolution, and fail to immediately resolve on widescreen 1080p streams (since height is < 1080).
**Fix:**
1. **Node http/https fetcher (fetchNode):** Implemented a custom Node-level fetcher (`fetchNode`) using raw `http` and `https` modules to bypass Electron's `net.fetch` restrictions. This allows injecting `Referer`, `Origin`, and any custom headers flawlessly, preventing Cloudflare 403 blocks.
2. **Proxy integration:** The proxy server uses `fetchNode` to perform all proxy fetches for manifests and chunks, guaranteeing correct headers.
3. **Standard-height helper:** Implement `getStandardHeight(width, height)` to map cinema resolutions to standard heights (e.g., width 1920 or height 1080 maps to standard 1080; width 1280 or height 720 maps to standard 720).
4. **UI levels mapping:** Map the parsed HLS heights to standard heights in the renderer so the user sees proper quality labels (`720p`, `1080p`) instead of `536p` or `800p`.

**DO NOT:**
- Use Electron's `net.fetch` for proxying or checking resolutions where custom/forbidden headers (like `Referer` or `Origin`) are required.
- Fetch raw URLs in `getMaxResolution` directly without going through `toProxyUrl` or registering headers first.
- Enforce strict height checks without checking the corresponding width (always use `getStandardHeight`).
- Show cinema aspect ratio resolutions (like `536p` or `800p`) in the player quality selector.

---

## DN-011: Segment files must use direct chunk piping; subtitles must be converted to WebVTT format on-the-fly

**Date:** 2026-05-20  
**Area:** `client/src/main/ipc/providers.ts`, `client/src/renderer/components/player/VideoPlayer.tsx`  
**Symptom:** Playing movie or series stutters or lags for several seconds continuously even on high-speed internet connections, or external SRT subtitles fail to render on the video.  
**Root cause:**  
1. **Memory Buffering Lag:** The local HTTP proxy previously fetched the entire media segment (`.ts` or `.mp4` chunks) into a buffer in memory using `fetchNode` before responding to the client. This loading delay caused latency spikes, micro-stutters, and video player stalls.  
2. **Subtitle Format Incompatibility:** Sideloaded subtitles from OpenSubtitles are fetched in SRT format, but the native Chromium browser video player only renders WebVTT format (`.vtt`) via `<track>` elements.
**Fix:**  
1. **Direct Segment Piping:** Modified the local HTTP proxy to check if a request is a segment chunk (not `.m3u` or `.m3u8` and not subtitle format request). If so, it bypasses memory buffering and streams/pipes chunks (`streamSegment`) immediately to the player as they arrive.  
2. **On-the-Fly SRT to WebVTT Converter:** Added a format converter in the proxy. If `format=vtt` query parameter is present, the proxy fetches the SRT subtitle file, replaces the comma timestamp delimiters with periods, prepends `WEBVTT`, and serves it back as `text/vtt`.  
3. **Buffer and ABR Tuning:** Set Hls.js buffer capacity to `150MB` and start level selection using `hls.nextLevel` so the player starts at the highest resolution but can auto-switch down if needed, preventing hangs.

**DO NOT:**
- Buffer full segment chunk payloads in memory before responding to client requests.
- Attempt to sideload raw SRT files directly to the video element without converting them to WebVTT first.
- Lock `hls.currentLevel` on initial load when in Auto mode, which overrides Hls.js's adaptive quality switching.

> **Superseded (2026-06-04, see DN-035):** Point #3's "start at the highest resolution via `hls.nextLevel`" was reverted. Forcing the top resolution for the first fragment guaranteed a startup buffer stall on slow providers. The player now starts in pure AUTO and lets ABR ramp up. The buffer-capacity guidance here and in DN-021 still stands.

---

## DN-012: YouTube/GoogleVideo domains must be blocked in the stream extractor

**Date:** 2026-05-20  
**Area:** `client/src/main/stream-extractor/index.ts`  
**Symptom:** Clicking play on a TV series episode (e.g., The Boys S1E1) plays a random YouTube trailer or ad instead of the actual episode. Extraction log shows `googlevideo.com` URLs captured as the "stream."  
**Root cause:** Provider embed pages sometimes load YouTube trailers or pre-roll ads. YouTube video URLs match `.mp4`/`.webm` stream patterns and their responses include `video/mp4` or `video/webm` Content-Types. The extractor captured these before the real provider stream could load.  
**Fix:**  
1. Added `youtube.com`, `googlevideo.com`, `ytimg.com`, `youtube-nocookie.com` to `BLOCKED_HOSTS` so their requests are cancelled before they load.  
2. Added hostname checks in both `isStreamUrl()` and `onHeadersReceived()` to reject any URL from these domains, even if the path or content type matches stream patterns.  

**DO NOT:**
- Remove YouTube/Google Video domains from `BLOCKED_HOSTS`
- Remove the hostname guard in `isStreamUrl()` or `onHeadersReceived()`
- Confuse this with the CSP `frame-src` rule (DN-006) — the hero banner YouTube iframes run in the **renderer**, which needs YouTube allowed. The **stream extractor** is a separate hidden BrowserWindow where YouTube must be blocked.

---

## DN-013: Refresh tokens must use OS keychain or in-memory temp storage — never localStorage

**Date:** 2026-05-20  
**Area:** `client/src/main/ipc/auth.ts`, `client/src/renderer/hooks/useAuth.ts`, `client/src/renderer/components/auth/LoginForm.tsx`  
**Symptom:** User has to re-enter credentials on every app restart.  
**Root cause:** Refresh tokens were stored in OS keychain via `keytar` but the Zustand auth store was persisted to `localStorage`. On restart, `localStorage` showed `isAuthenticated: true` but `keytar` had no refresh token (or the token was expired). The silent refresh failed, leaving the user stranded.  
**Fix:**  
1. Auth store already persists `isAuthenticated` and `account` to `localStorage` (Zustand `persist` middleware). This is fine — it's metadata, not secrets.  
2. Refresh tokens stay in `keytar` (persistent) or a module-level `tempRefreshToken` variable (session-only when "Stay signed in" is unchecked).  
3. `setRefreshToken` IPC handler accepts an optional `persist: boolean` parameter. When `false`, the token is stored in memory only and any keytar/fallback entry is deleted.  
4. Login form includes a "Stay signed in" checkbox (default: checked). The value is passed through the mutation → `setRefreshToken(token, persist)`.  

**DO NOT:**
- Store refresh tokens in `localStorage` — that violates the security architecture (see `docs/architecture.md` §8).
- Remove the `tempRefreshToken` fallback — without it, non-persistent sessions lose the refresh token entirely.
- Remove the `persist` default (`true`) in the preload bridge — silent refresh and token rotation calls don't pass persist explicitly and must default to persistent.

---

## DN-014: Subtitle tracks must be deduplicated and exclusively activated to prevent double rendering

**Date:** 2026-05-20 (updated 2026-05-20)
**Area:** `client/src/renderer/components/player/VideoPlayer.tsx`, `PlayerControls.tsx`  
**Symptom:** Subtitles appear doubled/stacked — two overlapping copies of the same subtitle text render simultaneously on the video.  
**Root cause:**  
1. **Language code mismatch in deduplication:** The deduplication used `.slice(0, 2)` on raw lang codes. `'spa'.slice(0, 2)` = `'sp'`, not `'es'`. So when an external sub has `lang='es'` and the internal HLS track has `lang='spa'`, they were NOT considered duplicates, and both appeared.  
2. **HLS `subtitleDisplay` not disabled for external tracks:** When an external sideload track was selected, `hls.subtitleDisplay` remained `true`, allowing hls.js to re-render its own internal track concurrently.  
3. **`updateTracks` race for internal HLS tracks:** When an internal HLS track (id 0–999) was selected, `extTrack` lookup returned `undefined` (because internal tracks aren't in `externalSubs`), so the code disabled ALL tracks including the HLS-managed one. HLS.js then re-enabled its own track, creating a race condition with any external `<track>` that was still partially active.

**Fix:**  
1. **`normalizeLang` helper:** Maps ISO 639-2 (3-letter) codes to ISO 639-1 (2-letter): `spa→es`, `eng→en`, `fra→fr`, etc. Use it everywhere for language comparison, not `.slice(0, 2)`.  
2. **`hls.subtitleDisplay = false`** when selecting external tracks or turning off. `hls.subtitleDisplay = true` when selecting internal HLS tracks.  
3. **Three-case `updateTracks`:**  
   - `currentSubtitle === -1` (off): disable all `textTracks`.  
   - `currentSubtitle >= 1000` (external): enable matching `<track>`, disable ALL others including internal HLS.  
   - `currentSubtitle 0–999` (internal HLS): only disable external `<track>` elements (identified by IDs in `extIdSet`); do not touch HLS-managed tracks — hls.js owns them.  
4. **`background-color` not `background` in `::cue` CSS:** The `background` shorthand is not reliably supported in `::cue`; use `background-color` explicitly.

**DO NOT:**
- Use `.slice(0, 2)` for language code comparison — use `normalizeLang()`.
- Leave `hls.subtitleDisplay = true` when switching to external or off — hls.js will race to re-show its internal track.
- Disable ALL `textTracks` when an internal HLS track is selected — hls.js manages those tracks and will fight you.
- Remove the language-based deduplication in `subtitleTracks` — without it, the CC menu shows two entries for the same language.

---

## DN-015: Episode season number must be passed explicitly to the stream request — do not re-derive from DB lookup

**Date:** 2026-05-20  
**Area:** `client/src/renderer/pages/ContentDetail.tsx`  
**Symptom:** Clicking Season 1 Episode 1 in the episode list plays content from a completely different season (e.g., Season 3).  
**Root cause:** `handleAutoStream` accepted only an `Episode` object and derived the season by searching `c.seasons` (raw, unsorted, from the API response) for a matching episode ID. If the DB has episodes stored under the wrong season (a TMDB sync data issue), or if seasons are returned in an unexpected order, `season.seasonNumber` reflects the incorrect DB association.  
**Fix:** Accept an explicit `seasonNumber?: number` parameter in `handleAutoStream`. The call sites always know which season is being displayed (`season = sortedSeasons[selectedSeason]`), so pass `season?.seasonNumber` directly. The DB lookup is only used as a fallback when `seasonNumber` is not provided.

**DO NOT:**
- Search `c.seasons` or `sortedSeasons` to look up which season an episode belongs to when the call site already knows the season.
- Pass just the `Episode` object without its season context when both are available.

---

## DN-016: hd4u.sbs is VidSrc.rip's player domain — never add it to BLOCKED_HOSTS

**Date:** 2026-05-20  
**Area:** `client/src/main/stream-extractor/index.ts`  
**Symptom:** VidSrc.rip always fails extraction. Logs show `ERR_BLOCKED_BY_CLIENT` for `hd4u.sbs`.  
**Root cause:** `hd4u.sbs` was added to `BLOCKED_HOSTS`. VidSrc.rip's embed page redirects to `https://hd4u.sbs/#...` (its video player). When `onBeforeRequest` cancels that navigation, the extractor never loads the player and can't intercept any stream URL.  
**Fix:** Removed `hd4u.sbs` from `BLOCKED_HOSTS`. Added an explanatory comment so it's never re-added by mistake.

**DO NOT:**
- Add `hd4u.sbs` back to `BLOCKED_HOSTS` — it is a legitimate stream player, not an ad domain.

---

## DN-017: Dead provider domains must be disabled by default, not left enabled to time out every race

**Date:** 2026-05-20  
**Area:** `client/src/main/providers/embedsu.ts`, `client/src/main/providers/registry.ts`  
**Symptom:** Console floods with `ERR_NAME_NOT_RESOLVED` for `embed.su`. Stream races take longer because a dead provider holds one of the 4 parallel batch slots for the full timeout duration.  
**Root cause:** `embed.su` domain no longer resolves (DNS dead). Provider was still in the registry and enabled by default, so every race attempt wasted time on it.  
**Fix:** Added `defaultEnabled?: boolean` to the `Provider` interface. Set `embedSuProvider.defaultEnabled = false`. Registry uses `p.defaultEnabled ?? true` as the fallback when no user preference exists.

**DO NOT:**
- Enable dead providers by default.
- Remove a dead provider from the registry entirely — keep it with `defaultEnabled: false` so users can manually re-enable it if the domain revives.

---

## DN-018: Never add a 10-second auto-skip at playback start

**Date:** 2026-05-20  
**Area:** `client/src/renderer/components/player/VideoPlayer.tsx`  
**Symptom:** User clicks Episode 1 but the video appears to start at a scene from the middle of the episode. Playback is disorienting — the opening credits or cold-open are completely skipped.  
**Root cause:** An auto-skip was added to jump past "pre-roll ads" by unconditionally seeking to `currentTime = 10` whenever the first `timeupdate` event fired with `currentTime < 1`. This fires on **every** provider stream, including streams that have no pre-roll ads. The 10-second jump also doesn't work as an ad-skip — it lands inside the actual episode content, not past any ad.  
**Fix:** Removed the auto-skip entirely. If a specific provider is observed to have consistent pre-roll ads, the correct fix is to either block the ad network domain in `BLOCKED_HOSTS` or add explicit detection logic for that provider's ad URL pattern.

**DO NOT:**
- Add any unconditional `video.currentTime = N` seek at playback start.
- Assume all provider streams have pre-roll ads of a known duration.

---

## DN-020: `allStreams` must be declared in VideoPlayer's Props interface — never silently drop pre-extracted streams

**Date:** 2026-05-20  
**Area:** `client/src/renderer/components/player/VideoPlayer.tsx`, `client/src/renderer/pages/Player.tsx`  
**Symptom:** Every source switch in the player shows "Provider returned no working stream" or times out after 20s, even though the initial race successfully collected streams from multiple providers.  
**Root cause:** `Player.tsx` passed `allStreams` (an array of pre-extracted provider streams) as a JSX prop to `<VideoPlayer>`. The `VideoPlayer` `Props` interface did not declare `allStreams`, so TypeScript treated it as an extra prop and React silently discarded it. `handleSourceChange` then attempted a live extraction for every switch attempt — most fail because the extraction window takes 12–30s and many providers are inconsistent.  
**Fix:**  
1. Added `allStreams?: CachedStream[]` to the `Props` interface in `VideoPlayer.tsx`.  
2. `handleSourceChange` checks `allStreams` first; if the target provider already has a cached stream, it applies it immediately (zero IPC calls).  
3. Providers absent from `allStreams` still trigger a fresh extraction as a fallback.  

**DO NOT:**
- Pass a prop to a React component without declaring it in that component's `Props` interface — TypeScript will not error on extra props by default.
- Re-extract a stream that was already collected during the initial provider race; use the cached result in `allStreams`.
- Assume that because `sources.length > 1` is true, all those sources are reachable — only providers in `allStreams` are confirmed working for this specific content.

---

## DN-019: `hostResolutionCache` in stream extractor must use a TTL — never persist indefinitely

**Date:** 2026-05-20  
**Area:** `client/src/main/stream-extractor/index.ts`  
**Symptom:** After a transient DNS failure (e.g., a CDN is briefly unreachable), that CDN host remains permanently blocked for the rest of the app session. Providers using that CDN always time out silently even after the CDN recovers.  
**Root cause:** `hostResolutionCache` was a plain `Map<string, boolean>` with no expiration. Once a host was marked `false` (DNS failed), it stayed `false` forever.  
**Fix:** Changed to `Map<string, { ok: boolean; expiresAt: number }>` with a 3-minute TTL (`HOST_RESOLUTION_TTL_MS`). Cached entries are re-checked after TTL expires.

**DO NOT:**
- Replace the TTL-aware cache with a plain boolean `Map` — transient failures would permanently blacklist legitimate CDN hosts.
- Set the TTL so long (e.g., hours) that a recovered CDN still gets blocked for the entire session.

---

## DN-021: HTTP Keep-Alive Connection and HLS.js Buffer Space Optimization

**Date:** 2026-05-21  
**Area:** `client/src/main/ipc/providers.ts`, `client/src/renderer/components/player/VideoPlayer.tsx`  
**Symptom:** Constant `bufferStalledError` / `mediaError` stalls in the renderer console (video stops playing and buffers constantly) despite high bandwidth (e.g., 300 Mbps download).  
**Root cause:**  
1. **TCP Handshake Overhead:** Fetching HLS segment chunks (`.ts` / `.mp4` chunks) via `fetchNode` without persistent HTTP/HTTPS connections created a new TCP connection (and TLS handshake) for every single segment. This caused request queues to stall and delay chunk delivery.  
2. **Insufficient Buffer Size:** The default Hls.js buffer capacity (30MB / 30 seconds max length) was too low to absorb temporary network or proxy latency spikes, causing the buffer to run dry frequently.  
**Fix:**  
1. **Persistent Keep-Alive Agent:** Implemented global persistent `http.Agent` and `https.Agent` with `keepAlive: true`, `maxSockets: 64`, and `keepAliveMsecs: 30000` inside `providers.ts` to reuse TCP connections for all HTTP-based segment proxying.  
2. **Buffer capacity increased:** Configured Hls.js client properties to allow a larger cushion: `maxBufferLength: 60`, `maxMaxBufferLength: 120`, and `maxBufferSize: 180 * 1024 * 1024` (180MB of memory buffer), allowing the player to cache ahead much more aggressively.  

**DO NOT:**
- Remove the persistent `httpAgent` or `httpsAgent` configurations from segment fetch requests.
- Reduce the Hls.js buffer lengths or sizes below high-capacity values, as it will reintroduce buffer stalls on standard networks.

---

## DN-022: Case-Insensitive Header Merging in Proxying & Downloading

**Date:** 2026-05-22  
**Area:** `client/src/main/ipc/providers.ts`, `client/src/main/ipc/download.ts`  
**Symptom:** Cloudflare 403 Forbidden errors when loading media segments or downloading. Duplicate, conflict-cased headers (e.g. `Referer` vs `referer` or `User-Agent` vs `user-agent`) sent in the same request, leading to CDN blocking.  
**Root cause:** Standard object spreads (`{ ...base, ...overrides }`) do not merge keys with different case variations, resulting in duplicate headers with inconsistent casing being transmitted.  
**Fix:** Implemented `mergeHeadersCaseInsensitive(base, overrides)` to clean up headers and merge them using lowercased keys, ensuring uniqueness of keys.  
**DO NOT:**
- Use standard JavaScript object spread operators when overriding or merging stream headers where casing conflicts might exist.

---

## DN-023: Reconstructing Original URLs and Protocols in Stream Proxies and Downloader

**Date:** 2026-05-22  
**Area:** `client/src/main/ipc/providers.ts`, `client/src/main/ipc/download.ts`  
**Symptom:** Manifest rewriting fails or streams stay stuck loading when original files use HTTP instead of HTTPS. Downloader incorrectly downloads stream segments or fails to find playlists.  
**Root cause:** The proxy rewrote absolute paths and full URLs to proxy endpoints but did not include the original stream protocol (HTTP vs HTTPS). The downloader and proxy then defaulted all requests to HTTPS (`https://`), causing socket connection timeouts or errors on HTTP streams.  
**Fix:** Encoded the original protocol as part of the proxy path `/proxy/${proto}/${rest}`. Updated the downloader's `normalizeUrl` and the stream proxy to parse the protocol from this prefix to reconstruct the original URLs correctly.  
**DO NOT:**
- Hardcode `https://` when reconstructing proxy paths or manifest locations, as some providers stream over standard `http://`.

---

## DN-024: Target 1080p Resolution First Using Widescreen Normalization

**Date:** 2026-05-22  
**Area:** `client/src/main/ipc/download.ts`  
**Symptom:** Movies or episodes download in lower quality (e.g. 720p or 480p) despite 1080p variant availability, or widescreen resolutions (such as `1920x800` or `1920x816`) are filtered out or skipped.  
**Root cause:** Simple height checks (e.g. `height === 1080`) failed to recognize widescreen/cinema 1080p stream heights. Additionally, the master HLS playlist parser simply chose the highest bandwidth variant, which did not guarantee 1080p resolution.  
**Fix:** Implemented `getVariantScore` using `getStandardHeight` to correctly normalize aspect ratios (e.g. height >= 800 maps to 1080p). Built a comparator to prioritize standard height 1080p variants over others, falling back to the highest available resolution/bandwidth if 1080p is not present in the master manifest.  
**DO NOT:**
- Use strict height checks for quality resolution identification. Always use `getStandardHeight(width, height)` for aspect-ratio-safe comparisons.

---

## DN-025: Auto-Resume of Interrupted and Pending Downloads on Application Startup

**Date:** 2026-05-22  
**Area:** `client/src/main/ipc/download.ts`  
**Symptom:** When the application is closed or crashes during an active download, the download gets stuck in `'downloading'` state indefinitely and never resumes.  
**Root cause:** Active downloads were flagged as `'downloading'` in the SQLite database but there was no startup handler to reset and restart these active queues when the application was reopened.  
**Fix:** Updated `registerDownloadIpc` to reset all rows with status `'downloading'` back to `'pending'` on startup, and invoked `processQueue()` once to start the download queue automatically.  
**DO NOT:**
- Leave active download records in `'downloading'` status on app start, or require user manual action to resume interrupted downloads.

---

## DN-026: Do not strip `cookie` in segment fetching

**Date:** 2026-05-22  
**Area:** `client/src/main/ipc/download.ts`  
**Symptom:** Downloads fail or get stuck around 8%.  
**Root cause:** `fetchBuffer` stripped the `cookie` and `accept-encoding` headers. Since CDNs require token cookies for segment authentication and sometimes return compressed data (`gzip` / `deflate`), omitting cookies caused authentication blocks, and lack of decompression caused corrupt downloads or failures.  
**Fix:** Kept the cookie header and allowed `Accept-Encoding: gzip, deflate`, implementing synchronous decompression via `zlib` if responses are encoded.  
**DO NOT:**
- Strip cookies or encoding headers from segment requests, and always support gzip/deflate decoding in the downloader.

---

## DN-027: Do not update database rows after cancellation/deletion to avoid re-creation

**Date:** 2026-05-22  
**Area:** `client/src/main/ipc/download.ts`  
**Symptom:** Cancelled downloads remain in the list as "Play and Delete" or "Cancelled / Failed" cards, instead of being removed entirely.  
**Root cause:** When a user cancelled, the asynchronous downloader's catch block caught the aborted request error and wrote the status back to `'cancelled'` or `'error'` in the database after the rows were deleted, effectively recreating or leaving them.  
**Fix:** Updated the `download:cancel` IPC handler to delete the row and clean up files immediately. Modified the downloader's catch block to skip database writes entirely if the cancellation signal was active, preventing residual rows from being updated.  
**DO NOT:**
- Write status updates to the database from the downloader catch block if the download was cancelled or deleted.

---

## DN-028: Custom Protocol Schemes must be explicitly registered and permitted in CSP

**Date:** 2026-05-22  
**Area:** `client/src/main/index.ts`  
**Symptom:** Playing offline content shows a black screen or fails silently, and browser console displays CSP violation errors blocking the custom protocol (e.g. `offline://`).  
**Root cause:** Custom protocols like `offline://` used for serving local encrypted segments run inside Chromium. Without registering the scheme as standard/secure/corsEnabled, and without explicitly adding `offline:` to `connect-src` and `media-src` in the Content Security Policy, Chromium rejects the request as a security violation.  
**Fix:**  
1. Register `offline` with `standard: true`, `secure: true`, and `corsEnabled: true` in `protocol.registerSchemesAsPrivileged` at startup.  
2. Explicitly add `offline:` to both `connect-src` and `media-src` directives in the CSP header for both development and production profiles.  
**DO NOT:**
- Remove the `offline:` protocol scheme from the `connect-src` or `media-src` CSP directives.
- Omit `corsEnabled: true` or `standard: true` when registering the scheme.

---

## DN-029: Watchlist modifications must support empty request bodies on DELETE requests

**Date:** 2026-05-22  
**Area:** `client/src/renderer/api/client.ts`  
**Symptom:** Unlisting an item from the watchlist fails with a generic "Request failed" error.  
**Root cause:** The API client unconditionally attached the `'Content-Type': 'application/json'` header to all requests, even if no request body was present. For DELETE requests, the Fastify backend received this header and tried to parse JSON from the empty request stream, throwing a 400 Bad Request error.  
**Fix:** Modified the client request builder to only attach `'Content-Type': 'application/json'` if the request `body` is not `undefined`. Added fallback error parsing in the client to bubble up standard framework error messages.  
**DO NOT:**
- Send a `'Content-Type'` header on HTTP requests (like GET or DELETE) that do not carry a request body payload.

---

## DN-030: Sideloaded subtitle format conversion for player compatibility

**Date:** 2026-05-22  
**Area:** `client/src/main/ipc/providers.ts`  
**Symptom:** External subtitles fail to load or render inside the media player.  
**Root cause:** OpenSubtitles fetches files in SRT format. Chromium's video element only native-renders WebVTT subtitles, which requires dot-separated milliseconds and the `WEBVTT` prefix header.  
**Fix:** Implemented an on-the-fly converter in the stream proxy. If the `format=vtt` query is present, it retrieves the SRT subtitle file, replaces comma delimiters (e.g., `00:01:02,123`) with periods (e.g., `00:01:02.123`), prepends `WEBVTT\n\n`, and serves it with `text/vtt` content-type.  
**DO NOT:**
- Serve raw SRT subtitle tracks directly to the renderer's video element.

---

## DN-031: Offline playback for direct progressive video files must use range-request chunk decryption

**Date:** 2026-05-22  
**Area:** `client/src/main/ipc/download.ts`, `client/src/main/index.ts`, `client/src/renderer/pages/Player.tsx`  
**Symptom:** Playing downloaded direct progressive videos (.mp4, .webm, .mkv) causes application crashes due to Out of Memory (OOM) errors, or fails seeking/scrubbing entirely.  
**Root cause:** Progressive video files can be very large (gigabytes). Attempting to read and decrypt the entire video into a single buffer results in OOM crashes. Additionally, HLS.js cannot play progressive videos, so they must be played natively by the browser, which requires range requests (`Range` headers) to support seeking.  
**Fix:**  
1. In the downloader, save direct progressive videos in encrypted 2MB chunks (`seg_N.enc`) on disk and write a manifest with a `direct:` prefix.  
2. In the offline protocol handler, route `video.*` requests to `decryptLocalDirectVideoRange`.  
3. In `decryptLocalDirectVideoRange`, parse the client's `Range` header, cap response buffer size to a max of 4MB to prevent OOM, read/decrypt only the overlapping 2MB chunks, slice to the exact byte range requested, and return the partial buffer with a 206 status and correct `Content-Range`/`Content-Length` headers.  
4. In the Player page, if the manifest starts with `direct:`, skip wrapping it in a local Blob URL and set the video source directly to the parsed `offline://` URL.  
**DO NOT:**
- Attempt to read or decrypt an entire progressive video file into memory at once.
- Feed progressive video `offline://` URLs to HLS.js, or wrap them in HLS-specific blob URLs in the player.
- Omit Range header handling and 206 Partial Content responses, as this breaks seeking/scrubbing.

---

## DN-032: Cross-compiling the Windows `.exe` on Linux ships Linux `.node` binaries silently

**Date:** 2026-05-22
**Area:** `client/electron-builder.win.yml`, the build process (no source-tree file), `node_modules/better-sqlite3`, `node_modules/keytar`
**Symptom:** A Windows `.exe` built on a Linux host (via `electronuserland/builder:wine`) packages and signs cleanly, but at runtime on Windows the app fails to launch — Electron can't load `better_sqlite3.node` or `keytar.node`. From the user's side this looks identical to the v1.0.2-beta Windows release: "installer ran, app does not work."
**Root cause:** Three independent silent failures stack into one broken installer.
1. **`electron-builder --config electron-builder.win.yml` is not enough on Linux.** Without an explicit `--win` flag, electron-builder defaults to the *host* OS regardless of what the config file specifies. The `win:` section in the config is honoured only when `--win` (or `--mac`/`--linux`) is on the CLI. On Windows CI the host *is* `win32`, so this latent bug never surfaces.
2. **`prebuild-install` ignores `npm_config_target_platform` / `npm_config_target_arch`.** Those env vars are read by `@mapbox/node-pre-gyp`, but `better-sqlite3` and `keytar` use `prebuild-install`, which reads the *unprefixed* `npm_config_platform` / `npm_config_arch`. Setting the prefixed names looks correct but is silently a no-op — `prebuild-install` falls back to host detection and downloads Linux prebuilts.
3. **`keytar` ships NAPI prebuilds, not Electron-runtime prebuilds.** Even calling `prebuild-install` directly with `--runtime=electron --target=31.7.7` fails for keytar with `No prebuilt binaries found`. keytar publishes `keytar-vX.Y.Z-napi-v3-win32-x64.tar.gz`, so the right invocation is `--runtime=napi --target=3`. `better-sqlite3`, by contrast, does ship Electron-runtime prebuilds and wants `--runtime=electron --target=31.7.7`.
**Fix:**
1. Pass `--win` to electron-builder when packaging from a non-Windows host.
2. Fetch Windows prebuilds *per native module* with the right runtime, after `npm install` and before electron-builder:
   ```
   cd node_modules/better-sqlite3 && npx prebuild-install --platform=win32 --arch=x64 --runtime=electron --target=31.7.7
   cd node_modules/keytar         && npx prebuild-install --platform=win32 --arch=x64 --runtime=napi     --target=3
   ```
3. **Always verify** the packaged `.node` files are Windows PE, not Linux ELF, before declaring the build done:
   `file client/release/windows/win-unpacked/resources/app/node_modules/*/build/Release/*.node` must report `PE32+ executable (DLL)`, not `ELF 64-bit LSB`.

**DO NOT:**
- Run `electron-builder --config electron-builder.win.yml` from a Linux host without also passing `--win` — the command "succeeds" but produces a Linux build dropped into `release/windows/`.
- Set `npm_config_target_platform` / `npm_config_target_arch` and assume prebuild-install respects them. For prebuild-install, use the unprefixed `npm_config_platform` / `npm_config_arch`, or call `prebuild-install` directly with `--platform` / `--arch`.
- Use the same `--runtime`/`--target` for every native module. Each module's `package.json` `binary` block (or absence of one + `prebuild-install` in `scripts.install`) tells you whether it ships NAPI or Electron-runtime prebuilds.
- Ship a Windows installer without running `file` over every `.node` inside `win-unpacked/resources/app/node_modules/*/build/Release/`. A correctly packaged but binary-mismatched `.exe` is the same failure shape as the v1.0.2-beta breakage.

---

## DN-033: Redis cache keys for browse, home, and trending endpoints must vary by user TMDB API key hash

**Date:** 2026-05-28  
**Area:** `services/catalog/src/handlers/browse.ts`  
**Symptom:** Cross-user cache leakage (new accounts without API keys see cached TMDB movies from other users) and browse pagination buttons missing because a cached local DB fallback response (with only 1 page) overrides TMDB results.  
**Root cause:** The Redis cache keys were built using only query parameters (e.g., `browse:{"page":1,...}`) without taking the user's `X-TMDB-Key` API key header into account, leading to cache collisions.  
**Fix:** Created a `getCacheKey` helper that generates a SHA-256 hash of the `X-TMDB-Key` header if present, prefixing keys with `:tmdb:<hash>:` or `:local:`.  
**DO NOT:**
- Cache user-scoped or API-key-scoped search/browse queries under global, shared Redis keys without incorporating a hash of the credentials/headers into the key.

---

## DN-034: Sideloaded subtitle Strem.io proxy port parsing must fall back to IPC query

**Date:** 2026-05-28  
**Area:** `client/src/renderer/components/player/VideoPlayer.tsx`, `client/src/main/ipc/providers.ts`  
**Symptom:** Subtitles/closed captions are not available for some providers (specifically those returning direct unproxied CDN URLs).  
**Root cause:** The player parses the local HLS stream proxy port from the `activeStreamUrl`. If the stream URL is a direct CDN URL, the port is empty, preventing the player from querying external subtitles via the strem.io proxy.  
**Fix:** Exposed the dynamic stream proxy port from the main process via IPC `'providers:getProxyPort'`, and updated `VideoPlayer.tsx` to fall back to `window.electronAPI.getProxyPort()` if it cannot parse a port from the stream URL.  
**DO NOT:**
- Assume the stream URL is always a localhost proxy URL, or fail to load external subtitles when direct video playback is active.

---

## DN-035: On a provider-bound stall, build a buffer — do not drop quality; and never force the start level to highest

**Date:** 2026-06-04  
**Area:** `client/src/renderer/components/player/VideoPlayer.tsx`  
**Symptom:** Constant non-fatal `bufferStalledError` / `fragLoadTimeOut` on certain provider streams (e.g. MovieAPI on Spider-Noir ep 5–6) despite very high client bandwidth (400+ Mbps). The only way to watch was to manually pause, let it buffer, then play — and it would stall again shortly after.  
**Root cause:** The provider CDN delivers segments at or below real-time, so the buffer drains as fast as it fills. Two earlier "fixes" made it worse: (1) forcing the first fragment to the **highest** resolution (`hls.nextLevel = highest`, from DN-011) guaranteed a startup stall on a slow source; (2) a later attempt to **cap the bitrate down** on repeated stalls didn't help, because the bottleneck is the provider, not client bandwidth — capping to the lowest level (0/1) still stalled. The real-world failure that masqueraded as a buffer stall was often a `keyLoadError` (the HLS AES key URI failing), which no buffer/quality tuning can fix.  
**Fix:**  
1. **Auto-rebuffer-to-goal** (`startRebuffer`/`endRebuffer`): on a stall, pause once and resume only after a healthy forward cushion (`bufferAhead`) has built — 8s base, growing +6s per quick re-stall up to 30s, decaying back to 8s after ~60s of smooth playback. This automates the manual pause-to-load and is bandwidth-agnostic.  
2. **No manual quality capping.** ABR (start level `-1`) adapts quality to measured throughput on its own. We do **not** touch `hls.autoLevelCapping` on stalls.  
3. **Start in pure AUTO** — removed the `hls.nextLevel = highest` override (supersedes DN-011 #3).  
4. **`keyLoadError` / `keyLoadTimeOut` → fall back** to the next collected source after 2 failures (capping/nudging can't decrypt segments).  
5. **Progress-aware source watchdog:** the "stuck → switch source" net only fires when the buffered end makes **no progress for 20s**, so a slow-but-advancing source the user deliberately chose is never switched away.

**DO NOT:**
- Force the HLS start level to the highest resolution (`hls.nextLevel = highest` / `startLevel = <top>`) — it guarantees a startup stall on slow providers. Start in AUTO (`-1`).
- Cap `hls.autoLevelCapping` down in response to buffer stalls as a primary remedy — on a provider-bound stall it degrades quality without fixing the stall. Let ABR handle quality; build a buffer instead.
- Make the buffering source-fallback watchdog purely time-based — it must require **no buffer progress** before switching, or it will abandon a deliberately-chosen slow source mid-rebuffer.
- Treat `keyLoadError` as a recoverable buffer/quality problem — it isn't; fall back to another source.
- Reduce `maxBufferLength` / `maxBufferSize` below DN-021's high-capacity values (the deep buffer is what absorbs slow patches).

> **Partially reverted (2026-06-08):** Point #1 — the auto-rebuffer-to-goal that *paused playback* to build an 8–30s cushion — was **removed**. In practice it made playback feel constantly stuck: it paused proactively even with buffer left to play and a fast connection, because the bottleneck is the provider CDN, not the client. Playback now relies on hls.js's deep buffer + natural browser stalling (spinner only when truly empty), as it did pre-1.1.5. **Points #2–#5 still stand**: start in AUTO (never force highest), never cap quality on stalls, `keyLoadError` → fall back, and the progress-aware source watchdog (drop a source only after *no buffer progress for 20s*). The deep-buffer guidance also still stands — it's what lets hls.js ride out slow patches without an explicit pause.

---

## DN-036: Continue Watching & History store one row per episode — collapse to one entry per title

**Date:** 2026-06-04  
**Area:** `client/src/renderer/api/playback.ts`, `client/src/renderer/api/user.ts`, `client/src/renderer/pages/Browse.tsx`  
**Symptom:** A single series appeared multiple times in **Continue Watching** and **Viewing History** (once per watched episode), tripping React's "two children with the same key" warning. **Trending Now** and genre categories also appeared twice.  
**Root cause:**  
1. The local `playback_positions` table has primary key `(content_id, episode_id)`, i.e. one row per episode. Continue Watching and History rendered every row, so a series showed up once per episode.  
2. `Browse.tsx` rendered the recommendation rows (`getHomeRows`, which already contains Trending + every genre) **and** a standalone Trending row **and** the home genre rows — duplicating each.  
**Fix:**  
1. `dedupeByTitle()` in `api/playback.ts` collapses a title's episode rows to one — the **most advanced episode** (highest season/episode via `episodeRank`), tie-broken by most-recent activity. Used by both Continue Watching and History. History also populates `seasonNumber`/`episodeNumber` from the episode id so the row is labelled.  
2. Removed the redundant `recommendationApi.getHomeRows` query/render from `Browse.tsx` (the standalone Trending row + `homeData.rows` already cover it).  
3. Defensive de-dupe-by-id inside the catalog mapper (`summaries()`) so a title TMDB returns twice in one result set never renders twice.

**DO NOT:**
- List `playback_positions` rows directly in Continue Watching or History without collapsing per `content_id` — a series has one row per episode and will duplicate.
- Render both `recommendationApi.getHomeRows` and `catalogApi.getHome`'s trending/rows on the same page — `getHomeRows` is derived from `getHome`, so you get every row twice.
- Pick the *most recent* episode row for the per-title entry when the requirement is the *most advanced* one — use `episodeRank` (season-major), not `updated_at` alone.

---

## DN-037: The HLS proxy must rewrite `URI="..."` tag attributes — not just on-their-own-line segment URLs (or the AES key bypasses the proxy)

**Date:** 2026-06-04  
**Area:** `client/src/main/ipc/providers.ts` (proxy manifest rewriter), `client/src/renderer/components/player/VideoPlayer.tsx` (`keyLoadPolicy`)  
**Symptom:** Encrypted provider streams (e.g. MovieAPI) play for a few seconds then stall with a non-fatal `networkError / keyLoadError` in the console, repeatedly. No amount of buffer/quality tuning helps, and the source-fallback watchdog eventually switches the user off the source they wanted.  
**Root cause:** The proxy's m3u8 rewriter rewrote segment URLs with **start-of-line-anchored** regexes (`/^(\/...)$/gm` and `/^(https?):\/\/...$/gm`). Those match a segment URI sitting alone on its line, but the **AES-128 decryption key URL lives inside a tag**: `#EXT-X-KEY:METHOD=AES-128,URI="https://cdn/key.bin",IV=…`. The `URI="…"` is mid-line, so it was never rewritten. hls.js then fetched the key **directly from the CDN**, bypassing the proxy — so it had no `Referer`/`Origin`/cookies and got a 403/timeout. Compounding it, hls.js's default `keyLoadPolicy.timeoutRetry.maxNumRetry` is **1**, so a slow key gave up almost immediately.  
**Fix:**  
1. After the line-based rewrites, run a global `text.replace(/URI="([^"]+)"/g, …)` that routes absolute (`https://…`), protocol-relative (`//…`), and absolute-path (`/…`) URIs through `/proxy/{proto}/{host}/…`. Relative URIs are left untouched (hls.js resolves them against the already-proxied manifest URL). This covers `#EXT-X-KEY`, `#EXT-X-MAP`, `#EXT-X-MEDIA`, `#EXT-X-SESSION-KEY`, etc.  
2. Override hls.js `keyLoadPolicy` to 8 timeout/error retries with 20s first-byte / 60s load timeouts and backoff.

**DO NOT:**
- Rewrite only line-anchored URLs in the HLS manifest. The encryption key, init segment (`#EXT-X-MAP`), and alternate media (`#EXT-X-MEDIA`) all carry their URL in a mid-line `URI="..."` attribute and must be proxied too — otherwise they bypass the proxy's headers and fail on protected CDNs.
- Leave the default `keyLoadPolicy` (it retries a timed-out key only once) on flaky/slow encrypted sources.
- Rewrite *relative* `URI="..."` values — they already resolve against the proxied manifest base; double-proxying them produces a broken path.

---

## DN-038: A user-selected playback source must be pinned — the auto-fallback must never silently switch away from it

**Date:** 2026-06-04  
**Area:** `client/src/renderer/components/player/VideoPlayer.tsx`  
**Symptom:** The user manually switches to a specific source (e.g. the *only* mirror that has a series in black-and-white), and a short while later the player silently swaps them onto a different, unwanted source (a colour mirror) because the chosen one was briefly slow.  
**Root cause:** `autoFallback` treated every source equally. A deliberate user choice was indistinguishable from the initial auto-picked source, so the "stuck → switch source" watchdog (and the key-error path) would move the user to the next collected stream regardless of intent.  
**Fix:** `handleSourceChange(providerId, isAuto = false)` sets `userPinnedSourceRef` when called from the UI (not from `autoFallback`, which passes `isAuto = true`). While pinned, `autoFallback` refuses to switch and instead kicks the loader (`hls.startLoad()`) to keep recovering the chosen source. The content fix (DN-037) is what actually makes the pinned source play; the pin guarantees we never trade the user's content choice for smoothness.

**DO NOT:**
- Call `handleSourceChange` from `autoFallback` without `isAuto = true` — it would pin the auto-chosen source and defeat future fallbacks.
- Let `autoFallback` switch sources while `userPinnedSourceRef` is set — the user picked that mirror deliberately (it may be the only one with the content they want); recover it, don't replace it.

---

## DN-039: The persistent player must stay a single keyed instance mounted outside `<Routes>` — never render VideoPlayer from a route

**Date:** 2026-06-04  
**Area:** `client/src/renderer/App.tsx`, `components/player/PlayerHost.tsx`, `pages/Player.tsx`, `store/player.ts`, `components/player/VideoPlayer.tsx`  
**Symptom (the trap):** Rendering `<VideoPlayer>` from inside the `/player` route (the old design) means navigating away unmounts it — playback stops and progress is lost. Naively re-adding it per-route, or swapping which wrapper `<div>` contains it between fullscreen and PiP, **remounts** the `<video>` element (black flash, re-buffer, lost position).  
**Root cause / design:** Playback state was lifted into `usePlayerStore` (Zustand: `request` + `mode: 'full' | 'pip'`). `PlayerHost` is mounted **once at the app root, outside `<Routes>`**, owns all orchestration (content fetch, session, offline, next-episode), and renders exactly one `<VideoPlayer key="km-active-player">`. Fullscreen vs PiP changes only the wrapper's CSS (size/position) and the `embedded` prop — the element's tree position and key never change, so React keeps the same instance and the `<video>` keeps playing. `pages/Player.tsx` is a thin launcher that writes the URL/state into the store. `VideoPlayer` is lazy-loaded by the host so hls.js isn't pulled into the main bundle at startup.  
**DO NOT:**
- Render `<VideoPlayer>` directly from a route/page again — it must live only in `PlayerHost` so it survives navigation.
- Change the `key` of the `<VideoPlayer>`, or move it between different parent elements, when toggling full ⇄ PiP. Keep one wrapper whose className/style changes; keep the key stable. Different parents or keys = remount = lost playback.
- Mount `PlayerHost` inside `<Routes>` or any route element — it must be a sibling of `<Routes>` (app root) or it unmounts on navigation.
- Statically `import` `VideoPlayer` into `PlayerHost` (or anything eagerly loaded) — that drags hls.js (~570 kB) into the startup bundle. Keep it behind `lazy()`.
- Bump `launchToken` / call `play()` on a PiP "expand" — that rebuilds the session and resets progress. Expanding must only set `mode = 'full'` (the launcher detects the same title and skips re-launch).

---

## DN-040: The user-pinned source must be RESET on every title/episode change — a pin must not leak across titles

**Date:** 2026-06-08  
**Area:** `client/src/renderer/components/player/VideoPlayer.tsx`  
**Symptom:** After manually picking a source once on *any* title, every *subsequent* title becomes slow to start, keeps buffering, and never falls back to a working mirror — even though the initial race collected alternatives. The console shows `[auto-fallback] initial-load timeout — source is user-pinned, retrying instead of switching` on a title the user never pinned. Feels like a regression: "fetching the stream used to be faster."  
**Root cause:** `userPinnedSourceRef` is set when the user manually picks a source (DN-038) so the auto-fallback won't abandon a deliberately-chosen mirror. But the reset-on-prop-change effect (keyed on `session.manifestUrl`, etc.) cleared `triedSourcesRef` and `networkErrorCountRef` and **forgot to clear `userPinnedSourceRef`**. So the pin set on title A persisted into titles B, C, D… On each new title, if the auto-picked initial source was slow/dead, `autoFallback` saw the stale pin and **refused to switch** — it just retried the dead source (`resuming with 0.0s buffered (waited 30.0s)`), instead of jumping to a collected alternative.  
**Fix:** Set `userPinnedSourceRef.current = false` inside the title/episode reset effect, alongside the `triedSourcesRef` / `networkErrorCountRef` resets. A new title/episode is a fresh decision — the user hasn't pinned anything for it yet. Pinning is re-established the moment they manually pick a source for the new title.

**DO NOT:**
- Reset `triedSourcesRef` / `networkErrorCountRef` on title change without also clearing `userPinnedSourceRef` — a pin is per-content intent and must not survive into the next title, or the auto-fallback is silently disabled everywhere after the user's first manual pick.
- Make the pin persistent/global (e.g. a module-level or store value) — it must be per-playback and cleared on each new content load.
- Confuse this with DN-038: DN-038 says *don't switch away from a pin within a title*; DN-040 says *the pin itself must not survive into the next title*. Both are required.

---

## DN-041: Audio (dub) tracks come ENTIRELY from the source manifest — never fabricate language options that aren't in the stream

**Date:** 2026-06-08  
**Area:** `client/src/renderer/components/player/VideoPlayer.tsx`, `PlayerControls.tsx`, `client/src/main/providers/*`, `client/src/main/stream-extractor/index.ts`  
**Symptom:** Expectation that "most movies/series should have English/Spanish/French dub selections," but the player's Audio menu shows only "No additional audio tracks for this title" on the overwhelming majority of titles.  
**Root cause (by design, not a bug):** Alternate audio renditions exist only if the **source HLS manifest** declares them (`#EXT-X-MEDIA:TYPE=AUDIO`). This aggregator has **no audio-language dimension anywhere upstream**: `StreamSource` carries only `url`/`quality`/`headers`/`subtitles` (no audio field); no provider `getEmbedUrl` accepts a language/dub parameter; the extractor captures whatever single stream the embed page plays. Empirically confirmed from `~/.config/KokoMovie/extraction.log`: real master manifests are 646–1956 bytes with 2–3 variants and no audio rendition group — i.e. video-only masters with a single muxed (original-language) audio track. There is no free universal "dub audio" API to bolt on; the only sources of multi-language audio are (a) a manifest that already carries the renditions, or (b) paid AI-dubbing pipelines (different architecture).  
**Design that IS correct:** `AUDIO_TRACKS_UPDATED` populates the menu from the manifest's real renditions; a preferred-language order (`PREFERRED_AUDIO_LANGS`: English → Spanish → French → extras) auto-selects the best *available* dub and orders the menu; `currentAudioLangRef` re-selects the same language by code across source switches; `handleAudioTrackChange` falls back same-language → preferred → first track. When the manifest has ≤1 audio track, the menu **correctly** shows the "No additional audio tracks" fallback. The feature activates only when a source genuinely provides dubs.

**DO NOT:**
- List fixed languages (English/Spanish/French) in the Audio menu when the stream doesn't carry them — a control that "switches" to audio that doesn't exist is a lie; selecting it would do nothing or break audio.
- Assume most titles have dubs, or treat the empty Audio menu as a bug — it reflects the source stream. Keep the `tracks.length <= 1 → setAudioTracks([])` guard so single-audio streams show the fallback.
- Try to "fix" missing dubs in the player/proxy — the audio isn't in the stream; the only real lever is integrating a dub-capable provider AND threading a language dimension through `StreamRequest` → extraction → UI (a separate, larger effort with uncertain coverage).
- Remove the preferred-language auto-select/ordering or the language-keyed `currentAudioLangRef` re-selection — without them, multi-audio streams default to an arbitrary track and lose the user's language across source switches.

**Update (2026-06-08) — "select any dub on any provider" is achieved by ROUTING, not by removing this rule.** DN-041 cannot be "removed": you physically cannot synthesise a Spanish dub from an English-only stream, and no free movie/TV embed API exposes audio by URL (researched — VixSrc's `?lang=` only sets the *default* track from dubs already in its manifest; VidSrc's `ds_lang` and others' `?sub=` are **subtitle** params, not audio). The correct optimisation is **cross-source language selection**: each collected source already reports its declared dub languages (`StreamSource.audioLangs`, parsed from `#EXT-X-MEDIA:TYPE=AUDIO` in `getMaxResolution`). The Audio menu now lists, below the current source's real tracks, a "More languages · other sources" section built from `crossSourceAudio` (languages present on *other* collected sources but not the current one). Picking one sets `currentAudioLangRef` and calls `handleSourceChange(sourceId)`; the existing `AUDIO_TRACKS_UPDATED` re-selection then auto-selects that dub on the new manifest. DO NOT turn this into fabricated/global language buttons: only offer a cross-source language when a real collected source declares it (a muxed single-audio source reports `audioLangs: []`, so its language is unknown and must NOT be guessed). DO NOT attempt to merge audio from one provider with video from another — separate encodings/timelines make in-app muxing infeasible.

---

## DN-042: A non-pinned source that repeatedly rebuffers must switch to a collected alternative — the progress-aware watchdog alone won't catch it

> **Reverted (2026-06-08, same day):** This entry described a rebuffer-cycle counter built *on top of* the auto-rebuffer-to-goal controller. That whole controller was removed hours later (it caused "constant pausing" — see DN-035's revert note), so this cycle-counter logic was removed with it. The remaining safety net for a bad source is the progress-aware watchdog (no buffer progress for 20s → switch). Kept below for history; do not re-add the rebuffer-cycle switch without first re-adding the pausing controller (don't — see DN-035).

**Date:** 2026-06-08  
**Area:** `client/src/renderer/components/player/VideoPlayer.tsx`  
**Symptom:** Constant `[rebuffer] buffer dry — holding until 8s buffered ahead` / `resuming … (waited 11.0s)` cycling forever on a title, even on a 300+ Mbps connection, while the log also shows `3 alternative source(s) collected for switching`. The player never tries those alternatives — it just rebuffers on the first (auto-picked) source indefinitely.  
**Root cause:** The provider CDN delivers segments at/just-below real-time, so the auto-rebuffer-to-goal controller (DN-035) keeps cycling: pause → build cushion → play → drain → repeat. The **progress-aware source watchdog** (DN-035 #5) only switches sources when the buffered end makes **no progress for 20s** — but during each rebuffer the buffer *does* advance, so `stalledMs` keeps resetting and it never fires. That "no progress" rule was designed to protect a *user-pinned* slow source (DN-038/DN-040) from being abandoned mid-rebuffer. The gap: for an **auto-picked** source with untried alternatives collected, the user didn't choose it and is better served by a smoother mirror — but nothing switched.  
**Fix:** Count rebuffer cycles per source (`rebufferCycleCountRef`, incremented in `startRebuffer`). When the source is **not** user-pinned **and** has run dry **≥ 3 times** **and** an untried collected alternative exists (`allStreams`, minus `triedSourcesRef`), call `autoFallback('repeated rebuffering')` to switch instead of holding again. Pinned sources are exempt (recover, never switch). If no alternative remains, fall through and keep rebuffering (best effort — never error out a working-but-slow source). The counter resets on a new stream (initial load or source switch, in the HLS init effect, alongside `rebufferGoalRef`) and after ~60s of smooth playback (the decay block).

**DO NOT:**
- Rely on the time-based "no buffer progress for 20s" watchdog alone to escape a slow source — a source that rebuffers *with* progress never trips it. The cycle-count switch is what handles the "advances but keeps draining" case.
- Apply the cycle-count switch to **user-pinned** sources — that reintroduces DN-038/DN-040 (yanking the user off the mirror they deliberately chose). Always gate on `!userPinnedSourceRef.current`.
- Switch when there's **no** untried alternative — error-ing out or looping a working-but-slow source is worse than continuing to rebuffer on it. Guard with the `hasAlt` check and fall through.
- Forget to reset `rebufferCycleCountRef` on a source switch — `autoFallback` changes `activeStreamUrl`, which re-runs the HLS init effect where the reset lives; if you move the reset, ensure the new source starts at 0 or it will instantly switch again on its first rebuffer.

---

## DN-043: `getFirstStream` must resolve the caller as soon as a stream is chosen — never block playback on the alternatives-collection window

**Date:** 2026-06-08  
**Area:** `client/src/main/ipc/providers.ts`, `client/src/main/preload.ts`, `client/src/renderer/components/player/PlayerHost.tsx`, `store/player.ts`  
**Symptom:** "Finding Best Stream" takes 30s+ even when a provider returns a stream quickly. The extraction log shows a stream found early, then a long pause before the player opens.  
**Root cause:** `providers:getFirstStream` did not resolve when a stream was found — it then waited out an **8s `collectTimer`** (plus up to a **5s quality-wait**) to gather alternative mirrors *before* returning. So every playback paid ~8–13s of dead time on top of the actual extraction, purely to pre-fill the source-switcher.  
**Fix:** Split "give the caller a stream" from "collect alternatives". The caller is resolved the instant an acceptable stream is chosen (≥1080p immediately; ≥720p after a short 3.5s quality-wait; sub-720p only as a last resort — the 720p floor). The remaining providers keep running in the **background** for a short window; the full mirror list is then pushed to the renderer via the `providers:streamsCollected` IPC event, correlated to the playback by a `searchId`. `PlayerHost` merges it into the active request's `allStreams` with `patchRequest`. This is safe because `allStreams` is **not** a dependency of the player's session/HLS-init/reset effects (it's read in render + the switch/fallback closures only), so folding in late mirrors never remounts the `<video>` or restarts playback (DN-039/DN-040).

**DO NOT:**
- Re-introduce a blocking "collect all alternatives" wait before resolving `getFirstStream` — it puts the whole collection latency in front of playback. Resolve first, collect in the background, push via event.
- Push the collected list into a player prop/state that the session or HLS-init effect depends on — that remounts the `<video>` (black flash, re-buffer, lost position). Keep `allStreams` out of those effects' deps and merge it via `patchRequest` only.
- Drop the `searchId` correlation — without it, a late `streamsCollected` event from a previous title could overwrite the current playback's source list.
- Return a sub-720p stream while a ≥720p candidate is still in flight (quality must be 720p/1080p — DN-009/DN-010); only fall back to sub-720p when every provider has finished and nothing better exists.

---

## DN-044: Audio dubs for movies/TV must come from a multi-audio HLS master — no movie/TV provider selects a dub by URL

**Date:** 2026-06-08  
**Area:** `client/src/main/providers/*`, `client/src/main/ipc/providers.ts` (proxy manifest rewriter)  
**Symptom:** Expectation that adding a "dub provider" with a `?lang=` URL would let the headless extractor fetch a specific dub for any movie/series.  
**Root cause (by design):** Surveyed the 2026 provider landscape — for **movies/TV**, dub selection is either **inside the HLS manifest** (`#EXT-X-MEDIA:TYPE=AUDIO`, e.g. VixSrc/Indra) or **inside the embed player's own UI** (client-side, e.g. letsembed/Indra). None expose a per-language URL the extractor can target, and our extractor captures only the *first* stream the embed page loads (it never clicks an in-player language button). A true per-language URL exists only for **anime** sources (SupaPlay's `/{sub|dub}` segment, AnimePahe's `audio: jpn/eng` JSON), and those use **anime-site IDs, not TMDB**, so they need a separate TMDB→anime-ID mapping layer (a distinct sub-project).  
**Fix / correct design:** Get movie/TV dubs only by adding providers whose **master manifest carries the audio renditions** (VixSrc added; Indra experimental). The existing player Audio menu (DN-041) + the proxy's `URI="..."` rewriting (DN-037) then surface and proxy them automatically. The `audioLang` field on `StreamRequest` is groundwork for the anime pipeline / providers that *can* take a language in their URL; manifest-only providers ignore it.

**DO NOT:**
- Add a movie/TV "dub provider" that appends a language to its embed URL expecting the extractor to fetch that dub — no such provider exists; the audio won't change (and offering a language that isn't in the stream is the DN-041 "lie").
- Strip `#EXT-X-MEDIA:TYPE=AUDIO` lines in the proxy's sub-720p variant filter — that filter must only remove video `#EXT-X-STREAM-INF` variants, or dub tracks vanish from the Audio menu.
- Build the anime sub/dub pipeline on top of TMDB IDs directly — anime providers need their own IDs; a TMDB→anime mapping (search-by-title + episode-number reconciliation) is required first.

---

## DN-045: The stream proxy must detect HLS manifests by content, not just a `.m3u` URL extension — some providers serve extension-less playlists

**Date:** 2026-06-08  
**Area:** `client/src/main/ipc/providers.ts` (proxy request classifier + manifest rewriter)  
**Symptom:** A newly-added provider (VixSrc) plays but: the Quality menu shows **only 720p** (no 1080p, though 1080p exists), selecting a non-default audio dub (e.g. **Italian**) snaps back to the default, and the console floods with non-fatal `fragLoadError`. The extraction log shows the master playlist returning via `[Segment done]` (head `234558544d3355` = `#EXTM3U`) and hls.js then requesting rendition playlists **directly** from the CDN (`Host: vixsrc.to` / `sc-b2-19.vix-content.net`, not `localhost:<proxyPort>`), failing with `ERR_NAME_NOT_RESOLVED`.  
**Root cause:** The proxy classified a request as a manifest with `realUrl.includes('.m3u')`. VixSrc serves its **master AND per-rendition** playlists from **extension-less** URLs (`/playlist/718930?type=video&rendition=480p`). With no `.m3u` in the path, the proxy treated the master as a binary segment (`streamSegment`, raw pass-through) and **never rewrote it**. hls.js therefore resolved every rendition/segment URL against the *real* CDN and fetched them directly — bypassing the proxy's headers, the absolute-URL rewriting, and the sub-720p variant filter. That single miss produced all three symptoms: no quality filtering (720-only), un-proxied audio renditions (dub revert), and direct-CDN segment failures.  
**Fix:** Treat a request as a possible manifest when the URL contains `.m3u` **or** its path is **extension-less** (`isExtensionlessPath`). Such requests go through `fetchNode` + the rewrite path, where the HLS body is **confirmed by `Content-Type: *mpegurl*` or an `#EXTM3U` magic-header sniff** before any rewriting (so a non-HLS extension-less response is served untouched). Real media segments always carry an extension (`.ts`/`.m4s`/`.mp4`/even disguised `.html`), so they still hit `streamSegment` and stream-pipe with no in-memory buffering (DN-011 preserved).

**DO NOT:**
- Gate manifest rewriting solely on a `.m3u` substring in the URL — providers serve extension-less master/rendition playlists (and a master that isn't rewritten makes hls.js fetch every rendition/segment straight from the CDN, breaking quality filtering, dub switching, and proxied headers).
- Route an **extension-bearing** segment (`.ts`/`.mp4`/`.html`) through the buffering manifest path — only extension-less URLs (or `.m3u`) get sniffed; segments must keep stream-piping (DN-011).
- Rewrite a buffered response as a manifest without first confirming it's HLS (`mpegurl` content-type or `#EXTM3U` header) — an extension-less non-playlist would get corrupted by the m3u8 line rewriter.

---

## DN-046: Extension-less manifest detection must be SCOPED to playlist endpoints — not all extension-less URLs — and manifest fetches need retry

**Date:** 2026-06-08  
**Area:** `client/src/main/ipc/providers.ts` (proxy request classifier `looksLikeManifestUrl` + `fetchManifest`)  
**Symptom:** After DN-045's first cut (which treated *every* extension-less URL as a manifest): (1) playing **VidLink** flooded the console with `GET http://localhost:<port>/proxy/https/storm.vodvidl.site/proxy/wiwii/<blob>... net::ERR_EMPTY_RESPONSE`; (2) switching the source to **VixSrc** failed with a **502 Stream proxy failed**.  
**Root cause:** Two over-corrections from DN-045.  
1. *Too-broad classification.* VidLink routes its actual **segments** through extension-less **nested proxies** (`storm.vodvidl.site/proxy/wiwii/<base64>`). Treating any extension-less path as a manifest pulled those off the resilient `streamSegment` pipe (which retries empty 206s / Range-resumes truncated bodies) and onto the single-shot buffering path → empty body → `ERR_EMPTY_RESPONSE`.  
2. *Lost resilience.* Routing VixSrc's master/rendition playlists through `fetchNode` (one attempt, no retry) meant VixSrc's intermittent **"socket hang up"** under concurrent requests rejected straight to the proxy's `catch` → **502** (whereas `streamSegment` would have retried).  
**Fix:** (a) `looksLikeManifestUrl` only matches `.m3u(8)` OR an **extension-less path that names a playlist endpoint** (`/playlist`, `/manifest`, `/master`); extension-less *segment* proxies no longer match and keep stream-piping. (b) Added `fetchManifest` — a thin retry wrapper (3 attempts) around `fetchNode` used only for the small, idempotent manifest/vtt fetches — so a transient socket hang up no longer becomes a 502.

**DO NOT:**
- Treat every extension-less URL as a manifest — providers route real segments through extension-less nested proxies; only paths that *name* a playlist endpoint qualify, and even then content is confirmed by `Content-Type`/`#EXTM3U` before rewriting.
- Fetch a manifest through the buffering path with a single attempt — playlist hosts (VixSrc) intermittently socket-hang-up under concurrency; retry the small idempotent manifest fetch instead of letting it become a player-facing 502.
- Re-route an extension-less request to the manifest/buffer path if it might be a segment proxy (e.g. `/proxy/<blob>`, `videostr`/`vodvidl`-style hosts) — segments must keep `streamSegment`'s retry + Range resume (DN-011).

---

## DN-047: The main-process stream proxy must resolve outbound hosts with a public-DNS fallback — ISPs block CDN hostnames the player needs

**Date:** 2026-06-08  
**Area:** `client/src/main/ipc/providers.ts` (`resilientLookup`, wired into `fetchNode`, `streamSegment`, `checkDomainResolves`)  
**Symptom:** A provider plays its master/audio menu fine (master rewritten, audio renditions listed) but every segment request through the proxy returns **502 Bad Gateway** in a tight loop; playback never starts (auto-fallback fires) and selecting a non-default dub reverts to the default. The extraction log shows `[Proxy Segment Error] … getaddrinfo ENOTFOUND sc-b2-08.vix-content.net`.  
**Root cause:** The segment CDN host (`*.vix-content.net` for VixSrc) is **blocked by the user's ISP DNS resolver** — `getent hosts vix-content.net` returns nothing, while `nslookup … 1.1.1.1` resolves it (`57.129.13.231`). Node's `http(s).request` uses `dns.lookup` (libuv getaddrinfo = the **system** resolver), so the proxy inherits the ISP block and can't fetch any segment. This is invisible in dev unless you read the log: the renderer only ever talks to `localhost`, so the failure surfaces only inside the main process.  
**Fix:** `resilientLookup` — a custom `lookup` passed to every outbound proxy request: try the system resolver first (fast; respects `/etc/hosts`, VPNs, split-DNS), then on failure resolve via a `dns.Resolver` pinned to public servers (`1.1.1.1`, `8.8.8.8`, `9.9.9.9`) using `resolve4`/`resolve6` (which honor `setServers`, unlike `dns.lookup`). `checkDomainResolves` uses the same fallback so an ISP-blocked-but-public host isn't pre-emptively discarded. SNI/Host stay the hostname (only the A/AAAA is overridden), and the HTTPS agent already sets `rejectUnauthorized: false`.

**DO NOT:**
- Assume a stream host that fails to resolve is dead — check a public resolver; ISPs routinely NXDOMAIN piracy-CDN hostnames that are live on `1.1.1.1`/`8.8.8.8`.
- Rely on `dns.setServers()` alone to fix this — it only affects `dns.resolve*`, NOT `dns.lookup`, which is what `http(s).request` uses. You must pass a custom `lookup` (or resolve manually and connect by IP) to override resolution for outbound requests.
- Resolve segment hosts in the renderer — the renderer must only ever talk to the localhost proxy (CORS + header injection); host resolution belongs in the main-process proxy where the public-DNS fallback lives.
- Hard-pin ALL DNS to public servers — try the system resolver first so VPNs, split-horizon DNS, and `/etc/hosts` keep working; only fall back when it fails.

---

## DN-048: Reliable movie/TV dubs (esp. Spanish/Latino) come from TORRENTS, streamed free via built-in P2P (WebTorrent) — debrid is paid; non-MP4 containers are remuxed on the fly with bundled ffmpeg

**Date:** 2026-06-08  
**Area:** `client/src/main/ipc/torrent.ts` (Torrentio discovery + WebTorrent engine + Range server), `PlayerHost.tsx` (merge), `VideoPlayer.tsx` (`mergedSources` + on-demand magnet resolve), `Settings.tsx`  
**Symptom / request:** "I only ever see English/Italian/Russian dubs; I want Spanish (priority), French, etc. — Stremio has them working perfectly, do it like Stremio. And it must be FREE."  
**Root cause / finding (researched):** Embed providers (VidSrc family, VixSrc, VidLink, …) are overwhelmingly **English**; the only multi-audio one is **VixSrc (Italian → EN/IT)**. **No URL parameter adds a dub** — `ds_lang`/`?sub=` are **subtitle** params, and VixSrc's `?lang=` only picks the *default* among dubs already in its manifest. Aggregators that expose audio (Vyla, OMSS, TMDB-Embed-API) are **hosted backends** → violate fully-local. **Stremio's "perfect" dubs come from torrents**: Torrentio surfaces language-specific *releases* (Latino/Castellano/TrueFrench). The *instant* way uses a **debrid** service — but **all reliable debrid is PAID** (Real-Debrid/AllDebrid/Premiumize/TorBox), so for a free app the only option is what **Stremio's own server** does: stream the torrent **P2P** in-process.  
**Design that IS correct:** `torrent.ts` queries **Torrentio** (discovery only — by IMDB id), parses each release's **language** (flag-emojis + filename keywords) and quality, and returns dubbed releases as `ProviderResult`s whose `streams[0].url` is the **magnet** (NOT yet playable). These merge into `allStreams` in `PlayerHost` and show in the Source switcher (`mergedSources` adds non-registered `p2p-*` ids) + cross-source **Audio → More languages** menu (DN-041 routing, never fabrication). Discovery downloads **nothing**. Only when the user **picks** a `p2p-*` source does `VideoPlayer.handleSourceChange` detect the `magnet:` URL and call `torrent:resolve`, which adds the torrent to a lazily-created **WebTorrent** client, waits for metadata, selects the largest video file, and serves it via a small HTTP server on `127.0.0.1` (`/t/<infoHash-idx>.mp4`). The player's `isDirectVideo` (.mp4) path then plays it.

**Playback / container handling (the MP4-only problem, now SOLVED):** Chromium's `<video>` can't demux MKV/AVI or decode AC3/DTS/EAC3, so most dubbed releases (overwhelmingly **MKV**) used to error out ("Release is MKV — only MP4 plays"). The server now branches by container: **MP4/WebM** are served **directly with full Range** (seekable, zero CPU); **MKV/AVI/MOV** are **remuxed on the fly with bundled `ffmpeg` (`ffmpeg-static`)** — `-c:v copy` (cheap, H.264 untouched) + `-c:a aac` (Chromium-safe) into **fragmented MP4**, streamed progressively (HTTP 200, no Range). The WebTorrent file's `createReadStream()` is piped to ffmpeg stdin and ffmpeg stdout to the response; on client disconnect both are killed (handle `EPIPE` on stdin). `ffmpeg-static` is `asarUnpack`ed and its path is rewritten `app.asar`→`app.asar.unpacked` for packaged builds.

**DO NOT:**
- Re-add **debrid** (Real-Debrid etc.) as a hard requirement — it's **paid**; the user explicitly wanted free, so P2P is the default. (Its apitoken page even 403s without a logged-in premium session.) If re-added later, keep it strictly optional alongside P2P.
- Reject **MKV/AVI/MOV** releases anymore — they're **remuxed on the fly** (video copied, audio→AAC) into fragmented MP4, so they play. BUT: this is `-c:v copy`, so **HEVC video still won't play** (Chromium can't decode it and we don't re-encode it — too heavy for real-time). Keep dropping `x265|h265|hevc` at discovery; relaxing that ships black-screen sources. Transcoded (non-MP4) streams are **progressive** (no Range) → **seeking is limited to the buffered region**; only true MP4/WebM are fully seekable. Don't route either through the HLS proxy.
- Eagerly download during discovery — discovery returns **magnets only**; starting a torrent happens **on pick** (`torrent:resolve`). Eagerly adding every candidate would hammer the swarm and fill the temp cache. Cap concurrently-added torrents (destroy the oldest) and use a temp `mkdtemp` path.
- Call `client.get()` synchronously — in **WebTorrent v3 it is async** (returns a Promise|null). Await it; treat `client.add()` as returning the torrent synchronously and listen for its `ready`/`error` (with a metadata timeout — "no peers" must surface, not hang).
- Load WebTorrent with a plain `import`/`require` — it's **ESM-only** and main is compiled to **CommonJS**; use the `new Function('m','return import(m)')` shim so tsc doesn't downlevel `import()` into `require()` (which throws `ERR_REQUIRE_ESM`).
- Route the localhost torrent URL through the HLS proxy/`toProxyUrl` — it's played via `video.src` (direct MP4 with Range, or a progressive remux); proxying breaks Range/seeking. Serve it from torrent.ts's own server.
- Emit the served URL with host `127.0.0.1` — the renderer CSP only whitelists `media-src http://localhost:*`, and Chromium's CSP treats `localhost` and `127.0.0.1` as **different origins** (`Refused to load media … violates … media-src`). Bind the server to `127.0.0.1` but build the URL with **`localhost`** (matches the HLS proxy, which does the same).
- Serve the torrent file without **CORS headers** — the player's `<video>` uses `crossorigin`, so Chromium blocks the media with `No 'Access-Control-Allow-Origin' header` even though the GET returns 200. Every response (200/206/416/404 + the OPTIONS preflight) must carry `Access-Control-Allow-Origin: *` and expose `Content-Range`/`Accept-Ranges` (mirror the HLS proxy's CORS).
- Derive the **HLS-proxy port from `activeStreamUrl` by a bare `localhost:(\d+)` match** — a P2P torrent source's `activeStreamUrl` is `http://localhost:<torrentPort>/t/…`, a DIFFERENT server. The external-subtitles fetch did this and built `…/proxy/opensubtitles-v3.strem.io/…` against the **torrent** port → 404. Require the `/proxy/` path in the match; otherwise fall back to `getProxyPort()`.
- Trust `video.duration` for a **progressive remux** — a streaming fragmented MP4 has no `mehd`/known duration (verified: ffmpeg writes none for pipe *or* file input + `empty_moov`), so the browser reports the **buffered end, which counts up**. For transcoded torrents, `resolveTorrent` returns `transcoded:true` and the player substitutes the **TMDB runtime** (`durationMins*60`) for the displayed total *and* the heartbeat/position-save duration (so continue-watching % is sane). Direct-MP4 torrents serve with Range and report real duration → no override.
- **Seek a progressive remux with native `video.currentTime`** — the transcoded stream is served HTTP 200 with NO Range support, so a native seek makes Chromium re-request from byte 0 → ffmpeg restarts → the movie **RESETS to the start** (owner-reported). Seeking must RELOAD the stream at the seek point: `video.src = baseUrl + '?start=<sec>&dur=<total>'` (server `-ss` on the on-disk torrent file) while tracking a **timeline offset** so the clock/scrub bar stay on full-movie time — this jumps without resetting. Switching TO a torrent dub must NOT resume via `?start=` (start it at 0) — at switch time the torrent just began and the on-disk file isn't written yet, so an early `-ss` hits a missing file. So: dub-switch = always from 0; scrubbing an already-playing transcode = `?start=` reload. Direct-MP4 torrents are unaffected (served with Range → fully seekable natively).
- **Don't clamp torrent seeking to the buffered region** (the first cut did this — it limited the user to 10s nudges and couldn't reach the middle, since a sequential download doesn't *have* the middle). Support real seek-ahead by DOWNLOADING the target region on demand: map the seek time → byte offset (`time/totalDur × file.length`; pass `dur` from the renderer), then `primeSeekRegion` opens a WebTorrent `createReadStream` at that offset to prioritise those pieces, waits for a lead to hit disk, and **keeps that stream alive** so it keeps pulling pieces forward — because ffmpeg reading the on-disk file with `-ss` does NOT tell WebTorrent which pieces to fetch next (without the live driver, playback starves a few seconds after the seek). Bound the wait (~60s → 503) so a dead swarm-region surfaces a retry, not a hang. Keep this strictly on the SEEK path (`startSec > 0`); never touch first-play (`startSec === 0` streams from 0 via `createReadStream`).
- **Don't prime only a tiny margin BEFORE the seek byte offset** — this caused "audio plays from the seek point but video is frozen on a stale frame." `-ss` + `-c:v copy` lands on the KEYFRAME at/before the target, which can be a whole **GOP (~up to 10s)** earlier; if those bytes aren't on disk, ffmpeg can't decode the video (Chromium holds the last frame) while the audio — no keyframe dependency — plays fine. The tell is exactly that desync. Size the primed window from the file's real bitrate (`bytes/sec = file.length / totalDur`): start it **~12s of video BEFORE** the target and run ~8s after (clamped to sane MB bounds), so a full GOP before the seek is guaranteed present. That ffmpeg seeked correctly is proven by audio playing from the right spot — so when video freezes but audio is right, it's the keyframe window, not the seek estimate.
- Pass **`activeStreamUrl`'s port to `<track>` subtitle URLs** — torrent sources play from a different local server; using that port for `/proxy/opensubtitles…` 404s silently and no subs appear even when the list fetch succeeded. Always use the **HLS proxy port** (`getProxyPort()` / `/proxy/` match) for subtitle list + VTT fetches.
- Forget non-registered source ids — torrent ids are `p2p-*`, not in `providersApi.list()`; `VideoPlayer`'s `mergedSources` must union them in or they appear in `availableSourceIds` but never render.
- Block playback on torrents — discovery runs **best-effort in the background** after the embed race already started playback; no IMDB id or zero dubbed releases is a silent no-op. P2P resolution only runs on an explicit user pick and surfaces a readable error ("No peers found", "Release is MKV …") instead of hanging.
- Remux a multi-audio MKV **without `-map`** — ffmpeg's default stream selection picks the single "best" audio (most channels), so a release with EN+FR+ES audio plays whatever ffmpeg deems best (often French), even though the user picked Spanish. Thread the requested language to `serveTranscoded` (`audioLang`, stored in the `served` map so it survives seek reloads — the server is re-hit by token, not by query) and map the wanted dub FIRST: `-map 0:v:0? -map 0:a:m:language:<iso3>? -map 0:a:m:language:<iso2>? -map 0:a:0?` (the `0:a:0?` is a guaranteed-audio fallback for untagged releases). Cover both ISO 639-2 variants (e.g. `fre` AND `fra`, `ger`/`deu`).
- **Forget the `default` disposition after re-ordering audio** — this is the subtle one. `-c:v copy` / re-mux **copies the source `default` flag**, so even with the requested dub mapped first, the ORIGINAL track keeps `(default)` and **Chromium plays the default-flagged track, not the first stream**. Result: user picks Spanish, still hears French. You MUST clear it and re-assign: `-disposition:a 0 -disposition:a:0 default` (clears default on all audio, sets it on a:0 = the dub we mapped first). The `-map` order alone is NOT enough — verified with ffmpeg: without the disposition fix the original track stays `(default)` and is what plays.
- Feed ffmpeg **`file.path` directly** for the torrent remux — WebTorrent's `file.path` is **relative to the torrent's download dir** (e.g. `Movie.Folder/movie.mkv`), NOT absolute. ffmpeg's cwd isn't the cache, so it fails with `No such file or directory`. Resolve the absolute path against the torrent's download root: `join(file._torrent?.path ?? downloadPath, file.path)` (guard with `isAbsolute`).
- Assume **the torrent file exists on disk** for ffmpeg to read — WebTorrent v3 wraps its on-disk store in an in-memory **`CacheChunkStore` (default 20 pieces, `storeCacheSlots`)**, so a short playback keeps every downloaded piece in RAM and the real file is **never written** → ffmpeg gets `No such file or directory` even with a correct absolute path. `createReadStream` works anyway (it reads through the cache), which is why MP4 releases play but the MKV remux didn't. Add the torrent with **`storeCacheSlots: 0`** so completed pieces flush straight to disk (it's an internal opt, but `client.add` forwards it to the `Torrent` constructor).
- Read the torrent through **the on-disk file for FIRST play** of the remux — stream it through **`file.createReadStream()` (`-i pipe:0`)** instead: it's piece-aware (ffmpeg only sees downloaded bytes, blocks otherwise) and is the exact path MP4 releases use to play reliably. Reserve the on-disk file (`-i <abs path>` + `-ss`) for **seeks only** (a pipe isn't seekable), and only then because `storeCacheSlots: 0` guarantees the file is actually on disk. (History: earlier rounds flip-flopped here — disk-path-for-everything fails for the two reasons above; createReadStream-for-first-play + disk-for-seek is the combination that works. The stderr logging is what proved it; don't guess, read the `[torrent] ffmpeg exited …` line.)
- Detect Spanish/Latino torrents by `latino|castellano|español|spanish|esp` ALONE — release names overwhelmingly use the abbreviations **`Lat` / `Latino` / `Latam` / `Cast`** (e.g. `…1080P-Dual-Lat.mkv`). Missing them means the Spanish release is never surfaced as an `es` source and the user reports "Spanish isn't found." Include `lat|latin|latam|cast` in the keyword regex, but keep it `\b`-anchored so it doesn't false-match substrings (e.g. "lat" inside "PLATINUM").
- Spawn the remux ffmpeg with **`stdio[2] = 'ignore'`** — discarding stderr means a failed remux surfaces to the renderer only as a generic "Video failed to load" with no cause. Capture stderr (it's already `-loglevel error`) and log the tail on a non-zero `close` so HEVC-can't-be-copied / no-usable-audio / truncated-input failures are diagnosable in the app log.
- Make the player's **"Choose Another Source" / Stream-Error button call `onClose`** — `onClose` stops playback and navigates back to the detail page (`PlayerHost.handleClose`), i.e. it kicks the user OUT of the movie, the opposite of what the button says. It must keep them in the player: clear the error, drop the loading overlay, and open the settings panel (Source/Audio/Subtitles/Quality) via the `openSettingsSignal` → `PlayerControls` mechanism. Pin the controls visible (clear the 3s auto-hide) so the menu doesn't fade out over the paused/dead video. Do NOT re-add an inline source list in the error screen — the owner wants the existing settings menu, not a duplicate picker.
- Let the **auto-fallback switch INTO a `p2p-*` torrent source** — torrents take up to ~25s of peer discovery and frequently have no peers, so auto-cycling through them is exactly the "keeps switching server source, loads forever, then 'no peers found'" symptom the owner hit. The auto-fallback (`autoFallback` in `VideoPlayer.tsx`) must filter out `providerId.startsWith('p2p-')` and only switch between embed sources. Torrents are an explicit user pick only (Source menu / Audio → More languages).
- Resolve a cross-source dub as a **single torrent with no fallback** — a given release often has zero seeders, so picking "Spanish" once and dead-ending on that one release is why dubs felt unreliable. The dub picker (`tryPlayDub`) must walk **all** collected sources carrying the language (embeds first, then torrents best-seeded-first — discovery already sorts torrents by `👤` seeders) and play the first that actually starts, falling through on a no-peers/resolve error to the next. Keep it bounded (cap the candidate count) so a string of dead releases can't hang forever, and don't change `activeStreamUrl` until one succeeds so the current source keeps playing underneath.
- Rely on **DHT-only peer discovery or a tiny tracker list** for torrent dubs — peer-finding speed/reliability is the whole game for Spanish/Latino releases. Announce to a broad, current tracker set (`TRACKERS`, ~16 high-traffic UDP/HTTPS from ngosang/trackerslist) AND pass it on `client.add(magnet, { announce: TRACKERS })` (not just baked into the magnet) so announcing starts wide immediately.
- Burn the **full metadata timeout on a dead swarm** — waiting the whole 25s when there are literally no peers is the "loading for a huge time" complaint. Fail fast: if `torrent.numPeers === 0` at ~12s the release is dead — reject then so the caller can try the next one; keep the 25s hard cap only for the case where peers HAVE connected but metadata is slow.

---

## DN-049: Keep query keys consistent when performing optimistic updates

**Date:** 2026-06-08  
**Area:** `client/src/renderer/pages/Browse.tsx`  
**Symptom:** Hovering over a card in Continue Watching and clicking the Remove (×) button does not remove the card from the UI.  
**Root cause:** The query data for Continue Watching was fetched using the key `['continue-watching', profileId, tmdbApiKey]`, but the optimistic update handler in `handleRemoveFromHistory` tried to get and set the query data using the key `['continue-watching', profileId]`. Because of the key mismatch, the optimistic update returned undefined and never updated the active query state.  
**Fix:** Updated `handleRemoveFromHistory` to use the identical three-element key array (`['continue-watching', profileId, tmdbApiKey]`) for retrieving/mutating the query data, and invalidated the query matching the prefix `['continue-watching', profileId]` on success.

**DO NOT:**
- Omit `tmdbApiKey` from query keys used for fetching or optimistically mutating Continue Watching data.
- Forget to include the relevant query parameters (such as `tmdbApiKey`) in the callback dependency arrays.

