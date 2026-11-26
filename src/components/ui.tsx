import React, { useEffect, useMemo, useState } from 'react';
import { api, Asset, ParamDef, fmtBytes, fmtDuration } from '../lib/api';

export function Badge({ tone = '', children, title }: { tone?: string; children: React.ReactNode; title?: string }) {
  return (
    <span className={`badge ${tone}`} title={title}>
      {children}
    </span>
  );
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const tone =
    ['succeeded', 'connected', 'verified', 'done', 'live'].includes(status)
      ? 'ok'
      : ['failed', 'error', 'authentication-failed', 'unreachable', 'invalid-configuration'].includes(status)
        ? 'danger'
        : ['mock', 'mock-unverified'].includes(status)
          ? 'mock'
          : ['running', 'submitted', 'queued', 'testing'].includes(status)
            ? 'info'
            : '';
  const text = label || (status === 'mock' ? 'mock' : status === 'mock-unverified' ? 'Mock — unverified' : status);
  return <span className={`badge ${tone}`}>{text}</span>;
}

export function MockBadge({ reason, label = true }: { reason?: string | null; label?: boolean }) {
  return (
    <span className="mock-chip" title={reason || 'This result was produced by deterministic mock mode, not by a live provider.'}>
      ⚠ Mock — unverified
      {label && reason ? <span style={{ fontWeight: 400, opacity: 0.85, marginLeft: 4, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>· {reason}</span> : null}
    </span>
  );
}

export function Btn({
  children,
  variant = '',
  size = '',
  className = '',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) {
  return (
    <button className={`btn ${variant} ${size} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function Field({ label, hint, children }: { label?: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="field">
      {label ? <label>{label}</label> : null}
      {children}
      {hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
}

export function Progress({ value, tone = '' }: { value: number; tone?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round((value || 0) * 100)));
  return (
    <div className={`progress ${tone}`}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Empty({ title, hint, action, icon = '◍' }: { title: string; hint?: string; action?: React.ReactNode; icon?: string }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <strong>{title}</strong>
      {hint ? <span className="small">{hint}</span> : null}
      {action}
    </div>
  );
}

export function Spinner() {
  return <span className="spinner" />;
}

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  width,
}: {
  open: boolean;
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
}) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={width ? { maxWidth: width } : undefined}>
        <div className="modal-head">
          <h2 style={{ fontSize: 14 }}>{title}</h2>
          <div style={{ flex: 1 }} />
          <Btn variant="subtle" onClick={onClose} aria-label="Close">
            ✕
          </Btn>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Tabs({ tabs, value, onChange }: { tabs: { id: string; label: string }[]; value: string; onChange: (v: any) => void }) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button key={t.id} className={value === t.id ? 'active' : ''} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function ParamControl({ def, value, onChange }: { def: ParamDef; value: any; onChange: (v: any) => void }) {
  const v = value === undefined || value === null || value === '' ? def.default : value;
  if (def.type === 'enum') {
    return (
      <Field label={def.label} hint={def.help}>
        <select className="select" value={String(v ?? '')} onChange={(e) => onChange(e.target.value)}>
          {(def.values || []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </Field>
    );
  }
  if (def.type === 'bool') {
    return (
      <label className="row" style={{ marginBottom: 12, cursor: 'pointer' }}>
        <input type="checkbox" checked={!!v} onChange={(e) => onChange(e.target.checked)} />
        <span className="small">{def.label}</span>
      </label>
    );
  }
  if (def.type === 'int' || def.type === 'float') {
    return (
      <Field label={def.label} hint={def.help || (def.min !== undefined ? `range ${def.min}–${def.max ?? '∞'}` : undefined)}>
        <input
          className="input"
          type="number"
          value={v ?? ''}
          min={def.min}
          max={def.max}
          step={def.type === 'float' ? 0.05 : 1}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        />
      </Field>
    );
  }
  if (def.multiline) {
    return (
      <Field label={def.label} hint={def.help}>
        <textarea className="textarea" value={v ?? ''} onChange={(e) => onChange(e.target.value)} rows={4} />
      </Field>
    );
  }
  return (
    <Field label={def.label} hint={def.help}>
      <input className="input" value={v ?? ''} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

export function AssetThumb({ asset, size = 42, videoBadge = true }: { asset: Asset; size?: number; videoBadge?: boolean }) {
  const style = { width: size, height: size };
  if (asset.media_type === 'image') {
    return (
      <div className="thumb-square" style={style}>
        {asset.thumbUrl || asset.fileUrl ? <img src={asset.thumbUrl || asset.fileUrl} alt={asset.display_name} loading="lazy" /> : null}
      </div>
    );
  }
  const icon = asset.media_type === 'video' ? '▶' : asset.media_type === 'audio' ? '♪' : '▤';
  return (
    <div className="thumb-square" style={style} title={asset.display_name}>
      {videoBadge && asset.thumbUrl ? <img src={asset.thumbUrl} alt="" /> : <span style={{ fontSize: size * 0.4, color: '#7b8598' }}>{icon}</span>}
    </div>
  );
}

export function AssetCard({
  asset,
  selected,
  onClick,
  onDoubleClick,
  footer,
}: {
  asset: Asset;
  selected?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  footer?: React.ReactNode;
}) {
  return (
    <div className={`asset-card ${selected ? 'selected' : ''}`} onClick={onClick} onDoubleClick={onDoubleClick} title={asset.prompt || asset.display_name}>
      <div className="thumb">
        {asset.media_type === 'image' ? (
          <img src={asset.thumbUrl || asset.fileUrl} alt={asset.display_name} loading="lazy" />
        ) : asset.media_type === 'video' ? (
          asset.thumbUrl ? (
            <img src={asset.thumbUrl} alt={asset.display_name} loading="lazy" />
          ) : (
            <div className="placeholder">
              <span style={{ fontSize: 20 }}>▶</span> video
            </div>
          )
        ) : (
          <div className="placeholder">
            <span style={{ fontSize: 20 }}>♪</span> audio
          </div>
        )}
        {asset.isMock ? (
          <span className="stamp">
            <MockBadge reason={asset.mock_reason} label={false} />
          </span>
        ) : null}
        <span className="type">
          <Badge>{asset.media_type}</Badge>
        </span>
      </div>
      <div className="meta">
        <div className="name">{asset.display_name}</div>
        <div className="sub">
          <span>{asset.width && asset.height ? `${asset.width}×${asset.height}` : fmtDuration(asset.duration)}</span>
          <span>·</span>
          <span>{fmtBytes(asset.file_size)}</span>
          {asset.version > 1 ? <Badge>v{asset.version}</Badge> : null}
        </div>
        {footer}
      </div>
    </div>
  );
}

export function AssetPicker({
  open,
  onClose,
  onPick,
  mediaType = 'image',
  title,
  currentId,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (asset: Asset) => void;
  mediaType?: 'image' | 'video' | 'audio' | 'all';
  title?: string;
  currentId?: string;
}) {
  const [items, setItems] = useState<Asset[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [projectId, setProjectId] = useState('');

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      try {
        const pid = await api.settings.get('lastProjectId', null);
        setProjectId(pid);
        const list = await api.assets.list({ projectId: pid, mediaType, limit: 200, search: search || undefined });
        setItems(list);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, mediaType, search]);

  return (
    <Modal open={open} title={title || `Choose ${mediaType === 'all' ? 'media' : mediaType}`} onClose={onClose} width={900}>
      <div className="row mb-12">
        <input className="input" placeholder="Search assets…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Btn variant="ghost" onClick={() => setSearch('')}>
          Clear
        </Btn>
      </div>
      {loading ? (
        <div className="center" style={{ padding: 40 }}>
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <Empty title="No matching assets" hint="Generate something in PhotoCraft or import a file in Asset Studio." />
      ) : (
        <div className="asset-grid">
          {items.map((a) => (
            <AssetCard
              key={a.id}
              asset={a}
              selected={a.id === currentId}
              onClick={() => {
                onPick(a);
                onClose();
              }}
            />
          ))}
        </div>
      )}
      {projectId ? <div className="tiny muted-2 mt-12">Shared library · project {projectId.slice(0, 12)}…</div> : null}
    </Modal>
  );
}

export function Confirm({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      width={460}
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>
            Cancel
          </Btn>
          <Btn
            variant="danger"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Btn>
        </>
      }
    >
      <div className="small muted">{message}</div>
    </Modal>
  );
}

export function useAsync<T>(fn: () => Promise<T>, deps: any[], initial: T) {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fn()
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, loading, error, setData };
}

export function ModelSelect({ models, value, onChange, label = 'Model' }: { models: any[]; value: string; onChange: (v: string) => void; label?: string }) {
  const groups = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const m of models) {
      const key = m.provider === 'fal' ? 'fal.ai (live)' : m.provider === 'mock' ? 'Mock (offline)' : 'Local (ffmpeg)';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return [...map.entries()];
  }, [models]);
  return (
    <Field label={label}>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        {groups.map(([group, list]) => (
          <optgroup key={group} label={group}>
            {list.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </Field>
  );
}
