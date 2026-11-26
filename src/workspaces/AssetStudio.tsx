import React, { useEffect, useMemo, useState } from 'react';
import { api, Asset, fmtBytes, fmtDate } from '../lib/api';
import { useApp } from '../lib/store';
import { AssetCard, AssetThumb, Badge, Btn, Confirm, Empty, Field, MockBadge, Modal, Spinner } from '../components/ui';

export default function AssetStudio() {
  const { projectId, assetsRev, toast, consumeHandoff, sendAsset, refreshAssets } = useApp();
  const [items, setItems] = useState<Asset[]>([]);
  const [search, setSearch] = useState('');
  const [type, setType] = useState<'all' | 'image' | 'video' | 'audio'>('all');
  const [sort, setSort] = useState('newest');
  const [tag, setTag] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [selected, setSelected] = useState<Asset | null>(null);
  const [versions, setVersions] = useState<Asset[]>([]);
  const [nameDraft, setNameDraft] = useState('');
  const [tagDraft, setTagDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState<Asset | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);

  const load = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const list = await api.assets.list({ projectId, mediaType: type, search: search || undefined, sort, tag: tag || undefined, limit: 400 });
      setItems(list);
      setTags(await api.assets.tags(projectId));
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, type, sort, tag, assetsRev]);

  useEffect(() => {
    const h = consumeHandoff();
    if (h?.assetId) setSelectedId(h.assetId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setSelectedId = async (id: string) => {
    try {
      const a = await api.assets.get(id);
      setSelected(a);
      setNameDraft(a.display_name);
      setTagDraft(a.tags.join(', '));
      setVersions(await api.assets.versions(id));
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  const importFiles = async () => {
    try {
      const created = await api.assets.pickAndImport(projectId, 'asset-studio');
      if (created?.length) {
        toast(`Imported ${created.length} file(s)`, 'success');
        await load();
        await refreshAssets();
      }
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files || []);
    let count = 0;
    for (const f of files) {
      const p = api.pathForFile(f);
      if (!p) continue;
      try {
        await api.assets.importPath(projectId, p, 'asset-studio');
        count++;
      } catch (err: any) {
        toast(`${f.name}: ${err.message}`, 'error');
      }
    }
    if (count) {
      toast(`Imported ${count} file(s)`, 'success');
      await load();
      await refreshAssets();
    }
  };

  const saveMeta = async () => {
    if (!selected) return;
    try {
      const nextTags = tagDraft.split(',').map((t) => t.trim()).filter(Boolean);
      const updated = await api.assets.update(selected.id, { display_name: nameDraft || selected.display_name, tags: nextTags });
      setSelected(updated);
      toast('Asset updated', 'success');
      await load();
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const toggleFavorite = async (asset: Asset) => {
    const next = asset.tags.includes('favorite') ? asset.tags.filter((t) => t !== 'favorite') : [...asset.tags, 'favorite'];
    try {
      const updated = await api.assets.update(asset.id, { tags: next });
      setSelected(updated);
      setTagDraft(updated.tags.join(', '));
      await load();
      toast(next.includes('favorite') ? 'Added to favourites' : 'Removed from favourites', 'success');
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  const bulkArchive = async () => {
    if (!selectedIds.length) return;
    try {
      for (const id of selectedIds) await api.assets.archive(id, true);
      toast('Archived ' + selectedIds.length + ' asset(s)', 'success');
      setSelectedIds([]);
      setSelectMode(false);
      await load();
      await refreshAssets();
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  const bulkFavorite = async () => {
    if (!selectedIds.length) return;
    try {
      for (const id of selectedIds) {
        const a = await api.assets.get(id);
        if (!a.tags.includes('favorite')) await api.assets.update(id, { tags: [...a.tags, 'favorite'] });
      }
      toast('Favourited ' + selectedIds.length + ' asset(s)', 'success');
      setSelectedIds([]);
      await load();
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  const visible = useMemo(
    () => (favoritesOnly ? items.filter((a) => a.tags.includes('favorite')) : items),
    [items, favoritesOnly],
  );
  const comparePair = useMemo(
    () => selectedIds.map((id) => items.find((a) => a.id === id)).filter(Boolean) as Asset[],
    [selectedIds, items],
  );

  const counts = useMemo(() => {
    const c = { image: 0, video: 0, audio: 0 };
    for (const a of items) c[a.media_type as 'image' | 'video' | 'audio'] = (c[a.media_type as 'image' | 'video' | 'audio'] || 0) + 1;
    return c;
  }, [items]);

  return (
    <div className="page" onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={onDrop}>
      <div className="page-head">
        <div>
          <h1>Asset Studio</h1>
          <p>Single source of truth for media. Anything generated anywhere is already here — no re-uploading between workspaces.</p>
        </div>
        <div className="spacer" />
        <Btn variant="primary" onClick={importFiles}>
          Import media
        </Btn>
        <Btn variant="ghost" onClick={load}>
          Refresh
        </Btn>
      </div>

      <div className="panel pad mb-12" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input className="input" style={{ maxWidth: 300 }} placeholder="Search name, prompt, model…" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} />
        <select className="select" style={{ width: 130 }} value={type} onChange={(e) => setType(e.target.value as any)}>
          <option value="all">All media</option>
          <option value="image">Images</option>
          <option value="video">Video</option>
          <option value="audio">Audio</option>
        </select>
        <select className="select" style={{ width: 140 }} value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="name">Name</option>
          <option value="size">Largest</option>
        </select>
        <select className="select" style={{ width: 160 }} value={tag} onChange={(e) => setTag(e.target.value)}>
          <option value="">All tags</option>
          {tags.map((t) => (
            <option key={t} value={t}>
              #{t}
            </option>
          ))}
        </select>
        <Btn size="sm" variant="ghost" onClick={load}>
          Apply
        </Btn>
        <span className="toolbar-divider" />
        <Btn size="sm" variant={selectMode ? 'primary' : 'ghost'} onClick={() => { setSelectMode((m) => !m); setSelectedIds([]); }} title="Select multiple assets">
          Select
        </Btn>
        {selectMode ? (
          <>
            <Btn size="sm" variant="ghost" onClick={() => setSelectedIds(visible.map((a) => a.id))}>All</Btn>
            <Btn size="sm" variant="ghost" onClick={() => setSelectedIds([])}>None</Btn>
            <Btn size="sm" variant="ghost" disabled={!selectedIds.length} onClick={bulkFavorite}>★ Favourite</Btn>
            <Btn size="sm" variant="ghost" disabled={!selectedIds.length} onClick={bulkArchive}>Archive</Btn>
            <Btn size="sm" variant="ghost" disabled={selectedIds.length !== 2} onClick={() => setCompareOpen(true)}>Compare</Btn>
          </>
        ) : null}
        <Btn size="sm" variant={favoritesOnly ? 'primary' : 'ghost'} onClick={() => setFavoritesOnly((f) => !f)} title="Show only favourited assets">
          ★ Favourites
        </Btn>
        <span className="toolbar-divider" />
        <Btn size="sm" variant={view === 'grid' ? 'primary' : 'ghost'} onClick={() => setView('grid')} title="Grid view" aria-label="Grid view">▦</Btn>
        <Btn size="sm" variant={view === 'list' ? 'primary' : 'ghost'} onClick={() => setView('list')} title="List view" aria-label="List view">≡</Btn>
        <div className="spacer" />
        <span className="tiny muted-2">
          {items.length} shown · {counts.image} images · {counts.video} video · {counts.audio} audio
        </span>
      </div>

      {loading ? (
        <div className="center" style={{ padding: 60 }}>
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <Empty
          title="No assets match"
          hint="Drop files here, use Import media, or generate in PhotoCraft / FilmCraft."
          action={<Btn onClick={importFiles}>Import media</Btn>}
        />
      ) : view === 'grid' ? (
        <div className="asset-grid">
          {visible.map((a) => (
            <AssetCard
              key={a.id}
              asset={a}
              selected={selectMode ? selectedIds.includes(a.id) : selected?.id === a.id}
              onClick={() => (selectMode ? toggleSelect(a.id) : setSelectedId(a.id))}
              onDoubleClick={() => setSelectedId(a.id)}
            />
          ))}
        </div>
      ) : (
        <div className="panel">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 54 }} />
                <th>Name</th>
                <th>Type</th>
                <th>Details</th>
                <th>Verification</th>
                <th>Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((a) => (
                <tr
                  key={a.id}
                  className={selectMode && selectedIds.includes(a.id) ? 'row-selected' : ''}
                  onClick={() => (selectMode ? toggleSelect(a.id) : setSelectedId(a.id))}
                  style={{ cursor: 'pointer' }}
                >
                  <td><AssetThumb asset={a} size={34} /></td>
                  <td>
                    <div className="small">{a.display_name}</div>
                    <div className="tiny muted-2">{a.source_workspace || 'import'}</div>
                  </td>
                  <td><Badge media={a.media_type}>{a.media_type}</Badge></td>
                  <td className="tiny muted-2">
                    {a.width ? a.width + '×' + a.height : ''}
                    {a.duration ? ' · ' + a.duration.toFixed(1) + 's' : ''} · {fmtBytes(a.file_size)}
                  </td>
                  <td>{a.isMock ? <Badge tone="mock">Mock — unverified</Badge> : <Badge tone="ok">{a.verification}</Badge>}</td>
                  <td className="tiny muted-2">{fmtDate(a.created_at)}</td>
                  <td>
                    <Btn size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setSelectedId(a.id); }}>Open</Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dragOver ? (
        <div className="modal-backdrop" style={{ pointerEvents: 'none' }}>
          <div className="panel pad" style={{ padding: 40, borderStyle: 'dashed', borderColor: 'var(--accent)' }}>
            <strong>Drop to import into Asset Studio</strong>
          </div>
        </div>
      ) : null}

      {selected ? (
        <div className="drawer">
          <div className="drawer-head">
            <strong className="small" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{selected.display_name}</strong>
            {selected.isMock ? <MockBadge reason={selected.mock_reason} label={false} /> : null}
            <Btn variant="subtle" onClick={() => setSelected(null)}>
              ✕
            </Btn>
          </div>
          <div className="drawer-body">
            <div className="preview-stage mb-12">
              {selected.media_type === 'image' ? (
                <img src={selected.fileUrl} alt={selected.display_name} />
              ) : selected.media_type === 'video' ? (
                <video src={selected.fileUrl} controls poster={selected.thumbUrl || undefined} />
              ) : (
                <audio src={selected.fileUrl} controls style={{ width: '100%' }} />
              )}
              <div className="stage-badge">
                <Badge>{selected.media_type}</Badge>
              </div>
            </div>

            {selected.isMock ? <div className="notice warn mb-12"><MockBadge reason={selected.mock_reason} /></div> : null}

            <Field label="Name">
              <div className="row">
                <input className="input" value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} />
                <Btn size="sm" onClick={saveMeta}>
                  Save
                </Btn>
              </div>
            </Field>
            <Field label="Tags" hint="Comma separated">
              <div className="row">
                <input className="input" value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} placeholder="campaign, approved" />
                <Btn size="sm" variant="ghost" onClick={saveMeta}>
                  Save
                </Btn>
              </div>
            </Field>

            <dl className="kv mb-12">
              <dt>Dimensions</dt>
              <dd>{selected.width ? `${selected.width}×${selected.height}` : '—'}{selected.frame_rate ? ` @ ${selected.frame_rate}fps` : ''}</dd>
              <dt>Duration</dt>
              <dd>{selected.duration ? `${selected.duration.toFixed(2)}s` : '—'}</dd>
              <dt>Size</dt>
              <dd>{fmtBytes(selected.file_size)}</dd>
              <dt>MIME</dt>
              <dd className="mono tiny">{selected.mime_type}</dd>
              <dt>Created</dt>
              <dd className="tiny">{fmtDate(selected.created_at)}</dd>
              <dt>Source</dt>
              <dd>{selected.source_workspace || 'import'}</dd>
              <dt>Provider</dt>
              <dd>{selected.provider || '—'}</dd>
              <dt>Model</dt>
              <dd className="mono tiny">{selected.model || '—'}</dd>
              <dt>Execution</dt>
              <dd>{selected.execution_mode}</dd>
              <dt>Verification</dt>
              <dd>{selected.verification === 'mock-unverified' ? <Badge tone="mock">Mock — unverified</Badge> : <Badge tone="ok">{selected.verification}</Badge>}</dd>
              {selected.mock_reason ? (
                <>
                  <dt>Mock reason</dt>
                  <dd className="tiny">{selected.mock_reason}</dd>
                </>
              ) : null}
              <dt>Version</dt>
              <dd>v{selected.version} of {versions.length}</dd>
              <dt>Job</dt>
              <dd className="mono tiny">{selected.job_id || '—'}</dd>
              <dt>Workflow</dt>
              <dd className="mono tiny">{selected.workflow_id || '—'}</dd>
              <dt>Asset ID</dt>
              <dd className="mono tiny">{selected.id}</dd>
            </dl>

            {selected.prompt ? (
              <div className="mb-12">
                <div className="tiny muted-2 mb-8">PROMPT</div>
                <div className="small" style={{ background: 'var(--panel-2)', padding: 10, borderRadius: 8, border: '1px solid var(--line)' }}>{selected.prompt}</div>
              </div>
            ) : null}

            {versions.length > 1 ? (
              <div className="mb-12">
                <div className="tiny muted-2 mb-8">VERSIONS</div>
                <div className="col">
                  {versions.map((v) => (
                    <div key={v.id} className={`row between ${v.id === selected.id ? '' : 'muted'}`} style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                      <span className="small">
                        v{v.version} · {v.display_name}
                      </span>
                      <div className="row" style={{ gap: 6 }}>
                        <span className="tiny muted-2">{fmtBytes(v.file_size)}</span>
                        <Btn size="sm" variant="subtle" onClick={() => setSelectedId(v.id)}>
                          View
                        </Btn>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="tiny muted-2 mb-8">SEND TO</div>
            <div className="row wrap">
              {selected.media_type === 'image' ? (
                <>
                  <Btn size="sm" onClick={() => sendAsset(selected.id, 'photocraft', 'assets')}>
                    PhotoCraft
                  </Btn>
                  <Btn size="sm" onClick={() => sendAsset(selected.id, 'effectscraft', 'assets')}>
                    EffectsCraft
                  </Btn>
                  <Btn size="sm" onClick={() => sendAsset(selected.id, 'filmcraft', 'assets')}>
                    FilmCraft
                  </Btn>
                  <Btn size="sm" onClick={() => sendAsset(selected.id, 'canvas', 'assets')}>
                    AI Canvas
                  </Btn>
                </>
              ) : null}
              {selected.media_type === 'video' ? (
                <>
                  <Btn size="sm" onClick={() => sendAsset(selected.id, 'video', 'assets')}>
                    Video Studio
                  </Btn>
                  <Btn size="sm" onClick={() => sendAsset(selected.id, 'effectscraft', 'assets')}>
                    EffectsCraft
                  </Btn>
                </>
              ) : null}
              {selected.media_type === 'audio' ? (
                <Btn size="sm" onClick={() => sendAsset(selected.id, 'video', 'assets')}>
                  Video Studio
                </Btn>
              ) : null}
            </div>
          </div>
          <div className="drawer-foot">
            <Btn size="sm" variant="ghost" onClick={() => api.assets.reveal(selected.id)}>
              Show file
            </Btn>
            <Btn size="sm" variant="ghost" onClick={async () => { const p = await api.assets.saveCopy(selected.id); if (p) toast(`Saved to ${p}`, 'success'); }}>
              Save a copy
            </Btn>
            <Btn size="sm" variant={selected.tags.includes('favorite') ? 'primary' : 'ghost'} onClick={() => toggleFavorite(selected)}>
              ★ {selected.tags.includes('favorite') ? 'Favourited' : 'Favourite'}
            </Btn>
            <Btn size="sm" variant="ghost" onClick={async () => { await api.assets.archive(selected.id, true); toast('Archived'); setSelected(null); await load(); }}>
              Archive
            </Btn>
            <Btn size="sm" variant="danger" onClick={() => setDeleting(selected)}>
              Delete
            </Btn>
          </div>
        </div>
      ) : null}

      <Modal open={compareOpen} title="Compare assets" width={980} onClose={() => setCompareOpen(false)} footer={<Btn variant="ghost" onClick={() => setCompareOpen(false)}>Close</Btn>}>
        <div className="compare">
          {comparePair.map((a) => (
            <figure key={a.id}>
              <div className="preview-stage">
                {a.media_type === 'video' ? <video src={a.fileUrl} controls /> : a.media_type === 'audio' ? <audio src={a.fileUrl} controls style={{ width: '100%' }} /> : <img src={a.fileUrl} alt={a.display_name} />}
              </div>
              <figcaption>
                {a.display_name} · {a.width ? a.width + '×' + a.height : ''} · v{a.version}
                {a.isMock ? ' · Mock — unverified' : ''}
              </figcaption>
            </figure>
          ))}
        </div>
      </Modal>

      <Confirm
        open={!!deleting}
        title={`Delete ${deleting?.display_name || ''}?`}
        message="The asset record is removed and its media file is purged from disk. Other versions and exports are not affected."
        confirmLabel="Delete permanently"
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          await api.assets.remove(deleting!.id, { purge: true });
          toast('Asset deleted', 'success');
          setSelected(null);
          setDeleting(null);
          await load();
          await refreshAssets();
        }}
      />
    </div>
  );
}
