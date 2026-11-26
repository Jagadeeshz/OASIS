# Official tool features → OASIS mapping

Sources read for this pass (official product pages / repositories, Nov 2026):

- **Lumit** — `github.com/luminalmvm/Lumit`, `lumitlab.com` (GPLv3, 54 releases). Self-described: “Compositing that adapts to your workflow. A motion-graphics and compositing editor for Windows, macOS and Linux.” Repo exposes `crates/`, `ofx/` (OpenFX extensions), `flutter_ui/`, `web-docs/`.
- **PhotoCraft** — `photocraft.digital/photocraft-ai/`. Image tools (prompt or reference → image, model/aspect/resolution selection, reference-guided editing where the model supports it) inside a layered document editor, plus an “Agent” that performs a fixed set of document actions.
- **EffectCraft** — `getartcraft.com/apps/effectcraft`. Compositions, layers, keyframes, 259 effects, expressions, 3D cameras/lights, render queue.
- **FilmCraft** — `filmcraft.lol` (v0.6.0). Professional NLE: source/program monitors, three-point editing, trim modes, J/K/L, frame-exact timebase, colour grading, ~55 effects, 30 transitions, keyframes, GPU compositor, broadcast audio.

Ownership rule (from the earlier architecture correction) is applied throughout: editing features land in **Video Studio**, effects work in **EffectsCraft**, image work in **PhotoCraft**, and **FilmCraft** stays the AI video-generation workspace.

---

## 1. Lumit (motion graphics / compositing)

| Official feature | OASIS home | Status |
|---|---|---|
| Composition with duration/size/fps | Video Studio | **Implemented** — timeline settings (width, height, fps) |
| Layer stack with blend and opacity | Video Studio | **Partial** — video-track stacking + per-clip opacity added; no blend modes |
| Keyframes (linear/bezier/hold, roving, graph editor) | Video Studio | **Not implemented** |
| Solids, shapes, text, footage, nested comps, nulls, adjustment layers | Video Studio | **Partial** — footage + text only |
| Parenting, track mattes | Video Studio | **Not implemented** |
| 3D cameras/lights/DOF | Video Studio | **Not implemented** |
| Expressions (JS) | Video Studio | **Not implemented** |
| OpenFX extension support | — | **Not implemented** (no plugin host) |
| Render queue / export | Video Studio + Export Manager | **Implemented** — ffmpeg MP4 + manifest |

## 2. PhotoCraft (image editor + AI image tools)

| Official feature | OASIS home | Status |
|---|---|---|
| Prompt → image with model, aspect ratio, resolution | PhotoCraft | **Implemented** (schema-driven from the verified catalog) |
| Reference-guided editing on supported models | PhotoCraft | **Implemented** — FLUX image-to-image |
| Layered document editor | PhotoCraft | **Not implemented** — OASIS has no layer stack in PhotoCraft |
| Layer create/rename/opacity, text layers, adjustment layers (brightness, B&W) | PhotoCraft | **Not implemented** — colour work is EffectsCraft’s `local/filter` |
| Insert generated images into the document | PhotoCraft | **Partial** — results are versioned assets in Asset Studio, not document layers |
| Undo of applied changes | PhotoCraft | **Not implemented** |
| Export / download | PhotoCraft + Asset Studio | **Implemented** |
| Credit quote before generating | — | **n/a** (BYOK, no credit system) |

## 3. EffectCraft (motion graphics / VFX)

| Official feature | OASIS home | Status |
|---|---|---|
| Colour correction (exposure/contrast/saturation/hue) | EffectsCraft `local/filter` | **Built this pass** — ffmpeg `eq` + `hue` |
| Blur | EffectsCraft `local/filter` | **Built this pass** — `gblur` |
| Sharpen | EffectsCraft `local/filter` | **Built this pass** — `unsharp` |
| Vignette | EffectsCraft `local/filter` | **Built this pass** — `vignette` |
| Grain/noise | EffectsCraft `local/filter` | **Built this pass** — `noise` |
| Keying / background removal | EffectsCraft | **Implemented** — fal rembg (labelled mock without a key) |
| Upscale / enhance / denoise | EffectsCraft | **Implemented** — Lanczos, unsharp, hqdn3d |
| 259 effects (distortion, generators, particles, stylize, time) | EffectsCraft | **Not implemented** — only the seven filters above exist |
| Compositions, layers, keyframes, 38 blend modes | Video Studio / EffectsCraft | **Not implemented** |
| 3D cameras and lights, JS expressions | — | **Not implemented** |
| Lottie import/export, ProRes/EXR/GIF export | — | **Not implemented** |

