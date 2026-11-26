// Seeds a timeline with a clip, then asserts the pro inspector sliders in the packaged app.
const port = process.env.CDP_PORT || '9334';
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

const seeded = await ev(`(async () => {
  const api = window.oasis;
  const ps = await api.projects.list();
  const pid = (ps[0] || {}).id;
  if (!pid) return 'no project';
  const tl = await api.timelines.save({
    projectId: pid,
    name: 'Clip inspector check',
    data: {
      width: 1280, height: 720, fps: 30,
      tracks: [
        { id: 't1', type: 'text', name: 'Titles', clips: [{ id: 'c1', text: 'Inspector check', start: 0, duration: 4, fontSize: 56, x: 0.5, y: 0.5 }] },
      ],
    },
  });
  sessionStorage.setItem('oasis.timelineId', tl.id);
  return JSON.stringify({ timelineId: tl.id });
})()`);
console.log('SEED', seeded);

await ev('location.reload()');
await sleep(3500);
await ev(`(() => { const el = [...document.querySelectorAll('.nav-item')].find(n => n.textContent.trim().startsWith('Video Studio')); if (el) el.click(); return !!el; })()`);
await sleep(1500);

const out = {};
out.clips = await ev(`document.querySelectorAll('.clip').length`);
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
    await new Promise((r) => setTimeout(r, 150));
    return el.value;
  };
  return {
    opacity: await set('Opacity', 0.42),
    exposure: await set('Exposure', 0.12),
    scale: await set('Scale', 1.25),
    fade: await set('Audio fade', 1.2),
  };
})()`);
// Read the persisted timeline back to prove the values were stored, not just shown.
out.persisted = await ev(`(async () => {
  const api = window.oasis;
  const ps = await api.projects.list();
  const tls = await api.timelines.list((ps[0] || {}).id);
  const tl = (tls || []).find((t) => t.name === 'Clip inspector check') || {};
  const c = ((tl.data || {}).tracks || [])[0]?.clips?.[0] || {};
  return JSON.stringify({ opacity: c.opacity, brightness: c.brightness, scale: c.scale, audioFade: c.audioFade });
})()`);
console.log(JSON.stringify(out, null, 2));
ws.close();
