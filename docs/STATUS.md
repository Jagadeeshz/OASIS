# OASIS — status

**Delivery status: Working MVP** — one installable Windows desktop application with all six workspaces integrated through shared projects, assets, jobs and provider services.

Last verified: installer built and installed to a clean directory, installed binary launched from its own `app.asar`, E2E 8/8, restart persistence confirmed. The interface was then rebuilt on the BINDU/PRISM theme ([THEME.md](THEME.md)) with 8/8 E2E re-passing. Live fal.ai generation is **blocked at the provider, not in the app**: the configured key authenticates, but every call returns `403 — Exhausted balance`; the app records those as failed jobs. See §4.

---

## 1. Verified working (actually executed)

### Desktop application
- [x] Production build (`npm run build`) and Windows installer (`npm run package` → `release\OASIS Setup 0.1.0.exe`).
- [x] Silent install to a clean directory (`/S /D=…`), exit 0.
- [x] Installed `OASIS.exe` launches from `resources/app.asar` with **no dev server, no Vite, no Node install required**.
- [x] Single-instance lock; native window, custom icon, app menu, persistent user data.
- [x] Project create / open / rename / archive / delete; project context shared by all workspaces.
- [x] Data survives restart (project, assets, jobs, exports; timeline saved explicitly).
- [x] BINDU/PRISM interface applied to every screen: token-only colours, bundled type stack, yellow interaction accent, spectrum used only as media/category meaning, reduced-motion support ([THEME.md](THEME.md)).

### Assets and jobs (shared services)
- [x] Every workspace writes through one asset service; outputs appear in Asset Studio with no re-upload.
- [x] Metadata: dimensions, duration, fps, mime, size, provider, model, prompt, job id, workflow id, parent id, version/version-root, execution mode, verification, mock reason, tags, thumbnail.
- [x] Versions and lineage (EffectsCraft results are new versions; original preserved).
- [x] Search, type filter, tag filter, sorting, archive, purge delete, "Save a copy", reveal in Explorer.
- [x] One job queue for all workspaces with statuses queued/submitted/running/succeeded/failed/cancelled/mock, progress, error text, cancel and retry.

### AI Canvas
- [x] 14 allowlisted node types with typed ports; drag to connect; invalid connections refused.
- [x] Graph validation: unknown types, unknown ports, type mismatch, duplicates, cycles, node cap — all rejected before execution.
- [x] Topological execution with per-node status/progress; real jobs per generation node; results land in Asset Studio.
- [x] Save / load / duplicate-free reuse; run history with result assets.
- [x] Starter graph (`Prompt → Model → Image generation → Output`) executes end to end (verified 8/8 E2E, node states `done`).

### PhotoCraft
- [x] Text-to-image (FLUX schnell/dev or mock), image-to-image with strength, background removal.
- [x] Schema-driven controls (aspect/size, count, steps, guidance, format, seed).
- [x] Prompt assistance wired to DeepSeek/Ollama when enabled, disabled with explanation otherwise.
- [x] History, "use as source", send to FilmCraft/EffectsCraft/Asset Studio.

### FilmCraft
- [x] Text-to-video and image-to-video with optional end frame (only for models that declare it).
- [x] Async submit + polling, progress, cancel, error surfacing; clip preview; send to Video Studio.

### EffectsCraft
- [x] Local upscale (2/3/4×), enhance, denoise, video enhance via ffmpeg — verified producing a 2× version with lineage.
- [x] fal background removal (live) or labelled mock.
- [x] Before/after comparison and version table.

### Asset Studio
- [x] Grid + drawer with full provenance, tag/name editing, version list, workspace hand-offs, import (dialog and drag-drop), save-copy export.

### Video Studio
- [x] Multi-track timeline (video / text / audio), add/remove, drag-move, trim by handles, split at playhead, fades, fit modes, volume, titles, zoom.
- [x] Live canvas composite preview with playback and seeking.
- [x] Timeline persistence and reload.
- [x] **Real ffmpeg export** to MP4 with H.264/AAC, progress, and a provenance manifest (SHA-256, sources, verification).
- [x] Exported file is registered in Asset Studio with inherited verification.

### OASIS Core
- [x] Dashboard, Projects, Providers, Jobs, Workflows, Storage, Exports, Settings, Logs.
- [x] Diagnostics (db/storage/ffmpeg/providers/encryption/model count), redacted log with filters, paths and folder shortcuts.

