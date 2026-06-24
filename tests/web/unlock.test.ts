import {
  describe, it, expect, beforeEach,
} from '@jest/globals';

// Force the recommended challenge on (recent transaction payee+amount) before import.
process.env.WEB_UI_UNLOCK_CHALLENGE = 'transaction';

// eslint-disable-next-line import/first
import {
  unlockEnabled, challengePrompt, verifyAnswer, validTicket, unlockStatus, revokeTicket,
  __resetUnlockForTest,
} from '../../src/web/unlock';

const NOW = 1_000_000;
// Matches mock transaction t1: payee "Whole Foods Market", amount -5421 cents.
const GOOD = { payee: 'Whole Foods Market', amount: '54.21' };

describe('unlock (transaction payee+amount, alternative to token)', () => {
  beforeEach(() => { __resetUnlockForTest(); });

  it('is enabled and prompts for payee + amount', () => {
    expect(unlockEnabled()).toBe(true);
    expect(challengePrompt()).toMatch(/payee/i);
    expect(challengePrompt()).toMatch(/amount/i);
  });

  it('accepts a matching recent transaction (case/sign/format-insensitive) and issues a ticket', async () => {
    const r = await verifyAnswer({ payee: '  whole FOODS market ', amount: '$54.21' }, true, NOW);
    expect(r.ok).toBe(true);
    expect(typeof r.ticket).toBe('string');
    expect(validTicket(r.ticket, NOW)).toBe(true);
    expect(validTicket('bogus', NOW)).toBe(false);
  });

  it('treats a negative amount the same (sign-agnostic)', async () => {
    const r = await verifyAnswer({ payee: 'Whole Foods Market', amount: '-54.21' }, true, NOW);
    expect(r.ok).toBe(true);
  });

  it('rejects a wrong amount and tracks remaining attempts', async () => {
    const r = await verifyAnswer({ payee: 'Whole Foods Market', amount: '99.99' }, true, NOW);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('no_match');
    expect(r.attemptsRemaining).toBe(4);
  });

  it('flags malformed input (missing amount) as bad_input without burning an attempt', async () => {
    const r = await verifyAnswer({ payee: 'Whole Foods Market' }, true, NOW);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('bad_input');
  });

  it('locks out after 5 wrong attempts', async () => {
    let last;
    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      last = await verifyAnswer({ payee: 'Nope', amount: '1.00' }, true, NOW);
    }
    expect(last?.error).toBe('locked');
    const after = await verifyAnswer(GOOD, true, NOW + 1000);
    expect(after.ok).toBe(false);
    expect(after.error).toBe('locked');
  });

  it('a revoked ticket no longer validates', async () => {
    const r = await verifyAnswer(GOOD, true, NOW);
    revokeTicket(r.ticket);
    expect(validTicket(r.ticket, NOW)).toBe(false);
  });

  it('status reports the kind without leaking any answers', async () => {
    const s = await unlockStatus(true, NOW);
    expect(s.enabled).toBe(true);
    expect(s.kind).toBe('transaction');
    expect(JSON.stringify(s).toLowerCase()).not.toContain('whole foods');
  });
});
