# `client/release/` — Build Output Folder

This folder holds the packaged desktop installers (`.deb`, `.AppImage`, `.exe`, `.dmg`) produced by `electron-builder`. It is **not** code; it is build output.

## Generation policy

**Do not generate a new release on your own.** Builds in this folder are produced **only when the project owner (Noobiez16) explicitly requests one**, and **with the exact version string the owner provides**.

That means:

- Never bump `client/package.json` or run any `npm run dist:*` script without an explicit instruction.
- Never re-package an existing version — if `KokoMovie-Setup-1.0.3-beta.exe` already exists here and the owner has not asked for a new build, leave it alone.
- Never invent or auto-increment a version (e.g., do **not** decide on `1.0.4-beta` because the changelog has a new entry). The owner names the version.

## Layout

```
client/release/
├── linux/      # .AppImage, .deb, latest-linux.yml, linux-unpacked/
└── windows/    # KokoMovie-Setup-${version}.exe, latest.yml
```

Only the latest build for each platform is kept. Older artifacts are deleted before a new build runs.

## When the owner does ask for a build

1. Confirm the version string with the owner (e.g., `1.0.3-beta`).
2. Set that string in `client/package.json` and commit if not already done.
3. Wipe `client/release/linux/*` and `client/release/windows/*`.
4. Build:
   - Linux: `npm run dist:linux --workspace=client`
   - Windows (from Linux host): `docker run --rm -v "$PWD":/project -w /project electronuserland/builder:wine npm run dist:win --workspace=client`
5. Verify each artifact's filename contains the owner-supplied version before reporting done.
