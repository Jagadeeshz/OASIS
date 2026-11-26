import React, { useEffect, useState } from 'react';
import { api, fmtBytes } from '../lib/api';
import { useApp } from '../lib/store';
import { Badge, Btn, Empty } from '../components/ui';

export default function Storage() {
  const { projectId, info, assets } = useApp();
  const [stats, setStats] = useState<any>(null);
  const [diag, setDiag] = useState<any>(null);

  useEffect(() => {
    if (!projectId) return;
    api.assets.stats(projectId).then(setStats).catch(() => {});
    api.app.diagnostics().then(setDiag).catch(() => {});
  }, [projectId, assets.length]);

  const largest = [...assets].sort((a, b) => (b.file_size || 0) - (a.file_size || 0)).slice(0, 8);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Storage</h1>
          <p>Media bytes live in a managed folder; metadata, provenance and relationships live in the SQLite database.</p>
        </div>
        <div className="spacer" />
        <Btn variant="ghost" onClick={() => api.shell.openPath(diag?.storage?.root || '')}>
          Open media folder
        </Btn>
        <Btn variant="ghost" onClick={() => api.shell.openPath(diag?.app?.userData || '')}>
          Open app data
        </Btn>
      </div>

      <div className="grid stats mb-12">
        <div className="stat">
          <div className="label">Assets</div>
          <div className="value">{stats?.total ?? 0}</div>
          <div className="meta">images {stats?.images ?? 0} · video {stats?.videos ?? 0} · audio {stats?.audio ?? 0}</div>
        </div>
        <div className="stat">
          <div className="label">Media bytes</div>
          <div className="value">{fmtBytes(stats?.bytes ?? 0)}</div>
          <div className="meta">project {projectId.slice(0, 12)}…</div>
        </div>
        <div className="stat">
          <div className="label">Database</div>
          <div className="value">{fmtBytes(diag?.database?.size ?? 0)}</div>
          <div className="meta">{diag?.database?.projects ?? 0} projects</div>
        </div>
        <div className="stat">
          <div className="label">ffmpeg</div>
          <div className="value" style={{ fontSize: 15 }}>{diag?.ffmpeg?.available ? 'available' : 'missing'}</div>
          <div className="meta tiny">{diag?.ffmpeg?.version || 'video export disabled'}</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Largest assets in this project</h2>
          <div className="spacer" />
          <Badge>shared library</Badge>
        </div>
        {largest.length === 0 ? (
          <Empty title="Nothing stored yet" />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Type</th>
                <th>Size</th>
                <th>Source</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {largest.map((a) => (
                <tr key={a.id}>
                  <td>
                    <div className="small">{a.display_name}</div>
                    <div className="tiny muted-2 mono">{a.filename}</div>
                  </td>
                  <td>
                    <Badge>{a.media_type}</Badge>
                  </td>
                  <td className="small">{fmtBytes(a.file_size)}</td>
                  <td className="small muted">{a.source_workspace || 'import'}</td>
                  <td>
                    <Btn size="sm" variant="ghost" onClick={() => api.assets.reveal(a.id)}>
                      Show file
                    </Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel mt-16">
        <div className="panel-head">
          <h2>Paths</h2>
        </div>
        <div className="panel-body">
          <dl className="kv">
            <dt>Media root</dt>
            <dd className="mono">{diag?.storage?.root}</dd>
            <dt>Database</dt>
            <dd className="mono">{diag?.database?.path}</dd>
            <dt>App data</dt>
            <dd className="mono">{diag?.app?.userData}</dd>
            <dt>Exports</dt>
            <dd className="mono">{info?.paths?.exports}</dd>
          </dl>
          <p className="tiny muted-2 mt-12">
            Deleting an asset removes its metadata row immediately and its file only when purged from Asset Studio. Exports keep their own copy so
            they survive asset cleanup.
          </p>
        </div>
      </div>
    </div>
  );
}
