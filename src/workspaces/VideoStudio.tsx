import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, Asset, TimelineData, TimelineTrack, fmtDuration } from '../lib/api';
import { useApp } from '../lib/store';
import { AssetThumb, Badge, Btn, Empty, Field, MockBadge, Progress, Spinner } from '../components/ui';

const DEFAULT: TimelineData = {
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

const newId = () => `c_${Math.random().toString(36).slice(2, 8)}`;

// Canvas painting needs literal colours; resolve them from the theme once.
const tokenCache = new Map<string, string>();
const cssToken = (name: string, fallback: string) => {
  const hit = tokenCache.get(name);
  if (hit) return hit;
  let value = '';
  try {
    value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  } catch {
    value = '';
  }
  const out = value || fallback;
  tokenCache.set(name, out);
  return out;
};

export default function VideoStudio() {
  const { projectId, assets, toast, consumeHandoff, refreshAssets, assetsRev, sendAsset } = useApp();
  const [timelines, setTimelines] = useState<any[]>([]);
  const [timelineId, setTimelineId] = useState<string | null>(null);
  const [name, setName] = useState('Untitled edit');
  const [data, setData] = useState<TimelineData>(DEFAULT);
  const [selected, setSelected] = useState<{ trackId: string; clipId: string } | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [pxPerSec, setPxPerSec] = useState(64);
  const [exportRec, setExportRec] = useState<any>(null);
  const [exporting, setExporting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [binFilter, setBinFilter] = useState<'all' | 'video' | 'image' | 'audio'>('all');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaRef = useRef<Map<string, HTMLImageElement | HTMLVideoElement>>(new Map());
  const rafRef = useRef<number>(0);

  const duration = useMemo(() => {
    let end = 0;
    for (const t of data.tracks) for (const c of t.clips) end = Math.max(end, c.start + c.duration);
    return Math.max(0, end);
  }, [data]);

  const clip = useMemo(() => {
    if (!selected) return null;
    const track = data.tracks.find((t) => t.id === selected.trackId);
    const c = track?.clips.find((x) => x.id === selected.clipId);
    return track && c ? { track, clip: c } : null;
  }, [selected, data]);

  const loadTimelines = useCallback(async () => {
    const list = await api.timelines.list(projectId);
    setTimelines(list);
    return list;
  }, [projectId]);

  const applyTimeline = (tl: any) => {
    setTimelineId(tl.id);
    setName(tl.name);
    setData(tl.data);
    setDirty(false);
    setPlayhead(0);
  };

  useEffect(() => {
    (async () => {
      const list = await loadTimelines();
      const pending = sessionStorage.getItem('oasis.timelineId');
      sessionStorage.removeItem('oasis.timelineId');
      const found = pending ? list.find((t: any) => t.id === pending) : null;
      if (found) applyTimeline(found);
      else if (list[0]) applyTimeline(list[0]);
      else setData(DEFAULT);
    })().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    const h = consumeHandoff();
    if (h?.assetId) addAssetById(h.assetId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Media element cache for the preview compositor.
  useEffect(() => {
    const used = new Set<string>();
    for (const t of data.tracks) for (const c of t.clips) if (c.assetId) used.add(c.assetId);
    for (const [id, el] of mediaRef.current) {
      if (!used.has(id)) {
        if (el instanceof HTMLVideoElement) el.pause();
        mediaRef.current.delete(id);
      }
    }
    for (const id of used) {
      const asset = assets.find((a) => a.id === id);
      if (!asset || mediaRef.current.has(id)) continue;
      if (asset.media_type === 'image') {
        const img = new Image();
        img.src = asset.fileUrl;
        mediaRef.current.set(id, img);
      } else if (asset.media_type === 'video') {
        const v = document.createElement('video');
        v.src = asset.fileUrl;
        v.muted = true;
        v.preload = 'auto';
        v.playsInline = true;
        mediaRef.current.set(id, v);
      }
    }
    draw(playhead);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, assets, assetsRev]);

  const draw = (t: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    ctx.fillStyle = cssToken('--bindu-sunken', 'black');
    ctx.fillRect(0, 0, W, H);

    const tracks = data.tracks.filter((tr) => tr.type === 'video');
    for (const track of tracks) {
      for (const c of track.clips) {
        if (t < c.start - 0.001 || t > c.start + c.duration) continue;
        const media = c.assetId ? mediaRef.current.get(c.assetId) : null;
        if (!media) continue;
        const asset = assets.find((a) => a.id === c.assetId);
        try {
          if (media instanceof HTMLVideoElement) {
            const desired = c.inPoint + (t - c.start);
            if (Math.abs(media.currentTime - desired) > 0.34) media.currentTime = Math.max(0, desired);
            if (playing && media.paused) media.play().catch(() => {});
            if (!playing && !media.paused) media.pause();
            if (media.readyState >= 2) drawCover(ctx, media, W, H, asset, c.fit);
          } else if (media instanceof HTMLImageElement && media.complete) {
            drawCover(ctx, media, W, H, asset, c.fit);
          }
        } catch {
          /* frame not ready */
        }
      }
    }

    // Text overlays
    for (const track of data.tracks.filter((tr) => tr.type === 'text')) {
      for (const c of track.clips) {
        if (t < c.start || t > c.start + c.duration) continue;
        const scale = W / data.width;
        ctx.font = `600 ${Math.round((c.fontSize || 48) * scale)}px 'DM Sans', Segoe UI, sans-serif`;
        ctx.fillStyle = c.color || cssToken('--bindu-text-primary', 'white');
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const x = (c.x ?? 0.5) * W;
        const y = (c.y ?? 0.82) * H;
        if (c.box) {
          const m = ctx.measureText(c.text || '');
          const pad = 14 * scale;
          ctx.fillStyle = 'rgba(0,0,0,0.45)';
          ctx.fillRect(x - m.width / 2 - pad, y - (c.fontSize || 48) * scale * 0.65 - pad, m.width + pad * 2, (c.fontSize || 48) * scale * 1.3 + pad * 2);
          ctx.fillStyle = c.color || cssToken('--bindu-text-primary', 'white');
        }
        ctx.fillText(c.text || '', x, y);
      }
    }
  };

  useEffect(() => {
    if (!playing) {
      draw(playhead);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playhead, data, playing]);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setPlayhead((p) => {
        const next = p + dt;
        if (next >= duration) {
          setPlaying(false);
          return duration;
        }
        draw(next);
        return next;
      });
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, duration]);

  const patchClip = (trackId: string, clipId: string, patch: Record<string, any>) => {
    setData((d) => ({
      ...d,
      tracks: d.tracks.map((t) => (t.id === trackId ? { ...t, clips: t.clips.map((c) => (c.id === clipId ? { ...c, ...patch } : c)) } : t)),
    }));
    setDirty(true);
  };

  const addAssetById = async (assetId: string) => {
    try {
      const asset: Asset = await api.assets.get(assetId);
      addAsset(asset);
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  const addAsset = (asset: Asset) => {
    const targetType: 'video' | 'audio' = asset.media_type === 'audio' ? 'audio' : 'video';
    if (asset.media_type === 'image') {
      toast('Images can be used as still clips — adding to the video track', 'info');
    }
    setData((d) => {
      const track = d.tracks.find((t) => t.type === targetType);
      if (!track) return d;
      const start = track.clips.reduce((end, c) => Math.max(end, c.start + c.duration), 0);
      const dur = asset.media_type === 'image' ? 3 : Math.max(0.5, Math.min(asset.duration || 3, 30));
      return {
        ...d,
        tracks: d.tracks.map((t) =>
          t.id === track.id
            ? {
                ...t,
                clips: [
                  ...t.clips,
                  {
                    id: newId(),
                    assetId: asset.id,
                    start: Math.round(start * 100) / 100,
                    duration: Math.round(dur * 100) / 100,
                    inPoint: 0,
                    volume: 1,
                    fit: 'cover',
                    transition: 'none',
                  },
                ],
              }
            : t,
        ),
      };
    });
    setDirty(true);
    toast(`${asset.display_name} added to the timeline`, 'success');
  };

  const addText = () => {
    setData((d) => ({
      ...d,
      tracks: d.tracks.map((t) =>
        t.type === 'text'
          ? {
              ...t,
              clips: [
                ...t.clips,
                {
                  id: newId(),
                  assetId: null,
                  start: Math.round(playhead * 100) / 100,
                  duration: 3,
                  inPoint: 0,
                  volume: 1,
                  fit: 'cover',
                  transition: 'none',
                  text: 'Your title',
                  fontSize: 48,
                  color: cssToken('--bindu-text-primary', 'white'),
                  x: 0.5,
                  y: 0.82,
                  box: true,
                },
              ],
            }
          : t,
      ),
    }));
    setDirty(true);
  };

  const addTrack = (type: 'video' | 'audio' | 'text') => {
    setData((d) => {
      const count = d.tracks.filter((t) => t.type === type).length + 1;
      const id = type[0] + '_' + Math.random().toString(36).slice(2, 6);
      const name = type === 'video' ? 'Video ' + count : type === 'audio' ? 'Audio ' + count : 'Titles ' + count;
      return { ...d, tracks: [...d.tracks, { id, type, name, clips: [] }] };
    });
    setDirty(true);
    toast('Track added', 'success');
  };

  const duplicateClip = () => {
    if (!selected || !clip) return;
    const copy = { ...clip.clip, id: newId(), start: clip.clip.start + clip.clip.duration };
    setData((d) => ({
      ...d,
      tracks: d.tracks.map((t) => (t.id === selected.trackId ? { ...t, clips: [...t.clips, copy] } : t)),
    }));
    setSelected({ trackId: selected.trackId, clipId: copy.id });
    setDirty(true);
    toast('Clip duplicated', 'success');
  };

  const patchTrack = (trackId: string, patch: Record<string, any>) => {
    setData((d) => ({ ...d, tracks: d.tracks.map((t) => (t.id === trackId ? { ...t, ...patch } : t)) }));
    setDirty(true);
  };

  const removeSelected = () => {
    if (!selected) return;
    setData((d) => ({
      ...d,
      tracks: d.tracks.map((t) => (t.id === selected.trackId ? { ...t, clips: t.clips.filter((c) => c.id !== selected.clipId) } : t)),
    }));
    setSelected(null);
    setDirty(true);
  };

  const splitSelected = () => {
    if (!selected || !clip) return;
    const c = clip.clip;
    if (playhead <= c.start + 0.05 || playhead >= c.start + c.duration - 0.05) {
      toast('Move the playhead inside the clip to split it', 'warn');
      return;
    }
    const leftDur = playhead - c.start;
    const right = {
      ...c,
      id: newId(),
      start: playhead,
      duration: c.duration - leftDur,
      inPoint: c.inPoint + leftDur,
    };
    setData((d) => ({
      ...d,
      tracks: d.tracks.map((t) =>
        t.id === selected.trackId
          ? {
              ...t,
              clips: t.clips.flatMap((x) =>
                x.id === c.id ? [{ ...x, duration: Math.round(leftDur * 100) / 100 }, right] : [x],
              ),
            }
          : t,
      ),
    }));
    setDirty(true);
    toast('Clip split at playhead', 'success');
  };

  const startDrag = (e: React.PointerEvent, track: TimelineTrack, c: any, mode: 'move' | 'trimL' | 'trimR') => {
    e.stopPropagation();
    if ((track as any).locked) {
      toast('Track is locked — unlock it to edit', 'warn');
      return;
    }
    setSelected({ trackId: track.id, clipId: c.id });
    const startX = e.clientX;
    const orig = { start: c.start, duration: c.duration, inPoint: c.inPoint };
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / pxPerSec;
      if (mode === 'move') {
        patchClip(track.id, c.id, { start: Math.max(0, Math.round((orig.start + dx) * 100) / 100) });
      } else if (mode === 'trimL') {
        const delta = Math.max(-orig.start, Math.min(dx, orig.duration - 0.2));
        patchClip(track.id, c.id, {
          start: Math.round((orig.start + delta) * 100) / 100,
          duration: Math.round((orig.duration - delta) * 100) / 100,
          inPoint: Math.max(0, Math.round((orig.inPoint + delta) * 100) / 100),
        });
      } else {
        patchClip(track.id, c.id, { duration: Math.max(0.2, Math.round((orig.duration + dx) * 100) / 100) });
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const save = async () => {
    try {
      const saved = await api.timelines.save({ id: timelineId || undefined, projectId, name, data });
      setTimelineId(saved.id);
      setName(saved.name);
      setDirty(false);
      await loadTimelines();
      toast('Timeline saved', 'success');
      return saved;
    } catch (err: any) {
      toast(err.message, 'error');
      return null;
    }
  };

  const exportNow = async () => {
    if (!duration) return toast('Add at least one clip first', 'warn');
    setExporting(true);
    try {
      const saved = await save();
      if (!saved) return;
      const rec = await api.exports.create({ projectId, timelineId: saved.id, name: saved.name });
      setExportRec(rec);
      toast('Export started', 'info');
      const poll = setInterval(async () => {
        try {
          const cur = await api.exports.get(rec.id);
          setExportRec(cur);
          if (!['queued', 'running'].includes(cur.status)) {
            clearInterval(poll);
            setExporting(false);
            if (cur.status === 'succeeded') {
              toast('Export complete', 'success');
              await refreshAssets();
            } else if (cur.status === 'failed') toast(`Export failed: ${cur.error}`, 'error');
          }
        } catch {
          clearInterval(poll);
          setExporting(false);
        }
      }, 900);
    } catch (err: any) {
      toast(err.message, 'error');
      setExporting(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.code === 'Space') {
        e.preventDefault();
        setPlaying((p) => !p);
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selected) {
          e.preventDefault();
          removeSelected();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const bin = assets.filter((a) => (binFilter === 'all' ? a.media_type !== 'file' : a.media_type === binFilter));
  const timelineWidth = Math.max(duration + 6, 18) * pxPerSec;
  const exportManifest = exportRec?.manifest;

  const trackLabel = (t: TimelineTrack) => (t.type === 'video' ? '▣' : t.type === 'audio' ? '♪' : 'T');

  return (
    <div className="studio">
      <div className="bin panel">
        <div className="panel-head" style={{ padding: '10px 12px' }}>
          <strong className="small">Media bin</strong>
          <div className="spacer" />
          <Btn size="sm" variant="ghost" onClick={async () => { await api.assets.pickAndImport(projectId, 'video-studio'); await refreshAssets(); }}>
            Import
          </Btn>
        </div>
        <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--line)' }}>
          <select className="select" value={binFilter} onChange={(e) => setBinFilter(e.target.value as any)}>
            <option value="all">All media</option>
            <option value="video">Video</option>
            <option value="image">Images</option>
            <option value="audio">Audio</option>
          </select>
        </div>
        <div style={{ maxHeight: 260, overflow: 'auto' }}>
          {bin.length === 0 ? (
            <div className="small muted" style={{ padding: 14 }}>
              No media yet. Generate a clip in FilmCraft or import a file.
            </div>
          ) : (
            bin.map((a) => (
              <div key={a.id} className="row" style={{ padding: '7px 10px', borderBottom: '1px solid var(--line)', gap: 8 }}>
                <AssetThumb asset={a} size={38} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.display_name}</div>
                  <div className="tiny muted-2">
                    {a.media_type} · {a.duration ? fmtDuration(a.duration) : a.width ? `${a.width}×${a.height}` : ''}
                    {a.isMock ? ' · mock' : ''}
                  </div>
                </div>
                <Btn size="sm" variant="ghost" onClick={() => addAsset(a)}>
                  Add
                </Btn>
              </div>
            ))
          )}
        </div>
        <div style={{ padding: 10, borderTop: '1px solid var(--line)' }}>
          <div className="tiny muted-2 mb-8">PROJECTS</div>
          <select
            className="select mb-8"
            value={timelineId || ''}
            onChange={(e) => {
              const tl = timelines.find((t) => t.id === e.target.value);
              if (tl) applyTimeline(tl);
            }}
          >
            <option value="">New timeline…</option>
            {timelines.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.clipCount} clips)
              </option>
            ))}
          </select>
          <div className="row">
            <Btn size="sm" onClick={save}>
              Save
            </Btn>
            <Btn
              size="sm"
              variant="ghost"
              onClick={() => {
                setTimelineId(null);
                setName('Untitled edit');
                setData(DEFAULT);
                setDirty(false);
              }}
            >
              New
            </Btn>
          </div>
        </div>
      </div>

      <div className="viewport panel">
        <div className="panel-head" style={{ padding: '8px 12px' }}>
          <input className="input" style={{ maxWidth: 260 }} value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} />
          <Badge>{data.width}×{data.height} · {data.fps}fps</Badge>
          {dirty ? <Badge tone="warn">unsaved</Badge> : <Badge tone="ok">saved</Badge>}
          <div className="spacer" />
          <Btn size="sm" variant="primary" onClick={exportNow} disabled={exporting}>
            {exporting ? <Spinner /> : null} Export mp4
          </Btn>
        </div>
        <div className="stage-surface" style={{ padding: 12, display: 'flex', justifyContent: 'center', flex: 1, minHeight: 0 }}>
          <canvas
            ref={canvasRef}
            width={data.width}
            height={data.height}
            className="preview-canvas"
            style={{ maxWidth: '100%', maxHeight: '100%', aspectRatio: `${data.width}/${data.height}` }}
            onClick={() => setPlaying((p) => !p)}
          />
        </div>
        <div className="transport">
          <Btn size="sm" variant="ghost" onClick={() => { setPlayhead(0); setPlaying(false); }}>
            ⏮
          </Btn>
          <Btn size="sm" onClick={() => setPlaying((p) => !p)}>
            {playing ? 'Pause' : 'Play'}
          </Btn>
          <span className="mono small">{fmtDuration(playhead)} / {fmtDuration(duration)}</span>
          <input
            type="range"
            min={0}
            max={Math.max(duration, 1)}
            step={0.05}
            value={Math.min(playhead, duration)}
            onChange={(e) => { setPlaying(false); setPlayhead(Number(e.target.value)); }}
            style={{ flex: 1 }}
          />
          <span className="tiny muted-2">preview is a live composite · audio is included on export</span>
        </div>
        {exportRec ? (
          <div style={{ padding: '8px 12px', borderTop: '1px solid var(--line)' }}>
            <div className="row between mb-8">
              <span className="tiny">
                Export {exportRec.status}
                {exportManifest ? ` · ${exportManifest.verificationLabel}` : ''}
              </span>
              <div className="row" style={{ gap: 6 }}>
                {exportRec.status === 'succeeded' ? (
                  <Btn size="sm" variant="ghost" onClick={() => api.exports.reveal(exportRec.id)}>
                    Show file
                  </Btn>
                ) : null}
                {['queued', 'running'].includes(exportRec.status) ? (
                  <Btn size="sm" variant="ghost" onClick={() => api.exports.cancel(exportRec.id)}>
                    Cancel
                  </Btn>
                ) : null}
              </div>
            </div>
            <Progress value={exportRec.progress} tone={exportRec.status === 'failed' ? 'danger' : exportRec.status === 'succeeded' ? 'ok' : ''} />
            {exportRec.error ? <div className="tiny" style={{ color: 'var(--danger)', marginTop: 4 }}>{exportRec.error}</div> : null}
            {exportManifest ? (
              <div className="tiny muted-2 mt-8">
                {exportManifest.output.width}×{exportManifest.output.height} · {fmtDuration(exportManifest.output.durationSec)} ·{' '}
                {exportManifest.verification === 'mock-unverified' ? 'Mock — unverified sources' : 'verified sources'} · sha256{' '}
                {String(exportManifest.output.sha256).slice(0, 12)}…
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="timeline-panel panel">
        <div className="timeline-toolbar">
          <Btn size="sm" variant="ghost" onClick={addText} title="Add a title at the playhead">
            + Text
          </Btn>
          <Btn size="sm" variant="ghost" onClick={() => addTrack('video')} title="Add a video track">
            + Video
          </Btn>
          <Btn size="sm" variant="ghost" onClick={() => addTrack('audio')} title="Add an audio track">
            + Audio
          </Btn>
          <Btn size="sm" variant="ghost" onClick={splitSelected} disabled={!clip}>
            Split
          </Btn>
          <Btn size="sm" variant="ghost" onClick={duplicateClip} disabled={!clip} title="Duplicate the selected clip">
            Duplicate
          </Btn>
          <Btn size="sm" variant="ghost" onClick={removeSelected} disabled={!selected}>
            Delete clip
          </Btn>
          <div className="spacer" style={{ flex: 1 }} />
          <span className="tiny muted-2">{duration.toFixed(2)}s</span>
          <input type="range" min={24} max={160} value={pxPerSec} onChange={(e) => setPxPerSec(Number(e.target.value))} style={{ width: 100 }} />
        </div>
        <div className="timeline-scroll" onClick={() => setSelected(null)}>
          <div style={{ minWidth: timelineWidth + 110 }}>
            <div className="ruler" style={{ marginLeft: 104, width: timelineWidth, position: 'relative' }}>
              {Array.from({ length: Math.ceil((duration + 6) / 1) }, (_, i) => (
                <div key={i} className="tick" style={{ left: i * pxPerSec }}>
                  {i}s
                </div>
              ))}
            </div>
            {data.tracks.map((track) => (
              <div key={track.id} className="track">
                <div className="track-label">
                  <span>{trackLabel(track)} {track.name}</span>
                  <span className="tiny muted-2">{track.clips.length} clips</span>
                  <div className="row" style={{ gap: 4, marginTop: 2 }}>
                    <button
                      className="track-btn"
                      title={track.muted ? 'Unmute track' : 'Mute track (excluded from preview and export)'}
                      aria-label={track.muted ? 'Unmute track' : 'Mute track'}
                      onClick={(e) => { e.stopPropagation(); patchTrack(track.id, { muted: !(track as any).muted }); }}
                    >
                      {(track as any).muted ? '🔇' : '🔊'}
                    </button>
                    <button
                      className="track-btn"
                      title={track.locked ? 'Unlock track' : 'Lock track (prevents edits)'}
                      aria-label={track.locked ? 'Unlock track' : 'Lock track'}
                      onClick={(e) => { e.stopPropagation(); patchTrack(track.id, { locked: !(track as any).locked }); }}
                    >
                      {(track as any).locked ? '🔒' : '🔓'}
                    </button>
                  </div>
                </div>
                <div
                  className="track-lane grid-bg"
                  style={{ width: timelineWidth, backgroundSize: `${pxPerSec}px 100%` }}
                  onDoubleClick={(e) => {
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setPlayhead(Math.max(0, (e.clientX - rect.left) / pxPerSec));
                  }}
                >
                  {track.clips.map((c) => {
                    const asset = c.assetId ? assets.find((a) => a.id === c.assetId) : null;
                    const isSel = selected?.clipId === c.id;
                    return (
                      <div
                        key={c.id}
                        className={`clip ${track.type} ${isSel ? 'selected' : ''}`}
                        style={{ left: c.start * pxPerSec, width: Math.max(14, c.duration * pxPerSec) }}
                        onPointerDown={(e) => startDrag(e, track, c, 'move')}
                        title={`${asset?.display_name || c.text || 'clip'} · ${c.start.toFixed(2)}s → ${(c.start + c.duration).toFixed(2)}s`}
                      >
                        <div className="handle left" onPointerDown={(e) => startDrag(e, track, c, 'trimL')} />
                        <span className="clip-name">{track.type === 'text' ? c.text : asset?.display_name || 'clip'}</span>
                        {asset?.isMock ? <span className="mock-chip" style={{ padding: '0 4px', fontSize: 8 }}>MOCK</span> : null}
                        <div className="handle right" onPointerDown={(e) => startDrag(e, track, c, 'trimR')} />
                      </div>
                    );
                  })}
                  <div className="playhead" style={{ left: playhead * pxPerSec }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {clip ? (
        <div className="panel pad" style={{ position: 'fixed', right: 18, bottom: 292, width: 300, maxHeight: 380, overflow: 'auto', zIndex: 30 }}>
          <div className="row between mb-12">
            <strong className="small">Clip inspector</strong>
            <Badge>{clip.track.type}</Badge>
          </div>
          {clip.track.type === 'text' ? (
            <>
              <Field label="Text">
                <textarea className="textarea" rows={2} value={clip.clip.text || ''} onChange={(e) => patchClip(clip.track.id, clip.clip.id, { text: e.target.value })} />
              </Field>
              <div className="row">
                <Field label="Size">
                  <input className="input" type="number" value={clip.clip.fontSize || 48} onChange={(e) => patchClip(clip.track.id, clip.clip.id, { fontSize: Number(e.target.value) })} />
                </Field>
                <Field label="Colour">
                  <input className="input" type="color" value={clip.clip.color || cssToken('--bindu-text-primary', 'white')} onChange={(e) => patchClip(clip.track.id, clip.clip.id, { color: e.target.value })} />
                </Field>
              </div>
              <Field label="Vertical position">
                <input className="input" type="range" min={0.05} max={0.95} step={0.01} value={clip.clip.y ?? 0.82} onChange={(e) => patchClip(clip.track.id, clip.clip.id, { y: Number(e.target.value) })} />
              </Field>
            </>
          ) : (
            <>
              <div className="row">
                <Field label="Start (s)">
                  <input className="input" type="number" step={0.05} value={clip.clip.start} onChange={(e) => patchClip(clip.track.id, clip.clip.id, { start: Math.max(0, Number(e.target.value)) })} />
                </Field>
                <Field label="Duration (s)">
                  <input className="input" type="number" step={0.05} value={clip.clip.duration} onChange={(e) => patchClip(clip.track.id, clip.clip.id, { duration: Math.max(0.2, Number(e.target.value)) })} />
                </Field>
              </div>
              <Field label="In point (s)">
                <input className="input" type="number" step={0.05} value={clip.clip.inPoint} onChange={(e) => patchClip(clip.track.id, clip.clip.id, { inPoint: Math.max(0, Number(e.target.value)) })} />
              </Field>
              <Field label="Volume">
                <input className="input" type="range" min={0} max={2} step={0.05} value={clip.clip.volume} onChange={(e) => patchClip(clip.track.id, clip.clip.id, { volume: Number(e.target.value) })} />
              </Field>
              <Field label="Fit">
                <select className="select" value={clip.clip.fit} onChange={(e) => patchClip(clip.track.id, clip.clip.id, { fit: e.target.value })}>
                  <option value="cover">Cover (fill)</option>
                  <option value="contain">Contain (letterbox)</option>
                </select>
              </Field>
              <Field label="Transition">
                <select className="select" value={clip.clip.transition} onChange={(e) => patchClip(clip.track.id, clip.clip.id, { transition: e.target.value })}>
                  <option value="none">Hard cut</option>
                  <option value="fade">Fade in/out</option>
                </select>
              </Field>
            </>
          )}
          <div className="tiny muted-2">Drag the clip body to move it, or its edges to trim.</div>

          {clip.clip.assetId ? (
            <>
              <div className="tiny muted-2 mt-12 mb-8">SEND CLIP TO</div>
              <div className="row wrap">
                <Btn size="sm" variant="ghost" onClick={() => sendAsset(clip.clip.assetId!, 'effectscraft', 'video-studio')}>
                  EffectsCraft
                </Btn>
                {clip.track.type === 'video' && assets.find((a) => a.id === clip.clip.assetId)?.media_type === 'video' ? (
                  <Btn size="sm" variant="ghost" onClick={() => sendAsset(clip.clip.assetId!, 'filmcraft', 'video-studio')}>
                    FilmCraft
                  </Btn>
                ) : null}
                {assets.find((a) => a.id === clip.clip.assetId)?.media_type === 'image' ? (
                  <Btn size="sm" variant="ghost" onClick={() => sendAsset(clip.clip.assetId!, 'photocraft', 'video-studio')}>
                    PhotoCraft
                  </Btn>
                ) : null}
                <Btn size="sm" variant="ghost" onClick={() => sendAsset(clip.clip.assetId!, 'assets', 'video-studio')}>
                  Asset Studio
                </Btn>
              </div>
              <div className="tiny muted-2 mt-8">
                The original clip stays in the timeline; results come back as new Asset Studio versions.
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function drawCover(ctx: CanvasRenderingContext2D, media: HTMLImageElement | HTMLVideoElement, W: number, H: number, asset: Asset | undefined, fit: string) {
  const mw = (media as HTMLVideoElement).videoWidth || (media as HTMLImageElement).naturalWidth || asset?.width || W;
  const mh = (media as HTMLVideoElement).videoHeight || (media as HTMLImageElement).naturalHeight || asset?.height || H;
  if (!mw || !mh) return;
  if (fit === 'contain') {
    const scale = Math.min(W / mw, H / mh);
    const w = mw * scale;
    const h = mh * scale;
    ctx.drawImage(media, (W - w) / 2, (H - h) / 2, w, h);
  } else {
    const scale = Math.max(W / mw, H / mh);
    const w = mw * scale;
    const h = mh * scale;
    const sx = (w - W) / 2 / scale;
    const sy = (h - H) / 2 / scale;
    const sw = W / scale;
    const sh = H / scale;
    ctx.drawImage(media, sx, sy, sw, sh, 0, 0, W, H);
  }
}
