'use strict';
// Shared HTTP helper: timeouts, bounded retries with backoff, error classification.
class HttpError extends Error {
  constructor(message, { status = 0, body = null, retryable = false, url = '' } = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
    this.retryable = retryable;
    this.url = url;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function request(url, opts = {}) {
  const {
    method = 'GET',
    headers = {},
    body,
    timeout = 60000,
    retries = 2,
    fetchImpl = globalThis.fetch,
    signal,
    expectJson = true,
  } = opts;

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error(`request timed out after ${timeout}ms`)), timeout);
    const onAbort = () => controller.abort(new Error('cancelled'));
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
    try {
      const res = await fetchImpl(url, {
        method,
        headers: { accept: expectJson ? 'application/json' : '*/*', ...headers },
        body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await res.text();
      let parsed = null;
      if (expectJson && text) {
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = null;
        }
      }
      if (!res.ok) {
        const retryable = res.status === 429 || res.status >= 500;
        const detail = parsed ? JSON.stringify(parsed).slice(0, 600) : text.slice(0, 600);
        const err = new HttpError(`HTTP ${res.status} from ${new URL(url).host}: ${detail || res.statusText}`, {
          status: res.status,
          body: parsed || text,
          retryable,
          url,
        });
        if (retryable && attempt < retries) {
          lastErr = err;
          await sleep(400 * Math.pow(2.5, attempt));
          continue;
        }
        throw err;
      }
      return { status: res.status, headers: res.headers, text, json: parsed };
    } catch (err) {
      const aborted = err?.name === 'AbortError' || /aborted|timed out/i.test(err?.message || '');
      if (signal?.aborted) throw new HttpError('cancelled', { url });
      const err2 =
        err instanceof HttpError
          ? err
          : new HttpError(aborted ? `request timed out after ${timeout}ms` : err.message || String(err), { retryable: true, url });
      if (err2.retryable && attempt < retries && err2.status !== 401 && err2.status !== 403) {
        lastErr = err2;
        await sleep(400 * Math.pow(2.5, attempt));
        continue;
      }
      throw err2;
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
    }
  }
  throw lastErr || new HttpError('request failed', { url });
}

module.exports = { request, HttpError, sleep };
