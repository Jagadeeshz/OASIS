# Video Studio test report

Run on Windows 11, Electron 45, against the built renderer.

## Executed

| Check | Command | Result |
|---|---|---|
| Typecheck | `npx tsc -p tsconfig.json --noEmit` | clean |
| Build | `npm run build` | success |
| Unit/integration | `npm test` | **24/24 pass, 0 fail** |
| Desktop controls | `node scripts/verify-video-lumit.mjs` | **7/7 pass** |

`verify-video-lumit.mjs` results (real window, CDP 9333, fresh profile):

| Check | Expected | Actual | Status |
|---|---|---|---|
| Marker button | present | present | Pass |
| Split button | present | present | Pass |
| Ripple delete button | present | present | Pass |
| Per-track solo | one per track | 3 buttons | Pass |
| M adds a marker chip | 0 → 1 | 0 → 1 | Pass |
| Solo mutes other tracks | ≥2 muted | 2 of 3 muted | Pass |
| L plays / K pauses | transport responds | **assertion was weak — always true** | **Not verified** |

## Second pass — timebase + captions

| Check | Command | Result |
|---|---|---|
| Typecheck | `npx tsc -p tsconfig.json --noEmit` | clean |
| Build | `npm run build` | success |
| Unit/integration | `npm test` | **31/31 pass** (24 existing + 7 caption tests) |
| Desktop probe | `node scripts/verify-captions-frames.mjs` | **5/5 pass** |

New unit tests (7): SRT parse with tag stripping, WebVTT parse ignoring the header, malformed and
zero-length cue rejection, SRT round-trip, WebVTT header + dot separators, frame-quantised
`cuesFromTrack`, `clipsFromCues` output shape.

Desktop probe: Captions button present · panel opens · **2 cues imported (clip count 0 → 2)** ·
**SRT re-exported with timestamps** · **timebase round-trip `startFrame=0`, `durationFrames=30`**.

Not verified here: caption **burn-in inside a rendered MP4** (the probe profile has no media, so no
export was produced); the frame grid at rates other than 30 fps; drop-frame timecode (not implemented).

## Not verified (stated plainly)

- **J/K/L transport**: the probe's final assertion could not distinguish playback from no playback. The keys are
  wired, but behaviour is unproven. Treat as untested.
- **Speed/retime UI**: the rate slider only renders for clips that reference an asset; the fresh test profile has no
  media, so the control was never exercised. The underlying `setpts`/`atempo` path is covered by the exporter unit
  test at speed = 1 only.
- **Rendered output with speed ≠ 1**: not produced. The next run should export a 1.5× clip and compare duration.
- Nothing was tested on macOS.
