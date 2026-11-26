# OASIS — workspace feature matrix

Six specialised workspaces, one shared core. This document maps every feature to its owning page, its shared dependencies, and whether it is implemented and tested.

Legend
**Implemented** — real, working behaviour. **Tested** — exercised by `scripts/e2e.mjs`, `scripts/controls-test.mjs`, or the unit suite (`npm test`). **Partial** — a subset works, the rest is absent. **Not implemented** — no control is shown for it. **Unavailable** — cannot exist without a provider capability OASIS has not verified.

Boundary verification (`shots/theme/workspace-templates.png`, raw DOM counts):

| Page | NLE timeline | Node editor | Media bin | Transport |
|---|---|---|---|---|
| AI Canvas | absent | **4 nodes** | absent | absent |
| PhotoCraft | absent | 0 | absent | absent |
| FilmCraft | absent | 0 | absent | absent |
| EffectsCraft | absent | 0 | absent | absent |
| Asset Studio | absent | 0 | absent | absent |
| Video Studio | **3 tracks** | 0 | present | **present** |

Navigation exposes exactly six workspace entries in order: AI Canvas, PhotoCraft, FilmCraft, EffectsCraft, Asset Studio, Video Studio.

---

## Shared core (all workspaces)

| Feature | Owner | Dependencies | Status | Tested |
|---|---|---|---|---|
| Project context + switcher | OASIS Core | SQLite `projects`, settings | Implemented | Yes (E2E step 1) |
| Asset IDs, versions, lineage | AssetService | `assets` table, storage root | Implemented | Yes (unit + E2E) |
| Shared asset library | Asset Studio (UI) / AssetService | probe, thumbnails, protocol | Implemented | Yes |
| Job queue + status + cancel/retry | JobService | providers, assets | Implemented | Yes (unit + E2E) |
| Provider/model registry | catalog.cjs | fal OpenAPI schemas | Implemented | Yes (unit) |
| BYOK credentials (OS-encrypted) | vault.cjs | safeStorage | Implemented | Yes (unit) |
| Workflow execution | workflow.cjs | jobs, assets | Implemented | Yes (unit + E2E) |
| Export + storage | exporter.cjs | ffmpeg, assets | Implemented | Yes (unit + E2E) |
| Cross-workspace asset handoff | store `sendAsset` | asset ids only | Implemented | Yes (E2E, controls) |

Handoff rule in practice: PhotoCraft output → Asset Studio → selectable in Canvas / Video Studio / EffectsCraft; FilmCraft clip → Asset Studio → Video Studio; EffectsCraft result → new version of the source; Video Studio clip → AI workspaces (new: clip inspector “Send clip to”, original stays in the timeline).

---

## 1. PhotoCraft — image creation and editing

| Feature | Status | Notes | Tested |
|---|---|---|---|
| Text-to-image (FLUX schnell/dev, mock) | Implemented | Schema-driven params | Yes (E2E) |
| Prompt guidance (DeepSeek/Ollama) | Implemented | Disabled with reason when off | No (blocked: no text provider configured) |
| Image-to-image edit (strength) | Implemented | FLUX dev i2i / mock | No (no live key) |
| Background removal | Implemented | rembg / mock | No |
| Variations | Implemented | `num_images` 1–4, result grid | Yes (mock job produced 2) |
| Reference selection from Asset Studio | Implemented | Picker | Yes |
| Inpainting / outpainting | **Unavailable** | No verified model exposes a mask/inpaint endpoint; exposing a mask UI would be fake | — |
| Retouching | **Not implemented** | Enhancement belongs to EffectsCraft by ownership | — |
| Cancel / retry / download / clear settings | Implemented | Job panel + result actions | Retry/download conditional |
| Send to FilmCraft / EffectsCraft / Asset Studio | Implemented | Handoff by asset id | Yes |

## 2. FilmCraft — AI video generation

| Feature | Status | Notes | Tested |
|---|---|---|---|
| Text-to-video (Wan 2.2 A14B) | Implemented | Async queue + polling | Yes (mock path in E2E) |
| Image-to-video | Implemented | Start frame (+ optional end frame where the schema declares it) | No (no live key) |
| Video-to-video | **Unavailable** | No verified catalog endpoint accepts a video input | — |
| Storyboards / shot planning | **Not implemented** | Shot splitting exists only as an AI Canvas node; a dedicated FilmCraft storyboard planner is still missing | — |
| Duration / aspect / resolution / fps / seed | Implemented | Duration = frames ÷ fps, exactly what the model exposes | Yes |
| Cancel / retry / download / clear settings | Implemented | | Partial |
| Send to Video Studio / EffectsCraft / Asset Studio | Implemented | | Yes |

## 3. EffectsCraft — enhancement and processing

