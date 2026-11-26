'use strict';
// Minimal, dependency-free PNG encoder used by deterministic mock generation
// and by the app icon generator script.
const zlib = require('node:zlib');

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

/** @param {number} width @param {number} height @param {(x:number,y:number)=>[number,number,number,number]} shade */
function encodePng(width, height, shade) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  let p = 0;
  for (let y = 0; y < height; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = shade(x, y);
      raw[p++] = r;
      raw[p++] = g;
      raw[p++] = b;
      raw[p++] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < String(str).length; i++) {
    h ^= String(str).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hsl(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (h % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] =
    hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return [Math.round((r1 + m) * 255), Math.round((g1 + m) * 255), Math.round((b1 + m) * 255)];
}

/** Deterministic placeholder artwork for mock mode. Same prompt+seed => identical pixels. */
function mockImageBuffer({ width = 768, height = 768, prompt = '', seed = 0, label = 'MOCK' } = {}) {
  const h = (hashSeed(prompt) + seed * 7919) % 360;
  const band = 18 + (hashSeed(prompt + 'band') % 30);
  return encodePng(width, height, (x, y) => {
    const fx = x / width;
    const fy = y / height;
    const wave = 0.5 + 0.5 * Math.sin(fx * 9.4 + fy * 5.1 + h * 0.01);
    const [r, g, b] = hsl(h + fx * 40 + wave * 20, 0.62, 0.18 + wave * 0.42);
    const stripe = Math.floor((x + y) / band) % 2 === 0 ? 1 : 0.86;
    const vign = 1 - 0.45 * Math.hypot(fx - 0.5, fy - 0.5) * 1.6;
    const grid = x % 64 === 0 || y % 64 === 0 ? 1.16 : 1;
    // Square glyph block in the lower-left: a visual "mock plate" marker.
    const mx = fx > 0.05 && fx < 0.29 && fy > 0.86 && fy < 0.94;
    if (mx) return [245, 245, 245, 255];
    return [
      Math.min(255, Math.round(r * stripe * vign * grid)),
      Math.min(255, Math.round(g * stripe * vign * grid)),
      Math.min(255, Math.round(b * stripe * vign * grid)),
      255,
    ];
  });
}

module.exports = { encodePng, mockImageBuffer, hashSeed, crc32 };
