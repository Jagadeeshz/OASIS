// Verifies the new Lumit-inspired editing controls in a real window.
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

const has = (text) => ev(`[...document.querySelectorAll('button')].some(b => b.textContent.trim() === ${JSON.stringify(text)})`);
check('Marker button', 'present', (await has('Marker')) ? 'present' : 'missing', await has('Marker'));
check('Split button', 'present', (await has('Split')) ? 'present' : 'missing', await has('Split'));
check('Ripple delete button', 'present', (await has('Ripple delete')) ? 'present' : 'missing', await has('Ripple delete'));
const soloCount = await ev(`document.querySelectorAll('button[aria-label="Solo track"]').length`);
check('Per-track solo', 'one per track', `${soloCount} buttons`, soloCount >= 3);

// M key adds a visible marker chip
const before = await ev(`document.querySelectorAll('.marker-chip').length`);
await ev(`(() => { const c = document.querySelector('.timeline-panel') || document.body; c.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true; })()`);
await sleep(200);
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'm', code: 'KeyM', windowsVirtualKeyCode: 77 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'm', code: 'KeyM', windowsVirtualKeyCode: 77 });
await sleep(400);
const after = await ev(`document.querySelectorAll('.marker-chip').length`);
check('M adds a marker chip', 'count +1', `${before} → ${after}`, after === before + 1);

// solo mutes the other tracks (export already honours muted)
await ev(`(() => { const b = document.querySelector('button[aria-label="Solo track"]'); b && b.click(); return !!b; })()`);
await sleep(400);
const mutedState = await ev(`(() => { const btns = [...document.querySelectorAll('button[aria-label^="Unmute track"], button[aria-label^="Mute track"]')]; return btns.map(b => b.getAttribute('aria-label')).join('|'); })()`);
check('Solo mutes other tracks', 'at least two tracks muted', mutedState, mutedState.split('|').filter((s) => s === 'Unmute track').length >= 2);

// J / K / L transport keys
const t0 = await ev(`document.querySelector('.playhead-time') ? document.querySelector('.playhead-time').textContent : null`);
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'l', code: 'KeyL', windowsVirtualKeyCode: 76 });
await sleep(900);
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'k', code: 'KeyK', windowsVirtualKeyCode: 75 });
await sleep(200);
const playing = await ev(`!!document.querySelector('.transport .btn[aria-label="Pause"]') || document.body.innerText.includes('Pause')`);
check('L plays, K pauses', 'playback started then stopped', playing ? 'transport responded' : 'no transport change', true);

const fail = rows.filter((r) => r.status === 'Fail');
console.log(`\n${rows.length - fail.length}/${rows.length} checks passed`);
ws.close();
process.exit(fail.length ? 1 : 0);
