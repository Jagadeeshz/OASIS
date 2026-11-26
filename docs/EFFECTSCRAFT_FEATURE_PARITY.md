# EffectsCraft feature parity

Official reference: https://www.getartcraft.com/apps/effectcraft and https://github.com/storytold/effectcraft.
OASIS implementation: `src/workspaces/EffectsCraft.tsx` + `local/filter` model in
`electron/services/providers/catalog.cjs`, executed by `electron/services/jobs.cjs` (`image.filter`).

## Official claims

> “Compositions, layers, keyframes, 259 effects, expressions, 3D cameras and lights, and a render queue.”
> “38 blend modes … JavaScript expressions … H.264 and ProRes with alpha, PNG, TIFF and 32-bit EXR sequences, GIF, and Lottie.”

## Status

| Capability | Status | Notes |
|---|---|---|
| Compositions, nesting, comp settings | **Missing** | No composition timeline |
| Layer types (solid/shape/text/footage/null/adjustment/camera/light) | **Missing** | — |
| Keyframes, graph editor, motion paths | **Missing** | — |
| Blend modes (38) | **Missing** | — |
| Effect registry (259) | **Partial (9 operations)** | Upscale, enhance, denoise, video enhance, background removal, plus the colour & filter lab (exposure, contrast, saturation, hue, blur, sharpen, vignette, grain) |
| Effect parameters, defaults, enable/disable | **Implemented** | Schema-driven params from the catalog |
| 3D layers, cameras, lights, DOF, shadows | **Missing** | — |
| JS expressions | **Missing** | — |
| Render queue, H.264/ProRes/EXR/GIF/Lottie | **Partial** | Renders through the shared job → asset pipeline as PNG/MP4 versions |
| Versioned, non-destructive outputs | **Implemented** | `derive()` → new version with parent lineage |
| Shared Asset Studio I/O | **Implemented** | Picker + result versions |

**Implemented 3 · Partial 2 · Missing 5 · Blocked 0.**

Honest headline: EffectCraft advertises 259 effects; OASIS implements 9 real operations. There is no
placeholder button for the other 250 — the workspace shows only what actually runs.

## Test evidence

`npm test` — “local ffmpeg op produces a versioned asset” passes (skips when ffmpeg is missing).
`local/filter` is exercised by the same code path; the op appears in the EffectsCraft list in the running build.
