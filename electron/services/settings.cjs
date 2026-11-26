'use strict';
// Provider configuration, app settings and diagnostics logging.
const { nowIso } = require('./db.cjs');
const { redact } = require('./vault.cjs');

const PROVIDER_META = {
  fal: {
    id: 'fal',
    label: 'fal.ai',
    role: 'Primary',
    kind: 'cloud',
    requiresKey: true,
    keyLabel: 'fal.ai API key',
    docs: 'https://docs.fal.ai/',
    keyUrl: 'https://fal.ai/dashboard/keys',
    capabilities: ['image generation', 'image editing', 'background removal', 'video generation', 'text-to-speech'],
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    role: 'Optional',
    kind: 'cloud',
    requiresKey: true,
    keyLabel: 'DeepSeek API key',
    docs: 'https://api-docs.deepseek.com/',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    capabilities: ['prompt enhancement', 'ideation', 'storyboarding', 'workflow planning'],
  },
  ollama: {
    id: 'ollama',
    label: 'Ollama',
    role: 'Optional',
    kind: 'local',
    requiresKey: false,
    keyLabel: 'Endpoint',
    docs: 'https://docs.ollama.com/api',
    keyUrl: 'https://ollama.com/download',
    capabilities: ['local text inference', 'prompt assistance', 'offline reasoning'],
  },
};

class SettingsService {
  constructor({ db, vault, adapters, onEvent = () => {}, fetchImpl = globalThis.fetch }) {
    this.db = db;
    this.vault = vault;
    this.adapters = adapters;
    this.onEvent = onEvent;
    this.fetchImpl = fetchImpl;
  }

  raw(provider) {
    return this.db.get('SELECT * FROM provider_state WHERE provider = ?', [provider]);
  }

  config(provider) {
    const row = this.raw(provider);
    try {
      return JSON.parse(row?.config || '{}');
    } catch {
      return {};
    }
  }

  listProviders() {
    return Object.values(PROVIDER_META).map((meta) => {
      const row = this.raw(meta.id);
      const enabled = !!row?.enabled;
      const hasSecret = this.vault.has(meta.id);
      let status = row?.status || 'not-configured';
      if (!enabled) status = 'disabled';
      else if (meta.requiresKey && !hasSecret) status = 'not-configured';
      else if (status === 'disabled') status = 'configured';
      return {
        ...meta,
        enabled,
        status,
        config: this.publicConfig(meta.id),
        hasSecret,
        secretHint: this.vault.hint(meta.id),
        secretSource: this.vault.source(meta.id),
        encryptionAvailable: this.vault.encryptionAvailable(),
        lastTestedAt: row?.last_tested_at || null,
        lastError: row?.last_error || null,
      };
    });
  }

  /** Config safe to send to the renderer (no secrets, endpoint/base url/model only). */
  publicConfig(provider) {
    const cfg = this.config(provider);
    if (provider === 'ollama') return { endpoint: cfg.endpoint || 'http://127.0.0.1:11434', model: cfg.model || '' };
    if (provider === 'deepseek') return { baseUrl: cfg.baseUrl || 'https://api.deepseek.com', model: cfg.model || 'deepseek-flash' };
    return {};
  }

  setEnabled(provider, enabled) {
    const row = this.raw(provider);
    if (!row) throw new Error(`unknown provider: ${provider}`);
    const hasSecret = this.vault.has(provider);
    let status = 'configured';
    if (!enabled) status = 'disabled';
    else if (PROVIDER_META[provider].requiresKey && !hasSecret) status = 'not-configured';
    this.db.tx(() =>
      this.db.run('UPDATE provider_state SET enabled = ?, status = ? WHERE provider = ?', [enabled ? 1 : 0, status, provider]),
    );
    this.log('info', 'provider', `${provider} ${enabled ? 'enabled' : 'disabled'}`, { status });
    this.onEvent({ type: 'providers:changed' });
    return this.listProviders().find((p) => p.id === provider);
  }

