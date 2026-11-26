import React, { useEffect, useState } from 'react';
import { api, fmtDate } from '../lib/api';
import { useApp } from '../lib/store';
import { Badge, Btn, Confirm, Empty, Field, Modal, StatusBadge } from '../components/ui';

export default function WorkflowsPage() {
  const { projectId, workflowsRev, toast, setNav, sendAsset } = useApp();
  const [list, setList] = useState<any[]>([]);
  const [runs, setRuns] = useState<Record<string, any[]>>({});
  const [deleting, setDeleting] = useState<any>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [renameTarget, setRenameTarget] = useState<any>(null);
  const [renameName, setRenameName] = useState('');

  const load = async () => {
    if (!projectId) return;
    setList(await api.workflows.list(projectId));
  };

  useEffect(() => {
    load().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, workflowsRev]);

  const openCanvas = (id?: string) => {
    if (id) sessionStorage.setItem('oasis.workflowId', id);
    else sessionStorage.removeItem('oasis.workflowId');
    setNav('canvas');
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Workflows</h1>
          <p>Saved AI Canvas graphs. Runs execute through the shared job service, so every output lands in Asset Studio with full provenance.</p>
        </div>
        <div className="spacer" />
        <Btn variant="ghost" onClick={load}>Refresh</Btn>
        <Btn variant="primary" onClick={() => openCanvas()}>
          New workflow
        </Btn>
      </div>

      <div className="panel pad mb-12" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <input
          className="input"
          style={{ maxWidth: 320 }}
          placeholder="Search workflows…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search workflows"
        />
        <span className="tiny muted-2">{list.filter((w) => w.name.toLowerCase().includes(q.trim().toLowerCase())).length} of {list.length}</span>
      </div>

      {list.length === 0 ? (
        <Empty
          title="No saved workflows"
          hint="Build one in AI Canvas and press Save. The starter graph is prompt → model → output."
          action={<Btn onClick={() => openCanvas()}>Open AI Canvas</Btn>}
        />
      ) : (
        <div className="stack">
          {list
            .filter((wf) => wf.name.toLowerCase().includes(q.trim().toLowerCase()))
            .map((wf) => (
            <div key={wf.id} className="panel">
              <div className="panel-head">
                <div>
                  <div className="row" style={{ gap: 8 }}>
                    <strong>{wf.name}</strong>
                    <Badge>{wf.nodeCount} nodes</Badge>
                    <Badge>{wf.edgeCount} links</Badge>
                    {wf.last_run_at ? <Badge tone="info">ran {fmtDate(wf.last_run_at)}</Badge> : <Badge>never run</Badge>}
                  </div>
                  <div className="tiny muted-2 mt-8">{wf.description || 'No description'}</div>
                </div>
                <div className="spacer" />
                <div className="row" style={{ gap: 6 }}>
                  <Btn size="sm" variant="ghost" onClick={() => openCanvas(wf.id)}>
                    Open
                  </Btn>
                  <Btn
                    size="sm"
                    variant="primary"
                    disabled={running === wf.id}
                    onClick={async () => {
                      setRunning(wf.id);
                      try {
                        const res = await api.workflows.run({ workflowId: wf.id, projectId });
                        if (res.status === 'succeeded') {
                          toast(`Run finished — ${res.resultAssetIds.length} asset(s) in Asset Studio`, 'success');
                          const r = await api.workflows.runs(wf.id);
                          setRuns((prev) => ({ ...prev, [wf.id]: r }));
                        } else {
                          toast(res.error || `Run ${res.status}`, 'error');
                        }
                      } catch (err: any) {
                        toast(err.message, 'error');
                      } finally {
                        setRunning(null);
                        load().catch(() => {});
                      }
                    }}
                  >
                    {running === wf.id ? 'Running…' : 'Run'}
                  </Btn>
                  <Btn
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      const r = await api.workflows.runs(wf.id);
                      setRuns((prev) => ({ ...prev, [wf.id]: prev[wf.id] ? [] : r }));
                    }}
                  >
                    History
                  </Btn>
                  <Btn
                    size="sm"
                    variant="ghost"
                    onClick={() => { setRenameTarget(wf); setRenameName(wf.name); }}
                  >
                    Rename
                  </Btn>
                  <Btn
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      try {
                        const full = await api.workflows.get(wf.id);
                        await api.workflows.save({ projectId, name: wf.name + ' copy', description: wf.description || '', graph: full.graph });
                        toast('Workflow duplicated', 'success');
                        load().catch(() => {});
                      } catch (err: any) {
                        toast(err.message, 'error');
                      }
                    }}
                  >
                    Duplicate
                  </Btn>
                  <Btn size="sm" variant="danger" onClick={() => setDeleting(wf)}>
                    Delete
                  </Btn>
                </div>
              </div>
              {runs[wf.id]?.length ? (
                <div className="panel-body">
                  <div className="tiny muted-2 mb-8">RECENT RUNS</div>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Run</th>
                        <th>Status</th>
                        <th>Started</th>
                        <th>Assets</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {runs[wf.id].map((r) => (
                        <tr key={r.id}>
                          <td className="mono">{r.id.slice(0, 16)}…</td>
                          <td>
                            <StatusBadge status={r.status} />
                            {r.error ? <div className="tiny" style={{ color: 'var(--danger)' }}>{r.error}</div> : null}
                          </td>
                          <td className="tiny muted-2">{fmtDate(r.started_at)}</td>
                          <td className="small">{r.result_asset_ids?.length || 0}</td>
                          <td>
                            {r.result_asset_ids?.length ? (
                              <Btn size="sm" variant="ghost" onClick={() => sendAsset(r.result_asset_ids[0], 'assets')}>
                                View
                              </Btn>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <Modal
        open={!!renameTarget}
        title="Rename workflow"
        width={440}
        onClose={() => setRenameTarget(null)}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setRenameTarget(null)}>Cancel</Btn>
            <Btn
              variant="primary"
              disabled={!renameName.trim()}
              onClick={async () => {
                try {
                  await api.workflows.save({ id: renameTarget.id, projectId, name: renameName.trim(), graph: renameTarget.graph });
                  toast('Workflow renamed', 'success');
                  setRenameTarget(null);
                  load().catch(() => {});
                } catch (err: any) {
                  toast(err.message, 'error');
                }
              }}
            >
              Save
            </Btn>
          </>
        }
      >
        <Field label="Workflow name">
          <input className="input" autoFocus value={renameName} onChange={(e) => setRenameName(e.target.value)} />
        </Field>
      </Modal>

      <Confirm
        open={!!deleting}
        title={`Delete ${deleting?.name || 'workflow'}?`}
        message="The saved graph is removed. Assets and run history created by it stay in the project."
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          await api.workflows.remove(deleting.id);
          toast('Workflow deleted', 'success');
          load().catch(() => {});
        }}
      />
    </div>
  );
}
