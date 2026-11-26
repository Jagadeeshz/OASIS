# OASIS — user guide

OASIS is a desktop application. Everything you generate, edit, cut and export stays on this machine in your own project folders.

---

## 1. First launch

1. Start **OASIS** from the Start menu / desktop shortcut (installed build) or `npm start` (from source).
2. OASIS opens on **Dashboard** with a starter project already created ("Welcome project"). Create your own in **Projects → New project**; the active project is shown in the top bar and used by every workspace.
3. Open **Providers** and add a fal.ai key if you want real generation ([PROVIDER_SETUP.md](PROVIDER_SETUP.md)). Without a key the app still works end to end — results are placeholder media labelled **Mock — unverified**.

The top bar always shows: the active project, fal.ai status, any running job count, and a warning if ffmpeg is missing.

---

## 2. The six workspaces

### PhotoCraft — images

- **Create**: pick a model (fal.ai FLUX.1 schnell/dev, or Mock), write a prompt, choose size/format/steps, press **Generate image**.
- **Edit**: choose a source image from the shared library, write what should change, set `strength` (lower = closer to the original), press **Apply edit**.
- **Background**: `rembg` cuts the subject out of an image.
- If DeepSeek or Ollama is enabled, **Improve prompt** rewrites your prompt (Enhance / Expand / Storyboard). Disabled providers show the button greyed out with the reason.
- Results appear immediately and are already in Asset Studio. **Use as source** feeds a result into the Edit tab; **Send to FilmCraft / EffectsCraft** hands it over without re-uploading.

### FilmCraft — video

- **Text → video**: prompt + aspect ratio + resolution + frames/fps (the estimated clip length is shown).
- **Image → video**: choose a start frame, optionally an end frame (only models that declare an end-image input use it).
- Long jobs are asynchronous: you can leave the workspace, keep working, and watch progress in **Jobs**. The generated clip lands in Asset Studio and can be sent straight to Video Studio.
- Provider limits are real: frames and resolutions come from the model's schema, so the app never offers a duration the model cannot produce.

### EffectsCraft — enhancement

- Pick any image or clip, choose an operation:
  - **Upscale 2× / 3× / 4×**, **Enhance**, **Denoise** — local ffmpeg, instant, no provider needed.
  - **Remove background** — fal.ai rembg (live, or labelled mock).
  - **Video enhance** — local scale + sharpen.
- The before/after comparison shows both versions with resolution and version number.
- Every result is a **new version**: the original is preserved, and the version table lets you jump back.

### Asset Studio — the library

- Search by name, prompt or model; filter by media type or tag; sort by newest/oldest/name/size.
- **Import media** or drag files onto the page (PNG, JPG, WEBP, GIF, MP4, WEBM, MOV, MP3, WAV, M4A).
- Click an asset for the detail drawer: preview player, dimensions/duration/size/MIME, source workspace, provider, model, execution mode, verification, job/workflow ids, prompt, tags, version history, mock reason.
- Actions: rename, tag, **Save a copy** (exports the file anywhere on disk), show file in Explorer, archive, delete (with confirmation; deletion purges the file), and **Send to** PhotoCraft / FilmCraft / EffectsCraft / AI Canvas / Video Studio.
- Assets generated anywhere appear here automatically — there is no download/re-upload step between workspaces.

### AI Canvas — workflows

- Add nodes from the left palette, drag nodes to arrange, drag from a **right-hand output port** to a **left-hand input port** to connect. Port colours indicate media type; invalid connections are refused with a message.
- Select a node to configure it on the right: prompt text, source asset, model, and that model's real parameters.
- The starter graph is `Prompt → Model → Image generation → Output`. Press **Run workflow**: each node shows idle → running (%) → done, with the job id in the inspector.
- **Save** stores the graph in the project; **Open** loads a saved one; **Workflows** in the sidebar lists saved graphs, runs them headlessly and shows run history with result assets.
- There is no code-execution node: node types are a fixed allowlist (prompt, asset, model, generate, edit, remove-background, video, speech, upscale, batch, storyboard, sequence, output).

