'use strict';
// Shared job service: one queue and one status model for every workspace.
// Live provider execution, local ffmpeg execution and deterministic mock execution
// all flow through here, so provenance is always recorded in one place.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { nowIso } = require('./db.cjs');
const catalog = require('./providers/catalog.cjs');
const fal = require('./providers/fal.cjs');
const media = require('./media.cjs');
const { mockImageBuffer, hashSeed } = require('./png.cjs');
const { redact } = require('./vault.cjs');

const MOCK_LABEL = 'Mock — unverified';
const PRESETS = {
  square_hd: [1024, 1024],
  square: [512, 512],
  portrait_4_3: [768, 1024],
  portrait_16_9: [576, 1024],
  landscape_4_3: [1024, 768],
  landscape_16_9: [1024, 576],
};

class JobService {
  constructor({ db, assets, settings, vault, onEvent = () => {}, fetchImpl = globalThis.fetch, adapters = {}, pollIntervalMs = 2000 }) {
    this.db = db;
    this.assets = assets;
    this.settings = settings;
    this.vault = vault;
    this.onEvent = onEvent;
    this.fetchImpl = fetchImpl;
    this.adapters = { fal, ...adapters };
    this.controllers = new Map();
    this.pollIntervalMs = pollIntervalMs;
  }

  dto(row) {
    if (!row) return null;
    const model = catalog.getModel(row.model);
    return {
      ...row,
      params: safeParse(row.params, {}),
      input_asset_ids: safeParse(row.input_asset_ids, []),
      result_asset_ids: safeParse(row.result_asset_ids, []),
      cancel_requested: !!row.cancel_requested,
      isMock: row.verification === 'mock-unverified' || row.status === 'mock',
      verificationLabel: row.verification === 'mock-unverified' ? MOCK_LABEL : row.verification,
      modelLabel: model?.label || row.endpoint_id || row.model,
      taskLabel: catalog.TASKS[row.task_type]?.label || row.task_type,
    };
  }

  get(id) {
    return this.dto(this.db.get('SELECT * FROM jobs WHERE id = ?', [id]));
  }

  list({ projectId, status, limit = 100, workspace } = {}) {
    const where = [];
    const params = [];
    if (projectId) {
      where.push('project_id = ?');
      params.push(projectId);
    }
    if (status && status !== 'all') {
      if (status === 'active') where.push("status IN ('queued','submitted','running')");
      else {
        where.push('status = ?');
        params.push(status);
      }
    }
    if (workspace) {
      where.push('workspace = ?');
      params.push(workspace);
    }
    const rows = this.db.all(`SELECT * FROM jobs ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT ?`, [
      ...params,
      limit,
    ]);
    return rows.map((r) => this.dto(r));
  }

  activeCount(projectId) {
    const row = projectId
      ? this.db.get("SELECT COUNT(*) AS n FROM jobs WHERE project_id = ? AND status IN ('queued','submitted','running')", [projectId])
      : this.db.get("SELECT COUNT(*) AS n FROM jobs WHERE status IN ('queued','submitted','running')");
    return row?.n || 0;
  }

