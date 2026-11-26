'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv } = require('./helpers.cjs');
const { validateGraph, NODE_TYPES } = require('../electron/services/workflow.cjs');

const chain = () => ({
  nodes: [
    { id: 'n1', type: 'prompt.text', position: { x: 0, y: 0 }, config: { text: 'a lighthouse at dusk' } },
    { id: 'n2', type: 'image.generate', position: { x: 240, y: 0 }, config: { model: 'mock/image', params: { num_images: 1 } } },
    { id: 'n3', type: 'output.save', position: { x: 480, y: 0 }, config: {} },
  ],
  edges: [
    { id: 'e1', source: 'n1', sourceHandle: 'prompt', target: 'n2', targetHandle: 'prompt' },
    { id: 'e2', source: 'n2', sourceHandle: 'image', target: 'n3', targetHandle: 'media' },
  ],
});

test('a saved workflow executes in dependency order and saves to Asset Studio', async () => {
  const env = await makeEnv();
  try {
    const wf = env.workflows.save({ projectId: env.project.id, name: 'Prompt to asset', graph: chain() });
    assert.equal(wf.nodeCount, 3);
    const res = await env.workflows.run({ workflowId: wf.id, projectId: env.project.id });
    assert.equal(res.status, 'succeeded', res.error || '');
    assert.equal(res.resultAssetIds.length, 1);

    const asset = env.assets.get(res.resultAssetIds[0]);
    assert.ok(asset, 'workflow output must land in Asset Studio');
    assert.equal(asset.workflow_id, wf.id);
    assert.equal(asset.source_workspace, 'canvas');
    assert.equal(asset.verification, 'mock-unverified');

    const run = env.db.get('SELECT * FROM workflow_runs WHERE id = ?', [res.runId]);
    assert.equal(run.status, 'succeeded');
    const states = JSON.parse(run.node_states);
    assert.equal(states.n1.status, 'done');
    assert.equal(states.n2.status, 'done');
    assert.ok(states.n2.jobId, 'generation node must record the job it created');

    const runs = env.workflows.runs(wf.id);
    assert.equal(runs.length, 1);
    assert.equal(runs[0].result_asset_ids.length, 1);
  } finally {
    env.cleanup();
  }
});

test('invalid port connections and cycles are rejected before execution', () => {
  const bad = chain();
  bad.edges[1].targetHandle = 'nope';
  const r1 = validateGraph(bad);
  assert.equal(r1.ok, false);
  assert.match(r1.errors.join(' '), /unknown port/);

  const badType = chain();
  badType.edges[1] = { id: 'e2', source: 'n1', sourceHandle: 'prompt', target: 'n2', targetHandle: 'image' };
  const r2 = validateGraph(badType);
  assert.equal(r2.ok, false);
  assert.match(r2.errors.join(' '), /Cannot connect/);

  const cyc = {
    nodes: [
      { id: 'a', type: 'image.generate', config: { model: 'mock/image' } },
      { id: 'b', type: 'upscale', config: { model: 'local/upscale-2x' } },
    ],
    edges: [
      { id: 'e1', source: 'a', sourceHandle: 'image', target: 'b', targetHandle: 'image' },
      { id: 'e2', source: 'b', sourceHandle: 'image', target: 'a', targetHandle: 'image' },
    ],
  };
  const r3 = validateGraph(cyc);
  assert.equal(r3.ok, false);
  assert.match(r3.errors.join(' '), /Cycle detected/);

  const unknown = chain();
  unknown.nodes[1].type = 'shell.exec';
  const r4 = validateGraph(unknown);
  assert.equal(r4.ok, false);
  assert.match(r4.errors.join(' '), /Unknown node type/);
  assert.equal(NODE_TYPES['shell.exec'], undefined, 'no arbitrary execution node may exist');
});

test('workflow rejects invalid graphs on save and on run', async () => {
  const env = await makeEnv();
  try {
    assert.throws(() => env.workflows.save({ projectId: env.project.id, name: 'bad', graph: { nodes: [], edges: [] } }), /Invalid workflow/);
    const bad = chain();
    bad.nodes[1].type = 'not.a.node';
    await assert.rejects(env.workflows.run({ projectId: env.project.id, graph: bad }), /Invalid workflow/);
  } finally {
    env.cleanup();
  }
});

test('workflow edits round-trip through save and load', async () => {
  const env = await makeEnv();
  try {
    const wf = env.workflows.save({ projectId: env.project.id, name: 'Round trip', graph: chain() });
    const graph = chain();
    graph.nodes[0].config.text = 'a red door in snow';
    const updated = env.workflows.save({ id: wf.id, projectId: env.project.id, name: 'Round trip v2', graph });
    assert.equal(updated.name, 'Round trip v2');
    assert.equal(updated.graph.nodes[0].config.text, 'a red door in snow');
    assert.equal(env.workflows.list(env.project.id).length, 1);
    env.workflows.remove(wf.id);
    assert.equal(env.workflows.get(wf.id), null);
  } finally {
    env.cleanup();
  }
});
