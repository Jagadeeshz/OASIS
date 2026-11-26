# FilmCraft feature parity

Official reference: https://www.getartcraft.com/apps/filmcraft and https://github.com/storytold/filmcraft.
OASIS implementation: `src/workspaces/FilmCraft.tsx` gains an **Edit timeline** tab that mounts the existing
timeline editor (`src/workspaces/VideoStudio.tsx`) — one engine, no duplicated code. The AI generation tab is unchanged.

## Official claims

> “Source and program monitors, a real timeline and every trim mode … J/K/L dynamic trimming.”
> “An integer timebase keeps 23.976 and 29.97 drop-frame exact.”
> “Native H.264, HEVC, ProRes, VP9, AAC and Opus.”
> “Curves, color wheels, HSL secondaries, LUTs, HDR and log workflows, plus scopes.”
> “About 55 video effects and 30 transitions, keyframes with value and velocity graphs … EBU R128 loudness meters.”

## Status

| Capability | Status | Notes |
|---|---|---|
| Project/media bin, program monitor, project settings (res, fps) | **Implemented** | Bin filters images/video/audio |
| Source monitor, three-point editing | **Missing** | — |
| Multitrack video/audio/title timeline | **Implemented** | Add/remove tracks, mute, lock |
| Trim, split, move, duplicate, delete | **Implemented** | Drag handles + toolbar |
| Insert / overwrite / ripple / roll / slip / slide | **Missing** | — |
| Snap, markers, in/out points | **Missing** | — |
| J/K/L playback, frame-accurate stepping | **Missing** | Space plays/pauses |
| Integer timebase, drop-frame | **Missing** | Seconds as floats; fps configurable |
| Video effects (55) / transitions (30) | **Partial** | One fade transition; colour + transform per clip |
| Keyframes and graphs | **Missing** | — |
| Colour grading (curves/wheels/LUTs/scopes) | **Partial** | Exposure/contrast/saturation/hue per clip, applied identically in preview and export |
| Audio: volume, fade, mute, lock | **Implemented** | `volume`, `afade`, per-track mute honoured by the exporter |
| Pan, solo, automation, R128 meters, DSP effects | **Missing** | — |
| Codecs | **Partial (ffmpeg backend)** | H.264 export verified; HEVC/ProRes/VP9/AAC/Opus would come from the host ffmpeg build — untested. **Not** native codecs |
| Render queue, presets, bitrate/codec UI, cancel, history | **Partial** | Progress, cancel, history and manifest exist; resolution/fps/quality UI is not exposed |

**Implemented 6 · Partial 4 · Missing 12 · Blocked 0.**

## Test evidence

`scripts/verify-creative.mjs` — FilmCraft → “Edit timeline” mounts the timeline (3 default tracks).
Earlier evidence unchanged: `npm test` exports a real MP4 with a provenance manifest; `scripts/e2e.mjs`
builds a timeline and exports it.

Blocker note: native codec parity is not claimed. OASIS renders through external `ffmpeg`; the app
degrades gracefully (warning badge) when ffmpeg is absent.
