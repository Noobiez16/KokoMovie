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



