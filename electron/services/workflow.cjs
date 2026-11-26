'use strict';
// AI Canvas workflow engine: allowlisted node types, typed ports, topological
// execution, real job dispatch through the shared job service.
// Node configs are data only — no user code is ever evaluated.
const crypto = require('node:crypto');
const { nowIso } = require('./db.cjs');
const catalog = require('./providers/catalog.cjs');

const PORT_TYPES = {
  prompt: ['prompt', 'text'],
  text: ['text', 'prompt'],
  image: ['image'],
  video: ['video'],
  audio: ['audio'],
  media: ['image', 'video', 'audio'],
  any: ['prompt', 'text', 'image', 'video', 'audio'],
};

const NODE_TYPES = {
  'prompt.text': {
    label: 'Prompt',
    category: 'Input',
    inputs: [],
    outputs: [{ name: 'prompt', type: 'prompt' }],
    config: { text: '' },
    description: 'Static prompt text for downstream generators.',
  },
  'asset.image': {
    label: 'Image Asset',
    category: 'Input',
    inputs: [],
    outputs: [{ name: 'image', type: 'image' }],
    config: { assetId: null },
    description: 'Reference image from Asset Studio.',
  },
  'model.image': {
    label: 'Image Model',
    category: 'Model',
    inputs: [],
    outputs: [{ name: 'model', type: 'text' }],
    config: { model: 'fal-ai/flux/schnell' },
    description: 'Selects the image model used by generator nodes.',
  },
  'model.video': {
    label: 'Video Model',
    category: 'Model',
    inputs: [],
    outputs: [{ name: 'model', type: 'text' }],
    config: { model: 'fal-ai/wan/v2.2-a14b/text-to-video' },
    description: 'Selects the video model used by video nodes.',
  },
  'image.generate': {
    label: 'Image Generation',
    category: 'Generate',
    inputs: [{ name: 'prompt', type: 'prompt' }, { name: 'image', type: 'image', optional: true }, { name: 'model', type: 'text', optional: true }],
    outputs: [{ name: 'image', type: 'image' }],
    config: { model: 'fal-ai/flux/schnell', params: {}, count: 1 },
    description: 'Generate images. Uses prompt + optional reference image.',
  },
  'image.edit': {
    label: 'Image Edit',
    category: 'Generate',
    inputs: [{ name: 'prompt', type: 'prompt' }, { name: 'image', type: 'image' }, { name: 'model', type: 'text', optional: true }],
    outputs: [{ name: 'image', type: 'image' }],
    config: { model: 'fal-ai/flux/dev/image-to-image', params: {} },
    description: 'Prompt-guided edit of an input image.',
  },
  'image.removeBackground': {
    label: 'Remove Background',
    category: 'Generate',
    inputs: [{ name: 'image', type: 'image' }, { name: 'model', type: 'text', optional: true }],
    outputs: [{ name: 'image', type: 'image' }],
    config: { model: 'fal-ai/imageutils/rembg', params: {} },
    description: 'Cut the subject out of an image.',
  },
  'video.generate': {
    label: 'Video Generation',
    category: 'Generate',
    inputs: [{ name: 'prompt', type: 'prompt' }, { name: 'image', type: 'image', optional: true }, { name: 'model', type: 'text', optional: true }],
    outputs: [{ name: 'video', type: 'video' }],
    config: { model: 'fal-ai/wan/v2.2-a14b/text-to-video', params: {} },
    description: 'Generate a clip from text, or animate a still image.',
  },
  'audio.speak': {
    label: 'Speech',
    category: 'Generate',
    inputs: [{ name: 'text', type: 'text' }, { name: 'model', type: 'text', optional: true }],
    outputs: [{ name: 'audio', type: 'audio' }],
    config: { model: 'fal-ai/elevenlabs/tts/eleven-v3', params: {} },
    description: 'Turn text into narration audio.',
  },
  upscale: {
    label: 'Upscale / Enhance',
    category: 'Process',
    inputs: [{ name: 'image', type: 'image' }, { name: 'model', type: 'text', optional: true }],
    outputs: [{ name: 'image', type: 'image' }],
    config: { model: 'local/upscale-2x', params: {} },
    description: 'Local ffmpeg upscale of an image.',
  },
  batch: {
    label: 'Batch Generate',
    category: 'Generate',
    inputs: [{ name: 'prompt', type: 'prompt' }, { name: 'model', type: 'text', optional: true }],
    outputs: [{ name: 'image', type: 'image' }],
    config: { model: 'fal-ai/flux/schnell', params: {}, count: 2 },
    description: 'Run the same generation several times.',
  },
  storyboard: {
    label: 'Storyboard',
    category: 'Generate',
    inputs: [{ name: 'prompt', type: 'prompt' }],
    outputs: [{ name: 'prompt', type: 'prompt' }, { name: 'shots', type: 'text' }],
    config: { shots: 3 },
    description: 'Split one idea into numbered shot prompts.',
  },
  sequence: {
    label: 'Sequence',
    category: 'Output',
    inputs: [{ name: 'media', type: 'media' }],
    outputs: [{ name: 'media', type: 'media' }],
    config: {},
    description: 'Collects outputs in order for review or export.',
  },
  'output.save': {
    label: 'Output / Save',
    category: 'Output',
    inputs: [{ name: 'media', type: 'media' }],
    outputs: [],
    config: { tags: [] },
    description: 'Marks a media result as the workflow output (assets are already in Asset Studio).',
  },
};

