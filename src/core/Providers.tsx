import React, { useEffect, useState } from 'react';
import { api, fmtDate, ProviderInfo } from '../lib/api';
import { useApp } from '../lib/store';
import { Badge, Btn, Field, Spinner, StatusBadge } from '../components/ui';

const DEEPSEEK_MODELS = ['deepseek-flash', 'deepseek-v4-pro'];

export default function Providers() {
  const { providers, refreshProviders, toast, info } = useApp();

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Providers & Models</h1>
          <p>
            fal.ai is the primary generation provider. DeepSeek and Ollama are optional helpers for prompt work and stay disabled until you
            enable them — the app runs fully without either.
          </p>
        </div>
        <div className="spacer" />
        <Badge tone={info?.encryption?.available ? 'ok' : 'warn'} title="Electron safeStorage / OS keychain">
          {info?.encryption?.available ? 'OS-encrypted secrets' : 'OS encryption unavailable'}
        </Badge>
      </div>

      <div className="grid cols-3">
        {providers.map((p) => (
          <ProviderCard key={p.id} provider={p} onChange={refreshProviders} toast={toast} />
        ))}
      </div>

      <div className="panel mt-16">
        <div className="panel-head">
          <h2>How execution modes are decided</h2>
        </div>
        <div className="panel-body stack small">
          <p className="muted">
            Every job records its execution mode before it starts. <strong>live</strong> means a real provider call; <strong>local</strong>{' '}
            means an ffmpeg operation on this machine; <strong>mock</strong> means deterministic placeholder media, always labelled{' '}
            <span className="mock-chip">⚠ Mock — unverified</span> and never reported as a real result.
          </p>
          <p className="muted">
            If fal.ai is enabled but has no key, generation falls back to mock mode with the reason attached to the job and the asset. Failures
            from a configured provider (bad key, timeouts, provider errors) stay failures — they are never silently converted into mock output.
          </p>
        </div>
      </div>
    </div>
  );
}

