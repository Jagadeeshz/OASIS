# OASIS — assumptions and decisions

Each line records a decision that shaped the build, why it was taken, and what would invalidate it. Anything the user must do (or provides) is marked **dependency**.

---

## Product assumptions

1. **Single user, single machine.** No accounts, tenancy or sync. Projects live in `%APPDATA%\oasis`. Multi-user would need a shared server and conflict handling — out of scope.
2. **Windows first.** Installer, icon and paths target Windows 10/11 x64. The code is portable (Node + Electron), but only Windows was built and tested.
3. **Local-first.** All media stays on disk; the only network calls are to the providers the user enables. No telemetry, no analytics.
4. **fal.ai is the only generation provider.** Image/video/audio generation, editing and background removal all route through fal. DeepSeek and Ollama are text-only helpers. No other provider was invented to fill a gap.
5. **A key may be absent.** The product must stay fully demonstrable without credentials, so mock mode is a first-class execution path, not an error state — and it is always labelled `Mock — unverified`.
6. **ffmpeg is a runtime dependency** for video mocks, video thumbnails, local effects and export. It is treated as an installed prerequisite (like a codec pack), not bundled, because bundling adds ~80 MB and licensing obligations. The app detects and reports its absence instead of failing silently. **Dependency: ffmpeg on PATH.**
7. **Provider schemas are authoritative.** UI controls are generated from the model catalog, and catalog entries were only added after checking fal's published OpenAPI (Nov 2026). Where a capability was not verified, the control does not exist — e.g. there is no "duration" slider for wan, because that endpoint takes `num_frames`/`fps`.
8. **Costs are the user's.** Generation spends real money on the user's fal account. The connection test was designed to cost nothing (empty-body validation probe).
9. **Mock determinism matters.** Given the same prompt/seed/size, mock output is byte-identical so tests and demos are repeatable. Mock is never silently upgraded to verified.

---

## Technical decisions

| Decision | Rationale | Would change if |
|---|---|---|
| **Electron** rather than Tauri or a web app | Needs Node for ffmpeg orchestration, SQLite, filesystem and background polling; Electron packaging is the most predictable Windows path. A web app was explicitly excluded by the requirement for a real desktop application. | Bundle size or memory became critical → Tauri + Node sidecar. |
| **sql.js (SQLite compiled to wasm)** | No native module build, so the app installs on machines without MSVC/Build Tools. Real SQL and migrations retained. | Durability requirements grow → better-sqlite3 with prebuilt Electron binaries, or a local server. |
| **Persist-on-write with atomic rename** | Simple and crash-safe for the file itself; a lost tail of metadata on power loss is acceptable for a local tool. | Financial/ledger-grade durability required → WAL + fsync per commit. |
| **CommonJS in the main process** | Zero build step for `electron/`, tests can `require()` services directly with `node:test`, no ESM/CJS interop surprises in preload. | Main process grows into shared ESM code. |
| **Renderer TypeScript, no runtime type library** | `tsc --noEmit` is the gate; IPC payloads are plain JSON. Avoids schema duplication at the boundary. | IPC surface becomes public/third-party. |
| **One asset service, one job service** | The spec's central requirement (no per-workspace storage or queues) and the reason cross-workspace hand-offs need no re-upload. | Never — this is the architecture. |
| **Execution mode decided before submission** | Guarantees mock can never be confused with live output, and provider failures cannot degrade into mock. | Never. |
| **Node allowlist, data-only configs** | No user code execution inside workflows. Configs are JSON validated against `NODE_TYPES`. | A plugin system is explicitly requested. |
| **ffmpeg filter-graph export** | Deterministic, headless, no extra engine licence; produces real MP4s with text and mixed audio. | NLE features (keyframes, grading) are required → replace `buildRender` with a real engine. |
| **@xyflow/react for the canvas** | MIT, maintained, handles typed connections and viewport math; avoids writing a node editor from scratch. | Custom canvas exceeds its interaction model. |
| **NSIS per-user install** | No admin rights needed; user-scoped install matches single-user assumption. | Machine-wide deployment → per-machine MSI. |
| **Single-instance lock** | Two writers on one SQLite file and one media store is data loss waiting to happen. | Never. |
| **No code signing** | No certificate available. | Distribution beyond internal use → sign and timestamp. |

---

## Scope assumptions

- **"Complete" means working MVP, not feature parity with a professional NLE.** The six workspaces are present, connected and functional; deep features (multicam, keyframes, colour management, batch render queues) are out of scope and listed in STATUS.md.
- **Video Studio export is MP4/H.264/AAC only.**
- **Timeline preview is visual only** — audio is mixed during export. Building a synced audio preview was judged lower value than export correctness.
- **Jobs do not outlive the process.** Closing the app stops in-flight provider polling; the job record remains and can be retried. A background daemon/queue was out of scope for a desktop tool.
- **Local effects are ffmpeg filters** (lanczos upscale, unsharp/contrast, hqdn3d denoise). They are real, deterministic enhancements — not ML super-resolution. They are labelled `local` rather than pretending to be a provider model.
- **The mock video is a generated pattern with burned-in "MOCK - UNVERIFIED"** and the exact label `Mock — unverified` in metadata/UI; the ASCII variant inside the frame avoids font-encoding issues with the em dash.
- **The installer was tested by silent install to a temp directory**, not by clicking through the wizard, and uninstall was not executed.

---

## Dependencies supplied by the user

| Dependency | Needed for | Fallback in OASIS |
|---|---|---|
| fal.ai API key | live generation | mock mode, clearly labelled |
| ffmpeg on PATH | video mock/thumbnail/local effects/export | features disabled with a visible badge |
| DeepSeek key | prompt enhancement | button disabled with reason |
| Ollama + a pulled model | local prompt assistance | button disabled with reason |
| Code-signing certificate | trusted distribution | unsigned installer (SmartScreen warning) |

---

## Data and privacy assumptions

- Provider keys are the user's own; OASIS stores them only in the OS-encrypted vault and never transmits them anywhere except to that provider.
- The log stores redacted operational events only (no prompts or media).
- Deleting a project deletes its rows and files; exported files outside the storage root are left alone.
- Backups are the user's responsibility (`%APPDATA%\oasis`).
