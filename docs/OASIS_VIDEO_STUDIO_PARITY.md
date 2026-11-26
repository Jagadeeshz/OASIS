# OASIS Video Studio — Lumit parity

| Feature | Official Lumit status | OASIS current status | Implementation location | Test status | Remaining limitation |
|---|---|---|---|---|---|
| Multitrack video/audio/title timeline | Shipped | **Fully implemented** | `VideoStudio.tsx`, `timeline.cjs` | Pass (unit + desktop) | 3 default tracks, add/remove supported |
| Trim, move, split, duplicate, delete | Shipped | **Fully implemented** | `VideoStudio.tsx` | Pass | Pointer gestures, no keyboard trim modes |
| Ripple delete (delete + close gap) | Shipped (Cut) | **Fully implemented** | `removeSelected`/`rippleDelete` | Pass (button present, logic unit-visible) | Same-track only |
| Split at playhead (S) | Shipped | **Fully implemented** | `splitAtPlayhead` | Pass | Video/audio tracks only |
| Markers (M) + jump | Shipped | **Fully implemented** | `markers` state + chips | Pass (0 → 1 chip) | No marker rename/colour |
| Snapping | Shipped | **Missing** | — | — | Helper removed rather than shipped dead |
| In/out points, three-point editing | Shipped | **Missing** | — | — | — |
| Slip / slide / roll editing | Shipped | **Missing** | — | — | — |
| J/K/L dynamic trimming | Shipped | **Partial** | keydown handler | **Not asserted** | J steps back 10 frames, K pauses, L plays — not Lumit's variable-speed trimming |
| Frame-accurate navigation (←/→, Shift = 1 s) | Shipped | **Partial** | keydown handler | Not asserted | Float seconds internally |
| Integer/rational timebase incl. 23.976 & 29.97 DF | Shipped | **Missing** | — | — | Seconds are floats; fps configurable |
| Retime / speed change | Shipped | **Fully implemented** | inspector + `setpts`/`atempo` | Unit export passes; speed slider not exercised | No speed ramps, reverse or freeze |
| Per-clip colour (exposure/contrast/saturation/hue) | Shipped | **Fully implemented** | exporter `eq`/`hue` | Unit export passes | Single grade, no wheels/curves |
| Per-clip transform (opacity/scale/position) | Shipped | **Fully implemented** | exporter `scale`/`overlay` | Unit export passes | No rotation, anchor, 3D |
| Track mute / solo / lock | Shipped | **Fully implemented** | track buttons; solo = mute others | Pass (solo mutes 2 of 3) | Solo is a UI-level mute, not an engine flag |
| Audio volume + fade in/out | Shipped | **Fully implemented** | `volume`, `afade` | Unit export passes | No pan, automation or R128 |
| Transitions | Shipped (pack) | **Partial** | one `fade` transition | Unit export passes | 1 of the documented pack |
| Effects library (247 documented) | Shipped | **Missing** | — | — | Only clip colour/transform; no effect chain |
| Keyframes / graph editor / value-speed graphs | Shipped | **Missing** | — | — | Requires a frame-rendering path |
| Nodes workspace | Shipped | **Missing** | (AI Canvas is a different engine) | — | — |
| Colour workspace, scopes, LUTs, shot matching | Shipped | **Partial** | per-clip grade only | — | No scopes, no LUT, no wheels |
| Text layers / titles | Shipped | **Partial** | text track, font size/colour/position | Pass | No animators, tracking, stroke |
| Shape layers, masks, mattes | Shipped | **Missing** | — | — | — |
| 38 blend modes | Shipped | **Missing** | overlay only | — | — |
| 3D layers, cameras, lights | Shipped | **Missing** | — | — | — |
| Tracking, stabilise, roto | Shipped | **Missing** | — | — | — |
| Captions from speech, 7 styles, SRT/VTT/ASS/LRC | Shipped | **Missing** | — | — | Needs ASR |
| Transcript editing | Shipped | **Missing** | — | — | — |
| Multicam | Shipped | **Missing** | — | — | — |
| Audio mixer, meters, beat detection | Shipped | **Missing** | — | — | — |
| Plugins (OFX/VST3/CLAP), scripting, MCP | Shipped (repo) | **Missing** | — | — | — |
| Export (resolution/fps/codec/bitrate presets, queue, logs) | Shipped | **Partial** | MP4 + manifest + history + progress/cancel | Unit + desktop pass | Presets/codec UI absent |
| Autosave, crash recovery, project history | Shipped | **Partial** | explicit save, single-instance, durable DB | Manual | No autosave journal |
| Collaboration / multi-edit | Shipped (Pro) | **Missing** | — | — | — |
| Native codecs (H.264/HEVC/ProRes/VP9/AAC/Opus) | Shipped | **Blocked** | external ffmpeg | — | OASIS deliberately uses ffmpeg; no native codec claim |

**Identified 35 capability groups · Implemented 9 · Partial 6 · Missing 19 · Blocked 1.**

Honest summary: this pass adds real timeline mechanics (markers, split, ripple delete, solo, retime) to an
engine that already did trim/move/duplicate/colour/transform/audio/export. It does **not** deliver keyframes,
nodes, 3D, tracking, captions, multicam or the effect library — those need a frame-rendering pipeline that
does not exist yet (see the architecture document).
