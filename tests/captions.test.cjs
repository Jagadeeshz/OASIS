'use strict';
const test = require('node:test');
const assert = require('node:assert');
const captions = require('../electron/services/captions.cjs');

const SRT = `1
00:00:01,000 --> 00:00:03,500
Hello <i>world</i>

2
00:00:04,000 --> 00:00:06,000
Second line
wrapped`;

const VTT = `WEBVTT

00:00:00.500 --> 00:00:02.000
First cue

00:00:02.000 --> 00:00:04.250
Second cue`;

test('parses SRT cues with tags stripped', () => {
  const cues = captions.parseCues(SRT);
  assert.equal(cues.length, 2);
  assert.equal(cues[0].start, 1);
  assert.equal(cues[0].end, 3.5);
  assert.equal(cues[0].text, 'Hello world');
  assert.equal(cues[1].text, 'Second line\nwrapped');
});

test('parses WebVTT and ignores the header', () => {
  const cues = captions.parseVtt(VTT);
  assert.equal(cues.length, 2);
  assert.equal(cues[0].start, 0.5);
  assert.equal(cues[1].end, 4.25);
});

test('rejects malformed and zero-length cues', () => {
  const cues = captions.parseCues('nonsense\n\n1\n00:00:05,000 --> 00:00:05,000\nempty');
  assert.equal(cues.length, 0);
});

test('serialises SRT round-trip with correct timestamps', () => {
  const cues = captions.parseCues(SRT);
  const out = captions.toSrt(cues);
  assert.match(out, /^1\n00:00:01,000 --> 00:00:03,500\nHello world/);
  const again = captions.parseCues(out);
  assert.deepEqual(again.map((c) => [c.start, c.end, c.text]), cues.map((c) => [c.start, c.end, c.text]));
});

test('emits a WebVTT header and dot separators', () => {
  const out = captions.toVtt([{ start: 1.5, end: 2.5, text: 'x' }]);
  assert.match(out, /^WEBVTT\n\n00:00:01\.500 --> 00:00:02\.500\nx/);
});

test('cues from a text track are frame-quantised', () => {
  const track = { clips: [{ start: 0.0166, duration: 1.0006, text: '  hi  ' }] };
  const cues = captions.cuesFromTrack(track, 30);
  assert.equal(cues.length, 1);
  assert.equal(cues[0].start, Math.round(0.0166 * 30) / 30);
  assert.equal(cues[0].text, 'hi');
});

test('clips from cues are timeline-ready', () => {
  const clips = captions.clipsFromCues([{ start: 1, end: 3, text: 'a\nb' }], { fontSize: 50 });
  assert.equal(clips.length, 1);
  assert.equal(clips[0].start, 1);
  assert.equal(clips[0].duration, 2);
  assert.equal(clips[0].text, 'a b');
  assert.equal(clips[0].fontSize, 50);
  assert.ok(clips[0].id.startsWith('cap_'));
});
