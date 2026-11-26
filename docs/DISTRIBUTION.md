# OASIS — distribution and platform support

Three installer targets, one codebase:

| Platform | Architecture | Format | Built where |
|---|---|---|---|
| Windows 10/11 | x64 | NSIS installer (`.exe`) | any OS (verified here) |
| macOS 12+ | Apple Silicon (arm64) | DMG + ZIP | macOS only (CI: `macos-14`) |
| macOS 12+ | Intel (x64) | DMG + ZIP | macOS only (CI: `macos-13`) |

Electron and `sql.js` are both pure-JS/wasm at runtime — there is no native module to rebuild, which is why the same `package.json` produces all three artifacts without per-platform patches.

## Build commands

```bash
npm install
npm run package:win     # Windows x64 NSIS installer
npm run package:mac              # macOS DMG + ZIP for the host arch
npm run package:mac -- --arm64   # Apple Silicon explicitly
npm run package:mac -- --x64     # Intel explicitly
npm run package:all              # Windows + macOS host arch, on a Mac
npm run package:dir     # unpacked app for smoke tests
```

Artifacts land in `release/`:

```
OASIS Setup 0.1.0.exe                     Windows x64 installer
OASIS-0.1.0-arm64.dmg                     macOS Apple Silicon
OASIS-0.1.0-arm64-mac.zip                 macOS Apple Silicon (zip, for updaters)
OASIS-0.1.0.dmg                           macOS Intel
OASIS-0.1.0-mac.zip                       macOS Intel
```

**macOS builds cannot be produced on Windows.** `electron-builder` needs `hdiutil`, `codesign` and `xcrun` to make a DMG; there is no supported cross-build path. Use a Mac or the CI workflow below.

## CI workflow

`.github/workflows/build.yml` runs three jobs:

- `windows` — `windows-latest`, runs tests + typecheck, uploads the NSIS installer.
- `macos-arm64` — `macos-14` (Apple Silicon runner).
- `macos-x64` — `macos-13` (Intel runner).

Both mac jobs run the unit suite, then `npm run package:mac -- --arm64` / `--x64`, and upload DMG + ZIP. Signing and notarization activate automatically when the repository secrets exist:

| Secret | Purpose |
|---|---|
| `MAC_CERT_P12` | base64 Developer ID Application certificate (`.p12`) |
| `MAC_CERT_PASSWORD` | password for that `.p12` |
| `APPLE_ID` | Apple ID used for notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | app-specific password for that Apple ID |
| `APPLE_TEAM_ID` | 10-character team identifier |

Without them the build still succeeds, unsigned. `scripts/notarize.cjs` prints `[notarize] skipped — no Apple credentials in the environment.` and exits cleanly.

Do not paste certificates, passwords or API keys into chat. Put them in GitHub repository secrets, or export them in your own shell.

## Signing and notarization

`package.json` already sets `hardenedRuntime: true`, `gatekeeperAssess: false` and the entitlements file `build/entitlements.mac.plist` (JIT + unsigned executable memory, which Electron requires, plus network, camera and microphone usage strings in `extendInfo`).

`afterSign` runs `scripts/notarize.cjs`, which:

1. returns immediately on non-mac builds;
2. returns with a printed reason when `APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`/`APPLE_TEAM_ID` (or the `APPLE_API_KEY*` trio) are absent;
3. otherwise submits the `.app` with `@electron/notarize`.

Staple the ticket so the DMG works offline:

```bash
xcrun stapler staple "release/OASIS-0.1.0-arm64.dmg"
xcrun stapler staple "release/OASIS-0.1.0.dmg"
```

`@electron/notarize` must be present for step 3: `npm i -D @electron/notarize` on the machine that builds signed artifacts (it is not required for unsigned builds, which is why it is not a hard dependency).

## Installing on Windows

1. Run `OASIS Setup 0.1.0.exe`.
2. Choose install location (per-user by default — no admin prompt).
3. Launch from the Start Menu or the desktop shortcut.

Silent install, for scripted testing:

```bash
"OASIS Setup 0.1.0.exe" /S /D=C:\temp\oasis-install
```

Uninstall via Settings → Apps → OASIS, or `"%LOCALAPPDATA%\Programs\oasis\Uninstall OASIS.exe"`.

Data lives in `%APPDATA%\oasis` (projects, media, database). Uninstalling leaves it in place.

