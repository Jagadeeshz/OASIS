// End-to-end drive of the running OASIS desktop app over CDP.
// Each step asserts real DOM state produced by real IPC calls.
import fs from 'node:fs';
import path from 'node:path';

const port = process.env.CDP_PORT || '9333';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.find((t) => t.type === 'page' && !String(t.url).startsWith('devtools'));
if (!page) {
  console.error('no page target');
  process.exit(1);
}
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

const evaluate = async (expression, awaitPromise = true) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise, userGesture: true });
  if (r.result?.exceptionDetails) throw new Error((r.result.exceptionDetails.text || '') + ' ' + (r.result.exceptionDetails.exception?.description || '').slice(0, 400));
  return r.result?.result?.value;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

async function waitFor(expression, { timeout = 20000, label = '' } = {}) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeout) {
    last = await evaluate(expression);
    if (last) return last;
    await sleep(300);
  }
  throw new Error(`timeout waiting for ${label || expression} (last=${JSON.stringify(last)})`);
}

async function shot(name) {
  await sleep(250);
  const r = await send('Page.captureScreenshot', { format: 'png' });
  const out = path.join('shots', name);
  fs.mkdirSync('shots', { recursive: true });
  fs.writeFileSync(out, Buffer.from(r.result.data, 'base64'));
}

const clickText = (selector, text) =>
  evaluate(`(() => {
    const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find(e => e.textContent.trim().includes(${JSON.stringify(text)}));
    if (!el) return 'NOT_FOUND';
    el.click();
    return 'OK';
  })()`);

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 940, deviceScaleFactor: 1, mobile: false });

