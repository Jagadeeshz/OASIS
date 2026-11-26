# Lumit official feature inventory

Sources read for this pass:
- https://lumitlab.com/ — product landing page
- https://lumitlab.com/releases/0.11.2/ — release notes, 15 November 2026 (**baseline**)
- https://docs.lumitlab.com/effects/ — effect reference (updated 19 October 2026)
- https://github.com/luminalmvm/Lumit — repository, GPLv3

## Shipped in v0.11.2 (documented as new/available)

| Area | Capability |
|---|---|
| Cut | Captions from speech (7 styles), caption retyping/retiming/split/join/find-replace, SRT/WebVTT/Timed Text/ASS/LRC import |
| Cut | Editing by transcript: delete/move/copy words, Fillers and Pauses, Assemble from script, transcript export (text, Word, RTF, Markdown, HTML, CSV, SRT, WebVTT) |
| Cut | Multicam: sync by sound/timecode/marks/markers/starts, angle viewer, roll/join/flatten, Sync to angle |
| Cut | Transitions pack: Move, Slices, Light leak, Flash, Dip to black, Glitch, RGB split, Luma fade patterns, Wipes/Moves/Hits groups |
| Colour | Dedicated Colour workspace with Correction; scopes |
| Audio | Live Mixer, Denoise |
| Image | Stabilise |
| Graphics | Graphics templates |
| Library | Shared library across machines |
| Export | Export on another computer |

## Effect categories (documented counts)

| Category | Documented count | Verified names (examples) |
|---|---:|---|
| Blur & sharpen | 11 | Gaussian, directional, radial, unsharp mask, sharpen, depth of field, DoF pro, channel blur |
| Colour | 33 | Colour balance, saturation, vibrancy, vignette, exposure, hue shift, contrast, gamma |
| Distortion | 28 | (wave/twirl/displacement family) |
| Generate | 38 | — |
| Points | 23 | — |
| Stylise | 24 | glow, lens flare, light wrap, light leak, film |
| Temporal | 6 | echo |
| Transition | 8 | — |
| Utility | 17 | — |
| Audio | 21 | — |
| Compositing | 7 | — |
| Controls | 6 | — |
| Drivers | 14 | — |
| Siceliot | 7 | — |
| **Total** | **247** | — |

## Status honesty

The counts above are what the documentation *states*. They were not cross-checked effect-by-effect against the
registry, so OASIS does not claim to reproduce 247 effects. Only effects actually implemented are listed as done.

**In progress / planned:** not documented on the pages read. Nothing is claimed as shipped beyond the v0.11.2 notes.

## Licensing

Lumit is GPLv3. No Lumit source, binaries or assets were copied into OASIS. All behaviour here is an independent
implementation on OASIS's own Electron/React/ffmpeg stack; only documented behaviour was used as reference.
