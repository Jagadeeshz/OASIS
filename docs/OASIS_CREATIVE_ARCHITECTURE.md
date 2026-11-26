# OASIS creative architecture (native editing vs AI generation)

Two kinds of capability live side by side and never pretend to be each other.

| Layer | What it is | Where |
|---|---|---|
| Native image editing | CPU canvas compositor: layers, blends, adjustment layers, filters, selections, type | `src/workspaces/PhotoCraftEditor.tsx` |
| AI image generation | Prompt/reference → provider job → Asset Studio | `src/workspaces/PhotoCraft.tsx` (Generate tab) |
| AI video generation | Text/image → video job | `src/workspaces/FilmCraft.tsx` (Generate tab) |
| Native video editing | Multitrack timeline, transforms, colour, titles, audio, ffmpeg render | `src/workspaces/VideoStudio.tsx`, mounted as FilmCraft → Edit timeline |
| Media enhancement | Local ffmpeg filters + fal rembg fallback | `src/workspaces/EffectsCraft.tsx`, `jobs.cjs` |
| Shared spine | Projects, assets/versions, jobs, exports, provider vault, handoffs | `electron/services/*`, `src/lib/store.tsx` |

Rules kept:
- Native editing writes pixels locally and stores the result through `assets:savePng` → `createFromBuffer`
  with `executionMode: 'local-edit'`, so mock/live provenance stays honest.
- AI paths keep their existing `verification`/`execution_mode` fields; nothing native is labelled as AI or vice versa.
- No control is rendered unless its operation actually runs.

Known structural gaps (see the three parity documents): no PSD/ICC/16-bit pipeline in PhotoCraft,
no integer timebase or keyframes in the timeline, no composition/keyframe/3D/expression engine in EffectsCraft.
