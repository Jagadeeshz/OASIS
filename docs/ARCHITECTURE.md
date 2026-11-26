# OASIS — Architecture

**Status of this document:** describes the code that exists in this repository as of commit `feat/oasis-desktop`. Anything not implemented is called out explicitly in [STATUS.md](STATUS.md).

---

## 1. What OASIS is

OASIS is a single Windows desktop application for AI-assisted creative production. Six workspaces share one project, one asset library, one job queue and one provider layer:

| Workspace | Job |
|---|---|
| AI Canvas | Node-based workflow authoring and execution |
| PhotoCraft | Image generation, prompt-guided editing, background removal |
| FilmCraft | Text-to-video and image-to-video generation |
| EffectsCraft | Upscale, enhance, denoise, background removal on existing media |
| Asset Studio | The shared asset library (canonical media store) |
| Video Studio | Multi-track timeline editing, titles, MP4 export |
| OASIS Core | Dashboard, projects, providers, jobs, workflows, storage, exports, settings, logs |

---

## 2. Technology decisions

| Layer | Choice | Why |
|---|---|---|
| Desktop shell | **Electron 45** | Mature Windows packaging (`electron-builder` → NSIS), Node in the main process for ffmpeg/SQLite/filesystem work, Chromium renderer for the canvas and timeline UI. |
| Renderer | **React 19 + TypeScript**, built with **Vite 8** | Fast builds, component model suits six distinct workspaces, type checking with `tsc --noEmit`. |
| Node graph | **@xyflow/react 13** (MIT) | Maintained, headless-ish node/edge model with typed handles; used only for the AI Canvas surface. |
| Database | **SQLite compiled to WebAssembly (`sql.js` 1.17)** | Real SQL + real schema + real migrations, with **no native module rebuild**. The target machine needs no MSVC toolchain and `electron-rebuild` is never required. Trade-off: the database is a file exported from memory on write (see §7). |
| Media engine | **ffmpeg 9 / ffprobe** from PATH | Probing, thumbnails, mock video, local effects, timeline export. Detected at startup; the app reports its absence and disables video features rather than failing. |
| Secrets | **Electron `safeStorage`** (DPAPI on Windows) | OS-backed encryption; falls back to obfuscation with a visible warning when unavailable. |
| Packaging | **electron-builder 26** → NSIS | Per-user install, no admin prompt, desktop shortcut. |

Rejected alternatives: Tauri (no Node for ffmpeg orchestration without a sidecar), better-sqlite3 (native rebuild required), a local web server (the spec requires a genuine desktop app with no dev server at runtime).

---

## 3. Process model

```
┌─────────────────────────────── Electron main (Node 24) ───────────────────────────────┐
│  electron/main.cjs                                                                    │
│    • single-instance lock            • custom protocols: oasis-asset://, oasis-file:// │
│    • BrowserWindow (sandbox, contextIsolation)   • IPC handlers (one per capability)   │
│    • service wiring                         • app menu, dialogs, shell.openPath        │
│                                                                                       │
│  services/  db → assets → jobs → workflow → timeline → exporter → settings → vault     │
└───────────────────────────────────────┬───────────────────────────────────────────────┘
                                        │ contextBridge (electron/preload.cjs)
                                        │ invoke → {ok,data} | {ok:false,error}
┌───────────────────────────────────────┴───────────────────────────────────────────────┐
│  Renderer (React 19) — no Node, no fs, no secrets                                     │
│  src/lib/store.tsx  ← single app state: project, providers, models, assets, jobs       │
│  src/core/*         ← OASIS Core pages                                                │
│  src/workspaces/*   ← six workspaces                                                  │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

**Security boundaries**

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, CSP in `index.html` restricted to `'self'` + the two asset protocols.
- Preload exposes a fixed, enumerated API only. There is no generic "run this SQL/command/path" channel.
- File paths are never accepted from the renderer except for drag-and-drop imports, where the path comes from `webUtils.getPathForFile`. `shell.openPath` is confined to the app data directory.
- The renderer can **set or clear** a provider key but can never read one back; only a masked hint (`••••1234`) crosses the bridge.
- Navigation to non-app URLs is blocked; `https:` links open in the system browser.
- IPC errors are redacted (`redact()` in `vault.cjs`) before reaching logs or the UI.

---

## 4. Source map

```
electron/
  main.cjs                  window, protocols, IPC surface, service wiring
  preload.cjs               contextBridge API (window.oasis)
  services/
    db.cjs                  sql.js open/persist, query helpers, transactions, migrations runner
    migrations.cjs          schema (append-only migration list)
    png.cjs                 dependency-free PNG encoder (mock images, app icon)
    media.cjs               ffprobe/ffmpeg wrapper, thumbnails, mock video/audio, WAV writer
    assets.cjs              canonical asset store: ingest, probe, thumbs, versions, tags, search
    jobs.cjs                queue, execution-mode decision, fal polling, local ops, mock executor
    workflow.cjs            node allowlist, graph validation, topological execution
    timeline.cjs            timeline persistence + clip normalization + validation
    exporter.cjs            ffmpeg filter graph, progress, manifest, export registration
    projects.cjs            project CRUD
    settings.cjs            provider state, app settings, redacted log
    vault.cjs               safeStorage secret vault + redaction
    http.cjs                fetch with timeouts, bounded retries, HttpError classification
    providers/
      catalog.cjs           verified model catalog + param validation (schema-driven UI)
      fal.cjs               fal queue API adapter
      deepseek.cjs          DeepSeek chat adapter (+ prompt enhancement)
      ollama.cjs            Ollama adapter (tags, chat)
