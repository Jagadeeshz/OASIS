import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, Asset } from '../lib/api';
import { useApp } from '../lib/store';
import { Btn, Empty, Field, Modal } from '../components/ui';

/* ────────────────────────────── model ────────────────────────────── */

type LayerType = 'raster' | 'text' | 'fill' | 'adjust';
type AdjustKind = 'brightness' | 'hue' | 'bw' | 'levels';

type Layer = {
  id: string;
  name: string;
  type: LayerType;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blend: string;
  canvas?: HTMLCanvasElement;
  text?: string;
  font?: string;
  fontSize?: number;
  colour?: string;
  x?: number;
  y?: number;
  adjust?: AdjustKind;
  amount?: number;
  srcId?: string;
};

const BLENDS = [
  'source-over', 'multiply', 'screen', 'overlay', 'darken', 'lighten',
  'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference',
  'exclusion', 'hue', 'saturation', 'color', 'luminosity',
];

const FILTERS = [
  { id: 'blur', label: 'Gaussian blur' },
  { id: 'sharpen', label: 'Sharpen' },
  { id: 'noise', label: 'Add noise' },
  { id: 'pixelate', label: 'Pixelate' },
  { id: 'invert', label: 'Invert' },
  { id: 'sepia', label: 'Sepia' },
  { id: 'posterize', label: 'Posterize' },
  { id: 'vignette', label: 'Vignette' },
] as const;

const ADJUSTS: { id: AdjustKind; label: string }[] = [
  { id: 'brightness', label: 'Brightness / contrast' },
  { id: 'hue', label: 'Hue / saturation' },
  { id: 'bw', label: 'Black & white' },
  { id: 'levels', label: 'Levels' },
];

const TOOLS = [
  { id: 'move', label: 'Move', key: 'V' },
  { id: 'brush', label: 'Brush', key: 'B' },
  { id: 'eraser', label: 'Eraser', key: 'E' },
  { id: 'rect', label: 'Rectangle select', key: 'M' },
  { id: 'ellipse', label: 'Ellipse select', key: 'L' },
  { id: 'text', label: 'Type', key: 'T' },
  { id: 'picker', label: 'Eyedropper', key: 'I' },
  { id: 'crop', label: 'Crop', key: 'C' },
] as const;

type ToolId = (typeof TOOLS)[number]['id'];

const uid = (p = 'l') => `${p}_${Math.random().toString(36).slice(2, 9)}`;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const makeCanvas = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

/* ────────────────────────────── component ────────────────────────────── */

