import fs from 'fs';
import path from 'path';
import { configDir } from './config-store';

/**
 * Tiny JSON state file recording the outcome of the last real classification run
 * and the last dry-run preview, so the debug panel can show live status across
 * requests (and restarts).
 */

export interface RunState {
  lastSuccessAt?: string;
  lastErrorAt?: string;
  hasEverRun?: boolean;
  lastOutcome?: {
    considered: number; categorized: number; skipped: number; dryRun: boolean;
  };
  lastPreviewAt?: string;
  totalPreviews?: number;
}

const stateFile = () => path.join(configDir(), 'run-state.json');

export function readRunState(): RunState {
  try {
    return JSON.parse(fs.readFileSync(stateFile(), 'utf8')) as RunState;
  } catch {
    return {};
  }
}

export function writeRunState(patch: Partial<RunState>): void {
  try {
    const current = readRunState();
    const next = { ...current, ...patch };
    fs.mkdirSync(configDir(), { recursive: true, mode: 0o700 });
    fs.writeFileSync(stateFile(), JSON.stringify(next, null, 2), { mode: 0o644 });
  } catch {
    // best-effort; never crash a request over state bookkeeping
  }
}

export default readRunState;
