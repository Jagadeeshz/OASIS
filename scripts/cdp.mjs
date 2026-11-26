// Minimal CDP driver for verifying the running Electron app.
// usage: node scripts/cdp.mjs <out.png> ["js expression"]
const port = process.env.CDP_PORT || '9333';
const out = process.argv[2] || 'shots/app.png';
const expr = process.argv[3] || 'document.title';
import fs from 'node:fs';
import path from 'node:path';

const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.find((t) => t.type === 'page' && !String(t.url).startsWith('devtools')) || list[0];
if (!page) {
  console.error('no page targets', JSON.stringify(list, null, 2));
  process.exit(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
});
await new Promise((r) => ws.addEventListener('open', r));
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const mid = ++id;
    pending.set(mid, resolve);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 940, deviceScaleFactor: 1, mobile: false });

const result = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
console.log('EVAL:', JSON.stringify(result.result?.result?.value ?? result.result?.exceptionDetails ?? result, null, 2).slice(0, 4000));

// collect console errors
const errors = [];
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.text || 'exception');
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args?.map((a) => a.value || a.description).join(' '));
});

await new Promise((r) => setTimeout(r, 900));
const shot = await send('Page.captureScreenshot', { format: 'png' });
if (shot.result?.data) {
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
  console.log('SHOT:', path.resolve(out));
} else {
  console.log('SHOT FAILED', JSON.stringify(shot).slice(0, 500));
}
if (errors.length) console.log('CONSOLE ERRORS:', JSON.stringify(errors.slice(0, 10), null, 2));
ws.close();
process.exit(0);
