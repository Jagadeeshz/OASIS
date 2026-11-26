import React, { useEffect, useMemo, useState } from 'react';
import { api, Asset } from '../lib/api';
import { useApp } from '../lib/store';
import { AssetPicker, Badge, Btn, Empty, Field, MockBadge, Spinner, StatusBadge } from '../components/ui';
import { JobProgress, ParamsForm, ResultStrip, useJobWatch } from '../components/job';

const OPS = [
  { id: 'local/upscale-2x', media: 'image', label: 'Upscale 2×', blurb: 'Lanczos upscale on this machine — no provider call.' },
  { id: 'local/enhance', media: 'image', label: 'Enhance', blurb: 'Local contrast + unsharp pass.' },
  { id: 'local/denoise', media: 'image', label: 'Denoise', blurb: 'Local hqdn3d denoise.' },
  { id: 'local/filter', media: 'image', label: 'Colour & filter lab', blurb: 'Exposure, contrast, saturation, hue, blur, sharpen, vignette, grain — all local ffmpeg.' },
  { id: 'fal-ai/imageutils/rembg', media: 'image', label: 'Remove background', blurb: 'fal.ai rembg (live) or a labelled mock if no key.' },
  { id: 'local/video-enhance', media: 'video', label: 'Video enhance', blurb: 'Scale + sharpen a clip locally with ffmpeg.' },
];

