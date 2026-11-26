'use strict';
// SQLite (sql.js / wasm) access layer with migrations and durable file persistence.
// sql.js is used deliberately: it is pure wasm, so the packaged desktop app needs no
// native module rebuild (no MSVC toolchain on the target machine).
const fs = require('node:fs');
const path = require('node:path');
const initSqlJs = require('sql.js');
const { MIGRATIONS } = require('./migrations.cjs');

function nowIso() {
  return new Date().toISOString();
}

class Database {
  constructor(sqlDb, file) {
    this.db = sqlDb;
    this.file = file;
    this.dirty = false;
    this.closed = false;
    this._timer = null;
  }

  run(sql, params = []) {
    this.db.run(sql, params);
    this.dirty = true;
    return this;
  }

  all(sql, params = []) {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params);
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      return rows;
    } finally {
      stmt.free();
    }
  }

  get(sql, params = []) {
    const rows = this.all(sql, params);
    return rows.length ? rows[0] : null;
  }

  exec(sql) {
    this.db.exec(sql);
    this.dirty = true;
    return this;
  }

  /** Run fn inside a transaction; rolls back on throw. */
  tx(fn) {
    this.run('BEGIN');
    try {
      const out = fn();
      this.run('COMMIT');
      this.persistNow();
      return out;
    } catch (err) {
      try {
        this.run('ROLLBACK');
      } catch {
        /* ignore rollback failure */
      }
      throw err;
    }
  }

  persistNow() {
    if (this.closed || !this.file) return;
    const bytes = Buffer.from(this.db.export());
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, bytes);
    fs.renameSync(tmp, this.file);
    this.dirty = false;
    this.lastPersistAt = nowIso();
    this.lastPersistBytes = bytes.length;
    return bytes.length;
  }

  schedulePersist(delayMs = 800) {
    if (this._timer) return;
    this._timer = setTimeout(() => {
      this._timer = null;
      if (this.dirty) {
        try {
          this.persistNow();
        } catch (err) {
          console.error('[db] persist failed', err.message);
        }
      }
    }, delayMs);
    if (this._timer.unref) this._timer.unref();
  }

  close() {
    if (this.closed) return;
    if (this._timer) clearTimeout(this._timer);
    try {
      if (this.dirty) this.persistNow();
    } catch (err) {
      console.error('[db] final persist failed', err.message);
    }
    this.closed = true;
    try {
      this.db.close();
    } catch {
      /* already closed by export */
    }
  }
}

function migrate(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  );`);
  const applied = new Set(db.all('SELECT id FROM schema_migrations').map((r) => r.id));
  const ran = [];
  for (const m of MIGRATIONS) {
    if (applied.has(m.id)) continue;
    db.exec('BEGIN');
    try {
      db.exec(m.sql);
      db.run('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)', [m.id, nowIso()]);
      db.exec('COMMIT');
      ran.push(m.id);
    } catch (err) {
      db.exec('ROLLBACK');
      throw new Error(`migration ${m.id} failed: ${err.message}`);
    }
  }
  return ran;
}

/**
 * Open (or create) an OASIS database file.
 * @param {{file: string, wasmPath?: string}} opts
 */
async function openDatabase({ file, wasmPath } = {}) {
  const wasm = wasmPath || require.resolve('sql.js/dist/sql-wasm.wasm');
  const wasmBinary = fs.readFileSync(wasm);
  const SQL = await initSqlJs({ wasmBinary });
  let db;
  if (file && fs.existsSync(file)) {
    db = new SQL.Database(new Uint8Array(fs.readFileSync(file)));
  } else {
    db = new SQL.Database();
  }
  const database = new Database(db, file);
  const ran = migrate(database);
  database.run('PRAGMA foreign_keys = ON');
  if (file) database.persistNow();
  database.migrationsRun = ran;
  return database;
}

module.exports = { openDatabase, Database, nowIso };
