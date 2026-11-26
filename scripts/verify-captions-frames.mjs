// Verifies captions import/export and the frame-accurate timebase in a real window.
const port = process.env.CDP_PORT || '9333';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.find((t) => t.type === 'page' && !String(t.url).startsWith('devtools'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
await new Promise((r) => ws.addEventListener('open', r));
const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
  return r.result?.result?.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rows = [];
const check = (n, exp, act, ok) => { rows.push({ n, exp, act, status: ok ? 'Pass' : 'Fail' }); console.log(`${ok ? 'PASS' : 'FAIL'} ${n} — ${act}`); };

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
await ev('location.reload()'); await sleep(3500);
await ev(`(() => { const el = [...document.querySelectorAll('.nav-item')].find(n => n.textContent.trim().startsWith('Video Studio')); if (el) el.click(); return !!el; })()`);
await sleep(1500);

const SRT = `1\n00:00:01,000 --> 00:00:03,000\nFirst caption line\n\n2\n00:00:03,500 --> 00:00:05,000\nSecond caption line`;

check('Captions button', 'present', (await ev(`[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Captions')`)) ? 'present' : 'missing', await ev(`[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Captions')`));
await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Captions'); b && b.click(); return !!b; })()`);
await sleep(500);
const ta = await ev(`!!document.querySelector('textarea[aria-label="Captions text"]')`);
check('Caption editor opens', 'textarea', ta ? 'textarea' : 'missing', ta);

await ev(`(() => { const t = document.querySelector('textarea[aria-label="Captions text"]'); const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set; set.call(t, ${JSON.stringify(SRT)}); t.dispatchEvent(new Event('input', { bubbles: true })); return t.value.length; })()`);
await sleep(300);
const before = await ev(`document.querySelectorAll('.clip').length`);
await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Import to timeline'); b && b.click(); return !!b; })()`);
await sleep(900);
const after = await ev(`document.querySelectorAll('.clip').length`);
check('Import places caption clips', 'clip count +2', `${before} → ${after}`, after >= before + 2);

await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Export SRT'); b && b.click(); return !!b; })()`);
await sleep(900);
const srtOut = await ev(`document.querySelector('textarea[aria-label="Captions text"]').value`);
check('Export SRT writes timestamps', 'contains -->', srtOut.includes('-->') ? srtOut.split('\n')[0].slice(0, 40) : 'no timing', srtOut.includes('-->'));

// frame-accurate timebase through IPC
const frames = await ev(`(async () => {
  const api = window.oasis;
  const pid = (await api.projects.list())[0].id;
  const tl = await api.timelines.save({
    projectId: pid, name: 'Frame timebase check',
    data: { width: 640, height: 360, fps: 30, tracks: [{ id: 'v1', type: 'video', name: 'V1', clips: [
      { id: 'f1', assetId: null, start: 0.0166, duration: 1.0006, inPoint: 0 },
    ] }] },
  });
  const back = (await api.timelines.list(pid)).find((t) => t.id === tl.id);
  const c = back.data.tracks[0].clips[0];
  return JSON.stringify({ start: c.start, startFrame: c.startFrame, duration: c.duration, durationFrames: c.durationFrames, fpsNum: back.data.fpsNum, fpsDen: back.data.fpsDen });
})()`);
const parsed = JSON.parse(frames);
check('Timebase stores integer frames', 'startFrame=0, durationFrames=30', `start=${parsed.start} frame=${parsed.startFrame} durFrames=${parsed.durationFrames}`, parsed.startFrame === 0 && parsed.durationFrames === 30);

const fail = rows.filter((r) => r.status === 'Fail');
console.log(`\n${rows.length - fail.length}/${rows.length} checks passed`);
ws.close();
process.exit(fail.length ? 1 : 0);