const MAX_NODES = 64;

function portType(node, handle, dir) {
  const def = NODE_TYPES[node.type];
  if (!def) return null;
  const ports = dir === 'out' ? def.outputs : def.inputs;
  return ports.find((p) => p.name === handle)?.type || null;
}

function compatible(from, to) {
  if (!from || !to) return false;
  if (to === 'any' || from === 'any') return true;
  const MEDIA = ['image', 'video', 'audio'];
  if (to === 'media') return MEDIA.includes(from);
  if (from === 'media') return MEDIA.includes(to);
  if (to === 'prompt') return from === 'prompt' || from === 'text';
  if (to === 'text') return from === 'text' || from === 'prompt';
  return from === to;
}

function validateGraph(graph) {
  const errors = [];
  if (!graph || !Array.isArray(graph.nodes)) return { ok: false, errors: ['Workflow has no nodes'] };
  if (graph.nodes.length === 0) return { ok: false, errors: ['Workflow has no nodes'] };
  if (graph.nodes.length > MAX_NODES) errors.push(`Workflow exceeds ${MAX_NODES} nodes`);
  const ids = new Set();
  for (const n of graph.nodes) {
    if (!n.id) errors.push('Node without id');
    if (ids.has(n.id)) errors.push(`Duplicate node id ${n.id}`);
    ids.add(n.id);
    if (!NODE_TYPES[n.type]) errors.push(`Unknown node type "${n.type}"`);
  }
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  for (const e of edges) {
    const src = graph.nodes.find((n) => n.id === e.source);
    const dst = graph.nodes.find((n) => n.id === e.target);
    if (!src || !dst) {
      errors.push(`Edge ${e.id || ''} references a missing node`);
      continue;
    }
    const from = portType(src, e.sourceHandle, 'out');
    const to = portType(dst, e.targetHandle, 'in');
    if (!from || !to) errors.push(`Edge ${e.id || ''} uses an unknown port (${e.sourceHandle} → ${e.targetHandle})`);
    else if (!compatible(from, to)) errors.push(`Cannot connect ${from} to ${to} (${src.type} → ${dst.type})`);
  }
  // cycle detection
  const state = new Map();
  const adj = new Map(graph.nodes.map((n) => [n.id, []]));
  for (const e of edges) if (adj.has(e.source) && adj.has(e.target)) adj.get(e.source).push(e.target);
  const dfs = (id, path) => {
    const s = state.get(id);
    if (s === 1) {
      errors.push(`Cycle detected: ${[...path, id].join(' → ')}`);
      return;
    }
    if (s === 2) return;
    state.set(id, 1);
    for (const next of adj.get(id) || []) dfs(next, [...path, id]);
    state.set(id, 2);
  };
  for (const n of graph.nodes) dfs(n.id, []);
  return { ok: errors.length === 0, errors };
}

class WorkflowService {
  constructor({ db, jobs, assets, settings, onEvent = () => {}, waitMs = 700 }) {
    this.db = db;
    this.jobs = jobs;
    this.assets = assets;
    this.settings = settings;
    this.onEvent = onEvent;
    this.cancelledRuns = new Set();
    this.waitMs = waitMs;
  }

  list(projectId) {
    const rows = this.db.all('SELECT * FROM workflows WHERE project_id = ? ORDER BY updated_at DESC', [projectId]);
    return rows.map((r) => this.dto(r));
  }

