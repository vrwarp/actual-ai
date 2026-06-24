import crypto from 'crypto';

/**
 * Bearer-token auth bootstrap for the companion server.
 *
 * The token comes from `WEB_UI_TOKEN` if set, else a 256-bit random value is
 * generated and printed ONCE at startup. It is kept module-local and never placed
 * back into `process.env` (so it can't leak into the editable config surface).
 */

let token: string | null = null;

export function initToken(): string {
  if (token) return token;
  const fromEnv = process.env.WEB_UI_TOKEN;
  if (fromEnv && fromEnv.length > 0) {
    token = fromEnv;
    console.log('[web-ui] Using WEB_UI_TOKEN from environment for authentication.');
  } else {
    token = crypto.randomBytes(32).toString('hex');
    console.log('\n==================== actual-ai Web UI ====================');
    console.log('[web-ui] Auth token (use this to log in):');
    console.log(`           ${token}`);
    console.log('[web-ui] Set WEB_UI_TOKEN to pin a stable value across restarts.');
    console.log('=========================================================\n');
  }
  return token;
}

/** Constant-time comparison of a presented bearer token. */
export function checkToken(presented: string | undefined): boolean {
  if (!token || !presented) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(presented);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Extract a bearer token from an Authorization header. */
export function bearerFrom(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m ? m[1] : undefined;
}

/** Test seam. */
export function __setTokenForTest(value: string | null): void { token = value; }

export default initToken;
