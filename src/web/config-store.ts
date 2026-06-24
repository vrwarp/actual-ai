/**
 * Config overlay store.
 *
 * The running process reads every setting from `process.env` once, at import time
 * (`src/config.ts`). The Web UI therefore persists edits to an on-disk overlay that
 * is merged into `process.env` at the NEXT boot via {@link maybeApplyOverlay}. Saves
 * report `needsRestart: true`; nothing is hot-swapped.
 *
 * Two files under CONFIG_DIR (default `/config`):
 *   - config.json          non-secret values, keyed by canonical env var, mode 0644
 *   - secrets/secrets.json  secret values, keyed by canonical env var, mode 0600
 *   - config.json.prev      one-level undo, written on each save
 *
 * Precedence (computed ONLY here):
 *   - pinnable URL keys:  OS-env / .env  >  overlay  >  default   (SSRF surface)
 *   - everything else:    overlay  >  OS-env / .env  >  default
 */

import fs from 'fs';
import path from 'path';
import {
  ALL_FIELDS, FieldDef, fieldByKey, FEATURE_FLAG_FIELDS, SECTIONS, PINNABLE_ENV_VARS,
} from './config-schema';
import { validateField, isSubMinuteCron } from './validate';

export type EnvMap = Record<string, string>;

export function configDir(): string {
  return process.env.CONFIG_DIR && process.env.CONFIG_DIR.length > 0
    ? process.env.CONFIG_DIR
    : '/config';
}
const configFile = () => path.join(configDir(), 'config.json');
const prevFile = () => path.join(configDir(), 'config.json.prev');
const secretsDir = () => path.join(configDir(), 'secrets');
const secretsFile = () => path.join(secretsDir(), 'secrets.json');

// Snapshots captured the first time the overlay is applied, so the UI can tell
// the RUNNING config (boot-time merge) apart from AFTER-RESTART (current overlay).
let BASE_ENV: EnvMap = {};
let BOOT_OVERLAY: EnvMap = {};
let BOOT_SECRETS: EnvMap = {};
let applied = false;

function readJson(file: string): EnvMap {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: EnvMap = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === 'string') out[k] = v;
      }
      return out;
    }
  } catch {
    // missing or unreadable → empty overlay (never throw on boot)
  }
  return {};
}

/** Load the non-secret overlay from disk. */
export function loadOverlay(): EnvMap {
  return readJson(configFile());
}

/** Load the secret overlay from disk. */
export function loadSecrets(): EnvMap {
  return readJson(secretsFile());
}

function snapshotEnv(): EnvMap {
  const out: EnvMap = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}

/**
 * Apply the persisted overlay into `process.env`. Idempotent; safe to call when
 * the UI is disabled (returns immediately, touches no filesystem).
 */
export function maybeApplyOverlay(): void {
  if (process.env.WEB_UI_ENABLED !== 'true') return;
  if (applied) return;
  applied = true;

  BASE_ENV = snapshotEnv();
  BOOT_OVERLAY = loadOverlay();
  BOOT_SECRETS = loadSecrets();

  const writeMerged = (overlay: EnvMap) => {
    for (const [envVar, value] of Object.entries(overlay)) {
      const isPinnable = PINNABLE_ENV_VARS.includes(envVar);
      const baseHasIt = typeof BASE_ENV[envVar] === 'string' && BASE_ENV[envVar].length > 0;
      if (isPinnable && baseHasIt) continue; // OS-env wins for URL keys
      process.env[envVar] = value;
    }
  };
  writeMerged(BOOT_OVERLAY);
  writeMerged(BOOT_SECRETS);
}

// ---- merge / resolution -------------------------------------------------

/** Merge a base env with an overlay+secrets per precedence rules. */
export function mergeEnv(base: EnvMap, overlay: EnvMap, secrets: EnvMap): EnvMap {
  const out: EnvMap = { ...base };
  const apply = (src: EnvMap) => {
    for (const [envVar, value] of Object.entries(src)) {
      const isPinnable = PINNABLE_ENV_VARS.includes(envVar);
      const baseHasIt = typeof base[envVar] === 'string' && base[envVar].length > 0;
      if (isPinnable && baseHasIt) continue;
      out[envVar] = value;
    }
  };
  apply(overlay);
  apply(secrets);
  return out;
}

