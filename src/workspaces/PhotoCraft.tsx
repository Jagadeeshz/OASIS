import React, { useEffect, useMemo, useState } from 'react';
import { api, Asset } from '../lib/api';
import { useApp } from '../lib/store';
import { AssetCard, AssetPicker, Badge, Btn, Empty, Field, MockBadge, Spinner, Tabs } from '../components/ui';
import { JobProgress, ParamsForm, PromptEnhancer, ResultStrip, useJobWatch } from '../components/job';

const MODES = {
  create: { task: 'image.generate', defaultModel: 'fal-ai/flux/schnell', hint: 'Text to image' },
  edit: { task: 'image.edit', defaultModel: 'fal-ai/flux/dev/image-to-image', hint: 'Prompt-guided edit' },
  removebg: { task: 'image.removeBackground', defaultModel: 'fal-ai/imageutils/rembg', hint: 'Cut out the subject' },
} as const;

export default function PhotoCraft() {
  const { projectId, models, providers, assets, toast, sendAsset, consumeHandoff, refreshAssets, setNav } = useApp();
  const [mode, setMode] = useState<keyof typeof MODES>('create');
  const [modelId, setModelId] = useState<string>(MODES.create.defaultModel);
  const [values, setValues] = useState<Record<string, any>>({});
  const [prompt, setPrompt] = useState('A weathered lighthouse on a basalt cliff at dusk, volumetric fog, 35mm film');
  const [source, setSource] = useState<Asset | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [forceMock, setForceMock] = useState(false);
  const [busy, setBusy] = useState(false);
  const { job, watch } = useJobWatch();

  const taskModels = useMemo(() => models.filter((m) => m.task === MODES[mode].task), [models, mode]);
  const model = useMemo(() => models.find((m) => m.id === modelId) || null, [models, modelId]);
  const falProvider = providers.find((p) => p.id === 'fal');
  const willMock = forceMock || (model?.provider === 'fal' && (!falProvider?.enabled || !falProvider?.hasSecret));

  useEffect(() => {
    const h = consumeHandoff();
    if (h?.assetId) {
      api.assets.get(h.assetId).then((a) => {
        setSource(a);
        setMode('edit');
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const list = taskModels.map((m) => m.id);
    if (!list.includes(modelId) && list.length) setModelId(MODES[mode].defaultModel && list.includes(MODES[mode].defaultModel) ? MODES[mode].defaultModel : list[0]);
    setValues({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, models]);

  const history = assets.filter((a) => a.source_workspace === 'photocraft').slice(0, 12);

  const generate = async () => {
    if (!model) return;
    if (model.imageParam && !source) {
      toast('Pick a source image for this operation', 'warn');
      return;
    }
    if (!prompt.trim() && !model.imageParam) {
      toast('Write a prompt first', 'warn');
      return;
    }
    setBusy(true);
    try {
      const params: Record<string, any> = { ...values };
      if (model.params.some((p) => p.name === 'prompt')) params.prompt = prompt;
      const created = await api.jobs.create({
        projectId,
        workspace: 'photocraft',
        taskType: model.task,
        model: model.id,
        params,
        inputAssetIds: source ? [source.id] : [],
        forceMock,
      });
      watch(created.id);
      await api.jobs.start(created.id);
      toast(created.execution_mode === 'mock' ? 'Running in mock mode — output will be labelled unverified' : 'Generation submitted', created.execution_mode === 'mock' ? 'warn' : 'info');
    } catch (err: any) {
      toast(err.validation?.join('; ') || err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const onResult = async (a: Asset) => {
    await refreshAssets();
    sendAsset(a.id, 'assets', 'photocraft');
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>PhotoCraft</h1>
          <p>Create, edit and cut out images. Results land in Asset Studio and can be sent anywhere without re-uploading.</p>
        </div>
        <div className="spacer" />
        <Tabs
          value={mode}
          onChange={(m) => setMode(m)}
          tabs={[
            { id: 'create', label: 'Create' },
            { id: 'edit', label: 'Edit' },
            { id: 'removebg', label: 'Background' },
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

            {mode !== 'create' ? (
              <Field label="Source image">
                <div className="row">
                  <div className="grow small muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {source ? source.display_name : 'No image selected'}
                  </div>
                  <Btn size="sm" variant="ghost" onClick={() => setPickerOpen(true)}>
                    Choose
                  </Btn>
                </div>
              </Field>
            ) : null}
            {source && mode !== 'create' ? (
              <div className="mb-12">
                <img src={source.fileUrl} alt="" style={{ width: '100%', borderRadius: 10, border: '1px solid var(--line)' }} />
              </div>
            ) : null}

            {mode !== 'removebg' ? (
              <>
                <Field label="Prompt">
                  <textarea className="textarea" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} />
                </Field>
                <PromptEnhancer value={prompt} onEnhanced={setPrompt} providers={providers} toast={toast} />
              </>
            ) : null}

            <ParamsForm model={model} values={values} onChange={setValues} />

            <label className="row mt-12" style={{ cursor: 'pointer' }}>
              <input type="checkbox" checked={forceMock} onChange={(e) => setForceMock(e.target.checked)} />
              <span className="small">Force mock output (offline test)</span>
            </label>

            {willMock ? (
              <div className="notice warn mt-12">
                {forceMock ? 'Mock mode forced.' : 'fal.ai has no usable key.'} Output will be deterministic and labelled <strong>Mock — unverified</strong>.
              </div>
            ) : null}

            <Btn variant="primary" className="w-full mt-12" disabled={busy || !model} onClick={generate}>
              {busy ? <Spinner /> : null} {mode === 'create' ? 'Generate image' : mode === 'edit' ? 'Apply edit' : 'Remove background'}
            </Btn>
          </div>

          <JobProgress job={job} onCancel={() => job && api.jobs.cancel(job.id)} />
        </div>

        <div className="stack">
          {job?.result_asset_ids?.length ? (
            <div className="panel">
              <div className="panel-head">
                <h2>Latest result</h2>
                <div className="spacer" />
                {job.isMock ? <MockBadge reason={job.mock_reason} /> : <Badge tone="ok">verified</Badge>}
              </div>
              <div className="panel-body">
                <ResultStrip job={job} onOpen={onResult} />
                {job.params?.prompt ? <div className="tiny muted-2">Prompt: {String(job.params.prompt)}</div> : null}
                <div className="row mt-12">
                  <Btn size="sm" onClick={() => job.result_asset_ids[0] && sendAsset(job.result_asset_ids[0], 'assets', 'photocraft')}>
                    Open in Asset Studio
                  </Btn>
                  <Btn size="sm" variant="ghost" onClick={() => job.result_asset_ids[0] && sendAsset(job.result_asset_ids[0], 'filmcraft', 'photocraft')}>
                    Send to FilmCraft
                  </Btn>
                  <Btn size="sm" variant="ghost" onClick={() => job.result_asset_ids[0] && sendAsset(job.result_asset_ids[0], 'effectscraft', 'photocraft')}>
                    Send to EffectsCraft
                  </Btn>
                  <Btn
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      const a = await api.assets.get(job.result_asset_ids[0]);
                      setSource(a);
                      setMode('edit');
                      setValues({});
                    }}
                  >
                    Use as source
                  </Btn>
                </div>
              </div>
            </div>
          ) : (
            <div className="panel">
              <Empty
                title={mode === 'create' ? 'Nothing generated yet' : 'Pick a source image'}
                hint={
                  mode === 'create'
                    ? 'Describe an image and press Generate. With no fal key the result is a clearly labelled mock.'
                    : 'Choose an image from Asset Studio, then describe the change.'
                }
              />
            </div>
          )}

          <div className="panel">
            <div className="panel-head">
              <h2>PhotoCraft history</h2>
              <div className="spacer" />
              <Btn size="sm" variant="ghost" onClick={() => setNav('assets')}>
                Asset Studio
              </Btn>
            </div>
            <div className="panel-body">
              {history.length ? (
                <div className="asset-grid">
                  {history.map((a) => (
                    <AssetCard key={a.id} asset={a} onClick={() => setSource(a)} />
                  ))}
                </div>
              ) : (
                <div className="small muted">Generated images appear here and in Asset Studio.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <AssetPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onPick={setSource} mediaType="image" title="Choose a source image" currentId={source?.id} />
    </div>
  );
}
