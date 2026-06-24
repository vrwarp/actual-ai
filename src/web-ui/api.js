// Minimal fetch wrapper. The bearer token + unlock ticket live only in module memory.
let token = '';
let ticket = '';

export function setToken(t) { token = t || ''; }
export function hasToken() { return !!token; }
export function setTicket(t) { ticket = t || ''; }

async function call(method, path, body) {
  const opts = { method, headers: {} };
  if (token) opts.headers.Authorization = `Bearer ${token}`;
  if (ticket) opts.headers['X-Unlock-Ticket'] = ticket;
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) {
    const err = new Error((data && data.error) || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  unlockStatus: () => call('GET', '/api/unlock/status'),
  unlock: (payload) => call('POST', '/api/unlock', payload),
  lock: () => call('POST', '/api/unlock/lock', {}),
  getConfig: () => call('GET', '/api/config'),
  patchConfig: (patch) => call('PATCH', '/api/config', patch),
  resetPrompt: () => call('POST', '/api/config/reset-prompt', {}),
  restorePrevious: () => call('POST', '/api/config/restore-previous', {}),
  testActual: () => call('POST', '/api/test/actual', {}),
  llmDestination: () => call('GET', '/api/test/llm-destination'),
  testLlm: () => call('POST', '/api/test/llm', {}),
  runPreview: () => call('POST', '/api/debug/preview', {}),
  previewStatus: () => call('GET', '/api/debug/preview-status'),
  lastRun: () => call('GET', '/api/debug/last-run'),
  cron: () => call('GET', '/api/debug/cron'),
  rateLimiter: () => call('GET', '/api/debug/rate-limiter'),
};
