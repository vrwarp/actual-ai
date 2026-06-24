/**
 * Redaction helpers. The companion server must never echo a secret back over the
 * wire, and connection/LLM test error strings can contain credentials embedded in
 * URLs or echoed by upstreams.
 */

import { SECRET_KEYS, ALL_FIELDS } from './config-schema';

/** Collect concrete secret values currently in the environment, longest first. */
function secretValues(): string[] {
  const vals: string[] = [];
  for (const f of ALL_FIELDS) {
    if (f.secret) {
      const v = process.env[f.envVar];
      if (v && v.length >= 4) vals.push(v);
    }
  }
  // Also redact the Actual password / e2e even if mapped oddly.
  return vals.sort((a, b) => b.length - a.length);
}

/**
 * Best-effort scrub of a free-text string before it leaves the process:
 *  - replaces any known secret value with [REDACTED]
 *  - masks `password=...`, `token=...`, `key=...` query params
 *  - masks `https://user:pass@host` credentials
 */
export function scrub(text: string): string {
  if (!text) return text;
  let out = text;
  for (const secret of secretValues()) {
    out = out.split(secret).join('[REDACTED]');
  }
  out = out.replace(/(password|token|api[_-]?key|secret)=([^&\s]+)/gi, '$1=[REDACTED]');
  out = out.replace(/(https?:\/\/)([^:/\s]+):([^@/\s]+)@/gi, '$1$2:[REDACTED]@');
  return out;
}

/** Is a secret currently set (non-empty) in the given env map? */
export function isSecretSet(env: NodeJS.ProcessEnv, envVar: string): boolean {
  const v = env[envVar];
  return typeof v === 'string' && v.length > 0;
}

export { SECRET_KEYS };
