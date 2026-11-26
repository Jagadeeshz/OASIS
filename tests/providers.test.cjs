'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fal = require('../electron/services/providers/fal.cjs');
const deepseek = require('../electron/services/providers/deepseek.cjs');
const ollama = require('../electron/services/providers/ollama.cjs');

function fakeFetch(handler) {
  const calls = [];
  const impl = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null, headers: opts.headers || {} });
    return handler(String(url), opts, calls.length);
  };
  impl.calls = calls;
  return impl;
}

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('deepseek connection test distinguishes auth failure from success', async () => {
  const ok = await deepseek.testConnection({ secret: 'sk-test-123456', fetchImpl: fakeFetch(() => json({ data: [{ id: 'deepseek-flash' }] })) });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.models, ['deepseek-flash']);

  const bad = await deepseek.testConnection({ secret: 'sk-test-123456', fetchImpl: fakeFetch(() => json({ error: 'nope' }, 401)) });
  assert.equal(bad.ok, false);
  assert.equal(bad.status, 'authentication-failed');

  const missing = await deepseek.testConnection({ secret: '', fetchImpl: fakeFetch(() => json({})) });
  assert.equal(missing.status, 'not-configured');
});

test('deepseek prompt enhancement posts an OpenAI-compatible chat request', async () => {
  const fetchImpl = fakeFetch(() =>
    json({ choices: [{ message: { content: 'A painted lighthouse, golden hour, 85mm' } }], usage: { total_tokens: 42 } }),
  );
  const res = await deepseek.enhancePrompt({ prompt: 'lighthouse', secret: 'sk-test-123456', fetchImpl });
  assert.match(res.text, /lighthouse/i);
  const call = fetchImpl.calls[0];
  assert.equal(call.url, 'https://api.deepseek.com/chat/completions');
  assert.equal(call.body.model, 'deepseek-flash');
  assert.equal(call.body.messages[0].role, 'system');
  assert.equal(call.body.messages[1].content, 'lighthouse');
  assert.equal(call.headers.authorization, 'Bearer sk-test-123456');
});

test('ollama reports unreachable clearly and never throws at the caller', async () => {
  const fetchImpl = async () => {
    throw new Error('connect ECONNREFUSED 127.0.0.1:11434');
  };
  const res = await ollama.testConnection({ endpoint: 'http://127.0.0.1:11434', fetchImpl });
  assert.equal(res.ok, false);
  assert.equal(res.status, 'unreachable');
  assert.match(res.message, /not running/);
});

test('ollama lists and uses installed models', async () => {
  const fetchImpl = fakeFetch((url) => {
    if (url.endsWith('/api/tags')) return json({ models: [{ name: 'llama3.2:latest' }] });
    if (url.endsWith('/api/chat')) return json({ message: { content: 'Better prompt' }, eval_count: 12 });
    return json({}, 404);
  });
  const probe = await ollama.testConnection({ fetchImpl });
  assert.equal(probe.ok, true);
  assert.deepEqual(probe.models, ['llama3.2:latest']);
  const chat = await ollama.chat({ model: 'llama3.2:latest', messages: [{ role: 'user', content: 'hi' }], fetchImpl });
  assert.equal(chat.text, 'Better prompt');
  const body = fetchImpl.calls.find((c) => c.url.endsWith('/api/chat')).body;
  assert.equal(body.stream, false);
  assert.equal(body.model, 'llama3.2:latest');
});

test('fal connection probe never triggers a generation', async () => {
  const fetchImpl = fakeFetch(() => json({ detail: [{ loc: ['body', 'image_url'], msg: 'field required' }] }, 422));
  const res = await fal.testConnection({ secret: 'fal-key-123456', fetchImpl });
  assert.equal(res.ok, true);
  assert.equal(res.status, 'connected');
  const call = fetchImpl.calls[0];
  assert.match(call.url, /fal-ai\/imageutils\/rembg$/);
  assert.deepEqual(call.body, {}, 'probe must send an empty body so the provider only validates it');
  assert.equal(call.headers.authorization, 'Key fal-key-123456');
});

test('fal submit builds queue URLs from the response and surfaces auth errors', async () => {
  const fetchImpl = fakeFetch(() =>
    json({
      request_id: 'abc',
      status_url: 'https://queue.fal.run/fal-ai/flux/requests/abc/status',
      response_url: 'https://queue.fal.run/fal-ai/flux/requests/abc',
    }),
  );
  const sub = await fal.submit({ endpointId: 'fal-ai/flux/schnell', input: { prompt: 'x' }, secret: 'k-123456', fetchImpl });
  assert.equal(sub.requestId, 'abc');
  assert.match(sub.statusUrl, /\/status$/);

  const authFail = fakeFetch(() => json({ detail: 'invalid key' }, 401));
  await assert.rejects(() => fal.submit({ endpointId: 'fal-ai/flux/schnell', input: {}, secret: 'k-123456', fetchImpl: authFail }), /HTTP 401/);
});
