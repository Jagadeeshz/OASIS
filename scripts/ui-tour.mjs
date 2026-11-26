// UI theme tour: screenshots every screen, checks computed tokens, fonts and contrast.
// Requires the app running with --remote-debugging-port=9333.
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

const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
  return r.result?.result?.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 940, deviceScaleFactor: 1, mobile: false });

const outDir = path.join('shots', 'theme');
fs.mkdirSync(outDir, { recursive: true });

const shot = async (name) => {
  await sleep(450);
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(r.result.data, 'base64'));
};

const clickNav = async (label) => {
  const ok = await evaluate(`(() => {
    const el = [...document.querySelectorAll('.nav-item')].find(n => n.textContent.trim().startsWith(${JSON.stringify(label)}));
    if (!el) return false;
    el.click();
    return true;
  })()`);
  if (!ok) throw new Error('nav not found: ' + label);
  await sleep(700);
};

await evaluate('location.reload()');
await sleep(3000);

const checks = {};

checks.fonts = await evaluate(`JSON.stringify({
  dmSans: document.fonts.check('13px "DM Sans"'),
  dmMono: document.fonts.check('11px "DM Mono"'),
  cormorant: document.fonts.check('700 30px "Cormorant Garamond"'),
  bodyFamily: getComputedStyle(document.body).fontFamily,
  h1Family: getComputedStyle(document.querySelector('h1')).fontFamily
})`);

const screens = [
  ['dashboard', 'Dashboard'],
  ['photocraft', 'PhotoCraft'],
  ['filmcraft', 'FilmCraft'],
  ['effectscraft', 'EffectsCraft'],
  ['assets', 'Asset Studio'],
  ['video', 'Video Studio'],
  ['canvas', 'AI Canvas'],
  ['projects', 'Projects'],
  ['providers', 'Providers'],
  ['jobs', 'Jobs'],
  ['workflows', 'Workflows'],
  ['storage', 'Storage'],
  ['exports', 'Exports'],
  ['settings', 'Settings'],
  ['logs', 'Logs'],
];

for (const [slug, label] of screens) {
  await clickNav(label);
  await shot(slug);
}

// Hover + focus evidence on PhotoCraft.
await clickNav('PhotoCraft');
const rect = await evaluate(`(() => {
  const b = document.querySelector('.btn.primary');
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
})()`);
if (rect) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x, y: rect.y });
  await shot('state-hover-primary');
}
await evaluate(`(() => { const i = document.querySelector('textarea'); if (i) i.focus(); return true; })()`);
await shot('state-focus-input');

// Token + contrast audit, computed from the live DOM.
checks.tokens = await evaluate(`(() => {
  const cs = getComputedStyle(document.documentElement);
  const t = (n) => cs.getPropertyValue(n).trim();
  const lum = (color) => {
    if (!color) return null;
    let r, g, b;
    if (color.startsWith('#')) {
      const h = color.slice(1);
      const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
      r = parseInt(full.slice(0, 2), 16); g = parseInt(full.slice(2, 4), 16); b = parseInt(full.slice(4, 6), 16);
    } else {
      const m = color.match(/[\\d.]+/g);
      if (!m) return null;
      [r, g, b] = m.slice(0, 3).map(Number);
    }
    const lin = [r, g, b].map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  };
  const ratio = (a, b) => {
    const la = lum(a), lb = lum(b);
    if (la === null || lb === null) return null;
    const hi = Math.max(la, lb), lo = Math.min(la, lb);
    return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
  };
  const body = getComputedStyle(document.body);
  const btn = document.querySelector('.btn.primary');
  const nav = document.querySelector('.nav-item.active');
  return JSON.stringify({
    void: t('--bindu-void'),
    bodyBg: body.backgroundColor,
    bodyColor: body.color,
    primaryBtnBg: btn ? getComputedStyle(btn).backgroundImage.slice(0, 90) : null,
    primaryBtnColor: btn ? getComputedStyle(btn).color : null,
    activeNavBg: nav ? getComputedStyle(nav).backgroundColor : null,
    activeNavColor: nav ? getComputedStyle(nav).color : null,
    contrast: {
      textOnVoid: ratio(body.color, body.backgroundColor),
      secondaryOnPanel: ratio(t('--bindu-text-secondary'), t('--bindu-void-2')),
      mutedOnPanel: ratio(t('--bindu-text-muted'), t('--bindu-void-2')),
      inkOnLumen: ratio(t('--bindu-ink'), t('--bindu-lumen')),
      imageBadgeOnVoid: ratio(t('--bindu-media-image'), t('--bindu-void-2')),
      videoBadgeOnVoid: ratio(t('--bindu-media-video'), t('--bindu-void-2')),
      audioBadgeOnVoid: ratio(t('--bindu-media-audio'), t('--bindu-void-2')),
    },
  });
})()`);

// Narrow window check.
await clickNav('Dashboard');
await send('Emulation.setDeviceMetricsOverride', { width: 1180, height: 760, deviceScaleFactor: 1, mobile: false });
await shot('width-1180-dashboard');
await clickNav('AI Canvas');
await shot('width-1180-canvas');
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await clickNav('Dashboard');
await shot('width-1920-dashboard');

checks.console = await evaluate(`(() => {
  const el = document.querySelector('.toast.error');
  return el ? el.textContent : 'no error toast';
})()`);

console.log(JSON.stringify(checks, null, 2));
console.log(`screens: ${screens.length + 4} → ${path.resolve(outDir)}`);
ws.close();
process.exit(0);