  saveConfig(provider, patch = {}) {
    const row = this.raw(provider);
    if (!row) throw new Error(`unknown provider: ${provider}`);
    const allowed = provider === 'ollama' ? ['endpoint', 'model'] : provider === 'deepseek' ? ['baseUrl', 'model'] : [];
    const current = this.config(provider);
    const next = { ...current };
    for (const key of allowed) {
      if (patch[key] !== undefined) next[key] = String(patch[key]).trim();
    }
    this.db.tx(() => this.db.run('UPDATE provider_state SET config = ? WHERE provider = ?', [JSON.stringify(next), provider]));
    if (patch.secret !== undefined) {
      this.vault.set(provider, patch.secret ? String(patch.secret).trim() : null);
    }
    // Recompute status after credential changes.
    const enabled = !!this.raw(provider).enabled;
    const hasSecret = this.vault.has(provider);
    const status = !enabled ? 'disabled' : PROVIDER_META[provider].requiresKey && !hasSecret ? 'not-configured' : 'configured';
    this.db.tx(() => this.db.run('UPDATE provider_state SET status = ? WHERE provider = ?', [status, provider]));
    this.log('info', 'provider', `settings saved for ${provider}`, { status, secretChanged: patch.secret !== undefined });
    this.onEvent({ type: 'providers:changed' });
    return this.listProviders().find((p) => p.id === provider);
  }

  async testProvider(provider) {
    const meta = PROVIDER_META[provider];
    const adapter = this.adapters[provider];
    if (!meta || !adapter) throw new Error(`unknown provider: ${provider}`);
    this.db.tx(() => this.db.run('UPDATE provider_state SET status = ? WHERE provider = ?', ['testing', provider]));
    this.onEvent({ type: 'providers:changed' });
    let result;
    try {
      const cfg = this.publicConfig(provider);
      result = await adapter.testConnection({
        secret: this.vault.get(provider),
        endpoint: cfg.endpoint,
        baseUrl: cfg.baseUrl,
        fetchImpl: this.fetchImpl,
      });
    } catch (err) {
      result = { ok: false, status: 'error', message: redact(err.message, [this.vault.get(provider)]) };
    }
    const enabled = !!this.raw(provider).enabled;
    const status = enabled ? result.status : 'disabled';
    this.db.tx(() =>
      this.db.run('UPDATE provider_state SET status = ?, last_tested_at = ?, last_error = ? WHERE provider = ?', [
        status,
        nowIso(),
        result.ok ? null : redact(result.message || '', [this.vault.get(provider)]),
        provider,
      ]),
    );
    this.log(result.ok ? 'info' : 'warn', 'provider', `connection test ${provider}: ${result.status}`, { message: result.message });
    this.onEvent({ type: 'providers:changed' });
    return { ...result, status, testedAt: nowIso() };
  }

  /** Whether live execution is possible for a provider right now. */
  usable(provider) {
    const row = this.raw(provider);
    if (!row || !row.enabled) return { usable: false, reason: `${PROVIDER_META[provider]?.label || provider} is disabled` };
    if (PROVIDER_META[provider].requiresKey && !this.vault.has(provider)) {
      return { usable: false, reason: `${PROVIDER_META[provider].label} API key is not configured` };
    }
    return { usable: true };
  }

  getSetting(key, fallback = null) {
    const row = this.db.get('SELECT value FROM settings WHERE key = ?', [key]);
    if (!row) return fallback;
    try {
      return JSON.parse(row.value);
    } catch {
      return row.value;
    }
  }

  setSetting(key, value) {
    this.db.tx(() =>
      this.db.run('INSERT INTO settings (key, value, updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at', [
        key,
        JSON.stringify(value),
        nowIso(),
      ]),
    );
    return value;
  }

  log(level, scope, message, data = null) {
    try {
      this.db.run('INSERT INTO logs (ts, level, scope, message, data) VALUES (?,?,?,?,?)', [
        nowIso(),
        level,
        scope,
        redact(String(message).slice(0, 2000)),
        data ? redact(JSON.stringify(data).slice(0, 4000)) : null,
      ]);
      this.db.schedulePersist();
    } catch {
      /* logging must never break a job */
    }
  }

  logs({ limit = 200, level } = {}) {
    const rows = level
      ? this.db.all('SELECT * FROM logs WHERE level = ? ORDER BY id DESC LIMIT ?', [level, limit])
      : this.db.all('SELECT * FROM logs ORDER BY id DESC LIMIT ?', [limit]);
    return rows.map((r) => ({ ...r, data: r.data ? safeParse(r.data) : null }));
  }

  clearLogs() {
    this.db.tx(() => this.db.run('DELETE FROM logs'));
    return true;
  }
}

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

module.exports = { SettingsService, PROVIDER_META };