  create({ projectId, workspace = 'core', taskType, model, params = {}, inputAssetIds = [], forceMock = false, provider, workflowId = null }) {
    if (!projectId) throw new Error('projectId is required');
    const modelInfo = catalog.getModel(model);
    if (!modelInfo) throw new Error(`Unknown model: ${model}`);
    const task = taskType || modelInfo.task;
    if (modelInfo.task !== task) throw new Error(`${modelInfo.label} does not perform ${task}`);
    if (!catalog.TASKS[task]) throw new Error(`Unknown task: ${task}`);

    const chosenProvider = provider || modelInfo.provider;
    const id = `job_${crypto.randomUUID()}`;
    const now = nowIso();

    // Execution mode is decided up front and recorded, never inferred later.
    let executionMode = 'live';
    let mockReason = null;
    if (chosenProvider === 'mock') {
      executionMode = 'mock';
      mockReason = 'Mock model selected explicitly';
    } else if (chosenProvider === 'local') {
      executionMode = 'local';
    } else if (forceMock) {
      executionMode = 'mock';
      mockReason = 'Mock mode requested by user';
    } else {
      const usable = this.settings.usable(chosenProvider);
      if (!usable.usable) {
        executionMode = 'mock';
        mockReason = usable.reason;
      }
    }

    this.db.tx(() =>
      this.db.run(
        `INSERT INTO jobs (id, project_id, workspace, task_type, provider, model, endpoint_id, workflow_id, input_asset_ids, params, status,
          progress, created_at, updated_at, verification, execution_mode, mock_reason)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          id,
          projectId,
          workspace,
          task,
          chosenProvider,
          model,
          chosenProvider === 'fal' ? model : null,
          workflowId,
          JSON.stringify(inputAssetIds),
          JSON.stringify(params),
          'queued',
          0,
          now,
          now,
          executionMode === 'mock' ? 'mock-unverified' : 'unverified',
          executionMode,
          mockReason,
        ],
      ),
    );
    if (executionMode === 'mock') {
      this.db.tx(() => this.db.run('UPDATE jobs SET status = ? WHERE id = ?', ['mock', id]));
    }
    this.settings.log('info', 'job', `job created ${task} (${model})`, { id, executionMode, mockReason });
    this._emit('job:created', id);
    return this.get(id);
  }

  /** Fire-and-forget execution with error capture. */
  start(id) {
    this.execute(id).catch((err) => {
      /* execute() records failures; nothing to rethrow here */
    });
    return this.get(id);
  }

  async execute(id) {
    const job = this.get(id);
    if (!job) throw new Error('Job not found');
    if (['succeeded', 'failed', 'cancelled'].includes(job.status)) return job;
    const model = catalog.getModel(job.model);
    if (!model) return this._fail(job, `Unknown model ${job.model}`);

    this._update(job.id, { status: job.execution_mode === 'mock' ? 'mock' : 'running', progress: 0.05, error: null });
    try {
      if (job.execution_mode === 'mock') {
        await this._runMock(job, model);
      } else if (model.provider === 'local') {
        await this._runLocal(job, model);
      } else if (model.provider === 'fal') {
        await this._runFal(job, model);
      } else {
        throw new Error(`No executor for provider ${model.provider}`);
      }
      return this.get(id);
    } catch (err) {
      if (err && err.cancelled) {
        this._update(job.id, { status: 'cancelled', error: 'Cancelled by user', progress: 0 });
        this.settings.log('warn', 'job', `job cancelled ${job.id}`, { task: job.task_type });
        return this.get(id);
      }
      return this._fail(job, err);
    } finally {
      this.controllers.delete(id);
    }
  }

  _fail(job, err) {
    const secret = this.vault?.get?.(job.provider);
    const message = redact(err?.message || String(err), [secret]).slice(0, 2000);
    this._update(job.id, { status: 'failed', error: message, progress: 0 });
    this.settings.log('error', 'job', `job failed ${job.id}: ${message}`, { task: job.task_type, provider: job.provider });
    return this.get(job.id);
  }

  _update(id, patch) {
    const sets = [];
    const params = [];
    for (const [k, v] of Object.entries(patch)) {
      sets.push(`${k} = ?`);
      params.push(v);
    }
    sets.push('updated_at = ?');
    params.push(nowIso(), id);
    this.db.run(`UPDATE jobs SET ${sets.join(', ')} WHERE id = ?`, params);
    this.db.schedulePersist();
    this._emit('job:update', id);
  }

  _emit(type, id) {
    try {
      this.onEvent({ type, job: this.get(id) });
    } catch {
      /* ignore listener errors */
    }
  }

  _cancelled(id) {
    const row = this.db.get('SELECT cancel_requested FROM jobs WHERE id = ?', [id]);
    return !!(row && row.cancel_requested);
  }

  cancel(id) {
    const job = this.get(id);
    if (!job) return false;
    if (['succeeded', 'failed', 'cancelled'].includes(job.status)) return false;
    this._update(id, { cancel_requested: 1 });
    const ctrl = this.controllers.get(id);
    if (ctrl) ctrl.abort(new Error('cancelled'));
    const secret = this.vault?.get?.(job.provider);
    if (job.provider === 'fal' && job.poll_url) {
      const cancelUrl = String(job.poll_url).replace(/\/status$/, '/cancel');
      fal.cancel({ cancelUrl, secret, fetchImpl: this.fetchImpl }).catch(() => {});
    }
    if (['queued', 'mock'].includes(job.status)) this._update(id, { status: 'cancelled', error: 'Cancelled by user' });
    return true;
  }

  retry(id) {
    const job = this.get(id);
    if (!job) throw new Error('Job not found');
    if (!['failed', 'cancelled'].includes(job.status)) throw new Error('Only failed or cancelled jobs can be retried');
    this._update(id, { status: job.execution_mode === 'mock' ? 'mock' : 'queued', error: null, progress: 0, cancel_requested: 0, attempts: (job.attempts || 0) + 1 });
    return this.start(id);
  }

  // ---------- executors ----------

  async _runFal(job, model) {
    if (!job.endpoint_id) throw new Error('fal endpoint missing on job');
    const secret = this.vault.get('fal');
    if (!secret) throw new Error('fal.ai API key is not configured');
    const ctrl = new AbortController();
    this.controllers.set(job.id, ctrl);

    const validated = catalog.validateParams(model, job.params);
    const input = { ...validated };
    if (model.imageParam) {
      const assetId = job.input_asset_ids[0];
      if (!assetId) throw new Error(`${model.label} requires a source image`);
      input[model.imageParam] = this._dataUri(assetId);
    }
    if (model.endImageParam && job.params.endImageAssetId) {
      input[model.endImageParam] = this._dataUri(job.params.endImageAssetId);
    }
    delete input.endImageAssetId;

    const sub = await fal.submit({ endpointId: job.endpoint_id, input, secret, fetchImpl: this.fetchImpl });
    this._update(job.id, {
      status: 'submitted',
      progress: 0.12,
      provider_job_id: sub.requestId,
      poll_url: sub.statusUrl,
      response_url: sub.responseUrl,
    });
    this.settings.log('info', 'fal', `submitted ${model.id}`, { requestId: sub.requestId, queuePosition: sub.queuePosition });

    const deadline = Date.now() + 20 * 60 * 1000;
    let consecutiveErrors = 0;
    let payload = null;
    while (Date.now() < deadline) {
      if (this._cancelled(job.id)) throw Object.assign(new Error('cancelled'), { cancelled: true });
      await sleep(this.pollIntervalMs);
      let st;
      try {
        st = await fal.status({ statusUrl: sub.statusUrl, secret, fetchImpl: this.fetchImpl });
        consecutiveErrors = 0;
      } catch (err) {
        consecutiveErrors++;
        if (consecutiveErrors >= 6 || err.status === 401 || err.status === 403) throw err;
        continue;
      }
      if (st.status === 'IN_QUEUE') {
        this._update(job.id, { status: 'submitted', progress: 0.15 });
      } else if (st.status === 'IN_PROGRESS') {
        this._update(job.id, { status: 'running', progress: 0.45 });
      } else if (st.status === 'COMPLETED') {
        payload = await fal.result({ responseUrl: sub.responseUrl, secret, fetchImpl: this.fetchImpl });
        this._update(job.id, { progress: 0.75 });
        break;
      } else if (st.status === 'FAILED' || st.status === 'ERROR') {
        throw new Error(`fal.ai reported ${st.status}: ${st.error || st.detail || 'no detail'}`);
      } else {
        this._update(job.id, { status: 'running', progress: 0.4 });
      }
    }
    if (!payload) throw new Error('Timed out waiting for fal.ai (20 min)');

    const outputs = fal.extractOutputs(model, payload);
    const urls = [...outputs.images, outputs.video, outputs.audio].filter(Boolean);
    if (!urls.length) throw new Error('fal.ai returned no media in its response');

    const created = [];
    for (const url of urls) {
      const asset = await this.assets.downloadToAsset(url, {
        projectId: job.project_id,
        sourceWorkspace: job.workspace,
        displayName: `${model.label} ${new Date().toISOString().slice(11, 19)}`,
        prompt: job.params.prompt || job.params.text || null,
        provider: 'fal',
        model: model.id,
        jobId: job.id,
        workflowId: job.workflow_id || null,
        verification: 'verified',
        executionMode: 'live',
        tags: [job.workspace, model.task],
      });
      created.push(asset.id);
    }
    this._update(job.id, {
      status: 'succeeded',
      progress: 1,
      verification: 'verified',
      result_asset_ids: JSON.stringify(created),
      error: null,
    });
    this.settings.log('info', 'fal', `job ${job.id} succeeded with ${created.length} asset(s)`);
  }

  async _runLocal(job, model) {
    const assetId = job.input_asset_ids[0];
    if (!assetId) throw new Error(`${model.label} needs a source asset`);
    const src = this.assets.absolutePath(assetId);
    if (!src) throw new Error('Source asset file is missing');
    if (!media.ffmpegAvailable()) throw new Error('ffmpeg is not installed or not on PATH — local processing is unavailable');
    const outDir = path.dirname(this.assets.tmpFile('bin'));
    const outExt = model.output === 'video' ? 'mp4' : 'png';
    const out = path.join(outDir, `${job.id}.${outExt}`);
    const p = job.params || {};
    let vf;
    if (job.task_type === 'image.upscale') {
      const s = Number(p.scale || 2);
      vf = `scale=iw*${s}:ih*${s}:flags=lanczos`;
    } else if (job.task_type === 'image.enhance') {
      if (p.strength === 'light') vf = 'hqdn3d=2:1:3:3';
      else if (p.strength === 'strong') vf = 'hqdn3d=8:6:12:12';
      else if (p.strength === 'medium') vf = 'hqdn3d=4:3:6:6';
      else vf = `eq=contrast=1.06:saturation=1.05,unsharp=5:5:${Number(p.amount || 1)}:5:5:0`;
    } else if (job.task_type === 'image.filter') {
      const parts = [
        `eq=brightness=${Number(p.brightness || 0)}:contrast=${Number(p.contrast ?? 1)}:saturation=${Number(p.saturation ?? 1)}`,
      ];
      if (Number(p.hue)) parts.push(`hue=h=${Number(p.hue)}`);
      if (Number(p.blur) > 0) parts.push(`gblur=sigma=${Number(p.blur)}`);
      if (Number(p.sharpen) > 0) parts.push(`unsharp=5:5:${Number(p.sharpen)}:5:5:0`);
      if (p.vignette) parts.push('vignette=PI/5');
      if (Number(p.grain) > 0) parts.push(`noise=alls=${Number(p.grain)}:allf=t`);
      vf = parts.join(',');
    } else if (job.task_type === 'video.enhance') {
      const h = Number(p.height || 1080);
      vf = `scale=-2:${h}:flags=lanczos,unsharp=5:5:0.8:3:3:0.4`;
    } else {
      throw new Error(`No local implementation for ${job.task_type}`);
    }
    const base = ['-y', '-hide_banner', '-loglevel', 'error', '-i', src, '-vf', vf];
    const r =
      model.output === 'video'
        ? media.run(media.FFMPEG, [...base, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', out])
        : media.run(media.FFMPEG, [...base, out]);
    if (r.code !== 0) throw new Error(`ffmpeg failed: ${r.stderr.slice(0, 400)}`);
    if (!fs.existsSync(out)) throw new Error('ffmpeg produced no output file');
    const asset = this.assets.derive(assetId, fs.readFileSync(out), {
      sourceWorkspace: job.workspace,
      displayName: `${model.label} — ${job.params?.prompt?.slice(0, 40) || 'result'}`,
      provider: 'local',
      model: model.id,
      jobId: job.id,
      executionMode: 'local',
      verification: 'verified',
      prompt: job.params?.prompt || null,
      tags: [job.workspace, 'local'],
    });
    try {
      fs.unlinkSync(out);
    } catch {
      /* ignore */
    }
    this._update(job.id, { status: 'succeeded', progress: 1, verification: 'verified', result_asset_ids: JSON.stringify([asset.id]) });
    this.settings.log('info', 'local', `job ${job.id} completed with ${model.id}`);
  }

  async _runMock(job, model) {
    const reason = job.mock_reason || 'Provider unavailable — deterministic mock result';
    const p = job.params || {};
    const prompt = String(p.prompt || p.text || 'untitled');
    const seed = Number(p.seed ?? 0) || 0;
    const created = [];
    const mk = (buffer, ext, mediaType, extra = {}) =>
      this.assets.createFromBuffer(buffer, {
        projectId: job.project_id,
        ext,
        mediaType,
        sourceWorkspace: job.workspace,
        displayName: `${model.label} (mock) ${new Date().toISOString().slice(11, 19)}`,
        prompt,
        provider: 'mock',
        model: model.id,
        jobId: job.id,
        workflowId: job.workflow_id || null,
        verification: 'mock-unverified',
        executionMode: 'mock',
        mockReason: reason,
        tags: [job.workspace, 'mock'],
        metadata: { intendedProvider: job.provider, intendedModel: job.model, actualExecutor: 'mock', mockReason: reason, ...(extra.metadata || {}) },
      });

    this._update(job.id, { progress: 0.3 });

    if (job.task_type === 'image.generate' || job.task_type === 'image.edit' || job.task_type === 'image.removeBackground') {
      const count = Math.max(1, Math.min(4, Number(p.num_images || 1)));
      const [w, h] = PRESETS[p.image_size] || [1024, 768];
      for (let i = 0; i < count; i++) {
        const buffer = mockImageBuffer({ width: w, height: h, prompt: `${prompt}#${seed}#${i}`, seed, label: MOCK_LABEL });
        created.push(mk(buffer, 'png', 'image', { metadata: { variant: i + 1, width: w, height: h } }).id);
      }
    } else if (job.task_type === 'video.generate') {
      const outDir = path.join(path.dirname(this.assets.tmpFile('bin')));
      const out = path.join(outDir, `${job.id}-mock.mp4`);
      media.makeMockVideo(out, { width: 640, height: 360, duration: 3, label: 'MOCK - UNVERIFIED', prompt });
      const asset = mk(fs.readFileSync(out), 'mp4', 'video', { metadata: { durationSec: 3 } });
      created.push(asset.id);
      try {
        fs.unlinkSync(out);
      } catch {
        /* ignore */
      }
    } else if (job.task_type === 'audio.speak') {
      const outDir = path.dirname(this.assets.tmpFile('bin'));
      const out = path.join(outDir, `${job.id}-mock.wav`);
      media.writeWav(out, { duration: Math.max(2, Math.min(8, String(p.text || '').length / 14)), freq: 160 + (hashSeed(prompt) % 240) });
      const asset = mk(fs.readFileSync(out), 'wav', 'audio');
      created.push(asset.id);
      try {
        fs.unlinkSync(out);
      } catch {
        /* ignore */
      }
    } else {
      throw new Error(`Mock executor does not implement ${job.task_type}`);
    }

    this._update(job.id, {
      status: 'mock',
      progress: 1,
      verification: 'mock-unverified',
      result_asset_ids: JSON.stringify(created),
      error: null,
    });
    this.settings.log('warn', 'mock', `mock result created for ${job.id}: ${reason}`, { assets: created.length });
  }

  _dataUri(assetId) {
    const file = this.assets.absolutePath(assetId);
    if (!file) throw new Error('Source asset file is missing');
    const stat = fs.statSync(file);
    if (stat.size > 12 * 1024 * 1024) throw new Error('Source image is larger than 12 MB — fal accepts hosted URLs or data URIs');
    const mime = media.mimeFor(file);
    return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function safeParse(s, fallback) {
  try {
    return JSON.parse(s || 'null') ?? fallback;
  } catch {
    return fallback;
  }
}

module.exports = { JobService, MOCK_LABEL };
