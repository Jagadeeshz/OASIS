'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeEnv } = require('./helpers.cjs');
const { openDatabase } = require('../electron/services/db.cjs');
const { mockImageBuffer } = require('../electron/services/png.cjs');
const catalog = require('../electron/services/providers/catalog.cjs');
const media = require('../electron/services/media.cjs');

test('database persists projects across reopen and migrations are idempotent', async () => {
  const env = await makeEnv();
  try {
    env.projects.create({ name: 'Second project', description: 'hello' });
    assert.equal(env.projects.list().length, 2);
    env.db.close();

    const reopened = await openDatabase({ file: env.dbFile });
    const list = reopened.all('SELECT name FROM projects ORDER BY name');
    assert.equal(list.length, 2);
    assert.equal(reopened.migrationsRun.length, 0, 'migrations must not re-run');
    reopened.close();
  } finally {
    env.cleanup();
  }
});

test('secret vault stores, hints, clears and never writes plaintext', async () => {
  const env = await makeEnv();
  try {
    const vault = env.vault;
    assert.equal(vault.has('fal'), false);
    vault.set('fal', 'super-secret-key-123456');
    assert.equal(vault.get('fal'), 'super-secret-key-123456');
    assert.equal(vault.hint('fal'), '••••3456');
    const raw = fs.readFileSync(path.join(env.root, 'vault.json'), 'utf8');
    assert.equal(raw.includes('super-secret-key-123456'), false, 'plaintext key must not be on disk');
    vault.clear('fal');
    assert.equal(vault.has('fal'), false);
  } finally {
    env.cleanup();
  }
});

test('model catalog is internally consistent and covers the required tasks', () => {
  const ids = catalog.ALL_MODELS.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length, 'model ids must be unique');
  for (const m of catalog.ALL_MODELS) {
    assert.ok(m.label && m.task && m.output, `${m.id} needs label/task/output`);
    assert.ok(catalog.TASKS[m.task], `${m.id} has unknown task ${m.task}`);
    const names = (m.params || []).map((p) => p.name);
    assert.equal(new Set(names).size, names.length, `${m.id} has duplicate params`);
    for (const p of m.params || []) {
      if (p.type === 'enum') assert.ok(Array.isArray(p.values) && p.values.length, `${m.id}.${p.name} enum needs values`);
    }
    if (m.task === 'image.edit' || m.task === 'image.removeBackground' || m.id.includes('image-to-video')) {
      assert.ok(m.imageParam, `${m.id} requires an image and must declare imageParam`);
    }
  }
  for (const task of ['image.generate', 'image.edit', 'video.generate', 'audio.speak', 'image.removeBackground']) {
    assert.ok(catalog.modelsForTask(task).length > 0, `no model for ${task}`);
  }
});

test('param validation enforces declared enums and ranges', () => {
  const model = catalog.getModel('fal-ai/flux/schnell');
  const ok = catalog.validateParams(model, { prompt: 'a cat', num_images: 2, image_size: 'square_hd' });
  assert.equal(ok.num_images, 2);
  assert.equal(ok.image_size, 'square_hd');
  assert.throws(() => catalog.validateParams(model, { prompt: 'x', image_size: 'nope' }), /Aspect/);
  assert.throws(() => catalog.validateParams(model, { prompt: 'x', num_images: 99 }), /Images/);
  assert.throws(() => catalog.validateParams(model, { prompt: '' }), /Prompt is required/);
});

test('asset ingest records metadata, tags and versions', async () => {
  const env = await makeEnv();
  try {
    const png = mockImageBuffer({ width: 320, height: 180, prompt: 'unit test', seed: 1 });
    const asset = env.assets.createFromBuffer(png, {
      projectId: env.project.id,
      ext: 'png',
      displayName: 'Test image',
      prompt: 'unit test',
      tags: ['unit', 'Unit'],
      sourceWorkspace: 'test',
      verification: 'verified',
      executionMode: 'live',
    });
    assert.equal(asset.media_type, 'image');
    assert.equal(asset.width, 320);
    assert.equal(asset.height, 180);
    assert.equal(asset.mime_type, 'image/png');
    assert.deepEqual(asset.tags.sort(), ['unit']);
    assert.ok(fs.existsSync(asset.storage_path));
    if (media.ffmpegAvailable()) assert.ok(asset.thumbnail_path && fs.existsSync(asset.thumbnail_path), 'thumbnail missing');

    const derived = env.assets.derive(asset.id, mockImageBuffer({ width: 640, height: 360, prompt: 'v2', seed: 2 }), {
      displayName: 'Test image v2',
      executionMode: 'local',
    });
    assert.equal(derived.version, 2);
    assert.equal(derived.version_root_id, asset.id);
    assert.equal(derived.parent_asset_id, asset.id);
    assert.equal(env.assets.versions(asset.id).length, 2);

    const filtered = env.assets.list({ projectId: env.project.id, mediaType: 'image', search: 'test' });
    assert.equal(filtered.length, 2);
    assert.equal(env.assets.count(env.project.id).images, 2);

    env.assets.archive(derived.id, true);
    assert.equal(env.assets.list({ projectId: env.project.id }).length, 1);
    env.assets.remove(asset.id, { purge: true });
    assert.equal(env.assets.get(asset.id), null);
    assert.equal(fs.existsSync(asset.storage_path), false, 'purge must delete the file');
  } finally {
    env.cleanup();
  }
});