| Feature | Status | Notes | Tested |
|---|---|---|---|
| Upscale 2×/3×/4× (Lanczos) | Implemented | ffmpeg, local | Yes (unit: 200×100 → 400×200) |
| Enhance (unsharp/contrast) | Implemented | local | Yes (unit) |
| Denoise (hqdn3d light/med/strong) | Implemented | local | No auto test |
| Video enhance + upscale | Implemented | local | No auto test |
| Background removal | Implemented | fal rembg or labelled mock | No |
| Relighting / restoration models | **Unavailable** | Not in the verified catalog | — |
| Before/after + version history | Implemented | `derive()` lineage | Yes |
| Reset settings / download / send to workspaces | Implemented | | Reset tested |

## 4. Video Studio — professional editing (Lumit-inspired scope)

Owned here and nowhere else. The timeline, transport, inspector, tracks and export exist only on this page (verified above).

| Capability | Status | Notes | Tested |
|---|---|---|---|
| Multitrack timeline (video / audio / titles) | Implemented | Drag, trim, split, move, delete | Yes (E2E export) |
| Add / remove tracks, mute, lock | Implemented | Mute honoured by the renderer | Mute/add tested |
| Transitions | Partial | Hard cut + fade in/out only | No auto test |
| Compositing | Partial | Stacked video-track overlay + text overlay | Yes (E2E export) |
| Titles and text | Implemented | Font size, colour, position, box | Yes |
| Audio mixing | Partial | Per-clip volume, `amix` on export | Export path tested |
| Colour grading / keyframes / graph editor | **Not implemented** | Would be a false affordance today | — |
| Beat detection / transcript / captions / multicam | **Not implemented** | Requires audio analysis / ASR / multicam engine | — |
| Rendering / progress / cancel / history | Implemented | ffmpeg, manifest, Export Manager | Yes |
| Send clip to AI workspaces | Implemented (new) | Inspector → EffectsCraft/FilmCraft/PhotoCraft/Asset Studio | Not yet automated |
| Undo / redo timeline | **Not implemented** | Save/reload is the recovery path | — |

## 5. Asset Studio — shared library

| Feature | Status | Notes | Tested |
|---|---|---|---|
| Import (dialog + drag-drop), previews, thumbnails | Implemented | | Import via E2E/controls |
| Search, type filter, tag filter, sort | Implemented | | Search via controls |
| Grid / list views, multi-select, select all/none | Implemented | | Yes (controls 24/24) |
| Rename, tags, metadata, archive, delete (confirm) | Implemented | | Partial |
| Favourites | Implemented | `favorite` tag, no schema change | Filter tested |
| Versions + compare two assets | Implemented | Side-by-side dialog | Compare tested |
| Provenance (provider, model, prompt, job, workflow, mock reason) | Implemented | Drawer | Yes |
| Collections / folders | **Not implemented** | Tables exist (`collections`, `collection_assets`); no IPC or UI. Folders are not modelled | — |
| Send to any workspace | Implemented | No re-upload | Yes |

## 6. AI Canvas / Spaces — node workflows

| Feature | Status | Notes | Tested |
|---|---|---|---|
| Infinite pan/zoom canvas | Implemented | React Flow | Zoom tested |
| Typed nodes + ports, connection validation | Implemented | 14 allowlisted types, cycle/type checks | Yes (unit) |
| Node categories | Implemented | Input / Model / Generate / Process / Output, colour-coded | Visual |
| Templates | Implemented (new) | Text→image, image→edit, image→video | Modal verified (screenshot) |
| Reusable saved workflows | Implemented | Save / Save as / Open / Duplicate | Save-as tested |
| Batch processing | Implemented | `batch` node (1–4 runs) | Unit path |
| Execution + per-node status + stop | Implemented | `workflows:start`, live events, cancel | Undo/zoom/clear tested; stop not automated |
| Undo/redo, duplicate node, edge delete | Implemented | | Undo/redo tested |
| Storyboard / sequence nodes | Implemented | Deterministic shot split | Unit |
| Reference upload from computer | **Not implemented** | Imports go through Asset Studio by design (single media path) | — |
| Per-node retry | **Not implemented** | Retry = re-run the workflow | — |

---

## Cross-workspace integration test evidence

| Integration | Evidence |
|---|---|
| PhotoCraft → Asset Studio → Canvas/Video | E2E: generated asset visible in Asset Studio; canvas run wrote its own asset |
| FilmCraft → Asset Studio → Video Studio | Same asset service; Video Studio bin lists FilmCraft clips |
| EffectsCraft → new version of source | Unit test asserts `parent_asset_id` + version 2 |
| Video Studio clip → AI workspaces | New inspector actions; handoff uses the same asset id (manual verification) |
| Project context across all six pages | E2E step 1 + project switch persistence |

## Remaining gaps (deliberate, tracked)

1. PhotoCraft inpainting/outpainting and FilmCraft video-to-video — blocked on verified provider capabilities; would otherwise be fake controls.
2. FilmCraft storyboard planner — owned by the brief but not built; the canvas has a storyboard node.
3. Video Studio professional suite (grading, keyframes, graph editor, mixer UI, beat detection, transcript/captions, multicam) — not built; the current engine is a compositor + renderer, documented in `THEME.md`/`STATUS.md`.
4. Asset Studio collections/folders — schema exists, UI missing.
5. Canvas per-node retry and reference upload.
