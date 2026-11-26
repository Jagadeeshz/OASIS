import React, { useEffect, useMemo, useState } from 'react';
import { api, Asset } from '../lib/api';
import { useApp } from '../lib/store';
import { AssetCard, AssetPicker, Badge, Btn, Empty, Field, MockBadge, Spinner, Tabs } from '../components/ui';
import { JobProgress, ParamsForm, PromptEnhancer, ResultStrip, useJobWatch } from '../components/job';

export default function FilmCraft() {
  const { projectId, models, providers, assets, toast, sendAsset, consumeHandoff, refreshAssets, setNav } = useApp();
  const [mode, setMode] = useState<'t2v' | 'i2v'>('t2v');
  const [modelId, setModelId] = useState('fal-ai/wan/v2.2-a14b/text-to-video');
  const [values, setValues] = useState<Record<string, any>>({});
  const [prompt, setPrompt] = useState('Slow dolly through a rain-soaked neon alley, reflections on wet asphalt, cinematic 35mm, shallow depth of field');
  const [source, setSource] = useState<Asset | null>(null);
  const [endFrame, setEndFrame] = useState<Asset | null>(null);
  const [picker, setPicker] = useState<'source' | 'end' | null>(null);
  const [forceMock, setForceMock] = useState(false);
  const [busy, setBusy] = useState(false);
  const { job, watch } = useJobWatch();

  const taskModels = useMemo(() => models.filter((m) => m.task === 'video.generate' && (mode === 'i2v' ? m.requiresImage : !m.requiresImage)), [models, mode]);
  const model = useMemo(() => models.find((m) => m.id === modelId) || null, [models, modelId]);
  const fal = providers.find((p) => p.id === 'fal');
  const willMock = forceMock || (model?.provider === 'fal' && (!fal?.enabled || !fal?.hasSecret));
  const fps = Number(values.frames_per_second || 16);
  const frames = Number(values.num_frames || 81);

  useEffect(() => {
    const h = consumeHandoff();
    if (h?.assetId) {
      api.assets.get(h.assetId).then((a) => {
        if (a.media_type === 'image') {
          setSource(a);
          setMode('i2v');
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const list = taskModels.map((m) => m.id);
    if (!list.includes(modelId) && list.length) setModelId(list[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, models]);

  const history = assets.filter((a) => a.source_workspace === 'filmcraft').slice(0, 8);

  const generate = async () => {
    if (!model) return;
    if (mode === 'i2v' && !source) return toast('Choose a start frame', 'warn');
    if (!prompt.trim()) return toast('Write a prompt first', 'warn');
    setBusy(true);
    try {
      const params: Record<string, any> = { ...values, prompt };
      if (endFrame) params.endImageAssetId = endFrame.id;
      const created = await api.jobs.create({
        projectId,
        workspace: 'filmcraft',
        taskType: model.task,
        model: model.id,
        params,
        inputAssetIds: source ? [source.id] : [],
        forceMock,
      });
      watch(created.id);
      await api.jobs.start(created.id);
      toast(created.execution_mode === 'mock' ? 'Mock video queued — labelled unverified' : 'Video job submitted', created.execution_mode === 'mock' ? 'warn' : 'info');
    } catch (err: any) {
      toast(err.validation?.join('; ') || err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>FilmCraft</h1>
          <p>Generate clips from text or animate a still. Long jobs run asynchronously and report progress; results land in Asset Studio.</p>
        </div>
        <div className="spacer" />
        <Tabs
          value={mode}
          onChange={(m) => setMode(m)}
          tabs={[
            { id: 't2v', label: 'Text → video' },
            { id: 'i2v', label: 'Image → video' },
          ]}
        />
      </div>

      <div className="split wide-left">
        <div className="stack">
          <div className="panel pad">
            <Field label="Model">
              <select className="select" value={modelId} onChange={(e) => setModelId(e.target.value)}>
                {taskModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label} · {m.provider}
                  </option>
                ))}
              </select>
            </Field>
            {model ? <div className="tiny muted-2 mb-12">{model.blurb}</div> : null}

            {mode === 'i2v' ? (
              <>
                <Field label="Start frame">
                  <div className="row">
                    <span className="grow small muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {source ? source.display_name : 'No image selected'}
                    </span>
                    <Btn size="sm" variant="ghost" onClick={() => setPicker('source')}>
                      Choose
                    </Btn>
                  </div>
                </Field>
                <Field label="End frame (optional)" hint="Only models that declare an end-image input use this.">
                  <div className="row">
                    <span className="grow small muted">{endFrame ? endFrame.display_name : 'None'}</span>
                    <Btn size="sm" variant="ghost" onClick={() => setPicker('end')}>
                      Choose
                    </Btn>
                    {endFrame ? (
                      <Btn size="sm" variant="subtle" onClick={() => setEndFrame(null)}>
                        Clear
                      </Btn>
                    ) : null}
                  </div>
                </Field>
                {source ? <img src={source.fileUrl} alt="" style={{ width: '100%', borderRadius: 10, border: '1px solid var(--line)', marginBottom: 12 }} /> : null}
              </>
            ) : null}

            <Field label="Prompt">
              <textarea className="textarea" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} />
            </Field>
            <PromptEnhancer value={prompt} onEnhanced={setPrompt} providers={providers} toast={toast} />

            <ParamsForm model={model} values={values} onChange={setValues} />
            <div className="tiny muted-2 mt-8">
              Estimated clip length ≈ {(frames / (fps || 16)).toFixed(1)}s ({frames} frames @ {fps}fps)
            </div>

            <label className="row mt-12" style={{ cursor: 'pointer' }}>
              <input type="checkbox" checked={forceMock} onChange={(e) => setForceMock(e.target.checked)} />
              <span className="small">Force mock output (offline test)</span>
            </label>

            {willMock ? (
              <div className="notice warn mt-12">
                {forceMock ? 'Mock mode forced.' : 'fal.ai has no usable key.'} The clip will be generated locally as a placeholder and labelled <strong>Mock — unverified</strong>.
              </div>
            ) : (
              <div className="notice mt-12">
                Provider jobs can take several minutes. You can leave this workspace — the job keeps running and appears in Jobs.
              </div>
            )}

            <Btn variant="primary" className="w-full mt-12" disabled={busy || !model} onClick={generate}>
              {busy ? <Spinner /> : null} Generate video
            </Btn>
          </div>

          <JobProgress job={job} onCancel={() => job && api.jobs.cancel(job.id)} />
        </div>

        <div className="stack">
          {job?.result_asset_ids?.length ? (
            <div className="panel">
              <div className="panel-head">
                <h2>Latest clip</h2>
                <div className="spacer" />
                {job.isMock ? <MockBadge reason={job.mock_reason} /> : <Badge tone="ok">verified</Badge>}
              </div>
              <div className="panel-body">
                <ResultStrip
                  job={job}
                  onOpen={async (a) => {
                    await refreshAssets();
                    sendAsset(a.id, 'assets', 'filmcraft');
                  }}
                />
                <div className="row mt-12">
                  <Btn size="sm" onClick={() => job.result_asset_ids[0] && sendAsset(job.result_asset_ids[0], 'video', 'filmcraft')}>
                    Send to Video Studio
                  </Btn>
                  <Btn size="sm" variant="ghost" onClick={() => job.result_asset_ids[0] && sendAsset(job.result_asset_ids[0], 'effectscraft', 'filmcraft')}>
                    Send to EffectsCraft
                  </Btn>
                  <Btn size="sm" variant="ghost" onClick={() => setNav('exports')}>
                    Export manager
                  </Btn>
                </div>
              </div>
            </div>
          ) : (
            <div className="panel">
              <Empty title="No clip yet" hint="Describe the motion and generate. With no fal key the output is a labelled mock clip." />
            </div>
          )}

          <div className="panel">
            <div className="panel-head">
              <h2>FilmCraft clips</h2>
              <div className="spacer" />
              <Btn size="sm" variant="ghost" onClick={() => setNav('assets')}>
                Asset Studio
              </Btn>
            </div>
            <div className="panel-body">
              {history.length ? (
                <div className="asset-grid">
                  {history.map((a) => (
                    <AssetCard key={a.id} asset={a} onClick={() => sendAsset(a.id, 'video', 'filmcraft')} />
                  ))}
                </div>
              ) : (
                <div className="small muted">Generated clips appear here.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <AssetPicker
        open={picker !== null}
        onClose={() => setPicker(null)}
        onPick={(a) => (picker === 'end' ? setEndFrame(a) : setSource(a))}
        mediaType="image"
        title={picker === 'end' ? 'Choose an end frame' : 'Choose a start frame'}
        currentId={(picker === 'end' ? endFrame : source)?.id}
      />
    </div>
  );
}
