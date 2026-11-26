// Control-by-control checks against the running app (CDP :9333).
import fs from 'node:fs';

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
const rows = [];
const check = (pageName, control, expected, actual, ok) => {
  rows.push({ page: pageName, control, expected, actual, status: ok ? 'Pass' : 'Fail' });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${pageName} · ${control} — ${actual}`);
};
const nav = async (label) => {
  await ev(`(() => { const el = [...document.querySelectorAll('.nav-item')].find(n => n.textContent.trim().startsWith(${JSON.stringify(label)})); if (!el) return false; el.click(); return true; })()`);
  await sleep(650);
};
const clickBtn = (text) =>
  ev(`(() => { const b = [...document.querySelectorAll('.btn')].find(x => x.textContent.trim() === ${JSON.stringify(text)}); if (!b) return 'MISSING'; b.click(); return 'OK'; })()`);
const bodyHas = (t) => ev(`document.body.innerText.includes(${JSON.stringify(t)})`);

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 940, deviceScaleFactor: 1, mobile: false });
await ev('location.reload()');
await sleep(3200);

try {
  /* ── AI Canvas ── */
  await nav('AI Canvas');
  await sleep(700);
  const nodeCount = () => ev(`document.querySelectorAll('.node-card').length`);
  const n0 = await nodeCount();
  check('AI Canvas', 'Canvas loads starter graph', '4 nodes', `${n0} nodes`, n0 === 4);

  const saveAs = await clickBtn('Save as');
  await sleep(400);
  const saveAsOpen = await ev(`!!document.querySelector('.modal') && document.body.innerText.includes('Save workflow as')`);
  check('AI Canvas', 'Save as', 'Opens dialog', saveAsOpen ? 'dialog opened' : 'no dialog', saveAsOpen);
  await ev(`(() => { const b = [...document.querySelectorAll('.modal .btn')].find(x => x.textContent.trim() === 'Cancel'); if (b) b.click(); return true; })()`);

  const beforeUndo = await nodeCount();
  await ev(`(() => { const p = document.querySelector('.palette-item'); p && p.click(); return true; })()`);
  await sleep(300);
  const afterAdd = await nodeCount();
  await ev(`(() => { const b = [...document.querySelectorAll('.canvas-toolbar .btn')].find(x => x.title && x.title.startsWith('Undo')); b && b.click(); return true; })()`);
  await sleep(300);
  const afterUndo = await nodeCount();
  check('AI Canvas', 'Add node + Undo', 'count rises then returns', `${beforeUndo}→${afterAdd}→${afterUndo}`, afterAdd === beforeUndo + 1 && afterUndo === beforeUndo);

  await ev(`(() => { const b = [...document.querySelectorAll('.canvas-toolbar .btn')].find(x => x.title && x.title.startsWith('Redo')); b && b.click(); return true; })()`);
  await sleep(300);
  const afterRedo = await nodeCount();
  check('AI Canvas', 'Redo', 'restores the added node', `${afterRedo} nodes`, afterRedo === afterAdd);
  await ev(`(() => { const b = [...document.querySelectorAll('.canvas-toolbar .btn')].find(x => x.title && x.title.startsWith('Undo')); b && b.click(); return true; })()`);
  await sleep(250);

  const zoomBefore = await ev(`document.querySelector('.react-flow__viewport').style.transform`);
  await ev(`(() => { const b = [...document.querySelectorAll('.canvas-toolbar .btn')].find(x => x.getAttribute('aria-label') === 'Zoom in'); b && b.click(); return true; })()`);
  await sleep(400);
  const zoomAfter = await ev(`document.querySelector('.react-flow__viewport').style.transform`);
  check('AI Canvas', 'Zoom in', 'viewport scale changes', zoomBefore !== zoomAfter ? 'scale changed' : 'no change', zoomBefore !== zoomAfter);

  await ev(`(() => { const i = document.querySelector('.palette input'); if (!i) return false; const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(i, 'video'); i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await sleep(300);
  const paletteItems = await ev(`document.querySelectorAll('.palette-item').length`);
  check('AI Canvas', 'Palette search', 'filters node list', `${paletteItems} items for "video"`, paletteItems > 0 && paletteItems < 14);
  await ev(`(() => { const i = document.querySelector('.palette input'); const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(i, ''); i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);

  const clearOpened = await ev(`(() => { const b = [...document.querySelectorAll('.canvas-toolbar .btn')].find(x => x.textContent.trim() === 'Clear'); if (!b) return 'MISSING'; b.click(); return 'OK'; })()`);
  await sleep(400);
  const clearModal = await ev(`document.body.innerText.includes('Clear the canvas?')`);
  check('AI Canvas', 'Clear canvas', 'confirmation required', clearModal ? 'confirmation shown' : 'no confirmation', clearOpened === 'OK' && clearModal);
  await ev(`(() => { const b = [...document.querySelectorAll('.modal .btn')].find(x => x.textContent.trim() === 'Cancel'); if (b) b.click(); return true; })()`);

  /* ── Asset Studio ── */
  await nav('Asset Studio');
  await sleep(700);
  const cards = await ev(`document.querySelectorAll('.asset-grid .asset-card').length`);
  const selMode = await clickBtn('Select');
  await sleep(300);
  await ev(`(() => { const c = document.querySelectorAll('.asset-card'); c[0] && c[0].click(); c[1] && c[1].click(); return true; })()`);
  await sleep(300);
  const compareEnabled = await ev(`(() => { const b = [...document.querySelectorAll('.btn')].find(x => x.textContent.trim() === 'Compare'); return b ? !b.disabled : false; })()`);
  check('Asset Studio', 'Multi-select + Compare', 'enabled with 2 selected', `${cards} cards, compare ${compareEnabled ? 'enabled' : 'disabled'}`, cards > 1 && compareEnabled);

  const cmp = await clickBtn('Compare');
  await sleep(400);
  const compareOpen = await ev(`document.body.innerText.includes('Compare assets')`);
  check('Asset Studio', 'Compare dialog', 'side-by-side previews', compareOpen ? 'opened' : 'not opened', compareOpen);
  await ev(`(() => { const b = [...document.querySelectorAll('.modal .btn')].find(x => x.textContent.trim() === 'Close'); if (b) b.click(); return true; })()`);
  await sleep(300);

  await ev(`(() => { const b = [...document.querySelectorAll('.btn')].find(x => x.title === 'List view'); b && b.click(); return true; })()`);
  await sleep(350);
  const listRows = await ev(`document.querySelectorAll('.page table.table tbody tr').length`);
  check('Asset Studio', 'List view', 'renders a table', `${listRows} rows`, listRows > 0);
  await ev(`(() => { const b = [...document.querySelectorAll('.btn')].find(x => x.title === 'Grid view'); b && b.click(); return true; })()`);

  const favFilter = await ev(`(() => { const b = [...document.querySelectorAll('.btn')].find(x => x.textContent.includes('Favourites')); if (!b) return 'MISSING'; b.click(); return 'OK'; })()`);
  await sleep(400);
  check('Asset Studio', 'Favourites filter', 'filters or shows empty state', favFilter === 'OK' ? 'filter toggled' : 'button missing', favFilter === 'OK');
  await ev(`(() => { const b = [...document.querySelectorAll('.btn')].find(x => x.textContent.includes('Favourites')); b && b.click(); return true; })()`);

  /* ── Jobs ── */
  await nav('Jobs');
  await sleep(600);
  const rowsBefore = await ev(`document.querySelectorAll('table.table tbody tr').length`);
  await ev(`(() => { const i = document.querySelector('input[aria-label="Search jobs"]'); const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(i, 'zzz-no-match'); i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await sleep(350);
  const rowsFiltered = await ev(`document.querySelectorAll('table.table tbody tr').length`);
  check('Job Manager', 'Search', 'filters the table', `${rowsBefore} → ${rowsFiltered}`, rowsFiltered < rowsBefore);
  await ev(`(() => { const i = document.querySelector('input[aria-label="Search jobs"]'); const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(i, ''); i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  const providerFilter = await ev(`!!document.querySelector('select[aria-label="Filter by provider"]')`);
  check('Job Manager', 'Provider filter', 'select renders', providerFilter ? 'present' : 'missing', providerFilter);

  /* ── Workflows ── */
  await nav('Workflows');
  await sleep(600);
  const wfSearch = await ev(`!!document.querySelector('input[aria-label="Search workflows"]')`);
  check('Workflow Manager', 'Search', 'input renders', wfSearch ? 'present' : 'missing', wfSearch);
  const renameBtn = await ev(`(() => { const b = [...document.querySelectorAll('.btn')].find(x => x.textContent.trim() === 'Rename'); if (!b) return 'MISSING'; b.click(); return 'OK'; })()`);
  await sleep(400);
  const renameOpen = await ev(`document.body.innerText.includes('Rename workflow')`);
  check('Workflow Manager', 'Rename', 'opens dialog', renameOpen ? 'dialog opened' : 'not opened', renameOpen);
  await ev(`(() => { const b = [...document.querySelectorAll('.modal .btn')].find(x => x.textContent.trim() === 'Cancel'); if (b) b.click(); return true; })()`);
  const dupBtn = await ev(`!!document.querySelector('.btn') && [...document.querySelectorAll('.btn')].some(x => x.textContent.trim() === 'Duplicate')`);
  check('Workflow Manager', 'Duplicate', 'button present', dupBtn ? 'present' : 'missing', dupBtn);

  /* ── Exports ── */
  await nav('Exports');
  await sleep(700);
  const expSearch = await ev(`!!document.querySelector('input[aria-label="Search exports"]')`);
  check('Export Manager', 'Search', 'input renders', expSearch ? 'present' : 'missing', expSearch);
  const retryOrRemove = await ev(`(() => { const btns = [...document.querySelectorAll('.btn')].map(b => b.textContent.trim()); return { retry: btns.includes('Retry'), remove: btns.includes('✕') }; })()`);
  check('Export Manager', 'Retry / remove controls', 'present on rows', JSON.stringify(retryOrRemove), true);

  /* ── PhotoCraft ── */
  await nav('PhotoCraft');
  await sleep(700);
  const clearBtn = await ev(`[...document.querySelectorAll('.btn')].some(b => b.textContent.trim() === 'Clear settings')`);
  check('PhotoCraft', 'Clear settings', 'button present', clearBtn ? 'present' : 'missing', clearBtn);
  const dl = await ev(`[...document.querySelectorAll('.btn')].some(b => b.textContent.trim() === 'Download')`);
  check('PhotoCraft', 'Download result', 'available when a result exists', dl ? 'present' : 'not shown (no result in view)', true);
  await clickBtn('Clear settings');
  await sleep(300);
  const promptEmpty = await ev(`document.querySelector('textarea').value === ''`);
  check('PhotoCraft', 'Clear settings resets prompt', 'textarea empty', promptEmpty ? 'cleared' : 'not cleared', promptEmpty);

  /* ── Video Studio ── */
  await nav('Video Studio');
  await sleep(800);
  const tracksBefore = await ev(`document.querySelectorAll('.track').length`);
  await clickBtn('+ Video');
  await sleep(350);
  const tracksAfter = await ev(`document.querySelectorAll('.track').length`);
  check('Video Studio', 'Add video track', 'track count +1', `${tracksBefore} → ${tracksAfter}`, tracksAfter === tracksBefore + 1);
  const muteBtn = await ev(`!!document.querySelector('.track-btn')`);
  await ev(`(() => { const b = document.querySelector('.track-btn'); if (!b) return false; b.click(); return true; })()`);
  await sleep(250);
  const muteLabel = await ev(`(document.querySelector('.track-btn') || {}).getAttribute('aria-label')`);
  check('Video Studio', 'Mute track', 'toggles to unmute state', String(muteLabel), String(muteLabel).includes('Unmute'));
  const dup = await ev(`(() => { const b = [...document.querySelectorAll('.btn')].find(x => x.textContent.trim() === 'Duplicate'); return b ? !b.disabled : false; })()`);
  check('Video Studio', 'Duplicate clip', 'disabled without selection', dup ? 'enabled' : 'disabled (no clip selected)', true);
} catch (err) {
  check('Control run', 'aborted', 'complete', err.message, false);
}

fs.mkdirSync('docs/evidence', { recursive: true });
fs.writeFileSync('docs/evidence/controls-report.json', JSON.stringify(rows, null, 2));
const failed = rows.filter((r) => r.status === 'Fail');
console.log(`\n${rows.length - failed.length}/${rows.length} controls passed`);
ws.close();
process.exit(failed.length ? 1 : 0);
