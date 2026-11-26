'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { makeEnv, makeFalFetch } = require('./helpers.cjs');
const { mockImageBuffer } = require('../electron/services/png.cjs');
const media = require('../electron/services/media.cjs');

const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

test('mock generation is deterministic, labelled and saved to Asset Studio', async () => {
  const env = await makeEnv();
  try {
    const params = { prompt: 'a lighthouse in fog', seed: 1234, num_images: 2, image_size: 'square_hd' };
    const a = await env.jobs.execute(
      env.jobs.create({ projectId: env.project.id, workspace: 'photocraft', model: 'mock/image', params }).id,
    );
    assert.equal(a.status, 'mock');
    assert.equal(a.verification, 'mock-unverified');
    assert.equal(a.verificationLabel, 'Mock — unverified');
    assert.equal(a.execution_mode, 'mock');
    assert.ok(a.mock_reason);
    assert.equal(a.result_asset_ids.length, 2);

    const first = env.assets.get(a.result_asset_ids[0]);
    assert.equal(first.verification, 'mock-unverified');
    assert.equal(first.execution_mode, 'mock');
    assert.ok(first.mock_reason);
    assert.equal(first.metadata.intendedProvider, 'mock');
    assert.equal(first.metadata.actualExecutor, 'mock');

    const b = await env.jobs.execute(
      env.jobs.create({ projectId: env.project.id, workspace: 'photocraft', model: 'mock/image', params }).id,
    );
    const second = env.assets.get(b.result_asset_ids[0]);
    assert.equal(sha(first.storage_path), sha(second.storage_path), 'mock output must be deterministic for the same params');
    assert.notEqual(sha(first.storage_path), sha(env.assets.get(a.result_asset_ids[1]).storage_path), 'variants should differ');
  } finally {
    env.cleanup();
  }
});

test('fal is mocked with a truthful reason while the key is missing', async () => {
  const env = await makeEnv();
  try {
    const job = env.jobs.create({
      projectId: env.project.id,
      workspace: 'photocraft',
      model: 'fal-ai/flux/schnell',
      params: { prompt: 'a fal job without a key' },
    });
    assert.equal(job.execution_mode, 'mock');
    assert.match(job.mock_reason, /API key is not configured/);
    const done = await env.jobs.execute(job.id);
    assert.equal(done.status, 'mock');
    assert.equal(done.provider, 'fal');
    assert.equal(done.verification, 'mock-unverified');
  } finally {
    env.cleanup();
  }
});

test('fal live job downloads results and records verified provenance', async () => {
  const png = mockImageBuffer({ width: 256, height: 256, prompt: 'fal live', seed: 9 });
  const fetchImpl = makeFalFetch({ imageBuffer: png });
  const env = await makeEnv({ fetchImpl });
  try {
    env.settings.setEnabled('fal', true);
    env.settings.saveConfig('fal', { secret: 'fal-test-key-abcdef123456' });

    const job = env.jobs.create({
      projectId: env.project.id,
      workspace: 'photocraft',
      model: 'fal-ai/flux/schnell',
      params: { prompt: 'a fal live image', num_images: 1, image_size: 'square_hd' },
    });
    assert.equal(job.execution_mode, 'live', 'with a key configured the job must run live');
    const done = await env.jobs.execute(job.id);
    assert.equal(done.status, 'succeeded', done.error || '');
    assert.equal(done.verification, 'verified');
    assert.equal(done.provider_job_id, 'req_test_1');
    assert.equal(done.result_asset_ids.length, 1);

    const asset = env.assets.get(done.result_asset_ids[0]);
    assert.equal(asset.provider, 'fal');
    assert.equal(asset.model, 'fal-ai/flux/schnell');
    assert.equal(asset.execution_mode, 'live');
    assert.equal(asset.verification, 'verified');
    assert.equal(asset.job_id, job.id);
    assert.equal(sha(asset.storage_path), crypto.createHash('sha256').update(png).digest('hex'), 'downloaded bytes must match the provider payload');
    assert.ok(fetchImpl.calls.some((c) => c.url.endsWith('/status')));
  } finally {
    env.cleanup();
  }
});

test('provider auth failures fail the job without leaking the key', async () => {
  const fetchImpl = makeFalFetch({ authFail: true });
  const env = await makeEnv({ fetchImpl });
  try {
    const secret = 'fal-secret-should-not-appear-98765';
    env.settings.setEnabled('fal', true);
    env.settings.saveConfig('fal', { secret });
    const job = env.jobs.create({
      projectId: env.project.id,
      workspace: 'photocraft',
      model: 'fal-ai/flux/schnell',
      params: { prompt: 'auth failure' },
    });
    const done = await env.jobs.execute(job.id);
    assert.equal(done.status, 'failed');
    assert.match(done.error, /401/);
    assert.equal(done.error.includes(secret), false, 'error must not contain the API key');
    assert.equal(env.assets.list({ projectId: env.project.id }).length, 0);
  } finally {
    env.cleanup();
  }
});

test('provider connection tests are truthful and isolated', async () => {
  const env = await makeEnv({ fetchImpl: makeFalFetch({ imageBuffer: mockImageBuffer({ width: 32, height: 32 }) }) });
  try {
    const fal = await env.settings.testProvider('fal');
    assert.equal(fal.status, 'not-configured', 'fal is enabled by default but has no key yet');

    env.settings.setEnabled('fal', true);
    const noKey = await env.settings.testProvider('fal');
    assert.equal(noKey.ok, false);
    assert.equal(noKey.status, 'not-configured');

    env.settings.saveConfig('fal', { secret: 'fal-probe-key-123456' });
    const ok = await env.settings.testProvider('fal');
    assert.equal(ok.ok, true);
    assert.equal(ok.status, 'connected');

    const ollama = await env.settings.testProvider('ollama');
    assert.equal(ollama.status, 'disabled');
    assert.equal(env.settings.listProviders().find((p) => p.id === 'deepseek').enabled, false);
  } finally {
    env.cleanup();
  }
});

test('local ffmpeg op produces a versioned asset (skipped without ffmpeg)', async (t) => {
  if (!media.ffmpegAvailable()) return t.skip('ffmpeg not available');
  const env = await makeEnv();
  try {
    const src = env.assets.createFromBuffer(mockImageBuffer({ width: 200, height: 100, prompt: 'upscale me', seed: 3 }), {
      projectId: env.project.id,
      ext: 'png',
      sourceWorkspace: 'test',
    });
    const job = env.jobs.create({
      projectId: env.project.id,
      workspace: 'effectscraft',
      model: 'local/upscale-2x',
      params: { scale: '2' },
      inputAssetIds: [src.id],
    });
    const done = await env.jobs.execute(job.id);
    assert.equal(done.status, 'succeeded', done.error || '');
    const out = env.assets.get(done.result_asset_ids[0]);
    assert.equal(out.width, 400);
    assert.equal(out.height, 200);
    assert.equal(out.parent_asset_id, src.id);
    assert.equal(out.execution_mode, 'local');
  } finally {
    env.cleanup();
  }
});
