# Video Studio implementation plan

## Done (this pass)

1. Markers: add at playhead (M), visible chips, click to jump.
2. Split at playhead (S) on video/audio tracks.
3. Ripple delete: remove the clip and close the gap on its track.
4. Per-track solo implemented as an engine-correct mute of the other tracks.
5. Retime: per-clip speed 0.25–4× applied in preview metadata and in export (`setpts`, `atempo`).
6. Keyboard: J (step back 10 frames), K (pause), L (play), ←/→ frame step, Shift+←/→ 1 s, Delete removes the selection.
7. Dead code removed (an unwired snapping helper) rather than shipping a control with no effect.

## Second pass (this session)

8. Frame-accurate timebase: every clip time quantised to the frame grid with integer
   `startFrame`/`durationFrames`/`inFrame` persisted; exporter quantises cuts identically.
9. Captions: SRT/WebVTT import → title-track clips, SRT/VTT export and download, all through a
   pure, unit-tested `captions.cjs`. Burn-in comes free because captions are ordinary title clips.

## Next (ordered by dependency, not by appeal)

1. **Frame renderer.** Offscreen canvas compositor that draws the timeline at arbitrary `t` and pipes frames
   into ffmpeg (`-f rawvideo`). Everything below depends on it.
2. Keyframes on the properties the renderer already knows (position, scale, opacity, colour), linear + eased.
3. Effect chain per clip (Lumit's Blur & Sharpen and Colour groups first — they map to canvas/WebGL filters).
4. Integer timebase: switch `start`/`duration`/`inPoint` to ticks at `fps × 1000`; keep seconds in the UI layer.
5. Transitions: extend from the single fade to xfade-backed cross dissolve/dip to black.
6. Audio: pan, per-track gain, meters from an AnalyserNode; beat detection from an OfflineAudioContext.
7. Captions/transcript: local ASR (whisper.cpp) as an optional addon; SRT/VTT import-export first.
8. Nodes: reuse the AI Canvas graph editor with a *render* node type that consumes the frame renderer.
9. Autosave journal: debounced timeline snapshots into a `timeline_history` table with restore.

## Explicit non-goals for now

3D layers, tracking, roto, multicam, OFX/VST3 hosting, collaboration. Each needs engine work far larger than
the UI, and none can be honestly faked.
