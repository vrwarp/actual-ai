import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as actualApiClient from '@actual-app/api';
import ActualApiService from '../actual-api-service';
import { resolveConfig, webUiUnlockChallenge } from '../config';
import { ActualApiServiceI } from '../types';
import { pendingEnvMap } from './config-store';
import { MockActualApiService } from './mocks/mock-actual-api';

/**
 * Knowledge-challenge session unlock.
 *
 * When enabled, the operator can unlock the Web UI by entering a value that
 * matches their real budget data (pulled read-only from Actual) — proving they
 * actually have access to the underlying budget. This is an ALTERNATIVE to the
 * bearer token: either one unlocks a session. The token remains the fallback
 * (bootstrap, headless use, or when the budget is unreachable).
 *
 * Safety properties:
 *  - The valid answers are NEVER sent to the client; only membership is checked
 *    server-side, normalized (trim / lowercase / collapse whitespace; amounts to
 *    absolute cents).
 *  - Brute force is bounded by a lockout (N attempts per window).
 *  - A correct answer grants a short-lived in-memory ticket; nothing is persisted.
 *  - If the budget is unreachable the challenge reports `bypass` and verification
 *    is unavailable — the user falls back to the bearer token (we never grant a
 *    ticket without a real check).
 */

const LOCKOUT_MAX = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const TICKET_TTL_MS = 12 * 60 * 60 * 1000;
const DATASET_TTL_MS = 5 * 60 * 1000;
const RECENT_TXN_COUNT = 25;

type ChallengeKind = 'transaction' | 'account' | 'payee' | 'category';

const PROMPTS: Record<ChallengeKind, string> = {
  transaction: 'Enter the payee and amount of one of your recent transactions.',
  account: 'Enter the name of one of your Actual accounts (exactly as it appears in your budget).',
  payee: 'Enter the name of one of the payees in your budget.',
  category: 'Enter the name of one of your budget categories.',
};

export interface UnlockPayload {
  answer?: string;
  payee?: string;
  amount?: string;
}

interface DatasetCache {
  fetchedAtMs: number;
  values: Set<string>; // normalized keys
}

let datasetCache: DatasetCache | null = null;
let attempts = 0;
let lockedUntilMs = 0;
const tickets = new Map<string, number>(); // ticket -> expiry ms

export function unlockEnabled(): boolean {
  return webUiUnlockChallenge !== 'off';
}

export function challengeKind(): ChallengeKind | null {
  return unlockEnabled() ? (webUiUnlockChallenge as ChallengeKind) : null;
}

export function challengePrompt(): string {
  const kind = challengeKind();
  return kind ? PROMPTS[kind] : '';
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Parse a user-entered dollar amount to absolute integer cents, or null. */
function absCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, '');
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Math.abs(parseFloat(cleaned)) * 100);
}

function txnKey(payeeName: string, amountCents: number): string {
  return `${normalize(payeeName)}|${Math.abs(amountCents)}`;
}

async function collectKeys(svc: ActualApiServiceI, kind: ChallengeKind): Promise<string[]> {
  if (kind === 'account') return (await svc.getAccounts()).map((a) => normalize(a.name)).filter(Boolean);
  if (kind === 'payee') return (await svc.getPayees()).map((p) => normalize(p.name)).filter(Boolean);
  if (kind === 'category') {
    const cats = await svc.getCategories();
    return cats.map((c) => (c as { name?: string }).name)
      .filter((n): n is string => !!n).map(normalize);
  }
  // transaction: keys for the most recent transactions (payee + amount, sign-agnostic)
  const [transactions, payees] = await Promise.all([svc.getTransactions(), svc.getPayees()]);
  const payeeName = new Map(payees.map((p) => [p.id, p.name]));
  const recent = [...transactions]
    .filter((t) => t.transfer_id === null || t.transfer_id === undefined)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, RECENT_TXN_COUNT);
  const keys: string[] = [];
  for (const t of recent) {
    const name = (t.payee && payeeName.get(t.payee)) || t.imported_payee || '';
    if (name) keys.push(txnKey(name, t.amount));
    // also accept the raw imported payee string as an alternative
    if (t.imported_payee && t.imported_payee !== name) keys.push(txnKey(t.imported_payee, t.amount));
  }
  return keys;
}

