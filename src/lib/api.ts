export type Asset = {
  id: string;
  project_id: string;
  display_name: string;
  filename: string;
  media_type: 'image' | 'video' | 'audio' | 'file';
  mime_type: string;
  width: number | null;
  height: number | null;
  duration: number | null;
  frame_rate: number | null;
  file_size: number;
  fileUrl: string;
  thumbUrl: string | null;
  verification: 'verified' | 'mock-unverified' | 'unverified';
  verificationLabel: string;
  isMock: boolean;
  execution_mode: string;
  mock_reason: string | null;
  provider: string | null;
  model: string | null;
  prompt: string | null;
  job_id: string | null;
  workflow_id: string | null;
  parent_asset_id: string | null;
  version: number;
  version_root_id: string;
  source_workspace: string | null;
  tags: string[];
  metadata: Record<string, any>;
  created_at: string;
  archived: boolean;
};

export type Job = {
  id: string;
  project_id: string;
  workspace: string;
  task_type: string;
  provider: string;
  model: string;
  endpoint_id: string | null;
  status: 'queued' | 'submitted' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'mock';
  progress: number;
  error: string | null;
  created_at: string;
  updated_at: string;
  verification: string;
  verificationLabel: string;
  execution_mode: string;
  mock_reason: string | null;
  isMock: boolean;
  result_asset_ids: string[];
  input_asset_ids: string[];
  provider_job_id: string | null;
  params: Record<string, any>;
  modelLabel: string;
  taskLabel: string;
};

export type ParamDef = {
  name: string;
  label: string;
  type: 'text' | 'int' | 'float' | 'bool' | 'enum';
  values?: string[];
  default?: any;
  min?: number;
  max?: number;
  required?: boolean;
  multiline?: boolean;
  help?: string;
};

export type ModelInfo = {
  id: string;
  provider: 'fal' | 'local' | 'mock' | string;
  label: string;
  task: string;
  output: 'image' | 'video' | 'audio';
  blurb: string;
  params: ParamDef[];
  requiresImage?: boolean;
  imageParam?: string;
  endImageParam?: string;
};

export type ProviderInfo = {
  id: 'fal' | 'deepseek' | 'ollama';
  label: string;
  role: string;
  kind: 'cloud' | 'local';
  requiresKey: boolean;
  keyLabel: string;
  docs: string;
  keyUrl: string;
  capabilities: string[];
  enabled: boolean;
  status: string;
  config: Record<string, string>;
  hasSecret: boolean;
  secretHint: string | null;
  secretSource: string | null;
  encryptionAvailable: boolean;
  lastTestedAt: string | null;
  lastError: string | null;
};

export type Project = {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  archived: boolean;
  asset_count?: number;
  job_count?: number;
  counts?: Record<string, number>;
};

export type WorkflowNodeType = {
  label: string;
  category: string;
  inputs: { name: string; type: string; optional?: boolean }[];
  outputs: { name: string; type: string }[];
  config: Record<string, any>;
  description: string;
};

export type TimelineClip = {
  id: string;
  assetId: string | null;
  start: number;
  duration: number;
  inPoint: number;
  volume: number;
  fit: 'cover' | 'contain';
  transition: 'none' | 'fade';
  text?: string;
  fontSize?: number;
  color?: string;
  x?: number;
  y?: number;
  box?: boolean;
};

export type TimelineTrack = { id: string; type: 'video' | 'audio' | 'text'; name: string; clips: TimelineClip[] };
export type TimelineData = { version: number; width: number; height: number; fps: number; tracks: TimelineTrack[] };

export type Timeline = {
  id: string;
  project_id: string;
  name: string;
  data: TimelineData;
  created_at: string;
  updated_at: string;
  duration: number;
  clipCount: number;
};

export type ExportRecord = {
  id: string;
  project_id: string;
  timeline_id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  progress: number;
  output_path: string;
  manifest_path: string;
  error: string | null;
  created_at: string;
  updated_at: string;
  manifest: any;
  fileUrl: string | null;
};

declare global {
  interface Window {
    oasis: any;
  }
}

export const api = window.oasis;

export const fmtBytes = (n: number | null | undefined) => {
  if (!n && n !== 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = Number(n);
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

export const fmtDuration = (s: number | null | undefined) => {
  if (s == null) return '—';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return m > 0 ? `${m}:${String(sec).padStart(2, '0')}` : `${s.toFixed(1)}s`;
};

export const fmtDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString() : '—');

export const statusTone = (status: string) => {
  if (['succeeded', 'connected', 'verified', 'done'].includes(status)) return 'ok';
  if (['mock'].includes(status)) return 'mock';
  if (['failed', 'authentication-failed', 'unreachable', 'error', 'invalid-configuration'].includes(status)) return 'danger';
  if (['running', 'submitted', 'queued', 'testing'].includes(status)) return 'info';
  return '';
};
