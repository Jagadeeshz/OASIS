import React, { useEffect, useState } from 'react';
import { api, fmtBytes } from '../lib/api';
import { useApp } from '../lib/store';
import { Badge, Btn, Field, Spinner } from '../components/ui';

export default function Settings() {
  const { info, projectId, toast } = useApp();
  const [diag, setDiag] = useState<any>(null);
  const [running, setRunning] = useState(false);
  const [compact, setCompact] = useState(false);

  const run = async () => {
    setRunning(true);
    try {
      setDiag(await api.app.diagnostics());
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    api.settings.get('compactAssets', false).then((v: boolean) => setCompact(!!v)).catch(() => {});
  }, []);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Preferences</h1>
          <p>Runtime information, diagnostics and the paths OASIS manages on this machine.</p>
        </div>
        <div className="spacer" />
        <Btn variant="ghost" onClick={run} disabled={running}>
          {running ? <Spinner /> : null} Run diagnostics
        </Btn>
      </div>

      <div className="grid cols-2">
        <div className="panel">
          <div className="panel-head">
            <h2>Application</h2>
          </div>
          <div className="panel-body">
            <dl className="kv">
              <dt>Version</dt>
              <dd>{info?.version}</dd>
              <dt>Electron</dt>
              <dd>{info?.electron}</dd>
              <dt>Node</dt>
              <dd>{info?.node}</dd>
              <dt>Platform</dt>
              <dd>{info?.platform}</dd>
              <dt>Mode</dt>
              <dd>{info?.dev ? 'development server' : 'packaged / production build'}</dd>
              <dt>ffmpeg</dt>
              <dd className="tiny">{info?.ffmpeg?.version || 'not found on PATH'}</dd>
            </dl>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>Security & data</h2>
          </div>
          <div className="panel-body stack small">
            <div className="row between">
              <span className="muted">Credential storage</span>
              <Badge tone={info?.encryption?.available ? 'ok' : 'warn'}>{info?.encryption?.available ? 'OS-encrypted (safeStorage)' : 'obfuscated only'}</Badge>
            </div>
            <div className="row between">
              <span className="muted">Renderer isolation</span>
              <Badge tone="ok">contextIsolation + sandbox</Badge>
            </div>
            <div className="row between">
              <span className="muted">API keys in renderer</span>
              <Badge tone="ok">never sent</Badge>
            </div>
            <div className="row between">
              <span className="muted">Log redaction</span>
              <Badge tone="ok">keys stripped</Badge>
            </div>
            <p className="tiny muted-2">
              Secrets are written by the main process only. The interface can set or clear a key but can never read it back; saved keys are shown as a
              masked hint.
            </p>
            <Field label="Interface density">
              <label className="row" style={{ cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={compact}
                  onChange={async (e) => {
                    setCompact(e.target.checked);
                    await api.settings.set('compactAssets', e.target.checked);
                    toast('Preference saved', 'success');
                  }}
                />
                <span className="small">Compact asset cards</span>
              </label>
            </Field>
          </div>
        </div>
      </div>

      <div className="panel mt-16">
        <div className="panel-head">
          <h2>Diagnostics</h2>
          <div className="spacer" />
          {diag ? <span className="tiny muted-2">{fmtBytes(diag.database?.size)} database</span> : null}
        </div>
        <div className="panel-body">
          {diag ? (
            <div className="grid cols-2" style={{ gap: 16 }}>
              <div>
                <dl className="kv">
                  <dt>User data</dt>
                  <dd className="mono tiny">{diag.app.userData}</dd>
                  <dt>Database</dt>
                  <dd className="mono tiny">{diag.database.path}</dd>
                  <dt>Media root</dt>
                  <dd className="mono tiny">{diag.storage.root}</dd>
                  <dt>Projects</dt>
                  <dd>{diag.database.projects}</dd>
                  <dt>Assets indexed</dt>
                  <dd>{diag.storage.assets}</dd>
                  <dt>Models in catalog</dt>
                  <dd>{diag.models}</dd>
                  <dt>Secret storage</dt>
                  <dd>{diag.encryption}</dd>
                </dl>
              </div>
              <div>
                <div className="tiny muted-2 mb-8">PROVIDERS</div>
                {diag.providers.map((p: any) => (
                  <div key={p.id} className="row between" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                    <span className="small">{p.id}</span>
                    <div className="row" style={{ gap: 6 }}>
                      <Badge>{p.enabled ? 'enabled' : 'disabled'}</Badge>
                      <Badge tone={p.status === 'connected' ? 'ok' : p.status === 'disabled' ? '' : 'warn'}>{p.status}</Badge>
                      <Badge>{p.hasSecret ? 'key saved' : 'no key'}</Badge>
                    </div>
                  </div>
                ))}
                <div className="row mt-12">
                  <Btn size="sm" variant="ghost" onClick={() => api.shell.openPath(diag.app.userData)}>
                    Open app data
                  </Btn>
                  <Btn size="sm" variant="ghost" onClick={() => api.shell.openPath(diag.storage.root)}>
                    Open media
                  </Btn>
                </div>
              </div>
            </div>
          ) : (
            <div className="muted small">Running…</div>
          )}
        </div>
      </div>

      <div className="panel mt-16">
        <div className="panel-head">
          <h2>Shortcuts</h2>
        </div>
        <div className="panel-body grid cols-2" style={{ gap: 8 }}>
          {[
            ['Ctrl + 1', 'AI Canvas'],
            ['Ctrl + 2', 'PhotoCraft'],
            ['Ctrl + 3', 'FilmCraft'],
            ['Ctrl + 4', 'Asset Studio'],
            ['Ctrl + 5', 'Video Studio'],
            ['Ctrl + 6', 'EffectsCraft'],
          ].map(([k, v]) => (
            <div key={k} className="row between small" style={{ padding: '4px 0' }}>
              <span className="mono">{k}</span>
              <span className="muted">{v}</span>
            </div>
          ))}
        </div>
        <div className="panel-body tiny muted-2">Active project · {projectId.slice(0, 18)}…</div>
      </div>
    </div>
  );
}
