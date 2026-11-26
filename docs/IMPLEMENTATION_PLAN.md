# OASIS — implementation plan and record

The plan was executed as seven engineering workstreams. This file records what was planned, what was built, and the evidence for each item so the plan can be audited against the code.

Legend: **[done]** implemented and verified · **[partial]** implemented with documented limits · **[blocked]** waiting on an external dependency · **[not built]** explicitly out of scope.

---

## Workstream A — Bootstrap

| Item | Status | Where |
|---|---|---|
| Inspect OS, runtimes, existing project | [done] | Node 24.22.0, npm 11.19.1, ffmpeg 9.0.2 on PATH; no pre-existing OASIS project |
| Choose and document the architecture | [done] | `docs/ARCHITECTURE.md` |
| Project structure and dependency manifests | [done] | `package.json`, `tsconfig.json`, `vite.config.ts`, `electron/`, `src/`, `tests/`, `docs/`, `scripts/` |
| Desktop shell, window, icon, menu, single-instance | [done] | `electron/main.cjs`, `build/icon.png` |
| Database schema and migrations | [done] | `electron/services/migrations.cjs` (11 tables, append-only) |
| Storage layout and initialisation | [done] | `assets.cjs` project folders, `exports/` |
| Shared service contracts | [done] | `db`, `assets`, `jobs`, `workflow`, `timeline`, `exporter`, `settings`, `vault` |
| Runnable desktop baseline | [done] | `npm run build && npm start`; installer verified |

## Workstream B — Integrated workspace foundation

| Item | Status | Evidence |
|---|---|---|
| Application shell with consistent navigation | [done] | `src/App.tsx`, sidebar + top bar with project/provider/job status |
| AI Canvas navigable and connected to project | [done] | `src/workspaces/AiCanvas.tsx` — E2E step 4 |
| PhotoCraft | [done] | E2E step 2 |
| FilmCraft | [done] | shares job service; verified via unit tests (video mock) and manual UI pass |
| EffectsCraft | [done] | `local/upscale-2x` unit-tested end to end |
| Asset Studio | [done] | E2E step 3 |
| Video Studio | [done] | E2E steps 5/6 |
| OASIS Core pages | [done] | Dashboard, Projects, Providers, Jobs, Workflows, Storage, Exports, Settings, Logs |
| Shared project context across all pages | [done] | `store.tsx` project switch + `lastProjectId` persistence |

## Workstream C — Shared asset and job infrastructure

| Item | Status | Notes |
|---|---|---|
| Asset model with full metadata | [done] | 27 columns incl. provenance, versions, lineage |
| Media storage + thumbnails + range-served URLs | [done] | `oasis-asset://` protocol with HTTP 206 |
| Versions and parent/child relationships | [done] | `derive()`, `version_root_id`; unit-tested |
| Tags, search, filtering, sorting, archive, purge | [done] | `assets.list()` + Asset Studio UI |
| Shared job queue with progress/status/cancel/retry | [done] | `jobs.cjs`; 12 states/fields covered in tests |
| Workspace-to-workspace asset actions | [done] | `sendAsset()` handoff, no download/upload |

## Workstream D — Provider integrations

| Item | Status | Notes |
|---|---|---|
| fal.ai adapter (real queue protocol) | [done] (contract) / [blocked] (live) | `providers/fal.cjs`; 6 000+ lines of behaviour covered by fakes; **no live call yet — no key** |
| Verified model catalog | [done] | 7 endpoints from fal OpenAPI; raw schemas in `resources/fal-schemas/` |
| DeepSeek adapter | [done] (contract) / [blocked] (live) | `providers/deepseek.cjs` |
| Ollama adapter | [done] (contract) / [blocked] (live) | `providers/ollama.cjs` |
| Provider Settings UI, independent toggles | [done] | `src/core/Providers.tsx` |
| Secure credential storage (OS-encrypted, write-only) | [done] | `vault.cjs`; plaintext-absence asserted in tests |
| Connection tests | [done] | fal 422-probe (free), DeepSeek `/models`, Ollama `/api/tags` |
| Deterministic mock mode | [done] | byte-identical outputs; unit-tested |
| Provenance persistence | [done] | DB columns + UI labels + manifest |

