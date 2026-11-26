// Imports a real PNG through IPC, attaches it to a timeline clip, then asserts the inspector controls.
const port = process.env.CDP_PORT || '9334';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.find((t) => t.type === 'page' && !String(t.url).startsWith('devtools'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
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

const keys = await ev(`Object.keys(window.oasis.assets)`);
console.log('ASSET API', JSON.stringify(keys));

const seed = await ev(`(async () => {
  const api = window.oasis;
  const ps = await api.projects.list();
  const pid = (ps[0] || {}).id;
  const p = 'C:/Users/Jagadeesh/Desktop/oasis/build/icon.png';
  let imported;
  try { imported = await api.assets.importPath({ projectId: pid, paths: [p] }); } catch (e) { imported = await api.assets.importPath({ projectId: pid, path: p }); }
  const assetId =
    (imported && imported.id) ||
    (Array.isArray(imported) ? (imported[0] && imported[0].id) : null) ||
    (imported && imported.assets && imported.assets[0] && imported.assets[0].id) ||
    null;
  if (!assetId) return JSON.stringify({ imported: imported && typeof imported, first: JSON.stringify(imported).slice(0, 200) });
  const tl = await api.timelines.save({
    projectId: pid, name: 'Media clip check',
    data: { width: 1280, height: 720, fps: 30, tracks: [
      { id: 'v1', type: 'video', name: 'Video 1', clips: [{ id: 'mc1', assetId, start: 0, duration: 3, inPoint: 0, fit: 'cover', transition: 'none', volume: 1 }] },
    ] },
  });
  sessionStorage.setItem('oasis.timelineId', tl.id);
  return JSON.stringify({ assetId, timelineId: tl.id });
})()`);
console.log('SEED', seed);

await ev('location.reload()');
await sleep(3500);
await ev(`(() => { const el = [...document.querySelectorAll('.nav-item')].find(n => n.textContent.trim().startsWith('Video Studio')); if (el) el.click(); return !!el; })()`);
await sleep(1600);

const out = { clips: await ev(`document.querySelectorAll('.clip').length`) };
await ev(`(() => { const c = document.querySelector('.clip'); if (c) c.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!c; })()`);
await sleep(800);
for (const label of ['Exposure', 'Contrast', 'Saturation', 'Hue', 'Opacity', 'Scale', 'Position X', 'Position Y', 'Audio fade']) {
  out[label] = await ev(`!!document.querySelector('input[aria-label=${JSON.stringify(label)}]')`);
}
out.writes = await ev(`(async () => {
  const set = async (label, value) => {
    const el = document.querySelector('input[aria-label="' + label + '"]');
    if (!el) return null;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, String(value));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 120));
    return el.value;
  };
  return { opacity: await set('Opacity', 0.42), exposure: await set('Exposure', 0.12), scale: await set('Scale', 1.25), fade: await set('Audio fade', 1.2) };
})()`);
console.log(JSON.stringify(out, null, 2));
ws.close();
