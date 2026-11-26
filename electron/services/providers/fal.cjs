'use strict';
// fal.ai queue adapter (REST, verified against docs.fal.ai queue API).
const { request, HttpError } = require('../http.cjs');

const QUEUE = 'https://queue.fal.run';

function headers(secret) {
  return { authorization: `Key ${secret}`, 'content-type': 'application/json' };
}

/**
 * Credential probe that never triggers a generation:
 * POST an empty body to an endpoint whose schema requires image_url.
 * 422/400 => key accepted and request validated; 401/403 => key rejected.
 */
async function testConnection({ secret, fetchImpl = globalThis.fetch } = {}) {
  if (!secret) return { ok: false, status: 'not-configured', message: 'No API key saved.' };
  try {
    const res = await fetchImpl(`${QUEUE}/fal-ai/imageutils/rembg`, {
      method: 'POST',
      headers: headers(secret),
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(20000),
    });
    const body = await res.text().catch(() => '');
    if (res.status === 401 || res.status === 403) {
      return { ok: false, status: 'authentication-failed', message: `fal.ai rejected the API key (HTTP ${res.status}).`, httpStatus: res.status };
    }
    if (res.status === 422 || res.status === 400) {
      return { ok: true, status: 'connected', message: 'API key accepted (validation probe — no generation was run).', httpStatus: res.status };
    }
    if (res.status === 429) return { ok: true, status: 'connected', message: 'API key accepted (rate limited during probe).', httpStatus: 429 };
    if (res.ok) return { ok: true, status: 'connected', message: `API key accepted (HTTP ${res.status}).`, httpStatus: res.status };
    return { ok: false, status: 'error', message: `Unexpected HTTP ${res.status}: ${body.slice(0, 200)}`, httpStatus: res.status };
  } catch (err) {
    return { ok: false, status: 'unreachable', message: `Could not reach fal.ai: ${err.message}` };
  }
}

async function submit({ endpointId, input, secret, fetchImpl = globalThis.fetch, timeout = 60000 } = {}) {
  if (!secret) throw new HttpError('fal.ai API key is not configured', { status: 401 });
  const res = await request(`${QUEUE}/${endpointId}`, {
    method: 'POST',
    headers: headers(secret),
    body: input,
    fetchImpl,
    timeout,
    retries: 2,
  });
  const data = res.json || {};
  if (!data.request_id) throw new HttpError('fal.ai did not return a request_id', { body: data });
  return {
    requestId: data.request_id,
    statusUrl: data.status_url,
    responseUrl: data.response_url,
    cancelUrl: data.cancel_url,
    queuePosition: data.queue_position ?? null,
  };
}

async function status({ statusUrl, secret, fetchImpl = globalThis.fetch } = {}) {
  const res = await request(statusUrl, { headers: headers(secret), fetchImpl, timeout: 30000 });
  return res.json || {};
}

async function result({ responseUrl, secret, fetchImpl = globalThis.fetch } = {}) {
  const res = await request(responseUrl, { headers: headers(secret), fetchImpl, timeout: 60000 });
  return res.json || {};
}

async function cancel({ cancelUrl, secret, fetchImpl = globalThis.fetch } = {}) {
  if (!cancelUrl) return false;
  try {
    await request(cancelUrl, { method: 'PUT', headers: headers(secret), fetchImpl, timeout: 20000, retries: 0 });
    return true;
  } catch {
    return false;
  }
}

/** Extract media URLs from a fal result payload, per model resultPath. */
function extractOutputs(model, payload) {
  const out = { images: [], video: null, audio: null, raw: payload };
  if (Array.isArray(payload?.images)) out.images = payload.images.map((i) => i.url).filter(Boolean);
  if (payload?.video?.url) out.video = payload.video.url;
  if (payload?.audio?.url) out.audio = payload.audio.url;
  if (payload?.image?.url) out.images.push(payload.image.url);
  if (model?.resultPath === 'video' && !out.video && payload?.video?.url) out.video = payload.video.url;
  return out;
}

module.exports = { id: 'fal', label: 'fal.ai', testConnection, submit, status, result, cancel, extractOutputs, QUEUE };
