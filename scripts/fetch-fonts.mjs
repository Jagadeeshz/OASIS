// Downloads the BINDU type stack (DM Sans, DM Mono, Cormorant Garamond) as
// self-hosted woff2 so the desktop app never depends on a font CDN.
import fs from 'node:fs';
import path from 'node:path';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const OUT = path.join(process.cwd(), 'src', 'assets', 'fonts');

const API =
  'https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&family=Cormorant+Garamond:wght@700&display=swap';

const css = await (await fetch(API, { headers: { 'user-agent': UA } })).text();
if (!css.includes('@font-face')) {
  console.error('no font CSS returned:\n', css.slice(0, 400));
  process.exit(1);
}

// Keep only the latin subset blocks and the urls in them.
const blocks = css.split('@font-face').slice(1);
const picked = [];
for (const block of blocks) {
  const family = /font-family:\s*'([^']+)'/.exec(block)?.[1];
  const weight = /font-weight:\s*(\d+)/.exec(block)?.[1];
  const url = /url\((https:[^)]+\.woff2)\)/.exec(block)?.[1];
  const unicode = /unicode-range:\s*([^;]+);/.exec(block)?.[1] || '';
  const isLatin = /U\+0000-00FF/.test(unicode);
  if (!family || !weight || !url || !isLatin) continue;
  if (picked.some((p) => p.family === family && p.weight === weight)) continue;
  picked.push({ family, weight, url });
}

fs.mkdirSync(OUT, { recursive: true });
const slug = (f) => f.toLowerCase().replace(/\s+/g, '-');
const faces = [];
for (const f of picked) {
  const file = `${slug(f.family)}-${f.weight}.woff2`;
  const buf = Buffer.from(await (await fetch(f.url, { headers: { 'user-agent': UA } })).arrayBuffer());
  fs.writeFileSync(path.join(OUT, file), buf);
  faces.push({ ...f, file, bytes: buf.length });
  console.log(`${f.family} ${f.weight} → ${file} (${(buf.length / 1024).toFixed(1)} KB)`);
}
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(faces, null, 2));
console.log(`${faces.length} faces written to ${OUT}`);
