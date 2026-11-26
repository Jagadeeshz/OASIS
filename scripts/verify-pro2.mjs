// End-to-end proof of the pro clip controls + the local filter job.
const port = process.env.CDP_PORT || '9333';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.find((t) => t.type === 'page' && !String(t.url).startsWith('devtools'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
});
await new Promise((r) => ws.addEventListener('open', r));
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const mid = ++id;
    pending.set(mid, resolve);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
  return r.result?.result?.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 940, deviceScaleFactor: 1, mobile: false });

const seed = await ev(`(async () => {
  const api = window.oasis;
  const ps = await api.projects.list();
  const pid = (ps[0] || {}).id;
  const job = await api.jobs.create({
    projectId: pid, workspace: 'photocraft', task_type: 'image.generate',
    model: 'fal-ai/flux/schnell', params: { prompt: 'colour test card', num_images: 1 }, inputAssetIds: [],
  });
  let assetId = null;
  for (let i = 0; i < 40 && !assetId; i++) {
    await new Promise((r) => setTimeout(r, 700));
    const jl = await api.jobs.list({ projectId: pid });
    const j = (jl || []).find((x) => x.id === job.id);
    if (j && ['succeeded','mock'].includes(j.status)) assetId = (j.result_asset_ids || [])[0];
    if (j && (j.status === 'failed' || j.status === 'cancelled')) return JSON.stringify({ stage: 'generate', status: j.status, error: j.error });
  }
  if (!assetId) return JSON.stringify({ stage: 'generate', status: 'timeout' });

  const filter = await api.jobs.create({
    projectId: pid, workspace: 'effectscraft', task_type: 'image.filter',
    model: 'local/filter',
    params: { brightness: 0.08, contrast: 1.25, saturation: 1.3, hue: 12, sharpen: 1, vignette: true, grain: 6 },
    inputAssetIds: [assetId],
  });
  let filtered = null;
  for (let i = 0; i < 40 && !filtered; i++) {
    await new Promise((r) => setTimeout(r, 700));
    const jl = await api.jobs.list({ projectId: pid });
    const j = (jl || []).find((x) => x.id === filter.id);
    if (j && ['succeeded','mock'].includes(j.status)) filtered = j;
    if (j && (j.status === 'failed' || j.status === 'cancelled')) return JSON.stringify({ stage: 'filter', status: j.status, error: j.error });
  }
  if (!filtered) return JSON.stringify({ stage: 'filter', status: 'timeout' });
  const out = (filtered.result_asset_ids || [])[0];
  const derived = await api.assets.get(out);

  const tl = await api.timelines.save({
    projectId: pid,
    name: 'Pro controls check',
    data: {
      width: 1280, height: 720, fps: 30,
      tracks: [
        { id: 'v1', type: 'video', name: 'Video 1', clips: [{ id: 'clip1', assetId, start: 0, duration: 3, inPoint: 0, fit: 'cover', transition: 'none', volume: 1 }] },
        { id: 'a1', type: 'audio', name: 'Audio 1', clips: [] },
      ],
    },
  });

  return JSON.stringify({
    stage: 'ok', assetId, filterStatus: filtered.status,
    result: out, parent: derived && derived.parent_asset_id, version: derived && derived.version,
    size: derived ? derived.width + 'x' + derived.height : null,
    verification: filtered.verification, executionMode: filtered.execution_mode,
    timelineId: tl.id,
  });
})()`);
console.log('SEED', seed);

await ev('location.reload()');
await sleep(3500);
await ev(`(() => { const el = [...document.querySelectorAll('.nav-item')].find(n => n.textContent.trim().startsWith('Video Studio')); if (el) el.click(); return !!el; })()`);
await sleep(1200);
const ui = {};
ui.clips = await ev(`document.querySelectorAll('.clip').length`);
await ev(`(() => { const c = document.querySelector('.clip'); if (c) c.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!c; })()`);
await sleep(700);
for (const label of ['Exposure', 'Contrast', 'Saturation', 'Hue', 'Opacity', 'Scale', 'Position X', 'Position Y', 'Audio fade']) {
  ui[label] = await ev(`!!document.querySelector('input[aria-label=${JSON.stringify(label)}]')`);
}
ui.opacityWrite = await ev(`(async () => {
  const el = document.querySelector('input[aria-label="Opacity"]');
  if (!el) return 'no slider';
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, '0.45');
  el.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 300));
  return el.value;
})()`);
console.log('UI', JSON.stringify(ui, null, 2));
ws.close();
