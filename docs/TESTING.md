# OASIS — testing

All results below were produced by running the commands in this document on this machine (Windows 11, Node 24.22.0, ffmpeg 9.0.2). Raw captures live in `docs/evidence/`.

Reproduce with:

```bash
cd C:\Users\Jagadeesh\Desktop\oasis
npm test                 # unit + service tests
npm run build            # renderer production build
npx tsc -p tsconfig.json --noEmit   # type check
node scripts/e2e.mjs     # desktop E2E against a running app on CDP :9333
```

---

## 1. Automated tests — `npm test`

Runner: Node's built-in `node:test` (`node --test tests/*.test.cjs`). No test framework dependency.

**Result (latest run, captured in `docs/evidence/unit-tests.txt`): 24 tests, 24 pass, 0 fail, 0 skipped.**

| Suite | Tests | What is actually asserted |
|---|---|---|
| `tests/services.test.cjs` | 5 | Projects persist across close/reopen and migrations do not re-run; secret vault round-trips, masks (`••••3456`), clears, and the plaintext key is **absent from the vault file**; model catalog has unique ids, every model declares label/task/output, enum params declare values, image-fed models declare `imageParam`, every required task has a model; `validateParams` rejects a bad enum, out-of-range count and empty required prompt; asset ingest records dimensions/mime/tags, generates a thumbnail (when ffmpeg present), `derive()` produces version 2 with `version_root_id`, archive hides from default listing, purge deletes the file from disk. |
| `tests/jobs.test.cjs` | 6 | Mock image job returns status `mock`, `verification: mock-unverified`, label `Mock — unverified`, `execution_mode: mock`, a reason, 2 assets; **identical params produce byte-identical files (SHA-256 equal)** while variants differ; fal job with no key is created as `mock` with reason "API key is not configured"; fal live path (fake queue: submit → status → result → CDN download) stores `provider_job_id`, downloads the exact provider bytes (SHA-256 equal) and records `verified`/`live`; a 401 fails the job, the error contains `401` and **does not contain the secret**; connection tests are isolated (fal `not-configured` without key, `connected` with key, ollama `disabled`, deepseek stays disabled); local ffmpeg upscale produces 400×200 from 200×100 with `parent_asset_id` set. |
| `tests/providers.test.cjs` | 6 | DeepSeek: `connected` with model list, `authentication-failed` on 401, `not-configured` without key; enhancement posts to `/chat/completions` with `Bearer` auth and the expected message list; Ollama: unreachable is reported as `unreachable` (never throws), tags/chat parsing works and `stream:false` is sent; fal probe sends an **empty body** to `imageutils/rembg` (422 ⇒ connected, no generation, no charge) and uses `Authorization: Key …`; fal submit returns the request id and the provider-supplied status URL, and surfaces 401 as an error. |
| `tests/workflow.test.cjs` | 4 | Saved workflow executes prompt → generate → output, saves to Asset Studio with `workflow_id`, run row is `succeeded`, node states `done`, generation node records its job id; run history returns the result; unknown port, incompatible type (`prompt → image`), cycle and unknown node type (`shell.exec`) are all rejected — and there is no such node type in the registry at all; invalid graphs are rejected on save and on run; edit/save/load round-trips. |
| `tests/exporter.test.cjs` | 3 | Timeline (video clip with fade + title + audio bed) exports a real MP4: file exists, probe reports 640×360 and ≈2 s, manifest exists with `verification: mock-unverified`, `verificationLabel: "Mock — unverified"`, 2 sources, 64-hex SHA-256 matching the file, engine version; missing asset fails the export with "Missing asset"; timeline save/load normalizes clips, reports duration 3.5 s and validates a clip without an asset. |

Tests that require ffmpeg skip themselves (reported as skipped, not passed) when `ffmpeg -version` fails. On this machine ffmpeg is present, so 0 were skipped.

---

## 2. Type and build checks

| Check | Command | Result |
|---|---|---|
| TypeScript | `npx tsc -p tsconfig.json --noEmit` | **clean, 0 errors** |
| Renderer build | `npm run build` | **success** — `dist/index.html`, `dist/assets/index-*.js` (~591 kB), CSS (~33 kB) |
| Node syntax | every `electron/**/*.cjs` is loaded by the app and by tests | no load errors |

---