/** Parse the enabled feature-flag set from an env map (mirrors src/config.ts). */
export function flagsFromEnv(env: EnvMap): Set<string> {
  const set = new Set<string>();
  try {
    if (env.FEATURES) {
      const p = JSON.parse(env.FEATURES) as unknown;
      if (Array.isArray(p)) p.forEach((x) => set.add(String(x)));
    } else if (env.ENABLED_FEATURES) {
      const raw = env.ENABLED_FEATURES.trim();
      if (raw.startsWith('[')) {
        const p = JSON.parse(raw) as unknown;
        if (Array.isArray(p)) p.forEach((x) => set.add(String(x)));
      } else {
        raw.split(',').map((s) => s.trim()).filter(Boolean).forEach((x) => set.add(x));
      }
    }
  } catch {
    // ignore malformed FEATURES
  }
  (env.ENABLED_TOOLS ?? '').split(',').map((s) => s.trim()).filter(Boolean).forEach((x) => set.add(x));
  if (env.CLASSIFY_ON_STARTUP === 'true') set.add('classifyOnStartup');
  if (env.SYNC_ACCOUNTS_BEFORE_CLASSIFY === 'true') set.add('syncAccountsBeforeClassify');
  if (env.DISABLE_LOG_MASKING === 'true') set.add('disableMasking');
  return set;
}

/** The provider actually selected, mirroring src/config.ts derivation. */
function derivedProvider(env: EnvMap): string {
  return env.LLM_PROVIDER || (env.OPENROUTER_API_KEY ? 'openrouter' : 'openai');
}

/** The explicit (editable) value of a field in an env map — no default fill. */
export function formValue(env: EnvMap, field: FieldDef): string {
  if (field.featureFlag) return flagsFromEnv(env).has(field.featureFlag) ? 'true' : 'false';
  // The provider drives conditional sections; always surface the resolved value so
  // the correct provider block shows even when LLM_PROVIDER is left unset.
  if (field.key === 'llmProvider') return derivedProvider(env);
  return env[field.envVar] ?? '';
}

/** The value that actually takes effect (explicit, else default). */
export function effectiveValue(env: EnvMap, field: FieldDef): string {
  if (field.featureFlag) return flagsFromEnv(env).has(field.featureFlag) ? 'true' : 'false';
  if (field.key === 'llmProvider') return derivedProvider(env);
  return env[field.envVar] ?? field.default ?? '';
}

type Source = 'pinned-env' | 'overlay' | 'env' | 'default';

function sourceOf(field: FieldDef, base: EnvMap, overlay: EnvMap, secrets: EnvMap): Source {
  if (field.pinnable && base[field.envVar]) return 'pinned-env';
  if (field.featureFlag) {
    // feature flags live in FEATURES; if the overlay set FEATURES, it's overlay-sourced
    if (overlay.FEATURES || overlay.CLASSIFY_ON_STARTUP || overlay.SYNC_ACCOUNTS_BEFORE_CLASSIFY) return 'overlay';
    if (base.FEATURES || base.ENABLED_FEATURES) return 'env';
    return 'default';
  }
  if (overlay[field.envVar] !== undefined || secrets[field.envVar] !== undefined) return 'overlay';
  if (base[field.envVar]) return 'env';
  return 'default';
}

export interface EffectiveResult {
  running: { values: EnvMap; secrets: Record<string, { set: boolean }> };
  pending: { values: EnvMap; secrets: Record<string, { set: boolean }> };
  schema: typeof SECTIONS;
  pinnedByEnv: string[];
  pendingDiff: {
    key: string; label: string; section: string; running: string; pending: string; source: Source; note?: string;
  }[];
  restartPending: boolean;
}