try {
  // 1. Dashboard renders with the shared project
  await evaluate(`location.reload()`).catch(() => {});
  await sleep(2500);
  const dash = await evaluate(`JSON.stringify({h1:(document.querySelector('h1')||{}).textContent, project:[...document.querySelectorAll('.topbar select option')].map(o=>o.textContent), providers:[...document.querySelectorAll('.panel strong')].map(s=>s.textContent).slice(0,6)})`);
  const d = JSON.parse(dash);
  record('dashboard renders project context', !!d.h1 && d.project.length > 0, `${d.h1} / ${d.project.join(',')}`);
  await shot('e2e-01-dashboard.png');

  // 2. PhotoCraft: mock image generation
  await clickText('.nav-item', 'PhotoCraft');
  await waitFor(`!!document.querySelector('h1') && document.querySelector('h1').textContent === 'PhotoCraft'`, { label: 'PhotoCraft page' });
  const modelPicked = await evaluate(`(() => {
    const sel = [...document.querySelectorAll('select')].find(s => [...s.options].some(o => o.value === 'mock/image'));
    if (!sel) return 'NO_MODEL';
    sel.value = 'mock/image';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return 'OK';
  })()`);
  await sleep(400);
  const promptSet = await evaluate(`(() => {
    const ta = document.querySelector('textarea');
    if (!ta) return 'NO_PROMPT';
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, 'E2E deterministic lighthouse');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    return 'OK';
  })()`);
  await clickText('.btn', 'Generate image');
  const photoDone = await waitFor(`(() => {
    const cards = document.querySelectorAll('.asset-card').length;
    const mock = document.body.innerText.includes('Mock — unverified');
    const failed = document.body.innerText.includes('Job failed');
    return (cards > 0 && mock) ? 'CARDS:'+cards : (failed ? 'FAILED' : '');
  })()`, { timeout: 40000, label: 'photo result' });
  record('PhotoCraft mock generation produces labelled asset', photoDone !== 'FAILED', String(photoDone) + ` (model:${modelPicked}, prompt:${promptSet})`);
  await shot('e2e-02-photocraft.png');

  // 3. Asset Studio: shared library shows the asset
  await clickText('.nav-item', 'Asset Studio');
  await waitFor(`document.querySelector('h1') && document.querySelector('h1').textContent === 'Asset Studio'`, { label: 'assets page' });
  const assetCount = await waitFor(`document.querySelectorAll('.asset-grid .asset-card').length`, { label: 'asset cards' });
  await evaluate(`(() => { const c = document.querySelector('.asset-grid .asset-card'); if (c) c.click(); return true; })()`);
  await sleep(700);
  const drawer = await evaluate(`JSON.stringify({
    open: !!document.querySelector('.drawer'),
    name: (document.querySelector('.drawer input')||{}).value,
    mock: (document.querySelector('.drawer')||{}).innerText?.includes('Mock — unverified'),
    prompt: (document.querySelector('.drawer')||{}).innerText?.slice(0,200)
  })`);
  record('Asset Studio shows generated asset with provenance', JSON.parse(drawer).open && JSON.parse(drawer).mock, `${assetCount} cards`);
  await shot('e2e-03-assetstudio.png');
  await evaluate(`(() => { const b=[...document.querySelectorAll('.drawer .btn')].find(x=>x.textContent.trim()==='✕'); if(b) b.click(); return true; })()`);

  // 4. AI Canvas: run the starter workflow on the deterministic offline path
  //    (a live fal key would send this to the real queue — the test must not spend credit
  //     or depend on network latency, so the provider is disabled for this step and restored after).
  const falWasEnabled = await evaluate(`window.oasis.providers.list().then(l => !!(l.find(p => p.id === 'fal') || {}).enabled)`).catch(() => true);
  await evaluate(`window.oasis.providers.setEnabled('fal', false)`).catch(() => {});
  await clickText('.nav-item', 'AI Canvas');
  await waitFor(`!!document.querySelector('.react-flow')`, { timeout: 15000, label: 'canvas' });
  const nodes = await evaluate(`document.querySelectorAll('.node-card').length`);
  await clickText('.btn', 'Run workflow');
  const runState = await waitFor(`(() => {
    const done = document.querySelectorAll('.node-status.done').length;
    const err = document.querySelectorAll('.node-status.error').length;
    const txt = document.body.innerText;
    if (txt.includes('Workflow finished')) return 'DONE:'+done;
    if (err) return 'ERROR';
    return done >= 3 ? 'DONE:'+done : '';
  })()`, { timeout: 90000, label: 'workflow run' });
  record('AI Canvas executes workflow nodes', nodes >= 3 && String(runState).startsWith('DONE'), `nodes:${nodes}, ${runState}`);
  await evaluate(`window.oasis.providers.setEnabled('fal', ${falWasEnabled})`).catch(() => {});
  await shot('e2e-04-canvas.png');

  // 5. Video Studio: timeline + real export
  await clickText('.nav-item', 'Video Studio');
  await waitFor(`!!document.querySelector('.timeline-panel')`, { timeout: 15000, label: 'video studio' });
  const addResult = await evaluate(`(() => {
    const rows = [...document.querySelectorAll('.bin .row')];
    const addBtn = rows.map(r => [...r.querySelectorAll('.btn')].find(b => b.textContent.trim() === 'Add')).find(Boolean);
    if (!addBtn) return 'NO_ASSET';
    addBtn.click();
    return 'OK';
  })()`);
  await sleep(600);
  const clipCount = await evaluate(`document.querySelectorAll('.clip').length`);
  await clickText('.btn', '+ Text');
  await sleep(400);
  await evaluate(`(() => {
    const ta = [...document.querySelectorAll('.panel textarea')][0];
    if (!ta) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, 'OASIS E2E');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await shot('e2e-05-videostudio.png');
  await clickText('.btn', 'Export mp4');
  const exportState = await waitFor(`(() => {
    const t = document.body.innerText;
    if (t.includes('Export succeeded')) return 'SUCCEEDED';
    if (t.includes('Export failed')) return 'FAILED';
    return '';
  })()`, { timeout: 90000, label: 'export' });
  record('Video Studio builds a timeline and exports a real mp4', clipCount >= 1 && exportState === 'SUCCEEDED', `clips:${clipCount}, add:${addResult}, export:${exportState}`);
  await shot('e2e-06-export.png');

  // 6. Provider settings page
  await clickText('.nav-item', 'Providers');
  await waitFor(`document.querySelector('h1') && document.querySelector('h1').textContent === 'Providers & Models'`, { label: 'providers page' });
  const prov = await evaluate(`JSON.stringify({cards:[...document.querySelectorAll('.panel-head strong')].map(s=>s.textContent).slice(0,3), falNoKey: document.body.innerText.includes('no key') || document.body.innerText.includes('not-configured')})`);
  record('Provider settings exposes three independent providers', JSON.parse(prov).cards.length === 3, prov);
  await shot('e2e-07-providers.png');

  // 7. Jobs page reflects the run history
  await clickText('.nav-item', 'Jobs');
  await waitFor(`document.querySelector('h1') && document.querySelector('h1').textContent === 'Jobs'`, { label: 'jobs page' });
  const jobRows = await waitFor(`document.querySelectorAll('table.table tbody tr').length`, { label: 'job rows' });
  record('Job manager lists queued/completed work', jobRows >= 2, `${jobRows} rows`);
  await shot('e2e-08-jobs.png');

  // 8. Exports page shows the manifest
  await clickText('.nav-item', 'Exports');
  await sleep(1200);
  const exportsText = await evaluate(`document.body.innerText`);
  record('Export manager shows manifest provenance', exportsText.includes('Export') && /sha256|verified/i.test(exportsText), '');
  await shot('e2e-09-exports.png');
} catch (err) {
  record('E2E run aborted', false, err.message);
  await shot('e2e-failure.png');
}

fs.writeFileSync(path.join('shots', 'e2e-report.json'), JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} steps passed`);
ws.close();
process.exit(failed.length ? 1 : 0);
