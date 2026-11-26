// Verifies the new professional controls + the local filter job over real IPC.
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
await ev('location.reload()');
await sleep(3200);

const out = {};
out.apiKeys = await ev('Object.keys(window.oasis || window.api || {})');

const nav = async (t) => {
  await ev(`(() => { const el = [...document.querySelectorAll('.nav-item')].find(n => n.textContent.trim().startsWith(${JSON.stringify(t)})); if (el) el.click(); return !!el; })()`);
  await sleep(800);
};

await nav('EffectsCraft');
out.filterOp = await ev(`document.body.innerText.includes('Colour & filter lab')`);

await nav('Video Studio');
out.clips = await ev(`document.querySelectorAll('.clip').length`);
await ev(`(() => { const c = document.querySelector('.clip'); if (c) { c.dispatchEvent(new MouseEvent('click', { bubbles: true })); } return !!c; })()`);
await sleep(600);
for (const label of ['Exposure', 'Contrast', 'Saturation', 'Hue', 'Opacity', 'Scale', 'Position X', 'Position Y', 'Audio fade']) {
  out[label] = await ev(`!!document.querySelector('input[aria-label=${JSON.stringify(label)}]')`);
}

// Move a slider and confirm the clip actually stores the value.
out.sliderWrite = await ev(`(async () => {
  const el = document.querySelector('input[aria-label="Opacity"]');
  if (!el) return 'no slider';
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, '0.45');
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 250));
  return el.value;
})()`);

// Real local-filter job through the app's own IPC.
out.job = await ev(`(async () => {
  const api = window.oasis || window.api;
  if (!api || !api.jobs) return 'no jobs api';
  const ps = await api.projects.list();
  const pid = (ps[0] || {}).id;
  if (!pid) return 'no project';
  const assets = await api.assets.list({ projectId: pid });
  const img = (assets || []).find((a) => a.media_type === 'image');
  if (!img) return 'no image asset';
  const job = await api.jobs.create({
    projectId: pid,
    workspace: 'effectscraft',
    task_type: 'image.filter',
    model: 'local/filter',
    params: { brightness: 0.08, contrast: 1.2, saturation: 1.3, sharpen: 1, vignette: true, grain: 8 },
    inputAssetIds: [img.id],
  });
  await new Promise((r) => setTimeout(r, 14000));
  const jl = await api.jobs.list({ projectId: pid });
  const j = (jl || []).find((x) => x.id === job.id) || {};
  const result = (j.result_asset_ids || [])[0];
  const derived = result ? await api.assets.get(result) : null;
  return JSON.stringify({
    status: j.status,
    error: j.error || null,
    result,
    verification: j.verification,
    executionMode: j.execution_mode,
    parent: derived && (derived.parent_asset_id || null),
    version: derived && derived.version,
    size: derived ? derived.width + 'x' + derived.height : null,
  });
})()`);

console.log(JSON.stringify(out, null, 2));
ws.close();
