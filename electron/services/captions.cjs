'use strict';
// Caption / subtitle parsing and serialising. Pure functions, no I/O, so they
// can be unit tested and reused by both the renderer and the timeline.

const TIMESTAMP = /^(?:(\d+):)?(\d{1,2}):(\d{2})[,.](\d{1,3})$/;

/** Parse "00:01:02,500" | "01:02.500" | "62.5" into seconds. */
function parseTime(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const m = TIMESTAMP.exec(s);
  if (m) {
    const [, h, mm, ss, ms] = m;
    const millis = Number(ms.padEnd(3, '0').slice(0, 3));
    return Number(h || 0) * 3600 + Number(mm) * 60 + Number(ss) + millis / 1000;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Seconds → "HH:MM:SS,mmm" (SRT) or "HH:MM:SS.mmm" (VTT). */
function formatTime(seconds, sep = ',') {
  const total = Math.max(0, Number(seconds) || 0);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const ms = Math.round((total - Math.floor(total)) * 1000);
  const pad = (v, n = 2) => String(v).padStart(n, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}${sep}${pad(ms, 3)}`;
}

const stripTags = (s) =>
  String(s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/\{\\[^}]*\}/g, '')
    .trim();

/** Parse SRT or WebVTT into [{ start, end, text }]. */
function parseCues(input) {
  const text = String(input || '').replace(/\r\n?/g, '\n');
  if (!text.trim()) return [];
  const blocks = text.split(/\n{2,}/);
  const cues = [];
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim().length > 0);
    if (lines.length === 0) continue;
    if (/^WEBVTT/i.test(lines[0])) continue;
    let i = 0;
    if (/^\d+$/.test(lines[0].trim())) i = 1; // SRT index line
    const timing = lines[i] || '';
    const arrow = timing.split(/\s+-->\s+/);
    if (arrow.length < 2) continue;
    const start = parseTime(arrow[0]);
    const end = parseTime(arrow[1].split(/\s+/)[0]);
    if (start == null || end == null || end <= start) continue;
    const body = lines.slice(i + 1).map(stripTags).filter(Boolean).join('\n');
    if (!body) continue;
    cues.push({ start, end, text: body });
  }
  return cues;
}

const parseSrt = (t) => parseCues(t);
const parseVtt = (t) => parseCues(t);

function toSrt(cues) {
  return cues
    .slice()
    .sort((a, b) => a.start - b.start)
    .map((c, i) => `${i + 1}\n${formatTime(c.start, ',')} --> ${formatTime(c.end, ',')}\n${c.text}`)
    .join('\n\n')
    .concat('\n');
}

function toVtt(cues) {
  return ['WEBVTT', '']
    .concat(
      cues
        .slice()
        .sort((a, b) => a.start - b.start)
        .map((c) => `${formatTime(c.start, '.')} --> ${formatTime(c.end, '.')}\n${c.text}`),
    )
    .join('\n')
    .concat('\n');
}

/** Build cues from a text track's clips (used to export what the timeline shows). */
function cuesFromTrack(track, fps = 30) {
  const clips = (track && Array.isArray(track.clips) ? track.clips : []).filter((c) => c && String(c.text || '').trim());
  const q = (v) => Math.round(Number(v) * fps) / fps;
  return clips
    .map((c) => ({ start: q(c.start), end: q(c.start + c.duration), text: String(c.text).trim() }))
    .sort((a, b) => a.start - b.start);
}

/** Convert cues to text-track clips that the existing compositor and exporter already draw. */
function clipsFromCues(cues, { fontSize = 44, color = '#ffffff', y = 0.86, box = true } = {}) {
  return cues.map((c, i) => ({
    id: `cap_${Date.now().toString(36)}_${i}`,
    text: c.text.replace(/\n/g, ' '),
    start: Math.max(0, c.start),
    duration: Math.max(0.1, c.end - c.start),
    fontSize,
    color,
    x: 0.5,
    y,
    box,
  }));
}

module.exports = { parseCues, parseSrt, parseVtt, toSrt, toVtt, cuesFromTrack, clipsFromCues, formatTime, parseTime };
