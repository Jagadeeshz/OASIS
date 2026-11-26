'use strict';
// Ollama adapter (optional local inference). Talks to a user-configurable endpoint.
const { request, HttpError } = require('../http.cjs');

const DEFAULT_ENDPOINT = 'http://127.0.0.1:11434';

async function testConnection({ endpoint = DEFAULT_ENDPOINT, fetchImpl = globalThis.fetch } = {}) {
  const base = String(endpoint || DEFAULT_ENDPOINT).replace(/\/$/, '');
  try {
    const res = await request(`${base}/api/tags`, { fetchImpl, timeout: 8000, retries: 0 });
    const models = (res.json?.models || []).map((m) => m.name);
    return {
      ok: true,
      status: 'connected',
      message: models.length ? `Ollama reachable — ${models.length} model(s) installed.` : 'Ollama reachable, but no models are installed.',
      models,
    };
  } catch (err) {
    if (err instanceof HttpError && err.status) {
      return { ok: false, status: 'unreachable', message: `Ollama returned HTTP ${err.status} at ${base}.` };
    }
    return { ok: false, status: 'unreachable', message: `Ollama is not running at ${base} (${err.message}).` };
  }
}

async function listModels({ endpoint = DEFAULT_ENDPOINT, fetchImpl } = {}) {
  const res = await request(`${String(endpoint).replace(/\/$/, '')}/api/tags`, { fetchImpl, timeout: 8000, retries: 0 });
  return (res.json?.models || []).map((m) => ({ name: m.name, size: m.size, modified_at: m.modified_at }));
}

async function chat({ endpoint = DEFAULT_ENDPOINT, model, messages, format, fetchImpl = globalThis.fetch, timeout = 120000 } = {}) {
  if (!model) throw new Error('Select an installed Ollama model first');
  const base = String(endpoint).replace(/\/$/, '');
  const res = await request(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: { model, messages, stream: false, ...(format ? { format } : {}) },
    fetchImpl,
    timeout,
    retries: 0,
  });
  const text = res.json?.message?.content;
  if (!text) throw new HttpError('Ollama returned an empty completion', { body: res.json });
  return { text: text.trim(), model, usage: { eval_count: res.json?.eval_count, total_duration: res.json?.total_duration } };
}

const SYSTEM_ENHANCE =
  'You are a prompt engineer for generative media models. Rewrite the user prompt into one vivid, specific prompt. ' +
  'Keep the original intent. Return only the improved prompt.';

async function enhancePrompt({ prompt, endpoint, model, fetchImpl } = {}) {
  if (!prompt || !String(prompt).trim()) throw new Error('prompt is required');
  const { text } = await chat({
    endpoint,
    model,
    fetchImpl,
    messages: [
      { role: 'system', content: SYSTEM_ENHANCE },
      { role: 'user', content: String(prompt).trim() },
    ],
  });
  return { text, provider: 'ollama', model };
}

module.exports = { id: 'ollama', label: 'Ollama', DEFAULT_ENDPOINT, testConnection, listModels, chat, enhancePrompt };