async function fetchDataset(mock: boolean): Promise<Set<string> | null> {
  const kind = challengeKind();
  if (!kind) return null;

  if (mock) {
    return new Set(await collectKeys(new MockActualApiService(), kind));
  }

  const cfg = resolveConfig(pendingEnvMap());
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'actual-ai-unlock-'));
  try { fs.chmodSync(scratch, 0o700); } catch { /* best-effort */ }
  const svc = new ActualApiService(actualApiClient, fs, scratch, cfg.serverURL, cfg.password, cfg.budgetId, cfg.e2ePassword, true);
  try {
    await svc.initializeApi();
    const keys = await collectKeys(svc, kind);
    await svc.shutdownApi();
    return new Set(keys);
  } catch {
    return null; // unreachable → caller reports bypass; user falls back to token
  } finally {
    try { fs.rmSync(scratch, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
}

async function ensureDataset(mock: boolean, nowMs: number): Promise<Set<string> | null> {
  if (datasetCache && nowMs - datasetCache.fetchedAtMs < DATASET_TTL_MS) {
    return datasetCache.values;
  }
  const values = await fetchDataset(mock);
  if (values === null) return null;
  datasetCache = { fetchedAtMs: nowMs, values };
  return values;
}

/** Compute the normalized lookup key for a submitted payload, or null if malformed. */
function keyForPayload(payload: UnlockPayload): string | null {
  const kind = challengeKind();
  if (!kind) return null;
  if (kind === 'transaction') {
    const payee = (payload.payee ?? '').trim();
    const cents = absCents(payload.amount ?? '');
    if (!payee || cents === null) return null;
    return txnKey(payee, cents);
  }
  const answer = (payload.answer ?? '').trim();
  return answer ? normalize(answer) : null;
}

export interface UnlockStatus {
  enabled: boolean;
  kind: ChallengeKind | null;
  prompt: string;
  locked: boolean;
  lockedUntilMs: number;
  attemptsRemaining: number;
  bypass: boolean; // dataset unreachable → use the token instead
}

/** Status for the unlock gate (never leaks any answers). */
export async function unlockStatus(mock: boolean, nowMs: number): Promise<UnlockStatus> {
  const enabled = unlockEnabled();
  const base: UnlockStatus = {
    enabled,
    kind: challengeKind(),
    prompt: challengePrompt(),
    locked: nowMs < lockedUntilMs,
    lockedUntilMs,
    attemptsRemaining: Math.max(0, LOCKOUT_MAX - attempts),
    bypass: false,
  };
  if (!enabled) return base;
  base.bypass = (await ensureDataset(mock, nowMs)) === null;
  return base;
}

export interface VerifyResult {
  ok: boolean;
  ticket?: string;
  error?: 'locked' | 'no_match' | 'unavailable' | 'disabled' | 'bad_input';
  attemptsRemaining?: number;
  lockedUntilMs?: number;
}

function issueTicket(nowMs: number): string {
  const ticket = crypto.randomBytes(32).toString('hex');
  tickets.set(ticket, nowMs + TICKET_TTL_MS);
  return ticket;
}

function registerFailure(nowMs: number): VerifyResult {
  attempts += 1;
  if (attempts >= LOCKOUT_MAX) {
    lockedUntilMs = nowMs + LOCKOUT_WINDOW_MS;
    attempts = 0;
    return { ok: false, error: 'locked', lockedUntilMs };
  }
  return { ok: false, error: 'no_match', attemptsRemaining: LOCKOUT_MAX - attempts };
}

/** Verify a submitted payload against the budget dataset. */
export async function verifyAnswer(
  payload: UnlockPayload,
  mock: boolean,
  nowMs: number,
): Promise<VerifyResult> {
  if (!unlockEnabled()) return { ok: false, error: 'disabled' };
  if (nowMs < lockedUntilMs) return { ok: false, error: 'locked', lockedUntilMs };

  const dataset = await ensureDataset(mock, nowMs);
  // Never grant a ticket without a real check: if the budget is unreachable the
  // user must use the bearer token instead.
  if (dataset === null) return { ok: false, error: 'unavailable' };

  const key = keyForPayload(payload);
  if (key === null) return { ok: false, error: 'bad_input' };

  if (dataset.has(key)) {
    attempts = 0;
    return { ok: true, ticket: issueTicket(nowMs) };
  }
  return registerFailure(nowMs);
}

/** Pure ticket validity check (no dataset fetch). */
export function validTicket(ticket: string | undefined, nowMs: number): boolean {
  if (!ticket) return false;
  const expiry = tickets.get(ticket);
  if (!expiry) return false;
  if (nowMs >= expiry) { tickets.delete(ticket); return false; }
  return true;
}

export function revokeTicket(ticket: string | undefined): void {
  if (ticket) tickets.delete(ticket);
}

/** Test seam: reset all in-memory unlock state. */
export function __resetUnlockForTest(): void {
  datasetCache = null;
  attempts = 0;
  lockedUntilMs = 0;
  tickets.clear();
}
