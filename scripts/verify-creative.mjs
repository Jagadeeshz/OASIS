// Proves the native PhotoCraft editor and the FilmCraft timeline tab work in a real window.
const port = process.env.CDP_PORT || '9333';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.find((t) => t.type === 'page' && !String(t.url).startsWith('devtools'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
await new Promise((r) => ws.addEventListener('open', r));
const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
  return r.result?.result?.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rows = [];
const check = (name, expected, actual, ok) => {
  rows.push({ name, expected, actual, status: ok ? 'Pass' : 'Fail' });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} — ${actual}`);
};

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
await ev('location.reload()');
await sleep(3500);

const nav = async (label) => {
  await ev(`(() => { const el = [...document.querySelectorAll('.nav-item')].find(n => n.textContent.trim().startsWith(${JSON.stringify(label)})); if (el) el.click(); return !!el; })()`);
  await sleep(900);
};
const clickText = (text) => ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === ${JSON.stringify(text)}); if (!b) return 'MISSING'; b.click(); return 'OK'; })()`);

const before = await ev(`(async () => (await window.oasis.assets.list({ projectId: (await window.oasis.projects.list())[0].id })).length)()`);

await nav('PhotoCraft');
await sleep(700);
check('PhotoCraft editor tab is default', 'canvas mounted', (await ev(`!!document.querySelector('canvas[aria-label="Canvas"]')`)) ? 'canvas mounted' : 'no canvas', await ev(`!!document.querySelector('canvas[aria-label="Canvas"]')`));
check('Tool palette', '8 tools', `${await ev(`document.querySelectorAll('.tool-btn').length`)} tools`, (await ev(`document.querySelectorAll('.tool-btn').length`)) === 8);

await clickText('+ Layer');
await sleep(300);
await clickText('+ Fill');
await sleep(300);
const layersAfterAdd = await ev(`document.querySelectorAll('.layer-row').length`);
check('Add pixel + fill layers', '3 rows', `${layersAfterAdd} rows`, layersAfterAdd === 3);

// type layer
await ev(`(() => { const i = document.querySelector('input[aria-label="New text"]'); const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; set.call(i,'OASIS'); i.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`);
await sleep(200);
await clickText('Add type layer');
await sleep(400);
check('Type layer', '4 rows', `${await ev(`document.querySelectorAll('.layer-row').length`)} rows`, (await ev(`document.querySelectorAll('.layer-row').length`)) === 4);

await clickText('Brightness / contrast');
await sleep(400);
check('Adjustment layer', '5 rows', `${await ev(`document.querySelectorAll('.layer-row').length`)} rows`, (await ev(`document.querySelectorAll('.layer-row').length`)) === 5);

// select the fill layer (2nd from bottom) and run a filter
await ev(`(() => { const rows = [...document.querySelectorAll('.layer-row')]; const fill = rows.find(r => r.textContent.includes('Fill')); (fill || rows[1]) && (fill || rows[1]).click(); return rows.length; })()`);
await sleep(300);
const filterOk = await clickText('Invert');
await sleep(500);
check('Filter applies to a pixel layer', 'Invert ran', filterOk === 'OK' ? 'Invert ran' : filterOk, filterOk === 'OK');

// opacity + blend controls exist for the active layer
check('Blend mode control', 'select present', (await ev(`!!document.querySelector('select[aria-label="Blend mode"]')`)) ? 'select present' : 'missing', await ev(`!!document.querySelector('select[aria-label="Blend mode"]')`));
check('Layer opacity', 'slider present', (await ev(`!!document.querySelector('input[aria-label="Layer opacity"]')`)) ? 'slider present' : 'missing', await ev(`!!document.querySelector('input[aria-label="Layer opacity"]')`));

// export
const saveBtn = await clickText('Save to Asset Studio');
await sleep(4500);
const after = await ev(`(async () => (await window.oasis.assets.list({ projectId: (await window.oasis.projects.list())[0].id })).length)()`);
check('Save PNG to Asset Studio', 'asset count +1', `${before} → ${after} (${saveBtn})`, after === before + 1);

// FilmCraft timeline tab
await nav('FilmCraft');
await sleep(800);
const editBtn = await clickText('Edit timeline');
await sleep(1200);
const tracks = await ev(`document.querySelectorAll('.track').length`);
check('FilmCraft → Edit timeline', 'timeline mounts', `${tracks} tracks (${editBtn})`, tracks >= 3);

const fail = rows.filter((r) => r.status === 'Fail');
console.log(`\n${rows.length - fail.length}/${rows.length} checks passed`);
ws.close();
process.exit(fail.length ? 1 : 0);
