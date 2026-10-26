# Legal and Third-Party Services

KokoMovie is an independent local media browser and player. It does not host or operate catalog or streaming infrastructure. Users are responsible for law, service terms, content licenses, and geographic restrictions.

## TMDB

This product uses the TMDB API but is not endorsed or certified by TMDB.

Users supply their credential and remain subject to TMDB terms. Attribution appears in Settings next to API Configuration.

## Providers, torrents, and downloads

Providers, CDNs, subtitle sources, torrent indexes, and peers are independent third parties. Availability, safety, accuracy, and authorization are not guaranteed. Do not access or distribute material without permission.

## FFmpeg and project license

KokoMovie is licensed **GPL-3.0-or-later** (`LICENSE`). Both `package.json` manifests declare it and
`npm run check:licenses` enforces it.

The bundled FFmpeg executable is an **LGPL-3.0-or-later** build (BtbN/FFmpeg-Builds, release
`autobuild-2026-07-31-14-10`, FFmpeg `n8.1.2`). It replaces the former `ffmpeg-static` dependency,
whose binary was configured `--enable-gpl --enable-version3`. FFmpeg is spawned as a separate
executable and never linked, and every GPL-only component is disabled in the build.

Obligations satisfied for each release:

- KokoMovie's corresponding source is published in this repository.
- The FFmpeg licence text ships at `resources/ffmpeg/LICENSE.txt` in every installer, with
  `resources/ffmpeg/PROVENANCE.json` recording the upstream URL, SHA-256, and configure line.
- FFmpeg's corresponding source is available from BtbN/FFmpeg-Builds and ffmpeg.org.
- The executable is installed outside `app.asar` so users can replace it (LGPL §4).

macOS Intel and Apple Silicon packages compile unmodified official FFmpeg 8.1.2 source with
LGPLv3 enabled, GPL/nonfree disabled and external-library autodetection disabled. The source
archive is checksum-pinned, published with the release and identified in packaged provenance.
See `THIRD-PARTY-NOTICES.md` for the exact source URL and integrity pin.

Windows/Linux artifacts are unsigned. macOS artifacts are ad-hoc signed and not notarized;
this does not provide Apple Developer ID publisher identity. Mac users may need per-app
Gatekeeper approval and install updates manually. SHA256SUMS.txt covers all release assets.
This is not legal advice.
