import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';

describe('Security Config - dataDir', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should use ACTUAL_DATA_DIR if provided', async () => {
    const customDir = '/custom/data/dir';
    process.env.ACTUAL_DATA_DIR = customDir;

    const { dataDir } = await import('../src/config');
    expect(dataDir).toBe(customDir);
  });

  it('should create a unique temporary directory if ACTUAL_DATA_DIR is not provided', async () => {
    delete process.env.ACTUAL_DATA_DIR;

    const { dataDir } = await import('../src/config');

    expect(dataDir).toContain(os.tmpdir());
    expect(dataDir).toContain('actual-ai-');
    expect(fs.existsSync(dataDir)).toBe(true);

    // Cleanup
    if (fs.existsSync(dataDir)) {
      fs.rmdirSync(dataDir);
    }
  });

  it('should produce different directories for multiple instances (if re-imported)', async () => {
    delete process.env.ACTUAL_DATA_DIR;

    const { dataDir: dir1 } = await import('../src/config');

    jest.resetModules();
    const { dataDir: dir2 } = await import('../src/config');

    expect(dir1).not.toBe(dir2);

    // Cleanup
    if (fs.existsSync(dir1)) fs.rmdirSync(dir1);
    if (fs.existsSync(dir2)) fs.rmdirSync(dir2);
  });
});
