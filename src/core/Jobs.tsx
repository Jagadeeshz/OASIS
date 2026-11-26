import React, { useState } from 'react';
import { api, fmtDate, Job } from '../lib/api';
import { useApp } from '../lib/store';
import { Badge, Btn, Empty, MockBadge, Progress, StatusBadge, Tabs } from '../components/ui';

export default function Jobs() {
  const { projectId, jobs, toast, setNav, sendAsset, refreshJobs } = useApp();
  const [tab, setTab] = useState<'all' | 'active' | 'succeeded' | 'failed' | 'mock'>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [provider, setProvider] = useState('');
  const [task, setTask] = useState('');

  const providers = [...new Set(jobs.map((j) => j.provider))];
  const taskTypes = [...new Set(jobs.map((j) => j.task_type))];

  const filtered = jobs.filter((j) => {
    const needle = q.trim().toLowerCase();
    if (needle) {
      const hay = [j.model, j.modelLabel, j.id, j.error, j.params?.prompt, j.workspace].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    if (provider && j.provider !== provider) return false;
    if (task && j.task_type !== task) return false;
    if (tab === 'all') return true;
    if (tab === 'active') return ['queued', 'submitted', 'running'].includes(j.status);
    if (tab === 'mock') return j.status === 'mock' || j.isMock;
    return j.status === tab;
  });

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Jobs</h1>
          <p>One queue for every workspace. Status, provider response, error text and provenance are recorded per job.</p>
        </div>
        <div className="spacer" />
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'all', label: 'All' },
            { id: 'active', label: 'Active' },
            { id: 'succeeded', label: 'Succeeded' },
            { id: 'mock', label: 'Mock' },
            { id: 'failed', label: 'Failed' },
          ]}
        />
      </div>

      <div className="panel pad mb-12" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          className="input"
          style={{ maxWidth: 280 }}
          placeholder="Search model, job id, prompt, error…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search jobs"
        />
        <select className="select" style={{ width: 150 }} value={provider} onChange={(e) => setProvider(e.target.value)} aria-label="Filter by provider">
          <option value="">All providers</option>
          {providers.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select className="select" style={{ width: 190 }} value={task} onChange={(e) => setTask(e.target.value)} aria-label="Filter by task">
          <option value="">All tasks</option>
          {taskTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <Btn size="sm" variant="ghost" onClick={() => { setQ(''); setProvider(''); setTask(''); setTab('all'); }}>Reset</Btn>
        <div className="spacer" style={{ flex: 1 }} />
        <span className="tiny muted-2">{filtered.length} of {jobs.length}</span>
        <Btn size="sm" variant="ghost" onClick={async () => { await refreshJobs(); toast('Jobs refreshed', 'success'); }}>Refresh</Btn>
        <Btn size="sm" variant="subtle" onClick={() => setNav('logs')}>View logs</Btn>
      </div>

      <div className="panel">
        {filtered.length === 0 ? (
          <Empty title="No jobs in this view" hint="Run a generation in PhotoCraft, FilmCraft, EffectsCraft or AI Canvas." />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Job</th>
                <th>Workspace</th>
                <th>Status</th>
                <th style={{ width: 140 }}>Progress</th>
                <th>Mode</th>
                <th>Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((j) => (
                <React.Fragment key={j.id}>
                  <tr style={{ cursor: 'pointer' }} onClick={() => setExpanded(expanded === j.id ? null : j.id)}>
                    <td>
                      <div className="small">{j.modelLabel}</div>
                      <div className="tiny muted-2 mono">{j.id.slice(0, 18)}…</div>
                    </td>
                    <td className="small muted">{j.workspace}</td>
                    <td>
                      <div className="row" style={{ gap: 5 }}>
                        <StatusBadge status={j.status} />
                        {j.isMock ? <MockBadge label={false} /> : null}
                      </div>
                    </td>
                    <td>
                      <Progress value={j.progress} tone={j.status === 'failed' ? 'danger' : j.status === 'mock' ? 'warn' : j.status === 'succeeded' ? 'ok' : ''} />
                      <div className="tiny muted-2" style={{ marginTop: 3 }}>{Math.round((j.progress || 0) * 100)}%</div>
                    </td>
                    <td>
                      <Badge>{j.execution_mode}</Badge>
                    </td>
                    <td className="tiny muted-2">{fmtDate(j.created_at)}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="row" style={{ gap: 5, justifyContent: 'flex-end' }}>
                        {['queued', 'submitted', 'running'].includes(j.status) ? (
                          <Btn size="sm" variant="ghost" onClick={async () => { await api.jobs.cancel(j.id); toast('Cancellation requested'); }}>
                            Cancel
                          </Btn>
                        ) : null}
                        {['failed', 'cancelled'].includes(j.status) ? (
                          <Btn size="sm" variant="ghost" onClick={async () => { await api.jobs.retry(j.id); toast('Job retried'); }}>
                            Retry
                          </Btn>
                        ) : null}
                        {j.result_asset_ids?.length ? (
                          <Btn
                            size="sm"
                            onClick={() => {
                              sendAsset(j.result_asset_ids[0], 'assets', 'jobs');
                              setNav('assets');
                            }}
                          >
                            Result
                          </Btn>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                  {expanded === j.id ? (
                    <tr>
                      <td colSpan={7} style={{ background: 'var(--panel-2)' }}>
                        <div className="grid cols-2" style={{ gap: 16 }}>
                          <div>
                            <dl className="kv">
                              <dt>Provider</dt>
                              <dd>{j.provider}</dd>
                              <dt>Model</dt>
                              <dd className="mono">{j.model}</dd>
                              <dt>Task</dt>
                              <dd>{j.taskLabel}</dd>
                              <dt>Provider job ID</dt>
                              <dd className="mono">{j.provider_job_id || '—'}</dd>
                              <dt>Execution</dt>
                              <dd>
                                {j.execution_mode}
                                {j.mock_reason ? ` — ${j.mock_reason}` : ''}
                              </dd>
                              <dt>Verification</dt>
                              <dd>{j.verificationLabel}</dd>
                            </dl>
                          </div>
                          <div>
                            <div className="tiny muted-2 mb-8">PARAMETERS</div>
                            <pre className="mono" style={{ whiteSpace: 'pre-wrap', margin: 0, maxHeight: 160, overflow: 'auto' }}>
                              {JSON.stringify(j.params, null, 2)}
                            </pre>
                            {j.error ? <div className="notice danger mt-8">{j.error}</div> : null}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="tiny muted-2 mt-12">Project {projectId.slice(0, 14)}… · showing the latest 80 jobs</div>
    </div>
  );
}
