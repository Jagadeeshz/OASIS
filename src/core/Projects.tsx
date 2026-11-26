import React, { useState } from 'react';
import { api, fmtDate } from '../lib/api';
import { useApp } from '../lib/store';
import { Badge, Btn, Confirm, Empty, Field, Modal } from '../components/ui';

export default function Projects() {
  const { projects, projectId, project, selectProject, refreshProjects, createProject, toast, setNav } = useApp();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [renaming, setRenaming] = useState<any>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleting, setDeleting] = useState<any>(null);
  const [details, setDetails] = useState<any>(null);

  const openDetails = async (id: string) => {
    setDetails(await api.projects.get(id));
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Projects</h1>
          <p>Every workspace shares the active project: its assets, jobs, workflows and timelines.</p>
        </div>
        <div className="spacer" />
        <Btn variant="primary" onClick={() => setCreating(true)}>
          New project
        </Btn>
      </div>

      {projects.length === 0 ? (
        <Empty title="No projects" hint="Create one to start generating." action={<Btn onClick={() => setCreating(true)}>New project</Btn>} />
      ) : (
        <div className="panel">
          <table className="table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Assets</th>
                <th>Jobs</th>
                <th>Updated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => openDetails(p.id)}>
                  <td>
                    <div className="row" style={{ gap: 8 }}>
                      <strong>{p.name}</strong>
                      {p.id === projectId ? <Badge tone="info">active</Badge> : null}
                    </div>
                    <div className="tiny muted-2">{p.description || '—'}</div>
                  </td>
                  <td>{p.asset_count ?? 0}</td>
                  <td>{p.job_count ?? 0}</td>
                  <td className="muted small">{fmtDate(p.updated_at)}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                      {p.id !== projectId ? (
                        <Btn
                          size="sm"
                          onClick={() => {
                            selectProject(p.id);
                            toast(`Switched to ${p.name}`, 'success');
                          }}
                        >
                          Open
                        </Btn>
                      ) : null}
                      <Btn
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setRenaming(p);
                          setRenameValue(p.name);
                        }}
                      >
                        Rename
                      </Btn>
                      <Btn size="sm" variant="danger" onClick={() => setDeleting(p)}>
                        Delete
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
        open={creating}
        title="New project"
        onClose={() => setCreating(false)}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Btn>
            <Btn
              variant="primary"
              disabled={!name.trim()}
              onClick={async () => {
                try {
                  const p = await createProject(name.trim());
                  toast(`Created ${p.name}`, 'success');
                  setCreating(false);
                  setName('');
                  setDescription('');
                } catch (err: any) {
                  toast(err.message, 'error');
                }
              }}
            >
              Create
            </Btn>
          </>
        }
      >
        <Field label="Project name">
          <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Client campaign, film, series…" />
        </Field>
        <Field label="Description" hint="Optional. Stored with the project.">
          <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </Modal>

      <Modal
        open={!!renaming}
        title="Rename project"
        onClose={() => setRenaming(null)}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setRenaming(null)}>
              Cancel
            </Btn>
            <Btn
              variant="primary"
              onClick={async () => {
                try {
                  await api.projects.update(renaming.id, { name: renameValue });
                  await refreshProjects();
                  toast('Project renamed', 'success');
                  setRenaming(null);
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
        <Field label="Name">
          <input className="input" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} />
        </Field>
      </Modal>

      <Confirm
        open={!!deleting}
        title={`Delete ${deleting?.name || ''}?`}
        message="This permanently removes the project, its assets, jobs, workflows and timelines. Exported files on disk are kept. This cannot be undone."
        confirmLabel="Delete project"
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          try {
            await api.projects.remove(deleting.id);
            await refreshProjects();
            if (deleting.id === projectId) {
              const remaining = projects.filter((p) => p.id !== deleting.id);
              if (remaining[0]) selectProject(remaining[0].id);
            }
            toast('Project deleted', 'success');
            setDetails(null);
          } catch (err: any) {
            toast(err.message, 'error');
          }
        }}
      />

      <Modal open={!!details} title={details?.name || 'Project'} onClose={() => setDetails(null)} width={520}
        footer={<Btn variant="ghost" onClick={() => setDetails(null)}>Close</Btn>}>
        {details ? (
          <div className="stack">
            <dl className="kv">
              <dt>Project ID</dt>
              <dd className="mono">{details.id}</dd>
              <dt>Created</dt>
              <dd>{fmtDate(details.created_at)}</dd>
              <dt>Updated</dt>
              <dd>{fmtDate(details.updated_at)}</dd>
              <dt>Assets</dt>
              <dd>{details.counts.assets}</dd>
              <dt>Workflows</dt>
              <dd>{details.counts.workflows}</dd>
              <dt>Timelines</dt>
              <dd>{details.counts.timelines}</dd>
              <dt>Jobs</dt>
              <dd>{details.counts.jobs}</dd>
              <dt>Exports</dt>
              <dd>{details.counts.exports}</dd>
            </dl>
            <div className="row">
              <Btn
                onClick={() => {
                  selectProject(details.id);
                  setNav('assets');
                }}
              >
                Open Asset Studio
              </Btn>
              <Btn
                variant="ghost"
                onClick={async () => {
                  await api.projects.archive(details.id, true);
                  await refreshProjects();
                  toast('Project archived', 'success');
                  setDetails(null);
                }}
              >
                Archive
              </Btn>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
