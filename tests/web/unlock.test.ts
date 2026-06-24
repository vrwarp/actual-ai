import {
  describe, it, expect, beforeEach,
} from '@jest/globals';

// Force the recommended challenge on (two recent transactions) before import.
process.env.WEB_UI_UNLOCK_CHALLENGE = 'transaction';

// eslint-disable-next-line import/first
import {
  unlockEnabled, challengePrompt, verifyAnswer, validTicket, unlockStatus, revokeTicket,
  __resetUnlockForTest,
} from '../../src/web/unlock';

const NOW = 1_000_000;
// Two distinct mock transactions: t1 Whole Foods Market -5421, t2 Starbucks -612.
const T1 = { payee: 'Whole Foods Market', amount: '54.21' };
const T2 = { payee: 'Starbucks', amount: '6.12' };

describe('unlock (two recent transactions, alternative to token)', () => {
  beforeEach(() => { __resetUnlockForTest(); });

  it('is enabled and prompts for two transactions', () => {
    expect(unlockEnabled()).toBe(true);
    expect(challengePrompt()).toMatch(/2 different recent transactions/i);
  });

  it('accepts two distinct matching transactions and issues a ticket', async () => {
    const r = await verifyAnswer({ transactions: [{ payee: '  whole FOODS market ', amount: '$54.21' }, T2] }, true, NOW);
    expect(r.ok).toBe(true);
    expect(validTicket(r.ticket, NOW)).toBe(true);
  });

  it('rejects when only one pair is provided (bad_input, no attempt burned)', async () => {
    const r = await verifyAnswer({ transactions: [T1] }, true, NOW);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('bad_input');
  });

  it('rejects two copies of the same transaction (duplicate)', async () => {
    const r = await verifyAnswer({ transactions: [T1, { ...T1 }] }, true, NOW);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('duplicate');
  });

  it('rejects when one of the two pairs is wrong (no_match)', async () => {
    const r = await verifyAnswer({ transactions: [T1, { payee: 'Starbucks', amount: '99.99' }] }, true, NOW);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('no_match');
    expect(r.attemptsRemaining).toBe(4);
  });

  it('locks out after 5 wrong attempts', async () => {
    let last;
    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      last = await verifyAnswer({ transactions: [T1, { payee: 'Nope', amount: '1.00' }] }, true, NOW);
    }
    expect(last?.error).toBe('locked');
  });

  it('a revoked ticket no longer validates', async () => {
    const r = await verifyAnswer({ transactions: [T1, T2] }, true, NOW);
    revokeTicket(r.ticket);
    expect(validTicket(r.ticket, NOW)).toBe(false);
  });

  it('status reports the kind without leaking any answers', async () => {
    const s = await unlockStatus(true, NOW);
    expect(s.kind).toBe('transaction');
    expect(JSON.stringify(s).toLowerCase()).not.toContain('whole foods');
    expect(JSON.stringify(s).toLowerCase()).not.toContain('starbucks');
  });
});
