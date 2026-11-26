import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';
import { api, Asset, ModelInfo } from '../lib/api';
import { useApp } from '../lib/store';
import { AssetPicker, Badge, Btn, Field, MockBadge, Modal, Spinner, StatusBadge } from '../components/ui';
import { ParamsForm } from '../components/job';

const MEDIA = ['image', 'video', 'audio'];

function compatible(from: string, to: string) {
  if (!from || !to) return false;
  if (from === 'any' || to === 'any') return true;
  if (to === 'media') return MEDIA.includes(from);
  if (from === 'media') return MEDIA.includes(to);
  if (to === 'prompt') return from === 'prompt' || from === 'text';
  if (to === 'text') return from === 'text' || from === 'prompt';
  return from === to;
}

function makeStarter() {
  return {
    nodes: [
      { id: 'n_prompt', type: 'prompt.text', position: { x: 40, y: 200 }, config: { text: 'A glass observatory above a cloud sea at sunrise, wide lens' } },
      { id: 'n_model', type: 'model.image', position: { x: 40, y: 40 }, config: { model: 'fal-ai/flux/schnell' } },
      { id: 'n_gen', type: 'image.generate', position: { x: 330, y: 132 }, config: { model: 'fal-ai/flux/schnell', params: { num_images: 1 } } },
      { id: 'n_out', type: 'output.save', position: { x: 640, y: 140 }, config: {} },
    ],
    edges: [
      { id: 'e1', source: 'n_prompt', sourceHandle: 'prompt', target: 'n_gen', targetHandle: 'prompt' },
      { id: 'e2', source: 'n_model', sourceHandle: 'model', target: 'n_gen', targetHandle: 'model' },
      { id: 'e3', source: 'n_gen', sourceHandle: 'image', target: 'n_out', targetHandle: 'media' },
    ],
  };
}

const byId = (nodes: any[]) => new Map(nodes.map((n) => [n.id, n]));

function OasisNode({ data, selected }: any) {
  const def = data.def;
  const status = data.status || { status: 'pending' };
  const inputs = def?.inputs || [];
  const outputs = def?.outputs || [];
  const summary = (() => {
    const c = data.config || {};
    if (data.ntype === 'prompt.text') return c.text ? `“${String(c.text).slice(0, 46)}”` : 'no prompt';
    if (data.ntype === 'asset.image') return c.assetName || 'no asset';
    if (data.ntype?.startsWith('model.')) return c.model || 'no model';
    if (c.model) return c.model;
    if (data.ntype === 'output.save') return 'workflow output';
    if (data.ntype === 'storyboard') return `${c.shots || 3} shots`;
    return def?.description?.slice(0, 42) || '';
  })();

  return (
    <div className={`node-card ${selected ? 'selected' : ''}`} data-category={def?.category}>
      <div className="node-head">
        <span style={{ opacity: 0.85 }}>◆</span>
        <span>{def?.label || data.ntype}</span>
      </div>
      <div className="node-body">
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{summary}</span>
        {inputs.length || outputs.length ? (
          <div className="port">
            <span>{inputs.length} in</span>
            <span>{outputs.length} out</span>
          </div>
        ) : null}
      </div>
      {inputs.map((p: any, i: number) => (
        <Handle
          key={`in-${p.name}`}
          id={p.name}
          type="target"
          position={Position.Left}
          className="port-handle"
          data-port={p.type}
          style={{ top: 52 + i * 18 }}
          title={`${p.name} (${p.type})`}
        />
      ))}
      {outputs.map((p: any, i: number) => (
        <Handle
          key={`out-${p.name}`}
          id={p.name}
          type="source"
          position={Position.Right}
          className="port-handle"
          data-port={p.type}
          style={{ top: 52 + i * 18 }}
          title={`${p.name} (${p.type})`}
        />
      ))}
      <div className={`node-status ${status.status === 'running' ? 'running' : status.status === 'done' ? 'done' : status.status === 'error' ? 'error' : ''}`}>
        {status.status === 'running' ? (
          <>
            <Spinner /> {status.mock ? 'mock run' : 'running'} {status.progress ? `${Math.round(status.progress * 100)}%` : ''}
          </>
        ) : status.status === 'done' ? (
          <>{status.assets?.length ? `✓ ${status.assets.length} asset(s)` : '✓ done'}</>
        ) : status.status === 'error' ? (
          <>⚠ {String(status.error || 'error').slice(0, 40)}</>
        ) : (
          <>idle</>
        )}
      </div>
    </div>
  );
}