src/
  main.tsx, App.tsx, styles.css
  lib/api.ts                IPC typing + formatting helpers
  lib/store.tsx             project/provider/model/asset/job state + live event subscription
  components/ui.tsx         design-system primitives (buttons, badges, modal, asset card…)
  components/job.tsx        job watcher, param form, progress, result strip, prompt enhancer
  core/                     Dashboard, Projects, Providers, Jobs, Workflows, Storage,
                            Exports, Settings, Logs
  workspaces/               AiCanvas, PhotoCraft, FilmCraft, EffectsCraft, AssetStudio, VideoStudio
tests/                      node:test suites (services, jobs, workflow, providers, exporter)
scripts/                    make-icon.mjs, cdp.mjs (screenshot/eval), e2e.mjs (desktop E2E)
resources/fal-schemas/      raw OpenAPI schemas fetched from fal (provenance for the catalog)
```

---

## 5. Data model (SQLite)

`db.cjs` runs an append-only migration list on every open and persists the in-memory database to `oasis.db` after each committed write.

| Table | Purpose | Notable columns |
|---|---|---|
| `projects` | shared context | `id, name, description, archived` |
| `assets` | canonical media records | `media_type, storage_path, width, height, duration, frame_rate, provider, model, prompt, job_id, workflow_id, parent_asset_id, version, version_root_id, verification, execution_mode, mock_reason, thumbnail_path, metadata` |
| `asset_tags`, `collections`, `collection_assets` | organisation | |
| `workflows` | saved AI Canvas graphs | `graph` (JSON), `last_run_at` |
| `workflow_runs` | execution history | `status, node_states` (JSON), `result_asset_ids` |
| `jobs` | one queue for all workspaces | `task_type, provider, model, endpoint_id, workflow_id, input_asset_ids, params, status, progress, provider_job_id, poll_url, response_url, verification, execution_mode, mock_reason, result_asset_ids, cancel_requested` |
| `timelines` | Video Studio documents | `data` (JSON: tracks/clips) |
| `exports` | render records | `status, progress, output_path, manifest_path` |
| `provider_state` | per-provider enable/config/status | `enabled, config, status, last_tested_at, last_error` |
| `settings` | app preferences | `key/value` |
| `logs` | redacted operational log | `ts, level, scope, message, data` |

**Media bytes never live in the database.** They are copied into:

```
%APPDATA%/oasis/storage/projects/<projectId>/assets/<assetId>-<slug>.<ext>
%APPDATA%/oasis/storage/projects/<projectId>/thumbs/<assetId>.jpg
%APPDATA%/oasis/exports/<projectId>/<name>-<id>.mp4 (+ .manifest.json)
```

Assets are served to the renderer through `oasis-asset://asset/<id>` and `oasis-asset://thumb/<id>`, implemented in the main process with HTTP range support so `<video>` can seek.

---

## 6. Shared services

### 6.1 AssetService — the single ingest path

Every workspace writes media through `createFromBuffer()` or `importFile()`. That method:

1. writes bytes into the project folder,
2. runs `ffprobe` for dimensions/duration/frame rate/codec (falling back to PNG/JPEG/GIF header sniffing when ffprobe is unavailable),
3. generates a thumbnail with ffmpeg (images and video),
4. inserts the metadata row and tags inside one transaction,
5. returns a DTO with `fileUrl`, `thumbUrl`, `verificationLabel` and `isMock`.

Derived assets (`derive()`) copy the parent's provenance, set `parent_asset_id`, increment `version` and preserve `version_root_id` — that is how EffectsCraft never overwrites an original.

### 6.2 JobService — one queue, one status model

