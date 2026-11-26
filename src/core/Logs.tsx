import React, { useEffect, useState } from 'react';
import { api, fmtDate } from '../lib/api';
import { useApp } from '../lib/store';
import { Badge, Btn, Empty, Tabs } from '../components/ui';

export default function Logs() {
  const { toast } = useApp();
  const [logs, setLogs] = useState<any[]>([]);
  const [level, setLevel] = useState<'all' | 'info' | 'warn' | 'error'>('all');
  const [open, setOpen] = useState<number | null>(null);

  const load = async () => {
    setLogs(await api.logs.list({ limit: 250, level: level === 'all' ? undefined : level }));
  };

  useEffect(() => {
    load().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Logs</h1>
          <p>Operational log written by the main process. API keys are redacted before anything is stored.</p>
        </div>
        <div className="spacer" />
        <Tabs
          value={level}
          onChange={setLevel}
          tabs={[
            { id: 'all', label: 'All' },
            { id: 'info', label: 'Info' },
            { id: 'warn', label: 'Warn' },
            { id: 'error', label: 'Error' },
          ]}
        />
        <Btn variant="ghost" onClick={load}>
          Refresh
        </Btn>
        <Btn
          variant="danger"
          onClick={async () => {
            await api.logs.clear();
            await load();
            toast('Log cleared', 'success');
          }}
        >
          Clear
        </Btn>
      </div>

      <div className="panel">
        {logs.length === 0 ? (
          <Empty title="No log entries" />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 170 }}>Time</th>
                <th style={{ width: 80 }}>Level</th>
                <th style={{ width: 110 }}>Scope</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <React.Fragment key={l.id}>
                  <tr style={{ cursor: l.data ? 'pointer' : 'default' }} onClick={() => setOpen(open === l.id ? null : l.id)}>
                    <td className="tiny muted-2">{fmtDate(l.ts)}</td>
                    <td>
                      <Badge tone={l.level === 'error' ? 'danger' : l.level === 'warn' ? 'warn' : 'info'}>{l.level}</Badge>
                    </td>
                    <td className="small muted">{l.scope}</td>
                    <td className="small">{l.message}</td>
                  </tr>
                  {open === l.id && l.data ? (
                    <tr>
                      <td colSpan={4} style={{ background: 'var(--panel-2)' }}>
                        <pre className="mono" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{JSON.stringify(l.data, null, 2)}</pre>
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
