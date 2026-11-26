'use strict';
// Media probing, thumbnails and deterministic mock media generation.
// ffmpeg/ffprobe are required for video work; images and audio mocks work without them.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const FFMPEG = process.env.OASIS_FFMPEG || 'ffmpeg';
const FFPROBE = process.env.OASIS_FFPROBE || 'ffprobe';
let _ffmpegOk = null;

function ffmpegAvailable() {
  if (_ffmpegOk !== null) return _ffmpegOk;
  try {
    const r = spawnSync(FFMPEG, ['-hide_banner', '-version'], { encoding: 'utf8', timeout: 15000 });
    _ffmpegOk = r.status === 0;
  } catch {
    _ffmpegOk = false;
  }
  return _ffmpegOk;
}

function ffmpegVersion() {
  try {
    const r = spawnSync(FFMPEG, ['-hide_banner', '-version'], { encoding: 'utf8', timeout: 15000 });
    return r.status === 0 ? String(r.stdout).split('\n')[0].trim() : null;
  } catch {
    return null;
  }
}

function run(bin, args, { timeout = 120000 } = {}) {
  const r = spawnSync(bin, args, { encoding: 'utf8', timeout, maxBuffer: 32 * 1024 * 1024 });
  if (r.error) return { code: -1, stdout: r.stdout || '', stderr: String(r.error.message) };
  return { code: r.status === null ? -1 : r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
};

function mimeFor(file) {
  return MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

function mediaTypeFor(file, mime) {
  const m = mime || mimeFor(file);
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  return 'file';
}

function parseRate(str) {
  if (!str || typeof str !== 'string') return null;
  const [a, b] = str.split('/').map(Number);
  if (!a || Number.isNaN(a)) return null;
  if (!b || Number.isNaN(b)) return a;
  return Math.round((a / b) * 1000) / 1000;
}

/** Probe a media file. Falls back to header sniffing when ffprobe is unavailable. */
function probe(file) {
  const mime = mimeFor(file);
  const mediaType = mediaTypeFor(file, mime);
  const out = { mediaType, mime, width: null, height: null, duration: null, frame_rate: null, codec: null };
  if (!fs.existsSync(file)) return out;
  try {
    out.fileSize = fs.statSync(file).size;
  } catch {
    out.fileSize = null;
  }
  const r = run(
    FFPROBE,
    ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height,avg_frame_rate,duration:format=duration', '-of', 'json', file],
    { timeout: 30000 },
  );
  if (r.code === 0) {
    try {
      const json = JSON.parse(r.stdout);
      const vs = (json.streams || []).find((s) => s.codec_type === 'video');
      const anyStream = (json.streams || [])[0];
      out.hasAudio = (json.streams || []).some((s) => s.codec_type === 'audio');
      if (vs) {
        out.width = vs.width || null;
        out.height = vs.height || null;
        out.frame_rate = parseRate(vs.avg_frame_rate);
        out.codec = vs.codec_name || null;
      } else if (anyStream) {
        out.codec = anyStream.codec_name || null;
      }
      const dur = (json.format && json.format.duration) || (vs && vs.duration) || (anyStream && anyStream.duration);
      if (dur) out.duration = Math.round(Number(dur) * 1000) / 1000;
      return out;
    } catch {
      /* fall through to header sniffing */
    }
  }
  const dims = sniffImage(file);
  if (dims) {
    out.width = dims.width;
    out.height = dims.height;
    out.mediaType = 'image';
  }
  return out;
}

/** PNG / JPEG / GIF dimension sniffing (no native deps). */
function sniffImage(file) {
  try {
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(64 * 1024);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    if (n > 24 && buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    if (n > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i < n - 9) {
        if (buf[i] !== 0xff) {
          i++;
          continue;
        }
        const marker = buf[i + 1];
        const len = buf.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
        }
        i += 2 + len;
      }
    }
    if (n > 10 && buf.toString('ascii', 0, 3) === 'GIF') {
      return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Generate a jpg/png thumbnail. Returns path or null. */
function makeThumbnail(src, outPath, mediaType, { atSec = 1, width = 480 } = {}) {
  if (!ffmpegAvailable()) return null;
  const args = ['-y', '-hide_banner', '-loglevel', 'error'];
  if (mediaType === 'video') args.push('-ss', String(atSec));
  args.push('-i', src, '-frames:v', '1', '-vf', `scale=${width}:-2:force_original_aspect_ratio=decrease`, outPath);
  const r = run(FFMPEG, args, { timeout: 60000 });
  return r.code === 0 && fs.existsSync(outPath) ? outPath : null;
}

/** Write a playable WAV tone (used for mock audio without ffmpeg). */
function writeWav(outPath, { duration = 3, freq = 220, sampleRate = 44100 } = {}) {
  const n = Math.floor(duration * sampleRate);
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const env = Math.min(1, t * 6) * Math.min(1, (duration - t) * 6);
    const v = (Math.sin(2 * Math.PI * freq * t) * 0.35 + Math.sin(2 * Math.PI * freq * 2 * t) * 0.12) * env;
    data.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v * 32767))), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(data.length, 40);
  fs.writeFileSync(outPath, Buffer.concat([header, data]));
  return outPath;
}

function fontFile() {
  const candidates = [
    'C:/Windows/Fonts/arialbd.ttf',
    'C:/Windows/Fonts/segoeuib.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
  ];
  return candidates.find((f) => fs.existsSync(f)) || null;
}

/** Deterministic mock video with a burned-in provenance label. Requires ffmpeg. */
function makeMockVideo(outPath, { width = 768, height = 432, duration = 3, label = 'MOCK - UNVERIFIED', prompt = '' } = {}) {
  if (!ffmpegAvailable()) throw new Error('ffmpeg is required for video mock generation');
  const hue = Math.abs(hash(hash(prompt)));
  const txt = path.join(path.dirname(outPath), `_label_${Date.now()}.txt`);
  fs.writeFileSync(txt, label, 'utf8');
  const font = fontFile();
  let vf = `hue=h=${hue},eq=saturation=0.6`;
  if (font) {
    const f = font.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
    const t = txt.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
    vf += `,drawtext=fontfile='${f}':textfile='${t}':fontcolor=white:fontsize=22:x=20:y=h-44:box=1:boxcolor=black@0.55:boxborderw=10`;
  }
  const r = run(
    FFMPEG,
    [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      `testsrc2=size=${width}x${height}:rate=24:duration=${duration}`,
      '-vf',
      vf,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      outPath,
    ],
    { timeout: 120000 },
  );
  try {
    fs.unlinkSync(txt);
  } catch {
    /* ignore */
  }
  if (r.code !== 0) throw new Error(`mock video render failed: ${r.stderr.slice(0, 400)}`);
  return outPath;
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < String(s).length; i++) h = (Math.imul(31, h) + String(s).charCodeAt(i)) | 0;
  return h;
}

module.exports = {
  probe,
  makeThumbnail,
  writeWav,
  makeMockVideo,
  ffmpegAvailable,
  ffmpegVersion,
  mimeFor,
  mediaTypeFor,
  run,
  FFMPEG,
  FFPROBE,
  sniffImage,
};
