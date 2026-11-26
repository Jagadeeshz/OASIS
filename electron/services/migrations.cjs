'use strict';
// Schema migrations. Append-only: never edit an applied migration, add a new one.

const INIT = `
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived INTEGER DEFAULT 0,
  settings TEXT DEFAULT '{}'
);

CREATE TABLE assets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  display_name TEXT NOT NULL,
  media_type TEXT NOT NULL,          -- image | video | audio
  mime_type TEXT,
  storage_path TEXT NOT NULL,        -- absolute path on disk
  file_size INTEGER DEFAULT 0,
  width INTEGER,
  height INTEGER,
  duration REAL,
  frame_rate REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  source_workspace TEXT,
  provider TEXT,
  model TEXT,
  prompt TEXT,
  job_id TEXT,
  workflow_id TEXT,
  parent_asset_id TEXT,
  version INTEGER DEFAULT 1,
  version_root_id TEXT,
  verification TEXT NOT NULL DEFAULT 'unverified',   -- verified | mock-unverified | unverified
  execution_mode TEXT NOT NULL DEFAULT 'import',     -- live | local | mock | import
  mock_reason TEXT,
  thumbnail_path TEXT,
  archived INTEGER DEFAULT 0,
  deleted_at TEXT,
  metadata TEXT DEFAULT '{}'
);
CREATE INDEX idx_assets_project ON assets(project_id, created_at DESC);
CREATE INDEX idx_assets_root ON assets(version_root_id);

CREATE TABLE asset_tags (
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY (asset_id, tag)
);

CREATE TABLE collections (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE collection_assets (
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  PRIMARY KEY (collection_id, asset_id)
);

CREATE TABLE workflows (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  graph TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_run_at TEXT
);
CREATE INDEX idx_workflows_project ON workflows(project_id, updated_at DESC);

CREATE TABLE workflow_runs (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  error TEXT,
  node_states TEXT DEFAULT '{}',
  result_asset_ids TEXT DEFAULT '[]'
);
CREATE INDEX idx_runs_workflow ON workflow_runs(workflow_id, started_at DESC);

CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  workspace TEXT NOT NULL,
  task_type TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT,
  endpoint_id TEXT,
  workflow_id TEXT,
  input_asset_ids TEXT DEFAULT '[]',
  params TEXT DEFAULT '{}',
  status TEXT NOT NULL,              -- queued | submitted | running | succeeded | failed | cancelled | mock
  progress REAL DEFAULT 0,
  provider_job_id TEXT,
  poll_url TEXT,
  response_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  error TEXT,
  result_asset_ids TEXT DEFAULT '[]',
  verification TEXT NOT NULL DEFAULT 'unverified',
  execution_mode TEXT NOT NULL DEFAULT 'live',
  mock_reason TEXT,
  attempts INTEGER DEFAULT 0,
  cancel_requested INTEGER DEFAULT 0
);
CREATE INDEX idx_jobs_project ON jobs(project_id, created_at DESC);
CREATE INDEX idx_jobs_status ON jobs(status);

CREATE TABLE timelines (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_timelines_project ON timelines(project_id, updated_at DESC);

CREATE TABLE exports (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  timeline_id TEXT NOT NULL,
  status TEXT NOT NULL,
  progress REAL DEFAULT 0,
  format TEXT DEFAULT 'mp4',
  output_path TEXT,
  manifest_path TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE provider_state (
  provider TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  config TEXT NOT NULL DEFAULT '{}',   -- non-secret config only (endpoint, model, base url)
  status TEXT NOT NULL DEFAULT 'not-configured',
  last_tested_at TEXT,
  last_error TEXT
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  level TEXT NOT NULL,
  scope TEXT NOT NULL,
  message TEXT NOT NULL,
  data TEXT
);
CREATE INDEX idx_logs_ts ON logs(ts DESC);

INSERT INTO provider_state (provider, enabled, config, status) VALUES
  ('fal', 1, '{}', 'not-configured'),
  ('deepseek', 0, '{"baseUrl":"https://api.deepseek.com","model":"deepseek-flash"}', 'disabled'),
  ('ollama', 0, '{"endpoint":"http://127.0.0.1:11434","model":""}', 'disabled');
`;

const MIGRATIONS = [{ id: '0001_init', sql: INIT }];

module.exports = { MIGRATIONS };