/** Build the full payload for `GET /api/config`. */
export function resolveEffective(): EffectiveResult {
  const base = applied ? BASE_ENV : snapshotEnv();
  const bootOverlay = applied ? BOOT_OVERLAY : {};
  const bootSecrets = applied ? BOOT_SECRETS : {};
  const curOverlay = loadOverlay();
  const curSecrets = loadSecrets();

  const runningEnv = mergeEnv(base, bootOverlay, bootSecrets);
  const pendingEnv = mergeEnv(base, curOverlay, curSecrets);

  const runVals: EnvMap = {};
  const runSec: Record<string, { set: boolean }> = {};
  const penVals: EnvMap = {};
  const penSec: Record<string, { set: boolean }> = {};

  for (const f of ALL_FIELDS) {
    if (f.secret) {
      runSec[f.key] = { set: !!runningEnv[f.envVar] };
      penSec[f.key] = { set: !!pendingEnv[f.envVar] };
    } else {
      runVals[f.key] = formValue(runningEnv, f);
      penVals[f.key] = formValue(pendingEnv, f);
    }
  }

  const pendingDiff: EffectiveResult['pendingDiff'] = [];
  for (const section of SECTIONS) {
    for (const f of section.fields) {
      const runningDisp = f.secret ? (runSec[f.key].set ? '(set)' : '(unset)') : effectiveValue(runningEnv, f);
      const pendingDisp = f.secret ? (penSec[f.key].set ? '(set)' : '(unset)') : effectiveValue(pendingEnv, f);
      if (runningDisp !== pendingDisp) {
        const note = f.pinnable && base[f.envVar]
          ? `Pinned by ${f.envVar}; your edit will be ignored after restart. Remove ${f.envVar} from the environment to use it.`
          : undefined;
        pendingDiff.push({
          key: f.key,
          label: f.label,
          section: section.title,
          running: runningDisp,
          pending: pendingDisp,
          source: sourceOf(f, base, curOverlay, curSecrets),
          note,
        });
      }
    }
  }

  return {
    running: { values: runVals, secrets: runSec },
    pending: { values: penVals, secrets: penSec },
    schema: SECTIONS,
    pinnedByEnv: ALL_FIELDS.filter((f) => f.pinnable && base[f.envVar]).map((f) => f.envVar),
    pendingDiff,
    restartPending: pendingDiff.length > 0,
  };
}

// ---- atomic write -------------------------------------------------------

function atomicWrite(file: string, data: string, mode: number): void {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  // Create with the final mode so there is never a world-readable window.
  const fd = fs.openSync(tmp, 'wx', mode);
  try {
    fs.writeSync(fd, data);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file); // rename preserves the tmp file's mode
}

export interface SavePatch {
  values?: Record<string, string>;
  secrets?: Record<string, { action: 'keep' | 'replace' | 'clear'; value?: string }>;
}

export interface SaveResult {
  ok: boolean;
  savedKeys?: string[];
  secretActions?: Record<string, string>;
  needsRestart?: boolean;
  error?: string;
  detail?: string;
  key?: string;
}

/**
 * Persist a patch of editable fields. Validates every key against the schema,
 * collapses feature-flag booleans into a single FEATURES array, and writes the
 * two overlay files atomically.
 */
