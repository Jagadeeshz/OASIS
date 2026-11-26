'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { openDatabase } = require('../electron/services/db.cjs');
const { AssetService } = require('../electron/services/assets.cjs');
const { SecretVault } = require('../electron/services/vault.cjs');
const { SettingsService } = require('../electron/services/settings.cjs');
const { ProjectService } = require('../electron/services/projects.cjs');
const { JobService } = require('../electron/services/jobs.cjs');
const { WorkflowService } = require('../electron/services/workflow.cjs');
const { TimelineService } = require('../electron/services/timeline.cjs');
const { ExportService } = require('../electron/services/exporter.cjs');
const fal = require('../electron/services/providers/fal.cjs');
const deepseek = require('../electron/services/providers/deepseek.cjs');
const ollama = require('../electron/services/providers/ollama.cjs');

async function makeEnv({ fetchImpl, projectName = 'Test Project' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oasis-test-'));
  const dbFile = path.join(root, 'oasis.db');
  const db = await openDatabase({ file: dbFile });
  const assets = new AssetService(db, { root: path.join(root, 'storage'), fetchImpl });
  const vault = new SecretVault({ file: path.join(root, 'vault.json') });
  const settings = new SettingsService({ db, vault, adapters: { fal, deepseek, ollama }, fetchImpl });
  const projects = new ProjectService({ db });
  const project = projects.create({ name: projectName });
  const jobs = new JobService({ db, assets, settings, vault, fetchImpl, pollIntervalMs: 15 });
  const workflows = new WorkflowService({ db, jobs, assets, settings, waitMs: 25 });
  const timelines = new TimelineService({ db, assets });
  const exporter = new ExportService({ db, assets, settings, outDir: path.join(root, 'exports') });
  return {
    root,
    db,
    dbFile,
    assets,
    vault,
    settings,
    projects,
    project,
    jobs,
    workflows,
    timelines,
    exporter,
    cleanup() {
      try {
        db.close();
      } catch {
        /* ignore */
      }
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

/** Fake fal queue: submit → COMPLETED → result pointing at an inline CDN image. */
function makeFalFetch({ imageBuffer, status = 'COMPLETED', authFail = false } = {}) {
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    calls.push({ url, method: opts.method || 'GET' });
    const u = String(url);
    const json = (obj, code = 200) =>
      new Response(JSON.stringify(obj), { status: code, headers: { 'content-type': 'application/json' } });
    if (authFail) return json({ detail: 'Invalid key' }, 401);
    if (u.startsWith('https://queue.fal.run/fal-ai/imageutils/rembg') && opts.method === 'POST') return json({ detail: 'missing image_url' }, 422);
    if (u.startsWith('https://queue.fal.run/') && opts.method === 'POST') {
      return json({
        request_id: 'req_test_1',
        status_url: 'https://queue.fal.run/fal-ai/flux/requests/req_test_1/status',
        response_url: 'https://queue.fal.run/fal-ai/flux/requests/req_test_1',
        cancel_url: 'https://queue.fal.run/fal-ai/flux/requests/req_test_1/cancel',
      });
    }
    if (u.endsWith('/status')) return json({ status, request_id: 'req_test_1' });
    if (u === 'https://queue.fal.run/fal-ai/flux/requests/req_test_1') return json({ images: [{ url: 'https://cdn.example.com/out.png' }], seed: 7 });
    if (u === 'https://cdn.example.com/out.png') {
      return new Response(imageBuffer, { status: 200, headers: { 'content-type': 'image/png', 'content-length': String(imageBuffer.length) } });
    }
    return json({ detail: `unexpected ${u}` }, 404);
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

module.exports = { makeEnv, makeFalFetch };
