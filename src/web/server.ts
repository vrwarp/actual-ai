import http, { IncomingMessage, ServerResponse } from 'http';
import fs from 'fs';
import path from 'path';
import {
  webUiPort, webUiBindAddress, mockMode, cronSchedule, isFeatureEnabled,
  resolveConfig,
} from '../config';
import { initToken, checkToken, bearerFrom } from './auth';
import {
  unlockStatus, verifyAnswer, validTicket, revokeTicket, UnlockPayload,
} from './unlock';
import {
  resolveEffective, saveConfig, restorePrevious, SavePatch,
  pendingEnvMap,
} from './config-store';
import { ALL_FIELDS } from './config-schema';
import { dryRunPreview, PreviewResult } from './preview-runner';
import { testActual, testLlm, llmDestination } from './conn-test';
import { cronInfo } from './cron-next';
import { readRunState, writeRunState } from './run-state';

const UI_DIR = path.resolve(__dirname, '..', 'web-ui');
const STATIC_ALLOWLIST: Record<string, string> = {
  '/': 'index.html',
  '/index.html': 'index.html',
  '/app.css': 'app.css',
  '/app.js': 'app.js',
  '/schema-render.js': 'schema-render.js',
  '/api.js': 'api.js',
};
const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};
const LOOPBACK = ['127.0.0.1', '::1', 'localhost'];
const MAX_BODY = 256 * 1024;
const LLM_COOLDOWN_MS = 5000;
const PREVIEW_MIN_INTERVAL_MS = 3000;

interface ServerState {
  bootError?: unknown;
  runnable: boolean;
}

let lastLlmTestMs = 0;
let lastPreviewStartMs = 0;
let previewRunning = false;
let lastPreview: PreviewResult | null = null;
let totalPreviews = 0;

function nowMs(): number { return Date.now(); }

