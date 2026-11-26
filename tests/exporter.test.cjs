'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeEnv } = require('./helpers.cjs');
const { mockImageBuffer } = require('../electron/services/png.cjs');
const media = require('../electron/services/media.cjs');
const { normalize } = require('../electron/services/timeline.cjs');

function makeMockVideo(root) {
  const out = path.join(root, 'mock-source.mp4');
  media.makeMockVideo(out, { width: 640, height: 360, duration: 3, prompt: 'export test' });
  return out;
}

test('timeline export renders a real mp4 with a provenance manifest', async (t) => {
  if (!media.ffmpegAvailable()) return t.skip('ffmpeg not available');
  const env = await makeEnv();
  try {
    const videoAsset = env.assets.importFile(makeMockVideo(env.root), {
      projectId: env.project.id,
      sourceWorkspace: 'filmcraft',
      provider: 'mock',
      model: 'mock/video',
      verification: 'mock-unverified',
      executionMode: 'mock',
      mockReason: 'unit test fixture',
      prompt: 'export test',
    });
    const wav = path.join(env.root, 'tone.wav');
    media.writeWav(wav, { duration: 3, freq: 220 });
    const audioAsset = env.assets.importFile(wav, {
      projectId: env.project.id,
      sourceWorkspace: 'asset-studio',
      verification: 'verified',
      executionMode: 'local',
    });

    const timeline = normalize({
      width: 640,
      height: 360,
      fps: 24,
      tracks: [
        { id: 'v1', type: 'video', name: 'Video 1', clips: [{ id: 'c1', assetId: videoAsset.id, start: 0, duration: 2, inPoint: 0, transition: 'fade' }] },
        { id: 't1', type: 'text', name: 'Titles', clips: [{ id: 'c2', text: 'Mock — unverified', start: 0.2, duration: 1.4, fontSize: 36, color: '#ffffff' }] },
        { id: 'a1', type: 'audio', name: 'Audio 1', clips: [{ id: 'c3', assetId: audioAsset.id, start: 0, duration: 2, volume: 0.4 }] },
      ],
    });

    const exp = env.exporter.create({ projectId: env.project.id, timelineId: 'tl_test', timeline, name: 'unit export' });
    let done = env.exporter.get(exp.id);
    const deadline = Date.now() + 60000;
    while (['queued', 'running'].includes(done.status) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 250));
      done = env.exporter.get(exp.id);
    }
    assert.equal(done.status, 'succeeded', done.error || 'export did not finish');
    assert.ok(fs.existsSync(done.output_path), 'export file missing');
    assert.ok(fs.existsSync(done.manifest_path), 'manifest missing');

    const probe = media.probe(done.output_path);
    assert.equal(probe.width, 640);
    assert.equal(probe.height, 360);
    assert.ok(probe.duration >= 1.8 && probe.duration <= 2.6, `unexpected duration ${probe.duration}`);

    const manifest = JSON.parse(fs.readFileSync(done.manifest_path, 'utf8'));
    assert.equal(manifest.verification, 'mock-unverified');
    assert.equal(manifest.verificationLabel, 'Mock — unverified');
    assert.equal(manifest.sources.length, 2);
    assert.match(manifest.output.sha256, /^[0-9a-f]{64}$/);
    assert.equal(manifest.output.bytes, fs.statSync(done.output_path).size);
    assert.ok(manifest.engine.version);

    const exportedAsset = env.assets.list({ projectId: env.project.id, search: 'Export' });
    assert.ok(exportedAsset.length >= 1, 'export should be registered in Asset Studio');
    assert.equal(exportedAsset[0].verification, 'mock-unverified', 'provenance must survive export');
  } finally {
    env.cleanup();
  }
});

test('export fails cleanly when a clip references a missing asset', async (t) => {
  if (!media.ffmpegAvailable()) return t.skip('ffmpeg not available');
  const env = await makeEnv();
  try {
    const timeline = normalize({
      tracks: [{ id: 'v1', type: 'video', name: 'Video 1', clips: [{ id: 'x', assetId: 'ast_missing', start: 0, duration: 1 }] }],
    });
    const exp = env.exporter.create({ projectId: env.project.id, timeline, name: 'broken' });
    let done = env.exporter.get(exp.id);
    const deadline = Date.now() + 20000;
    while (['queued', 'running'].includes(done.status) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 150));
      done = env.exporter.get(exp.id);
    }
    assert.equal(done.status, 'failed');
    assert.match(done.error, /Missing asset/);
  } finally {
    env.cleanup();
  }
});

test('timeline save/load normalizes clips and reports duration', async () => {
  const env = await makeEnv();
  try {
    const tl = env.timelines.save({
      projectId: env.project.id,
      name: 'Edit 1',
      data: {
        tracks: [
          { id: 'v1', type: 'video', clips: [{ clipId: 'ignored', assetId: null, start: 1, duration: 2.5 }] },
          { id: 't1', type: 'text', clips: [{ text: 'Hi', start: 0, duration: 3 }] },
        ],
      },
    });
    assert.equal(tl.data.tracks[0].clips[0].start, 1);
    assert.equal(tl.duration, 3.5);
    const loaded = env.timelines.get(tl.id);
    assert.equal(loaded.clipCount, 2);
    const problems = env.timelines.validate(loaded.data);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /has no asset/);
  } finally {
    env.cleanup();
  }
});
