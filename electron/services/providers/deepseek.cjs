'use strict';
// DeepSeek adapter (optional reasoning/text provider). OpenAI-compatible chat API.
const { request, HttpError } = require('../http.cjs');

const DEFAULT_BASE = 'https://api.deepseek.com';
const MODELS = ['deepseek-flash', 'deepseek-v4-pro'];

function auth(secret) {
  return { authorization: `Bearer ${secret}`, 'content-type': 'application/json' };
}

async function testConnection({ secret, baseUrl = DEFAULT_BASE, fetchImpl = globalThis.fetch } = {}) {
  if (!secret) return { ok: false, status: 'not-configured', message: 'No API key saved.' };
  try {
    const res = await request(`${baseUrl.replace(/\/$/, '')}/models`, { headers: auth(secret), fetchImpl, timeout: 20000, retries: 0 });
    const models = (res.json?.data || []).map((m) => m.id);
    return { ok: true, status: 'connected', message: 'API key accepted.', models };
  } catch (err) {
    if (err instanceof HttpError && (err.status === 401 || err.status === 403)) {
      return { ok: false, status: 'authentication-failed', message: 'DeepSeek rejected the API key (HTTP 401/403).' };
    }
    if (err instanceof HttpError && err.status === 404) {
      return { ok: false, status: 'invalid-configuration', message: `Endpoint not found: ${baseUrl}` };
    }
    return { ok: false, status: 'unreachable', message: `Could not reach DeepSeek: ${err.message}` };
  }
}

async function complete({ secret, baseUrl = DEFAULT_BASE, model = 'deepseek-flash', messages, temperature = 0.7, maxTokens = 1200, json = false, fetchImpl = globalThis.fetch, timeout = 90000 }) {
  if (!secret) throw new HttpError('DeepSeek API key is not configured', { status: 401 });
  if (!Array.isArray(messages) || !messages.length) throw new Error('messages are required');
  const body = { model, messages, temperature, max_tokens: maxTokens, stream: false };
  if (json) body.response_format = { type: 'json_object' };
  const res = await request(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: auth(secret),
    body,
    fetchImpl,
    timeout,
    retries: 1,
  });
  const text = res.json?.choices?.[0]?.message?.content;
  if (!text) throw new HttpError('DeepSeek returned an empty completion', { body: res.json });
  return { text, usage: res.json?.usage || null, model };
}

const SYSTEM = {
  enhance:
    'You are a prompt engineer for generative media models. Rewrite the user prompt into one vivid, specific prompt. ' +
    'Keep the original intent and language. Add subject, composition, lighting, lens and style detail where missing. ' +
    'Return only the improved prompt, no preamble, no quotes.',
  expand:
    'You are a creative director. Expand the user idea into a rich, detailed visual description suitable for an image or video model. ' +
    'Return only the expanded prompt.',
  storyboard:
    'You are a storyboard artist. Break the idea into 4-8 numbered shots. For each shot give one sentence of visual direction. ' +
    'Return a numbered list only.',
  plan:
    'You are a workflow planner for a node-based generative media tool. Reply with JSON: {"summary": string, "nodes": [{"type": string, "label": string, "config": object}]}. ' +
    'Allowed node types: prompt.text, image.generate, image.edit, video.generate, audio.speak, upscale, output.save.',
};

async function enhancePrompt({ prompt, mode = 'enhance', secret, baseUrl, model, fetchImpl } = {}) {
  if (!prompt || !String(prompt).trim()) throw new Error('prompt is required');
  const { text } = await complete({
    secret,
    baseUrl,
    model,
    messages: [
      { role: 'system', content: SYSTEM[mode] || SYSTEM.enhance },
      { role: 'user', content: String(prompt).trim() },
    ],
    temperature: mode === 'storyboard' ? 0.8 : 0.6,
    maxTokens: mode === 'storyboard' ? 900 : 700,
    fetchImpl,
  });
  return { text: text.trim(), provider: 'deepseek', model };
}

module.exports = { id: 'deepseek', label: 'DeepSeek', MODELS, DEFAULT_BASE, testConnection, complete, enhancePrompt, SYSTEM };
