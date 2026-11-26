# Video Studio architecture

## Current pipeline

```
timeline data (SQLite `timelines.data`)
   │  normalize(): clamps every clip/track field   [electron/services/timeline.cjs]
   ▼
TimelineData ──► VideoStudio.tsx  (preview: Canvas 2D compositor, per-clip colour/transform/audio)
   │
   └──► exporter.cjs (ffmpeg): per-clip filter chain → overlay stack → MP4 + SHA-256 manifest
```

Per clip the exporter builds: `fps → fit-scale → transform-scale → eq/hue → alpha → setpts(start, speed)`,
then `overlay` with per-clip position, and for audio `atrim → volume → afade → atempo → adelay`.
Text tracks are drawn with `drawtext`. Export metadata (sources, verification, digest) is written beside the file.

Timeline model: `{version, width, height, fps, tracks[{id,type,name,muted,locked,clips[]}], markers[]}`
Marker state currently lives in the component; persisting it in the timeline document is the next step.

## Frame timebase (added)

`timeline.cjs` normalises every incoming time to the project frame grid:
`start`, `duration` and `inPoint` are quantised by `round(v × fps) / fps`, and the integer
indices are persisted alongside (`startFrame`, `durationFrames`, `inFrame`). The document
records `fpsNum = fps × 1000` and `fpsDen = 1000`. The exporter quantises cut points the same
way, so a cut lands on the same frame in preview and in the rendered file.

Limits: 23.976 is still stored as 24-ish via the 1000/1000 pair rather than 30000/1001, and no
drop-frame timecode labels exist yet.

## Captions (added)

`electron/services/captions.cjs` is pure parsing/serialising (no I/O, unit-tested):
`parseCues` (SRT + WebVTT, tag stripping, malformed-cue rejection), `toSrt`, `toVtt`,
`cuesFromTrack` (frame-quantised), `clipsFromCues` (title-track clips).
The Captions panel in Video Studio pastes SRT/VTT, places clips on the title track, and writes
the title track back out as SRT. Because captions become ordinary title clips, they render in the
existing preview compositor and in the ffmpeg `drawtext` path — same source, same output.

Not implemented: speech-to-text (needs an ASR provider/addon), ASS/LRC, caption styles beyond
size/colour/position.

## Why keyframes/effects/nodes are not implemented yet

ffmpeg's filter graph is static: parameters cannot be sampled per frame from OASIS's timeline. Keyframes,
the effect library, the graph editor and node compositions all require **per-frame evaluation**, i.e. a
renderer that draws each frame and pipes it to an encoder. That is a new subsystem (offscreen canvas or
WebGPU renderer in the renderer process, or a headless compositor in main), and it is the correct next
foundation. Adding effect buttons before it would mean shipping controls that cannot render.

## Layer ownership

The timeline engine lives once, in `src/workspaces/VideoStudio.tsx`. FilmCraft mounts it as its "Edit timeline"
tab; there is no second copy. AI generation stays in FilmCraft's Generate tab; native editing stays here.

## Known limits

- Float-second timebase; no drop-frame handling.
- Single `fade` transition; no xfade chain.
- No autosave journal (explicit save only).
- External ffmpeg is required for any video render; the app degrades with a warning badge without it.
