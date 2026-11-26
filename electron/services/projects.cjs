'use strict';
// Project context shared by every workspace.
const crypto = require('node:crypto');
const { nowIso } = require('./db.cjs');

class ProjectService {
  constructor({ db }) {
    this.db = db;
  }

  list({ includeArchived = false } = {}) {
    const rows = this.db.all(
      `SELECT p.*, (SELECT COUNT(*) FROM assets a WHERE a.project_id = p.id AND a.deleted_at IS NULL) AS asset_count,
              (SELECT COUNT(*) FROM jobs j WHERE j.project_id = p.id) AS job_count
       FROM projects p ${includeArchived ? '' : 'WHERE p.archived = 0'} ORDER BY p.updated_at DESC`,
    );
    return rows.map((r) => ({ ...r, archived: !!r.archived, settings: safeParse(r.settings, {}) }));
  }

  get(id) {
    const row = this.db.get('SELECT * FROM projects WHERE id = ?', [id]);
    if (!row) return null;
    return {
      ...row,
      archived: !!row.archived,
      settings: safeParse(row.settings, {}),
      counts: {
        assets: this.db.get('SELECT COUNT(*) AS n FROM assets WHERE project_id = ? AND deleted_at IS NULL', [id]).n,
        workflows: this.db.get('SELECT COUNT(*) AS n FROM workflows WHERE project_id = ?', [id]).n,
        timelines: this.db.get('SELECT COUNT(*) AS n FROM timelines WHERE project_id = ?', [id]).n,
        jobs: this.db.get('SELECT COUNT(*) AS n FROM jobs WHERE project_id = ?', [id]).n,
        exports: this.db.get('SELECT COUNT(*) AS n FROM exports WHERE project_id = ?', [id]).n,
      },
    };
  }

  create({ name, description = '', settings = {} } = {}) {
    const clean = String(name || '').trim();
    if (!clean) throw new Error('Project name is required');
    const id = `prj_${crypto.randomUUID()}`;
    const now = nowIso();
    this.db.tx(() =>
      this.db.run('INSERT INTO projects (id, name, description, created_at, updated_at, settings) VALUES (?,?,?,?,?,?)', [
        id,
        clean.slice(0, 120),
        String(description || '').slice(0, 2000),
        now,
        now,
        JSON.stringify(settings),
      ]),
    );
    return this.get(id);
  }

  update(id, { name, description } = {}) {
    const existing = this.get(id);
    if (!existing) throw new Error('Project not found');
    const nextName = name !== undefined ? String(name).trim().slice(0, 120) : existing.name;
    if (!nextName) throw new Error('Project name cannot be empty');
    const nextDesc = description !== undefined ? String(description).slice(0, 2000) : existing.description;
    this.db.tx(() => this.db.run('UPDATE projects SET name = ?, description = ?, updated_at = ? WHERE id = ?', [nextName, nextDesc, nowIso(), id]));
    return this.get(id);
  }

  touch(id) {
    this.db.run('UPDATE projects SET updated_at = ? WHERE id = ?', [nowIso(), id]);
    this.db.schedulePersist();
  }

  archive(id, archived = true) {
    this.db.tx(() => this.db.run('UPDATE projects SET archived = ?, updated_at = ? WHERE id = ?', [archived ? 1 : 0, nowIso(), id]));
    return this.get(id);
  }

  /** Hard delete. Caller must confirm; assets/workflows/timelines cascade. */
  remove(id) {
    const exists = this.db.get('SELECT id FROM projects WHERE id = ?', [id]);
    if (!exists) return false;
    this.db.tx(() => this.db.run('DELETE FROM projects WHERE id = ?', [id]));
    return true;
  }
}

function safeParse(s, fallback) {
  try {
    return JSON.parse(s || 'null') ?? fallback;
  } catch {
    return fallback;
  }
}

module.exports = { ProjectService };
