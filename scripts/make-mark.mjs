// OASIS in-app mark: a prism ring on void, legible at 30px.
// Writes src/assets/oasis-mark.png (96px). Uses the token-free PNG encoder.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { encodePng } = require('../electron/services/png.cjs');

const S = 96;
const C = S / 2;

const hex = (h) => {
  const n = h.replace('#', '');
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
};
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

// Spectrum arc stops (from the theme palette).
const ARC = ['#8855ff', '#398bff', '#22d3ee', '#43d17a', '#ffd400', '#ff8a00', '#ff405f'].map(hex);
const arcColor = (t) => {
  const x = t * (ARC.length - 1);
  const i = Math.min(ARC.length - 2, Math.floor(x));
  return mix(ARC[i], ARC[i + 1], x - i);
};

const LUMEN = hex('#ffd400');
const LUMEN_BRIGHT = hex('#ffe45c');
const DEEP = hex('#eab900');
const VOID = hex('#0b0b0e');
const RIM = hex('#1d1d24');

const insideRounded = (x, y, size, r) => {
  const qx = Math.max(Math.abs(x - C) - (size / 2 - r), 0);
  const qy = Math.max(Math.abs(y - C) - (size / 2 - r), 0);
  return Math.hypot(qx, qy) <= r;
};

const png = encodePng(S, S, (x, y) => {
  if (!insideRounded(x, y, S - 8, 20)) return [0, 0, 0, 0];

  const dx = x - C;
  const dy = y - C;
  const dist = Math.hypot(dx, dy);
  const ang = (Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2);

  // Base plate with a soft top light.
  const plate = mix(VOID, RIM, Math.max(0, 1 - y / S) * 0.55);

  // Ring: radius 30, width 6.5, with a prism arc across the upper-right quadrant.
  const R = 30;
  const W = 3.4;
  const ringHit = Math.abs(dist - R) <= W;
  if (ringHit) {
    const arcStart = Math.PI * 1.62;
    const arcEnd = Math.PI * 2.45;
    const inArc = ang >= arcStart || ang <= arcEnd - Math.PI * 2;
    if (inArc) {
      const t = ((ang - arcStart + Math.PI * 2) % (Math.PI * 2)) / (arcEnd - arcStart + Math.PI * 2);
      return [...arcColor(Math.min(1, Math.max(0, t))), 255];
    }
    const glow = 1 - Math.abs(dist - R) / W;
    const base = mix(DEEP, LUMEN_BRIGHT, Math.max(0, 1 - (x + y) / (2 * S)) * 0.9);
    return [...mix(base, LUMEN, glow * 0.25), 255];
  }

  // Halo just outside the ring.
  if (dist > R + W && dist < R + W + 5) {
    const k = 1 - (dist - R - W) / 5;
    return [...mix(plate, DEEP, k * 0.28), 255];
  }

  // Nucleus.
  if (dist <= 7.5) {
    const k = 1 - dist / 7.5;
    return [...mix(LUMEN, LUMEN_BRIGHT, k), 255];
  }

  return [...plate, 255];
});

const out = path.join(process.cwd(), 'src', 'assets', 'oasis-mark.png');
fs.writeFileSync(out, png);
console.log(`wrote ${out} (${png.length} bytes)`);