## Installing on macOS

1. Open `OASIS-0.1.0-arm64.dmg` (Apple Silicon) or `OASIS-0.1.0.dmg` (Intel).
2. Drag **OASIS** to the **Applications** folder in the window.
3. Launch from Applications or Spotlight.

First launch of a **signed and notarized** build needs nothing else.

First launch of an **unsigned** build is blocked by Gatekeeper. Either:

- right-click the app → **Open** → **Open** again (per-machine, once), or
- clear the quarantine flag:

```bash
xattr -dr com.apple.quarantine /Applications/OASIS.app
```

If macOS reports "OASIS is damaged and can't be opened" the download was quarantined and the app is unsigned — the `xattr` command above is the fix.

Data lives in `~/Library/Application Support/oasis`.

## Platform-specific behaviour

| Area | Windows | macOS |
|---|---|---|
| Data directory | `%APPDATA%\oasis` | `~/Library/Application Support/oasis` |
| Secret storage | DPAPI via `safeStorage` | Keychain via `safeStorage` |
| ffmpeg | expected on `PATH` (`ffmpeg.exe`) | `brew install ffmpeg`; app also checks `/opt/homebrew/bin` and `/usr/local/bin` |
| Installer | NSIS, per-user | DMG drag-to-Applications |
| Auto-update | not configured | not configured |

ffmpeg is optional: without it, local effects, thumbnails, mock video and timeline export are disabled and the app shows a warning badge. Everything else — projects, assets, jobs, providers — works.

## Verifying a build

```bash
npm test                                  # 24 service/integration tests
npx tsc -p tsconfig.json --noEmit         # typecheck
npm run package:win                       # or package:mac on a Mac
```

Desktop probe against the packaged app (see `docs/TESTING.md`):

```bash
./OASIS.exe --user-data-dir=%TEMP%\oasis-cdp --remote-debugging-port=9334
CDP_PORT=9334 node scripts/controls-test.mjs
```

---

## Build results — this machine (Windows 11, `os=10.0.26200`, electron-builder 26.18.0)

| Artifact | Command | Result |
|---|---|---|
| Windows x64 NSIS | `npm run package:win` | **Pass** — `release/OASIS Setup 0.1.0.exe`, 134,214,403 bytes (rebuilt after the macOS ffmpeg-probe fix) |
| Windows x64 silent install | `OASIS Setup 0.1.0.exe /S /D=%LOCALAPPDATA%\Temp\oasis-xplat` | **Pass** — exit 0, `OASIS.exe` present |
| Installed app launch | `OASIS.exe --user-data-dir=<fresh> --remote-debugging-port=9334` | **Pass** — 4 processes alive, CDP `http=200`, all pages navigable, no dev server |
| macOS arm64 DMG/ZIP | `npm run package:mac` | **Blocked** — `⨯ Build for macOS is supported only on macOS, please see https://electron.build/multi-platform-build` |
| macOS x64 DMG/ZIP | same | **Blocked** — same refusal, before any packaging starts |
| Windows code signature | `npm run package:win` | **Skipped** — `no code signing certificate configured, signing is skipped` |

So on this machine the app is proven on Windows end to end, and the macOS artifacts cannot be produced here at all — not a failure of the configuration, a hard limit of electron-builder. The `mac` target is fully specified (`dmg` + `zip`, `arm64` + `x64`, hardened runtime, entitlements, notarization hook) and is exercised by the `macos-14` / `macos-13` CI jobs.

### Not verified

- **macOS runtime behaviour on either architecture.** No Mac was available; nothing in this document's macOS section has been executed. Treat the install steps as the standard DMG flow, not as a tested path.
- **Code signing and notarization.** No certificate and no Apple credentials exist on this machine, so `scripts/notarize.cjs` only ran its skip branch. The submission branch is untested.
- **Clip inspector sliders in a packaged window.** The packaged probe reached Video Studio with a seeded timeline, but the isolated package profile held no media asset and the probe's `importPath` call was rejected (`projectId and path are required`), so the media-clip inspector — which renders only for clips that reference an asset — was never shown. This is a gap in the probe, not a demonstrated product defect; it stays **Not tested**.
- **ffmpeg on macOS** (`/opt/homebrew/bin`, `/usr/local/bin` probing) — the search path is code, never executed on a Mac.