## Workstream E — Creative functionality

| Item | Status | Notes |
|---|---|---|
| Image generate / edit / remove background | [done] | PhotoCraft; fal or mock |
| Video generate (t2v, i2v, optional end frame) | [done] | FilmCraft; provider limits from schema |
| Speech generation | [done] | catalog + job executor; no dedicated workspace UI |
| Prompt assistance (DeepSeek/Ollama) | [done] | `providers:enhance`, Enhance/Expand/Storyboard |
| Workflow execution engine | [done] | 14 node types, validation, topological run |
| Batch / storyboard / sequence nodes | [done] | `batch`, `storyboard` (deterministic shot split), `sequence` |
| Save outputs into Asset Studio | [done] | every path returns asset ids |

## Workstream F — Video editing and export

| Item | Status | Notes |
|---|---|---|
| Media bin from Asset Studio | [done] | import + add |
| Multi-track timeline (video/text/audio) | [done] | drag, trim, split, delete, zoom |
| Titles, fades, fit, volume | [done] | `drawtext`, `fade`, scale/crop |
| Live composite preview + transport | [done] | canvas compositor |
| Project persistence | [done] | `timelines` table, explicit save, reload |
| Real export pipeline | [done] | ffmpeg filter graph → MP4 |
| Export verification + provenance manifest | [done] | SHA-256, sources, verification |
| Audio in preview | [not built] | documented limitation |

## Workstream G — QA and release

| Item | Status | Evidence |
|---|---|---|
| Unit/integration tests | [done] | 24/24 pass |
| Type check | [done] | `tsc --noEmit` clean |
| Production build | [done] | `dist/` |
| Windows installer | [done] | `release\OASIS Setup 0.1.0.exe` (134 MB) |
| Installer smoke test | [done] | silent install to temp dir, exit 0, app launched |
| Installed-app launch without dev server | [done] | renderer loaded from `app.asar` |
| Desktop E2E | [done] | 8/8 on dev build; 8/8 on installed build |
| Restart persistence | [done] | project + 3 assets + 2 jobs + 1 export restored |
| Documentation | [done] | 8 documents in `docs/` + README |
| Uninstall test | [not built] | not executed; NSIS standard |
| Code signing | [not built] | no certificate |

---

## Sequence actually followed

1. Environment probe → architecture choice (Electron + sql.js + ffmpeg) → scaffold.
2. Services bottom-up: db → assets/media → settings/vault → providers → jobs → workflow → timeline → exporter, each with tests before UI.
3. Verify the service layer with `node --test` (24 tests) — this caught four real defects before any UI existed: a comma-operator bug in `validateParams`, an inverted port-compatibility rule, a missing empty-graph check, and an ffmpeg `-filter_complex_script` flag that ffmpeg 9 rejects.
4. Renderer shell + core pages + six workspaces.
5. Desktop verification via CDP (`scripts/cdp.mjs`), then scripted E2E (`scripts/e2e.mjs`); fixed three real UX defects found this way: empty project selector after first-launch auto-create, stale Chromium cache serving an old bundle, and mock assets not refreshing the library.
6. Packaging (electron-builder/NSIS), silent install to a clean directory, E2E against the installed app, restart persistence check.
7. Documentation and Git history.

## Remaining work (ordered)

1. **Live fal smoke test** — one key, one FLUX.1 schnell job, confirm `verified`/`live` provenance. Then repeat for wan t2v and rembg.
2. **Live DeepSeek/Ollama smoke test.**
3. **Uninstall verification** on a throwaway machine/profile.
4. **Code signing** before external distribution.
5. Optional product work: audio preview, more fal models (each schema-verified first), export presets, keyframes.