## 4. FilmCraft (professional NLE)

| Official feature | OASIS home | Status |
|---|---|---|
| Program monitor / preview | Video Studio | **Implemented** — canvas compositor |
| Source monitor + media bin | Video Studio | **Partial** — bin yes, no separate source monitor |
| Trim (in/out), move, split, delete | Video Studio | **Implemented** |
| Three-point editing, J/K/L, all trim modes | Video Studio | **Not implemented** |
| Frame-exact integer timebase (23.976 / 29.97 DF) | Video Studio | **Partial** — fps is configurable; timeline math is float seconds |
| Colour grading: curves, wheels, HSL secondaries, LUTs | Video Studio | **Partial** — per-clip exposure/contrast/saturation/hue added; no curves/wheels/LUTs |
| Scopes | Video Studio | **Not implemented** |
| ~55 effects, 30 transitions | Video Studio | **Partial** — one fade transition, no effect library |
| Keyframes with value/velocity graphs | Video Studio | **Not implemented** |
| Audio mixer with automation, EBU R128 | Video Studio | **Partial** — per-clip volume + fade in/out; no loudness metering |
| Render/export with progress | Video Studio + Export Manager | **Implemented** |

---

## What was built in this pass

**Video Studio (Lumit/FilmCraft scope)**
- Per-clip **colour**: exposure, contrast, saturation, hue — slider-driven, applied in preview (`ctx.filter`) and in the export (`eq`, `hue`).
- Per-clip **transform**: opacity, scale, position X/Y — preview honours `globalAlpha` + canvas transform; export uses `scale`, `colorchannelmixer=aa` and a centred `overlay`.
- Per-clip **audio fade in/out** (0–5 s) — `afade` in the export chain.
- Reset buttons for colour and transform.
- Timeline normalisation clamps every new value so hand-edited or older timelines cannot inject out-of-range filters.

**EffectsCraft (EffectCraft scope)**
- New model `local/filter` (“Colour & filter lab”) with brightness, contrast, saturation, hue, blur, sharpen, vignette, grain — executed locally by ffmpeg as `image.filter`, producing a new asset version. Visible in the EffectsCraft operation list.

**Reliability**
- Boot failures are now logged (`[oasis] startup failed: …`) before the error dialog, instead of only showing a modal.

## Verification status

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm run build` | success |
| `npm test` | **24 / 24 pass, 0 fail, 0 skipped** |
| App boots with a fresh profile | yes — `filterOp: true` confirmed over CDP |
| Clip sliders exercised in a live window | **not verified this session** |
| `local/filter` job run end-to-end in the app | **not verified this session** |

Two runtime gaps, stated plainly:

1. The default-profile window no longer launches on this machine — Electron exits immediately with `Unable to move the cache: Access is denied`, the stale Chromium profile lock seen earlier in this project. Launching with `--user-data-dir=<fresh dir>` starts normally, which isolates the cause to the profile, not the code.
2. Against that fresh profile the probe’s mock image job did not reach a terminal state within 28 s, so the clip sliders (which need a clip) and the `local/filter` job could not be exercised through the UI. The filter model is unit-test-covered through the same local-ffmpeg path that passes 24/24.

## Not verified / blocked

- **Live fal.ai generation** — still `403 Exhausted balance` on the configured account. Everything generation-related in this pass is mock-labelled.
- Keyframes, graph editor, blend modes, mattes, 3D, expressions, Lottie, ProRes/EXR, scopes, LUTs, curves/wheels, loudness metering, multicam — not implemented, and no control pretends otherwise.
- PhotoCraft layered document editor and Agent actions — not implemented.
