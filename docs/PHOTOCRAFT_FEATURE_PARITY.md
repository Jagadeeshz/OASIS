# PhotoCraft feature parity

Official reference: https://www.getartcraft.com/apps/photocraft and https://github.com/storytold/photocraft (Apache-2.0).
OASIS implementation: `src/workspaces/PhotoCraftEditor.tsx` (new, 2026-11-26), reached through
PhotoCraft → **Edit** tab. No source was copied; the editor is independent TypeScript on the HTML canvas.

## Official claims (quoted from the product page)

> “Layers, masks, adjustment layers, layer styles, type, vectors and brushes in a native app written entirely in Rust.”
> “16 adjustment layers, 70+ live-preview filters, smart objects with smart filters, and a full set of layer styles.”
> “8, 16 and 32-bit documents in RGB, CMYK, Lab and Grayscale, with ICC color management and soft proofing.”
> “Opens and saves layered PSD and PSB documents.”

## Status

| Official capability | Status | Where / why |
|---|---|---|
| Create document, set canvas size | **Implemented** | New-document dialog (W×H) |
| Canvas resize / crop | **Partial** | Crop tool (rect) resizes the document; no separate “canvas size” dialog |
| Image resize / transform | **Missing** | — |
| Zoom | **Implemented** | Zoom slider 25–300 % |
| Pan | **Partial** | Scroll container; no hand tool |
| Rulers, guides, grids | **Missing** | — |
| Document tabs / multiple documents | **Missing** | One document per session |
| Undo / redo | **Implemented** | 12-step snapshot history, `Ctrl/Cmd+Z`, `Shift+Z` |
| Pixel layers | **Implemented** | Offscreen canvas per layer |
| Text layers | **Implemented** | Editable text, size, colour (point text) |
| Fill layers | **Implemented** | Colour fill layer |
| Adjustment layers | **Partial (4 of 16)** | Brightness/contrast, hue/saturation, black & white, levels-lite; re-evaluated live |
| Vector layers, groups, nesting | **Missing** | — |
| Clipping / pixel / vector masks | **Missing** | — |
| Layer visibility, lock, opacity, ordering, duplicate, delete, rename | **Implemented** | Layers panel + properties |
| Blend modes | **Implemented (16)** | Native `globalCompositeOperation` modes |
| Layer styles, smart objects, smart filters | **Missing** | — |
| Marquee (rect/ellipse), lasso, magic wand, quick/object/subject select | **Partial** | Rect + ellipse only |
| Selection refine / feather / expand / save | **Missing** | — |
| Brush, eraser (size, hardness, opacity) | **Implemented** | Pressure-free round brush with hardness gradient |
| Pencil, presets, dynamics | **Missing** | — |
| Colour picker (eyedropper) | **Implemented** | Reads the composited pixel |
| Gradient, paint bucket | **Partial** | “Fill” fills the layer or selection |
| Shape / pen / path tools | **Missing** | — |
| Type: family, weight, tracking, leading, alignment | **Partial** | Size + colour only |
| Filters (documented 70+) | **Partial (8)** | Blur, sharpen, noise, pixelate, invert, sepia, posterize, vignette — destructive, real pixel work |
| Colour modes 8/16/32-bit, CMYK/Lab, ICC, soft proof | **Missing** | 8-bit sRGB only |
| PSD / PSB / TIFF layers / ORA / KRA / PDN / SVG / EXR / HDR / FITS | **Missing** | PNG export only |
| Save to Shared Asset Studio | **Implemented** | `assets:savePng` IPC → `createFromBuffer`, provenance `photocraft-native` |
| Open image from Asset Studio | **Implemented** | Asset picker → base layer |

**Implemented 13 · Partial 7 · Missing 14 · Blocked 0.**

## Test evidence

`node scripts/verify-creative.mjs` against the running desktop build — **10/10 checks**, including:
canvas mounts, 8 tools, add pixel + fill layers (3 rows), type layer (4 rows), adjustment layer (5 rows),
filter applies to a pixel layer, blend + opacity controls present, **Save to Asset Studio creates one asset**,
FilmCraft edit tab mounts the timeline.

Limitations: history restores bitmap layers only (text/adjustment layers keep their properties but not
per-step values); filters are destructive and have no live preview dialog; the canvas is CPU 2D, not GPU.