  dto(row) {
    if (!row) return null;
    const graph = safeParse(row.graph, { nodes: [], edges: [] });
    return { ...row, graph, nodeCount: graph.nodes?.length || 0, edgeCount: graph.edges?.length || 0 };
  }

  get(id) {
    return this.dto(this.db.get('SELECT * FROM workflows WHERE id = ?', [id]));
  }

  save({ id, projectId, name, description = '', graph }) {
    if (!projectId) throw new Error('projectId is required');
    const check = validateGraph(graph);
    if (!check.ok) {
      const err = new Error(`Invalid workflow: ${check.errors.slice(0, 4).join('; ')}`);
      err.validation = check.errors;
      throw err;
    }
    const now = nowIso();
    if (id) {
      const existing = this.get(id);
      if (!existing) throw new Error('Workflow not found');
      this.db.tx(() =>
        this.db.run('UPDATE workflows SET name = ?, description = ?, graph = ?, updated_at = ? WHERE id = ?', [
          String(name || existing.name).slice(0, 120),
          String(description || ''),
          JSON.stringify(graph),
          now,
          id,
        ]),
      );
      return this.get(id);
    }
    const newId = `wf_${crypto.randomUUID()}`;
    this.db.tx(() =>
      this.db.run('INSERT INTO workflows (id, project_id, name, description, graph, created_at, updated_at) VALUES (?,?,?,?,?,?,?)', [
        newId,
        projectId,
        String(name || 'Untitled workflow').slice(0, 120),
        String(description || ''),
        JSON.stringify(graph),
        now,
        now,
      ]),
    );
    return this.get(newId);
  }

  remove(id) {
    this.db.tx(() => this.db.run('DELETE FROM workflows WHERE id = ?', [id]));
    return true;
  }

  runs(workflowId, limit = 20) {
    return this.db
      .all('SELECT * FROM workflow_runs WHERE workflow_id = ? ORDER BY started_at DESC LIMIT ?', [workflowId, limit])
      .map((r) => ({ ...r, node_states: safeParse(r.node_states, {}), result_asset_ids: safeParse(r.result_asset_ids, []) }));
  }

  cancel(runId) {
    this.cancelledRuns.add(runId);
    const run = this.db.get('SELECT * FROM workflow_runs WHERE id = ?', [runId]);
    if (run) {
      const states = safeParse(run.node_states, {});
      for (const [nodeId, st] of Object.entries(states)) {
        if (st.jobId) this.jobs.cancel(st.jobId);
      }
    }
    return true;
  }

