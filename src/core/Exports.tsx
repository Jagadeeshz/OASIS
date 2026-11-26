import React, { useEffect, useState } from 'react';
import { api, ExportRecord, fmtBytes, fmtDate, fmtDuration } from '../lib/api';
import { useApp } from '../lib/store';
import { Badge, Btn, Empty, Modal, Progress, Spinner, StatusBadge } from '../components/ui';

export default function Exports() {
  const { projectId, exportsRev, toast, setNav } = useApp();
  const [list, setList] = useState<ExportRecord[]>([]);
  const [selected, setSelected] = useState<ExportRecord | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [deleting, setDeleting] = useState<ExportRecord | null>(null);

  const load = () => {
    if (!projectId) return;
    api.exports.list(projectId).then(setList).catch(() => {});
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, exportsRev]);

  useEffect(() => {
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const openTimeline = (id: string) => {
    sessionStorage.setItem('oasis.timelineId', id);
    setNav('video');
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Exports</h1>
          <p>Every export is rendered by ffmpeg from the saved timeline and ships with a provenance manifest listing every source asset.</p>
        </div>
        <div className="spacer" />
        <Btn variant="ghost" onClick={load}>
          Refresh
        </Btn>
        <Btn onClick={() => setNav('video')}>Video Studio</Btn>
      </div>

      <div className="panel pad mb-12" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          className="input"
          style={{ maxWidth: 280 }}
          placeholder="Search by id, timeline or path…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search exports"
        />
        <select className="select" style={{ width: 150 }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter exports by status">
          <option value="all">All statuses</option>
          <option value="succeeded">Succeeded</option>
          <option value="running">Running</option>
          <option value="failed">Failed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <Btn size="sm" variant="ghost" onClick={() => { setQ(''); setStatus('all'); }}>Reset</Btn>
        <div className="spacer" style={{ flex: 1 }} />
        <span className="tiny muted-2">{list.filter((e) => (status === 'all' || e.status === status) && (!q.trim() || (e.id + ' ' + e.timeline_id + ' ' + (e.output_path || '')).toLowerCase().includes(q.trim().toLowerCase()))).length} of {list.length}</span>
      </div>

      {list.length === 0 ? (
        <Empty title="No exports yet" hint="Build a timeline in Video Studio and press Export." action={<Btn onClick={() => setNav('video')}>Open Video Studio</Btn>} />
      ) : (
        <div className="panel">
          <table className="table">
            <thead>
              <tr>
                <th>Export</th>
                <th>Timeline</th>
                <th>Status</th>
                <th style={{ width: 150 }}>Progress</th>
                <th>Verification</th>
                <th>Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list
                .filter((e) => (status === 'all' || e.status === status) && (!q.trim() || (e.id + ' ' + e.timeline_id + ' ' + (e.output_path || '')).toLowerCase().includes(q.trim().toLowerCase())))
                .map((e) => (
                <tr key={e.id}>
                  <td>
                    <div className="small mono">{e.id.slice(0, 16)}…</div>
                    <div className="tiny muted-2">{e.manifest?.output ? `${e.manifest.output.width}×${e.manifest.output.height} · ${fmtBytes(e.manifest.output.bytes)}` : e.output_path}</div>
                  </td>
                  <td>
                    <Btn size="sm" variant="subtle" onClick={() => openTimeline(e.timeline_id)}>
                      {e.timeline_id.slice(0, 14)}…
                    </Btn>
                  </td>
                  <td>
                    <StatusBadge status={e.status} />
                    {e.error ? <div className="tiny" style={{ color: 'var(--danger)' }}>{e.error}</div> : null}
                  </td>
                  <td>
                    <Progress value={e.progress} tone={e.status === 'failed' ? 'danger' : e.status === 'succeeded' ? 'ok' : ''} />
                  </td>
                  <td>
                    {e.manifest ? (
                      <Badge tone={e.manifest.verification === 'mock-unverified' ? 'mock' : 'ok'}>{e.manifest.verificationLabel || e.manifest.verification}</Badge>
                    ) : (
                      <span className="tiny muted-2">—</span>
                    )}
                  </td>
                  <td className="tiny muted-2">{fmtDate(e.created_at)}</td>
                  <td>
                    <div className="row" style={{ gap: 5, justifyContent: 'flex-end' }}>
                      <Btn size="sm" variant="ghost" onClick={() => setSelected(e)}>
                        Details
                      </Btn>
                      {e.status === 'running' || e.status === 'queued' ? (
                        <Btn size="sm" variant="ghost" onClick={() => api.exports.cancel(e.id)}>
                          Cancel
                        </Btn>
                      ) : null}
                      {e.status === 'succeeded' ? (
                        <Btn size="sm" onClick={() => api.exports.reveal(e.id)}>
                          Show file
                        </Btn>
                      ) : null}
                      {e.status === 'failed' || e.status === 'cancelled' ? (
                        <Btn
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            try {
                              await api.exports.create({ projectId, timelineId: e.timeline_id, name: 'retry' });
                              toast('Export queued again', 'success');
                              load();
                            } catch (err: any) {
                              toast(err.message, 'error');
                            }
                          }}
                        >
                          Retry
                        </Btn>
                      ) : null}
                      <Btn size="sm" variant="subtle" title="Remove record (file is kept)" aria-label="Remove export record" onClick={() => setDeleting(e)}>
                        ✕
                      </Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={!!deleting}
        title="Remove export record?"
        width={440}
        onClose={() => setDeleting(null)}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setDeleting(null)}>Cancel</Btn>
            <Btn
              variant="danger"
              onClick={async () => {
                try {
                  await api.exports.remove(deleting!.id, { purge: false });
                  toast('Export record removed — file kept on disk', 'success');
                  setDeleting(null);
                  load();
                } catch (err: any) {
                  toast(err.message, 'error');
                }
              }}
            >
              Remove record
            </Btn>
          </>
        }
      >
        <div className="small muted">The row is removed from the export manager. The rendered file and manifest stay on disk.</div>
      </Modal>

      <Modal open={!!selected} title="Export manifest" onClose={() => setSelected(null)} width={820} footer={<Btn variant="ghost" onClick={() => setSelected(null)}>Close</Btn>}>
        {selected ? (
          <div className="stack">
            <div className="row wrap">
              <StatusBadge status={selected.status} />
              {selected.manifest ? (
                <Badge tone={selected.manifest.verification === 'mock-unverified' ? 'mock' : 'ok'}>
                  {selected.manifest.verificationLabel || selected.manifest.verification}
                </Badge>
              ) : null}
              {selected.status === 'running' ? <Spinner /> : null}
            </div>
            {selected.status === 'succeeded' && selected.fileUrl ? (
              <video src={selected.fileUrl} controls className="preview-canvas" style={{ width: '100%' }} />
            ) : null}
            <dl className="kv">
              <dt>Output</dt>
              <dd className="mono">{selected.output_path}</dd>
              <dt>Manifest</dt>
              <dd className="mono">{selected.manifest_path}</dd>
              {selected.manifest ? (
                <>
                  <dt>Duration</dt>
                  <dd>{fmtDuration(selected.manifest.output.durationSec)}</dd>
                  <dt>Resolution</dt>
                  <dd>
                    {selected.manifest.output.width}×{selected.manifest.output.height} @ {selected.manifest.output.frameRate}fps
                  </dd>
                  <dt>SHA-256</dt>
                  <dd className="mono tiny">{selected.manifest.output.sha256}</dd>
                  <dt>Engine</dt>
                  <dd className="tiny">{selected.manifest.engine?.version || 'ffmpeg'}</dd>
                </>
              ) : null}
            </dl>
            {selected.manifest?.sources?.length ? (
              <div>
                <div className="tiny muted-2 mb-8">SOURCE ASSETS</div>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Asset</th>
                      <th>Verification</th>
                      <th>Provider / model</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.manifest.sources.map((s: any) => (
                      <tr key={s.assetId}>
                        <td className="small">{s.name}</td>
                        <td>
                          <Badge tone={s.verification === 'mock-unverified' ? 'mock' : 'ok'}>{s.verification}</Badge>
                        </td>
                        <td className="tiny muted">{s.provider} / {s.model}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
