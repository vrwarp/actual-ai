import {
  describe, it, expect, beforeEach,
} from '@jest/globals';

// Force the challenge on (account names) before importing the module under test.
process.env.WEB_UI_UNLOCK_CHALLENGE = 'account';

// eslint-disable-next-line import/first
import {
  unlockEnabled, challengePrompt, verifyAnswer, isUnlocked, unlockStatus, revokeTicket,
  __resetUnlockForTest,
} from '../../src/web/unlock';

const NOW = 1_000_000;

describe('unlock (knowledge challenge)', () => {
  beforeEach(() => { __resetUnlockForTest(); });

  it('is enabled and exposes a prompt', () => {
    expect(unlockEnabled()).toBe(true);
    expect(challengePrompt()).toMatch(/account/i);
  });

  it('rejects a wrong answer and tracks remaining attempts', async () => {
    const r = await verifyAnswer('definitely not an account', true, NOW);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('no_match');
    expect(r.attemptsRemaining).toBe(4);
  });

  it('accepts a matching mock account name (case/space-insensitive) and issues a ticket', async () => {
    const r = await verifyAnswer('  CHECKING ', true, NOW);
    expect(r.ok).toBe(true);
    expect(typeof r.ticket).toBe('string');
    expect(await isUnlocked(r.ticket, true, NOW)).toBe(true);
    expect(await isUnlocked('bogus-ticket', true, NOW)).toBe(false);
  });

  it('locks out after 5 wrong attempts', async () => {
    let last;
    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      last = await verifyAnswer('wrong', true, NOW);
    }
    expect(last?.error).toBe('locked');
    const after = await verifyAnswer('Checking', true, NOW + 1000);
    expect(after.ok).toBe(false);
    expect(after.error).toBe('locked');
  });

  it('a revoked ticket no longer unlocks', async () => {
    const r = await verifyAnswer('Checking', true, NOW);
    revokeTicket(r.ticket);
    expect(await isUnlocked(r.ticket, true, NOW)).toBe(false);
  });

  it('status reports enabled + kind without leaking answers', async () => {
    const s = await unlockStatus(true, NOW);
    expect(s.enabled).toBe(true);
    expect(s.kind).toBe('account');
    expect(JSON.stringify(s)).not.toMatch(/checking/i);
  });
});