const nodeTypes = { oasis: OasisNode };

export default function AiCanvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}

function CanvasInner() {
  const { projectId, nodeTypes: NODE_DEFS, models, providers, toast, setNav, sendAsset, assets, refreshAssets, workflowsRev } = useApp();
  const [nodes, setNodes, onNodesChange] = useNodesState<any>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<any>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [workflowName, setWorkflowName] = useState('Untitled workflow');
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [nodeStates, setNodeStates] = useState<Record<string, any>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loadOpen, setLoadOpen] = useState(false);
  const [saved, setSaved] = useState<any[]>([]);
  const [validation, setValidation] = useState<string[]>([]);
  const wrapper = useRef<any>(null);
  const { fitView } = useReactFlow();

  const defs = NODE_DEFS || {};

  const buildRfNodes = useCallback(
    (graph: any) => {
      const nodes = graph.nodes.map((n: any) => {
        const def = defs[n.type];
        const asset = n.config?.assetId ? assets.find((a) => a.id === n.config.assetId) : null;
        return {
          id: n.id,
          type: 'oasis',
          position: n.position || { x: 100, y: 100 },
          data: {
            ntype: n.type,
            config: { ...(n.config || {}), assetName: asset?.display_name },
            def,
            status: nodeStates[n.id] || { status: 'pending' },
          },
        };
      });
      setNodes(nodes);
      setEdges(
        (graph.edges || []).map((e: any) => ({
          id: e.id,
          source: e.source,
          sourceHandle: e.sourceHandle,
          target: e.target,
          targetHandle: e.targetHandle,
        })),
      );
      setTimeout(() => fitView({ padding: 0.22, maxZoom: 1.05, duration: 320 }), 90);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assets, defs, nodeStates],
  );

  // Initial graph
  useEffect(() => {
    (async () => {
      const pending = sessionStorage.getItem('oasis.workflowId');
      try {
        if (pending) {
          sessionStorage.removeItem('oasis.workflowId');
          const wf = await api.workflows.get(pending);
          if (wf) {
            setWorkflowId(wf.id);
            setWorkflowName(wf.name);
            buildRfNodes(wf.graph);
            return;
          }
        }
      } catch {
        /* fall through to starter */
      }
      buildRfNodes(makeStarter());
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep node status visuals in sync
  useEffect(() => {
    setNodes((nds) => nds.map((n) => ({ ...n, data: { ...n.data, status: nodeStates[n.id] || { status: 'pending' } } })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeStates]);

  useEffect(() => {
    const off = api.onEvent((evt: any) => {
      if (evt?.type === 'run:update' && evt.runId === runId) {
        setNodeStates(evt.states || {});
        if (['succeeded', 'failed', 'cancelled'].includes(evt.status)) {
          setRunning(false);
          if (evt.status === 'succeeded') toast(`Workflow finished — ${evt.resultAssetIds?.length || 0} asset(s) saved`, 'success');
          else if (evt.status === 'failed') toast(evt.error || 'Workflow failed', 'error');
        }
      }
    });
    return () => off && off();
  }, [runId, toast]);

  const onConnect = useCallback(
    (params: any) => {
      const src = nodes.find((n) => n.id === params.source);
      const dst = nodes.find((n) => n.id === params.target);
      if (!src || !dst) return;
      const from = src.data.def?.outputs?.find((p: any) => p.name === params.sourceHandle)?.type;
      const to = dst.data.def?.inputs?.find((p: any) => p.name === params.targetHandle)?.type;
      if (!compatible(from, to)) {
        toast(`Cannot connect ${from} to ${to}`, 'warn');
        return;
      }
      setEdges((eds) => addEdge({ ...params }, eds));
    },
    [nodes, setEdges, toast],
  );

  const isValidConnection = useCallback(
    (conn: any) => {
      if (conn.source === conn.target) return false;
      const src = nodes.find((n) => n.id === conn.source);
      const dst = nodes.find((n) => n.id === conn.target);
      if (!src || !dst) return false;
      const from = src.data.def?.outputs?.find((p: any) => p.name === conn.sourceHandle)?.type;
      const to = dst.data.def?.inputs?.find((p: any) => p.name === conn.targetHandle)?.type;
      return compatible(from, to);
    },
    [nodes],
  );

  const graphOf = useCallback(
    () => ({
      nodes: nodes.map((n) => ({ id: n.id, type: n.data.ntype, position: n.position, config: n.data.config })),
      edges: edges.map((e: any) => ({ id: e.id, source: e.source, sourceHandle: e.sourceHandle, target: e.target, targetHandle: e.targetHandle })),
    }),
    [nodes, edges],
  );

  const addNode = (ntype: string) => {
    const def = defs[ntype];
    if (!def) return;
    const id = `n_${Math.random().toString(36).slice(2, 7)}`;
    const config = JSON.parse(JSON.stringify(def.config || {}));
    if (ntype === 'prompt.text') config.text = '';
    const rfNode = {
      id,
      type: 'oasis',
      position: { x: 120 + nodes.length * 26, y: 120 + (nodes.length % 5) * 40 },
      data: { ntype, config, def, status: { status: 'pending' } },
    };
    setNodes((nds) => [...nds, rfNode]);
    setSelectedId(id);
  };

  const selected = nodes.find((n) => n.id === selectedId) || null;

  const updateSelectedConfig = (patch: Record<string, any>) => {
    if (!selected) return;
    setNodes((nds) => nds.map((n) => (n.id === selected.id ? { ...n, data: { ...n.data, config: { ...n.data.config, ...patch } } } : n)));
  };

  const save = async (name?: string) => {
    setSaving(true);
    setValidation([]);
    try {
      const wf = await api.workflows.save({ id: workflowId || undefined, projectId, name: name || workflowName, graph: graphOf() });
      setWorkflowId(wf.id);
      setWorkflowName(wf.name);
      toast(`Workflow saved — ${wf.nodeCount} nodes`, 'success');
      return wf;
    } catch (err: any) {
      setValidation(err.validation || [err.message]);
      toast(err.message, 'error');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const run = async () => {
    setRunning(true);
    setNodeStates({});
    setValidation([]);
    try {
      const res = await api.workflows.run({ projectId, graph: graphOf(), workflowId: workflowId || undefined });
      setRunId(res.runId);
      setNodeStates(res.nodeStates || {});
      if (res.status === 'succeeded') {
        toast(`Workflow succeeded — ${res.resultAssetIds.length} asset(s)`, 'success');
        setRunning(false);
        await refreshAssets();
      } else if (res.status !== 'running') {
        toast(res.error || `Workflow ${res.status}`, 'error');
        setRunning(false);
        if (res.error?.includes('Invalid workflow')) setValidation([res.error]);
      }
    } catch (err: any) {
      setValidation(err.validation || [err.message]);
      toast(err.message, 'error');
      setRunning(false);
    }
  };

  const openLoad = async () => {
    setSaved(await api.workflows.list(projectId));
    setLoadOpen(true);
  };

  useEffect(() => {
    if (workflowsRev && workflowId) {
      /* keep name in sync when re-saved elsewhere */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowsRev]);

  const modelOptions = useMemo(() => {
    if (!selected) return [];
    const t = selected.data.ntype;
    if (t === 'model.image') return models.filter((m) => m.output === 'image');
    if (t === 'model.video') return models.filter((m) => m.output === 'video');
    const def = defs[t];
    const taskMap: Record<string, string> = {
      'image.generate': 'image.generate',
      'image.edit': 'image.edit',
      'image.removeBackground': 'image.removeBackground',
      upscale: 'image.upscale',
      'video.generate': 'video.generate',
      'audio.speak': 'audio.speak',
    };
    return models.filter((m) => m.task === taskMap[t]);
  }, [selected, models, defs]);

  const selectedModel = selected ? models.find((m) => m.id === (selected.data.config?.model || selected.data.def?.config?.model)) : null;
  const fal = providers.find((p) => p.id === 'fal');

  return (
    <div className={`canvas-wrap ${selected ? '' : 'no-inspector'}`}>
      <div className="palette">
        <div className="row between mb-8">
          <strong className="small">Nodes</strong>
          <Btn size="sm" variant="subtle" onClick={() => setNav('workflows')}>
            Library
          </Btn>
        </div>
        {Object.entries(defs).map(([key, def]: any) => (
          <div key={key} className="palette-item" onClick={() => addNode(key)} title={def.description}>
            {def.label}
            <small>{def.category} · {def.outputs.map((o: any) => o.type).join('/') || 'sink'}</small>
          </div>
        ))}
        <div className="notice mt-12 tiny">Nodes are an allowlist — there is no code-execution node.</div>
      </div>

      <div className="canvas-host" ref={wrapper}>
        <ReactFlow
          nodes={nodes}
          edges={running ? edges.map((e: any) => ({ ...e, animated: true })) : edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          nodeTypes={nodeTypes}
          onNodeClick={(_, node) => setSelectedId(node.id)}
          onPaneClick={() => setSelectedId(null)}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable style={{ width: 168, height: 104 }} />
        </ReactFlow>
        <div className="canvas-toolbar">
          <input className="input" style={{ maxWidth: 260 }} value={workflowName} onChange={(e) => setWorkflowName(e.target.value)} />
          <Btn size="sm" variant="ghost" onClick={() => save()} disabled={saving}>
            {saving ? <Spinner /> : null} Save
          </Btn>
          <Btn size="sm" variant="ghost" onClick={openLoad}>
            Open
          </Btn>
          <Btn size="sm" variant="primary" onClick={run} disabled={running}>
            {running ? <Spinner /> : null} {running ? 'Running…' : 'Run workflow'}
          </Btn>
          <div className="spacer" style={{ flex: 1 }} />
          {fal && !fal.hasSecret ? <Badge tone="warn">fal has no key → mock</Badge> : null}
          {runId ? <Badge tone="info">run {runId.slice(4, 10)}</Badge> : null}
        </div>
        {!selected ? (
          <div className="canvas-hint">
            Click a node to configure it · drag a right-side port to a left-side port to connect · palette adds nodes
          </div>
        ) : null}
        {validation.length ? (
          <div className="canvas-validation">
            {validation.slice(0, 3).map((v, i) => (
              <div key={i}>• {v}</div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="canvas-side">
        {selected ? (
          <>
            <div className="row between mb-12">
              <strong className="small">{selected.data.def?.label}</strong>
              <Btn
                size="sm"
                variant="subtle"
                onClick={() => {
                  setNodes((nds) => nds.filter((n) => n.id !== selected.id));
                  setEdges((eds) => eds.filter((e: any) => e.source !== selected.id && e.target !== selected.id));
                  setSelectedId(null);
                }}
              >
                Delete
              </Btn>
            </div>
            <div className="tiny muted-2 mb-12">{selected.data.def?.description}</div>

            {selected.data.ntype === 'prompt.text' ? (
              <Field label="Prompt text">
                <textarea className="textarea" rows={6} value={selected.data.config.text || ''} onChange={(e) => updateSelectedConfig({ text: e.target.value })} />
              </Field>
            ) : null}

            {selected.data.ntype === 'asset.image' ? (
              <Field label="Image asset">
                <div className="row">
                  <span className="grow small muted">{selected.data.config.assetName || 'none'}</span>
                  <Btn size="sm" variant="ghost" onClick={() => setPickerOpen(true)}>
                    Pick
                  </Btn>
                </div>
              </Field>
            ) : null}

            {['model.image', 'model.video'].includes(selected.data.ntype) ? (
              <Field label="Model">
                <select className="select" value={selected.data.config.model || ''} onChange={(e) => updateSelectedConfig({ model: e.target.value })}>
                  {modelOptions.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} · {m.provider}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}

            {['image.generate', 'image.edit', 'image.removeBackground', 'video.generate', 'audio.speak', 'upscale', 'batch'].includes(selected.data.ntype) ? (
              <>
                <Field label="Model">
                  <select className="select" value={selected.data.config.model || ''} onChange={(e) => updateSelectedConfig({ model: e.target.value })}>
                    {modelOptions.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label} · {m.provider}
                      </option>
                    ))}
                  </select>
                </Field>
                {selected.data.ntype === 'batch' ? (
                  <Field label="Count">
                    <input className="input" type="number" min={1} max={4} value={selected.data.config.count || 2} onChange={(e) => updateSelectedConfig({ count: Number(e.target.value) })} />
                  </Field>
                ) : null}
                {selectedModel ? (
                  <ParamsForm
                    model={selectedModel}
                    values={selected.data.config.params || {}}
                    onChange={(v) => updateSelectedConfig({ params: v })}
                  />
                ) : null}
                <div className="tiny muted-2 mt-8">Prompt is taken from the connected prompt node.</div>
              </>
            ) : null}

            {selected.data.ntype === 'storyboard' ? (
              <Field label="Shots">
                <input className="input" type="number" min={1} max={8} value={selected.data.config.shots || 3} onChange={(e) => updateSelectedConfig({ shots: Number(e.target.value) })} />
              </Field>
            ) : null}

            {selected.data.ntype === 'output.save' ? (
              <div className="notice">Connect any media output here. Assets are already persisted in Asset Studio when generated.</div>
            ) : null}

            <div className="mt-12 tiny muted-2">
              Status: <StatusBadge status={nodeStates[selected.id]?.status || 'pending'} />
              {nodeStates[selected.id]?.jobId ? <div className="mono mt-8">{String(nodeStates[selected.id].jobId).slice(0, 22)}…</div> : null}
              {nodeStates[selected.id]?.error ? <div style={{ color: 'var(--danger)' }} className="mt-8">{nodeStates[selected.id].error}</div> : null}
            </div>
          </>
        ) : (
          <div className="small muted">
            Select a node to configure it. Click palette items to add nodes, drag from a right-side port to a left-side port to connect.
          </div>
        )}

        {validation.length ? (
          <div className="notice danger mt-12">
            <div>
              {validation.map((v, i) => (
                <div key={i} className="tiny">• {v}</div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <AssetPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        mediaType="image"
        onPick={(a) => updateSelectedConfig({ assetId: a.id, assetName: a.display_name })}
        title="Choose a reference image"
      />

      <Modal open={loadOpen} title="Open saved workflow" onClose={() => setLoadOpen(false)} width={640}>
        {saved.length === 0 ? (
          <div className="small muted">No saved workflows in this project yet.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Nodes</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {saved.map((w) => (
                <tr key={w.id}>
                  <td>{w.name}</td>
                  <td>{w.nodeCount}</td>
                  <td>
                    <Btn
                      size="sm"
                      onClick={() => {
                        setWorkflowId(w.id);
                        setWorkflowName(w.name);
                        buildRfNodes(w.graph);
                        setNodeStates({});
                        setLoadOpen(false);
                      }}
                    >
                      Open
                    </Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Modal>
    </div>
  );
}