Job creation decides and records the **execution mode before submission**:

```
provider = mock        → mock
provider = local       → local   (ffmpeg, no network)
provider = fal, key ok → live
provider = fal, no key / disabled → mock + reason ("fal.ai API key is not configured")
```

Statuses: `queued → submitted → running → succeeded | failed | cancelled`, plus `mock` as a terminal status for mock output. A *configured* provider that fails (401, timeout, provider error) ends as `failed`; it is **never** converted into mock output.

fal path: `POST https://queue.fal.run/<endpoint>` → store `request_id`, `status_url`, `response_url` → poll `status_url` every 2 s (max 20 min, 6 consecutive errors tolerated) → fetch `response_url` → download each media URL into Asset Studio as `verified` / `live`. Cancellation aborts in-flight HTTP and calls fal's cancel URL.

### 6.3 Provider layer

`catalog.cjs` is the only place model knowledge lives. Each entry declares `task`, `output`, `params[]` (type, enum, min/max, default), and fal-specific `imageParam` / `endImageParam` / `resultPath`. The UI renders controls from these definitions — a model cannot have a control that its schema does not declare. All seven fal endpoints were verified against fal's published OpenAPI before being added (`resources/fal-schemas/*.json`).

`validateParams()` coerces and range-checks input server-side; invalid input fails the job with a readable message before any network call.

### 6.4 Workflow engine

Node types are an **allowlist** (`NODE_TYPES` in `workflow.cjs`, exposed to the UI). Each declares typed inputs/outputs and a default config. There is no node that evaluates code, spawns processes or reads arbitrary files.

Execution: validate graph (unknown types, unknown ports, incompatible port types, duplicate ids, cycles, 64-node cap) → topological order → per node, gather edge inputs → run → record state → next. Generation nodes create real jobs through `JobService` and wait for terminal status, so all provenance rules apply identically to canvas runs.

### 6.5 Export pipeline

`exporter.cjs` builds a single ffmpeg filter graph:

- input 0: `color` source of the timeline duration,
- one input per clip (`-ss`/`-t` for video, `-loop 1` for stills),
- each video clip scaled (`cover` crop or `contain` pad), `setpts` shifted to its timeline position, composited with `overlay=enable=between(t,…)`,
- text clips rendered with `drawtext` using a UTF-8 `textfile` and a resolved system font,
- audio clips trimmed, delayed and mixed with `amix`,
- output H.264/AAC MP4 with `-progress pipe:1` driving the progress bar.

The manifest records output dimensions, duration, frame rate, byte size, SHA-256, engine version, every source asset's verification/provider/model/job, and an overall `verification` (`mock-unverified` if **any** source is mock). The export is also registered in Asset Studio with that inherited verification.

---

## 7. Persistence and durability

- `sql.js` keeps the database in wasm memory. `persistNow()` writes `oasis.db.tmp` then renames it (atomic replace) after each transaction; a debounced writer covers non-transactional updates.
- On quit, `close()` flushes one final time.
- Media files are write-once: each asset gets its own filename, so a crash cannot corrupt an existing asset.
- Single-instance lock (`app.requestSingleInstanceLock`) prevents two processes writing the same database.

**Known durability trade-off:** a hard power loss between writes can lose the last few hundred milliseconds of metadata. Media bytes are already on disk. This is accepted for a local creative tool; migrating to better-sqlite3 (native) or a journaled server is the path if stricter durability is required.

---

## 8. Provenance model

Every generated asset stores: `verification` (`verified` | `mock-unverified` | `unverified`), `execution_mode` (`live` | `local` | `mock` | `import`), `mock_reason`, `provider`, `model`, `job_id`, `workflow_id`, `prompt`, `source_workspace`, `parent_asset_id`, `version`, `version_root_id`.

`Mock — unverified` (with the em dash, exactly) is rendered by `MockBadge`/`verificationLabel` in: job rows and job detail, PhotoCraft/FilmCraft/EffectsCraft results, Asset Studio cards and drawer, AI Canvas node status, Video Studio clips and export summary, Export Manager rows, and the export manifest JSON (`verificationLabel`).

Mock is never silently promoted: only a new successful live job creates a `verified` asset.

---

## 9. What this architecture deliberately does not do

- No cloud sync, accounts or multi-user access.
- No plugin system or arbitrary code nodes.
- No background service after quit (jobs stop with the app; their state is persisted and they can be retried).
- No audio playback in the timeline preview (audio is mixed at export).
- No NLE-grade engine (no keyframes, colour grading, multicam); the timeline engine is a purpose-built ffmpeg compositor with a clean boundary (`buildRender`), so it can be replaced.
