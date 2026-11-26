# OASIS — UI controls audit

Scope: every screen in the OASIS desktop app. Status is what the code and the running build actually do, not what the layout implies.
Legend: **✓** implemented and exercised by `scripts/controls-test.mjs` or the E2E run · **◐** implemented, not exercised by an automated check (manual/code-verified only) · **✗** not implemented (control absent, or present but disabled with an explanation) · **n/a** not applicable to this product.

Test evidence: `docs/evidence/controls-report.json`, `docs/evidence/theme-audit.txt`, `docs/TESTING.md`.

---

## Global shell

| Control | Status | Notes |
|---|---|---|
| Sidebar navigation (15 destinations) | ✓ | Active state, keyboard `Ctrl+1…6` for the six workspaces |
| Project selector | ✓ | Persists `lastProjectId`; switching reloads assets/jobs |
| Provider status badge | ✓ | Shows key presence + provider status |
| Active job counter | ✓ | Live from job events |
| ffmpeg warning badge | ✓ | Only when ffmpeg is absent |
| Toasts (success/error/warn) | ✓ | Auto-dismiss, max 3 stacked |
| Global search / command palette | ✗ | Not implemented — no false affordance shown |
| Notification centre | ✗ | Toasts + Jobs page cover the need; no bell icon is shown |

---

## A. Dashboard

| Control | Status | Notes |
|---|---|---|
| Create project | ◐ | Present on **Projects** (primary button); dashboard routes there via the top bar, no duplicate button |
| Open project / switcher | ✓ | Top-bar selector |
| Recent projects list | ✗ | Dashboard shows the active project only; full list on Projects |
| Search projects | ✗ | Projects page has no search (project counts are small) |
| Rename / archive / delete project | ◐ | On Projects, with confirmation for delete |
| Duplicate project | ✗ | Not implemented (would need a deep-copy migration) |
| Open AI Canvas / Asset Studio / Video Studio | ✓ | Quick-action cards + sidebar |
| Recent jobs | ✓ | 7 newest with status |
| View all jobs | ✓ | Link to Job Manager |
| Generation status | ✓ | Active-jobs stat + live rows |
| Quick actions | ✓ | Generate an image, workspace cards |
| Refresh | ✗ | Data refreshes on job/asset events; manual refresh exists on Jobs/Exports/Assets |
| Settings access | ✓ | Sidebar |

## B. AI Canvas

| Control | Status | Notes |
|---|---|---|
| Add node | ✓ | Palette click; palette search filters by label/category/key |
| Search nodes | ✓ | Palette input (tested: "video" → 2 items) |
| Undo / Redo | ✓ | History stack (40 steps), `Ctrl+Z` / `Ctrl+Shift+Z`; tested 4→5→4 |
| Zoom in / out | ✓ | React Flow zoom, 180 ms easing |
| Fit to screen / Reset view (1:1) | ✓ | `fitView` / `setViewport` |
| Minimap | ✓ | Themed, pannable |
| Save / Save as | ✓ | Save updates; Save as creates a new workflow (dialog tested) |
| Run workflow | ✓ | Starts via `workflows:start`, progress from `run:update` events |
| Stop execution | ✓ | Cancels the live run id (button appears only while running) |
| Clear canvas | ✓ | Confirmation dialog (tested) |
| Workflow settings | ✗ | No per-workflow settings beyond name; model/params live on nodes |
| Select / configure node | ✓ | Inspector with model + schema-driven params |
| Duplicate node | ✓ | Inspector button, `Ctrl+D` |
| Delete node | ✓ | Inspector + `Delete` key, removes attached edges |
| Connect ports | ✓ | Typed validation, incompatible connections refused |
| Disconnect ports | ✓ | Click an edge, `Delete` |
| Node output preview | ◐ | Count + job id + error in the node footer; inspector links to results via status |
| Node error details | ✓ | Error text in node footer and inspector |
| Retry failed node | ✗ | Retry is whole-run (press Run again); the engine has no per-node retry |
| Node categories | ✓ | Input, Model, Generate, Process, Output — colour-coded |
| Reference: choose from Asset Studio | ✓ | Asset picker on `asset.image` and generation nodes |
| Reference: upload from computer | ✗ | Upload lives in Asset Studio; canvas consumes library assets (no duplicate path) |
| Reference: replace / remove | ✓ | Picker replaces; asset nodes can be re-pointed; removing the node clears it |
| Multiple references | ✗ | One image input per node by design |
| View logs | ✓ | OASIS Core → Logs (redacted) |
| Open result / send to Asset Studio | ✓ | Results are written to Asset Studio automatically; Jobs → Result opens it |

## C. Asset Studio

