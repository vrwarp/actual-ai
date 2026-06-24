/**
 * Field-level validation shared by the PATCH handler. Mirrors the constraints the
 * frontend enforces, so the server stays the authority (never trust the client).
 */

import cron from 'node-cron';
import { FieldDef } from './config-schema';

export interface FieldError {
  key: string;
  detail: string;
}

/** A 6-field expression or a 5-field minute-wildcard is treated as sub-minute / unsupported. */
export function isSubMinuteCron(expr: string): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length === 6) return true;
  if (parts.length === 5) {
    const minute = parts[0];
    if (minute === '*') return true;
    // step on the minute field smaller than 1 (e.g. "*/0") — treat any "*/n" with n<1 as bad
    const m = /^\*\/(\d+)$/.exec(minute);
    if (m && Number(m[1]) < 1) return true;
  }
  return false;
}

function isHttpUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function validTag(v: string): string | null {
  if (!v.startsWith('#')) return 'Tag must start with "#".';
  if (/\s/.test(v)) return 'Tag must not contain whitespace.';
  if (v.length > 64) return 'Tag is too long (max 64).';
  return null;
}

/**
 * Validate one field value (string form, as the UI submits it).
 * Returns an error detail string, or null when valid. Empty values are allowed
 * here (means "clear / use default"); required-ness is checked at save-completeness
 * level by the UI, not per-key, so a partial edit isn't blocked.
 */
export function validateField(field: FieldDef, value: string): string | null {
  if (value === '' || value === undefined || value === null) return null;

  switch (field.type) {
    case 'url':
      return isHttpUrl(value) ? null : 'Must be a valid http(s) URL.';
    case 'cron':
      if (!cron.validate(value)) return 'Not a valid cron expression.';
      if (isSubMinuteCron(value)) return 'Sub-minute / 6-field schedules are not supported.';
      return null;
    case 'tag':
      return validTag(value);
    case 'number': {
      const n = Number(value);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return 'Must be a non-negative integer.';
      return null;
    }
    case 'rate': {
      const n = Number(value);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return 'Must be empty, 0, or a positive integer.';
      return null;
    }
    case 'bool':
      return value === 'true' || value === 'false' ? null : 'Must be true or false.';
    case 'select':
      return null;
    case 'textarea':
      if (field.maxLen && value.length > field.maxLen) return `Too long (max ${field.maxLen}).`;
      return null;
    case 'text':
    case 'secret':
    default:
      if (field.maxLen && value.length > field.maxLen) return `Too long (max ${field.maxLen}).`;
      return null;
  }
}
