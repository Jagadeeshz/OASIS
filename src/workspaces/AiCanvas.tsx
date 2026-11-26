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

const TEMPLATES = [
  {
    id: 'image',
    name: 'Text → image',
    blurb: 'Prompt into FLUX, saved to Asset Studio.',
    graph: () => makeStarter(),
  },
  {
    id: 'edit',
    name: 'Image → edit → save',
    blurb: 'Edit an existing reference with a prompt.',
    graph: () => ({
      nodes: [
        { id: 't_img', type: 'asset.image', position: { x: 30, y: 60 }, config: {} },
        { id: 't_prompt', type: 'prompt.text', position: { x: 30, y: 250 }, config: { text: 'Make it night-time, neon reflections, cinematic' } },
        { id: 't_edit', type: 'image.edit', position: { x: 320, y: 140 }, config: { model: 'fal-ai/flux/dev/image-to-image', params: { strength: 0.8 } } },
        { id: 't_out', type: 'output.save', position: { x: 620, y: 150 }, config: {} },
      ],
      edges: [
        { id: 'te1', source: 't_img', sourceHandle: 'image', target: 't_edit', targetHandle: 'image' },
        { id: 'te2', source: 't_prompt', sourceHandle: 'prompt', target: 't_edit', targetHandle: 'prompt' },
        { id: 'te3', source: 't_edit', sourceHandle: 'image', target: 't_out', targetHandle: 'media' },
      ],
    }),
  },
  {
    id: 'vid',
    name: 'Image → video',
    blurb: 'Animate a still into a clip, saved to Asset Studio.',
    graph: () => ({
      nodes: [
        { id: 'v_img', type: 'asset.image', position: { x: 30, y: 80 }, config: {} },
        { id: 'v_prompt', type: 'prompt.text', position: { x: 30, y: 260 }, config: { text: 'Slow push-in, drifting fog, golden hour' } },
        { id: 'v_gen', type: 'video.generate', position: { x: 330, y: 150 }, config: { model: 'fal-ai/wan/v2.2-a14b/image-to-video', params: { num_frames: 81 } } },
        { id: 'v_out', type: 'output.save', position: { x: 640, y: 160 }, config: {} },
      ],
      edges: [
        { id: 've1', source: 'v_img', sourceHandle: 'image', target: 'v_gen', targetHandle: 'image' },
        { id: 've2', source: 'v_prompt', sourceHandle: 'prompt', target: 'v_gen', targetHandle: 'prompt' },
        { id: 've3', source: 'v_gen', sourceHandle: 'video', target: 'v_out', targetHandle: 'media' },
      ],
    }),
  },
];

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
  const { fitView, zoomIn, zoomOut, setViewport } = useReactFlow();
  const history = useRef<{ past: string[]; future: string[] }>({ past: [], future: [] });
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [paletteQuery, setPaletteQuery] = useState('');
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [saveAsName, setSaveAsName] = useState('');
  const [clearOpen, setClearOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);

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
          if (evt.status === 'succeeded') {
            toast(`Workflow finished — ${evt.resultAssetIds?.length || 0} asset(s) saved`, 'success');
            refreshAssets().catch(() => {});
          } else if (evt.status === 'failed') toast(evt.error || 'Workflow failed', 'error');
          else if (evt.status === 'cancelled') toast('Workflow stopped', 'warn');
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
      pushHistory();
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

  const snapshot = () => JSON.stringify({ nodes: nodes.map((n) => ({ id: n.id, position: n.position, data: n.data })), edges });

  const pushHistory = useCallback(() => {
    history.current.past.push(snapshot());
    if (history.current.past.length > 40) history.current.past.shift();
    history.current.future = [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges]);

  const restore = (snap: string) => {
    const parsed = JSON.parse(snap);
    setNodes(parsed.nodes.map((n: any) => ({ ...n, type: 'oasis', selected: false })));
    setEdges(parsed.edges);
    setSelectedId(null);
    setSelectedEdgeId(null);
  };

  const undo = () => {
    const prev = history.current.past.pop();
    if (!prev) return toast('Nothing to undo', 'warn');
    history.current.future.push(snapshot());
    restore(prev);
  };

  const redo = () => {
    const next = history.current.future.pop();
    if (!next) return toast('Nothing to redo', 'warn');
    history.current.past.push(snapshot());
    restore(next);
  };

  const duplicateNode = (id: string) => {
    const src = nodes.find((n) => n.id === id);
    if (!src) return;
    pushHistory();
    const copy = {
      ...src,
      id: `n_${Math.random().toString(36).slice(2, 7)}`,
      position: { x: (src.position?.x || 0) + 32, y: (src.position?.y || 0) + 32 },
      data: { ...src.data, config: JSON.parse(JSON.stringify(src.data.config || {})), status: { status: 'pending' } },
      selected: false,
    };
    setNodes((nds) => [...nds, copy]);
    setSelectedId(copy.id);
  };

  const deleteNode = (id: string) => {
    pushHistory();
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e: any) => e.source !== id && e.target !== id));
    setSelectedId(null);
  };

  const deleteEdge = (id: string) => {
    pushHistory();
    setEdges((eds) => eds.filter((e: any) => e.id !== id));
    setSelectedEdgeId(null);
  };

  const saveAs = async () => {
    const name = saveAsName.trim();
    if (!name) return;
    try {
      const wf = await api.workflows.save({ projectId, name, graph: graphOf() });
      setWorkflowId(wf.id);
      setWorkflowName(wf.name);
      setSaveAsOpen(false);
      setSaveAsName('');
      toast(`Saved as “${wf.name}”`, 'success');
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  const clearCanvas = () => {
    pushHistory();
    setNodes([]);
    setEdges([]);
    setSelectedId(null);
    setSelectedEdgeId(null);
    setWorkflowId(null);
    setWorkflowName('Untitled workflow');
    setNodeStates({});
    setClearOpen(false);
    toast('Canvas cleared', 'success');
  };

  // Canvas keyboard: undo/redo, duplicate, delete edge or node.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'd' && selectedId) {
        e.preventDefault();
        duplicateNode(selectedId);
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedEdgeId) {
          e.preventDefault();
          deleteEdge(selectedEdgeId);
        } else if (selectedId) {
          e.preventDefault();
          deleteNode(selectedId);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, selectedEdgeId, nodes, edges]);

  const addNode = (ntype: string) => {
    const def = defs[ntype];
    if (!def) return;
    pushHistory();
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
    pushHistory();
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
    if (!nodes.length) return toast('Add at least one node first', 'warn');
    setRunning(true);
    setNodeStates({});
    setValidation([]);
    try {
      // Returns as soon as the run row exists; progress arrives via run:update events,
      // which is what makes Stop work while a run is in flight.
      const res = await api.workflows.start({ projectId, graph: graphOf(), workflowId: workflowId || undefined });
      setRunId(res.runId);
      toast('Workflow started', 'info');
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
        <input
          className="input mb-8"
          style={{ height: 26 }}
          placeholder="Search nodes…"
          value={paletteQuery}
          onChange={(e) => setPaletteQuery(e.target.value)}
        />
        {Object.entries(defs)
          .filter(([key, def]: any) => {
            const q = paletteQuery.trim().toLowerCase();
            if (!q) return true;
            return (def.label + " " + def.category + " " + key).toLowerCase().includes(q);
          })
          .map(([key, def]: any) => (
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
          onNodeClick={(_, node) => { setSelectedId(node.id); setSelectedEdgeId(null); }}
          onEdgeClick={(_, edge) => {
            setEdges((eds: any[]) => eds.map((e) => ({ ...e, selected: e.id === edge.id })));
            setSelectedEdgeId(edge.id);
            setSelectedId(null);
          }}
          onNodeDragStop={() => pushHistory()}
          onPaneClick={() => { setSelectedId(null); setSelectedEdgeId(null); setEdges((eds: any[]) => eds.map((e) => ({ ...e, selected: false }))); }}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable style={{ width: 168, height: 104 }} />
        </ReactFlow>
        <div className="canvas-toolbar">
          <input className="input" style={{ maxWidth: 200 }} value={workflowName} onChange={(e) => setWorkflowName(e.target.value)} />
          <Btn size="sm" variant="ghost" onClick={() => save()} disabled={saving} title="Save workflow">
            {saving ? <Spinner /> : null} Save
          </Btn>
          <Btn size="sm" variant="ghost" onClick={() => { setSaveAsName(workflowName); setSaveAsOpen(true); }} title="Save as a new workflow">
            Save as
          </Btn>
          <Btn size="sm" variant="ghost" onClick={openLoad} title="Open a saved workflow">
            Open
          </Btn>
          <Btn size="sm" variant="ghost" onClick={() => setTemplatesOpen(true)} title="Start from a template">
            Templates
          </Btn>
          <span className="toolbar-divider" />
          <Btn size="sm" variant="subtle" onClick={undo} title="Undo (Ctrl+Z)" aria-label="Undo">↺</Btn>
          <Btn size="sm" variant="subtle" onClick={redo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">↻</Btn>
          <Btn size="sm" variant="subtle" onClick={() => zoomIn({ duration: 180 })} title="Zoom in" aria-label="Zoom in">＋</Btn>
          <Btn size="sm" variant="subtle" onClick={() => zoomOut({ duration: 180 })} title="Zoom out" aria-label="Zoom out">－</Btn>
          <Btn size="sm" variant="subtle" onClick={() => fitView({ padding: 0.2, maxZoom: 1.05, duration: 240 })} title="Fit to screen" aria-label="Fit to screen">Fit</Btn>
          <Btn size="sm" variant="subtle" onClick={() => setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 200 })} title="Reset view to 100%" aria-label="Reset view">1:1</Btn>
          <span className="toolbar-divider" />
          <Btn size="sm" variant="primary" onClick={run} disabled={running || nodes.length === 0}>
            {running ? <Spinner /> : null} {running ? 'Running…' : 'Run workflow'}
          </Btn>
          {running ? (
            <Btn
              size="sm"
              variant="danger"
              title="Stop execution"
              onClick={async () => {
                if (!runId) return;
                try {
                  await api.workflows.cancel(runId);
                  toast('Stopping workflow…', 'warn');
                } catch (err: any) {
                  toast(err.message, 'error');
                }
              }}
            >
              Stop
            </Btn>
          ) : null}
          <div className="spacer" style={{ flex: 1 }} />
          <Btn size="sm" variant="subtle" onClick={() => setClearOpen(true)} title="Clear canvas">
            Clear
          </Btn>
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
              <Btn size="sm" variant="subtle" onClick={() => deleteNode(selected.id)}>
                Delete
              </Btn>
              <Btn size="sm" variant="subtle" onClick={() => duplicateNode(selected.id)}>
                Duplicate
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

      <Modal
        open={saveAsOpen}
        title="Save workflow as"
        width={460}
        onClose={() => setSaveAsOpen(false)}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setSaveAsOpen(false)}>Cancel</Btn>
            <Btn variant="primary" onClick={saveAs} disabled={!saveAsName.trim()}>Save as new</Btn>
          </>
        }
      >
        <Field label="Workflow name">
          <input className="input" autoFocus value={saveAsName} onChange={(e) => setSaveAsName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveAs()} />
        </Field>
        <div className="tiny muted-2">A new workflow is created; the current one stays unchanged.</div>
      </Modal>

      <Modal open={templatesOpen} title="Workflow templates" width={640} onClose={() => setTemplatesOpen(false)}>
        <div className="stack">
          {TEMPLATES.map((t) => (
            <div key={t.id} className="panel pad" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <strong className="small">{t.name}</strong>
                <div className="tiny muted-2 mt-8">{t.blurb}</div>
              </div>
              <Btn
                size="sm"
                variant="primary"
                onClick={() => {
                  pushHistory();
                  buildRfNodes(t.graph());
                  setWorkflowId(null);
                  setWorkflowName(t.name);
                  setNodeStates({});
                  setTemplatesOpen(false);
                  toast('Template loaded — review nodes, then Run', 'success');
                }}
              >
                Use template
              </Btn>
            </div>
          ))}
        </div>
        <div className="tiny muted-2 mt-12">
          Templates are ordinary graphs: edit any node, save as your own workflow, or run as-is. Reference nodes need an asset picked first.
        </div>
      </Modal>

      <Modal
        open={clearOpen}
        title="Clear the canvas?"
        width={420}
        onClose={() => setClearOpen(false)}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setClearOpen(false)}>Cancel</Btn>
            <Btn variant="danger" onClick={clearCanvas}>Clear canvas</Btn>
          </>
        }
      >
        <div className="small muted">All nodes and connections are removed from this canvas. Saved workflows and generated assets are not affected. Undo is available until you make another change.</div>
      </Modal>
    </div>
  );
}