## 3. Desktop end-to-end (dev build)

Driver: `scripts/e2e.mjs` (CDP over `--remote-debugging-port=9333`), which clicks real UI and asserts real DOM state produced by real IPC calls.

**Result: 8/8 steps passed** (first run after the freeze fix, and again after the UI polish pass).

| # | Step | Assertion |
|---|---|---|
| 1 | Dashboard | project name rendered, project present in selector |
| 2 | PhotoCraft mock generation | model switched to `mock/image`, prompt set, job ran, result card appeared, page shows `Mock — unverified` |
| 3 | Asset Studio | asset grid populated, drawer opens with provenance and mock marker |
| 4 | AI Canvas | 4 starter nodes rendered, **Run workflow** completed, all nodes `done` |
| 5 | Video Studio | clip added from bin, title clip added, **Export mp4** reached `Export succeeded` |
| 6 | Providers | three independent provider cards, fal shown without a key |
| 7 | Jobs | job rows listed with statuses |
| 8 | Exports | export row with manifest/hash/verification visible |

Screenshots: `shots/e2e-01…09*.png`.

---

## 4. Installer and installed-app test

| Step | Command / action | Result |
|---|---|---|
| Build installer | `npm run package` | **success** → `release\OASIS Setup 0.1.0.exe` (134,051,871 bytes) |
| Dev data set aside | `%APPDATA%\oasis` renamed | fresh profile forced |
| Install to clean directory | `"OASIS Setup 0.1.0.exe" /S /D=C:\Users\Jagadeesh\AppData\Local\Temp\oasis-install-test` | **exit code 0**, `OASIS.exe` (250 MB) installed there |
| Launch installed app | `OASIS.exe --remote-debugging-port=9334` | window opened; renderer URL `file:///…/oasis-install-test/resources/app.asar/dist/index.html` — **packaged asar, no Vite, no dev server** |
| Fresh profile boot | first launch | new `%APPDATA%\oasis\oasis.db` created, "Welcome project" auto-created |
| E2E against installed app | `CDP_PORT=9334 node scripts/e2e.mjs` | **8/8 passed** (`docs/evidence/e2e-installed-report.json`) |
| Restart persistence | killed app, relaunched installed exe | 1 project, **3 assets (all mock-labelled)**, 2 jobs, 1 export `succeeded` with manifest `mock-unverified` |
| Cleanup | test profile moved to `%APPDATA%\oasis-installed-testdata`, dev data restored | — |

This is a genuine installer test: the binary that ran was installed by NSIS from the generated setup executable, and it loaded its own `app.asar`.

---

## 5. What is **not** verified

| Area | Why | What would verify it |
|---|---|---|
| Live fal.ai generation (image, video, TTS, rembg) | No fal.ai key is configured on this machine. All fal paths were exercised against a contract-faithful fake queue (`tests/jobs.test.cjs`, `tests/providers.test.cjs`) and the catalog was validated against fal's OpenAPI — but **no real provider call has been made**. | Add a key in Providers → fal → Test connection → run one FLUX.1 schnell job; status should read `verified` / `live`. |
| Live DeepSeek / Ollama | Not configured; adapters tested against fakes only. | Enable each, Test connection, use "Improve prompt". |
| NSIS uninstall | Not executed (would remove the test install). | `Settings → Apps → OASIS → Uninstall`, or `Uninstall OASIS.exe` in the install dir. |
| Signed binaries | No code-signing certificate. Windows SmartScreen may warn on first run of an unsigned installer. | Sign with an org certificate (`CSC_LINK`) before distribution. |
| Long/heavy timelines | Export tested with 2 video clips, 1 title, 1 audio bed at 1280×720. | Render a multi-minute, multi-track project and compare A/V sync. |
| macOS / Linux | Windows-only packaging configured. | Add `electron-builder` targets and re-test ffmpeg paths. |

---

## 6. Regression checklist for future changes

```bash
npm test && npm run build && npx tsc -p tsconfig.json --noEmit
npm start &                      # or: release\win-unpacked\OASIS.exe
node scripts/e2e.mjs             # 8/8 expected
```

Any change to `jobs.cjs` must keep these invariants: a job's `execution_mode` is decided before submission; mock results carry `mock-unverified`; provider failures stay failures; secrets never appear in `error`, logs or DTOs.
