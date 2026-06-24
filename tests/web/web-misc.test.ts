import { describe, it, expect } from '@jest/globals';
import { validateField, isSubMinuteCron } from '../../src/web/validate';
import { fieldByKey } from '../../src/web/config-schema';
import { nextRuns, cronInfo } from '../../src/web/cron-next';
import { RecordingActualApiService } from '../../src/web/readonly-actual-api';
import { MockActualApiService } from '../../src/web/mocks/mock-actual-api';
import { MockLlmService } from '../../src/web/mocks/mock-llm';
import { dryRunPreview } from '../../src/web/preview-runner';
import { checkToken, __setTokenForTest } from '../../src/web/auth';

describe('validate', () => {
  it('rejects sub-minute and 6-field cron', () => {
    expect(isSubMinuteCron('* * * * *')).toBe(true);
    expect(isSubMinuteCron('* * * * * *')).toBe(true);
    expect(isSubMinuteCron('0 */4 * * *')).toBe(false);
  });

  it('validates tags and urls via the schema field defs', () => {
    expect(validateField(fieldByKey('guessedTag')!, 'nohash')).toMatch(/#/);
    expect(validateField(fieldByKey('guessedTag')!, '#ok')).toBeNull();
    expect(validateField(fieldByKey('serverURL')!, 'not-a-url')).toMatch(/URL/);
    expect(validateField(fieldByKey('serverURL')!, 'http://x:5006')).toBeNull();
  });
});

describe('cron-next', () => {
  it('computes upcoming runs for an every-4-hours schedule', () => {
    const from = new Date('2026-06-24T10:05:00Z');
    const runs = nextRuns('0 */4 * * *', from, 3);
    expect(runs).not.toBeNull();
    expect(runs!.length).toBe(3);
    // each run minute is 0
    runs!.forEach((r) => expect(new Date(r).getUTCMinutes()).toBe(0));
  });

  it('marks sub-minute schedules as blocked', () => {
    expect(cronInfo('* * * * *', new Date('2026-06-24T10:00:00Z')).blocked).toBe(true);
  });
});

describe('RecordingActualApiService', () => {
  it('captures writes without forwarding them', async () => {
    const rec = new RecordingActualApiService(new MockActualApiService());
    await rec.updateTransactionNotesAndCategory('t1', '#actual-ai', 'cat-groceries');
    await rec.createCategoryGroup('NewGroup');
    expect(rec.writes).toHaveLength(2);
    expect(rec.writes[0]).toMatchObject({ kind: 'updateNotesAndCategory', categoryId: 'cat-groceries' });
  });
});

describe('MockLlmService', () => {
  it('maps known merchants deterministically', async () => {
    const agent = new MockLlmService();
    expect((await agent.ask('payee: Whole Foods Market')).categoryId).toBe('cat-groceries');
    expect((await agent.ask('payee: Shell Gas')).categoryId).toBe('cat-fuel');
    expect((await agent.ask('payee: Pawsome Grooming')).type).toBe('new');
  });
});

describe('dryRunPreview (mock data + mock agent)', () => {
  it('produces a distribution and sample without touching a real service', async () => {
    const result = await dryRunPreview('2026-06-24T00:00:00.000Z');
    expect(result.mock).toBe(true);
    expect(result.considered).toBeGreaterThan(0);
    expect(result.wouldCategorize).toBeGreaterThan(0);
    expect(result.distribution.length).toBeGreaterThan(0);
    expect(result.sample.length).toBe(result.considered);
    // new-category suggestions are sorted to the top
    if (result.sample.some((s) => s.isNew)) expect(result.sample[0].isNew).toBe(true);
  });
});

describe('auth', () => {
  it('compares tokens in constant time and rejects mismatches', () => {
    __setTokenForTest('abc123');
    expect(checkToken('abc123')).toBe(true);
    expect(checkToken('wrong')).toBe(false);
    expect(checkToken(undefined)).toBe(false);
    __setTokenForTest(null);
  });
});
