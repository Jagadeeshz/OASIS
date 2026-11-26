# OASIS — installation

Windows 11 is the verified target. The app is a normal Electron desktop application: after installation it needs **no terminal, no Node, no Vite and no development server**.

---

## 1. Prerequisites

| Requirement | Needed for | Notes |
|---|---|---|
| Windows 10/11 x64 | everything | Verified on Windows 11 |
| **ffmpeg + ffprobe** on `PATH` | mock video, video thumbnails, local effects, timeline export | Tested with ffmpeg 9.0.2 (gyan.dev build). Without it those features disable themselves and the top bar shows `ffmpeg missing`; images, projects, assets and mock images still work. |
| fal.ai API key | live generation | Optional. Without it the app runs in labelled mock mode. |
| Node.js 20+ and npm | **only** to build from source | Built with Node 24.22.0 / npm 11.19.1. Not needed by end users. |
| DeepSeek / Ollama | optional prompt assistance | Never required. Disabled by default. |

Check ffmpeg:

```bash
ffmpeg -version
ffprobe -version
```

---

## 2. Install from the built installer (normal users)

1. Copy `release\OASIS Setup 0.1.0.exe` to the target machine.
2. Run it. It is a per-user install (no admin prompt) with a selectable folder; it creates Start-menu and desktop shortcuts named **OASIS**.
3. Launch **OASIS** from the shortcut. First launch creates `%APPDATA%\oasis` and a "Welcome project".
4. Optional: **Providers → fal.ai** → paste key → Save → Test connection.
5. Optional: if ffmpeg is missing, install it and add `bin` to `PATH`, then restart OASIS.

Silent / scripted install:

```powershell
& "OASIS Setup 0.1.0.exe" /S "/D=C:\Apps\OASIS"
```

`/S` is silent; `/D` must be the **last** argument, unquoted inside the value, and the folder is created if absent. This exact command was used to install to `%LOCALAPPDATA%\Temp\oasis-install-test` and verified (exit code 0, working app).

### Uninstall

- Windows **Settings → Apps → Installed apps → OASIS → Uninstall**, or
- run `Uninstall OASIS.exe` from the install directory.

Uninstalling removes the program only. `%APPDATA%\oasis` (database, media, exports, encrypted keys) is **kept**; delete it manually for a clean slate. *(The uninstaller itself was not executed during verification — see TESTING.md §5.)*

---

## 3. Run from source (development)

```bash
cd C:\Users\Jagadeesh\Desktop\oasis
npm install
npm run dev        # Vite on :5173 + Electron with DevTools, hot reload
```

Production-like run without HMR:

```bash
npm run build
npm start
```

`npm start` loads `dist/index.html` through Electron — still a local dev checkout, not an installed app.

Useful checks:

```bash
npm test                                  # 24 tests
npx tsc -p tsconfig.json --noEmit         # types
node scripts/make-icon.mjs                # regenerate build/icon.png
node scripts/cdp.mjs shots/x.png "document.title"   # screenshot/eval a running app (CDP :9333)
node scripts/e2e.mjs                      # 8-step desktop E2E (app must be running on :9333)
```

For the E2E against another instance (e.g. an installed build on port 9334): `CDP_PORT=9334 node scripts/e2e.mjs`.

---

## 4. Build the installer yourself

```bash
cd C:\Users\Jagadeesh\Desktop\oasis
npm install            # first time only
npm run build          # renderer → dist/
npm run package        # electron-builder → release/
```

Outputs (measured on this machine):

| Artifact | Path | Size |
|---|---|---|
| NSIS installer | `release\OASIS Setup 0.1.0.exe` | 134 MB |
| Unpacked app | `release\win-unpacked\OASIS.exe` | 250 MB (Electron runtime) |
| Uncompressed app payload | `release\oasis-0.1.0-x64.nsis.7z` | 133 MB |

Packaging notes:

- `electron-builder` downloads its NSIS toolchain on first run (needs internet once).
- Configuration lives in `package.json → build` (appId `com.quantocos.oasis`, productName `OASIS`, `asar: true`, per-user NSIS, icon from `build/icon.png`, `docs/` and `resources/fal-schemas/` shipped as extra resources).
- Only `electron/`, `dist/`, `package.json` and the `sql.js` wasm module are packaged into `app.asar`; `src/`, `tests/`, `scripts/` and `node_modules` (except `sql.js`) stay out.
- There is no code signature. For distribution outside your own machines, sign the installer (`CSC_LINK` + `CSC_KEY_PASSWORD`) to avoid SmartScreen warnings.

To rebuild only the unpacked app (faster, no installer): `npm run package:dir`.

---

## 5. Where OASIS stores data

```
%APPDATA%\oasis\oasis.db                      metadata (projects, assets, jobs, workflows, timelines, exports, settings, logs)
%APPDATA%\oasis\storage\projects\<projectId>\ assets\<assetId>-<slug>.<ext>
%APPDATA%\oasis\storage\projects\<projectId>\ thumbs\<assetId>.jpg
%APPDATA%\oasis\exports\<projectId>\*.mp4     renders + *.manifest.json
%APPDATA%\oasis\vault.json                    provider keys, encrypted with Windows DPAPI
```

Back up the whole `%APPDATA%\oasis` folder to preserve everything. Nothing is written outside that folder except files you explicitly "Save a copy" or export to a chosen location.

The database is SQLite (via `sql.js`). It can be inspected with any SQLite tool after copying the file:

```bash
sqlite3 "%APPDATA%\oasis\oasis.db" "select media_type,count(*) from assets group by 1;"
```

---

## 6. Environment variables (development only)

| Variable | Effect |
|---|---|
| `FAL_API_KEY` / `DEEPSEEK_API_KEY` | used only if no key is stored in the vault; shown as "environment" in Providers |
| `OASIS_DEV_SERVER` | set by `npm run dev`; makes Electron load the Vite URL |
| `OASIS_FFMPEG` / `OASIS_FFPROBE` | override the ffmpeg/ffprobe binaries |
| `CDP_PORT` | port used by `scripts/e2e.mjs` and `scripts/cdp.mjs` (default 9333) |

See `.env.example` for names only. OASIS does not read `.env` files itself — the vault is the supported path for keys.

---

## 7. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Installer blocked by SmartScreen | unsigned binary | "More info → Run anyway", or sign the installer |
| App opens then closes immediately | another OASIS instance is running (single-instance lock) | use the existing window, or end the other process |
| `ffmpeg missing` badge | ffmpeg not on PATH | install ffmpeg, restart OASIS |
| Export fails instantly | ffmpeg missing, or timeline has no clips | check Exports for the ffmpeg error text |
| "database could not start" on launch | `sql-wasm.wasm` missing from the package | rebuild with `npm run package` (the wasm is packaged with `sql.js`) |
| Antivirus quarantines the app | unsigned Electron app | allow-list the install folder or sign the build |
| Blank window after editing code | stale renderer bundle | `npm run build` again; the app clears its cache while running from source |