### Video Studio — editing

- Left: **media bin** (all project video/images/audio) with **Add** buttons; **Import** brings in new files; the timeline selector switches between saved edits.
- Centre: live **composite preview** of the timeline at the playhead — video clips, stills, overlays and titles are drawn on a canvas. Click the preview or press **Space** to play/pause; the scrubber seeks.
- Right/bottom: **clip inspector** — start, duration, in-point, volume, fit (cover/contain), transition (hard cut or fade), plus title text/size/colour/vertical position.
- Timeline: drag a clip body to move it, drag its edges to trim, **Split** at the playhead, **Delete clip**, **+ Text** adds a title at the playhead, zoom slider changes scale. Double-click a lane to move the playhead.
- **Export mp4** renders the timeline with ffmpeg (H.264/AAC). Progress is shown; on success you get **Show file**, the manifest summary (resolution, duration, SHA-256, verification) and the clip appears in Asset Studio as an export asset.

---

## 3. Mock mode — what it means

If fal.ai has no usable key (or you tick "Force mock"), OASIS still produces deterministic placeholder media so you can build and test the whole pipeline. Those results are **always** labelled:

> **Mock — unverified**

You will see this on job rows, result cards, asset cards and details, canvas node status, timeline clips, export summaries and inside the export manifest (`"verification": "mock-unverified"`). Placeholder images carry a white marker plate; mock videos burn "MOCK - UNVERIFIED" into the frame.

A mock asset never becomes verified. Only a new successful live generation produces `verified`. Failures of a configured provider are shown as failures with the provider's message — they are not turned into mock output.

---

## 4. Projects, storage, exports

- **Projects**: create, rename, open, archive, delete (delete removes that project's assets, jobs, workflows and timelines; exported files on disk are kept). Every workspace follows the active project; switching is instant and the choice is remembered.
- **Storage**: shows asset counts, media bytes, database size, ffmpeg status and the exact paths; opens the media/app folders.
- **Exports**: every render with status, progress, manifest details, source-asset verification, reveal-in-Explorer, and a link back to its timeline.
- **Settings**: application/diagnostics (database, storage, providers, secret storage, model count), data & security notes, interface density preference, keyboard shortcuts.
- **Logs**: redacted operational log with level filters, expandable data, and clear.

---

## 5. Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+1` … `Ctrl+6` | AI Canvas, PhotoCraft, FilmCraft, Asset Studio, Video Studio, EffectsCraft |
| `Space` (Video Studio) | Play / pause preview |
| `Delete` (Video Studio) | Delete selected clip |
| `Ctrl+R` | Reload the window (development aid) |

---

## 6. Where your data lives

```
%APPDATA%\oasis\oasis.db                     project/asset/job metadata
%APPDATA%\oasis\storage\projects\<id>\...     media files and thumbnails
%APPDATA%\oasis\exports\<project>\*.mp4      renders + .manifest.json
%APPDATA%\oasis\vault.json                   encrypted provider keys
```

Back these up to preserve a project. Uninstalling the app does not delete this folder; remove it manually if you want a clean slate.

---

## 7. Troubleshooting

| Problem | Fix |
|---|---|
| Everything says Mock — unverified | Add/repair the fal.ai key in Providers and press Test connection |
| "ffmpeg missing" badge | Install ffmpeg and put it on PATH, then restart OASIS (Settings shows the detected version) |
| Video export fails | Check the timeline has at least one clip; the error text from ffmpeg is shown in Exports |
| A job failed | Open Jobs, expand the row for the provider message, fix the cause, press Retry |
| App won't start twice | OASIS is single-instance by design; the existing window is focused instead |
| Need a completely fresh start | Close OASIS, rename `%APPDATA%\oasis` to `oasis-backup`, relaunch |