  /**
   * Execute a workflow. If `graph` is supplied it is validated and used directly
   * (unsaved canvas), otherwise the stored workflow graph is used.
   */
  async run({ workflowId, projectId, graph, forceMock = false, onStart = null } = {}) {
    let wf = workflowId ? this.get(workflowId) : null;
    const runGraph = graph || wf?.graph;
    if (!runGraph) throw new Error('No workflow graph to run');
    const check = validateGraph(runGraph);
    if (!check.ok) {
      const err = new Error(`Invalid workflow: ${check.errors.slice(0, 4).join('; ')}`);
      err.validation = check.errors;
      throw err;
    }
    if (!projectId) throw new Error('projectId is required');

    const runId = `run_${crypto.randomUUID()}`;
    const nodeStates = {};
    for (const n of runGraph.nodes) nodeStates[n.id] = { status: 'pending' };
    this.db.tx(() =>
      this.db.run('INSERT INTO workflow_runs (id, workflow_id, project_id, status, started_at, node_states) VALUES (?,?,?,?,?,?)', [
        runId,
        workflowId || 'adhoc',
        projectId,
        'running',
        nowIso(),
        JSON.stringify(nodeStates),
      ]),
    );
    if (workflowId && wf) {
      this.db.tx(() => this.db.run('UPDATE workflows SET last_run_at = ? WHERE id = ?', [nowIso(), workflowId]));
    }
    this.onEvent({ type: 'run:update', runId, states: nodeStates, status: 'running' });
    if (typeof onStart === 'function') onStart(runId);

    const incoming = new Map(runGraph.nodes.map((n) => [n.id, []]));
    for (const e of runGraph.edges || []) incoming.get(e.target)?.push(e);

    const order = topoOrder(runGraph);
    const results = new Map(); // nodeId -> { outputs }
    const producedAssets = [];
    const setState = (nodeId, state) => {
      nodeStates[nodeId] = { ...nodeStates[nodeId], ...state };
      this.db.run('UPDATE workflow_runs SET node_states = ? WHERE id = ?', [JSON.stringify(nodeStates), runId]);
      this.db.schedulePersist();
      this.onEvent({ type: 'run:update', runId, states: nodeStates, status: 'running' });
    if (typeof onStart === 'function') onStart(runId);
    };

    try {
      for (const node of order) {
        if (this.cancelledRuns.has(runId)) throw Object.assign(new Error('Workflow cancelled'), { cancelled: true });
        const inputs = {};
        for (const edge of incoming.get(node.id) || []) {
          const upstream = results.get(edge.source);
          if (!upstream) continue;
          const value = upstream.outputs[edge.sourceHandle];
          if (value !== undefined) inputs[edge.targetHandle] = value;
        }
        const missing = (NODE_TYPES[node.type].inputs || []).filter((p) => !p.optional && inputs[p.name] === undefined);
        if (missing.length) {
          setState(node.id, { status: 'error', error: `Missing input: ${missing.map((m) => m.name).join(', ')}` });
          throw new Error(`${node.type}: missing input ${missing.map((m) => m.name).join(', ')}`);
        }
        setState(node.id, { status: 'running', startedAt: nowIso() });
        const out = await this._runNode({ node, inputs, projectId, forceMock, runId, setState, workflowId: workflowId || null });
        results.set(node.id, out);
        for (const a of out.assets || []) producedAssets.push(a);
        setState(node.id, { status: 'done', finishedAt: nowIso(), assets: out.assets || [] });
      }
      const outputs = [...new Set(producedAssets)];
      this.db.tx(() =>
        this.db.run('UPDATE workflow_runs SET status = ?, finished_at = ?, result_asset_ids = ? WHERE id = ?', [
          'succeeded',
          nowIso(),
          JSON.stringify(outputs),
          runId,
        ]),
      );
      this.onEvent({ type: 'run:update', runId, states: nodeStates, status: 'succeeded', resultAssetIds: outputs });
      return { runId, status: 'succeeded', resultAssetIds: outputs, nodeStates };
    } catch (err) {
      const status = err.cancelled ? 'cancelled' : 'failed';
      this.db.tx(() =>
        this.db.run('UPDATE workflow_runs SET status = ?, finished_at = ?, error = ? WHERE id = ?', [
          status,
          nowIso(),
          String(err.message).slice(0, 1000),
          runId,
        ]),
      );
      this.onEvent({ type: 'run:update', runId, states: nodeStates, status, error: err.message });
      this.settings.log(status === 'cancelled' ? 'warn' : 'error', 'workflow', `run ${runId} ${status}: ${err.message}`);
      return { runId, status, error: err.message, nodeStates };
    } finally {
      this.cancelledRuns.delete(runId);
      if (workflowId) this.onEvent({ type: 'workflows:changed' });
    }
  }

  async _runNode({ node, inputs, projectId, forceMock, runId, setState, workflowId }) {
    const cfg = node.config || {};
    const def = NODE_TYPES[node.type];
    if (!def) throw new Error(`Unknown node type ${node.type}`);

    switch (node.type) {
      case 'prompt.text':
        return { outputs: { prompt: String(cfg.text || '') } };
      case 'asset.image': {
        if (!cfg.assetId) throw new Error('Select an image asset');
        const asset = this.assets.get(cfg.assetId);
        if (!asset) throw new Error('Image asset not found');
        return { outputs: { image: cfg.assetId } };
      }
      case 'model.image':
      case 'model.video': {
        const model = catalog.getModel(cfg.model);
        if (!model) throw new Error(`Unknown model ${cfg.model}`);
        return { outputs: { model: cfg.model } };
      }
      case 'storyboard': {
        const prompt = inputs.prompt || cfg.text || '';
        const shots = Math.max(1, Math.min(8, Number(cfg.shots || 3)));
        const lines = Array.from({ length: shots }, (_, i) => `Shot ${i + 1}: ${prompt}${prompt ? ', ' : ''}camera variation ${i + 1}`);
        return { outputs: { prompt: lines[0], shots: lines.join('\n') } };
      }
      case 'sequence':
        return { outputs: { media: inputs.media }, assets: inputs.media ? [inputs.media] : [] };
      case 'output.save': {
        if (!inputs.media) throw new Error('Output node has no input');
        return { outputs: {}, assets: [inputs.media] };
      }
      case 'batch': {
        const count = Math.max(1, Math.min(4, Number(cfg.count || 2)));
        const assets = [];
        for (let i = 0; i < count; i++) {
          if (this.cancelledRuns.has(runId)) throw Object.assign(new Error('Workflow cancelled'), { cancelled: true });
          const r = await this._generation({
            node,
            model: inputs.model || cfg.model,
            params: { ...(cfg.params || {}), prompt: inputs.prompt || cfg.params?.prompt },
            imageAssetId: inputs.image,
            projectId,
            forceMock,
            workspace: 'canvas',
            setState,
            workflowId,
          });
          assets.push(...r);
        }
        return { outputs: { image: assets[0] }, assets };
      }
      case 'image.generate':
      case 'image.edit':
      case 'image.removeBackground':
      case 'video.generate':
      case 'audio.speak':
      case 'upscale': {
        const assets = await this._generation({
          node,
          model: inputs.model || cfg.model,
          params: {
            ...(cfg.params || {}),
            prompt: inputs.prompt || cfg.params?.prompt,
            text: inputs.text || cfg.params?.text,
          },
          imageAssetId: inputs.image,
          projectId,
          forceMock,
          workspace: 'canvas',
          setState,
          workflowId,
        });
        if (!assets.length) throw new Error('Generation produced no asset');
        const port = def.outputs[0]?.name || 'image';
        return { outputs: { [port]: assets[0] }, assets };
      }
      default:
        throw new Error(`Unimplemented node type ${node.type}`);
    }
  }

