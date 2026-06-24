import {
  describe, it, expect, beforeEach, afterEach,
} from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  mergeEnv, flagsFromEnv, saveConfig, loadOverlay, loadSecrets, resolveEffective,
  __setSnapshotsForTest,
} from '../../src/web/config-store';

describe('config-store', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfgstore-'));
    process.env.CONFIG_DIR = dir;
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    delete process.env.CONFIG_DIR;
  });

  describe('mergeEnv precedence', () => {
    it('lets the overlay win for non-URL keys', () => {
      const merged = mergeEnv({ OPENAI_MODEL: 'env-model' }, { OPENAI_MODEL: 'overlay-model' }, {});
      expect(merged.OPENAI_MODEL).toBe('overlay-model');
    });

    it('lets OS-env win over overlay for pinnable URL keys (SSRF surface)', () => {
      const merged = mergeEnv(
        { ACTUAL_SERVER_URL: 'http://env-host:5006' },
        { ACTUAL_SERVER_URL: 'http://overlay-host:5006' },
        {},
      );
      expect(merged.ACTUAL_SERVER_URL).toBe('http://env-host:5006');
    });

    it('uses the overlay URL when no OS-env value is present', () => {
      const merged = mergeEnv({}, { ACTUAL_SERVER_URL: 'http://overlay-host:5006' }, {});
      expect(merged.ACTUAL_SERVER_URL).toBe('http://overlay-host:5006');
    });
  });

  describe('flagsFromEnv', () => {
    it('parses a FEATURES JSON array', () => {
      const flags = flagsFromEnv({ FEATURES: '["dryRun","webSearch"]' });
      expect(flags.has('dryRun')).toBe(true);
      expect(flags.has('webSearch')).toBe(true);
      expect(flags.has('freeWebSearch')).toBe(false);
    });

    it('honors dedicated env toggles', () => {
      const flags = flagsFromEnv({ CLASSIFY_ON_STARTUP: 'true' });
      expect(flags.has('classifyOnStartup')).toBe(true);
    });
  });

  describe('saveConfig', () => {
    beforeEach(() => { __setSnapshotsForTest({}, {}, {}); });

    it('persists non-secret values and reports needsRestart', () => {
      const r = saveConfig({ values: { openaiModel: 'gpt-4.1' } });
      expect(r.ok).toBe(true);
      expect(r.needsRestart).toBe(true);
      expect(loadOverlay().OPENAI_MODEL).toBe('gpt-4.1');
    });

    it('collapses feature-flag booleans into a single FEATURES array', () => {
      const r = saveConfig({ values: { dryRun: 'false', suggestNewCategories: 'true' } });
      expect(r.ok).toBe(true);
      const features = JSON.parse(loadOverlay().FEATURES) as string[];
      expect(features).toContain('suggestNewCategories');
      expect(features).not.toContain('dryRun');
    });

    it('handles secret replace then clear, writing 0600 secrets file', () => {
      saveConfig({ secrets: { openaiApiKey: { action: 'replace', value: 'sk-test' } } });
      expect(loadSecrets().OPENAI_API_KEY).toBe('sk-test');
      const mode = fs.statSync(path.join(dir, 'secrets', 'secrets.json')).mode & 0o777;
      expect(mode).toBe(0o600);

      saveConfig({ secrets: { openaiApiKey: { action: 'clear' } } });
      expect(loadSecrets().OPENAI_API_KEY).toBeUndefined();
    });

    it('rejects an unknown field', () => {
      const r = saveConfig({ values: { nope: 'x' } });
      expect(r.ok).toBe(false);
      expect(r.error).toBe('validation_failed');
    });

    it('rejects an invalid cron schedule', () => {
      const r = saveConfig({ values: { cronSchedule: '* * * * *' } });
      expect(r.ok).toBe(false);
      expect(r.key).toBe('cronSchedule');
    });
  });

  describe('resolveEffective', () => {
    it('never returns secret values, only set flags, and flags pinned env keys', () => {
      __setSnapshotsForTest({ ACTUAL_SERVER_URL: 'http://env:5006' }, {}, { OPENAI_API_KEY: 'sk-secret' });
      const eff = resolveEffective();
      expect(JSON.stringify(eff)).not.toContain('sk-secret');
      expect(eff.running.secrets.openaiApiKey.set).toBe(true);
      expect(eff.pinnedByEnv).toContain('ACTUAL_SERVER_URL');
    });
  });
});