function ProviderCard({ provider, onChange, toast }: { provider: ProviderInfo; onChange: () => Promise<void>; toast: (m: string, k?: any) => void }) {
  const [secret, setSecret] = useState('');
  const [baseUrl, setBaseUrl] = useState(provider.config.baseUrl || 'https://api.deepseek.com');
  const [model, setModel] = useState(provider.config.model || '');
  const [endpoint, setEndpoint] = useState(provider.config.endpoint || 'http://127.0.0.1:11434');
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<{ name: string }[]>([]);
  const [testResult, setTestResult] = useState<any>(null);

  useEffect(() => {
    setBaseUrl(provider.config.baseUrl || 'https://api.deepseek.com');
    setModel(provider.config.model || '');
    setEndpoint(provider.config.endpoint || 'http://127.0.0.1:11434');
  }, [provider]);

  const save = async () => {
    setSaving(true);
    try {
      const patch: any = {};
      if (provider.id === 'deepseek') {
        patch.baseUrl = baseUrl;
        patch.model = model || 'deepseek-flash';
      }
      if (provider.id === 'ollama') {
        patch.endpoint = endpoint;
        patch.model = model;
      }
      if (provider.requiresKey && secret) patch.secret = secret;
      await api.providers.save(provider.id, patch);
      setSecret('');
      await onChange();
      toast(`${provider.label} settings saved`, 'success');
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.providers.test(provider.id);
      setTestResult(res);
      toast(`${provider.label}: ${res.message || res.status}`, res.ok ? 'success' : 'warn');
      await onChange();
      if (provider.id === 'ollama' && res.ok) {
        try {
          setOllamaModels(await api.providers.ollamaModels());
        } catch {
          /* ignore */
        }
      }
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setTesting(false);
    }
  };

  const clearKey = async () => {
    try {
      await api.providers.save(provider.id, { secret: '' });
      await onChange();
      toast(`${provider.label} key cleared`, 'success');
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <div className="row" style={{ gap: 8 }}>
            <strong>{provider.label}</strong>
            <Badge tone={provider.role === 'Primary' ? 'info' : ''}>{provider.role}</Badge>
          </div>
          <div className="tiny muted-2 mt-8">{provider.capabilities.join(' · ')}</div>
        </div>
        <div className="spacer" />
        <label className="row" style={{ gap: 6, cursor: 'pointer' }} title={provider.enabled ? 'Disable provider' : 'Enable provider'}>
          <input
            type="checkbox"
            checked={provider.enabled}
            onChange={async (e) => {
              try {
                await api.providers.setEnabled(provider.id, e.target.checked);
                await onChange();
              } catch (err: any) {
                toast(err.message, 'error');
              }
            }}
          />
          <span className="tiny">{provider.enabled ? 'enabled' : 'disabled'}</span>
        </label>
      </div>

      <div className="panel-body">
        <div className="row between mb-12">
          <StatusBadge status={provider.status} />
          <span className="tiny muted-2">{provider.lastTestedAt ? `tested ${fmtDate(provider.lastTestedAt)}` : 'never tested'}</span>
        </div>

        {provider.requiresKey ? (
          <>
            <Field
              label={provider.keyLabel}
              hint={
                provider.hasSecret
                  ? `Saved key ${provider.secretHint} (${provider.secretSource}). Enter a new key to replace it.`
                  : 'Write-only: the key is stored in the main process and never returned to the interface.'
              }
            >
              <input
                className="input"
                type="password"
                autoComplete="off"
                placeholder={provider.hasSecret ? '•••••••••••• (saved)' : 'Paste key here'}
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
              />
            </Field>
            {provider.id === 'deepseek' ? (
              <>
                <Field label="Base URL">
                  <input className="input" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
                </Field>
                <Field label="Model">
                  <select className="select" value={model || 'deepseek-flash'} onChange={(e) => setModel(e.target.value)}>
                    {DEEPSEEK_MODELS.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </Field>
              </>
            ) : null}
          </>
        ) : (
          <>
            <Field label="Local endpoint">
              <input className="input" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} />
            </Field>
            <Field label="Model" hint={ollamaModels.length ? `${ollamaModels.length} installed model(s) discovered` : 'Test the connection to list installed models'}>
              {ollamaModels.length ? (
                <select className="select" value={model} onChange={(e) => setModel(e.target.value)}>
                  <option value="">Select a model…</option>
                  {ollamaModels.map((m) => (
                    <option key={m.name} value={m.name}>
                      {m.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input className="input" placeholder="llama3.2" value={model} onChange={(e) => setModel(e.target.value)} />
              )}
            </Field>
          </>
        )}

        {provider.lastError ? <div className="notice danger mb-12">{provider.lastError}</div> : null}
        {testResult ? <div className={`notice ${testResult.ok ? 'ok' : 'warn'} mb-12`}>{testResult.message}</div> : null}

        <div className="row wrap">
          <Btn variant="primary" size="sm" onClick={save} disabled={saving}>
            {saving ? <Spinner /> : null} Save
          </Btn>
          <Btn size="sm" variant="ghost" onClick={test} disabled={testing}>
            {testing ? <Spinner /> : null} Test connection
          </Btn>
          {provider.requiresKey && provider.hasSecret ? (
            <Btn size="sm" variant="danger" onClick={clearKey}>
              Clear key
            </Btn>
          ) : null}
          <Btn size="sm" variant="subtle" onClick={() => api.shell.openExternal(provider.docs)}>
            Docs ↗
          </Btn>
          {provider.keyUrl ? (
            <Btn size="sm" variant="subtle" onClick={() => api.shell.openExternal(provider.keyUrl)}>
              {provider.requiresKey ? 'Get a key ↗' : 'Install ↗'}
            </Btn>
          ) : null}
        </div>

        {provider.requiresKey && !provider.encryptionAvailable ? (
          <div className="notice warn mt-12">OS encryption is unavailable, so the saved key is only obfuscated on disk.</div>
        ) : null}
      </div>
    </div>
  );
}