  async _generation({ node, model, params, imageAssetId, projectId, forceMock, workspace, setState, workflowId }) {
    const info = catalog.getModel(model);
    if (!info) throw new Error(`Unknown model ${model}`);
    const task = info.task;
    const p = { ...params };
    if (!p.prompt && !p.text) p.prompt = node.config?.params?.prompt || '';

    // Text-only helpers cannot run as media jobs; keep the pipeline honest.
    if (task === 'text.enhance') throw new Error('Prompt enhancement nodes require a text provider — use PhotoCraft prompt tools');

    const job = this.jobs.create({
      projectId,
      workspace,
      taskType: task,
      model,
      params: p,
      inputAssetIds: imageAssetId ? [imageAssetId] : [],
      forceMock,
      workflowId,
    });
    setState(node.id, { status: 'running', jobId: job.id, progress: 0.1, executionMode: job.execution_mode });
    this.jobs.start(job.id);
    const done = await this._waitForJob(job.id, (j) => {
      setState(node.id, { status: 'running', jobId: j.id, progress: j.progress, executionMode: j.execution_mode, mock: j.isMock });
    });
    if (done.status !== 'succeeded' && done.status !== 'mock') throw new Error(done.error || `Job ${done.status}`);
    return done.result_asset_ids || [];
  }

  async _waitForJob(jobId, onTick) {
    const deadline = Date.now() + 30 * 60 * 1000;
    while (Date.now() < deadline) {
      const job = this.jobs.get(jobId);
      if (!job) throw new Error('Job disappeared');
      if (onTick) onTick(job);
      if (['succeeded', 'mock', 'failed', 'cancelled'].includes(job.status)) return job;
      await sleep(this.waitMs);
    }
    this.jobs.cancel(jobId);
    throw new Error('Workflow timed out waiting for a job (30 min)');
  }
}

function topoOrder(graph) {
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const indeg = new Map(graph.nodes.map((n) => [n.id, 0]));
  const adj = new Map(graph.nodes.map((n) => [n.id, []]));
  for (const e of graph.edges || []) {
    if (!nodes.has(e.source) || !nodes.has(e.target)) continue;
    adj.get(e.source).push(e.target);
    indeg.set(e.target, (indeg.get(e.target) || 0) + 1);
  }
  const queue = [...indeg.entries()].filter(([, d]) => d === 0).map(([id]) => id);
  const out = [];
  while (queue.length) {
    const id = queue.shift();
    out.push(nodes.get(id));
    for (const next of adj.get(id)) {
      indeg.set(next, indeg.get(next) - 1);
      if (indeg.get(next) === 0) queue.push(next);
    }
  }
  if (out.length !== graph.nodes.length) throw new Error('Workflow contains a cycle');
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function safeParse(s, fallback) {
  try {
    return JSON.parse(s || 'null') ?? fallback;
  } catch {
    return fallback;
  }
}

module.exports = { WorkflowService, NODE_TYPES, validateGraph, topoOrder, compatible };
