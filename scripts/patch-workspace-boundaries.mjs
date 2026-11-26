import fs from 'node:fs';

const patch = (file, pairs) => {
  let s = fs.readFileSync(file, 'utf8');
  for (const [a, b] of pairs) {
    if (!s.includes(a)) throw new Error('missing in ' + file + ': ' + a.slice(0, 90));
    s = s.split(a).join(b);
  }
  fs.writeFileSync(file, s);
  console.log('patched', file);
};

/* ── Video Studio: hand a selected clip to the AI workspaces (ownership stays in Video Studio) ── */
patch('src/workspaces/VideoStudio.tsx', [
  [
    '  const { projectId, assets, toast, consumeHandoff, refreshAssets, assetsRev } = useApp();',
    '  const { projectId, assets, toast, consumeHandoff, refreshAssets, assetsRev, sendAsset } = useApp();',
  ],
  [
    '          <div className="tiny muted-2">Drag the clip body to move it, or its edges to trim.</div>',
    `          <div className="tiny muted-2">Drag the clip body to move it, or its edges to trim.</div>

          {clip.clip.assetId ? (
            <>
              <div className="tiny muted-2 mt-12 mb-8">SEND CLIP TO</div>
              <div className="row wrap">
                <Btn size="sm" variant="ghost" onClick={() => sendAsset(clip.clip.assetId!, 'effectscraft', 'video-studio')}>
                  EffectsCraft
                </Btn>
                {clip.track.type === 'video' && assets.find((a) => a.id === clip.clip.assetId)?.media_type === 'video' ? (
                  <Btn size="sm" variant="ghost" onClick={() => sendAsset(clip.clip.assetId!, 'filmcraft', 'video-studio')}>
                    FilmCraft
                  </Btn>
                ) : null}
                {assets.find((a) => a.id === clip.clip.assetId)?.media_type === 'image' ? (
                  <Btn size="sm" variant="ghost" onClick={() => sendAsset(clip.clip.assetId!, 'photocraft', 'video-studio')}>
                    PhotoCraft
                  </Btn>
                ) : null}
                <Btn size="sm" variant="ghost" onClick={() => sendAsset(clip.clip.assetId!, 'assets', 'video-studio')}>
                  Asset Studio
                </Btn>
              </div>
              <div className="tiny muted-2 mt-8">
                The original clip stays in the timeline; results come back as new Asset Studio versions.
              </div>
            </>
          ) : null}`,
  ],
]);

/* ── AI Canvas: Spaces templates (reusable starting graphs) ── */
const templates = `const TEMPLATES = [
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

function AiCanvas() {`;

patch('src/workspaces/AiCanvas.tsx', [
  ['function AiCanvas() {', templates],
  [
    '  const [clearOpen, setClearOpen] = useState(false);',
    `  const [clearOpen, setClearOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);`,
  ],
  [
    '          <Btn size="sm" variant="ghost" onClick={openLoad} title="Open a saved workflow">\n            Open\n          </Btn>',
    `          <Btn size="sm" variant="ghost" onClick={openLoad} title="Open a saved workflow">
            Open
          </Btn>
          <Btn size="sm" variant="ghost" onClick={() => setTemplatesOpen(true)} title="Start from a template">
            Templates
          </Btn>`,
  ],
  [
    `      <Modal
        open={clearOpen}`,
    `      <Modal open={templatesOpen} title="Workflow templates" width={640} onClose={() => setTemplatesOpen(false)}>
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
        open={clearOpen}`,
  ],
]);

console.log('workspace handoff + templates wired');
