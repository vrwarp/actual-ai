import cron from 'node-cron';
import { isSubMinuteCron } from './validate';

/**
 * Lightweight next-run computation for standard 5-field cron, with no extra deps.
 * Steps minute-by-minute from a start time (capped) to find upcoming matches.
 */

function parseField(field: string, min: number, max: number): Set<number> {
  const out = new Set<number>();
  for (const part of field.split(',')) {
    let range = part;
    let step = 1;
    const slash = part.split('/');
    if (slash.length === 2) {
      range = slash[0];
      step = Number(slash[1]) || 1;
    }
    let lo = min;
    let hi = max;
    if (range !== '*') {
      const dash = range.split('-');
      if (dash.length === 2) {
        lo = Number(dash[0]);
        hi = Number(dash[1]);
      } else {
        lo = Number(range);
        hi = Number(range);
      }
    }
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
}

function matches(date: Date, fields: { minute: Set<number>; hour: Set<number>; dom: Set<number>; month: Set<number>; dow: Set<number> }): boolean {
  const dow = date.getDay(); // 0=Sun
  const dowMatch = fields.dow.has(dow) || (dow === 0 && fields.dow.has(7));
  return (
    fields.minute.has(date.getMinutes())
    && fields.hour.has(date.getHours())
    && fields.dom.has(date.getDate())
    && fields.month.has(date.getMonth() + 1)
    && dowMatch
  );
}

export interface CronInfo {
  schedule: string;
  valid: boolean;
  blocked: boolean;
  nextRuns: string[] | null;
  humanReadable: string;
}

const HUMAN: Record<string, string> = {
  '0 */4 * * *': 'At minute 0, every 4 hours',
  '0 * * * *': 'Every hour, on the hour',
  '*/15 * * * *': 'Every 15 minutes',
  '0 0 * * *': 'Every day at midnight',
  '0 9 * * *': 'Every day at 09:00',
  '0 0 * * 0': 'Every Sunday at midnight',
};

function humanReadable(expr: string): string {
  if (HUMAN[expr]) return HUMAN[expr];
  const parts = expr.trim().split(/\s+/);
  if (parts.length === 5) {
    const [m, h] = parts;
    if (/^\d+$/.test(m) && /^\d+$/.test(h) && parts[2] === '*' && parts[3] === '*' && parts[4] === '*') {
      return `Every day at ${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
    }
  }
  return 'Custom schedule';
}

/**
 * Compute up to `count` next run times after `from`.
 *
 * @param expr - 5-field cron expression.
 * @param from - Starting Date.
 * @param count - How many upcoming runs to return.
 */
export function nextRuns(expr: string, from: Date, count = 3): string[] | null {
  if (!cron.validate(expr) || isSubMinuteCron(expr)) return null;
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const fields = {
    minute: parseField(parts[0], 0, 59),
    hour: parseField(parts[1], 0, 23),
    dom: parseField(parts[2], 1, 31),
    month: parseField(parts[3], 1, 12),
    dow: parseField(parts[4], 0, 7),
  };
  const results: string[] = [];
  const cursor = new Date(from.getTime());
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);
  const maxIterations = 366 * 24 * 60;
  for (let i = 0; i < maxIterations && results.length < count; i += 1) {
    if (matches(cursor, fields)) results.push(cursor.toISOString());
    cursor.setMinutes(cursor.getMinutes() + 1);
  }
  return results;
}

/** Full cron info for the debug panel. */
export function cronInfo(expr: string, from: Date): CronInfo {
  const valid = cron.validate(expr);
  const blocked = valid && isSubMinuteCron(expr);
  return {
    schedule: expr,
    valid,
    blocked,
    nextRuns: valid && !blocked ? nextRuns(expr, from) : null,
    humanReadable: valid ? humanReadable(expr) : 'Invalid cron expression',
  };
}

export default cronInfo;
