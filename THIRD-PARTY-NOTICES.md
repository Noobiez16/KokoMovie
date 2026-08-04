# Third-Party Notices

KokoMovie is distributed under **GPL-3.0-or-later** (see `LICENSE`). Copyright remains with the
respective owners of the components listed below.

This inventory is verified on every build by `npm run check:licenses`, which fails when any
production dependency or bundled binary is undeclared, unrecognised, or incompatible with
GPL-3.0-or-later distribution.

## FFmpeg (bundled executable)

KokoMovie bundles an **LGPL-3.0-or-later** FFmpeg executable and invokes it as a separate
process; it is never linked into the application.

| Field | Value |
|---|---|
| Version | `n8.1.2-34-g9b6c8969e0` (FFmpeg 8.1 release branch) |
| Licence | LGPL-3.0-or-later (`--enable-version3`, no `--enable-gpl`, no `--enable-nonfree`) |
| Source of build | [BtbN/FFmpeg-Builds](https://github.com/BtbN/FFmpeg-Builds), release `autobuild-2026-08-03-14-02` |
| Targets | `linux-x64`, `linux-arm64`, `win32-x64` |
| Verification | SHA-256 pinned in `scripts/fetch-ffmpeg.mjs`; the configure string is read back out of the binary and rejected if it contains `--enable-gpl`, `--enable-nonfree`, `--enable-libx264`, `--enable-libx265`, or `--enable-libxvid` |

The GPL-only components (`libx264`, `libx265`, `libxvid`, `libvidstab`, `frei0r`) are **disabled**
in this build. KokoMovie only uses stream copy, the native AAC encoder, the MP4/MOV muxers, and
the Matroska/AVI/MOV/MPEG-TS demuxers — all LGPL.

**Corresponding source:** FFmpeg source for this exact build is available from
<https://github.com/BtbN/FFmpeg-Builds> and <https://ffmpeg.org/download.html>. The full licence
text ships with every installer at `resources/ffmpeg/LICENSE.txt`, alongside
`resources/ffmpeg/PROVENANCE.json`, which records the exact upstream URL, digest, and configure
line.

**LGPL relinking:** the executable is installed outside the `app.asar` archive at
`resources/ffmpeg/`. Users may replace it with their own compatible FFmpeg build.

Prior releases (up to v1.4.1) bundled `ffmpeg-static`, which is built with
`--enable-gpl --enable-version3`. That dependency has been removed.

> Note: `@ffmpeg-installer/ffmpeg` declares `LGPL-2.1` in its npm manifest but ships a binary
> configured with `--enable-gpl --enable-libx264 --enable-libx265 --enable-libxvid`. It was
> evaluated and rejected.

## Electron and Chromium

Electron 43.2.0 (MIT) bundles Chromium (BSD-3-Clause and others) and Node.js 24 (MIT). Their
licence texts ship inside the installed application directory (`LICENSE`, `LICENSES.chromium.html`).

## npm dependencies

The production dependency graph is 223 packages:

| Licence | Packages |
|---|---:|
| MIT | 183 |
| Apache-2.0 | 19 |
| ISC | 11 |
| BSD-2-Clause | 2 |
| BSD-3-Clause | 1 |
| BSD (2-clause text) | 1 |
| MPL-2.0 | 1 |
| Python-2.0 | 1 |
| BlueOak-1.0.0 | 1 |
| `MIT OR WTFPL` | 1 |
| `BSD-2-Clause OR MIT OR Apache-2.0` | 1 |
| GPL-3.0-or-later (KokoMovie itself) | 1 |

Regenerate this table with `npm run check:licenses -- --report`. `package-lock.json` remains the
authoritative dependency graph. Development-only tooling is not redistributed and is out of scope.

One package predates SPDX metadata and was reviewed by reading its licence file directly:

- `limiter@1.1.5` — declares the legacy `licenses: [{ type: 'MIT' }]` array; `LICENSE.txt` is the
  MIT text. Recorded in `scripts/check-licenses.mjs`.

## The Movie Database

This product uses the TMDB API but is not endorsed or certified by TMDB.

TMDB terms and branding requirements apply: <https://www.themoviedb.org/terms-of-use>
