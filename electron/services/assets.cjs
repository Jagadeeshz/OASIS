'use strict';
// Canonical shared asset library. Every workspace reads and writes assets through
// this service; media bytes live on disk, metadata lives in SQLite.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const media = require('./media.cjs');
const { nowIso } = require('./db.cjs');

const MAX_DOWNLOAD = 1024 * 1024 * 1024; // 1 GiB

function slugify(name, fallback = 'asset') {
  const base = String(name || '')
    .toLowerCase()
    .replace(/\.[a-z0-9]{1,5}$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return base || fallback;
}

class AssetService {
  constructor(db, { root, fetchImpl } = {}) {
    if (!root) throw new Error('AssetService requires a storage root');
    this.db = db;
    this.root = root;
    this.fetchImpl = fetchImpl || globalThis.fetch;
    fs.mkdirSync(path.join(root, 'projects'), { recursive: true });
    fs.mkdirSync(path.join(root, 'tmp'), { recursive: true });
  }

  projectDir(projectId) {
    const dir = path.join(this.root, 'projects', String(projectId));
    fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'thumbs'), { recursive: true });
    return dir;
  }

  tmpFile(ext = 'bin') {
    return path.join(this.root, 'tmp', `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`);
  }

  dto(row) {
    if (!row) return null;
    const tags = this.db.all('SELECT tag FROM asset_tags WHERE asset_id = ?', [row.id]).map((t) => t.tag);
    return {
      ...row,
      archived: !!row.archived,
      tags,
      metadata: safeJson(row.metadata, {}),
      fileUrl: `oasis-asset://asset/${row.id}`,
      thumbUrl: row.thumbnail_path ? `oasis-asset://thumb/${row.id}` : null,
      verificationLabel: row.verification === 'mock-unverified' ? 'Mock — unverified' : row.verification,
      isMock: row.verification === 'mock-unverified',
    };
  }

  get(id) {
    return this.dto(this.db.get('SELECT * FROM assets WHERE id = ? AND deleted_at IS NULL', [id]));
  }

  /** Raw row (internal: file resolution). */
  row(id) {
    return this.db.get('SELECT * FROM assets WHERE id = ? AND deleted_at IS NULL', [id]);
  }

  absolutePath(id) {
    const row = this.row(id);
    if (!row) return null;
    if (!fs.existsSync(row.storage_path)) return null;
    return row.storage_path;
  }

  thumbnailPath(id) {
    const row = this.row(id);
    if (!row || !row.thumbnail_path) return null;
    return fs.existsSync(row.thumbnail_path) ? row.thumbnail_path : null;
  }

  list({ projectId, mediaType, search, tag, sort = 'newest', includeArchived = false, limit = 200, offset = 0, verification } = {}) {
    const where = ['deleted_at IS NULL'];
    const params = [];
    if (projectId) {
      where.push('project_id = ?');
      params.push(projectId);
    }
    if (mediaType && mediaType !== 'all') {
      where.push('media_type = ?');
      params.push(mediaType);
    }
    if (!includeArchived) where.push('archived = 0');
    if (verification) {
      where.push('verification = ?');
      params.push(verification);
    }
    if (search) {
      where.push('(display_name LIKE ? OR prompt LIKE ? OR model LIKE ? OR filename LIKE ?)');
      const q = `%${search}%`;
      params.push(q, q, q, q);
    }
    if (tag) {
      where.push('id IN (SELECT asset_id FROM asset_tags WHERE tag = ?)');
      params.push(tag);
    }
    const orderBy =
      sort === 'oldest' ? 'created_at ASC' : sort === 'name' ? 'display_name COLLATE NOCASE ASC' : sort === 'size' ? 'file_size DESC' : 'created_at DESC';
    const rows = this.db.all(`SELECT * FROM assets WHERE ${where.join(' AND ')} ORDER BY ${orderBy} LIMIT ? OFFSET ?`, [
      ...params,
      limit,
      offset,
    ]);
    return rows.map((r) => this.dto(r));
  }

  count(projectId, includeArchived = false) {
    const row = this.db.get(
      `SELECT COUNT(*) AS n, SUM(CASE WHEN media_type='image' THEN 1 ELSE 0 END) AS images,
              SUM(CASE WHEN media_type='video' THEN 1 ELSE 0 END) AS videos,
              SUM(CASE WHEN media_type='audio' THEN 1 ELSE 0 END) AS audio,
              SUM(file_size) AS bytes
       FROM assets WHERE project_id = ? AND deleted_at IS NULL ${includeArchived ? '' : 'AND archived = 0'}`,
      [projectId],
    );
    return { total: row?.n || 0, images: row?.images || 0, videos: row?.videos || 0, audio: row?.audio || 0, bytes: row?.bytes || 0 };
  }

  tags(projectId) {
    return this.db
      .all(
        `SELECT t.tag, COUNT(*) AS n FROM asset_tags t JOIN assets a ON a.id = t.asset_id
         WHERE a.project_id = ? AND a.deleted_at IS NULL GROUP BY t.tag ORDER BY n DESC, t.tag ASC`,
        [projectId],
      )
      .map((r) => r.tag);
  }

  /** Copy any local file into the managed store and index it. */
  importFile(filePath, meta = {}) {
    if (!fs.existsSync(filePath)) throw new Error(`file not found: ${filePath}`);
    const stat = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase().replace('.', '') || 'bin';
    const buf = fs.readFileSync(filePath);
    return this.createFromBuffer(buf, {
      ...meta,
      ext,
      originalName: meta.displayName || path.basename(filePath),
      fallbackSize: stat.size,
    });
  }

  /** Core ingest path used by imports, provider downloads and mocks. */
  createFromBuffer(buffer, meta = {}) {
    const {
      projectId,
      ext = 'bin',
      mime,
      sourceWorkspace = 'import',
      displayName,
      prompt = null,
      provider = null,
      model = null,
      jobId = null,
      workflowId = null,
      parentAssetId = null,
      verification = 'unverified',
      executionMode = 'import',
      mockReason = null,
      tags = [],
      metadata = {},
      originalName = null,
    } = meta;
    if (!projectId) throw new Error('projectId is required');
    const id = `ast_${crypto.randomUUID()}`;
    const dir = this.projectDir(projectId);
    const safeExt = String(ext).replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'bin';
    const name = displayName || originalName || `${sourceWorkspace}-${id.slice(4, 12)}`;
    const fileName = `${id}-${slugify(name)}.${safeExt}`;
    const storagePath = path.join(dir, 'assets', fileName);
    fs.writeFileSync(storagePath, buffer);

    const probe = media.probe(storagePath);
    const mimeType = mime || probe.mime;
    const mediaType = meta.mediaType || media.mediaTypeFor(storagePath, mimeType);

    let thumbPath = null;
    if (mediaType === 'image' || mediaType === 'video') {
      const t = path.join(dir, 'thumbs', `${id}.jpg`);
      const made = media.makeThumbnail(storagePath, t, mediaType, { atSec: 0.5 });
      if (made) thumbPath = made;
    }

    const parent = parentAssetId ? this.row(parentAssetId) : null;
    const version = parent ? (parent.version || 1) + 1 : 1;
    const versionRoot = parent ? parent.version_root_id || parent.id : id;

    const now = nowIso();
    this.db.tx(() => {
      this.db.run(
        `INSERT INTO assets (id, project_id, filename, display_name, media_type, mime_type, storage_path, file_size,
          width, height, duration, frame_rate, created_at, updated_at, source_workspace, provider, model, prompt, job_id,
          workflow_id, parent_asset_id, version, version_root_id, verification, execution_mode, mock_reason, thumbnail_path, metadata)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          id,
          projectId,
          fileName,
          name,
          mediaType,
          mimeType,
          storagePath,
          buffer.length,
          probe.width,
          probe.height,
          probe.duration,
          probe.frame_rate,
          now,
          now,
          sourceWorkspace,
          provider,
          model,
          prompt,
          jobId,
          workflowId,
          parentAssetId,
          version,
          versionRoot,
          verification,
          executionMode,
          mockReason,
          thumbPath,
          JSON.stringify(metadata || {}),
        ],
      );
      for (const tag of new Set((tags || []).map((t) => String(t).trim().toLowerCase()).filter(Boolean))) {
        this.db.run('INSERT OR IGNORE INTO asset_tags (asset_id, tag) VALUES (?, ?)', [id, tag]);
      }
    });
    return this.get(id);
  }

  /** Download a provider result into the managed store. */
  async downloadToAsset(url, meta = {}) {
    if (!/^https?:\/\//i.test(url)) throw new Error('only http(s) result URLs can be downloaded');
    const ext = (path.extname(new URL(url).pathname).replace('.', '') || 'bin').toLowerCase();
    const res = await this.fetchImpl(url, { signal: AbortSignal.timeout(300000) });
    if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
    const len = Number(res.headers.get('content-length') || 0);
    if (len && len > MAX_DOWNLOAD) throw new Error('remote file exceeds 1 GiB limit');
    const arr = Buffer.from(await res.arrayBuffer());
    if (arr.length > MAX_DOWNLOAD) throw new Error('remote file exceeds 1 GiB limit');
    return this.createFromBuffer(arr, { ...meta, ext });
  }

  update(id, fields = {}) {
    const allowed = ['display_name', 'archived', 'prompt', 'tags', 'metadata', 'verification'];
    const sets = [];
    const params = [];
    for (const [k, v] of Object.entries(fields)) {
      if (!allowed.includes(k)) continue;
      if (k === 'tags' || k === 'metadata') continue;
      sets.push(`${k} = ?`);
      params.push(k === 'archived' ? (v ? 1 : 0) : v);
    }
    if (sets.length) {
      sets.push('updated_at = ?');
      params.push(nowIso(), id);
      this.db.tx(() => this.db.run(`UPDATE assets SET ${sets.join(', ')} WHERE id = ?`, params));
    }
    if (Array.isArray(fields.tags)) {
      this.db.tx(() => {
        this.db.run('DELETE FROM asset_tags WHERE asset_id = ?', [id]);
        for (const tag of new Set(fields.tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean))) {
          this.db.run('INSERT OR IGNORE INTO asset_tags (asset_id, tag) VALUES (?, ?)', [id, tag]);
        }
      });
    }
    if (fields.metadata && typeof fields.metadata === 'object') {
      this.db.tx(() => this.db.run('UPDATE assets SET metadata = ?, updated_at = ? WHERE id = ?', [JSON.stringify(fields.metadata), nowIso(), id]));
    }
    return this.get(id);
  }

  /** Create a derived asset that preserves provenance and lineage. */
  derive(parentId, buffer, meta = {}) {
    const parent = this.row(parentId);
    if (!parent) throw new Error('parent asset not found');
    return this.createFromBuffer(buffer, {
      projectId: parent.project_id,
      ext: path.extname(parent.storage_path).replace('.', '') || 'bin',
      mime: parent.mime_type,
      sourceWorkspace: meta.sourceWorkspace || parent.source_workspace,
      displayName: meta.displayName || `${parent.display_name} v${(parent.version || 1) + 1}`,
      prompt: meta.prompt ?? parent.prompt,
      provider: meta.provider ?? parent.provider,
      model: meta.model ?? parent.model,
      jobId: meta.jobId ?? null,
      parentAssetId: parent.id,
      verification: meta.verification || parent.verification,
      executionMode: meta.executionMode || parent.execution_mode,
      mockReason: meta.mockReason ?? parent.mock_reason,
      tags: meta.tags || [],
      metadata: { ...(safeJson(parent.metadata, {})), ...(meta.metadata || {}) },
    });
  }

  versions(rootId) {
    const root = this.row(rootId);
    const rid = root ? root.version_root_id || root.id : rootId;
    return this.db
      .all('SELECT * FROM assets WHERE (version_root_id = ? OR id = ?) AND deleted_at IS NULL ORDER BY version ASC', [rid, rid])
      .map((r) => this.dto(r));
  }

  archive(id, archived = true) {
    this.db.tx(() => this.db.run('UPDATE assets SET archived = ?, updated_at = ? WHERE id = ?', [archived ? 1 : 0, nowIso(), id]));
    return this.get(id);
  }

  /** Soft delete by default; purge removes files. */
  remove(id, { purge = false } = {}) {
    const row = this.row(id);
    if (!row) return false;
    if (purge) {
      this.db.tx(() => {
        this.db.run('DELETE FROM assets WHERE id = ?', [id]);
      });
      for (const p of [row.storage_path, row.thumbnail_path]) {
        if (p && p.startsWith(this.root)) {
          try {
            fs.unlinkSync(p);
          } catch {
            /* best effort */
          }
        }
      }
    } else {
      this.db.tx(() => this.db.run('UPDATE assets SET deleted_at = ?, updated_at = ? WHERE id = ?', [nowIso(), nowIso(), id]));
    }
    return true;
  }

  collections(projectId) {
    return this.db.all('SELECT * FROM collections WHERE project_id = ? ORDER BY created_at DESC', [projectId]);
  }

  createCollection(projectId, name) {
    const id = `col_${crypto.randomUUID()}`;
    this.db.tx(() => this.db.run('INSERT INTO collections (id, project_id, name, created_at) VALUES (?,?,?,?)', [id, projectId, name, nowIso()]));
    return this.db.get('SELECT * FROM collections WHERE id = ?', [id]);
  }

  addToCollection(collectionId, assetId) {
    this.db.tx(() => this.db.run('INSERT OR IGNORE INTO collection_assets (collection_id, asset_id) VALUES (?,?)', [collectionId, assetId]));
  }

  collectionAssets(collectionId) {
    return this.db
      .all('SELECT a.* FROM assets a JOIN collection_assets c ON c.asset_id = a.id WHERE c.collection_id = ? AND a.deleted_at IS NULL', [collectionId])
      .map((r) => this.dto(r));
  }
}

function safeJson(str, fallback) {
  try {
    return JSON.parse(str || 'null') ?? fallback;
  } catch {
    return fallback;
  }
}

module.exports = { AssetService, slugify, safeJson };