| Control | Status | Notes |
|---|---|---|
| Upload / import (dialog + drag-drop) | ✓ | Multi-file |
| Search / type filter / tag filter / sort | ✓ | Server-side query |
| Grid view / List view | ✓ | Toggle; list renders a table (tested, 17 rows) |
| Multi-select | ✓ | "Select" mode; click toggles |
| Select all / none | ✓ | Bulk bar |
| Preview | ✓ | Drawer player |
| Download (save a copy) | ✓ | Native save dialog |
| Rename / edit tags / metadata | ✓ | Drawer |
| Delete with confirmation | ✓ | Purge option |
| Archive | ✓ | Drawer + bulk |
| Favourite | ✓ | Stored as a `favorite` tag; filter chip + drawer toggle (no schema change) |
| Compare two assets | ✓ | Side-by-side dialog (requires exactly 2 selected) |
| Collections | ✗ | Tables exist (`collections`, `collection_assets`) but no UI/IPC; not exposed |
| Remove from collection | ✗ | Same |
| Send to AI Canvas / PhotoCraft / FilmCraft / EffectsCraft / Video Studio | ✓ | Handoff without re-upload |
| Version history | ✓ | Drawer list, lineage preserved |
| Generation details | ✓ | Provider, model, prompt, job id, workflow id, execution mode, mock reason |

## D. PhotoCraft

| Control | Status | Notes |
|---|---|---|
| Prompt | ✓ | With DeepSeek/Ollama "Improve prompt" |
| Model selector + info | ✓ | Schema-driven; blurb shown |
| Aspect / resolution / variations / steps / guidance / format / seed | ✓ | Rendered from the model schema only |
| Reference image (gallery) | ✓ | Picker; edit + background modes |
| Upload reference | ✗ | Import lands in Asset Studio (single media path) |
| Generate | ✓ | Real job, live or labelled mock |
| Cancel | ✓ | Job progress panel |
| Retry | ✓ | Enabled for failed/cancelled jobs |
| Preview / compare variations | ✓ | Result grid; multiple images per job |
| Regenerate | ✓ | Press Generate again (same settings) |
| Download | ✓ | Save-a-copy on the result |
| Send to FilmCraft / EffectsCraft / Asset Studio; use as source | ✓ | |
| Clear settings | ✓ | Resets prompt, params, reference, force-mock (tested) |

## E. FilmCraft

| Control | Status | Notes |
|---|---|---|
| Prompt, model selector, model info | ✓ | |
| Image reference (start frame) | ✓ | Gallery picker |
| End frame | ✓ | Only for models that declare `endImageParam` |
| Video reference | ✗ | No catalog model accepts a video input |
| Duration / aspect / resolution / fps / steps / seed | ✓ | Duration is expressed as frames ÷ fps, which is what the model schema exposes |
| Upload media | ✗ | Import via Asset Studio |
| Generate / cancel / retry | ✓ | Async job with polling |
| Preview | ✓ | Result strip player |
| Download | ✓ | Save a copy |
| Save to Asset Studio / send to Video Studio / EffectsCraft | ✓ | |
| Clear settings | ✓ | |

## F. EffectsCraft

| Control | Status | Notes |
|---|---|---|
| Import / choose from gallery | ◐ | Gallery picker; import via Asset Studio |
| Effect categories + selector | ✓ | Local (upscale/enhance/denoise/video enhance) + fal rembg |
| Effect parameters | ✓ | Schema-driven |
| Before/after preview | ✓ | Side-by-side |
| Apply / cancel | ✓ | Job panel |
| Reset settings | ✓ | Clears parameters (tested) |
| Undo / redo effects | ✗ | Results are immutable versions; use the version table to step back |
| Save as new version | ✓ | Automatic lineage (`parent_asset_id`, version) |
| Send to other workspaces | ✓ | Asset Studio / Video Studio / PhotoCraft |
| Download | ✓ | Save a copy |

## G. Video Studio

| Control | Status | Notes |
|---|---|---|
| Import media / choose from Asset Studio / add to timeline | ✓ | Bin + handoff |
| Remove from timeline | ✓ | Delete clip |
| Media bin + search | ◐ | Type filter (`All/Video/Images/Audio`) and scroll; no text search in the bin |
| Preview / play / pause | ✓ | Canvas compositor, transport |
| Stop (return to 0) | ✓ | Transport ⏮ |
| Timeline zoom | ✓ | Zoom slider (24–160 px/s) |
| Split / trim / move / delete | ✓ | Handles, drag, split at playhead |
| Duplicate clip | ✓ | Toolbar (enabled with a selection) |
| Add video / audio / title track | ✓ | Toolbar (video track tested 3→4) |
| Mute / unmute track | ✓ | Excluded from preview and export (tested) |
| Lock / unlock track | ✓ | Blocks drags with an explanation |
| Undo / redo timeline | ✗ | Not implemented; save/reload is the recovery path |
| Clip inspector: position, duration, in-point, volume, fit, transition | ✓ | |
| Scale / opacity / per-clip effects | ✗ | Not implemented; would be dishonest to show |
| Export settings (resolution, fps, quality) | ✗ | Export uses the timeline's size/fps; quality is fixed CRF 20. The service clamps overrides but no UI exposes them yet |
| Export / progress / cancel / open file | ✓ | ffmpeg render, live progress, reveal in Explorer |
| Export history | ✓ | Export Manager |