export default function PhotoCraftEditor() {
  const { projectId, assets, toast, refreshAssets, consumeHandoff } = useApp();

  const [w, setW] = useState(1280);
  const [h, setH] = useState(720);
  const [docName, setDocName] = useState('Untitled canvas');
  const [layers, setLayers] = useState<Layer[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tool, setTool] = useState<ToolId>('brush');
  const [colour, setColour] = useState('#FFD400');
  const [size, setSize] = useState(24);
  const [hardness, setHardness] = useState(0.8);
  const [zoom, setZoom] = useState(1);
  const [sel, setSel] = useState<{ x: number; y: number; w: number; h: number; ellipse?: boolean } | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [future, setFuture] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [newSize, setNewSize] = useState({ w: 1920, h: 1080 });
  const [textDraft, setTextDraft] = useState('');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ mode: 'draw' | 'sel' | 'pan' | 'crop' | null; sx: number; sy: number; lastX: number; lastY: number }>({
    mode: null, sx: 0, sy: 0, lastX: 0, lastY: 0,
  });

  const active = useMemo(() => layers.find((l) => l.id === activeId) || null, [layers, activeId]);

  /* ── document lifecycle ── */

  const blankLayer = (name: string, fill?: string): Layer => {
    const c = makeCanvas(w, h);
    if (fill) {
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = fill;
      ctx.fillRect(0, 0, w, h);
    }
    return { id: uid(), name, type: 'raster', visible: true, locked: false, opacity: 1, blend: 'source-over', canvas: c };
  };

  useEffect(() => {
    if (layers.length === 0) {
      const base = blankLayer('Background', '#ffffff');
      setLayers([base]);
      setActiveId(base.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // An asset handed off from Asset Studio becomes the base layer.
  useEffect(() => {
    const hd = consumeHandoff();
    if (hd?.assetId) addAssetAsLayer(hd.assetId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const snapshot = useCallback(() => {
    setHistory((prev) => {
      const copies = layers.filter((l) => l.canvas).map((l) => ({ id: l.id, data: l.canvas!.toDataURL() }));
      const next = [...prev, JSON.stringify({ w, h, layers: copies })];
      return next.slice(-12);
    });
    setFuture([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers, w, h]);

  const restore = (json: string, toHistory: string[]) => {
    const parsed = JSON.parse(json) as { w: number; h: number; layers: { id: string; data: string }[] };
    const imgs = parsed.layers.map((l) => ({ ...l, img: new Image() }));
    let pending = imgs.length;
    const apply = () => {
      setLayers((cur) =>
        cur.map((l) => {
          const found = imgs.find((i) => i.id === l.id);
          if (!found) return l;
          const c = makeCanvas(parsed.w, parsed.h);
          c.getContext('2d')!.drawImage(found.img, 0, 0);
          return { ...l, canvas: c };
        }),
      );
      setHistory(toHistory);
    };
    imgs.forEach((i) => {
      i.img.onload = () => {
        pending -= 1;
        if (pending === 0) apply();
      };
      i.img.src = i.data;
    });
    if (imgs.length === 0) apply();
  };

  const undo = () => {
    if (history.length === 0) return;
    const last = history[history.length - 1];
    setFuture((f) => [...f, JSON.stringify({ w, h, layers: layers.filter((l) => l.canvas).map((l) => ({ id: l.id, data: l.canvas!.toDataURL() })) })]);
    restore(last, history.slice(0, -1));
    toast('Undo', 'info');
  };

  const redo = () => {
    if (future.length === 0) return;
    const next = future[future.length - 1];
    setHistory((hh) => [...hh, JSON.stringify({ w, h, layers: layers.filter((l) => l.canvas).map((l) => ({ id: l.id, data: l.canvas!.toDataURL() })) })]);
    restore(next, history);
    setFuture((f) => f.slice(0, -1));
  };

  /* ── compositing ── */

  const composite = useCallback(
    (target?: HTMLCanvasElement) => {
      const out = target || canvasRef.current;
      if (!out) return;
      const ctx = out.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, out.width, out.height);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, out.width, out.height);

      for (const layer of layers) {
        if (!layer.visible || layer.opacity <= 0) continue;
        ctx.save();
        ctx.globalAlpha = layer.opacity;
        ctx.globalCompositeOperation = layer.blend as GlobalCompositeOperation;

        if (layer.type === 'adjust') {
          const snapshotCanvas = makeCanvas(out.width, out.height);
          snapshotCanvas.getContext('2d')!.drawImage(out, 0, 0);
          const tmp = makeCanvas(out.width, out.height);
          const tctx = tmp.getContext('2d')!;
          tctx.filter = adjustFilter(layer);
          tctx.drawImage(snapshotCanvas, 0, 0);
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = layer.opacity;
          ctx.drawImage(tmp, 0, 0);
        } else if (layer.type === 'text') {
          ctx.fillStyle = layer.colour || '#111111';
          ctx.font = `600 ${layer.fontSize || 64}px ${layer.font || 'DM Sans'}, Segoe UI, sans-serif`;
          ctx.textBaseline = 'top';
          const lines = String(layer.text || '').split('\n');
          lines.forEach((line, i) => ctx.fillText(line, layer.x || 40, (layer.y || 40) + i * (layer.fontSize || 64) * 1.25));
        } else if (layer.canvas) {
          ctx.drawImage(layer.canvas, 0, 0);
        }
        ctx.restore();
      }
    },
    [layers],
  );

  useEffect(() => {
    composite();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers, w, h]);

  /* ── layer ops ── */

  const patch = (id: string, fields: Partial<Layer>) => setLayers((ls) => ls.map((l) => (l.id === id ? { ...l, ...fields } : l)));

  const addRaster = (name = 'Layer') => {
    snapshot();
    const l = blankLayer(name);
    setLayers((ls) => [...ls, l]);
    setActiveId(l.id);
  };

  const addText = () => {
    snapshot();
    const l: Layer = {
      id: uid(), name: textDraft || 'Type layer', type: 'text', visible: true, locked: false,
      opacity: 1, blend: 'source-over', text: textDraft || 'Double-click to edit',
      font: 'DM Sans', fontSize: 72, colour, x: 80, y: 80,
    };
    setLayers((ls) => [...ls, l]);
    setActiveId(l.id);
    setTextDraft('');
  };

  const addFill = () => {
    snapshot();
    const l: Layer = { id: uid(), name: 'Fill', type: 'fill', visible: true, locked: false, opacity: 1, blend: 'source-over', colour, canvas: makeCanvas(w, h) };
    const c = l.canvas!.getContext('2d')!;
    c.fillStyle = colour;
    c.fillRect(0, 0, w, h);
    setLayers((ls) => [...ls, l]);
    setActiveId(l.id);
  };

  const addAdjust = (kind: AdjustKind) => {
    snapshot();
    const l: Layer = {
      id: uid(), name: ADJUSTS.find((a) => a.id === kind)!.label, type: 'adjust', visible: true,
      locked: false, opacity: 1, blend: 'source-over', adjust: kind, amount: kind === 'bw' ? 1 : 0.15,
    };
    setLayers((ls) => [...ls, l]);
    setActiveId(l.id);
  };

  const duplicate = (id: string) => {
    const src = layers.find((l) => l.id === id);
    if (!src) return;
    snapshot();
    let canvas: HTMLCanvasElement | undefined;
    if (src.canvas) {
      canvas = makeCanvas(w, h);
      canvas.getContext('2d')!.drawImage(src.canvas, 0, 0);
    }
    const copy: Layer = { ...src, id: uid(), name: `${src.name} copy`, canvas };
    setLayers((ls) => [...ls, copy]);
    setActiveId(copy.id);
  };

  const remove = (id: string) => {
    snapshot();
    setLayers((ls) => ls.filter((l) => l.id !== id));
    if (activeId === id) setActiveId(null);
  };

  const move = (id: string, dir: -1 | 1) => {
    setLayers((ls) => {
      const i = ls.findIndex((l) => l.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= ls.length) return ls;
      const next = [...ls];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  /* ── filters & adjustments ── */

  const runFilter = (kind: string) => {
    const layer = active;
    if (!layer?.canvas) return toast('Select a pixel layer first', 'warn');
    snapshot();
    const src = layer.canvas;
    const out = makeCanvas(w, h);
    const ctx = out.getContext('2d')!;
    const amount = Math.max(1, Math.round(size / 6));

    switch (kind) {
      case 'blur':
        ctx.filter = `blur(${amount}px)`;
        ctx.drawImage(src, 0, 0);
        break;
      case 'sharpen': {
        ctx.drawImage(src, 0, 0);
        const img = ctx.getImageData(0, 0, w, h);
        const d = img.data.slice();
        const k = [0, -1, 0, -1, 5 + amount * 0.2, -1, 0, -1, 0];
        for (let y = 1; y < h - 1; y++) {
          for (let x = 1; x < w - 1; x++) {
            const i = (y * w + x) * 4;
            for (let ch = 0; ch < 3; ch++) {
              let sum = 0;
              for (let ky = -1; ky <= 1; ky++) {
                for (let kx = -1; kx <= 1; kx++) {
                  sum += d[((y + ky) * w + (x + kx)) * 4 + ch] * k[(ky + 1) * 3 + (kx + 1)];
                }
              }
              img.data[i + ch] = clamp(sum, 0, 255);
            }
          }
        }
        ctx.putImageData(img, 0, 0);
        break;
      }
      case 'noise': {
        ctx.drawImage(src, 0, 0);
        const img = ctx.getImageData(0, 0, w, h);
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
          const n = (Math.random() - 0.5) * amount * 6;
          d[i] += n; d[i + 1] += n; d[i + 2] += n;
        }
        ctx.putImageData(img, 0, 0);
        break;
      }
      case 'pixelate': {
        const s = Math.max(2, amount);
        const small = makeCanvas(Math.ceil(w / s), Math.ceil(h / s));
        small.getContext('2d')!.drawImage(src, 0, 0, small.width, small.height);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(small, 0, 0, w, h);
        break;
      }
      case 'invert':
        ctx.filter = 'invert(1)';
        ctx.drawImage(src, 0, 0);
        break;
      case 'sepia':
        ctx.filter = 'sepia(0.9)';
        ctx.drawImage(src, 0, 0);
        break;
      case 'posterize': {
        ctx.drawImage(src, 0, 0);
        const img = ctx.getImageData(0, 0, w, h);
        const d = img.data;
        const steps = Math.max(2, 8 - Math.floor(amount / 4));
        for (let i = 0; i < d.length; i += 4) {
          d[i] = Math.round(d[i] / 255 * steps) / steps * 255;
          d[i + 1] = Math.round(d[i + 1] / 255 * steps) / steps * 255;
          d[i + 2] = Math.round(d[i + 2] / 255 * steps) / steps * 255;
        }
        ctx.putImageData(img, 0, 0);
        break;
      }
      case 'vignette': {
        ctx.drawImage(src, 0, 0);
        const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.75);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(0,0,0,0.75)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        break;
      }
      default:
        break;
    }
    patch(layer.id, { canvas: out });
    toast(`${FILTERS.find((f) => f.id === kind)?.label} applied`, 'success');
  };

  /* ── painting ── */

  const toDoc = (e: React.PointerEvent | React.MouseEvent) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * w, y: ((e.clientY - r.top) / r.height) * h };
  };

  const stroke = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    if (!active?.canvas || active.locked) return;
    const ctx = active.canvas.getContext('2d')!;
    ctx.save();
    ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.globalAlpha = 1;
    if (hardness >= 0.99) {
      ctx.strokeStyle = colour;
      ctx.lineWidth = size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    } else {
      const g = ctx.createRadialGradient(to.x, to.y, 0, to.x, to.y, size / 2);
      const c = tool === 'eraser' ? '0,0,0' : hexToRgb(colour);
      g.addColorStop(0, `rgba(${c},${hardness})`);
      g.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(to.x, to.y, size / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    composite();
  };

  const onDown = (e: React.PointerEvent) => {
    const p = toDoc(e);
    if (tool === 'picker') {
      const ctx = canvasRef.current!.getContext('2d')!;
      const d = ctx.getImageData(Math.round(p.x), Math.round(p.y), 1, 1).data;
      setColour(`#${[d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`);
      setTool('brush');
      return;
    }
    if (tool === 'rect' || tool === 'ellipse' || tool === 'crop') {
      drag.current = { mode: tool === 'crop' ? 'crop' : 'sel', sx: p.x, sy: p.y, lastX: p.x, lastY: p.y };
      setSel({ x: p.x, y: p.y, w: 0, h: 0, ellipse: tool === 'ellipse' });
      return;
    }
    if (tool === 'brush' || tool === 'eraser') {
      if (!active?.canvas) {
        toast('Add or select a pixel layer before painting', 'warn');
        return;
      }
      snapshot();
      drag.current = { mode: 'draw', sx: p.x, sy: p.y, lastX: p.x, lastY: p.y };
      stroke(p, p);
    }
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d.mode) return;
    const p = toDoc(e);
    if (d.mode === 'draw') {
      stroke({ x: d.lastX, y: d.lastY }, p);
      d.lastX = p.x;
      d.lastY = p.y;
    } else if (d.mode === 'sel' || d.mode === 'crop') {
      setSel({ x: Math.min(d.sx, p.x), y: Math.min(d.sy, p.y), w: Math.abs(p.x - d.sx), h: Math.abs(p.y - d.sy), ellipse: tool === 'ellipse' });
    }
  };

  const onUp = () => {
    if (drag.current.mode === 'crop' && sel && sel.w > 8 && sel.h > 8) {
      cropTo(sel);
    }
    drag.current.mode = null;
  };

  const cropTo = (r: { x: number; y: number; w: number; h: number }) => {
    snapshot();
    setW(Math.round(r.w));
    setH(Math.round(r.h));
    setLayers((ls) =>
      ls.map((l) => {
        if (l.type === 'text' || l.type === 'adjust') return l;
        const c = makeCanvas(Math.round(r.w), Math.round(r.h));
        if (l.canvas) c.getContext('2d')!.drawImage(l.canvas, -r.x, -r.y);
        return { ...l, canvas: c };
      }),
    );
    setSel(null);
    toast('Cropped', 'success');
  };

  const clearSelection = () => {
    if (!sel) return;
    const targets = layers.filter((l) => l.canvas && l.visible);
    snapshot();
    targets.forEach((l) => {
      const ctx = l.canvas!.getContext('2d')!;
      ctx.save();
      ctx.beginPath();
      if (sel.ellipse) ctx.ellipse(sel.x + sel.w / 2, sel.y + sel.h / 2, sel.w / 2, sel.h / 2, 0, 0, Math.PI * 2);
      else ctx.rect(sel.x, sel.y, sel.w, sel.h);
      ctx.clip();
      ctx.clearRect(0, 0, w, h);
      ctx.restore();
    });
    composite();
  };

  const fillSelection = () => {
    if (!active?.canvas) return toast('Select a pixel layer', 'warn');
    snapshot();
    const ctx = active.canvas.getContext('2d')!;
    ctx.save();
    if (sel) {
      ctx.beginPath();
      if (sel.ellipse) ctx.ellipse(sel.x + sel.w / 2, sel.y + sel.h / 2, sel.w / 2, sel.h / 2, 0, 0, Math.PI * 2);
      else ctx.rect(sel.x, sel.y, sel.w, sel.h);
      ctx.clip();
    }
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    composite();
  };

  /* ── io ── */

  const addAssetAsLayer = async (assetId: string) => {
    const asset = assets.find((a) => a.id === assetId) || (await api.assets.get(assetId));
    if (!asset) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = makeCanvas(w, h);
      const ctx = c.getContext('2d')!;
      const r = Math.min(w / img.width, h / img.height);
      ctx.drawImage(img, (w - img.width * r) / 2, (h - img.height * r) / 2, img.width * r, img.height * r);
      const l: Layer = { id: uid(), name: asset.filename || 'Imported', type: 'raster', visible: true, locked: false, opacity: 1, blend: 'source-over', canvas: c, srcId: asset.id };
      setLayers((ls) => [...ls, l]);
      setActiveId(l.id);
      toast('Layer added from Asset Studio', 'success');
    };
    img.src = (asset as any).fileUrl;
  };

  const exportPng = async () => {
    const out = makeCanvas(w, h);
    composite(out);
    const dataUrl = out.toDataURL('image/png');
    setSaving(true);
    try {
      const res = await api.assets.savePng(projectId, dataUrl, {
        name: docName,
        width: w,
        height: h,
        layers: layers.length,
        workspace: 'photocraft',
      });
      if (res?.id) {
        await refreshAssets();
        toast('Saved to Asset Studio', 'success');
      } else toast('Save failed', 'error');
    } catch (err: any) {
      toast(err?.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const newDoc = () => {
    setW(newSize.w);
    setH(newSize.h);
    const base = blankLayer('Background', '#ffffff');
    setLayers([base]);
    setActiveId(base.id);
    setSel(null);
    setHistory([]);
    setFuture([]);
    setNewOpen(false);
    toast(`New ${newSize.w}×${newSize.h} document`, 'success');
    // blankLayer closes over the old size; rebuild at the new size explicitly
    const c = makeCanvas(newSize.w, newSize.h);
    c.getContext('2d')!.fillStyle = '#ffffff';
    c.getContext('2d')!.fillRect(0, 0, newSize.w, newSize.h);
    setLayers([{ ...base, canvas: c }]);
  };

  const keys = useCallback(
    (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      const k = e.key.toUpperCase();
      const found = TOOLS.find((t) => t.key === k);
      if (found) setTool(found.id);
      if (e.key === 'Delete' && active) remove(active.id);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [history, future, active, layers],
  );

  useEffect(() => {
    window.addEventListener('keydown', keys);
    return () => window.removeEventListener('keydown', keys);
  }, [keys]);

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          className="input"
          style={{ maxWidth: 220 }}
          value={docName}
          aria-label="Document name"
          onChange={(e) => setDocName(e.target.value)}
        />
        <span className="tiny muted-2">{w} × {h}</span>
        <Btn size="sm" variant="ghost" onClick={() => setNewOpen(true)}>New</Btn>
        <Btn size="sm" variant="ghost" onClick={undo} disabled={!history.length}>Undo</Btn>
        <Btn size="sm" variant="ghost" onClick={redo} disabled={!future.length}>Redo</Btn>
        <span style={{ flex: 1 }} />
        <Btn size="sm" variant="ghost" onClick={() => addRaster()}>+ Layer</Btn>
        <Btn size="sm" variant="ghost" onClick={addFill}>+ Fill</Btn>
        <Btn size="sm" variant="ghost" onClick={() => setPicking(true)}>Open from assets</Btn>
        <Btn size="sm" variant="primary" onClick={exportPng} disabled={saving}>
          {saving ? 'Saving…' : 'Save to Asset Studio'}
        </Btn>
      </div>

      <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
        {/* tools */}
        <div className="panel" style={{ width: 56, padding: 6 }}>
          <div className="stack" style={{ gap: 4 }}>
            {TOOLS.map((t) => (
              <button
                key={t.id}
                className={`tool-btn${tool === t.id ? ' active' : ''}`}
                title={`${t.label} (${t.key})`}
                aria-label={t.label}
                aria-pressed={tool === t.id}
                onClick={() => setTool(t.id)}
              >
                {t.label.split(' ')[0].slice(0, 3)}
              </button>
            ))}
          </div>
        </div>

        {/* canvas */}
        <div className="panel" style={{ flex: 1, padding: 10, overflow: 'auto' }} ref={wrapRef}>
          <div className="row" style={{ gap: 8, marginBottom: 8 }}>
            <Field label="Colour"><input type="color" value={colour} aria-label="Colour" onChange={(e) => setColour(e.target.value)} /></Field>
            <Field label="Size">
              <input type="range" min={1} max={200} value={size} aria-label="Brush size" onChange={(e) => setSize(Number(e.target.value))} />
            </Field>
            <Field label="Hardness">
              <input type="range" min={0} max={1} step={0.05} value={hardness} aria-label="Brush hardness" onChange={(e) => setHardness(Number(e.target.value))} />
            </Field>
            <Field label="Zoom">
              <input type="range" min={0.25} max={3} step={0.05} value={zoom} aria-label="Zoom" onChange={(e) => setZoom(Number(e.target.value))} />
            </Field>
            <Btn size="sm" variant="ghost" onClick={() => setZoom(1)}>100%</Btn>
            {sel ? (
              <>
                <Btn size="sm" variant="ghost" onClick={() => setSel(null)}>Deselect</Btn>
                <Btn size="sm" variant="ghost" onClick={clearSelection}>Delete pixels</Btn>
                <Btn size="sm" variant="ghost" onClick={fillSelection}>Fill</Btn>
              </>
            ) : null}
          </div>

          <div style={{ position: 'relative', width: w * zoom, height: h * zoom, margin: '0 auto' }}>
            <canvas
              ref={canvasRef}
              width={w}
              height={h}
              aria-label="Canvas"
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerLeave={onUp}
              style={{ width: w * zoom, height: h * zoom, display: 'block', background: '#fff', cursor: 'crosshair', touchAction: 'none' }}
            />
            {sel ? (
              <div
                style={{
                  position: 'absolute',
                  left: sel.x * zoom,
                  top: sel.y * zoom,
                  width: sel.w * zoom,
                  height: sel.h * zoom,
                  border: '1px dashed var(--bindu-accent)',
                  borderRadius: sel.ellipse ? '50%' : 0,
                  pointerEvents: 'none',
                }}
              />
            ) : null}
          </div>
        </div>

        {/* right panels */}
        <div style={{ width: 300 }} className="stack">
          <div className="panel pad">
            <div className="tiny muted-2 mb-8">LAYERS</div>
            <div className="stack" style={{ gap: 4 }}>
              {[...layers].reverse().map((l) => (
                <div
                  key={l.id}
                  className={`layer-row${l.id === activeId ? ' active' : ''}`}
                  onClick={() => setActiveId(l.id)}
                >
                  <button
                    className="icon-btn"
                    aria-label={l.visible ? 'Hide layer' : 'Show layer'}
                    onClick={(e) => { e.stopPropagation(); patch(l.id, { visible: !l.visible }); }}
                  >
                    {l.visible ? '◉' : '○'}
                  </button>
                  <span style={{ flex: 1, fontSize: 12, opacity: l.visible ? 1 : 0.5 }}>{l.name}</span>
                  <span className="tiny muted-2">{l.type}</span>
                  <button
                    className="icon-btn"
                    aria-label={l.locked ? 'Unlock layer' : 'Lock layer'}
                    onClick={(e) => { e.stopPropagation(); patch(l.id, { locked: !l.locked }); }}
                  >
                    {l.locked ? '🔒' : '🔓'}
                  </button>
                </div>
              ))}
            </div>
            <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
              <Btn size="sm" variant="ghost" onClick={() => active && duplicate(active.id)} disabled={!active}>Duplicate</Btn>
              <Btn size="sm" variant="ghost" onClick={() => active && move(active.id, 1)} disabled={!active}>Up</Btn>
              <Btn size="sm" variant="ghost" onClick={() => active && move(active.id, -1)} disabled={!active}>Down</Btn>
              <Btn size="sm" variant="ghost" onClick={() => active && remove(active.id)} disabled={!active}>Delete</Btn>
            </div>
          </div>

          {active ? (
            <div className="panel pad">
              <div className="tiny muted-2 mb-8">LAYER PROPERTIES</div>
              <Field label="Name">
                <input className="input" value={active.name} aria-label="Layer name" onChange={(e) => patch(active.id, { name: e.target.value })} />
              </Field>
              <Field label={`Opacity ${Math.round(active.opacity * 100)}%`}>
                <input type="range" min={0} max={1} step={0.01} value={active.opacity} aria-label="Layer opacity" onChange={(e) => patch(active.id, { opacity: Number(e.target.value) })} />
              </Field>
              <Field label="Blend mode">
                <select className="select" value={active.blend} aria-label="Blend mode" onChange={(e) => patch(active.id, { blend: e.target.value })}>
                  {BLENDS.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </Field>

              {active.type === 'text' ? (
                <>
                  <Field label="Text">
                    <textarea className="input" rows={2} value={active.text} aria-label="Layer text" onChange={(e) => patch(active.id, { text: e.target.value })} />
                  </Field>
                  <Field label="Size">
                    <input type="range" min={8} max={240} value={active.fontSize} aria-label="Font size" onChange={(e) => patch(active.id, { fontSize: Number(e.target.value) })} />
                  </Field>
                  <Field label="Colour">
                    <input type="color" value={active.colour || '#111111'} aria-label="Text colour" onChange={(e) => patch(active.id, { colour: e.target.value })} />
                  </Field>
                </>
              ) : null}

              {active.type === 'adjust' ? (
                <Field label={`${active.adjust} ${(active.amount ?? 0).toFixed(2)}`}>
                  <input type="range" min={-1} max={1} step={0.01} value={active.amount} aria-label="Adjustment amount" onChange={(e) => patch(active.id, { amount: Number(e.target.value) })} />
                </Field>
              ) : null}

              {active.canvas ? (
                <>
                  <div className="tiny muted-2 mt-12 mb-8">FILTERS (destructive)</div>
                  <div className="row wrap" style={{ gap: 6 }}>
                    {FILTERS.map((f) => (
                      <Btn key={f.id} size="sm" variant="ghost" onClick={() => runFilter(f.id)}>{f.label}</Btn>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

          <div className="panel pad">
            <div className="tiny muted-2 mb-8">ADJUSTMENT LAYERS</div>
            <div className="row wrap" style={{ gap: 6 }}>
              {ADJUSTS.map((a) => (
                <Btn key={a.id} size="sm" variant="ghost" onClick={() => addAdjust(a.id)}>{a.label}</Btn>
              ))}
            </div>
            <div className="tiny muted-2 mt-8">
              Adjustment layers are non-destructive: they re-evaluate on every compositing pass and never alter the pixels below.
            </div>
          </div>

          <div className="panel pad">
            <div className="tiny muted-2 mb-8">TYPE</div>
            <Field label="New text layer">
              <input className="input" value={textDraft} placeholder="Type something" aria-label="New text" onChange={(e) => setTextDraft(e.target.value)} />
            </Field>
            <Btn size="sm" variant="ghost" onClick={addText} disabled={!textDraft.trim()}>Add type layer</Btn>
          </div>
        </div>
      </div>

      <Modal open={newOpen} title="New document" onClose={() => setNewOpen(false)}>
        <div className="row" style={{ gap: 10 }}>
          <Field label="Width">
            <input className="input" type="number" value={newSize.w} onChange={(e) => setNewSize({ ...newSize, w: Number(e.target.value) })} />
          </Field>
          <Field label="Height">
            <input className="input" type="number" value={newSize.h} onChange={(e) => setNewSize({ ...newSize, h: Number(e.target.value) })} />
          </Field>
        </div>
        <div className="row" style={{ gap: 8, marginTop: 12 }}>
          <Btn variant="primary" onClick={newDoc}>Create</Btn>
          <Btn variant="ghost" onClick={() => setNewOpen(false)}>Cancel</Btn>
        </div>
      </Modal>

      <Modal open={picking} title="Open from Asset Studio" onClose={() => setPicking(false)} width={760}>
        {assets.length === 0 ? (
          <Empty title="No assets yet" hint="Generate an image or import a file first." />
        ) : (
          <div className="asset-grid">
            {assets.slice(0, 24).map((a: Asset) => (
              <button
                key={a.id}
                className="asset-card"
                onClick={() => { setPicking(false); addAssetAsLayer(a.id); }}
              >
                <img src={a.fileUrl} alt={a.filename} />
                <span className="tiny">{a.filename}</span>
              </button>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ── helpers ── */

function adjustFilter(l: Layer): string {
  const a = Number(l.amount ?? 0);
  switch (l.adjust) {
    case 'brightness':
      return `brightness(${clamp(1 + a, 0, 3)}) contrast(${clamp(1 + a, 0, 3)})`;
    case 'hue':
      return `hue-rotate(${Math.round(a * 180)}deg) saturate(${clamp(1 + a, 0, 3)})`;
    case 'bw':
      return `grayscale(${clamp(a, 0, 1)})`;
    case 'levels':
      return `contrast(${clamp(1 + a * 2, 0, 4)})`;
    default:
      return 'none';
  }
}

function hexToRgb(hex: string): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return '255,212,0';
  return `${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)}`;
}
