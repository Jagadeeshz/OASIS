import React, { useEffect, useState } from 'react';
import { api, Asset, ExportRecord, fmtBytes, fmtDate, Job } from '../lib/api';
import { useApp } from '../lib/store';
import { AssetCard, Badge, Btn, Empty, MockBadge, StatusBadge } from '../components/ui';

export default function Dashboard() {
  const { projectId, project, assets, jobs, providers, setNav, sendAsset, toast } = useApp();
  const [stats, setStats] = useState<any>({ total: 0, images: 0, videos: 0, audio: 0, bytes: 0 });
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [exportsList, setExportsList] = useState<ExportRecord[]>([]);

  useEffect(() => {
    if (!projectId) return;
    api.assets.stats(projectId).then(setStats).catch(() => {});
    api.workflows.list(projectId).then(setWorkflows).catch(() => {});
    api.exports.list(projectId).then(setExportsList).catch(() => {});
  }, [projectId, assets.length, jobs.length]);

  const active = jobs.filter((j) => ['queued', 'submitted', 'running'].includes(j.status));
  const failed = jobs.filter((j) => j.status === 'failed');
  const mockAssets = assets.filter((a) => a.isMock).length;
  const recent = assets.slice(0, 8);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{project?.name || 'Project'}</h1>
          <p>
            {project?.description || 'One project context shared by every workspace. Assets, jobs and provider settings live here.'}
          </p>
        </div>
        <div className="spacer" />
        <Btn variant="primary" onClick={() => setNav('photocraft')}>
          Generate an image
        </Btn>
      </div>

      <div className="grid stats mb-12">
        <div className="stat">
          <div className="label">Assets</div>
          <div className="value">{stats.total}</div>
          <div className="meta">
            {stats.images} images · {stats.videos} video · {stats.audio} audio
          </div>
        </div>
        <div className="stat">
          <div className="label">Active jobs</div>
          <div className="value">{active.length}</div>
          <div className="meta">{failed.length} failed recently</div>
        </div>
        <div className="stat">
          <div className="label">Workflows</div>
          <div className="value">{workflows.length}</div>
          <div className="meta">{workflows.filter((w) => w.last_run_at).length} executed</div>
        </div>
        <div className="stat">
          <div className="label">Storage used</div>
          <div className="value">{fmtBytes(stats.bytes)}</div>
          <div className="meta">{exportsList.length} exports</div>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="panel">
          <div className="panel-head">
            <h2>Providers</h2>
            <div className="spacer" />
            <Btn variant="ghost" size="sm" onClick={() => setNav('providers')}>
              Manage
            </Btn>
          </div>
          <div className="panel-body stack">
            {providers.map((p) => (
              <div key={p.id} className="provider-row">
                <div className="provider-id">
                  <div className="row" style={{ gap: 8 }}>
                    <strong className="small">{p.label}</strong>
                    <Badge>{p.role}</Badge>
                    {p.enabled ? null : <Badge>disabled</Badge>}
                  </div>
                  <div className="tiny muted-2 mt-8 provider-capabilities">
                    {p.capabilities.slice(0, 3).join(' · ')}
                  </div>
                </div>
                <div className="provider-state">
                  {p.requiresKey ? (
                    <span className="tiny muted-2 nowrap">{p.hasSecret ? p.secretHint : 'no key'}</span>
                  ) : (
                    <span className="tiny muted-2 nowrap">{p.config.endpoint}</span>
                  )}
                  <StatusBadge status={p.status} />
                </div>
              </div>
            ))}
            {!providers.find((p) => p.id === 'fal')?.hasSecret ? (
              <div className="notice warn">
                fal.ai has no API key yet. Everything still runs, but generation results will be produced in mock mode and labelled
                <strong> Mock — unverified</strong>.
              </div>
            ) : null}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>Recent activity</h2>
            <div className="spacer" />
            <Btn variant="ghost" size="sm" onClick={() => setNav('jobs')}>
              All jobs
            </Btn>
          </div>
          <div>
            {jobs.slice(0, 7).map((j) => (
              <div key={j.id} className="row between" style={{ padding: '9px 16px', borderBottom: '1px solid var(--line)' }}>
                <div style={{ minWidth: 0 }}>
                  <div className="small nowrap" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {j.modelLabel}
                  </div>
                  <div className="tiny muted-2">
                    {j.workspace} · {fmtDate(j.created_at)}
                  </div>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  {j.isMock ? <MockBadge label={false} /> : <StatusBadge status={j.status} />}
                </div>
              </div>
            ))}
            {jobs.length === 0 ? <Empty title="No jobs yet" hint="Generate something from any workspace to see it here." /> : null}
          </div>
        </div>
      </div>

      <div className="panel mt-16">
        <div className="panel-head">
          <h2>Recently added assets</h2>
          <div className="spacer" />
          {mockAssets > 0 ? <Badge tone="warn">{mockAssets} mock · unverified</Badge> : null}
          <Btn variant="ghost" size="sm" onClick={() => setNav('assets')}>
            Asset Studio
          </Btn>
        </div>
        <div className="panel-body">
          {recent.length ? (
            <div className="asset-grid">
              {recent.map((a) => (
                <AssetCard
                  key={a.id}
                  asset={a}
                  onClick={() => sendAsset(a.id, 'assets')}
                  onDoubleClick={() => sendAsset(a.id, 'photocraft', 'dashboard')}
                />
              ))}
            </div>
          ) : (
            <Empty title="Your library is empty" hint="PhotoCraft, FilmCraft and EffectsCraft all write here automatically." />
          )}
        </div>
      </div>

      <div className="grid cols-3 mt-16">
        {[
          { label: 'AI Canvas', hint: 'Chain prompt → model → output', nav: 'canvas' as const },
          { label: 'FilmCraft', hint: 'Text or image to video', nav: 'filmcraft' as const },
          { label: 'Video Studio', hint: 'Cut, title and export', nav: 'video' as const },
        ].map((c) => (
          <div key={c.label} className="panel pad" style={{ cursor: 'pointer' }} onClick={() => setNav(c.nav)}>
            <div className="row between">
              <strong>{c.label}</strong>
              <span className="muted-2">→</span>
            </div>
            <div className="small muted mt-8">{c.hint}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
