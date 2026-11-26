'use strict';
// Video Studio timeline persistence.
const crypto = require('node:crypto');
const { nowIso } = require('./db.cjs');

function defaultTimeline() {
  return {
    version: 1,
    width: 1280,
    height: 720,
    fps: 30,
    tracks: [
      { id: 'v1', type: 'video', name: 'Video 1', clips: [] },
      { id: 't1', type: 'text', name: 'Titles', clips: [] },
      { id: 'a1', type: 'audio', name: 'Audio 1', clips: [] },
    ],
  };
}

function normalize(data) {
  const base = defaultTimeline();
  const tl = { ...base, ...(data || {}) };
  tl.width = Math.max(256, Math.min(3840, Number(tl.width) || 1280));
  tl.height = Math.max(144, Math.min(2160, Number(tl.height) || 720));
  tl.fps = Math.max(12, Math.min(60, Number(tl.fps) || 30));
  tl.tracks = (Array.isArray(tl.tracks) ? tl.tracks : base.tracks).map((t, i) => ({
    id: t.id || `track${i}`,
    type: ['video', 'audio', 'text'].includes(t.type) ? t.type : 'video',
    name: t.name || `Track ${i + 1}`,
    muted: !!t.muted,
    locked: !!t.locked,
    clips: (Array.isArray(t.clips) ? t.clips : []).map((c) => ({
      id: c.id || `clip_${crypto.randomUUID().slice(0, 8)}`,
      assetId: c.assetId || null,
      start: Math.max(0, Number(c.start) || 0),
      duration: Math.max(0.1, Number(c.duration) || 1),
      inPoint: Math.max(0, Number(c.inPoint) || 0),
      volume: c.volume === undefined ? 1 : Math.max(0, Math.min(2, Number(c.volume))),
      fit: c.fit === 'contain' ? 'contain' : 'cover',
      transition: c.transition === 'fade' ? 'fade' : 'none',
      ...(t.type === 'text'
        ? {
            text: String(c.text || 'Title'),
            fontSize: Math.max(8, Math.min(200, Number(c.fontSize) || 48)),
            color: /^#[0-9a-f]{6}$/i.test(c.color || '') ? c.color : '#ffffff',
            x: c.x === undefined ? 0.5 : Number(c.x),
            y: c.y === undefined ? 0.82 : Number(c.y),
            box: c.box !== false,
          }
        : {}),
    })),
  }));
  return tl;
}

function duration(tl) {
  let end = 0;
  for (const t of tl.tracks) for (const c of t.clips) end = Math.max(end, c.start + c.duration);
  return Math.round(end * 1000) / 1000;
}

class TimelineService {
  constructor({ db, assets }) {
    this.db = db;
    this.assets = assets;
  }

  list(projectId) {
    return this.db.all('SELECT * FROM timelines WHERE project_id = ? ORDER BY updated_at DESC', [projectId]).map((r) => this.dto(r));
  }

  dto(row) {
    if (!row) return null;
    const data = safeParse(row.data, defaultTimeline());
    return { ...row, data, duration: duration(data), clipCount: data.tracks.reduce((n, t) => n + t.clips.length, 0) };
  }

  get(id) {
    return this.dto(this.db.get('SELECT * FROM timelines WHERE id = ?', [id]));
  }

  save({ id, projectId, name = 'Untitled edit', data }) {
    const normalized = normalize(data);
    const now = nowIso();
    if (id) {
      const existing = this.get(id);
      if (!existing) throw new Error('Timeline not found');
      this.db.tx(() =>
        this.db.run('UPDATE timelines SET name = ?, data = ?, updated_at = ? WHERE id = ?', [
          String(name || existing.name).slice(0, 120),
          JSON.stringify(normalized),
          now,
          id,
        ]),
      );
      return this.get(id);
    }
    if (!projectId) throw new Error('projectId is required');
    const newId = `tl_${crypto.randomUUID()}`;
    this.db.tx(() =>
      this.db.run('INSERT INTO timelines (id, project_id, name, data, created_at, updated_at) VALUES (?,?,?,?,?,?)', [
        newId,
        projectId,
        String(name || 'Untitled edit').slice(0, 120),
        JSON.stringify(normalized),
        now,
        now,
      ]),
    );
    return this.get(newId);
  }

  remove(id) {
    this.db.tx(() => this.db.run('DELETE FROM timelines WHERE id = ?', [id]));
    return true;
  }

  /** Validate that every referenced asset exists and is the right media type. */
  validate(tl) {
    const problems = [];
    for (const track of tl.tracks) {
      for (const clip of track.clips) {
        if (track.type === 'text') continue;
        if (!clip.assetId) {
          problems.push(`${track.name}: clip ${clip.id} has no asset`);
          continue;
        }
        const asset = this.assets.get(clip.assetId);
        if (!asset) {
          problems.push(`${track.name}: asset ${clip.assetId} is missing`);
          continue;
        }
        if (track.type === 'video' && asset.media_type !== 'video' && asset.media_type !== 'image') {
          problems.push(`${track.name}: ${asset.display_name} is not video or image`);
        }
        if (track.type === 'audio' && asset.media_type !== 'audio' && asset.media_type !== 'video') {
          problems.push(`${track.name}: ${asset.display_name} has no usable audio`);
        }
      }
    }
    return problems;
  }
}

function safeParse(s, fallback) {
  try {
    return JSON.parse(s || 'null') ?? fallback;
  } catch {
    return fallback;
  }
}

module.exports = { TimelineService, defaultTimeline, normalize, duration };