export default function EffectsCraft() {
  const { projectId, models, providers, assets, toast, sendAsset, consumeHandoff, refreshAssets, info } = useApp();
  const [source, setSource] = useState<Asset | null>(null);
  const [picker, setPicker] = useState(false);
  const [opId, setOpId] = useState('local/upscale-2x');
  const [values, setValues] = useState<Record<string, any>>({});
  const [forceMock, setForceMock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [versions, setVersions] = useState<Asset[]>([]);
  const { job, watch } = useJobWatch();

  const fal = providers.find((p) => p.id === 'fal');
  const model = useMemo(() => models.find((m) => m.id === opId) || null, [models, opId]);
  const ops = OPS.filter((o) => !source || o.media === source.media_type);

  useEffect(() => {
    const h = consumeHandoff();
    if (h?.assetId) api.assets.get(h.assetId).then(setSource).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (source && !OPS.some((o) => o.id === opId && o.media === source.media_type)) {
      setOpId(source.media_type === 'video' ? 'local/video-enhance' : 'local/upscale-2x');
    }
    setValues({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, opId]);

  useEffect(() => {
    if (source) api.assets.versions(source.id).then(setVersions).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, job?.status]);

  const result = job?.result_asset_ids?.length ? assets.find((a) => a.id === job.result_asset_ids[0]) || null : null;

  const run = async () => {
    if (!source) return toast('Choose an asset first', 'warn');
    if (!model) return toast('Choose an operation', 'warn');
    if (!info?.ffmpeg?.available && model.provider === 'local') return toast('ffmpeg is required for local operations', 'error');
    setBusy(true);
    try {
      const created = await api.jobs.create({
        projectId,
        workspace: 'effectscraft',
        taskType: model.task,
        model: model.id,
        params: { ...values },
        inputAssetIds: [source.id],
        forceMock,
      });
      watch(created.id);
      await api.jobs.start(created.id);
      toast('Processing started', 'info');
    } catch (err: any) {
      toast(err.validation?.join('; ') || err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const willMock = forceMock || (model?.provider === 'fal' && (!fal?.enabled || !fal?.hasSecret));
  const canRun = model && source && (model.provider !== 'local' || info?.ffmpeg?.available);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>EffectsCraft</h1>
          <p>Enhance, upscale, denoise and cut out. Every result is written as a new version — the original is never overwritten.</p>
        </div>
        <div className="spacer" />
        {info && !info.ffmpeg?.available ? <Badge tone="warn">ffmpeg missing — local ops disabled</Badge> : null}
      </div>

      <div className="split wide-left">
        <div className="stack">
          <div className="panel pad">
            <Field label="Source asset">
              <div className="row">
                <span className="grow small muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {source ? `${source.display_name} (${source.media_type})` : 'Nothing selected'}
                </span>
                <Btn size="sm" variant="ghost" onClick={() => setPicker(true)}>
                  Choose
                </Btn>
              </div>
            </Field>

            <Field label="Operation">
              <select className="select" value={opId} onChange={(e) => setOpId(e.target.value)}>
                {ops.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label} · {o.media}
                  </option>
                ))}
              </select>
            </Field>
            <div className="tiny muted-2 mb-12">{OPS.find((o) => o.id === opId)?.blurb}</div>

            <ParamsForm model={model} values={values} onChange={setValues} exclude={['prompt']} />

            <label className="row mt-12" style={{ cursor: 'pointer' }}>
              <input type="checkbox" checked={forceMock} onChange={(e) => setForceMock(e.target.checked)} />
              <span className="small">Force mock output</span>
            </label>

            {willMock ? (
              <div className="notice warn mt-12">
                This operation has no live provider key. Result will be a labelled <strong>Mock — unverified</strong> placeholder.
              </div>
            ) : null}

            <Btn variant="primary" className="w-full mt-12" disabled={busy || !canRun} onClick={run}>
              {busy ? <Spinner /> : null} Run operation
            </Btn>
            <Btn
              variant="ghost"
              className="w-full mt-8"
              onClick={() => {
                setValues({});
                setForceMock(false);
                toast('Effect settings reset', 'success');
              }}
            >
              Reset settings
            </Btn>
            {!canRun && model?.provider === 'local' ? <div className="tiny muted-2 mt-8">Install ffmpeg and restart OASIS to enable local processing.</div> : null}
          </div>

          <JobProgress job={job} onCancel={() => job && api.jobs.cancel(job.id)} />
        </div>

        <div className="stack">
          <div className="panel">
            <div className="panel-head">
              <h2>Compare</h2>
              <div className="spacer" />
              {result ? <StatusBadge status={result.verification} /> : null}
            </div>
            <div className="panel-body">
              {source ? (
                <div className="compare">
                  <figure>
                    <div className="preview-stage">
                      {source.media_type === 'video' ? (
                        <video src={source.fileUrl} controls muted />
                      ) : (
                        <img src={source.fileUrl} alt="" />
                      )}
                    </div>
                    <figcaption>
                      Before · {source.width}×{source.height} · v{source.version}
                      {source.isMock ? ' · mock source' : ''}
                    </figcaption>
                  </figure>
                  <figure>
                    <div className="preview-stage">
                      {result ? (
                        result.media_type === 'video' ? (
                          <video src={result.fileUrl} controls />
                        ) : (
                          <img src={result.fileUrl} alt="" />
                        )
                      ) : (
                        <div className="muted small" style={{ padding: 30 }}>{job?.status === 'running' ? 'Processing…' : 'Result appears here'}</div>
                      )}
                    </div>
                    <figcaption>
                      After {result ? `· ${result.width}×${result.height} · v${result.version}` : ''}
                      {result?.isMock ? ' · Mock — unverified' : ''}
                    </figcaption>
                  </figure>
                </div>
              ) : (
                <Empty title="Select an asset to compare" hint="Pick any image or clip from the shared library." />
              )}
            </div>
          </div>

          {versions.length > 1 ? (
            <div className="panel">
              <div className="panel-head">
                <h2>Version history</h2>
                <div className="spacer" />
                <Badge>{versions.length} versions</Badge>
              </div>
              <div className="panel-body">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Version</th>
                      <th>Size</th>
                      <th>Verification</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {versions.map((v) => (
                      <tr key={v.id}>
                        <td className="small">
                          v{v.version} {v.id === source?.id ? <Badge tone="info">source</Badge> : null}
                        </td>
                        <td className="small">{v.width}×{v.height}</td>
                        <td>{v.isMock ? <Badge tone="mock">mock</Badge> : <Badge tone="ok">verified</Badge>}</td>
                        <td>
                          <Btn size="sm" variant="ghost" onClick={() => setSource(v)}>
                            Use
                          </Btn>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {result ? (
            <div className="row">
              <Btn size="sm" onClick={() => sendAsset(result.id, 'assets', 'effectscraft')}>
                Asset Studio
              </Btn>
              <Btn
                size="sm"
                variant="ghost"
                onClick={async () => {
                  const p = await api.assets.saveCopy(result.id);
                  if (p) toast('Saved to ' + p, 'success');
                }}
              >
                Download
              </Btn>
              <Btn size="sm" variant="ghost" onClick={() => sendAsset(result.id, 'video', 'effectscraft')}>
                Video Studio
              </Btn>
              <Btn size="sm" variant="ghost" onClick={() => sendAsset(result.id, 'photocraft', 'effectscraft')}>
                PhotoCraft
              </Btn>
            </div>
          ) : null}
        </div>
      </div>

      <AssetPicker open={picker} onClose={() => setPicker(false)} onPick={setSource} mediaType="all" title="Choose an asset" currentId={source?.id} />
    </div>
  );
}