export function saveConfig(patch: SavePatch): SaveResult {
  const overlay = loadOverlay();
  const secrets = loadSecrets();
  const values = patch.values ?? {};
  const secretPatch = patch.secrets ?? {};
  const savedKeys: string[] = [];

  // 1. Validate + apply non-secret, non-flag values.
  for (const [key, raw] of Object.entries(values)) {
    const field = fieldByKey(key);
    if (!field) {
      return {
        ok: false, error: 'validation_failed', key, detail: 'Unknown field.',
      };
    }
    if (field.secret) {
      return {
        ok: false, error: 'validation_failed', key, detail: 'Secrets must use the secrets channel.',
      };
    }
    const value = typeof raw === 'string' ? raw : String(raw);
    const err = validateField(field, value);
    if (err) {
      return {
        ok: false, error: 'validation_failed', key, detail: err,
      };
    }
    if (field.featureFlag) continue; // handled below
    if (value === '') delete overlay[field.envVar];
    else overlay[field.envVar] = value;
    savedKeys.push(key);
  }

  // 2. Rebuild the FEATURES array from the effective + patched flag values.
  const pendingEnv = mergeEnv(applied ? BASE_ENV : snapshotEnv(), overlay, secrets);
  const flagSet = flagsFromEnv(pendingEnv);
  let flagsTouched = false;
  for (const field of FEATURE_FLAG_FIELDS) {
    if (values[field.key] === undefined) continue;
    flagsTouched = true;
    const on = values[field.key] === 'true';
    if (on) flagSet.add(field.featureFlag!);
    else flagSet.delete(field.featureFlag!);
    savedKeys.push(field.key);
  }
  if (flagsTouched) {
    // Keep only the flags the UI manages; preserve any unknown flags already present.
    overlay.FEATURES = JSON.stringify(Array.from(flagSet).sort());
    // Avoid ambiguity: collapse dedicated toggles into FEATURES.
    delete overlay.CLASSIFY_ON_STARTUP;
    delete overlay.SYNC_ACCOUNTS_BEFORE_CLASSIFY;
    delete overlay.ENABLED_FEATURES;
  }

  // 3. Secrets.
  const secretActions: Record<string, string> = {};
  for (const [key, action] of Object.entries(secretPatch)) {
    const field = fieldByKey(key);
    if (!field?.secret) {
      return {
        ok: false, error: 'validation_failed', key, detail: 'Unknown secret.',
      };
    }
    if (action.action === 'keep') { secretActions[key] = 'kept'; continue; }
    if (action.action === 'clear') {
      delete secrets[field.envVar];
      secretActions[key] = 'cleared';
    } else if (action.action === 'replace') {
      const v = action.value ?? '';
      if (v === '') {
        return {
          ok: false, error: 'validation_failed', key, detail: 'Replacement value is empty.',
        };
      }
      secrets[field.envVar] = v;
      secretActions[key] = 'replaced';
    }
  }

  // 4. Cross-field guard: reject a cron that would slip through.
  if (overlay.CLASSIFICATION_SCHEDULE_CRON && isSubMinuteCron(overlay.CLASSIFICATION_SCHEDULE_CRON)) {
    return {
      ok: false, error: 'validation_failed', key: 'cronSchedule', detail: 'Sub-minute schedules are not supported.',
    };
  }

  // 5. Atomic writes (config.json.prev backup first).
  try {
    if (fs.existsSync(configFile())) {
      try { fs.copyFileSync(configFile(), prevFile()); } catch { /* best-effort */ }
    }
    atomicWrite(configFile(), JSON.stringify(overlay, null, 2), 0o644);
    atomicWrite(secretsFile(), JSON.stringify(secrets, null, 2), 0o600);
  } catch (e) {
    const { code } = (e as { code?: string });
    if (code === 'EROFS' || code === 'EACCES') {
      return { ok: false, error: 'config_readonly', detail: 'Config directory is not writable.' };
    }
    return { ok: false, error: 'write_failed', detail: String(e) };
  }

  return {
    ok: true, savedKeys, secretActions, needsRestart: true,
  };
}

/** Swap config.json with config.json.prev (single-level undo). */
export function restorePrevious(): SaveResult {
  try {
    if (!fs.existsSync(prevFile())) return { ok: false, error: 'no_previous' };
    const prev = fs.readFileSync(prevFile(), 'utf8');
    if (fs.existsSync(configFile())) fs.copyFileSync(configFile(), `${prevFile()}.swap`);
    atomicWrite(configFile(), prev, 0o644);
    return { ok: true, needsRestart: true };
  } catch (e) {
    return { ok: false, error: 'write_failed', detail: String(e) };
  }
}

/** Build the env map representing PENDING config (for the dry-run preview). */
export function pendingEnvMap(): EnvMap {
  return mergeEnv(applied ? BASE_ENV : snapshotEnv(), loadOverlay(), loadSecrets());
}

/** Expose captured base for tests. */
export function __setSnapshotsForTest(base: EnvMap, overlay: EnvMap, secrets: EnvMap): void {
  BASE_ENV = base; BOOT_OVERLAY = overlay; BOOT_SECRETS = secrets; applied = true;
}