## H. Provider settings

| Control | Status | Notes |
|---|---|---|
| Enable/disable per provider | ✓ | Switch, persisted |
| API key input (write-only) | ✓ | Masked hint after save; never returned to the renderer |
| Replace key / clear key | ✓ | Save overwrites; Clear removes |
| Test connection | ✓ | fal: free validation probe; DeepSeek `/models`; Ollama `/api/tags` |
| Connection status + last tested + last error | ✓ | |
| Save / discard | ◐ | Save persists; "discard" is implicit (reload form state on provider refresh) |
| Help / docs links | ✓ | Opens external browser |
| Ollama endpoint + model discovery | ✓ | Lists installed models |
| Ollama optional API key | n/a | Ollama has no auth by default (documented) |

## I. Job manager

| Control | Status | Notes |
|---|---|---|
| All / active / succeeded / mock / failed tabs | ✓ | |
| Search | ✓ | Model, id, prompt, error, workspace (tested 16→0) |
| Provider filter | ✓ | |
| Task-type filter | ✓ | |
| Auto-refresh | ✓ | Live events + manual Refresh |
| Job details / parameters | ✓ | Expandable row |
| Progress / error details | ✓ | |
| Cancel / retry | ✓ | Status-dependent |
| Open result asset | ✓ | Handoff to Asset Studio |
| View logs | ✓ | Link to Logs |
| Filter by model | ✗ | Search covers model matching; no separate model dropdown |

## J. Workflow manager

| Control | Status | Notes |
|---|---|---|
| Create / open in canvas | ✓ | |
| Search | ✓ | |
| Filter | ✗ | Only search; runs are per workflow |
| Rename | ✓ | Dialog (tested) |
| Duplicate | ✓ | Copies the saved graph |
| Delete with confirmation | ✓ | |
| Run | ✓ | Blocking run with toast |
| Stop | ✗ | Stopping is available in the canvas (where the run id is live); the manager awaits completion |
| Execution history + last run | ✓ | Expandable rows with result assets |

## K. Export manager

| Control | Status | Notes |
|---|---|---|
| History list | ✓ | |
| Search + status filter | ✓ | |
| Details / manifest | ✓ | Sources, verification, SHA-256 |
| Open file / open folder | ✓ | Reveal in Explorer |
| Retry failed export | ✓ | Re-queues from the stored timeline |
| Remove record | ✓ | Confirmation; file kept on disk (tested control presence) |
| Delete rendered file | ◐ | `exports.remove` supports `purge`, not exposed in UI |

## L. Application settings

| Control | Status | Notes |
|---|---|---|
| Diagnostics run + provider/db/storage summary | ✓ | |
| Open app data / media folders | ✓ | |
| Compact asset cards preference | ✓ | Persisted in `settings` |
| About / version / Electron / Node | ✓ | |
| Keyboard shortcut list | ✓ | |
| Security / data explanation | ✓ | |
| Reset to defaults | ✗ | Only one preference exists; no reset affordance shown |
| Theme selection | n/a | Single BINDU/PRISM theme by design |
| Storage location change | ✗ | Read-only display; moving the store is a migration, not a setting |
| Notifications preferences | ✗ | Toasts are always on; no setting |

---

## Controls added in this pass

AI Canvas: Undo, Redo, Zoom in/out, Fit, Reset view (1:1), Save as, Clear (confirm), Stop, palette search, duplicate node, edge select/delete, output count in node status.
Asset Studio: list view, multi-select mode, select all/none, bulk favourite, bulk archive, compare two assets, favourites filter + drawer toggle.
Jobs: search, provider filter, task filter, reset, refresh, logs link.
Workflows: search, refresh, rename dialog, duplicate.
Exports: search, status filter, retry, remove record (confirm).
PhotoCraft / FilmCraft / EffectsCraft: retry failed job, download result, clear/reset settings.
Video Studio: add video/audio track, duplicate clip, mute and lock per track (mute honoured by the exporter), track controls styled and labelled.
Backend: `workflows:start` (non-blocking run id), `exports.remove`, export render settings (clamped), muted-track export.

## Controls still unavailable (and why)

Collections, project duplication, global search/notifications, per-node retry, canvas reference upload, filmcraft video references, timeline undo/redo, scale/opacity/effects per clip, export-settings UI, workflow "stop" in the manager, settings reset/theme/storage-location. None of these are shown as working controls; each is listed above with the reason.