function securityHeaders(res: ServerResponse, isStatic: boolean): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  if (isStatic) {
    res.setHeader('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none'; base-uri 'none'");
    res.setHeader('X-Frame-Options', 'DENY');
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  securityHeaders(res, false);
  res.setHeader('Content-Type', 'application/json');
  res.statusCode = status;
  res.end(JSON.stringify(body));
}

function serveStatic(res: ServerResponse, file: string): void {
  const full = path.resolve(UI_DIR, file);
  if (!full.startsWith(UI_DIR)) { res.statusCode = 404; res.end(); return; }
  fs.readFile(full, (err, data) => {
    if (err) { res.statusCode = 404; res.end('Not found'); return; }
    securityHeaders(res, true);
    res.setHeader('Content-Type', CONTENT_TYPES[path.extname(full)] ?? 'application/octet-stream');
    res.statusCode = 200;
    res.end(data);
  });
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('body_too_large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handleApi(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  state: ServerState,
): Promise<void> {
  const { method } = req;
  const route = url.pathname;

  if (method === 'OPTIONS') { res.statusCode = 403; res.end(); return; }

  const ticketHeader = req.headers['x-unlock-ticket'];
  const ticket = Array.isArray(ticketHeader) ? ticketHeader[0] : ticketHeader;

  // ---- knowledge-challenge unlock (PUBLIC login surface) ----
  // These are reachable without a token because the data challenge is an
  // ALTERNATIVE way to authenticate. Brute force is bounded by the lockout.
  if (route === '/api/unlock/status' && method === 'GET') {
    sendJson(res, 200, await unlockStatus(mockMode, nowMs()));
    return;
  }
  if (route === '/api/unlock' && method === 'POST') {
    let payload: UnlockPayload = {};
    try {
      payload = JSON.parse(await readBody(req)) as UnlockPayload;
    } catch (e) {
      if ((e as Error).message === 'body_too_large') { sendJson(res, 413, { error: 'body_too_large' }); return; }
      sendJson(res, 400, { error: 'invalid_json' });
      return;
    }
    const result = await verifyAnswer(payload, mockMode, nowMs());
    sendJson(res, result.ok ? 200 : 403, result);
    return;
  }
  if (route === '/api/unlock/lock' && method === 'POST') {
    revokeTicket(ticket);
    sendJson(res, 200, { ok: true });
    return;
  }

  // Auth gate for every other /api/* route: a valid bearer token OR a valid
  // unlock ticket grants access.
  const authorized = checkToken(bearerFrom(req.headers.authorization)) || validTicket(ticket, nowMs());
  if (!authorized) {
    sendJson(res, 401, { error: 'unauthorized' });
    return;
  }

  // ---- config ----
  if (route === '/api/config' && method === 'GET') {
    const eff = resolveEffective();
    sendJson(res, 200, {
      ...eff,
      bootError: state.bootError ? String(state.bootError) : null,
      runnable: state.runnable,
      mockMode,
    });
    return;
  }

  if (route === '/api/config' && method === 'PATCH') {
    let patch: SavePatch;
    try {
      patch = JSON.parse(await readBody(req)) as SavePatch;
    } catch (e) {
      if ((e as Error).message === 'body_too_large') { sendJson(res, 413, { error: 'body_too_large' }); return; }
      sendJson(res, 400, { error: 'invalid_json' });
      return;
    }
    const result = saveConfig(patch);
    sendJson(res, result.ok ? 200 : 400, result);
    return;
  }

  if (route === '/api/config/restore-previous' && method === 'POST') {
    sendJson(res, 200, restorePrevious());
    return;
  }

  if (route === '/api/config/reset-prompt' && method === 'POST') {
    const field = ALL_FIELDS.find((f) => f.key === 'promptTemplate');
    // default lives in resolveConfig output for an empty env
    const def = resolveConfig({}).promptTemplate;
    sendJson(res, 200, { default: def, key: field?.key });
    return;
  }

  // ---- tests ----
  if (route === '/api/test/actual' && method === 'POST') {
    // A real test downloads into a scratch dir; the dataDir lock serializes it
    // against a concurrent cron run (it will report connection_failed if busy).
    const result = await testActual(mockMode);
    sendJson(res, 200, result);
    return;
  }

  if (route === '/api/test/llm-destination' && method === 'GET') {
    sendJson(res, 200, llmDestination(mockMode));
    return;
  }

  if (route === '/api/test/llm' && method === 'POST') {
    const since = nowMs() - lastLlmTestMs;
    if (since < LLM_COOLDOWN_MS) {
      sendJson(res, 429, { error: 'cooldown', retryAfterMs: LLM_COOLDOWN_MS - since });
      return;
    }
    lastLlmTestMs = nowMs();
    const result = await testLlm(mockMode, nowMs());
    sendJson(res, 200, result);
    return;
  }

  // ---- debug / preview ----
  if (route === '/api/debug/preview' && method === 'POST') {
    if (previewRunning) { sendJson(res, 409, { error: 'preview_in_progress' }); return; }
    const since = nowMs() - lastPreviewStartMs;
    if (since < PREVIEW_MIN_INTERVAL_MS) {
      sendJson(res, 429, { error: 'cooldown', retryAfterMs: PREVIEW_MIN_INTERVAL_MS - since });
      return;
    }
    lastPreviewStartMs = nowMs();
    previewRunning = true;
    const startedAt = new Date(nowMs()).toISOString();
    // Run synchronously (mock preview is fast & deterministic) then return.
    try {
      lastPreview = await dryRunPreview(startedAt);
      totalPreviews += 1;
      writeRunState({ lastPreviewAt: startedAt, totalPreviews });
    } catch (e) {
      lastPreview = {
        at: startedAt, considered: 0, wouldCategorize: 0, skipped: 0, distribution: [], sample: [], mock: true, error: String(e),
      };
    } finally {
      previewRunning = false;
    }
    sendJson(res, 200, { previewId: startedAt, startedAt });
    return;
  }

  if (route === '/api/debug/preview-status' && method === 'GET') {
    sendJson(res, 200, {
      current: previewRunning ? 'running' : 'idle',
      lastPreview,
      totalPreviews,
    });
    return;
  }

  if (route === '/api/debug/last-run' && method === 'GET') {
    const s = readRunState();
    sendJson(res, 200, {
      lastSuccessAt: s.lastSuccessAt ?? null,
      lastErrorAt: s.lastErrorAt ?? null,
      hasEverRun: !!s.hasEverRun,
      lastOutcome: s.lastOutcome ?? null,
    });
    return;
  }

  if (route === '/api/debug/cron' && method === 'GET') {
    const info = cronInfo(cronSchedule, new Date(nowMs()));
    sendJson(res, 200, {
      ...info,
      classifyOnStartup: isFeatureEnabled('classifyOnStartup'),
      runnable: state.runnable,
      bootGraphError: !!state.bootError,
    });
    return;
  }

  if (route === '/api/debug/rate-limiter' && method === 'GET') {
    const cfg = resolveConfig(pendingEnvMap());
    sendJson(res, 200, {
      requestsPerMinute: cfg.requestsPerMinuteOverride,
      tokensPerMinute: cfg.tokensPerMinuteOverride,
      disabled: cfg.flags.disableRateLimiter,
      provider: cfg.llmProvider,
    });
    return;
  }

  sendJson(res, 404, { error: 'not_found' });
}

/**
 * Start the companion HTTP server. Additive and optional — never throws into the
 * caller; a bind/port problem logs and leaves the cron app running.
 */
export function startWebServer(state: ServerState): http.Server | null {
  if (!LOOPBACK.includes(webUiBindAddress)) {
    console.error(
      `[web-ui] Refusing to bind to non-loopback address "${webUiBindAddress}". `
      + 'Expose the UI via a reverse proxy to 127.0.0.1 or an SSH tunnel (ssh -L) instead.',
    );
    return null;
  }

  initToken();

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://${webUiBindAddress}:${webUiPort}`);
    if (url.pathname.startsWith('/api/')) {
      handleApi(req, res, url, state).catch((e) => {
        try { sendJson(res, 500, { error: 'internal', detail: String(e) }); } catch { /* noop */ }
      });
      return;
    }
    const staticFile = STATIC_ALLOWLIST[url.pathname];
    if (req.method === 'GET' && staticFile) { serveStatic(res, staticFile); return; }
    res.statusCode = 404;
    res.end('Not found');
  });

  server.on('error', (e) => {
    console.error('[web-ui] Server error (cron continues):', String(e));
  });

  server.listen(webUiPort, webUiBindAddress, () => {
    console.log(`[web-ui] Config editor listening on http://${webUiBindAddress}:${webUiPort}`);
    if (state.bootError) {
      console.error('[web-ui] NOTE: the app graph failed to build — fix config in the UI and restart.');
    }
  });

  return server;
}

export default startWebServer;
