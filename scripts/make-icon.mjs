// Generates build/icon.png (512x512) without any image dependency.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { encodePng } = require('../electron/services/png.cjs');

const S = 512;
const cx = S / 2;
const cy = S / 2;

const png = encodePng(S, S, (x, y) => {
  const dx = (x - cx) / S;
  const dy = (y - cy) / S;
  const r = Math.hypot(dx, dy) * 2; // 0..~1.41

  // rounded-square mask
  const qx = Math.abs(dx) * 2;
  const qy = Math.abs(dy) * 2;
  const radius = 0.42;
  const inside = Math.max(qx, qy) < 1 - radius + 0.001 || Math.hypot(Math.max(qx - (1 - radius), 0), Math.max(qy - (1 - radius), 0)) < radius;
  if (!inside) return [10, 12, 17, 0];

  // base gradient
  const t = (x / S + y / S) / 2;
  const base = [Math.round(12 + 8 * t), Math.round(15 + 10 * t), Math.round(24 + 20 * t)];

  // orbital ring
  const ring = Math.abs(r - 0.62) < 0.035;
  const ringGlow = Math.abs(r - 0.62) < 0.09;

  // diagonal accent band
  const band = Math.abs((x - y) / S) < 0.06;

  if (ring) {
    const a = Math.atan2(dy, dx);
    const hueMix = (Math.sin(a * 2 + 1.2) + 1) / 2;
    return [Math.round(91 + hueMix * 60), Math.round(140 - hueMix * 40), 255, 255];
  }
  if (ringGlow) {
    const k = 1 - Math.abs(r - 0.62) / 0.09;
    return [Math.round(base[0] + 22 * k), Math.round(base[1] + 34 * k), Math.round(base[2] + 70 * k), 255];
  }
  if (band) {
    return [Math.round(base[0] + 26), Math.round(base[1] + 20), Math.round(base[2] + 46), 255];
  }
  // nucleus
  if (r < 0.16) {
    const k = 1 - r / 0.16;
    return [Math.round(120 + 110 * k), Math.round(150 + 80 * k), 255, 255];
  }
  return [...base, 255];
});

const out = path.join(process.cwd(), 'build', 'icon.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, png);
console.log(`wrote ${out} (${png.length} bytes)`);