### Providers
- [x] fal.ai live adapter (queue submit, provider-supplied status/response URLs, polling with timeout and bounded retries, cancellation, media download, verified provenance) — exercised against a contract fake; **not** against the live API.
- [x] DeepSeek adapter (models probe, chat completions, prompt enhancement) and Ollama adapter (tags, chat) — contract-tested; not live-tested.
- [x] Independent enable/disable, write-only key fields, OS-encrypted secrets, masked hints, no key in logs/errors/DTOs.
- [x] Missing optional providers cannot affect startup or the fal path.

### Mock mode and provenance
- [x] Deterministic mock images (same params ⇒ byte-identical), mock video (ffmpeg) and mock audio (synthesised WAV).
- [x] `Mock — unverified` rendered in jobs, results, assets, canvas nodes, timeline clips, export summary and manifest.
- [x] Provenance survives transfers, versioning, restart and export; mock is never promoted to verified.
- [x] Provider failures remain failures (verified by a 401 test asserting no asset is produced).

---

## 2. Planned / partial (honest list)

| Item | State |
|---|---|
| Live fal.ai calls | **Blocked at the provider.** Key is configured and authenticates; fal returns `403 User is locked. Reason: Exhausted balance` for every call. Request construction/queue submission is proven (a real HTTP response, recorded as a failed job), but no generation has completed. Adapter/catalog/UI are complete and contract-tested. |
| Live DeepSeek / Ollama | **Not verified.** Adapters + UI complete; tested against fakes. |
| Audio in timeline preview | Not implemented — audio is mixed only at export (preview is visual). |
| Timeline scope | Two video layers, text overlay, hard cut/fade, volume; no keyframes, colour grading, speed ramps, multicam. |
| Export formats | MP4/H.264/AAC only. No ProRes/GIF/stills sequence. |
| Job survival across quit | A running job stops when the app closes; it remains in history and can be retried. No background daemon. |
| Code signing | None. SmartScreen may warn on the unsigned installer. |
| macOS/Linux | Not configured. |
| Installer uninstall | Not executed in testing (binary and registry entries are standard NSIS). |

---

## 3. Known limitations (by design, documented)

- SQLite runs in wasm and is persisted on each transaction; a hard power loss can lose the last few hundred ms of metadata (media files are already on disk).
- ffmpeg is a runtime prerequisite for video mocks, local effects and export; without it those actions are disabled with a visible badge, everything else works.
- Node configs are data-only; there is deliberately no code-execution node.
- The installed app and the dev checkout share `%APPDATA%\oasis` (same app id) — intentional, but worth knowing when testing.

---

## 4. Blockers and exact unblock actions

1. **Live generation** — the key is already configured and accepted; the fal.ai account is locked for **exhausted balance**. Top up at <https://fal.ai/dashboard/billing>, then run one PhotoCraft job with `FLUX.1 [schnell]`. Expected: job `succeeded`, asset `verified`, `execution_mode: live`. No code change is required.
2. **DeepSeek/Ollama** — enable + key/endpoint, Test connection, use "Improve prompt" once.
3. **Signed distribution** — supply a code-signing certificate (`CSC_LINK` / `CSC_KEY_PASSWORD`) before sharing the installer externally.
4. **Installer uninstall verification** — run `Uninstall OASIS.exe` from the install directory and confirm the app is removed (user data is intentionally preserved).

None of these block using the application today: it installs, runs, stores, edits and exports.

---

## 5. Where things are

| What | Path |
|---|---|
| Source | `C:\Users\Jagadeesh\Desktop\oasis` |
| Installer | `C:\Users\Jagadeesh\Desktop\oasis\release\OASIS Setup 0.1.0.exe` |
| Unpacked build | `C:\Users\Jagadeesh\Desktop\oasis\release\win-unpacked\OASIS.exe` |
| Test install | `%LOCALAPPDATA%\Temp\oasis-install-test\OASIS.exe` |
| User data | `%APPDATA%\oasis` (db, media, exports, vault) |
| Docs | `docs/` (architecture, installation, testing, user guide, provider setup, assumptions, plan) |
| Test evidence | `docs/evidence/` + `shots/` |

## 2026-11-26 — native creative workspaces

- PhotoCraft gained a native raster editor (Edit tab): layers, 16 blend modes, 4 adjustment layers, 8 filters, brush/eraser/eyedropper/selection/crop/type tools, undo/redo, PNG export to Asset Studio via the new `assets:savePng` IPC.
- FilmCraft gained an **Edit timeline** tab that mounts the existing timeline engine (one engine, no duplication).
- EffectsCraft unchanged this pass; parity documented (9 real operations vs the official 259).
- Parity status: PhotoCraft 13 implemented / 7 partial / 14 missing; FilmCraft 6 / 4 / 12; EffectsCraft 3 / 2 / 5.
- Verified: 10/10 desktop checks (`scripts/verify-creative.mjs`), unit suite green, typecheck + build clean.
