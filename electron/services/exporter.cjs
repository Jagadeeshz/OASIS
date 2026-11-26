'use strict';
// Timeline export: builds an ffmpeg filter graph from the timeline, renders mp4,
// verifies the output and writes a provenance manifest. No placeholders.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { nowIso } = require('./db.cjs');
const media = require('./media.cjs');

function hexToFf(color) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color || '#ffffff');
  if (!m) return 'white';
  return `0x${m[1]}${m[2]}${m[3]}`;
}

function fontFile() {
  const candidates = ['C:/Windows/Fonts/arialbd.ttf', 'C:/Windows/Fonts/segoeuib.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'];
  return candidates.find((f) => fs.existsSync(f)) || null;
}

function escFilterPath(p) {
  return p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

/** Build ffmpeg args + filter script from a normalized timeline. */
function buildRender(timeline, assets, { tmpDir }) {
  const { width, height, fps } = timeline;
  let end = 0;
  for (const t of timeline.tracks) for (const c of t.clips) end = Math.max(end, c.start + c.duration);
  const total = Math.max(0.5, Math.round(end * 1000) / 1000);

  const inputs = [];
  const clips = [];
  for (const track of timeline.tracks) {
    if (track.muted) continue;
    for (const clip of track.clips) {
      if (track.type === 'text') continue;
      const asset = assets.get(clip.assetId);
      if (!asset) throw new Error(`Missing asset ${clip.assetId} on ${track.name}`);
      clips.push({ track, clip, asset });
    }
  }
  const trackIndex = new Map(timeline.tracks.map((t, i) => [t.id, i]));
  clips.sort((a, b) =>
    a.track.type === b.track.type
      ? trackIndex.get(a.track.id) - trackIndex.get(b.track.id) || a.clip.start - b.clip.start
      : a.track.type === 'video'
        ? -1
        : 1,
  );

  inputs.push(['-f', 'lavfi', '-i', `color=c=black:s=${width}x${height}:r=${fps}:d=${total}`]);
  const idx = new Map();
  for (const item of clips) {
    const { clip, asset } = item;
    const startAt = Math.max(0, Number(clip.inPoint || 0));
    const group = [];
    if (asset.media_type === 'image') {
      group.push('-loop', '1', '-framerate', String(fps), '-t', String(clip.duration), '-i', asset.storage_path);
    } else {
      if (startAt > 0) group.push('-ss', String(startAt));
      group.push('-t', String(clip.duration), '-i', asset.storage_path);
    }
    inputs.push(group);
    idx.set(clip.id, inputs.length - 1);
  }

  const filters = [];
  let lastVideo = '[0:v]';
  filters.push(`[0:v]format=yuv420p,setsar=1[base]`);
  lastVideo = '[base]';

  // Video layer: every clip on every video track is composited in start order.
  let vCount = 0;
  for (const item of clips.filter((c) => c.track.type === 'video')) {
    const { clip, asset } = item;
    const i = idx.get(clip.id);
    const scale =
      clip.fit === 'cover'
        ? `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`
        : `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`;
    const start = Number(clip.start) || 0;
    const dur = Number(clip.duration) || 1;
    const fades = clip.transition === 'fade' ? `,fade=t=in:st=0:d=0.25,fade=t=out:st=${Math.max(0, dur - 0.25)}:d=0.25` : '';
    const tScale = Number(clip.scale ?? 1);
    const tOpacity = Number(clip.opacity ?? 1);
    const brightness = Number(clip.brightness || 0);
    const contrast = Number(clip.contrast ?? 1);
    const saturation = Number(clip.saturation ?? 1);
    const hue = Number(clip.hue || 0);
    const colour =
      brightness || contrast !== 1 || saturation !== 1 || hue
        ? `,eq=brightness=${brightness}:contrast=${contrast}:saturation=${saturation}` +
          (hue ? `,hue=h=${hue}` : '')
        : '';
    const transform = tScale !== 1 ? `,scale=iw*${tScale}:ih*${tScale}` : '';
    const alpha = tOpacity < 1 ? `,format=rgba,colorchannelmixer=aa=${tOpacity}` : '';
    const speed = Math.max(0.25, Math.min(4, Number(clip.speed ?? 1)));
    const pts = speed === 1 ? `PTS-STARTPTS+${start}/TB` : `(PTS-STARTPTS)/${speed}+${start}/TB`;
    const posX = Number(clip.posX || 0);
    const posY = Number(clip.posY || 0);
    const overlayXY =
      posX || posY
        ? `x=(W-w)/2+${posX}*W:y=(H-h)/2+${posY}*H`
        : 'x=0:y=0';
    filters.push(
      `[${i}:v]fps=${fps},${scale}${transform}${colour}${alpha},setsar=1,setpts=${pts}${fades}[vc${vCount}]`,
    );
    filters.push(
      `${lastVideo}[vc${vCount}]overlay=${overlayXY}:eof_action=pass:enable='between(t,${start},${start + dur})'[v${vCount}]`,
    );
    lastVideo = `[v${vCount}]`;
    vCount++;
  }

  // Text overlays.
  let tCount = 0;
  const font = fontFile();
  for (const track of timeline.tracks.filter((t) => t.type === 'text' && !t.muted)) {
    for (const clip of track.clips) {
      if (!font) throw new Error('No usable font found for text overlays');
      const txtFile = path.join(tmpDir, `text-${clip.id}.txt`);
      fs.writeFileSync(txtFile, String(clip.text || ''), 'utf8');
      const f = escFilterPath(font);
      const tf = escFilterPath(txtFile);
      const xExpr = Math.abs(clip.x - 0.5) < 0.01 ? '(w-text_w)/2' : `(w-text_w)*${clip.x.toFixed(3)}`;
      const yExpr = Math.abs(clip.y - 0.5) < 0.01 ? '(h-text_h)/2' : `(h-text_h)*${clip.y.toFixed(3)}`;
      const box = clip.box ? `:box=1:boxcolor=black@0.45:boxborderw=14` : '';
      filters.push(
        `${lastVideo}drawtext=fontfile='${f}':textfile='${tf}':fontcolor=${hexToFf(clip.color)}:fontsize=${clip.fontSize}:x=${xExpr}:y=${yExpr}${box}:enable='between(t,${clip.start},${clip.start + clip.duration})'[vt${tCount}]`,
      );
      lastVideo = `[vt${tCount}]`;
      tCount++;
    }
  }
  filters.push(`${lastVideo}format=yuv420p[vout]`);

  // Audio: every audio clip plus audio carried by video clips.
  const audioChains = [];
  let aCount = 0;
  for (const item of clips) {
    const { clip, asset } = item;
    const i = idx.get(clip.id);
    const probe = media.probe(asset.storage_path);
    if (!probe.hasAudio) continue;
    const vol = Number(clip.volume ?? 1);
    const delayMs = Math.round((Number(clip.start) || 0) * 1000);
    const label = `[a${aCount}]`;
    const fade = Number(clip.audioFade || 0);
    const afade =
      fade > 0
        ? `,afade=t=in:st=0:d=${Math.min(fade, (Number(clip.duration) || 1) / 2)},afade=t=out:st=${Math.max(0, (Number(clip.duration) || 1) - fade)}:d=${Math.min(fade, (Number(clip.duration) || 1) / 2)}`
        : '';
    const speed = Math.max(0.25, Math.min(4, Number(clip.speed ?? 1)));
    const atempo = speed === 1 ? '' : `,atempo=${speed <= 2 ? speed : 2}${speed > 2 ? `,atempo=${speed / 2}` : ''}${speed < 0.5 ? '' : ''}`;
    const atempoSlow = speed < 0.5 ? `,atempo=0.5,atempo=${speed / 0.5}` : '';
    filters.push(`[${i}:a]atrim=0:${Number(clip.duration) || 1},asetpts=PTS-STARTPTS,volume=${vol}${afade}${atempo}${atempoSlow},adelay=${delayMs}:all=1${label}`);
    audioChains.push(label);
    aCount++;
  }
  let audioOut = null;
  if (audioChains.length === 1) {
    filters.push(`${audioChains[0]}anull[aout]`);
    audioOut = '[aout]';
  } else if (audioChains.length > 1) {
    filters.push(`${audioChains.join('')}amix=inputs=${audioChains.length}:normalize=0:dropout_transition=0[aout]`);
    audioOut = '[aout]';
  }

  const filterFile = path.join(tmpDir, 'filter.txt');
  fs.writeFileSync(filterFile, filters.join(';\n'), 'utf8');

  const args = ['-y', '-hide_banner', '-loglevel', 'error'];
  for (const group of inputs) args.push(...group);
  args.push('-filter_complex', filters.join(';\n'), '-map', '[vout]');
  if (audioOut) args.push('-map', audioOut, '-c:a', 'aac', '-b:a', '192k');
  args.push(
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    String(Math.round(Number(timeline.crf) || 20)),
    '-pix_fmt',
    'yuv420p',
    '-t',
    String(total),
    '-movflags',
    '+faststart',
    '-progress',
    'pipe:1',
    '-nostats',
  );
  return { args, total, filterFile, inputCount: inputs.length, hasAudio: !!audioOut };
}

function runRender({ args, outputPath, total, onProgress, signal }) {
  return new Promise((resolve, reject) => {
    const finalArgs = [...args, outputPath];
    const child = spawn(media.FFMPEG, finalArgs, { windowsHide: true });
    let stderr = '';
    let killed = false;
    const onAbort = () => {
      killed = true;
      child.kill();
    };
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
    child.stdout.on('data', (buf) => {
      const text = buf.toString();
      const m = /out_time_us=(\d+)/.exec(text);
      if (m && onProgress && total > 0) {
        onProgress(Math.max(0, Math.min(0.99, Number(m[1]) / 1e6 / total)));
      }
    });
    child.stderr.on('data', (b) => {
      stderr += b.toString();
    });
    child.on('error', (err) => {
      if (signal) signal.removeEventListener('abort', onAbort);
      reject(new Error(`ffmpeg could not start: ${err.message}`));
    });
    child.on('close', (code) => {
      if (signal) signal.removeEventListener('abort', onAbort);
      if (killed) return reject(Object.assign(new Error('Export cancelled'), { cancelled: true }));
      if (code !== 0) return reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-800)}`));
      resolve({ code });
    });
  });
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/** Render a timeline and write its manifest. */
async function renderExport({ timeline, assets, outputPath, manifestPath, projectId, timelineId, exportId, onProgress, signal, appVersion = '0.1.0' }) {
  if (!media.ffmpegAvailable()) throw new Error('ffmpeg is not installed or not on PATH — export is unavailable');
  const outDir = path.dirname(outputPath);
  fs.mkdirSync(outDir, { recursive: true });
  const tmpDir = path.join(outDir, `.tmp-${exportId}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  try {
    const built = buildRender(timeline, assets, { tmpDir });
    await runRender({ args: built.args, outputPath, total: built.total, onProgress, signal });
    if (!fs.existsSync(outputPath)) throw new Error('Export produced no file');
    const probe = media.probe(outputPath);
    if (!probe.width || !probe.height) throw new Error('Export verification failed: output has no video stream');

    const sources = [];
    const seen = new Set();
    for (const track of timeline.tracks) {
      for (const clip of track.clips) {
        if (!clip.assetId || seen.has(clip.assetId)) continue;
        seen.add(clip.assetId);
        const a = assets.get(clip.assetId);
        if (!a) continue;
        sources.push({
          assetId: a.id,
          name: a.display_name,
          mediaType: a.media_type,
          verification: a.verification,
          executionMode: a.execution_mode,
          provider: a.provider,
          model: a.model,
          jobId: a.job_id,
          mockReason: a.mock_reason,
        });
      }
    }
    const hasMock = sources.some((s) => s.verification === 'mock-unverified');
    const manifest = {
      app: 'OASIS',
      appVersion,
      exportId,
      projectId,
      timelineId,
      exportedAt: nowIso(),
      output: {
        path: outputPath,
        format: 'mp4',
        width: probe.width,
        height: probe.height,
        durationSec: probe.duration,
        frameRate: probe.frame_rate,
        bytes: fs.statSync(outputPath).size,
        sha256: sha256(outputPath),
      },
      engine: { name: 'ffmpeg', version: media.ffmpegVersion(), filters: built.filterFile ? 'filter_complex_script' : null },
      verification: hasMock ? 'mock-unverified' : 'verified',
      verificationLabel: hasMock ? 'Mock — unverified' : 'verified',
      sources,
      timeline: {
        width: timeline.width,
        height: timeline.height,
        fps: timeline.fps,
        tracks: timeline.tracks.map((t) => ({ id: t.id, type: t.type, name: t.name, clips: t.clips.length })),
      },
    };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    return { manifest, probe, built };
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

class ExportService {
  constructor({ db, assets, settings, outDir, onEvent = () => {}, appVersion = '0.1.0' }) {
    this.db = db;
    this.assets = assets;
    this.settings = settings;
    this.outDir = outDir;
    this.onEvent = onEvent;
    this.appVersion = appVersion;
    this.controllers = new Map();
    fs.mkdirSync(outDir, { recursive: true });
  }

  dto(row) {
    if (!row) return null;
    return {
      ...row,
      manifest: row.manifest_path && fs.existsSync(row.manifest_path) ? safeParse(fs.readFileSync(row.manifest_path, 'utf8'), null) : null,
      fileUrl: row.output_path && fs.existsSync(row.output_path) ? `oasis-file://export/${row.id}` : null,
    };
  }

  list(projectId) {
    return this.db.all('SELECT * FROM exports WHERE project_id = ? ORDER BY created_at DESC LIMIT 100', [projectId]).map((r) => this.dto(r));
  }

  get(id) {
    return this.dto(this.db.get('SELECT * FROM exports WHERE id = ?', [id]));
  }

  create({ projectId, timelineId, timeline, name = 'export', settings = null }) {
    if (!projectId) throw new Error('projectId is required');
    if (!timeline) throw new Error('timeline is required');
    const id = `exp_${crypto.randomUUID()}`;
    const now = nowIso();
    const outputPath = path.join(this.outDir, `${projectId}`, `${slug(name)}-${id.slice(4, 10)}.mp4`);
    const manifestPath = outputPath.replace(/\.mp4$/, '.manifest.json');
    this.db.tx(() =>
      this.db.run(
        'INSERT INTO exports (id, project_id, timeline_id, status, progress, format, output_path, manifest_path, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [id, projectId, timelineId || 'adhoc', 'queued', 0, 'mp4', outputPath, manifestPath, now, now],
      ),
    );
    this.onEvent({ type: 'export:update', export: this.get(id) });
    const renderTimeline = settings ? applyRenderSettings(timeline, settings) : timeline;
    this._run(id, { projectId, timelineId, timeline: renderTimeline }).catch(() => {});
    return this.get(id);
  }

  async _run(id, { projectId, timelineId, timeline }) {
    const row = this.db.get('SELECT * FROM exports WHERE id = ?', [id]);
    if (!row) return;
    const ctrl = new AbortController();
    this.controllers.set(id, ctrl);
    this._update(id, { status: 'running', progress: 0.02 });
    try {
      const { manifest } = await renderExport({
        timeline,
        assets: this.assets,
        outputPath: row.output_path,
        manifestPath: row.manifest_path,
        projectId,
        timelineId,
        exportId: id,
        appVersion: this.appVersion,
        signal: ctrl.signal,
        onProgress: (p) => this._update(id, { progress: Math.min(0.98, 0.05 + p * 0.9) }),
      });
      // Register the export in Asset Studio (provenance preserved).
      let assetId = null;
      try {
        const asset = this.assets.createFromBuffer(fs.readFileSync(row.output_path), {
          projectId,
          ext: 'mp4',
          mediaType: 'video',
          sourceWorkspace: 'video-studio',
          displayName: `Export ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
          provider: 'local',
          model: 'ffmpeg/libx264',
          verification: manifest.verification,
          executionMode: 'local',
          tags: ['export', 'video-studio'],
          metadata: { exportId: id, manifest: row.manifest_path, timelineId },
        });
        assetId = asset.id;
      } catch (err) {
        this.settings.log('warn', 'export', `export asset registration failed: ${err.message}`);
      }
      this._update(id, { status: 'succeeded', progress: 1, error: null });
      this.settings.log('info', 'export', `export ${id} succeeded`, { output: row.output_path, verification: manifest.verification, assetId });
    } catch (err) {
      const cancelled = err.cancelled;
      this._update(id, { status: cancelled ? 'cancelled' : 'failed', error: String(err.message).slice(0, 1000) });
      this.settings.log(cancelled ? 'warn' : 'error', 'export', `export ${id} ${cancelled ? 'cancelled' : 'failed'}: ${err.message}`);
    } finally {
      this.controllers.delete(id);
    }
  }

  _update(id, patch) {
    const sets = [];
    const params = [];
    for (const [k, v] of Object.entries(patch)) {
      sets.push(`${k} = ?`);
      params.push(v);
    }
    sets.push('updated_at = ?');
    params.push(nowIso(), id);
    this.db.run(`UPDATE exports SET ${sets.join(', ')} WHERE id = ?`, params);
    this.db.schedulePersist();
    this.onEvent({ type: 'export:update', export: this.get(id) });
  }

  cancel(id) {
    const ctrl = this.controllers.get(id);
    if (ctrl) ctrl.abort();
    return true;
  }

  /** Remove an export record. The rendered file is kept on disk unless purge is set. */
  remove(id, { purge = false } = {}) {
    const row = this.db.get('SELECT * FROM exports WHERE id = ?', [id]);
    if (!row) return false;
    this.db.tx(() => this.db.run('DELETE FROM exports WHERE id = ?', [id]));
    if (purge) {
      for (const f of [row.output_path, row.manifest_path]) {
        if (f && f.startsWith(this.outDir)) { try { fs.unlinkSync(f); } catch { /* best effort */ } }
      }
    }
    this.onEvent({ type: 'exports:changed' });
    return true;
  }
}

/** Clamp user render settings and apply them to a timeline copy. */
function applyRenderSettings(timeline, settings) {
  const even = (n) => Math.max(2, Math.round(Number(n) / 2) * 2);
  const out = { ...timeline };
  if (settings.width) out.width = Math.min(3840, Math.max(256, even(settings.width)));
  if (settings.height) out.height = Math.min(2160, Math.max(144, even(settings.height)));
  if (settings.fps) out.fps = Math.min(60, Math.max(12, Math.round(Number(settings.fps))));
  if (settings.crf) out.crf = Math.min(32, Math.max(14, Math.round(Number(settings.crf))));
  return out;
}

function slug(s) {
  return String(s || 'export')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32) || 'export';
}

function safeParse(s, fallback) {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}

module.exports = { ExportService, renderExport, buildRender };
