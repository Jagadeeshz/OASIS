import React, { useEffect, useMemo, useState } from 'react';
import { api, Asset, Job, ModelInfo, ParamDef } from '../lib/api';
import { useApp } from '../lib/store';
import { Badge, Btn, MockBadge, Progress, StatusBadge } from './ui';

export function useJobWatch() {
  const { jobs } = useApp();
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useMemo(() => (jobId ? jobs.find((j) => j.id === jobId) || null : null), [jobs, jobId]);
  return { job, jobId, watch: (id: string) => setJobId(id), reset: () => setJobId(null) };
}

export function ParamsForm({
  model,
  values,
  onChange,
  exclude = ['prompt', 'text'],
}: {
  model: ModelInfo | null;
  values: Record<string, any>;
  onChange: (v: Record<string, any>) => void;
  exclude?: string[];
}) {
  if (!model || !model.params?.length) return null;
  const defs = model.params.filter((d) => !exclude.includes(d.name));
  if (!defs.length) return null;
  return (
    <div className="grid cols-2" style={{ gap: 10 }}>
      {defs.map((def) => (
        <ParamField key={def.name} def={def} value={values[def.name]} onChange={(v) => onChange({ ...values, [def.name]: v })} />
      ))}
    </div>
  );
}

function ParamField({ def, value, onChange }: { def: ParamDef; value: any; onChange: (v: any) => void }) {
  const v = value === undefined || value === null || value === '' ? def.default : value;
  if (def.type === 'enum') {
    return (
      <div className="field" style={{ marginBottom: 0 }}>
        <label>{def.label}</label>
        <select className="select" value={String(v ?? '')} onChange={(e) => onChange(e.target.value)}>
          {(def.values || []).map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </div>
    );
  }
  if (def.type === 'bool') {
    return (
      <label className="row" style={{ cursor: 'pointer', marginBottom: 0 }}>
        <input type="checkbox" checked={!!v} onChange={(e) => onChange(e.target.checked)} />
        <span className="small">{def.label}</span>
      </label>
    );
  }
  if (def.type === 'int' || def.type === 'float') {
    return (
      <div className="field" style={{ marginBottom: 0 }}>
        <label>{def.label}</label>
        <input
          className="input"
          type="number"
          value={v ?? ''}
          min={def.min}
          max={def.max}
          step={def.type === 'float' ? 0.05 : 1}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        />
        {def.help ? <div className="hint">{def.help}</div> : null}
      </div>
    );
  }
  return (
    <div className="field" style={{ marginBottom: 0 }}>
      <label>{def.label}</label>
      <input className="input" value={v ?? ''} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function JobProgress({ job, onCancel }: { job: Job | null; onCancel?: () => void }) {
  if (!job) return null;
  const active = ['queued', 'submitted', 'running'].includes(job.status);
  return (
    <div className="panel pad mb-12">
      <div className="row between mb-8" style={{ flexWrap: 'nowrap' }}>
        <div className="row" style={{ gap: 8, minWidth: 0, overflow: 'hidden' }}>
          <StatusBadge status={job.status} />
          <span className="small nowrap" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{job.modelLabel}</span>
          {job.isMock ? <MockBadge reason={job.mock_reason} label={false} /> : null}
        </div>
        {active && onCancel ? (
          <Btn size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Btn>
        ) : null}
      </div>
      <Progress value={job.progress} tone={job.status === 'failed' ? 'danger' : job.status === 'mock' ? 'warn' : job.status === 'succeeded' ? 'ok' : ''} />
      <div className="row between mt-8">
        <span className="tiny muted-2">
          {job.status === 'submitted' ? 'queued at provider' : job.status === 'running' ? 'running' : job.status === 'mock' ? 'mock output (no live provider call)' : job.status}
          {job.provider_job_id ? ` · ${job.provider_job_id.slice(0, 12)}…` : ''}
        </span>
        <span className="tiny muted-2">{Math.round((job.progress || 0) * 100)}%</span>
      </div>
      {job.error ? <div className="notice danger mt-8">{job.error}</div> : null}
      {job.isMock && job.mock_reason ? (
        <div className="notice warn mt-8">
          This result is labelled <strong>Mock — unverified</strong>: {job.mock_reason}. It is not a live provider output.
        </div>
      ) : null}
    </div>
  );
}

export function ResultStrip({ job, onOpen }: { job: Job | null; onOpen?: (a: Asset) => void }) {
  const { assets } = useApp();
  const [fetched, setFetched] = useState<Asset[]>([]);
  useEffect(() => {
    if (!job?.result_asset_ids?.length) {
      setFetched([]);
      return;
    }
    const fromStore = assets.filter((a) => job.result_asset_ids.includes(a.id));
    if (fromStore.length === job.result_asset_ids.length) {
      setFetched(fromStore);
      return;
    }
    Promise.all(job.result_asset_ids.map((id) => api.assets.get(id)))
      .then((list) => setFetched(list.filter(Boolean)))
      .catch(() => {});
  }, [job, assets]);
  if (!fetched.length) return null;
  return (
    <div className="asset-grid mb-12">
      {fetched.map((a) => (
        <div key={a.id} className="asset-card" onClick={() => onOpen?.(a)}>
          <div className="thumb">
            {a.media_type === 'image' ? <img src={a.thumbUrl || a.fileUrl} alt={a.display_name} /> : null}
            {a.media_type === 'video' ? <video src={a.fileUrl} muted preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
            {a.media_type === 'audio' ? <div className="placeholder">♪ audio</div> : null}
            {a.isMock ? <span className="stamp"><MockBadge reason={a.mock_reason} label={false} /></span> : null}
          </div>
          <div className="meta">
            <div className="name">{a.display_name}</div>
            <div className="sub">
              <Badge>{a.media_type}</Badge>
              <span>v{a.version}</span>
              <span>{a.verification === 'verified' ? 'verified' : 'mock'}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function PromptEnhancer({
  value,
  onEnhanced,
  providers,
  toast,
}: {
  value: string;
  onEnhanced: (v: string) => void;
  providers: any[];
  toast: (m: string, k?: any) => void;
}) {
  const deepseek = providers.find((p) => p.id === 'deepseek');
  const ollama = providers.find((p) => p.id === 'ollama');
  const [mode, setMode] = useState<'enhance' | 'expand' | 'storyboard'>('enhance');
  const [busy, setBusy] = useState(false);
  const available = (deepseek?.enabled && deepseek?.hasSecret) || (ollama?.enabled && ollama?.model);
  return (
    <div className="row wrap mb-8" style={{ gap: 6 }}>
      <select className="select" style={{ width: 130 }} value={mode} onChange={(e) => setMode(e.target.value as any)}>
        <option value="enhance">Enhance</option>
        <option value="expand">Expand</option>
        <option value="storyboard">Storyboard</option>
      </select>
      <Btn
        size="sm"
        variant="ghost"
        disabled={busy || !value.trim() || !available}
        title={available ? 'Rewrite this prompt with the configured text provider' : 'Enable DeepSeek or Ollama in Providers to use prompt assistance'}
        onClick={async () => {
          setBusy(true);
          try {
            const res = await api.providers.enhance({ prompt: value, mode });
            onEnhanced(res.text);
            toast(`Prompt rewritten with ${res.provider}`, 'success');
          } catch (err: any) {
            toast(err.message, 'error');
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Thinking…' : 'Improve prompt'}
      </Btn>
      {!available ? <span className="tiny muted-2">DeepSeek/Ollama off — prompt tools disabled</span> : null}
    </div>
  );
}
