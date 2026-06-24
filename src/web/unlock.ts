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
 * When enabled, the operator must enter a value that matches their real budget
 * data (account / payee / category name pulled read-only from Actual) before the
 * Web UI session is unlocked — a second factor layered on the bearer token that
 * proves the user actually has access to the underlying budget.
 *
 * Safety properties:
 *  - The valid answers are NEVER sent to the client; only membership is checked
 *    server-side, normalized (trim / lowercase / collapse whitespace).
 *  - Brute force is bounded by a lockout (N attempts per window).
 *  - Unlock grants a short-lived in-memory ticket; nothing is persisted.
 *  - FAIL-OPEN: if the dataset can't be fetched (Actual down/misconfigured), the
 *    challenge is bypassed so the operator can still reach the editor to FIX the
 *    config. The bypass is surfaced in the status so it's never silent.
 */

const LOCKOUT_MAX = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const TICKET_TTL_MS = 12 * 60 * 60 * 1000;
const DATASET_TTL_MS = 5 * 60 * 1000;

type ChallengeKind = 'account' | 'payee' | 'category';

const PROMPTS: Record<ChallengeKind, string> = {
  account: 'Enter the name of one of your Actual accounts (exactly as it appears in your budget).',
  payee: 'Enter the name of one of the payees in your budget.',
  category: 'Enter the name of one of your budget categories.',
};

interface DatasetCache {
  fetchedAtMs: number;
  values: Set<string>; // normalized
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

async function fetchNames(mock: boolean): Promise<Set<string> | null> {
  const kind = challengeKind();
  if (!kind) return null;

  const collect = async (svc: ActualApiServiceI): Promise<string[]> => {
    if (kind === 'account') return (await svc.getAccounts()).map((a) => a.name);
    if (kind === 'payee') return (await svc.getPayees()).map((p) => p.name);
    // category: flatten groups + standalone categories, keep entries that have a name
    const cats = await svc.getCategories();
    return cats.map((c) => (c as { name?: string }).name).filter((n): n is string => !!n);
  };

  if (mock) {
    const names = await collect(new MockActualApiService());
    return new Set(names.map(normalize).filter(Boolean));
  }

  const cfg = resolveConfig(pendingEnvMap());
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'actual-ai-unlock-'));
  try { fs.chmodSync(scratch, 0o700); } catch { /* best-effort */ }
  const svc = new ActualApiService(actualApiClient, fs, scratch, cfg.serverURL, cfg.password, cfg.budgetId, cfg.e2ePassword, true);
  try {
    await svc.initializeApi();
    const names = await collect(svc);
    await svc.shutdownApi();
    return new Set(names.map(normalize).filter(Boolean));
  } catch {
    return null; // unreachable → caller treats as bypass
  } finally {
    try { fs.rmSync(scratch, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
}

async function ensureDataset(mock: boolean, nowMs: number): Promise<Set<string> | null> {
  if (datasetCache && nowMs - datasetCache.fetchedAtMs < DATASET_TTL_MS) {
    return datasetCache.values;
  }
  const values = await fetchNames(mock);
  if (values === null) return null;
  datasetCache = { fetchedAtMs: nowMs, values };
  return values;
}

export interface UnlockStatus {
  enabled: boolean;
  kind: ChallengeKind | null;
  prompt: string;
  locked: boolean;
  lockedUntilMs: number;
  attemptsRemaining: number;
  bypass: boolean; // dataset unreachable → challenge skipped
}

/** Status for the unlock gate (does not leak any answers). */
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
  const dataset = await ensureDataset(mock, nowMs);
  base.bypass = dataset === null;
  return base;
}

export interface VerifyResult {
  ok: boolean;
  ticket?: string;
  error?: 'locked' | 'no_match' | 'unavailable' | 'disabled';
  attemptsRemaining?: number;
  lockedUntilMs?: number;
  bypass?: boolean;
}

function issueTicket(nowMs: number): string {
  const ticket = crypto.randomBytes(32).toString('hex');
  tickets.set(ticket, nowMs + TICKET_TTL_MS);
  return ticket;
}

/** Verify a submitted answer against the budget dataset. */
export async function verifyAnswer(answer: string, mock: boolean, nowMs: number): Promise<VerifyResult> {
  if (!unlockEnabled()) return { ok: false, error: 'disabled' };
  if (nowMs < lockedUntilMs) {
    return { ok: false, error: 'locked', lockedUntilMs };
  }
  const dataset = await ensureDataset(mock, nowMs);
  if (dataset === null) {
    // Fail-open: can't verify, so grant a ticket but mark bypass so the UI warns.
    return { ok: true, ticket: issueTicket(nowMs), bypass: true };
  }
  if (dataset.has(normalize(answer))) {
    attempts = 0;
    return { ok: true, ticket: issueTicket(nowMs) };
  }
  attempts += 1;
  if (attempts >= LOCKOUT_MAX) {
    lockedUntilMs = nowMs + LOCKOUT_WINDOW_MS;
    attempts = 0;
    return { ok: false, error: 'locked', lockedUntilMs };
  }
  return { ok: false, error: 'no_match', attemptsRemaining: LOCKOUT_MAX - attempts };
}

/**
 * Whether a request is allowed past the unlock gate.
 * - challenge disabled → always allowed
 * - dataset unreachable (bypass) → allowed (fail-open)
 * - otherwise → requires a valid, unexpired ticket
 */
export async function isUnlocked(ticket: string | undefined, mock: boolean, nowMs: number): Promise<boolean> {
  if (!unlockEnabled()) return true;
  const dataset = await ensureDataset(mock, nowMs);
  if (dataset === null) return true; // fail-open
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
